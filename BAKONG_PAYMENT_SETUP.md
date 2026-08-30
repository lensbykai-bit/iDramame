# iDramaAi — Bakong KHQR Production Setup

This project is already wired for dynamic Bakong KHQR and automatic transaction verification.

## 1. Required private values in Render

Open the Render service for `idramaai` and add these Environment Variables:

- `BAKONG_ACCOUNT_ID` — the exact Bakong account ID that should receive customer payments.
- `BAKONG_TOKEN` — Bakong Open API access token used to check transactions by MD5.
- `ACCESS_TOKEN_SECRET` — a long random secret. Set it once and keep it unchanged.

Do not commit any of these real values to GitHub.

## 2. Production values already configured by the repository

- `BAKONG_MERCHANT_NAME=iDramaAi`
- `BAKONG_STORE_LABEL=iDramaAi`
- `BAKONG_MERCHANT_CITY=PHNOM PENH`
- `BAKONG_API_BASE_URL=https://api-bakong.nbc.gov.kh`
- `BAKONG_TEST_MODE=false`

`BAKONG_MOBILE_NUMBER` is optional.

## 3. Checkout flow

1. Customer opens a story and clicks Bakong KHQR checkout.
2. Server generates a dynamic KHR KHQR with the story price.
3. Customer scans and pays.
4. Browser polls the checkout verification endpoint.
5. Server calls Bakong Open API `POST /v1/check_transaction_by_md5`.
6. Server verifies successful status, KHR currency, exact amount, and receiving Bakong account ID.
7. Purchase is saved to the signed-in customer's persistent My Library.
8. Customer receives protected Watch access.

## 4. Test before accepting real customers

After adding the private Render variables and redeploying:

- Open `/health` and confirm `checkout` is `true` and `bakongTestMode` is `false`.
- Sign in with a test customer account.
- Choose a low-priced test story.
- Generate KHQR and verify the amount/name shown in the banking app before paying.
- Make one real low-value test payment.
- Confirm the site automatically detects payment and the story appears in My Library.

## 5. Token renewal

Bakong Open API access tokens expire. Renew the token before expiration and replace only `BAKONG_TOKEN` in Render. Do not change `ACCESS_TOKEN_SECRET` during token renewal.

## Security

- Never put `BAKONG_TOKEN` in frontend JavaScript, HTML, screenshots, or a public GitHub repository.
- Never accept a payment as successful based only on a screenshot or a client-side button.
- The server must verify the transaction with Bakong Open API before unlocking paid content.
