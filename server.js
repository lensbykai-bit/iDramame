require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const express = require('express');
const QRCode = require('qrcode');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const BRAND_NAME = process.env.BRAND_NAME || 'ខ្ញុំចង់មើលរឿងអេអាយ';
const BAKONG_ACCOUNT_ID = process.env.BAKONG_ACCOUNT_ID || '';
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || 'AI STORY KH';
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH';
const BAKONG_MOBILE_NUMBER = process.env.BAKONG_MOBILE_NUMBER || '';
const BAKONG_STORE_LABEL = process.env.BAKONG_STORE_LABEL || 'AI STORY KH';
const BAKONG_API_BASE_URL = (process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || '';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'lensbykai-bit/iDramame';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const PORT = Number(process.env.PORT || 3000);

const storiesPath = path.join(__dirname, 'stories.json');
const storePath = path.join(__dirname, 'data', 'store.json');
const publicPath = path.join(__dirname, 'public');

if (!BAKONG_ACCOUNT_ID) console.warn('[config] BAKONG_ACCOUNT_ID is missing. Checkout will be disabled.');
if (!BAKONG_TOKEN) console.warn('[config] BAKONG_TOKEN is missing. Payment verification will be disabled.');
if (!process.env.ACCESS_TOKEN_SECRET) console.warn('[config] ACCESS_TOKEN_SECRET is missing. Set one in Render so watch links survive restarts.');
if (!ADMIN_PASSWORD) console.warn('[config] ADMIN_PASSWORD is missing. Web admin will be disabled.');
if (!GITHUB_TOKEN) console.warn('[config] GITHUB_TOKEN is missing. Admin story changes will not persist across redeploys.');

function loadStories() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoriesLocal(stories) {
  fs.writeFileSync(storiesPath, JSON.stringify(stories, null, 2) + '\n');
}

function storyById(id) {
  return loadStories().find((story) => story.id === id);
}

function publicStory(story) {
  return {
    id: story.id,
    title: story.title,
    preview: story.preview || '',
    price_khr: Number(story.price_khr || 0),
    cover_url: story.cover_url || '',
    preview_video_url: story.preview_video_url || ''
  };
}

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return {
      orders: parsed.orders || {},
      purchases: parsed.purchases || {}
    };
  } catch {
    return { orders: {}, purchases: {} };
  }
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
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function slugify(value) {
  const base = String(value || 'story')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 35);
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
  saveStoriesLocal(stories);
  if (!GITHUB_TOKEN) return { persistedToGitHub: false };

  const api = `https://api.github.com/repos/${GITHUB_REPO}/contents/stories.json`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ai-story-kh-web-admin'
  };

  const current = await fetch(`${api}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (!current.ok) throw new Error(`GitHub read failed (${current.status}).`);
  const currentBody = await current.json();

  const updated = await fetch(api, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(stories, null, 2) + '\n').toString('base64'),
      sha: currentBody.sha,
      branch: GITHUB_BRANCH
    })
  });

  if (!updated.ok) {
    const err = await updated.json().catch(() => ({}));
    throw new Error(err.message || `GitHub update failed (${updated.status}).`);
  }

  return { persistedToGitHub: true };
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
  try {
    info = new IndividualInfo(
      BAKONG_ACCOUNT_ID,
      khqrData.currency.khr,
      BAKONG_MERCHANT_NAME,
      BAKONG_MERCHANT_CITY,
      optionalData
    );
  } catch {
    info = new IndividualInfo(
      BAKONG_ACCOUNT_ID,
      BAKONG_MERCHANT_NAME,
      BAKONG_MERCHANT_CITY,
      optionalData
    );
  }

  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(info);
  if (!response || response.status?.code !== 0 || !response.data?.qr || !response.data?.md5) {
    throw new Error(response?.status?.message || 'KHQR generation failed');
  }
  return { ...response.data, expiresAt: expirationTimestamp };
}

async function checkPayment(md5) {
  const response = await fetch(`${BAKONG_API_BASE_URL}/v1/check_transaction_by_md5`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BAKONG_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ md5 })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Bakong API ${response.status}: ${body.responseMessage || 'request failed'}`);
  return body;
}

