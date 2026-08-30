# iDramaAi — Telegram Channel + Website Store

This project uses Telegram Channel for discovery/promotion and the iDramaAi website for Bakong KHQR checkout and paid viewing.

## Customer flow

Telegram Channel post → `🛒 ទិញរឿងនេះ` → Website story modal → Bakong KHQR → payment verification → protected Watch Page.

## Required Render environment variables

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

## Telegram setup

1. Add `@iDramaAi_bot` as an administrator of the Telegram Channel.
2. Allow the bot to post messages.
3. Put the public channel username (for example `@iDramaKh`) in `TELEGRAM_CHANNEL_ID`.
4. Put the matching link (for example `https://t.me/iDramaKh`) in `TELEGRAM_CHANNEL_URL`.
5. Open the bot and send `/myid`; copy the numeric Chat ID into `ADMIN_TELEGRAM_ID` and `TELEGRAM_STORAGE_CHAT_ID`.
6. Restart/redeploy Render.

## Admin workflow

1. Open `/admin.html` and add a story.
2. Upload Cover, Trailer and Full Movie.
3. Open `@iDramaAi_bot` and send `/postmovie`.
4. Choose a story.
5. The bot posts it to the Telegram Channel with a `🛒 ទិញរឿងនេះ` button linked to the exact story on the website.

## Security

- Do not commit BOT_TOKEN, Bakong Token, GitHub Token, Admin Password, or signing secret.
- Full Movie is not listed in the public catalog API.
- Paid Watch links are signed and time limited.
- Use only videos/content you own or have permission to distribute.
