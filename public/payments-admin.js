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
  if (!response.ok) throw new Error(data.error || 'Admin payment request failed.');
  return data;
}

function statusLabel(status) {
  if (status === 'awaiting_review') return '🕒 Awaiting review';
  if (status === 'paid') return '✅ Approved';
  if (status === 'rejected') return '❌ Rejected';
  return '○ Pending';
}

function renderOrders(rows) {
  if (!rows.length) {
    ordersEl.innerHTML = '<div class="pay-card">មិនទាន់មាន KHQR Order ទេ។</div>';
    return;
  }

  ordersEl.innerHTML = rows.map(order => `
    <article class="pay-card" data-order="${esc(order.id)}">
      <div>
        <strong>${esc(order.title || order.story_id || 'Story')}</strong>
        <div class="muted-small">Order: ${esc(order.id)}</div>
        <div class="muted-small">${new Date(order.created_at).toLocaleString()}</div>
      </div>
      <div>
        <div style="font-weight:800">${money(order.amount_khr)}</div>
        <div class="pay-status ${esc(order.status || 'pending')}">${statusLabel(order.status)}</div>
      </div>
      <div class="pay-actions">
        ${order.status !== 'paid' ? `<button class="admin-btn approve" data-approve="${esc(order.id)}">Approve</button>` : ''}
        ${order.status !== 'rejected' && order.status !== 'paid' ? `<button class="admin-btn reject" data-reject="${esc(order.id)}">Reject</button>` : ''}
      </div>
    </article>
  `).join('');
}

async function loadOrders() {
  refreshBtn.disabled = true;
  ordersEl.innerHTML = '<div class="pay-card">កំពុងផ្ទុក Orders…</div>';
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

ordersEl.addEventListener('click', async e => {
  const approve = e.target.closest('[data-approve]');
  const reject = e.target.closest('[data-reject]');
  const orderId = approve?.dataset.approve || reject?.dataset.reject;
  if (!orderId) return;
  const button = approve || reject;
  button.disabled = true;
  const original = button.textContent;
  button.textContent = '…';
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
