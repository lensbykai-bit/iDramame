require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { Telegraf, Markup } = require('telegraf');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const required = ['BOT_TOKEN', 'BAKONG_ACCOUNT_ID', 'BAKONG_TOKEN'];
for (const key of required) {
  if (!process.env[key]) {
    console.warn(`[config] Missing ${key}. Bot will not be fully operational until it is set.`);
  }
}

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || '');
const BAKONG_ACCOUNT_ID = process.env.BAKONG_ACCOUNT_ID || '';
const BAKONG_MERCHANT_NAME = process.env.BAKONG_MERCHANT_NAME || 'iDrama.me';
const BAKONG_MERCHANT_CITY = process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH';
const BAKONG_MOBILE_NUMBER = process.env.BAKONG_MOBILE_NUMBER || '';
const BAKONG_API_BASE_URL = (process.env.BAKONG_API_BASE_URL || 'https://api-bakong.nbc.gov.kh').replace(/\/$/, '');
const BAKONG_TOKEN = process.env.BAKONG_TOKEN || '';
const PORT = Number(process.env.PORT || 3000);

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required. Put it in the server environment, never in GitHub.');
}

const bot = new Telegraf(BOT_TOKEN);
const storiesPath = path.join(__dirname, 'stories.json');
const storePath = path.join(__dirname, 'data', 'store.json');

function loadStories() {
  return JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
}

function storyById(id) {
  return loadStories().find((story) => story.id === id);
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

function safeOrderId(userId, storyId) {
  const now = Date.now().toString(36).toUpperCase();
  return `IDR-${storyId.toUpperCase()}-${String(userId).slice(-6)}-${now}`;
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎬 មើលរឿង', 'catalog')],
    [Markup.button.callback('📚 រឿងដែលបានទិញ', 'purchased')],
    [Markup.button.callback('💬 ជំនួយ', 'help')]
  ]);
}

async function showCatalog(ctx) {
  const rows = loadStories().map((story) => [
    Markup.button.callback(`🎬 ${story.title} • ${moneyKHR(story.price_khr)}`, `view:${story.id}`)
  ]);
  rows.push([Markup.button.callback('🏠 ទំព័រដើម', 'home')]);
  await ctx.reply('📚 <b>iDrama.me — រឿងខ្លីៗ</b>\n\nជ្រើសរើសរឿងដើម្បីមើល Preview និងតម្លៃ។', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(rows)
  });
}

async function showStory(ctx, story) {
  if (!story) return ctx.reply('រករឿងនេះមិនឃើញ។');

  const caption = `🎬 <b>${story.title}</b>\n\n${story.preview}\n\n💰 តម្លៃ៖ <b>${moneyKHR(story.price_khr)}</b>`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`🛒 ទិញរឿងពេញ • ${moneyKHR(story.price_khr)}`, `buy:${story.id}`)],
    [Markup.button.callback('⬅️ ត្រឡប់ទៅរឿងទាំងអស់', 'catalog')]
  ]);

  if (story.preview_video_file_id) {
    await ctx.replyWithVideo(story.preview_video_file_id, {
      caption,
      parse_mode: 'HTML',
      supports_streaming: true,
      ...keyboard
    });
  } else {
    await ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
  }
}

