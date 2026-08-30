const CFG = window.IDRAMA_SUPABASE || {};
const EDGE_URL = CFG.checkoutFunction || (CFG.url ? `${CFG.url}/functions/v1/idrama-checkout` : '');
const API_KEY = CFG.publishableKey || '';

const loginBox = document.getElementById('loginBox');
const ordersBox = document.getElementById('ordersBox');
const passwordInput = document.getElementById('adminPassword');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const refreshBtn = document.getElementById('refreshBtn');
const ordersEl = document.getElementById('orders');
const realKhqrAmount = document.getElementById('realKhqrAmount');
const generateKhqrBtn = document.getElementById('generateKhqrBtn');
const khqrMakerStatus = document.getElementById('khqrMakerStatus');
const realKhqrResult = document.getElementById('realKhqrResult');
const realKhqrImage = document.getElementById('realKhqrImage');
const realKhqrAmountText = document.getElementById('realKhqrAmountText');
const realKhqrMerchant = document.getElementById('realKhqrMerchant');
const realKhqrBill = document.getElementById('realKhqrBill');

let adminPassword = sessionStorage.getItem('idrama_payment_admin_password') || '';

function esc(value = '') {
  return String(value).replace(/[&<>'\"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;' }[c]));
}

function money(value) {
  return `${Number(value || 0).toLocaleString('en-US')}៛`;
}

async function adminCall(action, payload = {}) {
  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: { apikey: API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, adminPassword, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'មិនអាចភ្ជាប់ប្រព័ន្ធ Payment Admin បាន។');
  return data;
}

function setQrCardMode(mode, data) {
  const badge = realKhqrResult?.querySelector('.real-badge');
  const caption = realKhqrResult?.querySelector('.pay-caption');
  const validity = realKhqrResult?.querySelector('.qr-info-grid .info-card:nth-child(4) strong');
  const network = realKhqrResult?.querySelector('.qr-info-grid .info-card:nth-child(3) strong');
  if (network) network.textContent = 'BAKONG KHQR';

  if (mode === 'direct') {
    if (badge) badge.textContent = '✓ DIRECT KHQR • KHR';
    if (caption) caption.textContent = 'ភ្ញៀវបញ្ចូលចំនួនទឹកប្រាក់ក្នុង App';
    realKhqrAmountText.textContent = 'ទទួលប្រាក់ផ្ទាល់';
    realKhqrBill.textContent = 'Permanent QR';
    if (validity) validity.textContent = 'ប្រើបានជាប្រចាំ';
  } else {
    if (badge) badge.textContent = '✓ REAL KHQR • KHR';
    if (caption) caption.textContent = 'ចំនួនទឹកប្រាក់';
    realKhqrAmountText.textContent = money(data.amount);
    realKhqrBill.textContent = data.billNumber || '-';
    if (validity) validity.textContent = '10 នាទី';
  }
}

