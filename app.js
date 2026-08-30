require('dotenv').config();

process.env.BRAND_NAME = process.env.BRAND_NAME || 'iDramaAi';
process.env.BAKONG_STORE_LABEL = process.env.BAKONG_STORE_LABEL || 'iDramaAi';
if (!process.env.BAKONG_MERCHANT_NAME || ['idrama.me','ai story kh','ខ្ញុំចង់មើលរឿងអេអាយ'].includes(process.env.BAKONG_MERCHANT_NAME.trim().toLowerCase())) {
  process.env.BAKONG_MERCHANT_NAME = 'iDramaAi';
}

require('./server');
require('./telegram');
