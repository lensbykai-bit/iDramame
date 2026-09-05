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

// Media transport must be patched before the Express server is loaded.
// Cover/Poster drafts use GitHub-backed storage when available, while
// protected Trailer/Full Movie/Episode media remains private in Telegram.
require('./media-storage-patch');

// Register admin KHQR + USD customer checkout routes before the main Express app starts.
require('./khqr-admin-patch');
require('./usd-checkout-patch');

// Movie + Series/Episode store server.
require('./server-v3');
const { startTelegramBot } = require('./telegram');
startTelegramBot();
