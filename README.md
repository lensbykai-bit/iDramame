# ខ្ញុំចង់មើលរឿងអេអាយ

Platform សម្រាប់កម្ពុជា៖ មើល Trailer រឿង AI, ទិញរឿងពេញតាម Bakong KHQR និងមើល Full Video តាម Signed Watch Page។ Telegram Bot ប្រើសម្រាប់ Catalog និងនាំអ្នកមើលទៅ Website។

## Flow

Telegram / Website → មើល Trailer → ទិញតាម Bakong KHQR នៅ Website → Server ពិនិត្យ Transaction → បើក Signed Watch Page → មើល Full Video។

## មុខងាររួចរាល់

- Website Catalog រឿង
- Trailer / Preview
- Bakong KHQR checkout
- Payment verification មុន Unlock
- Signed Watch Link មានសុពលភាពកំណត់
- Order Watermark លើ Watch Player
- Full Video URL មិនបង្ហាញក្នុង Public Catalog API
- Web Admin សម្រាប់បន្ថែម/កែ/លុបរឿង
- Telegram Bot `/start`, `/catalog`, `/help`
- Telegram Bot កំណត់ Display Name/Description ទៅ «ខ្ញុំចង់មើលរឿងអេអាយ» ដោយស្វ័យប្រវត្តិពេល Server ចាប់ផ្តើម

## URLs

- Website: `https://idramame.onrender.com`
- Admin: `https://idramame.onrender.com/admin.html`
- Telegram username បច្ចុប្បន្ន: `@iDrama_Me_Bot`

URL និង Telegram username ខាងលើជាឈ្មោះបច្ចេកទេសរបស់ account/service ចាស់។ Brand ដែលអ្នកមើលឃើញក្នុង Website និង Bot គឺ «ខ្ញុំចង់មើលរឿងអេអាយ»។

## Render Environment Variables

កុំ Commit Secret ទៅ GitHub។ ដាក់នៅ Render Environment ប៉ុណ្ណោះ៖

```env
BRAND_NAME=ខ្ញុំចង់មើលរឿងអេអាយ
BOT_TOKEN=
PUBLIC_BASE_URL=https://idramame.onrender.com

BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=AI STORY KH
BAKONG_STORE_LABEL=AI STORY KH
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

Admin អាចគ្រប់គ្រង៖

- ចំណងជើង
- Preview / Description
- តម្លៃ KHR
- Cover Image URL
- Trailer Video URL
- Full Video URL

Full Video URL ត្រូវប្រើ URL ដែលអ្នកគ្រប់គ្រងបាន និងមិនគួរជា Public GitHub URL។

## Security

- Secret រក្សាទុកក្នុង Render Environment
- Full Video URL មិនបញ្ជូនទៅ Public Catalog
- Watch Page ត្រូវការ Signed Token
- Video ត្រូវ Stream តាម Server proxy
- Player បិទ download control តាម Browser UI និងបង្ហាញ Order Watermark
- មិនមាន Web DRM ណាអាចរារាំងការថតអេក្រង់ដោយឧបករណ៍ផ្សេងបាន 100%

## Deploy

Project ប្រើ Node.js + Render។ `npm start` បើក Web Server និង Telegram Catalog Bot ជាមួយគ្នា។ Render Auto Deploy ពេល branch `main` មាន commit ថ្មី។
