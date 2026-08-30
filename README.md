# iDramaAi

Platform សម្រាប់កម្ពុជា៖ **រឿងខ្លីមើលនៅ Website** និង **រឿងវែងមើលក្នុង Telegram**។

## Flow

### រឿងខ្លី
Web Admin → ជ្រើស Cover/Trailer/Full Video → Upload ទៅ Telegram → រក្សា Telegram `file_id` → Website បង្ហាញ Cover/Trailer → Bakong KHQR → Signed Watch Page → Full Video។

### រឿងវែង / Full Movie ធំៗ
Web Admin → ជ្រើស `Telegram` → ដាក់ Title/Preview/Price + Cover/Trailer → Save → ចូល `@iDramaAiBot` → `/adminmovies` → ជ្រើសរឿង → ផ្ញើ Full Movie ជា Video ឬ File មក Bot ដោយផ្ទាល់ → Bot រក្សា `file_id` និង Metadata ទៅ `stories.json`/GitHub → អ្នកមើលចុច Full Movie ក្នុង Bot។

Full Movie ធំៗមិន Upload ឆ្លងកាត់ Render ទេ។ វាត្រូវផ្ញើពី Telegram app ទៅ Bot ដោយផ្ទាល់ ដើម្បីជៀស Web/Bot HTTP multipart upload limit។

## មុខងាររួចរាល់

- Website បង្ហាញតែរឿងខ្លី
- Telegram Bot បង្ហាញតែរឿងវែង
- Web Admin ជ្រើស `Web` ឬ `Telegram`
- Cover Image Upload → Telegram
- Trailer Video Upload → Telegram
- Full Video រឿងខ្លី Upload → Telegram
- Full Movie ធំៗ → ផ្ញើទៅ Bot ដោយផ្ទាល់
- Bot `/adminmovies` សម្រាប់ភ្ជាប់ Full Movie ទៅរឿង
- Bot `/cancelupload` សម្រាប់បោះបង់ការភ្ជាប់
- Bot រក្សា `full_video_file_id`, file size, filename និង mime type
- Bakong KHQR checkout សម្រាប់រឿងខ្លីក្នុង Web
- Payment verification មុន Unlock
- Signed Watch Link មានសុពលភាពកំណត់
- Order Watermark លើ Watch Player
- Full Video file_id មិនបង្ហាញក្នុង Public Catalog API

## Production

- Website: `https://idramaai.onrender.com`
- Admin: `https://idramaai.onrender.com/admin.html`
- Telegram: `@iDramaAiBot`

## Telegram Storage Setup

1. បើក `@iDramaAiBot` ហើយវាយ `/myid`។
2. Copy Telegram Chat ID។
3. ទៅ Render → Environment → បន្ថែម៖

```env
TELEGRAM_STORAGE_CHAT_ID=លេខដែល /myid ផ្តល់
```

4. `BOT_TOKEN` ត្រូវជា Token របស់ `@iDramaAiBot`។
5. `GITHUB_TOKEN` ត្រូវមាន Contents: Read and write ដើម្បីឲ្យ Bot រក្សា Metadata Full Movie ទៅ GitHub។
6. Save, rebuild, and deploy។

## របៀប Upload Full Movie ធំៗ

1. បង្កើតរឿងវែងក្នុង Web Admin ហើយ Save មុន។
2. ចូល `@iDramaAiBot`។
3. វាយ `/adminmovies`។
4. ជ្រើសឈ្មោះរឿង។
5. ផ្ញើ Full Movie ជា Video ឬ File មក Bot ដោយផ្ទាល់។
6. Bot បង្ហាញ `ភ្ជាប់ Full Movie ជោគជ័យ` ហើយរក្សា Metadata ទៅ GitHub។
7. `/catalog` → ជ្រើសរឿង → `មើល Full Movie`។

ការផ្ញើ File ធំៗនៅតែអាស្រ័យលើដែនកំណត់ File របស់ Telegram account/app របស់អ្នក។

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

## Security

- BOT_TOKEN, Bakong Token, Admin Password និង GitHub Token រក្សាទុកក្នុង Render Environment
- Command `/adminmovies` អនុញ្ញាតតែ Chat ID ដែលត្រូវនឹង `TELEGRAM_STORAGE_CHAT_ID`
- Public Catalog មិនបញ្ជូន Full Video file_id
- Watch Page ត្រូវការ Signed Token
- Player បិទ download control តាម Browser UI និងបង្ហាញ Order Watermark

## Deploy

Project ប្រើ Node.js + Render។ `npm start` បើក Web Server និង Telegram Bot ជាមួយគ្នា។ Render Auto Deploy ពេល branch `main` មាន commit ថ្មី។