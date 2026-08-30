require('dotenv').config();

const TARGET_BRAND = 'iDramaAi';
const legacyBrandNames = [
  'ខ្ញុំចង់មើលរឿងអេអាយ',
  'iDrama.me',
  'AI STORY KH',
  'iDrama Ai',
  'idrama ai'
];

const currentBrand = String(process.env.BRAND_NAME || '').trim();
if (!currentBrand || currentBrand.toLowerCase() !== TARGET_BRAND.toLowerCase()) {
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

require('./server');
require('./telegram');
