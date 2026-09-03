require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const BRAND_NAME = process.env.BRAND_NAME || 'iDrama.ai';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID || process.env.ADMIN_TELEGRAM_ID || '';

const BAKONG_ACCOUNT_ID = process.env.BAKONG_ACCOUNT_ID || '';
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || 'iDrama.ai';
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH';
const BAKONG_MOBILE_NUMBER = process.env.BAKONG_MOBILE_NUMBER || '';
const BAKONG_STORE_LABEL = process.env.BAKONG_STORE_LABEL || 'iDrama.ai';
const BAKONG_API_BASE_URL = (process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || '';
const BAKONG_TEST_MODE = /^true$/i.test(String(process.env.BAKONG_TEST_MODE || 'false').trim());

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || ((BAKONG_TOKEN || BOT_TOKEN)
  ? crypto.createHash('sha256').update(`idramaai|${BAKONG_TOKEN}|${BOT_TOKEN}`).digest('hex')
  : crypto.randomBytes(32).toString('hex'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'lensbykai-bit/iDramame';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const PORT = Number(process.env.PORT || 3000);

const storiesPath = path.join(__dirname, 'stories.json');
const storePath = path.join(__dirname, 'data', 'store.json');
const publicPath = path.join(__dirname, 'public');
const telegramApiBase = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 45 * 1024 * 1024 } });

if (!BAKONG_TEST_MODE && !BAKONG_ACCOUNT_ID) console.warn('[config] BAKONG_ACCOUNT_ID is missing.');
if (!BAKONG_TEST_MODE && !BAKONG_TOKEN) console.warn('[config] BAKONG_TOKEN is missing.');
if (!process.env.ACCESS_TOKEN_SECRET) console.warn('[config] ACCESS_TOKEN_SECRET is missing. Using a stable secret derived from configured server credentials.');
if (!ADMIN_PASSWORD) console.warn('[config] ADMIN_PASSWORD is missing. Web admin disabled.');
if (!GITHUB_TOKEN) console.warn('[config] GITHUB_TOKEN is missing. Story edits will not persist across redeploys.');
if (!BOT_TOKEN || !TELEGRAM_STORAGE_CHAT_ID) console.warn('[config] Private media storage is not fully configured.');

