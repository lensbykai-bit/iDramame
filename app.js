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

// Register the protected real KHQR generator before the main Express app starts.
require('./khqr-admin-patch');

// Customer checkout and paid viewing run on the website.
// Telegram is used for the public Channel, discovery, and admin publishing.
require('./server');
const { startTelegramBot } = require('./telegram');
startTelegramBot();
