require('dotenv').config();

process.env.BRAND_NAME = process.env.BRAND_NAME || 'ខ្ញុំចង់មើលរឿងអេអាយ';
process.env.BAKONG_STORE_LABEL = process.env.BAKONG_STORE_LABEL || 'AI STORY KH';
if (!process.env.BAKONG_MERCHANT_NAME || process.env.BAKONG_MERCHANT_NAME.trim().toLowerCase() === 'idrama.me') {
  process.env.BAKONG_MERCHANT_NAME = 'AI STORY KH';
}

require('./server');
require('./telegram');
