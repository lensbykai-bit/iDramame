# iDrama.me Telegram Story Store

Telegram bot សម្រាប់លក់រឿងខ្លីៗ/វីដេអូរឿងដោយប្រើ Bakong KHQR និងផ្ញើវីដេអូពេញជា Telegram Protected Content។

## មានរួច

- `/start` — ទំព័រដើម
- `/catalog` — មើលរឿងទាំងអស់
- `/purchased` — មើលរឿងដែលបានទិញ
- `/help` — របៀបទិញ
- បង្កើត Dynamic Bakong KHQR តាមតម្លៃរឿង
- ពិនិត្យការបង់តាម Bakong Open API `check_transaction_by_md5`
- ពិនិត្យ amount + currency + receiver account មុន Unlock
- ផ្ញើ Full Video ជាមួយ `protect_content: true`
- Admin អាចផ្ញើ Video ទៅ Bot ដើម្បីយក Telegram `file_id`

## Security

កុំ Commit secret ទៅ GitHub។ Secret ទាំងអស់ត្រូវដាក់ជា Environment Variables នៅ Server៖

```env
BOT_TOKEN=
ADMIN_TELEGRAM_ID=
BAKONG_ACCOUNT_ID=
BAKONG_MERCHANT_NAME=iDrama.me
BAKONG_MERCHANT_CITY=PHNOM PENH
BAKONG_MOBILE_NUMBER=
BAKONG_API_BASE_URL=https://api-bakong.nbc.gov.kh
BAKONG_TOKEN=
PORT=3000
```

`.env` ត្រូវបាន ignore រួច។

## រៀបចំ Local

```bash
npm install
cp .env.example .env
npm start
```

Windows អាច copy `.env.example` ទៅ `.env` ដោយដៃ។

## របៀបដាក់វីដេអូ

1. ដាក់ `ADMIN_TELEGRAM_ID` ជា Telegram User ID របស់ Admin។ អ្នកអាចចូល Bot ហើយវាយ `/myid` ដើម្បីមើល ID របស់ខ្លួន។
2. Restart Bot បន្ទាប់ពីដាក់ env។
3. Admin ផ្ញើ Full Video ទៅ Bot។ Bot នឹងឆ្លើយ `file_id`។
4. Copy `file_id` ទៅ `stories.json` ត្រង់ `full_video_file_id`។
5. សម្រាប់ Preview ក៏អាចដាក់ `preview_video_file_id` ដូចគ្នា។

## stories.json

```json
{
  "id": "story001",
  "title": "ឈ្មោះរឿង",
  "preview": "អត្ថបទ Preview",
  "price_khr": 5000,
  "preview_video_file_id": "",
  "full_video_file_id": ""
}
```

## Bakong KHQR

Bot បង្កើត KHQR ដោយ `bakong-khqr` SDK និងរក្សា MD5 សម្រាប់ Order នីមួយៗ។ ពេលអ្នកទិញចុចពិនិត្យ Bot ហៅ Bakong Open API ហើយ Unlock តែពេល៖

- transaction `responseCode === 0`
- currency = `KHR`
- amount ត្រូវនឹងតម្លៃ Order
- `toAccountId` ត្រូវនឹង `BAKONG_ACCOUNT_ID`

នេះជួយកុំឲ្យ transaction ផ្សេង ឬចំនួនលុយខុសត្រូវបានយកមក Unlock។

## Deploy

Repository មាន `render.yaml` សម្រាប់ Node web service។ បន្ទាប់ពី Deploy ត្រូវបញ្ចូល Environment Variables ខាងលើនៅ Server dashboard ហើយកុំដាក់ Secret ក្នុង repository។

## ចំណាំអំពី Database

Version ដំបូងនេះរក្សា Order/Purchase នៅ `data/store.json` ដើម្បីឲ្យងាយសាកល្បង។ សម្រាប់ Production 24/7 គួរប្តូរទៅ database (ឧ. PostgreSQL/Supabase) ដើម្បីកុំបាត់ទិន្នន័យពេល Server redeploy/restart។

## Content protection

`protect_content: true` ជួយទប់ការបញ្ជូនបន្ត និង Save តាម Telegram។ មិនមានប្រព័ន្ធណាអាចការពារការថតដោយឧបករណ៍ផ្សេងបាន 100% ទេ ដូច្នេះសម្រាប់ Version បន្ទាប់អាចបន្ថែម Buyer Watermark/Order ID លើវីដេអូ។