function verifyPaymentMatchesOrder(payment, order) {
  if (!payment || payment.responseCode !== 0 || !payment.data) return false;
  return (
    String(payment.data.currency || '').toUpperCase() === 'KHR' &&
    Number(payment.data.amount) === Number(order.amount) &&
    String(payment.data.toAccountId || '').toLowerCase() === BAKONG_ACCOUNT_ID.toLowerCase()
  );
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signAccess(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAccess(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', ACCESS_TOKEN_SECRET).update(body).digest('base64url');
    if (!safeEqual(sig, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function createWatchToken(order) {
  return signAccess({
    storyId: order.storyId,
    orderId: order.id,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000
  });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.static(publicPath, { etag: true, maxAge: '1h' }));

app.get('/api/meta', (_req, res) => {
  res.json({ brand: BRAND_NAME, checkout: Boolean(BAKONG_ACCOUNT_ID && BAKONG_TOKEN) });
});

app.get('/api/stories', (_req, res) => {
  res.json({ stories: loadStories().map(publicStory) });
});

app.get('/api/stories/:id', (req, res) => {
  const story = storyById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.json({ story: publicStory(story) });
});

app.post('/api/orders', async (req, res) => {
  if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) {
    return res.status(503).json({ error: 'Bakong payment is not configured yet.' });
  }

  const story = storyById(String(req.body?.storyId || ''));
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (!story.full_video_url) return res.status(409).json({ error: 'រឿងនេះមិនទាន់មានវីដេអូពេញសម្រាប់ទិញទេ។' });

  const order = {
    id: safeOrderId(story.id),
    storyId: story.id,
    title: story.title,
    amount: Number(story.price_khr),
    currency: 'KHR',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  try {
    const khqr = generateKHQR(order);
    order.md5 = khqr.md5;
    order.expiresAt = khqr.expiresAt;

    const store = loadStore();
    store.orders[order.id] = order;
    saveStore(store);

    const qrDataUrl = await QRCode.toDataURL(khqr.qr, {
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    res.json({
      orderId: order.id,
      title: order.title,
      amount: order.amount,
      currency: order.currency,
      expiresAt: order.expiresAt,
      qrDataUrl
    });
  } catch (error) {
    console.error('[order]', error.message);
    res.status(500).json({ error: 'មិនអាចបង្កើត Bakong KHQR បាន។' });
  }
});

app.post('/api/orders/:id/check', async (req, res) => {
  const store = loadStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'paid') {
    return res.json({
      paid: true,
      watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken(order))}`
    });
  }

  try {
    const payment = await checkPayment(order.md5);
    if (!verifyPaymentMatchesOrder(payment, order)) return res.json({ paid: false });

    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.transactionHash = payment.data.hash || '';
    store.orders[order.id] = order;
    store.purchases[order.id] = {
      storyId: order.storyId,
      title: order.title,
      amount: order.amount,
      paidAt: order.paidAt
    };
    saveStore(store);

    res.json({
      paid: true,
      watchUrl: `/watch.html?token=${encodeURIComponent(createWatchToken(order))}`
    });
  } catch (error) {
    console.error('[payment-check]', error.message);
    res.status(502).json({ error: 'មិនអាចពិនិត្យ Bakong បាននៅពេលនេះ។' });
  }
});

app.get('/api/access', (req, res) => {
  const payload = verifyAccess(req.query.token);
  if (!payload) return res.status(401).json({ error: 'Access link is invalid or expired.' });

  const story = storyById(payload.storyId);
  if (!story) return res.status(404).json({ error: 'Story not found' });

  res.set('Cache-Control', 'private, no-store');
  res.json({
    story: { id: story.id, title: story.title },
    orderId: payload.orderId,
    videoUrl: `/api/video/${encodeURIComponent(story.id)}?token=${encodeURIComponent(req.query.token)}`
  });
});

app.get('/api/video/:id', async (req, res) => {
  const payload = verifyAccess(req.query.token);
  if (!payload || payload.storyId !== req.params.id) return res.status(401).send('Unauthorized');

  const story = storyById(req.params.id);
  if (!story?.full_video_url) return res.status(404).send('Video not configured');

  try {
    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(story.full_video_url, { headers });
    if (!upstream.ok && upstream.status !== 206) return res.status(502).send('Video source unavailable');

    res.status(upstream.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');

    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error('[video-proxy]', error.message);
    if (!res.headersSent) res.status(500).send('Video unavailable');
  }
});

app.get('/api/admin/stories', adminAuth, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ stories: loadStories() });
});

app.post('/api/admin/stories', adminAuth, async (req, res) => {
  const input = req.body || {};
  const id = String(input.id || '').trim();
  const title = String(input.title || '').trim();
  const preview = String(input.preview || '').trim();
  const price = Number(input.price_khr);
  const coverUrl = String(input.cover_url || '').trim();
  const trailerUrl = String(input.preview_video_url || '').trim();
  const fullUrl = String(input.full_video_url || '').trim();

  if (!title) return res.status(400).json({ error: 'Title is required.' });
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price is invalid.' });
  if (![coverUrl, trailerUrl, fullUrl].every(validHttpUrl)) {
    return res.status(400).json({ error: 'Cover/Video URLs must use http or https.' });
  }

  const stories = loadStories();
  let story;

  if (id) {
    const index = stories.findIndex((item) => item.id === id);
    if (index < 0) return res.status(404).json({ error: 'Story not found.' });
    story = {
      ...stories[index],
      title,
      preview,
      price_khr: price,
      cover_url: coverUrl,
      preview_video_url: trailerUrl,
      full_video_url: fullUrl,
      updated_at: new Date().toISOString()
    };
    stories[index] = story;
  } else {
    story = {
      id: slugify(title),
      title,
      preview,
      price_khr: price,
      cover_url: coverUrl,
      preview_video_url: trailerUrl,
      full_video_url: fullUrl,
      created_at: new Date().toISOString()
    };
    stories.unshift(story);
  }

  try {
    const result = await persistStories(stories, `${id ? 'Update' : 'Add'} story: ${title}`);
    res.json({ ok: true, story, ...result });
  } catch (error) {
    console.error('[admin-save]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/stories/:id', adminAuth, async (req, res) => {
  const stories = loadStories();
  const story = stories.find((item) => item.id === req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found.' });

  const nextStories = stories.filter((item) => item.id !== req.params.id);
  try {
    const result = await persistStories(nextStories, `Delete story: ${story.title}`);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[admin-delete]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-story-kh', brand: BRAND_NAME });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => console.log(`[web] ${BRAND_NAME} listening on ${PORT}`));