function cleanEpisodeId(value, index = 0) {
  const raw = String(value || '').trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return raw || `ep-${String(index + 1).padStart(2, '0')}`;
}
function normalizeEpisode(ep, index = 0) {
  const row = ep && typeof ep === 'object' ? ep : {};
  return {
    id: cleanEpisodeId(row.id, index),
    title: String(row.title || `ភាគ ${index + 1}`).trim().slice(0, 140) || `ភាគ ${index + 1}`,
    file_id: String(row.file_id || row.video_file_id || '').trim(),
    url: String(row.url || row.video_url || '').trim()
  };
}
function normalizeStory(story) {
  const rawEpisodes = Array.isArray(story?.episodes) ? story.episodes : [];
  const episodes = rawEpisodes.map(normalizeEpisode).filter(ep => ep.file_id || ep.url || ep.title);
  const requestedType = String(story?.content_type || '').toLowerCase();
  const contentType = requestedType === 'series' || episodes.length ? 'series' : 'movie';
  return {
    ...story,
    placement: 'web',
    telegram_url: '',
    content_type: contentType,
    episodes
  };
}
function loadStories() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.map(normalizeStory) : [];
  } catch { return []; }
}
function saveStoriesLocal(stories) {
  fs.writeFileSync(storiesPath, JSON.stringify(stories.map(normalizeStory), null, 2) + '\n');
}
function storyById(id) { return loadStories().find(story => String(story.id) === String(id)); }
function mediaPath(fileId) { return fileId ? `/api/media/${encodeURIComponent(fileId)}` : ''; }
function storyEpisodes(story) { return Array.isArray(story?.episodes) ? story.episodes.map(normalizeEpisode) : []; }
function contentReady(story) {
  if (!story) return false;
  if (story.content_type === 'series') return storyEpisodes(story).some(ep => ep.file_id || ep.url);
  return Boolean(story.full_video_file_id || story.full_video_url);
}
function publicStory(story) {
  const episodes = storyEpisodes(story);
  return {
    id: story.id,
    title: story.title,
    preview: story.preview || '',
    price_khr: Number(story.price_khr || 0),
    placement: 'web',
    content_type: story.content_type === 'series' ? 'series' : 'movie',
    episode_count: story.content_type === 'series' ? episodes.filter(ep => ep.file_id || ep.url).length : 0,
    episodes: story.content_type === 'series' ? episodes.map((ep, index) => ({ id: ep.id, title: ep.title || `ភាគ ${index + 1}` })) : [],
    cover_url: mediaPath(story.cover_file_id) || story.cover_url || '',
    preview_video_url: mediaPath(story.preview_video_file_id) || story.preview_video_url || ''
  };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return { orders: parsed.orders || {}, purchases: parsed.purchases || {} };
  } catch { return { orders: {}, purchases: {} }; }
}
function saveStore(store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}
function safeOrderId(storyId) {
  return `AI-${String(storyId).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function validHttpUrl(value) {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
function slugify(value) {
  const base = String(value || 'story').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 35);
  return `${base || 'story'}-${crypto.randomBytes(2).toString('hex')}`;
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
  if (!safeEqual(req.get('x-admin-password'), ADMIN_PASSWORD)) return res.status(401).json({ error: 'Password is incorrect.' });
  next();
}

async function persistStories(stories, message) {
  const normalized = stories.map(normalizeStory);
  saveStoriesLocal(normalized);
  if (!GITHUB_TOKEN) return { persistedToGitHub: false };
  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents/stories.json`;
  const headers = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'idramaai-web-admin' };
  const current = await fetch(`${api}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (!current.ok) throw new Error(`GitHub read failed (${current.status}).`);
  const currentBody = await current.json();
  const updated = await fetch(api, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(JSON.stringify(normalized, null, 2) + '\n').toString('base64'), sha: currentBody.sha, branch: GITHUB_BRANCH })
  });
  if (!updated.ok) {
    const err = await updated.json().catch(() => ({}));
    throw new Error(err.message || `GitHub update failed (${updated.status}).`);
  }
  return { persistedToGitHub: true };
}

async function telegramFileUrl(fileId) {
  if (!BOT_TOKEN) throw new Error('Private media storage is not configured.');
  const response = await fetch(`${telegramApiBase}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok || !body.result?.file_path) throw new Error(body.description || 'Media lookup failed.');
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${body.result.file_path}`;
}
async function sendPrivateMediaUpload(file, kind) {
  if (!BOT_TOKEN || !TELEGRAM_STORAGE_CHAT_ID) throw new Error('Media storage is not configured.');
  const isCover = kind === 'cover';
  const method = isCover ? 'sendPhoto' : 'sendVideo';
  const field = isCover ? 'photo' : 'video';
  const form = new FormData();
  form.append('chat_id', TELEGRAM_STORAGE_CHAT_ID);
  form.append('caption', `iDramaAi • private ${kind} storage`);
  if (!isCover) form.append('supports_streaming', 'true');
  form.append(field, new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname || `${kind}.bin`);
  let response = await fetch(`${telegramApiBase}/${method}`, { method: 'POST', body: form });
  let body = await response.json().catch(() => ({}));
  if ((!response.ok || !body.ok) && !isCover) {
    const fallback = new FormData();
    fallback.append('chat_id', TELEGRAM_STORAGE_CHAT_ID);
    fallback.append('caption', `iDramaAi • private ${kind} storage`);
    fallback.append('document', new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' }), file.originalname || `${kind}.bin`);
    response = await fetch(`${telegramApiBase}/sendDocument`, { method: 'POST', body: fallback });
    body = await response.json().catch(() => ({}));
  }
  if (!response.ok || !body.ok || !body.result) throw new Error(body.description || 'Media upload failed.');
  if (isCover) {
    const photos = body.result.photo || [];
    const selected = photos[photos.length - 1];
    if (!selected?.file_id) throw new Error('Media storage did not return a photo file ID.');
    return { fileId: selected.file_id, messageId: body.result.message_id };
  }
  const media = body.result.video || body.result.document;
  if (!media?.file_id) throw new Error('Media storage did not return a video file ID.');
  return { fileId: media.file_id, messageId: body.result.message_id };
}
async function proxyRemoteMedia(req, res, sourceUrl) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const upstream = await fetch(sourceUrl, { headers });
  if (!upstream.ok && upstream.status !== 206) return res.status(502).send('Media source unavailable');
  res.status(upstream.status);
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  if (upstream.body) Readable.fromWeb(upstream.body).pipe(res); else res.end();
}

function generateKHQR(order) {
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const optionalData = {
    currency: khqrData.currency.khr,
    amount: Number(order.amount),
    billNumber: order.id.slice(0, 25),
    storeLabel: BAKONG_STORE_LABEL,
    terminalLabel: 'WEB STORE',
    expirationTimestamp,
    merchantCategoryCode: '5999'
  };
  if (BAKONG_MOBILE_NUMBER) optionalData.mobileNumber = BAKONG_MOBILE_NUMBER;
  let info;
  try { info = new IndividualInfo(BAKONG_ACCOUNT_ID, khqrData.currency.khr, BAKONG_MERCHANT_NAME, BAKONG_MERCHANT_CITY, optionalData); }
  catch { info = new IndividualInfo(BAKONG_ACCOUNT_ID, BAKONG_MERCHANT_NAME, BAKONG_MERCHANT_CITY, optionalData); }
  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(info);
  if (!response || response.status?.code !== 0 || !response.data?.qr || !response.data?.md5) throw new Error(response?.status?.message || 'KHQR generation failed');
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
function verifyPaymentMatchesOrder(payment, order) {
  if (!payment || payment.responseCode !== 0 || !payment.data) return false;
  const currency = String(payment.data.currency || '').toUpperCase();
  const currencyMatches = currency === 'KHR' || currency === '116';
  return currencyMatches && Number(payment.data.amount) === Number(order.amount) && String(payment.data.toAccountId || '').toLowerCase() === BAKONG_ACCOUNT_ID.toLowerCase();
}
function b64url(value) { return Buffer.from(value).toString('base64url'); }
function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function createCheckoutProof({ storyId, md5, amount }) {
  return signToken({ kind: 'checkout', storyId, md5, amount: Number(amount), exp: Date.now() + 3650 * 24 * 60 * 60 * 1000 });
}
function checkoutProofPayload(token, storyId, md5) {
  const payload = verifyToken(token);
  if (!payload || payload.kind !== 'checkout' || payload.storyId !== storyId || payload.md5 !== md5) return null;
  if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) < 0) return null;
  return payload;
}
function createWatchToken({ storyId, orderId }) {
  return signToken({ kind: 'watch', storyId, orderId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 });
}
function validWatchPayload(payload) { return Boolean(payload && (payload.kind === 'watch' || (!payload.kind && payload.orderId))); }
function markOrderPaid(store, order, transactionHash, testMode = false) {
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  order.transactionHash = transactionHash || '';
  order.testMode = Boolean(testMode);
  store.orders[order.id] = order;
  store.purchases[order.id] = { storyId: order.storyId, title: order.title, amount: order.amount, paidAt: order.paidAt, testMode: Boolean(testMode) };
  saveStore(store);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.static(publicPath, { etag: true, maxAge: '1h' }));

app.get('/api/meta', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ brand: BRAND_NAME, mode: 'web-only', checkout: BAKONG_TEST_MODE || Boolean(BAKONG_ACCOUNT_ID && BAKONG_TOKEN), testMode: BAKONG_TEST_MODE, accountLibrary: true, mediaUploads: Boolean(BOT_TOKEN && TELEGRAM_STORAGE_CHAT_ID), series: true });
});
app.get('/api/stories', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ stories: loadStories().map(publicStory) }); });
app.get('/api/stories/:id', (req, res) => {
  const story = storyById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.set('Cache-Control', 'no-store');
  res.json({ story: publicStory(story) });
});
app.get('/api/media/:fileId', async (req, res) => {
  try { await proxyRemoteMedia(req, res, await telegramFileUrl(req.params.fileId)); }
  catch (error) { console.error('[media]', error.message); if (!res.headersSent) res.status(502).send('Media unavailable'); }
});

app.post('/api/checkout/khqr', async (req, res) => {
  if (!BAKONG_TEST_MODE && (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN)) return res.status(503).json({ error: 'Bakong payment is not configured yet.' });
  const story = storyById(String(req.body?.storyId || ''));
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  if (!contentReady(story)) return res.status(409).json({ error: story.content_type === 'series' ? 'រឿងភាគនេះមិនទាន់មាន Episode សម្រាប់ទិញទេ។' : 'រឿងនេះមិនទាន់មាន Full Movie សម្រាប់ទិញទេ។' });
  const amount = Number(story.price_khr || 0);
  const pseudoOrder = { id: safeOrderId(story.id), storyId: story.id, amount };
  try {
    if (BAKONG_TEST_MODE) {
      const md5 = `TEST-${crypto.randomBytes(16).toString('hex')}`;
      const expiresAt = Date.now() + 10 * 60 * 1000;
      return res.json({ storyId: story.id, title: story.title, amount, currency: 'KHR', md5, expiresAt, testMode: true, qrDataUrl: null, checkoutProof: createCheckoutProof({ storyId: story.id, md5, amount }) });
    }
    const khqr = generateKHQR(pseudoOrder);
    const qrDataUrl = await QRCode.toDataURL(khqr.qr, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
    return res.json({ storyId: story.id, title: story.title, amount, currency: 'KHR', md5: khqr.md5, expiresAt: khqr.expiresAt, testMode: false, qrDataUrl, checkoutProof: createCheckoutProof({ storyId: story.id, md5: khqr.md5, amount }) });
  } catch (error) {
    console.error('[checkout-khqr]', error.message);
    return res.status(500).json({ error: 'មិនអាចបង្កើត Bakong KHQR បាន។' });
  }
});
app.post('/api/checkout/verify', async (req, res) => {
  const storyId = String(req.body?.storyId || '');
  const md5 = String(req.body?.md5 || '');
  const checkoutProof = String(req.body?.checkoutProof || '');
  const story = storyById(storyId);
  if (!story || !md5 || !checkoutProof) return res.status(400).json({ error: 'Checkout data is invalid.' });
  const proof = checkoutProofPayload(checkoutProof, storyId, md5);
  if (!proof) return res.status(401).json({ error: 'Checkout proof is invalid or expired.' });
  const amount = Number(proof.amount);
  const order = { id: `DB-${md5.slice(0, 12)}`, storyId, amount };
  try {
    if (BAKONG_TEST_MODE && md5.startsWith('TEST-')) return res.json({ paid: true, testMode: true, transactionHash: md5, watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId, orderId: order.id }))}` });
    if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) return res.status(503).json({ error: 'Bakong payment verification is not configured.' });
    const payment = await checkPayment(md5);
    if (!verifyPaymentMatchesOrder(payment, order)) return res.json({ paid: false, testMode: false });
    return res.json({ paid: true, testMode: false, transactionHash: payment.data.hash || '', watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId, orderId: order.id }))}` });
  } catch (error) {
    console.error('[checkout-verify]', error.message);
    return res.status(502).json({ error: 'មិនអាចពិនិត្យ Bakong បាននៅពេលនេះ។' });
  }
});
app.post('/api/orders', async (req, res) => {
  const story = storyById(String(req.body?.storyId || ''));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (!contentReady(story)) return res.status(409).json({ error: story.content_type === 'series' ? 'រឿងភាគនេះមិនទាន់មាន Episode ទេ។' : 'រឿងនេះមិនទាន់មាន Full Movie ទេ។' });
  const order = { id: safeOrderId(story.id), storyId: story.id, title: story.title, amount: Number(story.price_khr), currency: 'KHR', status: 'pending', testMode: BAKONG_TEST_MODE, createdAt: new Date().toISOString() };
  try {
    const store = loadStore();
    if (BAKONG_TEST_MODE) {
      order.expiresAt = Date.now() + 10 * 60 * 1000;
      order.md5 = `TEST-${crypto.randomBytes(16).toString('hex')}`;
      store.orders[order.id] = order;
      saveStore(store);
      return res.json({ orderId: order.id, title: order.title, amount: order.amount, currency: 'KHR', expiresAt: order.expiresAt, testMode: true, qrDataUrl: null });
    }
    if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) return res.status(503).json({ error: 'Bakong payment is not configured yet.' });
    const khqr = generateKHQR(order);
    order.md5 = khqr.md5;
    order.expiresAt = khqr.expiresAt;
    store.orders[order.id] = order;
    saveStore(store);
    const qrDataUrl = await QRCode.toDataURL(khqr.qr, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
    return res.json({ orderId: order.id, title: order.title, amount: order.amount, currency: 'KHR', expiresAt: order.expiresAt, testMode: false, qrDataUrl });
  } catch (error) {
    console.error('[legacy-order]', error.message);
    return res.status(500).json({ error: 'មិនអាចបង្កើត Bakong KHQR បាន។' });
  }
});
app.post('/api/orders/:id/check', async (req, res) => {
  const store = loadStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.json({ paid: true, testMode: Boolean(order.testMode), watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId: order.storyId, orderId: order.id }))}` });
  if (order.testMode) {
    markOrderPaid(store, order, `TEST-${order.id}`, true);
    return res.json({ paid: true, testMode: true, watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId: order.storyId, orderId: order.id }))}` });
  }
  try {
    const payment = await checkPayment(order.md5);
    if (!verifyPaymentMatchesOrder(payment, order)) return res.json({ paid: false, testMode: false });
    markOrderPaid(store, order, payment.data.hash || '', false);
    return res.json({ paid: true, testMode: false, watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken({ storyId: order.storyId, orderId: order.id }))}` });
  } catch (error) {
    console.error('[legacy-payment-check]', error.message);
    return res.status(502).json({ error: 'មិនអាចពិនិត្យ Bakong បាននៅពេលនេះ។' });
  }
});

