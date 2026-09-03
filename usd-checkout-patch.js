'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const khqrSdk = require('bakong-khqr');
const { BakongKHQR, khqrData, IndividualInfo } = khqrSdk;

const originalListen = express.application.listen;
const STORIES_PATH = path.join(__dirname, 'stories.json');
const BAKONG_ACCOUNT_ID = String(process.env.BAKONG_ACCOUNT_ID || '').trim();
const BAKONG_MERCHANT_NAME = String(process.env.BAKONG_MERCHANT_NAME || 'iDrama.ai').trim() || 'iDrama.ai';
const BAKONG_MERCHANT_CITY = String(process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH').trim() || 'PHNOM PENH';
const BAKONG_STORE_LABEL = String(process.env.BAKONG_STORE_LABEL || 'iDrama.ai').trim() || 'iDrama.ai';
const BAKONG_MOBILE_NUMBER = String(process.env.BAKONG_MOBILE_NUMBER || '').trim();
const BAKONG_API_BASE_URL = String(process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
const BAKONG_TOKEN = String(process.env.BAKONG_TOKEN || '');
const BOT_TOKEN = String(process.env.BOT_TOKEN || '');
const BAKONG_TEST_MODE = /^true$/i.test(String(process.env.BAKONG_TEST_MODE || 'false').trim());
const derivedAccessSecret = (BAKONG_TOKEN || BOT_TOKEN)
  ? crypto.createHash('sha256').update(`idramaai|${BAKONG_TOKEN}|${BOT_TOKEN}`).digest('hex')
  : '';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || derivedAccessSecret;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function b64url(value) { return Buffer.from(value).toString('base64url'); }
function signToken(payload) {
  if (!ACCESS_TOKEN_SECRET) throw new Error('ACCESS_TOKEN_SECRET is not configured.');
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig || !ACCESS_TOKEN_SECRET) return null;
    const expected = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch { return null; }
}
function createCheckoutProof({ storyId, md5, amount }) {
  return signToken({ kind: 'checkout-usd', storyId, md5, amount: Number(amount), currency: 'USD', exp: Date.now() + 3650 * 24 * 60 * 60 * 1000 });
}
function createWatchToken({ storyId, orderId }) {
  return signToken({ kind: 'watch', storyId, orderId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
}
function loadStory(storyId) {
  try {
    const rows = JSON.parse(fs.readFileSync(STORIES_PATH, 'utf8'));
    return Array.isArray(rows) ? rows.find(row => String(row.id) === String(storyId)) : null;
  } catch { return null; }
}
function contentReady(story) {
  if (!story) return false;
  const episodes = Array.isArray(story.episodes) ? story.episodes : [];
  if (String(story.content_type || '').toLowerCase() === 'series') return episodes.some(ep => ep?.file_id || ep?.url || ep?.video_file_id || ep?.video_url);
  return Boolean(story.full_video_file_id || story.full_video_url);
}
function priceUsd(story) {
  const raw = Number(story?.price_usd ?? story?.price_khr ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw * 100) / 100;
}
function generateUsdKhqr(amount, storyId) {
  if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) throw new Error('Bakong USD payment is not configured.');
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const optionalData = {
    currency: khqrData.currency.usd,
    amount: Number(amount),
    billNumber: `IDR-${String(storyId)}-${Date.now().toString(36)}`.toUpperCase().slice(0, 25),
    storeLabel: BAKONG_STORE_LABEL,
    terminalLabel: 'WEB USD',
    expirationTimestamp,
    merchantCategoryCode: '5999'
  };
  if (BAKONG_MOBILE_NUMBER) optionalData.mobileNumber = BAKONG_MOBILE_NUMBER;
  const info = new IndividualInfo(BAKONG_ACCOUNT_ID, BAKONG_MERCHANT_NAME, BAKONG_MERCHANT_CITY, optionalData);
  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(info);
  if (!response || response.status?.code !== 0 || !response.data?.qr || !response.data?.md5) {
    throw new Error(response?.status?.message || 'USD KHQR generation failed.');
  }
  return { ...response.data, expiresAt: expirationTimestamp };
}
async function checkPayment(md5) {
  const response = await fetch(`${BAKONG_API_BASE_URL}/v1/check_transaction_by_md5`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${BAKONG_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ md5 })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Bakong API ${response.status}: ${body.responseMessage || 'request failed'}`);
  return body;
}
function paymentMatchesUsd(payment, amount) {
  if (!payment || payment.responseCode !== 0 || !payment.data) return false;
  const currency = String(payment.data.currency || '').toUpperCase();
  const currencyMatches = currency === 'USD' || currency === '840';
  const amountMatches = Math.abs(Number(payment.data.amount) - Number(amount)) < 0.005;
  const accountMatches = String(payment.data.toAccountId || '').toLowerCase() === BAKONG_ACCOUNT_ID.toLowerCase();
  return currencyMatches && amountMatches && accountMatches;
}

express.application.listen = function usdPatchedListen(...args) {
  if (!this.locals.__idramaUsdCheckoutRoutes) {
    this.locals.__idramaUsdCheckoutRoutes = true;

    this.post('/api/usd-checkout/khqr', async (req, res) => {
      const storyId = String(req.body?.storyId || '').trim();
      const story = loadStory(storyId);
      if (!story) return res.status(404).json({ error: 'Story not found.' });
      if (!contentReady(story)) return res.status(409).json({ error: 'រឿងនេះមិនទាន់មានវីដេអូសម្រាប់ទិញទេ។' });
      const amount = priceUsd(story);
      if (!(amount > 0)) return res.status(400).json({ error: 'តម្លៃ USD មិនត្រឹមត្រូវ។' });
      try {
        if (BAKONG_TEST_MODE) {
          const md5 = `TEST-USD-${crypto.randomBytes(12).toString('hex')}`;
          const expiresAt = Date.now() + 10 * 60 * 1000;
          return res.json({ storyId, title: story.title, amount, currency: 'USD', md5, expiresAt, testMode: true, qrDataUrl: null, checkoutProof: createCheckoutProof({ storyId, md5, amount }) });
        }
        const khqr = generateUsdKhqr(amount, storyId);
        const qrDataUrl = await QRCode.toDataURL(khqr.qr, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
        return res.json({ storyId, title: story.title, amount, currency: 'USD', md5: khqr.md5, expiresAt: khqr.expiresAt, testMode: false, qrDataUrl, checkoutProof: createCheckoutProof({ storyId, md5: khqr.md5, amount }) });
      } catch (error) {
        console.error('[usd-checkout-khqr]', error.message);
        return res.status(500).json({ error: error.message || 'មិនអាចបង្កើត Bakong KHQR ជា USD បាន។' });
      }
    });

    this.post('/api/usd-checkout/verify', async (req, res) => {
      const storyId = String(req.body?.storyId || '').trim();
      const md5 = String(req.body?.md5 || '').trim();
      const proof = verifyToken(String(req.body?.checkoutProof || ''));
      if (!storyId || !md5 || !proof || proof.kind !== 'checkout-usd' || proof.storyId !== storyId || proof.md5 !== md5 || proof.currency !== 'USD') {
        return res.status(401).json({ error: 'USD checkout proof មិនត្រឹមត្រូវ ឬផុតកំណត់។' });
      }
      const amount = Number(proof.amount);
      const orderId = `DB-${md5.slice(0, 12)}`;
      try {
        if (BAKONG_TEST_MODE && md5.startsWith('TEST-USD-')) {
          return res.json({ paid: true, testMode: true, transactionHash: md5, currency: 'USD', amount, watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId, orderId }))}` });
        }
        if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) return res.status(503).json({ error: 'Bakong USD verification is not configured.' });
        const payment = await checkPayment(md5);
        if (!paymentMatchesUsd(payment, amount)) return res.json({ paid: false, testMode: false, currency: 'USD' });
        return res.json({ paid: true, testMode: false, transactionHash: payment.data.hash || '', currency: 'USD', amount, watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId, orderId }))}` });
      } catch (error) {
        console.error('[usd-checkout-verify]', error.message);
        return res.status(502).json({ error: 'មិនអាចពិនិត្យ Bakong USD បាននៅពេលនេះ។' });
      }
    });
  }
  return originalListen.apply(this, args);
};
