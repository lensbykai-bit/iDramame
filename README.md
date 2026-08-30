# ខ្ញុំចង់មើលរឿងអេអាយ

Platform សម្រាប់មើល Trailer រឿង AI, ទិញរឿងពេញតាម Bakong KHQR និងមើល Full Video តាម Signed Watch Page។ Telegram Bot ប្រើសម្រាប់ Catalog និងនាំអ្នកមើលទៅ Website។

## មុខងារសំខាន់

- Website Catalog រឿង
- Trailer / Preview
- Bakong KHQR checkout នៅលើ Website
- Payment verification មុនបើករឿងពេញ
- Signed Watch Link + Order Watermark
- Web Admin សម្រាប់បន្ថែម/កែ/លុបរឿង
- Telegram Bot `/start`, `/catalog`, `/help`
- Telegram Bot នាំអ្នកមើលទៅ Website សម្រាប់ការទិញ និង Watch Full Video

## Security

កុំ Commit secret ទៅ GitHub។ Secret ទាំងអស់ត្រូវដាក់ជា Environment Variables នៅ Render៖

```env
BOT_TOKEN=
PUBLIC_BASE_URL=https://idramame.onrender.com
BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=
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

## Admin

Web Admin៖ `https://idramame.onrender.com/admin.html`

Admin អាចគ្រប់គ្រង៖
- ចំណងជើង
- Preview / Description
- តម្លៃ KHR
- Cover Image URL
- Trailer Video URL
- Full Video URL

## Flow

Telegram/Website → មើល Trailer → ទិញតាម Bakong KHQR នៅ Website → Server ពិនិត្យ Transaction → បើក Signed Watch Page → មើល Full Video។

## Deploy

Project ប្រើ Node.js + Render។ `npm start` បើក Web Server និង Telegram Catalog Bot ជាមួយគ្នា។

## Content protection

Full Video URL មិនត្រូវបានបង្ហាញក្នុង Public Catalog API ទេ។ Watch Page ប្រើ Signed Access Token និង Watermark Order។ មិនមាន Web DRM ណាអាចរារាំងការថតអេក្រង់ដោយឧបករណ៍ផ្សេងបាន 100% ទេ។
