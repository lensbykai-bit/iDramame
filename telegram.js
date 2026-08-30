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

function moneyKHR(amount) {
  return `${Number(amount || 0).toLocaleString('en-US')}៛`;
}

function escHtml(value='') {
  return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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

  const rows = stories.map((story, index) => {
    if (story.full_video_file_id || story.preview_video_file_id || story.cover_file_id) {
      return [Markup.button.callback(`▶️ ${story.title}`, `story:${index}`)];
    }
    if (story.telegram_url) {
      return [Markup.button.url(`▶️ ${story.title}`, story.telegram_url)];
    }
    return [Markup.button.callback(`⏳ ${story.title}`, 'not_ready')];
  });
  rows.push([Markup.button.url('🌐 មើលរឿងខ្លីនៅ Website', PUBLIC_BASE_URL)]);

  await ctx.reply(
    `🎞️ <b>រឿងវែង — ${BRAND_NAME}</b>\n\nជ្រើសរឿងខាងក្រោម ដើម្បីមើល Cover, Trailer និង Full Movie ក្នុង Telegram។`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(rows) }
  );
}

async function sendVideoOrDocument(ctx, fileId, caption) {
  if (!fileId) return false;
  try {
    await ctx.replyWithVideo(fileId, { caption, supports_streaming: true });
    return true;
  } catch (videoError) {
    try {
      await ctx.replyWithDocument(fileId, { caption });
      return true;
    } catch (documentError) {
      console.error('[telegram-media-send]', videoError.message, '|', documentError.message);
      throw documentError;
    }
  }
}

async function showStoryDetails(ctx, index) {
  const stories = longStories();
  const story = stories[index];
  if (!story) return ctx.reply('រកមិនឃើញរឿងនេះទេ។', mainMenu());

  const caption = `🎬 <b>${escHtml(story.title)}</b>\n💰 ${moneyKHR(story.price_khr)}\n\n${escHtml(story.preview || '')}`;
  const buttons = [];
  if (story.preview_video_file_id) buttons.push([Markup.button.callback('🎞️ មើល Trailer', `trailer:${index}`)]);
  if (story.full_video_file_id) buttons.push([Markup.button.callback('▶️ មើល Full Movie', `full:${index}`)]);
  if (story.telegram_url) buttons.push([Markup.button.url('🔗 បើក Telegram Post ចាស់', story.telegram_url)]);
  buttons.push([Markup.button.url('🌐 រឿងខ្លីនៅ Website', PUBLIC_BASE_URL)]);

  if (story.cover_file_id) {
    try {
      await ctx.replyWithPhoto(story.cover_file_id, {
        caption,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
      });
      return;
    } catch (error) {
      console.error('[telegram-cover]', error.message);
    }
  }

  await ctx.reply(caption, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function sendTrailer(ctx, index) {
  const story = longStories()[index];
  if (!story?.preview_video_file_id) {
    return ctx.answerCbQuery('រឿងនេះមិនទាន់មាន Trailer ទេ។', { show_alert: true });
  }
  await ctx.answerCbQuery('កំពុងផ្ញើ Trailer…');
  await sendVideoOrDocument(ctx, story.preview_video_file_id, `🎞️ Trailer • ${story.title}`);
}

async function sendFullMovie(ctx, index) {
  const story = longStories()[index];
  if (!story?.full_video_file_id) {
    return ctx.answerCbQuery('រឿងនេះមិនទាន់មាន Full Movie ទេ។', { show_alert: true });
  }
  await ctx.answerCbQuery('កំពុងផ្ញើ Full Movie…');
  await sendVideoOrDocument(ctx, story.full_video_file_id, `🎬 ${story.title} • Full Movie`);
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
      `💬 <b>របៀបប្រើ ${BRAND_NAME}</b>\n\n1) រឿងវែង → ចុច “រឿងវែងក្នុង Telegram”\n2) ជ្រើសរឿង → មើល Trailer ឬ Full Movie ក្នុង Bot\n3) រឿងខ្លី → ចុច “រឿងខ្លីនៅ Website”\n4) Admin Upload Cover/Trailer/Full Movie ដោយផ្ទាល់ មិនចាំបាច់មាន Link។`,
      { parse_mode: 'HTML', ...mainMenu() }
    );
  });

  bot.action('catalog', async (ctx) => {
    await ctx.answerCbQuery();
    await showCatalog(ctx);
  });

  bot.action(/^story:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showStoryDetails(ctx, Number(ctx.match[1]));
  });

  bot.action(/^trailer:(\d+)$/, async (ctx) => {
    await sendTrailer(ctx, Number(ctx.match[1]));
  });

  bot.action(/^full:(\d+)$/, async (ctx) => {
    await sendFullMovie(ctx, Number(ctx.match[1]));
  });

  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('💬 រឿងវែងនៅ Telegram • រឿងខ្លីនៅ Website។', mainMenu());
  });

  bot.action('not_ready', async (ctx) => {
    await ctx.answerCbQuery('រឿងនេះមិនទាន់មាន Media ទេ។', { show_alert: true });
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
