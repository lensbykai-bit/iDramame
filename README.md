# iDramaAi

Platform សម្រាប់កម្ពុជា៖ **រឿងខ្លីមើលនៅ Website** និង **រឿងវែងមើលក្នុង Telegram**។ Web Admin អាច Upload Cover, Trailer និង Full Video របស់រឿងខ្លីពីកុំព្យូទ័រ/ទូរស័ព្ទដោយផ្ទាល់ ហើយ Server ផ្ញើ File ទៅ Telegram Bot ដើម្បីរក្សាទុកជា `file_id`។

## Flow

### រឿងខ្លី
Web Admin → ជ្រើស Cover/Trailer/Full Video → Upload ទៅ Telegram → រក្សា Telegram file_id ក្នុង `stories.json` → Website បង្ហាញ Cover/Trailer → Bakong KHQR → Signed Watch Page → Full Video។

### រឿងវែង
Upload Video/Post នៅ Telegram → Copy Telegram Post Link → Web Admin ជ្រើស `Telegram` → Paste Link → Bot Catalog បង្ហាញរឿងវែង។

## មុខងាររួចរាល់

- Website បង្ហាញតែរឿងខ្លី
- Telegram Bot បង្ហាញតែរឿងវែង
- Web Admin ជ្រើស `Web` ឬ `Telegram`
- Cover Image Upload → Telegram
- Trailer Video Upload → Telegram
- Full Video Upload → Telegram
- មិនចាំបាច់រក Cover/Trailer/Full Video URL ដោយដៃ
- Bakong KHQR checkout សម្រាប់រឿងខ្លីក្នុង Web
- Payment verification មុន Unlock
- Signed Watch Link មានសុពលភាពកំណត់
- Order Watermark លើ Watch Player
- Full Video file_id មិនបង្ហាញក្នុង Public Catalog API
- Telegram Bot `/start`, `/catalog`, `/myid`, `/help`

## Production

- Website: `https://idramaai.onrender.com`
- Admin: `https://idramaai.onrender.com/admin.html`
- Telegram: `@iDramaAiBot`

## Telegram Storage Setup

1. បើក `@iDramaAiBot` ហើយវាយ `/myid`។
2. Bot នឹងផ្តល់ Telegram Chat ID ជាលេខ។
3. ទៅ Render → Environment → បន្ថែម៖

```env
TELEGRAM_STORAGE_CHAT_ID=លេខដែល /myid ផ្តល់
```

4. `BOT_TOKEN` ត្រូវជ Token របស់ Bot ថ្មី `@iDramaAiBot`។
5. Save, rebuild, and deploy។

ពេល Admin Upload File របស់រឿងខ្លី Bot នឹងផ្ញើ File ទៅ Chat នេះ ហើយ Server រក្សា `file_id` សម្រាប់ Website។

## Render Environment Variables

```env
BRAND_NAME=iDramaAi
BOT_TOKEN=
TELEGRAM_BOT_USERNAME=iDramaAiBot
TELEGRAM_STORAGE_CHAT_ID=
PUBLIC_BASE_URL=https://idramaai.onrender.com

BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=iDramaAi
BAKONG_STORE_LABEL=iDramaAi
BAKONG_MERCHANT_CITY=PHNOM PENH
BAKONG_MOBILE_NUMBER=
BAKONG_API_BASE_URL=https://api-bakong.nbc.gov.kh
BAKONG_TOKEN=

ACCESS_TOKEN_SECRET=
ADMIN_PASSWORD=

GITHUB_TOKEN=
GITHUB_REPO=lensbykai-bit/iDramame
GITHUB_BRANCH=main
PORT=3000
```

កុំ Commit Secret ទៅ GitHub។ Secret ទាំងអស់ដាក់នៅ Render Environment ប៉ុណ្ណោះ។

## Admin

### Web — រឿងខ្លី

- ចំណងជើង
- Preview / Description
- តម្លៃ KHR
- Upload Cover Image
- Upload Trailer Video
- Upload Full Video

### Telegram — រឿងវែង

- ចំណងជើង
- Preview / Description
- Telegram Video/Post Link

## Security

- BOT_TOKEN, Bakong Token, Admin Password និង GitHub Token រក្សាទុកក្នុង Render Environment
- Public Catalog មិនបញ្ជូន Full Video file_id
- Watch Page ត្រូវការ Signed Token
- Full Video stream តាម Server proxy
- Player បិទ download control តាម Browser UI និងបង្ហាញ Order Watermark
- មិនមាន Web DRM ណាអាចរារាំងការថតអេក្រង់ដោយឧបករណ៍ផ្សេងបាន 100%

## Deploy

Project ប្រើ Node.js + Render។ `npm start` បើក Web Server និង Telegram Bot ជាមួយគ្នា។ Render Auto Deploy ពេល branch `main` មាន commit ថ្មី។
