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
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
}

function money(value) {
  return `${Number(value || 0).toLocaleString('en-US')}៛`;
}

async function adminCall(action, payload = {}) {
  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      apikey: API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, adminPassword, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'មិនអាចភ្ជាប់ប្រព័ន្ធ Payment Admin បាន។');
  return data;
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
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ amount })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'មិនអាចបង្កើត KHQR ពិតបាន។');
    if (!data.real || !data.qrDataUrl) throw new Error('Server មិនបានត្រឡប់ Real KHQR។');

    realKhqrImage.src = data.qrDataUrl;
    realKhqrAmountText.textContent = money(data.amount);
    realKhqrMerchant.textContent = `អ្នកទទួល: ${data.merchantName || 'iDrama.ai'}`;
    realKhqrBill.textContent = `Bill: ${data.billNumber || '-'}`;
    realKhqrResult.classList.add('open');
    khqrMakerStatus.className = 'maker-status status success';
    khqrMakerStatus.textContent = '✅ KHQR ពិតត្រូវបានបង្កើតរួច។ សូមសាក Scan ក្នុង Bakong/Bank App មុនទទួលប្រាក់ពិត។';
  } catch (err) {
    khqrMakerStatus.className = 'maker-status status error';
    khqrMakerStatus.textContent = err.message;
  } finally {
    generateKhqrBtn.disabled = false;
    generateKhqrBtn.textContent = 'បង្កើត KHQR ពិត';
  }
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
  loadOrders();
}