async function generateRealKhqr() {
  const amount = Number(realKhqrAmount?.value || 0);
  if (!Number.isInteger(amount) || amount < 100) {
    khqrMakerStatus.className = 'maker-status status error';
    khqrMakerStatus.textContent = 'សូមបញ្ចូលចំនួនទឹកប្រាក់ចាប់ពី 100៛ ឡើងទៅ។';
    realKhqrResult?.classList.remove('open');
    return;
  }

  generateKhqrBtn.disabled = true;
  generateKhqrBtn.textContent = 'កំពុងបង្កើត KHQR…';
  khqrMakerStatus.className = 'maker-status status';
  khqrMakerStatus.textContent = '⏳ កំពុងបង្កើត Bakong KHQR ពិត…';
  realKhqrResult?.classList.remove('open');

  try {
    const response = await fetch('/api/admin/khqr/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ amount })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'មិនអាចបង្កើត KHQR ពិតបាន។');
    if (!data.real || !data.qrDataUrl) throw new Error('Server មិនបានត្រឡប់ Real KHQR។');

    realKhqrImage.src = data.qrDataUrl;
    realKhqrMerchant.textContent = data.merchantName || 'iDrama.ai';
    setQrCardMode('amount', data);
    realKhqrResult.classList.add('open');
    khqrMakerStatus.className = 'maker-status status success';
    khqrMakerStatus.textContent = '✅ KHQR ពិតត្រូវបានបង្កើតរួច។ អាច Scan តាម Bakong/Bank App បាន។';
    realKhqrResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    khqrMakerStatus.className = 'maker-status status error';
    khqrMakerStatus.textContent = err.message;
  } finally {
    generateKhqrBtn.disabled = false;
    generateKhqrBtn.textContent = 'បង្កើត KHQR ពិត';
  }
}

async function generateDirectKhqr() {
  const btn = document.getElementById('generateDirectKhqrBtn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'កំពុងបង្កើត…';
  khqrMakerStatus.className = 'maker-status status';
  khqrMakerStatus.textContent = '⏳ កំពុងបង្កើត QR ទទួលប្រាក់ផ្ទាល់…';
  realKhqrResult?.classList.remove('open');

  try {
    const response = await fetch('/api/admin/khqr/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: '{}'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'មិនអាចបង្កើត QR ទទួលប្រាក់ផ្ទាល់បាន។');
    if (!data.real || !data.directReceive || !data.qrDataUrl) throw new Error('Server មិនបានត្រឡប់ Direct KHQR។');

    realKhqrImage.src = data.qrDataUrl;
    realKhqrMerchant.textContent = data.merchantName || 'iDrama.ai';
    setQrCardMode('direct', data);
    realKhqrResult.classList.add('open');
    khqrMakerStatus.className = 'maker-status status success';
    khqrMakerStatus.textContent = '✅ QR ទទួលប្រាក់ផ្ទាល់ត្រូវបានបង្កើតរួច។ ភ្ញៀវ Scan ហើយបញ្ចូលចំនួនទឹកប្រាក់ក្នុង App។';
    realKhqrResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    khqrMakerStatus.className = 'maker-status status error';
    khqrMakerStatus.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'បង្កើត QR ទទួលប្រាក់ផ្ទាល់';
  }
}

function installDirectReceiveButton() {
  const maker = document.querySelector('.khqr-maker');
  if (!maker || document.getElementById('generateDirectKhqrBtn')) return;
  const row = document.querySelector('.maker-row');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px';
  wrap.innerHTML = '<button id="generateDirectKhqrBtn" class="generate-btn" type="button" style="background:linear-gradient(135deg,#8b5cf6,#ec4899);min-width:250px">បង្កើត QR ទទួលប្រាក់ផ្ទាល់</button><span style="align-self:center;opacity:.72;font-size:13px">មិនកំណត់ចំនួនប្រាក់ • មិនផុតកំណត់</span>';
  row?.insertAdjacentElement('afterend', wrap);
  document.getElementById('generateDirectKhqrBtn')?.addEventListener('click', generateDirectKhqr);
}

function statusLabel(status) {
  if (status === 'awaiting_review') return '🕒 រង់ចាំ Admin ពិនិត្យ';
  if (status === 'paid') return '✅ បានអនុម័ត';
  if (status === 'rejected') return '❌ បានបដិសេធ';
  return '○ រង់ចាំការបង់';
}

function renderOrders(rows) {
  if (!rows.length) {
    ordersEl.innerHTML = '<div class="pay-card empty-note">មិនទាន់មានការបញ្ជាទិញ KHQR ទេ។</div>';
    return;
  }

  ordersEl.innerHTML = rows.map(order => `
    <article class="pay-card" data-order="${esc(order.id)}">
      <div>
        <strong>${esc(order.title || order.story_id || 'Story')}</strong>
        <div class="muted-small">Order: ${esc(order.id)}</div>
        <div class="muted-small">${new Date(order.created_at).toLocaleString('km-KH')}</div>
      </div>
      <div>
        <div style="font-weight:800;font-size:18px">${money(order.amount_khr)}</div>
        <div class="pay-status ${esc(order.status || 'pending')}">${statusLabel(order.status)}</div>
      </div>
      <div class="pay-actions">
        ${order.status !== 'paid' ? `<button class="admin-btn approve" data-approve="${esc(order.id)}">អនុម័ត</button>` : ''}
        ${order.status !== 'rejected' && order.status !== 'paid' ? `<button class="admin-btn reject" data-reject="${esc(order.id)}">បដិសេធ</button>` : ''}
      </div>
    </article>
  `).join('');
}

async function loadOrders() {
  refreshBtn.disabled = true;
  ordersEl.innerHTML = '<div class="pay-card empty-note">កំពុងផ្ទុកការបញ្ជាទិញ…</div>';
  try {
    const data = await adminCall('adminList');
    renderOrders(data.orders || []);
  } catch (err) {
    ordersEl.innerHTML = `<div class="pay-card" style="color:#ff8a8a">${esc(err.message)}</div>`;
    if (/password/i.test(err.message)) {
      sessionStorage.removeItem('idrama_payment_admin_password');
      adminPassword = '';
      ordersBox.hidden = true;
      loginBox.hidden = false;
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

async function login() {
  adminPassword = passwordInput.value.trim();
  if (!adminPassword) return;
  loginBtn.disabled = true;
  loginStatus.className = 'status';
  loginStatus.textContent = 'កំពុងពិនិត្យ…';
  try {
    await adminCall('adminList');
    sessionStorage.setItem('idrama_payment_admin_password', adminPassword);
    loginBox.hidden = true;
    ordersBox.hidden = false;
    installDirectReceiveButton();
    await loadOrders();
  } catch (err) {
    loginStatus.className = 'status error';
    loginStatus.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', login);
passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
refreshBtn.addEventListener('click', loadOrders);
generateKhqrBtn?.addEventListener('click', generateRealKhqr);
realKhqrAmount?.addEventListener('keydown', e => { if (e.key === 'Enter') generateRealKhqr(); });

ordersEl.addEventListener('click', async e => {
  const approve = e.target.closest('[data-approve]');
  const reject = e.target.closest('[data-reject]');
  const orderId = approve?.dataset.approve || reject?.dataset.reject;
  if (!orderId) return;
  const button = approve || reject;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = 'កំពុងដំណើរការ…';
  try {
    await adminCall(approve ? 'adminApprove' : 'adminReject', { orderId });
    await loadOrders();
  } catch (err) {
    alert(err.message);
    button.disabled = false;
    button.textContent = original;
  }
});

if (adminPassword) {
  loginBox.hidden = true;
  ordersBox.hidden = false;
  installDirectReceiveButton();
  loadOrders();
}
