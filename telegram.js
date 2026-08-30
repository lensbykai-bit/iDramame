require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const BRAND_NAME = process.env.BRAND_NAME || 'iDramaAi';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'iDramaAiBot';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://idramaai.onrender.com').replace(/\/$/, '');
const storiesPath = path.join(__dirname, 'stories.json');

function loadStories() {
  try {
    return JSON.parse(fs.readFileSync(storiesPath, 'utf8'));
  } catch {
    return [];
  }
}

function moneyKHR(amount) {
  return `${Number(amount || 0).toLocaleString('en-US')}៛`;
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎬 មើលរឿង', 'catalog')],
    [Markup.button.url(`🌐 បើក ${BRAND_NAME}`, PUBLIC_BASE_URL)],
    [Markup.button.callback('💬 ជំនួយ', 'help')]
  ]);
}

async function showCatalog(ctx) {
  const stories = loadStories();
  if (!stories.length) {
    return ctx.reply('📚 មិនទាន់មានរឿងនៅក្នុង Catalog ទេ។', mainMenu());
  }

  const rows = stories.map((story) => [
    Markup.button.url(
      `🎬 ${story.title} • ${moneyKHR(story.price_khr)}`,
      `${PUBLIC_BASE_URL}/?story=${encodeURIComponent(story.id)}`
    )
  ]);
  rows.push([Markup.button.url('🌐 មើលរឿងទាំងអស់លើ Website', PUBLIC_BASE_URL)]);

  await ctx.reply(
    `📚 <b>${BRAND_NAME}</b>\n\nជ្រើសរឿងខាងក្រោម ដើម្បីទៅមើល Trailer និងទិញរឿងពេញនៅលើ Website។`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
}

function startTelegram() {
  if (!BOT_TOKEN) {
    console.warn('[telegram] BOT_TOKEN is missing. Telegram bot is disabled; web store still runs.');
    return null;
  }

  const bot = new Telegraf(BOT_TOKEN);

  bot.start(async (ctx) => {
    await ctx.reply(
      `🎬 <b>សូមស្វាគមន៍មកកាន់ ${BRAND_NAME}</b>\n\nមើលរឿងខ្លីៗ និង Trailer តាម Telegram ហើយចូល Website សម្រាប់ Bakong KHQR និង Watch Page រឿងពេញ។`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.command('catalog', showCatalog);
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `💬 <b>របៀបប្រើ ${BRAND_NAME}</b>\n\n1) ចុច “មើលរឿង”\n2) ជ្រើសរឿង\n3) បើក Website\n4) មើល Trailer\n5) ទិញតាម Bakong KHQR នៅលើ Website\n6) បង់ជោគជ័យ → បើក Watch Page រឿងពេញ។`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    await showCatalog(ctx);
  });

  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('💬 Telegram សម្រាប់មើល Catalog និងនាំទៅ Website។ ការទិញ និង Watch រឿងពេញធ្វើនៅលើ Website។', mainMenu());
  });

  bot.catch((err) => console.error('[telegram]', err));

  Promise.all([
    bot.telegram.callApi('setMyName', { name: BRAND_NAME }),
    bot.telegram.callApi('setMyDescription', {
      description: `${BRAND_NAME} — មើល Trailer រឿងអេអាយ និងចូល Website សម្រាប់ទិញរឿងពេញ។`
    }),
    bot.telegram.callApi('setMyShortDescription', {
      short_description: `${BRAND_NAME} | AI Short Drama`
    }),
    bot.telegram.setMyCommands([
      { command: 'start', description: 'ចាប់ផ្តើម' },
      { command: 'catalog', description: 'មើលរឿងទាំងអស់' },
      { command: 'help', description: 'របៀបប្រើ' }
    ])
  ]).catch((err) => console.error('[telegram-profile]', err.message));

  bot.launch()
    .then(() => console.log(`[telegram] ${BRAND_NAME} bot started as @${TELEGRAM_BOT_USERNAME}`))
    .catch((err) => console.error('[telegram-launch]', err.message));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

module.exports = startTelegram();
