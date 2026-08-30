require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const BRAND_NAME = process.env.BRAND_NAME || 'iDramaAi';
const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || 'https://idramaai.onrender.com').replace(/\/$/, '');
const TELEGRAM_CHANNEL_ID = String(process.env.TELEGRAM_CHANNEL_ID || '').trim();
const TELEGRAM_CHANNEL_URL = String(process.env.TELEGRAM_CHANNEL_URL || '').trim();
const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || process.env.TELEGRAM_STORAGE_CHAT_ID || '').trim();
const storiesPath = path.join(__dirname, 'stories.json');

function loadStories() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function moneyKHR(value) {
  return `${Number(value || 0).toLocaleString('en-US')}៛`;
}

function escHtml(value = '') {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function isAdmin(ctx) {
  if (!ADMIN_TELEGRAM_ID) return false;
  return String(ctx.from?.id || '') === ADMIN_TELEGRAM_ID || String(ctx.chat?.id || '') === ADMIN_TELEGRAM_ID;
}

function storyUrl(story) {
  return `${PUBLIC_BASE_URL}/?story=${encodeURIComponent(story.id)}`;
}

function customerMenu() {
  const rows = [[Markup.button.url('🌐 បើក iDramaAi Store', PUBLIC_BASE_URL)]];
  if (TELEGRAM_CHANNEL_URL) rows.push([Markup.button.url('📢 ចូល Telegram Channel', TELEGRAM_CHANNEL_URL)]);
  return Markup.inlineKeyboard(rows);
}

async function publishStory(bot, story) {
  if (!TELEGRAM_CHANNEL_ID) {
    throw new Error('TELEGRAM_CHANNEL_ID មិនទាន់បានកំណត់ក្នុង Render Environment។');
  }

  const url = storyUrl(story);
  const caption = [
    `🎬 <b>${escHtml(story.title)}</b>`,
    '',
    story.preview ? escHtml(story.preview) : 'រឿងថ្មីនៅ iDramaAi',
    '',
    `💰 តម្លៃ៖ <b>${moneyKHR(story.price_khr)}</b>`,
    '💳 ទូទាត់តាម Bakong KHQR នៅ Website',
    '🔓 បង់ជោគជ័យ → មើល Full Movie ភ្លាម'
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🎞️ មើល Trailer / Preview', url)],
    [Markup.button.url('🛒 ទិញរឿងនេះ', url)]
  ]);

  if (story.cover_file_id) {
    return bot.telegram.sendPhoto(TELEGRAM_CHANNEL_ID, story.cover_file_id, {
      caption,
      parse_mode: 'HTML',
      ...keyboard
    });
  }

  return bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, caption, {
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    ...keyboard
  });
}

async function showPublishList(ctx) {
  if (!isAdmin(ctx)) return ctx.reply('⛔ Command នេះសម្រាប់ Admin ប៉ុណ្ណោះ។');

  if (!TELEGRAM_CHANNEL_ID) {
    return ctx.reply('⚠️ មិនទាន់កំណត់ TELEGRAM_CHANNEL_ID នៅ Render Environment ទេ។');
  }

  const stories = loadStories();
  if (!stories.length) return ctx.reply('មិនទាន់មានរឿងនៅ Website Store ទេ។ សូមបន្ថែមរឿងក្នុង /admin.html ជាមុន។');

  const rows = stories.slice(0, 50).map((story, index) => [
    Markup.button.callback(`📢 ${story.title} • ${moneyKHR(story.price_khr)}`, `publish:${index}`)
  ]);

  return ctx.reply(
    '📢 <b>Post រឿងទៅ Telegram Channel</b>\n\nជ្រើសរឿងខាងក្រោម។ Bot នឹង Post Cover + តម្លៃ + ប៊ូតុងទិញទៅ Website Store។',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
}

async function syncProfile(bot) {
  const commands = [
    { command: 'start', description: 'ចាប់ផ្តើម' },
    { command: 'store', description: 'បើក Website Store' },
    { command: 'postmovie', description: 'Admin: Post រឿងទៅ Channel' },
    { command: 'myid', description: 'មើល Telegram ID' },
    { command: 'help', description: 'ជំនួយ' }
  ];

  await Promise.allSettled([
    bot.telegram.setMyCommands(commands),
    bot.telegram.callApi('setMyName', { name: BRAND_NAME }),
    bot.telegram.callApi('setMyDescription', {
      description: `${BRAND_NAME} — រឿងខ្លីៗ • Telegram Channel + Website Store • Bakong KHQR`
    }),
    bot.telegram.callApi('setMyShortDescription', {
      short_description: `${BRAND_NAME} | Drama Store`
    })
  ]);
}

function startTelegramBot() {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN is missing. Telegram bot/channel publishing is disabled.');
    return null;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    await ctx.reply(
      `🎬 <b>${BRAND_NAME}</b>\n\nមើល Poster និង Trailer ក្នុង Telegram Channel ហើយទិញរឿងតាម Website Store ដោយទូទាត់ Bakong KHQR។`,
      { parse_mode: 'HTML', ...customerMenu() }
    );
  });

  bot.command('store', (ctx) => ctx.reply('🌐 បើក Website Store:', customerMenu()));
  bot.command('myid', (ctx) => ctx.reply(`Telegram User ID របស់អ្នក៖ ${ctx.from?.id || 'unknown'}\nChat ID៖ ${ctx.chat?.id || 'unknown'}`));
  bot.command('postmovie', showPublishList);
  bot.command('help', async (ctx) => {
    const adminHelp = isAdmin(ctx)
      ? '\n\n👑 Admin: វាយ /postmovie ដើម្បីជ្រើសរឿង ហើយ Post ទៅ Channel។'
      : '';
    await ctx.reply(
      `របៀបទិញ៖\n1️⃣ ចូល Channel និងជ្រើសរឿង\n2️⃣ ចុច 🛒 ទិញរឿងនេះ\n3️⃣ Website បង្ហាញ Bakong KHQR\n4️⃣ បង់ជោគជ័យ → Watch Page បើក Full Movie${adminHelp}`,
      customerMenu()
    );
  });

  bot.action(/^publish:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('Admin only', { show_alert: true });

    const index = Number(ctx.match[1]);
    const story = loadStories()[index];
    if (!story) return ctx.answerCbQuery('រកមិនឃើញរឿងនេះទេ។ សូមវាយ /postmovie ម្តងទៀត។', { show_alert: true });

    try {
      await ctx.answerCbQuery('កំពុង Post…');
      const sent = await publishStory(bot, story);
      await ctx.reply(
        `✅ <b>Post ទៅ Channel ជោគជ័យ</b>\n\n🎬 ${escHtml(story.title)}\n💰 ${moneyKHR(story.price_khr)}\n🆔 Message: ${sent.message_id}`,
        { parse_mode: 'HTML' }
      );
    } catch (error) {
      console.error('[telegram-publish]', error.message);
      await ctx.reply(`❌ Post មិនបាន៖ ${error.message}`);
    }
  });

  bot.catch((error) => console.error('[telegram]', error));

  syncProfile(bot).catch((error) => console.error('[telegram-profile]', error.message));
  bot.launch({ dropPendingUpdates: false })
    .then(() => console.log(`[telegram] ${BRAND_NAME} bot started for Channel + Website Store`))
    .catch((error) => console.error('[telegram-launch]', error.message));

  const stop = (signal) => {
    try { bot.stop(signal); } catch {}
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  return bot;
}

module.exports = { startTelegramBot, publishStory };
