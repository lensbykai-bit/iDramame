# iDramaAi

iDramaAi សម្រាប់កម្ពុជា៖ **Telegram Channel សម្រាប់ផ្សព្វផ្សាយរឿង** + **Website Store សម្រាប់ Bakong KHQR និងមើល Full Movie ក្រោយបង់**។

## Customer Flow

```text
Telegram Channel
  ↓ Poster / Preview / Price
🛒 ទិញរឿងនេះ
  ↓
iDramaAi Website Store
  ↓
Bakong KHQR
  ↓
Verify Payment
  ↓
🔓 Protected Watch Page
```

## មុខងារសំខាន់ៗ

- Telegram Channel សម្រាប់ Poster, Preview, តម្លៃ និងប៊ូតុងទិញ
- Telegram Bot `@iDramaAi_bot` សម្រាប់ Admin Post រឿងទៅ Channel
- Website Catalog សម្រាប់រឿងទាំងអស់
- Trailer អាចមើលមុនបង់
- Dynamic Bakong KHQR សម្រាប់ Order នីមួយៗ
- Bakong Open API verification មុន Unlock
- Full Movie មិនបង្ហាញក្នុង Public Catalog API
- Signed Watch Link មានសុពលភាពកំណត់
- Order Watermark នៅ Watch Player
- Telegram ប្រើជាកន្លែង private media storage សម្រាប់ Cover/Trailer/Full Movie
- Web Admin សម្រាប់ Upload និងគ្រប់គ្រងរឿង

## Production

- Website: `https://idramaai.onrender.com`
- Admin: `https://idramaai.onrender.com/admin.html`
- Telegram Bot: `@iDramaAi_bot`

## 1. Telegram Channel Setup

1. បង្កើត Telegram Channel របស់ iDramaAi។
2. Add `@iDramaAi_bot` ជា Administrator។
3. បើកសិទ្ធិ **Post Messages**។
4. បើ Channel Public មាន username ឧ. `@iDramaKh`, ដាក់តម្លៃនេះក្នុង Render:

```env
TELEGRAM_CHANNEL_ID=@iDramaKh
TELEGRAM_CHANNEL_URL=https://t.me/iDramaKh
```

Private Channel អាចប្រើ numeric ID ទម្រង់ `-100...` សម្រាប់ `TELEGRAM_CHANNEL_ID`។

## 2. Admin Telegram ID

1. បើក `@iDramaAi_bot`។
2. វាយ `/myid`។
3. Copy numeric Telegram User ID។
4. ដាក់ក្នុង Render:

```env
ADMIN_TELEGRAM_ID=123456789
TELEGRAM_STORAGE_CHAT_ID=123456789
```

`ADMIN_TELEGRAM_ID` កំណត់ថាអ្នកណាអាចប្រើ `/postmovie`។

## 3. Upload រឿង

ចូល Admin:

```text
https://idramaai.onrender.com/admin.html
```

បញ្ចូល៖

- Title
- Preview / Description
- Price KHR
- Cover Image
- Trailer Video
- Full Movie

Web upload limit បច្ចុប្បន្ន 45 MB។ សម្រាប់វីដេអូធំ គួរប្រើ private media URL/storage ដែលសមស្រប ហើយរក្សាសិទ្ធិចែកចាយឲ្យបានត្រឹមត្រូវ។

## 4. Post រឿងទៅ Telegram Channel

នៅ Bot វាយ៖

```text
/postmovie
```

Bot បង្ហាញបញ្ជីរឿងពី Website Store។ ចុចរឿងដែលត្រូវ Post។ Bot នឹងផ្ញើទៅ Channel៖

- Cover
- Title
- Description
- Price
- `🎞️ មើល Trailer / Preview`
- `🛒 ទិញរឿងនេះ`

ប៊ូតុងទាំងពីរបើករឿងជាក់លាក់នៅ Website ដោយ URL ទម្រង់៖

```text
https://idramaai.onrender.com/?story=STORY_ID
```

## 5. Bakong KHQR

Required settings:

```env
BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=iDramaAi
BAKONG_STORE_LABEL=iDramaAi
BAKONG_MERCHANT_CITY=PHNOM PENH
BAKONG_MOBILE_NUMBER=
BAKONG_API_BASE_URL=https://api-bakong.nbc.gov.kh
BAKONG_TOKEN=
BAKONG_TEST_MODE=false
```

Flow៖ Website បង្កើត Order → Generate KHQR → អតិថិជន Scan → Server ពិនិត្យ transaction ដោយ MD5 → ប្រៀបធៀប Amount/Currency/Receiver → Paid → បើក Signed Watch Page។

អាចដាក់ `BAKONG_TEST_MODE=true` សម្រាប់សាក UI ដោយមិនកាត់លុយពិត។ ត្រូវប្តូរទៅ `false` មុនទទួលការបង់ប្រាក់ពិត។

## 6. Full Render Environment

```env
BRAND_NAME=iDramaAi
BOT_TOKEN=
TELEGRAM_BOT_USERNAME=iDramaAi_bot
TELEGRAM_CHANNEL_ID=@your_channel_username
TELEGRAM_CHANNEL_URL=https://t.me/your_channel_username
ADMIN_TELEGRAM_ID=
TELEGRAM_STORAGE_CHAT_ID=
PUBLIC_BASE_URL=https://idramaai.onrender.com

BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=iDramaAi
BAKONG_STORE_LABEL=iDramaAi
BAKONG_MERCHANT_CITY=PHNOM PENH
BAKONG_MOBILE_NUMBER=
BAKONG_API_BASE_URL=https://api-bakong.nbc.gov.kh
BAKONG_TOKEN=
BAKONG_TEST_MODE=false

ACCESS_TOKEN_SECRET=
ADMIN_PASSWORD=

GITHUB_TOKEN=
GITHUB_REPO=lensbykai-bit/iDramame
GITHUB_BRANCH=main
PORT=3000
```

## Security

- កុំ Commit `BOT_TOKEN`, `BAKONG_TOKEN`, `GITHUB_TOKEN`, `ADMIN_PASSWORD` ឬ `ACCESS_TOKEN_SECRET` ទៅ GitHub។
- Secrets ដាក់ទាំងអស់ក្នុង Render Environment។
- `/postmovie` អនុញ្ញាតតែ `ADMIN_TELEGRAM_ID`។
- Public Catalog មិនបញ្ចូន Full Movie file ID។
- Watch Page ត្រូវការ Signed Token។
- ដាក់លក់តែរឿង/វីដេអូដែលអ្នកមានសិទ្ធិចែកចាយ ឬជាមាតិកាដែលអ្នកបង្កើតផ្ទាល់។

## Deploy

Project ប្រើ Node.js + Render។ `npm start` បើក Website Server និង Telegram Bot ជាមួយគ្នា។ Render អាច Auto Deploy ពេល branch `main` មាន commit ថ្មី។