function generateKHQR(order) {
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const optionalData = {
    currency: khqrData.currency.khr,
    amount: Number(order.amount),
    billNumber: order.id.slice(0, 25),
    storeLabel: 'iDrama.me',
    terminalLabel: 'Telegram',
    expirationTimestamp,
    merchantCategoryCode: '5999'
  };

  if (BAKONG_MOBILE_NUMBER) optionalData.mobileNumber = BAKONG_MOBILE_NUMBER;

  let info;
  try {
    // Current npm SDK signature.
    info = new IndividualInfo(
      BAKONG_ACCOUNT_ID,
      khqrData.currency.khr,
      BAKONG_MERCHANT_NAME,
      BAKONG_MERCHANT_CITY,
      optionalData
    );
  } catch {
    // Compatibility with older SDK signature shown in older NBC docs.
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
  return response.data;
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
  if (!response.ok) {
    throw new Error(`Bakong API ${response.status}: ${body.responseMessage || 'request failed'}`);
  }
  return body;
}

function verifyPaymentMatchesOrder(payment, order) {
  if (!payment || payment.responseCode !== 0 || !payment.data) return false;

  const paidAmount = Number(payment.data.amount);
  const expectedAmount = Number(order.amount);
  const paidCurrency = String(payment.data.currency || '').toUpperCase();
  const toAccount = String(payment.data.toAccountId || '').toLowerCase();

  return (
    paidCurrency === 'KHR' &&
    paidAmount === expectedAmount &&
    toAccount === BAKONG_ACCOUNT_ID.toLowerCase()
  );
}

async function deliverStory(ctx, order, story) {
  if (!story.full_video_file_id) {
    await ctx.reply(
      '✅ ការបង់ប្រាក់ត្រូវបានបញ្ជាក់រួច។\n\n⚠️ វីដេអូពេញមិនទាន់ត្រូវបានភ្ជាប់ទៅ Story នេះ។ សូមទាក់ទង Admin។'
    );
    if (ADMIN_TELEGRAM_ID) {
      await bot.telegram.sendMessage(
        ADMIN_TELEGRAM_ID,
        `⚠️ Paid order ${order.id} needs video file_id for ${story.id}. User: ${order.userId}`
      ).catch(() => {});
    }
    return;
  }

  await ctx.replyWithVideo(story.full_video_file_id, {
    caption: `✅ <b>ទិញជោគជ័យ</b>\n🎬 ${story.title}\n🧾 Order: <code>${order.id}</code>\n\n🔐 Protected by iDrama.me`,
    parse_mode: 'HTML',
    supports_streaming: true,
    protect_content: true
  });
}

bot.start(async (ctx) => {
  await ctx.reply(
    '🎬 <b>សូមស្វាគមន៍មកកាន់ iDrama.me</b>\n\nមើល Preview រឿងខ្លីៗ ហើយទិញរឿងពេញតាម Bakong KHQR។\n🔐 វីដេអូពេញត្រូវបានផ្ញើជា Protected Content។',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

bot.command('catalog', showCatalog);

bot.command('purchased', async (ctx) => {
  const store = loadStore();
  const userPurchases = Object.values(store.purchases || {}).filter(
    (p) => String(p.userId) === String(ctx.from.id)
  );

  if (!userPurchases.length) {
    return ctx.reply('📚 អ្នកមិនទាន់មានរឿងដែលបានទិញទេ។', mainMenu());
  }

  const lines = userPurchases.map((p, i) => `${i + 1}. ${p.title} • ${moneyKHR(p.amount)} • ✅`);
  await ctx.reply(`📚 <b>រឿងដែលអ្នកបានទិញ</b>\n\n${lines.join('\n')}`, {
    parse_mode: 'HTML',
    ...mainMenu()
  });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '💬 <b>របៀបទិញ</b>\n\n1) ចុច “មើលរឿង”\n2) ជ្រើសរឿង\n3) ចុច “ទិញរឿងពេញ”\n4) Scan Bakong KHQR និងបង់តាមចំនួនដែលបង្ហាញ\n5) ចុច “✅ ខ្ញុំបានបង់រួច — ពិនិត្យ”\n6) បើការបង់ត្រឹមត្រូវ Bot នឹងផ្ញើវីដេអូពេញ។',
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

bot.command('myid', (ctx) => ctx.reply(`Telegram User ID របស់អ្នក៖ ${ctx.from.id}`));

bot.on('video', async (ctx, next) => {
  if (!ADMIN_TELEGRAM_ID || String(ctx.from.id) !== ADMIN_TELEGRAM_ID) return next();
  const fileId = ctx.message.video.file_id;
  await ctx.reply(`🎬 Telegram video file_id:\n<code>${fileId}</code>\n\nយក file_id នេះទៅដាក់ក្នុង stories.json។`, {
    parse_mode: 'HTML'
  });
});

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('🏠 <b>iDrama.me</b>', { parse_mode: 'HTML', ...mainMenu() });
});

bot.action('catalog', async (ctx) => {
  await ctx.answerCbQuery();
  await showCatalog(ctx);
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('💬 ជ្រើសរឿង → ទិញ → Scan KHQR → ចុចពិនិត្យការបង់ → ទទួលវីដេអូពេញ។', mainMenu());
});

bot.action('purchased', async (ctx) => {
  await ctx.answerCbQuery();
  const store = loadStore();
  const userPurchases = Object.values(store.purchases || {}).filter(
    (p) => String(p.userId) === String(ctx.from.id)
  );
  if (!userPurchases.length) return ctx.reply('📚 អ្នកមិនទាន់មានរឿងដែលបានទិញទេ។');
  const rows = userPurchases.map((p) => [Markup.button.callback(`🎬 ${p.title}`, `replay:${p.storyId}`)]);
  await ctx.reply('📚 រឿងដែលអ្នកបានទិញ៖', Markup.inlineKeyboard(rows));
});

bot.action(/^view:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showStory(ctx, storyById(ctx.match[1]));
});

bot.action(/^buy:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('កំពុងបង្កើត KHQR...');
  const story = storyById(ctx.match[1]);
  if (!story) return ctx.reply('រករឿងនេះមិនឃើញ។');

  if (!BAKONG_ACCOUNT_ID || !BAKONG_TOKEN) {
    return ctx.reply('⚠️ Bakong KHQR មិនទាន់បានកំណត់នៅ Server ទេ។');
  }

  const order = {
    id: safeOrderId(ctx.from.id, story.id),
    userId: ctx.from.id,
    username: ctx.from.username || '',
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
    order.qr = khqr.qr;

    const store = loadStore();
    store.orders[order.id] = order;
    saveStore(store);

    const qrBuffer = await QRCode.toBuffer(khqr.qr, {
      type: 'png',
      width: 700,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption:
          `💳 <b>Bakong KHQR — iDrama.me</b>\n\n` +
          `🎬 ${story.title}\n` +
          `💰 ត្រូវបង់៖ <b>${moneyKHR(order.amount)}</b>\n` +
          `🧾 Order: <code>${order.id}</code>\n\n` +
          `⏳ QR នេះគ្រោងផុតកំណត់ប្រហែល 10 នាទី។ បង់តាមចំនួនដែលបង្ហាញ ហើយចុចប៊ូតុងពិនិត្យ។`,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ ខ្ញុំបានបង់រួច — ពិនិត្យ', `check:${order.id}`)],
          [Markup.button.callback('❌ បោះបង់', 'catalog')]
        ])
      }
    );
  } catch (error) {
    console.error('[buy]', error.message);
    await ctx.reply('❌ មិនអាចបង្កើត KHQR បាន។ សូមពិនិត្យ Bakong Account និង Server settings។');
  }
});

