require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://idramame.onrender.com').replace(/\/$/, '');
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
    [Markup.button.url('🌐 បើក iDrama.me', PUBLIC_BASE_URL)],
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
    '📚 <b>iDrama.me — រឿងខ្លីៗ</b>\n\nជ្រើសរឿងខាងក្រោម ដើម្បីទៅមើល Trailer និងទិញរឿងពេញនៅលើ Website។',
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
      '🎬 <b>សូមស្វាគមន៍មកកាន់ iDrama.me</b>\n\nមើលរឿងខ្លីៗ និង Trailer តាម Telegram ហើយចូល Website សម្រាប់ Bakong KHQR និង Watch Page រឿងពេញ។',
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.command('catalog', showCatalog);
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '💬 <b>របៀបប្រើ</b>\n\n1) ចុច “មើលរឿង”\n2) ជ្រើសរឿង\n3) បើក iDrama.me\n4) មើល Trailer\n5) ទិញតាម Bakong KHQR នៅលើ Website\n6) បង់ជោគជ័យ → បើក Watch Page រឿងពេញ។',
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    await showCatalog(ctx);
  });

  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('💬 Telegram សម្រាប់មើល Catalog/នាំទៅ Website។ ការទិញ និង Watch រឿងពេញធ្វើនៅ iDrama.me។', mainMenu());
  });

  bot.catch((err) => console.error('[telegram]', err));

  bot.telegram.setMyCommands([
    { command: 'start', description: 'ចាប់ផ្តើម' },
    { command: 'catalog', description: 'មើលរឿងទាំងអស់' },
    { command: 'help', description: 'របៀបប្រើ' }
  ]).catch((err) => console.error('[telegram-commands]', err.message));

  bot.launch()
    .then(() => console.log('[telegram] iDrama.me bot started'))
    .catch((err) => console.error('[telegram-launch]', err.message));

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

module.exports = startTelegram();
