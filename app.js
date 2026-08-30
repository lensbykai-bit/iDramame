require('dotenv').config();

const legacyBrandNames = ['ខ្ញុំចង់មើលរឿងអេអាយ', 'iDrama.me', 'AI STORY KH'];
const currentBrand = String(process.env.BRAND_NAME || '').trim();
if (!currentBrand || legacyBrandNames.some((name) => name.toLowerCase() === currentBrand.toLowerCase())) {
  process.env.BRAND_NAME = 'iDramaAi';
}

const currentStoreLabel = String(process.env.BAKONG_STORE_LABEL || '').trim();
if (!currentStoreLabel || legacyBrandNames.some((name) => name.toLowerCase() === currentStoreLabel.toLowerCase())) {
  process.env.BAKONG_STORE_LABEL = 'iDramaAi';
}

const currentMerchant = String(process.env.BAKONG_MERCHANT_NAME || '').trim();
if (!currentMerchant || legacyBrandNames.some((name) => name.toLowerCase() === currentMerchant.toLowerCase())) {
  process.env.BAKONG_MERCHANT_NAME = 'iDramaAi';
}

require('./server');
require('./telegram');