app.get('/api/access', (req, res) => {
  const payload = verifyToken(req.query.token);
  if (!validWatchPayload(payload)) return res.status(401).json({ error: 'Access link is invalid or expired.' });
  const story = storyById(payload.storyId);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  const episodes = story.content_type === 'series' ? storyEpisodes(story).filter(ep => ep.file_id || ep.url).map((ep, index) => ({ id: ep.id, title: ep.title || `ភាគ ${index + 1}` })) : [];
  res.set('Cache-Control', 'private, no-store');
  return res.json({
    story: { id: story.id, title: story.title, contentType: story.content_type, episodes },
    orderId: payload.orderId,
    videoUrl: story.content_type === 'series' && episodes[0] ? `/api/video/${encodeURIComponent(story.id)}?token=${encodeURIComponent(req.query.token)}&episode=${encodeURIComponent(episodes[0].id)}` : `/api/video/${encodeURIComponent(story.id)}?token=${encodeURIComponent(req.query.token)}`
  });
});
app.get('/api/video/:id', async (req, res) => {
  const payload = verifyToken(req.query.token);
  if (!validWatchPayload(payload) || String(payload.storyId) !== String(req.params.id)) return res.status(401).send('Unauthorized');
  const story = storyById(req.params.id);
  if (!story) return res.status(404).send('Video not configured');
  try {
    let fileId = '';
    let sourceUrl = '';
    if (story.content_type === 'series') {
      const episodes = storyEpisodes(story).filter(ep => ep.file_id || ep.url);
      const requested = String(req.query.episode || '');
      const episode = (requested && episodes.find(ep => ep.id === requested)) || episodes[0];
      if (!episode) return res.status(404).send('Episode not configured');
      fileId = episode.file_id || '';
      sourceUrl = episode.url || '';
    } else {
      fileId = story.full_video_file_id || '';
      sourceUrl = story.full_video_url || '';
    }
    if (fileId) sourceUrl = await telegramFileUrl(fileId);
    if (!sourceUrl) return res.status(404).send('Video not configured');
    return await proxyRemoteMedia(req, res, sourceUrl);
  } catch (error) {
    console.error('[video-proxy]', error.message);
    if (!res.headersSent) res.status(500).send('Video unavailable');
  }
});