bot.action(/^check:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery('កំពុងពិនិត្យការបង់...');
  const orderId = ctx.match[1];
  const store = loadStore();
  const order = store.orders[orderId];

  if (!order || String(order.userId) !== String(ctx.from.id)) {
    return ctx.reply('❌ Order នេះមិនត្រឹមត្រូវ ឬមិនមែនរបស់អ្នក។');
  }

  if (order.status === 'paid') {
    const story = storyById(order.storyId);
    return deliverStory(ctx, order, story);
  }

  try {
    const result = await checkPayment(order.md5);
    if (!verifyPaymentMatchesOrder(result, order)) {
      return ctx.reply(
        '⏳ មិនទាន់រកឃើញការបង់ដែលត្រឹមត្រូវទេ។\n\nសូមពិនិត្យថាបានបង់ចំនួនត្រឹមត្រូវ ហើយសាកចុច “ពិនិត្យ” ម្តងទៀត។',
        Markup.inlineKeyboard([[Markup.button.callback('🔄 ពិនិត្យម្តងទៀត', `check:${order.id}`)]])
      );
    }

    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.transactionHash = result.data.hash || '';
    store.orders[order.id] = order;
    store.purchases[`${order.userId}:${order.storyId}`] = {
      userId: order.userId,
      storyId: order.storyId,
      title: order.title,
      amount: order.amount,
      orderId: order.id,
      paidAt: order.paidAt
    };
    saveStore(store);

    await ctx.reply('✅ <b>ការបង់ប្រាក់បានបញ្ជាក់ជោគជ័យ!</b>\nកំពុងផ្ញើរឿងពេញជូនអ្នក…', {
      parse_mode: 'HTML'
    });
    await deliverStory(ctx, order, storyById(order.storyId));
  } catch (error) {
    console.error('[payment-check]', error.message);
    await ctx.reply('⚠️ មិនអាចពិនិត្យ Bakong បាននៅពេលនេះ។ សូមសាកម្តងទៀតបន្តិចក្រោយ។');
  }
});

bot.action(/^replay:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const story = storyById(ctx.match[1]);
  const store = loadStore();
  const purchase = store.purchases[`${ctx.from.id}:${ctx.match[1]}`];
  if (!purchase) return ctx.reply('❌ អ្នកមិនទាន់បានទិញរឿងនេះទេ។');
  if (!story?.full_video_file_id) return ctx.reply('⚠️ វីដេអូពេញមិនទាន់បានភ្ជាប់។');
  await ctx.replyWithVideo(story.full_video_file_id, {
    caption: `🎬 ${story.title}\n🔐 Protected by iDrama.me`,
    supports_streaming: true,
    protect_content: true
  });
});

bot.catch((err) => console.error('[telegram]', err));

const app = express();
app.get('/', (_req, res) => res.status(200).send('iDrama.me Telegram Bot is running.'));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'idrama-me-bot' }));
app.listen(PORT, () => console.log(`[web] Health server listening on ${PORT}`));

bot.launch().then(() => console.log('[telegram] iDrama.me bot started with long polling'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
