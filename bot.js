require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const express = require('express');
const QRCode = require('qrcode');
const { Telegraf, Markup } = require('telegraf');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || '');
const BAKONG_ACCOUNT_ID = process.env.BAKONG_ACCOUNT_ID || '';
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || 'iDrama.me';
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH';
const BAKONG_MOBILE_NUMBER = process.env.BAKONG_MOBILE_NUMBER || '';
const BAKONG_API_BASE_URL = (process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://idramame.onrender.com').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required. Put it in the server environment, never in GitHub.');
if (!BAKONG_ACCOUNT_ID) console.warn('[config] Missing BAKONG_ACCOUNT_ID. Web checkout will be disabled until it is set.');
if (!BAKONG_TOKEN) console.warn('[config] Missing BAKONG_TOKEN. Payment verification will be disabled until it is set.');
if (!process.env.ACCESS_TOKEN_SECRET) console.warn('[config] ACCESS_TOKEN_SECRET not set. Using a BOT_TOKEN-derived signing key for now.');

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || crypto.createHash('sha256').update(BOT_TOKEN).digest('hex');
const bot = new Telegraf(BOT_TOKEN);
const storiesPath = path.join(__dirname, 'stories.json');
const storePath = path.join(__dirname, 'data', 'store.json');
const publicPath = path.join(__dirname, 'public');

function loadStories() {
  return JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
}

function storyById(id) {
  return loadStories().find((story) => story.id === id);
}

function publicStory(story) {
  return {
    id: story.id,
    title: story.title,
    preview: story.preview,
    price_khr: Number(story.price_khr),
    cover_url: story.cover_url || '',
    preview_video_url: story.preview_video_url || ''
  };
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return { orders: {}, purchases: {} };
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function moneyKHR(amount) {
  return `${Number(amount).toLocaleString('en-US')}៛`;
}

function safeOrderId(storyId) {
  return `IDR-${storyId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎬 មើល Preview', 'catalog')],
    [Markup.button.url('🛒 ទិញតាម iDrama.me', PUBLIC_BASE_URL)],
    [Markup.button.callback('💬 ជំនួយ', 'help')]
  ]);
}

async function showCatalog(ctx) {
  const rows = loadStories().map((story) => [
    Markup.button.url(`🎬 ${story.title} • ${moneyKHR(story.price_khr)}`, `${PUBLIC_BASE_URL}/?story=${encodeURIComponent(story.id)}`)
  ]);
  rows.push([Markup.button.url('🌐 បើក iDrama.me Store', PUBLIC_BASE_URL)]);
  await ctx.reply(
    '📚 <b>iDrama.me — រឿងខ្លីៗ</b>\n\nមើល Preview នៅ Telegram ហើយការទិញតាម Bakong KHQR ធ្វើនៅលើ iDrama.me Web Store។',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
}

bot.start(async (ctx) => {
  await ctx.reply(
    '🎬 <b>សូមស្វាគមន៍មកកាន់ iDrama.me</b>\n\nមើល Preview រឿងខ្លីៗនៅ Telegram។ សម្រាប់ការទិញតាម Bakong KHQR សូមបើក iDrama.me Web Store។',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

bot.command('catalog', showCatalog);
bot.command('purchased', async (ctx) => {
  await ctx.reply(
    '📚 ការទិញតាម Bakong KHQR និងការមើលរឿងពេញធ្វើនៅលើ iDrama.me Web Store។\n\nបន្ទាប់ពីបង់ជោគជ័យ Website នឹងបើក Watch Page ផ្ទាល់។',
    Markup.inlineKeyboard([[Markup.button.url('🌐 បើក iDrama.me', PUBLIC_BASE_URL)]])
  );
});
bot.command('help', async (ctx) => {
  await ctx.reply(
    '💬 <b>របៀបទិញ</b>\n\n1) ចុច “មើល Preview”\n2) ជ្រើសរឿង\n3) បើក iDrama.me Web Store\n4) Scan Bakong KHQR\n5) Website ពិនិត្យការបង់\n6) បង់ជោគជ័យ → បើក Watch Page។',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});
bot.command('myid', (ctx) => ctx.reply(`Telegram User ID របស់អ្នក៖ ${ctx.from.id}`));
bot.action('catalog', async (ctx) => {
  await ctx.answerCbQuery();
  await showCatalog(ctx);
});
bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('💬 មើល Preview នៅ Telegram → ទិញតាម Website → Bakong KHQR → Watch Page។', mainMenu());
});

bot.on('video', async (ctx, next) => {
  if (!ADMIN_TELEGRAM_ID || String(ctx.from.id) !== ADMIN_TELEGRAM_ID) return next();
  const fileId = ctx.message.video.file_id;
  await ctx.reply(`🎬 Telegram video file_id:\n<code>${fileId}</code>\n\nអាចដាក់ក្នុង stories.json ជា full_video_file_id សម្រាប់ Web player proxy។`, {
    parse_mode: 'HTML'
  });
});

bot.catch((err) => console.error('[telegram]', err));

function generateKHQR(order) {
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const optionalData = {
    currency: khqrData.currency.khr,
    amount: Number(order.amount),
    billNumber: order.id.slice(0, 25),
    storeLabel: 'iDrama.me',
    terminalLabel: 'WebStore',
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
  const paidAmount = Number(payment.data.amount);
  const expectedAmount = Number(order.amount);
  const paidCurrency = String(payment.data.currency || '').toUpperCase();
  const toAccount = String(payment.data.toAccountId || '').toLowerCase();
  return paidCurrency === 'KHR' && paidAmount === expectedAmount && toAccount === BAKONG_ACCOUNT_ID.toLowerCase();
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
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
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
app.use(express.json({ limit: '32kb' }));
app.use(express.static(publicPath, { etag: true, maxAge: '1h' }));

app.get('/api/stories', (_req, res) => {
  res.json({ stories: loadStories().map(publicStory) });
});

app.get('/api/stories/:id', (req, res) => {
  const story = storyById(req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.json({ story: publicStory(story) });
});

app.post('/api/orders', async (req, res) => {
  if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) return res.status(503).json({ error: 'Bakong payment is not configured yet.' });
  const story = storyById(String(req.body?.storyId || ''));
  if (!story) return res.status(404).json({ error: 'Story not found' });

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
    const qrDataUrl = await QRCode.toDataURL(khqr.qr, { width: 640, margin: 2, errorCorrectionLevel: 'M' });
    res.json({
      orderId: order.id,
      title: order.title,
      amount: order.amount,
      currency: order.currency,
      expiresAt: order.expiresAt,
      qrDataUrl
    });
  } catch (error) {
    console.error('[web-order]', error.message);
    res.status(500).json({ error: 'មិនអាចបង្កើត Bakong KHQR បាន។' });
  }
});

app.post('/api/orders/:id/check', async (req, res) => {
  const store = loadStore();
  const order = store.orders[req.params.id];
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (order.status === 'paid') {
    const token = createWatchToken(order);
    return res.json({ paid: true, watchUrl: `/watch.html?token=${encodeURIComponent(token)}` });
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

    const token = createWatchToken(order);
    res.json({ paid: true, watchUrl: `/watch.html?token=${encodeURIComponent(token)}` });
  } catch (error) {
    console.error('[web-payment-check]', error.message);
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
  if (!story) return res.status(404).send('Not found');

  let sourceUrl = story.full_video_url || '';
  try {
    if (!sourceUrl && story.full_video_file_id) {
      const file = await bot.telegram.getFile(story.full_video_file_id);
      if (file?.file_path) sourceUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    }
    if (!sourceUrl) return res.status(404).send('Full video is not configured yet.');

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(sourceUrl, { headers });
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

app.get('/health', (_req, res) => res.json({ ok: true, service: 'idrama-me-web-store' }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => console.log(`[web] iDrama.me store listening on ${PORT}`));
bot.launch().then(() => console.log('[telegram] iDrama.me bot started with web-store links'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