app.get('/api/admin/stories', adminAuth, (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ stories: loadStories() }); });
app.post('/api/admin/upload', adminAuth, mediaUpload.single('file'), async (req, res) => {
  const kind = String(req.body?.kind || '').trim();
  if (!['cover', 'trailer', 'full', 'episode'].includes(kind)) return res.status(400).json({ error: 'Upload type is invalid.' });
  if (!req.file) return res.status(400).json({ error: 'សូមជ្រើស File មុន។' });
  if (kind === 'cover' && !req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Cover ត្រូវជា Image File។' });
  if (kind !== 'cover' && !req.file.mimetype.startsWith('video/')) return res.status(400).json({ error: 'Media នេះត្រូវជា Video File។' });
  try {
    const uploaded = await sendPrivateMediaUpload(req.file, kind);
    return res.json({ ok: true, kind, fileId: uploaded.fileId, messageId: uploaded.messageId });
  } catch (error) {
    console.error('[admin-media-upload]', error.message);
    return res.status(502).json({ error: error.message });
  }
});
app.post('/api/admin/stories', adminAuth, async (req, res) => {
  const input = req.body || {};
  const id = String(input.id || '').trim();
  const title = String(input.title || '').trim();
  const preview = String(input.preview || '').trim();
  const price = Number(input.price_khr);
  const contentType = String(input.content_type || 'movie').toLowerCase() === 'series' ? 'series' : 'movie';
  const coverFileId = String(input.cover_file_id || '').trim();
  const trailerFileId = String(input.preview_video_file_id || '').trim();
  const fullFileId = String(input.full_video_file_id || '').trim();
  const coverUrl = String(input.cover_url || '').trim();
  const trailerUrl = String(input.preview_video_url || '').trim();
  const fullUrl = String(input.full_video_url || '').trim();
  const rawEpisodes = Array.isArray(input.episodes) ? input.episodes.slice(0, 200) : [];
  const episodes = rawEpisodes.map((ep, index) => normalizeEpisode(ep, index));
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price is invalid.' });
  if (![coverUrl, trailerUrl, fullUrl, ...episodes.map(ep => ep.url)].every(validHttpUrl)) return res.status(400).json({ error: 'Media URLs must use http or https.' });
  const ids = new Set();
  for (const ep of episodes) {
    if (ids.has(ep.id)) return res.status(400).json({ error: `Episode ID ស្ទួន: ${ep.id}` });
    ids.add(ep.id);
  }
  const stories = loadStories();
  const common = {
    title,
    preview,
    price_khr: price,
    content_type: contentType,
    cover_file_id: coverFileId,
    preview_video_file_id: trailerFileId,
    full_video_file_id: contentType === 'movie' ? fullFileId : '',
    cover_url: coverUrl,
    preview_video_url: trailerUrl,
    full_video_url: contentType === 'movie' ? fullUrl : '',
    episodes: contentType === 'series' ? episodes : []
  };
  let story;
  if (id) {
    const index = stories.findIndex(item => item.id === id);
    if (index < 0) return res.status(404).json({ error: 'Story not found.' });
    story = normalizeStory({ ...stories[index], ...common, updated_at: new Date().toISOString() });
    stories[index] = story;
  } else {
    story = normalizeStory({ id: slugify(title), ...common, created_at: new Date().toISOString() });
    stories.unshift(story);
  }
  try {
    const result = await persistStories(stories, `${id ? 'Update' : 'Add'} ${contentType === 'series' ? 'series' : 'movie'}: ${title}`);
    return res.json({ ok: true, story, ...result });
  } catch (error) {
    console.error('[admin-save]', error.message);
    return res.status(500).json({ error: error.message });
  }
});
app.delete('/api/admin/stories/:id', adminAuth, async (req, res) => {
  const stories = loadStories();
  const story = stories.find(item => item.id === req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found.' });
  try {
    const result = await persistStories(stories.filter(item => item.id !== req.params.id), `Delete web story: ${story.title}`);
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[admin-delete]', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'idramaai', mode: 'web-only', version: '3-series', brand: BRAND_NAME, checkout: BAKONG_TEST_MODE || Boolean(BAKONG_ACCOUNT_ID && BAKONG_TOKEN), bakongTestMode: BAKONG_TEST_MODE, accountLibrary: true, mediaUploads: Boolean(BOT_TOKEN && TELEGRAM_STORAGE_CHAT_ID), series: true });
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File ធំពេកសម្រាប់ Upload តាម Web Admin។ Episode/Video មួយត្រូវតូចជាង 45 MB។' });
  console.error('[server-v3]', err);
  res.status(500).json({ error: 'Server error.' });
});
app.listen(PORT, () => console.log(`[web-v3] ${BRAND_NAME} listening on ${PORT} • Movie + Series enabled`));
