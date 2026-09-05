require('dotenv').config();

const TARGET_BRAND = 'iDrama.ai';
const legacyBrandNames = [
  'ខ្ញុំចង់មើលរឿងអេអាយ',
  'iDrama.me',
  'AI STORY KH',
  'iDrama Ai',
  'idrama ai',
  'iDramaAi'
];

const currentBrand = String(process.env.BRAND_NAME || '').trim();
if (!currentBrand || legacyBrandNames.some((name) => name.toLowerCase() === currentBrand.toLowerCase())) {
  process.env.BRAND_NAME = TARGET_BRAND;
}

const currentStoreLabel = String(process.env.BAKONG_STORE_LABEL || '').trim();
if (!currentStoreLabel || legacyBrandNames.some((name) => name.toLowerCase() === currentStoreLabel.toLowerCase())) {
  process.env.BAKONG_STORE_LABEL = TARGET_BRAND;
}

const currentMerchant = String(process.env.BAKONG_MERCHANT_NAME || '').trim();
if (!currentMerchant || legacyBrandNames.some((name) => name.toLowerCase() === currentMerchant.toLowerCase())) {
  process.env.BAKONG_MERCHANT_NAME = TARGET_BRAND;
}

// Resilient media transport is installed before the Express server is loaded.
// Cover/Poster uses GitHub. Protected video uses Telegram first, with
// AES-256-GCM encrypted GitHub fallback when Telegram is missing/unavailable.
const mediaStorage = require('./media-storage-patch');

// Register admin KHQR + USD customer checkout routes before the main Express app starts.
require('./khqr-admin-patch');
require('./usd-checkout-patch');

// Movie + Series/Episode store server. server-v3 captures the temporary fallback
// media environment here so protected uploads can still work without Telegram.
require('./server-v3');

// Restore the real Telegram environment before the publishing bot is created.
mediaStorage.restoreTelegramEnvironment();
const { startTelegramBot } = require('./telegram');
startTelegramBot();
