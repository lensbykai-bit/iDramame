const $ = (q, root = document) => root.querySelector(q);

const CFG = window.IDRAMA_SUPABASE || {};
const SUPABASE_URL = CFG.url || '';
const SUPABASE_KEY = CFG.publishableKey || '';
const EDGE_URL = CFG.checkoutFunction || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/idrama-checkout` : '');
const SESSION_KEY = 'idramaai_supabase_session_v1';

const modal = $('#modal');
const modalBody = $('#modalBody');
const storyGrid = $('#storyGrid');
const searchInput = $('#storySearch');
const libraryGrid = $('#libraryGrid');
const accountBtn = $('#accountBtn');
const libraryMeta = $('#libraryMeta');

let stories = [];
let meta = { testMode: false, checkout: false };
let session = loadSession();
let currentUser = null;
let activeOrder = null;
let activeStory = null;
let paymentTimer = null;
let checkingPayment = false;

function money(v) {
  return `${Number(v || 0).toLocaleString('en-US')}៛`;
}

function esc(v = '') {
  return String(v).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function loadSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return parsed && parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

function saveSession(next) {
  session = next && next.access_token ? next : null;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

function stopPaymentPolling() {
  if (paymentTimer) {
    clearInterval(paymentTimer);
    paymentTimer = null;
  }
  checkingPayment = false;
}

function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  stopPaymentPolling();
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  activeOrder = null;
  activeStory = null;
}

modal.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

async function authRequest(path, { method = 'GET', body = null, token = null } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Account service is not configured.');
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.message || data.error_description || 'Account request failed.');
  return data;
}

async function refreshSessionIfNeeded(force = false) {
  if (!session?.refresh_token) return null;
  const expiresAtMs = Number(session.expires_at || 0) * 1000;
  if (!force && expiresAtMs && expiresAtMs > Date.now() + 60_000) return session;

  try {
    const data = await authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    saveSession(data);
    return session;
  } catch {
    saveSession(null);
    currentUser = null;
    return null;
  }
}

async function loadUser() {
  if (!session?.access_token) {
    currentUser = null;
    renderAccount();
    await renderLibrary();
    return;
  }

  await refreshSessionIfNeeded();
  if (!session?.access_token) {
    currentUser = null;
    renderAccount();
    await renderLibrary();
    return;
  }

  try {
    currentUser = await authRequest('user', { token: session.access_token });
  } catch {
    const refreshed = await refreshSessionIfNeeded(true);
    if (refreshed?.access_token) {
      try {
        currentUser = await authRequest('user', { token: refreshed.access_token });
      } catch {
        currentUser = null;
        saveSession(null);
      }
    } else {
      currentUser = null;
    }
  }
  renderAccount();
  await renderLibrary();
}

function renderAccount() {
  if (!accountBtn) return;
  if (currentUser?.email) {
    accountBtn.textContent = `👤 ${currentUser.email.split('@')[0]}`;
    accountBtn.classList.add('signed-in');
  } else {
    accountBtn.textContent = '👤 ចូល / ចុះឈ្មោះ';
    accountBtn.classList.remove('signed-in');
  }
}

async function signIn(email, password) {
  const data = await authRequest('token?grant_type=password', {
    method: 'POST',
    body: { email, password }
  });
  saveSession(data);
  await loadUser();
}

async function signUp(email, password) {
  const data = await authRequest('signup', {
    method: 'POST',
    body: { email, password }
  });
  if (data.access_token) {
    saveSession(data);
    await loadUser();
    return { signedIn: true };
  }
  return { signedIn: false };
}

async function signOut() {
  try {
    if (session?.access_token) {
      await authRequest('logout', { method: 'POST', token: session.access_token });
    }
  } catch {}
  saveSession(null);
  currentUser = null;
  renderAccount();
  await renderLibrary();
}

function showAccountModal(defaultMode = 'login') {
  const mode = defaultMode === 'signup' ? 'signup' : 'login';

  if (currentUser?.email) {
    modalBody.innerHTML = `
      <div class="eyebrow">MY ACCOUNT</div>
      <h2 class="modal-title">គណនីរបស់ខ្ញុំ</h2>
      <div class="account-card">
        <div class="account-avatar">👤</div>
        <div><strong>${esc(currentUser.email)}</strong><p>រឿងដែលអ្នកទិញត្រូវបានរក្សាទុកជាមួយ Account នេះ។</p></div>
      </div>
      <button id="openLibraryBtn" class="buy-btn" style="width:100%;margin-top:14px">📚 មើលរឿងដែលបានទិញ</button>
      <button id="logoutBtn" class="secondary-btn auth-wide">ចាកចេញ</button>`;
    openModal();
    $('#openLibraryBtn').onclick = () => {
      closeModal();
      location.hash = '#library';
    };
    $('#logoutBtn').onclick = async () => {
      await signOut();
      closeModal();
    };
    return;
  }

  modalBody.innerHTML = `
    <div class="eyebrow">IDRAMAAI ACCOUNT</div>
    <h2 class="modal-title">${mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី'}</h2>
    <p class="modal-preview">ប្រើ Email ដើម្បីរក្សារឿងដែលបានទិញ និងបើកមើលបានពេលចូលគណនីនៅឧបករណ៍ផ្សេង។</p>
    <form id="authForm" class="auth-form">
      <label>Email<input id="authEmail" type="email" autocomplete="email" required placeholder="name@example.com"></label>
      <label>Password<input id="authPassword" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required placeholder="យ៉ាងហោច 6 តួអក្សរ"></label>
      <button id="authSubmit" class="buy-btn" type="submit">${mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី'}</button>
    </form>
    <div id="authStatus" class="status auth-status">🔐 Password ត្រូវបានគ្រប់គ្រងដោយ Supabase Auth មិនរក្សាទុកក្នុង iDramaAi server ទេ។</div>
    <button id="authSwitch" class="text-btn">${mode === 'signup' ? 'មានគណនីរួច? ចូលគណនី' : 'មិនទាន់មានគណនី? ចុះឈ្មោះ'}</button>`;

  openModal();

  $('#authSwitch').onclick = () => showAccountModal(mode === 'signup' ? 'login' : 'signup');
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    const submit = $('#authSubmit');
    const status = $('#authStatus');

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>កំពុងដំណើរការ…';
    status.className = 'status auth-status';
    status.textContent = '⏳ កំពុងភ្ជាប់ Account…';

    try {
      if (mode === 'signup') {
        const result = await signUp(email, password);
        if (!result.signedIn) {
          status.className = 'status success auth-status';
          status.textContent = '✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email ដើម្បីបញ្ជាក់គណនី បន្ទាប់មកចូលគណនី។';
          submit.disabled = false;
          submit.textContent = 'បង្កើតគណនី';
          return;
        }
      } else {
        await signIn(email, password);
      }
      closeModal();
    } catch (err) {
      status.className = 'status error auth-status';
      status.textContent = err.message;
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី';
    }
  };
}

accountBtn?.addEventListener('click', () => showAccountModal('login'));

async function edgeCall(action, payload = {}, retry = true) {
  if (!session?.access_token) throw new Error('សូម Login មុន។');
  await refreshSessionIfNeeded();
  if (!session?.access_token) throw new Error('Session ផុតកំណត់។ សូម Login ម្តងទៀត។');

  const response = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry) {
    const refreshed = await refreshSessionIfNeeded(true);
    if (refreshed?.access_token) return edgeCall(action, payload, false);
  }
  if (!response.ok) throw new Error(data.error || 'Store account service failed.');
  return data;
}

function storyCard(s) {
  const media = s.cover_url
    ? `<img src="${esc(s.cover_url)}" alt="${esc(s.title)}" loading="lazy">`
    : '<div class="poster-fallback">iD</div>';

  return `<article class="story-card">
    <div class="poster">${media}</div>
    <div class="card-body">
      <h3>${esc(s.title)}</h3>
      <div class="preview-text">${esc(s.preview || 'មើល Trailer មុនទិញរឿងពេញ។')}</div>
      <div class="card-bottom">
        <div><div class="muted" style="font-size:12px">តម្លៃ</div><div class="price">${money(s.price_khr)}</div></div>
        <button class="card-btn" data-story="${esc(s.id)}">▶️ មើល Trailer</button>
      </div>
    </div>
  </article>`;
}

function renderStories(query = '') {
  const q = String(query || '').trim().toLowerCase();
  const filtered = q
    ? stories.filter(s => `${s.title} ${s.preview || ''}`.toLowerCase().includes(q))
    : stories;

  $('#storyCount').textContent = `${filtered.length} រឿង`;
  storyGrid.innerHTML = filtered.length
    ? filtered.map(storyCard).join('')
    : '<div class="loading">រកមិនឃើញរឿងដែលត្រូវនឹងការស្វែងរកទេ។</div>';
}

async function loadMeta() {
  try {
    const r = await fetch('/api/meta', { cache: 'no-store' });
    const data = await r.json();
    if (r.ok) meta = data || meta;
  } catch {}
}

async function loadStories() {
  try {
    const r = await fetch('/api/stories', { cache: 'no-store' });
    const data = await r.json();
    stories = data.stories || [];
    renderStories(searchInput?.value || '');

    const wanted = new URLSearchParams(location.search).get('story');
    if (wanted && stories.some(s => s.id === wanted)) showStory(wanted);
  } catch {
    storyGrid.innerHTML = '<div class="loading error">មិនអាចផ្ទុក Catalog បាន។</div>';
  }
}

storyGrid?.addEventListener('click', e => {
  const btn = e.target.closest('[data-story]');
  if (btn) showStory(btn.dataset.story);
});

searchInput?.addEventListener('input', e => renderStories(e.target.value));

function showStory(id) {
  stopPaymentPolling();
  const s = stories.find(x => x.id === id);
  if (!s) return;
  activeStory = s;

  const checkoutReady = meta.testMode || meta.checkout;
  const accountHint = currentUser
    ? `<div class="account-mini">👤 ទិញជាមួយ <strong>${esc(currentUser.email)}</strong></div>`
    : '<div class="account-mini warn">👤 សូម Login ដើម្បីទិញ និងរក្សាទុកក្នុង My Library។</div>';

  modalBody.innerHTML = `
    <div class="eyebrow">TRAILER / PREVIEW</div>
    <h2 class="modal-title">${esc(s.title)}</h2>
    ${s.preview_video_url
      ? `<video controls playsinline controlsList="nodownload" style="width:100%;border-radius:16px;margin:10px 0" src="${esc(s.preview_video_url)}"></video>`
      : '<div class="status">🎞️ រឿងនេះមិនទាន់មាន Trailer ទេ។</div>'}
    <p class="modal-preview">${esc(s.preview || '')}</p>
    <div class="amount-row"><span class="muted">តម្លៃរឿងពេញ</span><strong class="price">${money(s.price_khr)}</strong></div>
    ${accountHint}
    ${checkoutReady
      ? `<button class="buy-btn" id="buyBtn" style="width:100%;margin-top:14px">${currentUser ? '💳 ទិញតាម Bakong KHQR' : '👤 Login ដើម្បីទិញ'}</button>`
      : '<div class="status error" style="margin-top:16px">Bakong KHQR មិនទាន់បានកំណត់នៅលើ Server ទេ។</div>'}
    <div class="checkout-hint"><span>🔐</span><span>បង់ជោគជ័យ រឿងនេះនឹងបញ្ចូលទៅ My Library របស់ Account ដោយស្វ័យប្រវត្តិ។</span></div>`;

  openModal();
  $('#buyBtn')?.addEventListener('click', () => {
    if (!currentUser) return showAccountModal('login');
    createOrder(s.id);
  });
}

async function createOrder(storyId) {
  stopPaymentPolling();
  const btn = $('#buyBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>កំពុងបង្កើត KHQR…';
  }

  try {
    const data = await edgeCall('create', { storyId });

    if (data.alreadyPurchased && data.watchUrl) {
      await renderLibrary();
      modalBody.innerHTML = `
        <div class="eyebrow">MY LIBRARY</div>
        <h2 class="modal-title">អ្នកបានទិញរឿងនេះរួចហើយ</h2>
        <div class="status success">✅ មិនចាំបាច់បង់ម្តងទៀតទេ។</div>
        <a class="buy-btn auth-link" href="${esc(data.watchUrl)}">▶️ មើលរឿងពេញ</a>`;
      return;
    }

    activeOrder = data.orderId;

    if (data.testMode) {
      modalBody.innerHTML = `
        <div class="eyebrow">🧪 BAKONG TEST MODE</div>
        <h2 class="modal-title">${esc(data.title)}</h2>
        <div class="pay-box">
          <div class="status">⚠️ TEST MODE — មិនកាត់លុយពិតទេ។</div>
          <div class="amount-row"><span>តម្លៃ</span><strong class="price">${money(data.amount)}</strong></div>
          <div id="status" class="status">ចុចប៊ូតុងខាងក្រោមដើម្បីសាក Unlock។</div>
          <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">🧪 សាក Payment Success</button>
        </div>`;
      $('#checkBtn').onclick = () => checkPayment({ manual: true });
      return;
    }

    modalBody.innerHTML = `
      <div class="eyebrow">BAKONG KHQR</div>
      <h2 class="modal-title">${esc(data.title)}</h2>
      <div class="pay-box">
        <div class="amount-row"><span>ត្រូវបង់</span><strong class="price">${money(data.amount)}</strong></div>
        <div class="qr-wrap"><img src="${data.qrDataUrl}" alt="Bakong KHQR"></div>
        <div class="order-id">Order: ${esc(data.orderId)}</div>
        <div id="status" class="status">⏳ Scan KHQR ហើយបង់។ Website កំពុងពិនិត្យដោយស្វ័យប្រវត្តិ…</div>
        <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">🔄 ពិនិត្យឥឡូវនេះ</button>
      </div>
      <p class="small">KHQR មានសុពលភាពប្រហែល 10 នាទី។ បង់ជោគជ័យនឹងបញ្ចូលរឿងទៅ My Library ភ្លាម។</p>`;

    $('#checkBtn').onclick = () => checkPayment({ manual: true });

    let attempts = 0;
    paymentTimer = setInterval(async () => {
      attempts += 1;
      if (attempts > 120) {
        stopPaymentPolling();
        const status = $('#status');
        if (status) status.textContent = '⌛ KHQR ផុតពេល។ សូមបិទផ្ទាំងនេះ ហើយបង្កើត KHQR ថ្មី។';
        return;
      }
      await checkPayment({ manual: false });
    }, 5000);
  } catch (err) {
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = '💳 ទិញតាម Bakong KHQR';
    }
    modalBody.insertAdjacentHTML('beforeend', `<div class="status error">${esc(err.message)}</div>`);
  }
}

async function checkPayment({ manual = false } = {}) {
  if (!activeOrder || checkingPayment) return;
  checkingPayment = true;

  const btn = $('#checkBtn');
  const status = $('#status');
  if (manual && btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>កំពុងពិនិត្យ…';
  }
  if (status && manual) {
    status.className = 'status';
    status.textContent = '⏳ កំពុងពិនិត្យ Transaction ជាមួយ Bakong…';
  }

  try {
    const data = await edgeCall('check', { orderId: activeOrder });
    if (data.paid) {
      stopPaymentPolling();
      await renderLibrary();
      if (status) {
        status.className = 'status success';
        status.textContent = '✅ បង់ជោគជ័យ! រឿងត្រូវបានបញ្ចូលទៅ My Library។';
      }
      setTimeout(() => { location.href = data.watchUrl; }, 500);
      return;
    }

    if (status && manual) {
      status.className = 'status';
      status.textContent = data.expired
        ? '⌛ KHQR ផុតពេល។ សូមបង្កើត KHQR ថ្មី។'
        : '⏳ មិនទាន់រកឃើញការបង់ទេ។ Website នឹងបន្តពិនិត្យដោយស្វ័យប្រវត្តិ។';
    }
  } catch (err) {
    if (status && manual) {
      status.className = 'status error';
      status.textContent = err.message;
    }
  } finally {
    checkingPayment = false;
    if (manual && btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = '🔄 ពិនិត្យឥឡូវនេះ';
    }
  }
}

async function renderLibrary() {
  if (!libraryGrid) return;

  if (!currentUser) {
    if (libraryMeta) libraryMeta.textContent = 'ត្រូវ Login ដើម្បីមើល';
    libraryGrid.innerHTML = `
      <div class="empty-library library-login">
        <div class="library-icon">📚</div>
        <h3>My Library តាម Account</h3>
        <p>ចូលគណនីដើម្បីឃើញរឿងដែលអ្នកបានទិញ ទោះបីប្តូរ Browser ឬឧបករណ៍ក៏ដោយ។</p>
        <button id="libraryLoginBtn" class="primary-btn">👤 ចូល / ចុះឈ្មោះ</button>
      </div>`;
    $('#libraryLoginBtn')?.addEventListener('click', () => showAccountModal('login'));
    return;
  }

  if (libraryMeta) libraryMeta.textContent = currentUser.email || 'Account Library';
  libraryGrid.innerHTML = '<div class="loading">កំពុងផ្ទុក My Library…</div>';

  try {
    const data = await edgeCall('library');
    const purchases = data.purchases || [];

    if (!purchases.length) {
      libraryGrid.innerHTML = '<div class="empty-library">📚 មិនទាន់មានរឿងដែលបានទិញក្នុង Account នេះទេ។</div>';
      return;
    }

    libraryGrid.innerHTML = purchases.map(item => `
      <article class="library-card">
        <div class="library-badge">✅ បានទិញ</div>
        <h3>${esc(item.title || 'រឿងដែលបានទិញ')}</h3>
        <p>${money(item.amount_khr)} • ${new Date(item.purchased_at).toLocaleDateString()}</p>
        <button class="primary-btn" data-watch-story="${esc(item.story_id)}">▶️ មើលរឿងពេញ</button>
      </article>
    `).join('');
  } catch (err) {
    libraryGrid.innerHTML = `<div class="loading error">${esc(err.message)}</div>`;
  }
}

libraryGrid?.addEventListener('click', async e => {
  const btn = e.target.closest('[data-watch-story]');
  if (!btn) return;
  const storyId = btn.dataset.watchStory;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>កំពុងបើក…';
  try {
    const data = await edgeCall('watch', { storyId });
    location.href = data.watchUrl;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '▶️ មើលរឿងពេញ';
    alert(err.message);
  }
});

async function init() {
  await loadMeta();
  await loadStories();
  await loadUser();
}

init();
