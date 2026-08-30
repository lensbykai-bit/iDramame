const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const khqrSdk = require('bakong-khqr');
const { BakongKHQR, khqrData } = khqrSdk;
const OriginalIndividualInfo = khqrSdk.IndividualInfo;

// Compatibility guard for older project code that called IndividualInfo with
// (accountId, currency, merchantName, merchantCity, optionalData).
// The current Bakong JS SDK expects:
// (accountId, merchantName, merchantCity, optionalData).
function CompatibleIndividualInfo(accountId, arg2, arg3, arg4, arg5) {
  if (arguments.length >= 5) {
    const optionalData = { ...(arg5 || {}) };
    if (optionalData.currency == null && arg2 != null) optionalData.currency = arg2;
    return new OriginalIndividualInfo(accountId, arg3, arg4, optionalData);
  }
  return new OriginalIndividualInfo(accountId, arg2, arg3, arg4 || {});
}
CompatibleIndividualInfo.prototype = OriginalIndividualInfo.prototype;
khqrSdk.IndividualInfo = CompatibleIndividualInfo;

const originalListen = express.application.listen;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function receiverConfig() {
  const accountId = String(process.env.BAKONG_ACCOUNT_ID || '').trim();
  if (!accountId) throw new Error('BAKONG_ACCOUNT_ID is not configured.');

  const testMode = /^true$/i.test(String(process.env.BAKONG_TEST_MODE || 'false').trim());
  if (testMode) throw new Error('BAKONG_TEST_MODE must be false for real KHQR.');

  return {
    accountId,
    merchantName: String(process.env.BAKONG_MERCHANT_NAME || 'iDrama.ai').trim() || 'iDrama.ai',
    merchantCity: String(process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH').trim() || 'PHNOM PENH',
    storeLabel: String(process.env.BAKONG_STORE_LABEL || 'iDrama.ai').trim() || 'iDrama.ai',
    mobileNumber: String(process.env.BAKONG_MOBILE_NUMBER || '').trim()
  };
}

function generateIndividualKhqr(optionalData) {
  const cfg = receiverConfig();
  if (cfg.mobileNumber) optionalData.mobileNumber = cfg.mobileNumber;

  const info = new OriginalIndividualInfo(cfg.accountId, cfg.merchantName, cfg.merchantCity, optionalData);
  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(info);
  if (!response || response.status?.code !== 0 || !response.data?.qr || !response.data?.md5) {
    throw new Error(response?.status?.message || 'KHQR generation failed.');
  }

  return { ...cfg, qr: response.data.qr, md5: response.data.md5 };
}

function makeRealKhqr(amount) {
  const cfg = receiverConfig();
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const billNumber = `IDR-${Date.now().toString(36).toUpperCase()}`.slice(0, 25);
  const data = generateIndividualKhqr({
    currency: khqrData.currency.khr,
    amount: Number(amount),
    billNumber,
    storeLabel: cfg.storeLabel,
    terminalLabel: 'ADMIN',
    expirationTimestamp,
    merchantCategoryCode: '5999'
  });
  return { ...data, expiresAt: expirationTimestamp, billNumber };
}

function makeDirectReceiveKhqr() {
  const cfg = receiverConfig();
  // Permanent KHQR for direct customer payments: no fixed amount and no expiry.
  // The customer enters the KHR amount in their Bakong/bank app after scanning.
  return generateIndividualKhqr({
    currency: khqrData.currency.khr,
    storeLabel: cfg.storeLabel,
    terminalLabel: 'DIRECT',
    merchantCategoryCode: '5999'
  });
}

async function toQrDataUrl(qr) {
  return QRCode.toDataURL(qr, { width: 720, margin: 2, errorCorrectionLevel: 'M' });
}

express.application.listen = function patchedListen(...args) {
  if (!this.locals.__realKhqrAdminRoute) {
    this.locals.__realKhqrAdminRoute = true;

    this.post('/api/admin/khqr/generate', async (req, res) => {
      const adminPassword = String(process.env.ADMIN_PASSWORD || '');
      if (!adminPassword) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
      if (!safeEqual(req.get('x-admin-password'), adminPassword)) return res.status(401).json({ error: 'Password is incorrect.' });

      const amount = Number(req.body?.amount);
      if (!Number.isInteger(amount) || amount < 100 || amount > 100000000) {
        return res.status(400).json({ error: 'ចំនួនទឹកប្រាក់ត្រូវចាប់ពី 100៛ ដល់ 100,000,000៛។' });
      }

      try {
        const data = makeRealKhqr(amount);
        const qrDataUrl = await toQrDataUrl(data.qr);
        res.set('Cache-Control', 'no-store');
        return res.json({
          ok: true,
          real: true,
          directReceive: false,
          currency: 'KHR',
          amount,
          merchantName: data.merchantName,
          billNumber: data.billNumber,
          md5: data.md5,
          expiresAt: data.expiresAt,
          qrDataUrl
        });
      } catch (error) {
        console.error('[admin-real-khqr]', error.message);
        return res.status(500).json({ error: error.message || 'មិនអាចបង្កើត KHQR ពិតបាន។' });
      }
    });

    this.post('/api/admin/khqr/direct', async (req, res) => {
      const adminPassword = String(process.env.ADMIN_PASSWORD || '');
      if (!adminPassword) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
      if (!safeEqual(req.get('x-admin-password'), adminPassword)) return res.status(401).json({ error: 'Password is incorrect.' });

      try {
        const data = makeDirectReceiveKhqr();
        const qrDataUrl = await toQrDataUrl(data.qr);
        res.set('Cache-Control', 'no-store');
        return res.json({
          ok: true,
          real: true,
          directReceive: true,
          currency: 'KHR',
          merchantName: data.merchantName,
          md5: data.md5,
          expiresAt: null,
          qrDataUrl
        });
      } catch (error) {
        console.error('[admin-direct-khqr]', error.message);
        return res.status(500).json({ error: error.message || 'មិនអាចបង្កើត KHQR ទទួលប្រាក់ផ្ទាល់បាន។' });
      }
    });
  }

  return originalListen.apply(this, args);
};
