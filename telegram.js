require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const BRAND_NAME = 'iDramaAi';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'iDramaAiBot';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://idramaai.onrender.com').replace(/\/$/, '');
const storiesPath = path.join(__dirname, 'stories.json');

function loadStories() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function longStories() {
  return loadStories().filter((story) => story.placement === 'telegram');
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎞️ រឿងវែងក្នុង Telegram', 'catalog')],
    [Markup.button.url('🌐 រឿងខ្លីនៅ Website', PUBLIC_BASE_URL)],
    [Markup.button.callback('💬 ជំនួយ', 'help')]
  ]);
}

async function showCatalog(ctx) {
  const stories = longStories();
  if (!stories.length) {
    return ctx.reply(
      '🎞️ មិនទាន់មានរឿងវែងក្នុង Telegram ទេ។ រឿងខ្លីអាចមើលនៅ Website។',
      mainMenu()
    );
  }

  const rows = stories.map((story) => {
    if (story.telegram_url) {
      return [Markup.button.url(`▶️ ${story.title}`, story.telegram_url)];
    }
    return [Markup.button.callback(`⏳ ${story.title}`, 'not_ready')];
  });
  rows.push([Markup.button.url('🌐 មើលរឿងខ្លីនៅ Website', PUBLIC_BASE_URL)]);

  await ctx.reply(
    `🎞️ <b>រឿងវែង — ${BRAND_NAME}</b>\n\nជ្រើសរឿងខាងក្រោម ដើម្បីមើលក្នុង Telegram។ រឿងខ្លីស្ថិតនៅ Website។`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
}

async function syncBotProfile(bot) {
  const description = `${BRAND_NAME} — រឿងវែងមើលក្នុង Telegram • រឿងខ្លីមើលនៅ Website។`;
  const shortDescription = `${BRAND_NAME} | AI Drama`;
  const languages = [undefined, 'en', 'km'];

  const tasks = [];
  for (const languageCode of languages) {
    const lang = languageCode ? { language_code: languageCode } : {};
    tasks.push(bot.telegram.callApi('setMyName', { name: BRAND_NAME, ...lang }));
    tasks.push(bot.telegram.callApi('setMyDescription', { description, ...lang }));
    tasks.push(bot.telegram.callApi('setMyShortDescription', { short_description: shortDescription, ...lang }));
  }

  tasks.push(bot.telegram.setMyCommands([
    { command: 'start', description: 'ចាប់ផ្តើម' },
    { command: 'catalog', description: 'មើលរឿងវែង' },
    { command: 'myid', description: 'មើល Telegram Chat ID របស់ខ្ញុំ' },
    { command: 'help', description: 'របៀបប្រើ' }
  ]));

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) {
    console.error('[telegram-profile]', failed.map((item) => item.reason?.message || String(item.reason)).join(' | '));
  } else {
    console.log(`[telegram-profile] synced as ${BRAND_NAME}`);
  }
}

function startTelegram() {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN is missing. Telegram bot is disabled; web store still runs.');
    return null;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    await syncBotProfile(bot);
    await ctx.reply(
      `🎬 <b>សូមស្វាគមន៍មកកាន់ ${BRAND_NAME}</b>\n\n🎞️ រឿងវែង → មើលក្នុង Telegram\n🌐 រឿងខ្លី → មើលនៅ Website\n\nជ្រើសប៊ូតុងខាងក្រោម។`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.command('catalog', showCatalog);
  bot.command('myid', async (ctx) => {
    await ctx.reply(
      `🆔 Telegram Chat ID របស់អ្នក៖\n<code>${ctx.chat.id}</code>\n\nCopy លេខនេះទៅ Render → Environment → TELEGRAM_STORAGE_CHAT_ID។`,
      { parse_mode: 'HTML' }
    );
  });
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `💬 <b>របៀបប្រើ ${BRAND_NAME}</b>\n\n1) ចង់មើលរឿងវែង → ចុច “រឿងវែងក្នុង Telegram”\n2) ចង់មើលរឿងខ្លី → ចុច “រឿងខ្លីនៅ Website”\n3) Admin អាច Upload Cover/Trailer/Full Video ពី Web ហើយ File ត្រូវបានរក្សាទុកក្នុង Telegram។\n4) វាយ /myid ដើម្បីយក Chat ID សម្រាប់ Telegram Storage។`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    await showCatalog(ctx);
  });

  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('💬 រឿងវែងនៅ Telegram • រឿងខ្លីនៅ Website។', mainMenu());
  });

  bot.action('not_ready', async (ctx) => {
    await ctx.answerCbQuery('រឿងនេះមិនទាន់មាន Telegram Link ទេ។', { show_alert: true });
  });

  bot.catch((err) => console.error('[telegram]', err));

  syncBotProfile(bot).catch((err) => console.error('[telegram-profile]', err.message));

  bot.launch()
    .then(() => console.log(`[telegram] ${BRAND_NAME} bot started as @${TELEGRAM_BOT_USERNAME}`))
    .catch((err) => console.error('[telegram-launch]', err.message));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

module.exports = startTelegram();
