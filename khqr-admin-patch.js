const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { BakongKHQR, khqrData, IndividualInfo } = require('bakong-khqr');

const originalListen = express.application.listen;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function makeRealKhqr(amount) {
  const accountId = String(process.env.BAKONG_ACCOUNT_ID || '').trim();
  if (!accountId) throw new Error('BAKONG_ACCOUNT_ID is not configured.');

  const testMode = /^true$/i.test(String(process.env.BAKONG_TEST_MODE || 'false').trim());
  if (testMode) throw new Error('BAKONG_TEST_MODE must be false for real KHQR.');

  const merchantName = String(process.env.BAKONG_MERCHANT_NAME || 'iDrama.ai').trim() || 'iDrama.ai';
  const merchantCity = String(process.env.BAKONG_MERCHANT_CITY || 'PHNOM PENH').trim() || 'PHNOM PENH';
  const storeLabel = String(process.env.BAKONG_STORE_LABEL || 'iDrama.ai').trim() || 'iDrama.ai';
  const mobileNumber = String(process.env.BAKONG_MOBILE_NUMBER || '').trim();
  const expirationTimestamp = Date.now() + 10 * 60 * 1000;
  const billNumber = `IDR-${Date.now().toString(36).toUpperCase()}`.slice(0, 25);

  const optionalData = {
    currency: khqrData.currency.khr,
    amount: Number(amount),
    billNumber,
    storeLabel,
    terminalLabel: 'ADMIN',
    expirationTimestamp,
    merchantCategoryCode: '5999'
  };
  if (mobileNumber) optionalData.mobileNumber = mobileNumber;

  // Bakong SDK signature:
  // new IndividualInfo(accountId, merchantName, merchantCity, optionalData)
  // Currency belongs inside optionalData. Passing 116 as the second argument makes
  // banking apps read "116" as the merchant name.
  const info = new IndividualInfo(accountId, merchantName, merchantCity, optionalData);

  const khqr = new BakongKHQR();
  const response = khqr.generateIndividual(info);
  if (!response || response.status?.code !== 0 || !response.data?.qr || !response.data?.md5) {
    throw new Error(response?.status?.message || 'KHQR generation failed.');
  }

  return {
    qr: response.data.qr,
    md5: response.data.md5,
    expiresAt: expirationTimestamp,
    merchantName,
    accountId,
    billNumber
  };
}

express.application.listen = function patchedListen(...args) {
  if (!this.locals.__realKhqrAdminRoute) {
    this.locals.__realKhqrAdminRoute = true;

    this.post('/api/admin/khqr/generate', async (req, res) => {
      const adminPassword = String(process.env.ADMIN_PASSWORD || '');
      if (!adminPassword) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
      if (!safeEqual(req.get('x-admin-password'), adminPassword)) return res.status(401).json({ error: 'Password is incorrect.' });

      const amount = Number(req.body?.amount);
      if (!Number.isInteger(amount) || amount < 100 || amount > 100000000) {
        return res.status(400).json({ error: 'ចំនួនទឹកប្រាក់ត្រូវចាប់ពី 100៛ ដល់ 100,000,000៛។' });
      }

      try {
        const data = makeRealKhqr(amount);
        const qrDataUrl = await QRCode.toDataURL(data.qr, {
          width: 720,
          margin: 2,
          errorCorrectionLevel: 'M'
        });
        res.set('Cache-Control', 'no-store');
        return res.json({
          ok: true,
          real: true,
          currency: 'KHR',
          amount,
          merchantName: data.merchantName,
          billNumber: data.billNumber,
          md5: data.md5,
          expiresAt: data.expiresAt,
          qrDataUrl
        });
      } catch (error) {
        console.error('[admin-real-khqr]', error.message);
        return res.status(500).json({ error: error.message || 'មិនអាចបង្កើត KHQR ពិតបាន។' });
      }
    });
  }

  return originalListen.apply(this, args);
};
