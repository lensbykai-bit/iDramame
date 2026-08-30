const $ = (q, root = document) => root.querySelector(q);
const PURCHASE_KEY = 'idramaai_purchases_v1';

const modal = $('#modal');
const modalBody = $('#modalBody');
const storyGrid = $('#storyGrid');
const searchInput = $('#storySearch');
const libraryGrid = $('#libraryGrid');

let stories = [];
let activeOrder = null;
let activeStory = null;
let meta = { testMode: false, checkout: false };
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

function getPurchases() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PURCHASE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePurchase(story, watchUrl) {
  if (!story || !watchUrl) return;
  const list = getPurchases().filter(item => item.storyId !== story.id);
  list.unshift({
    storyId: story.id,
    title: story.title,
    watchUrl,
    savedAt: new Date().toISOString()
  });
  localStorage.setItem(PURCHASE_KEY, JSON.stringify(list.slice(0, 100)));
  renderLibrary();
}

function renderLibrary() {
  if (!libraryGrid) return;
  const purchases = getPurchases();

  if (!purchases.length) {
    libraryGrid.innerHTML = '<div class="empty-library">📚 មិនទាន់មានរឿងដែលបានទិញនៅ Browser នេះទេ។</div>';
    return;
  }

  libraryGrid.innerHTML = purchases.map(item => `
    <article class="library-card">
      <h3>${esc(item.title || 'រឿងដែលបានទិញ')}</h3>
      <p>បានរក្សាទុកសិទ្ធិមើលនៅលើ Browser នេះ។</p>
      <a class="primary-btn" href="${esc(item.watchUrl)}">▶️ មើលរឿងពេញ</a>
    </article>
  `).join('');
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
        <div>
          <div class="muted" style="font-size:12px">តម្លៃ</div>
          <div class="price">${money(s.price_khr)}</div>
        </div>
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

storyGrid.addEventListener('click', e => {
  const btn = e.target.closest('[data-story]');
  if (btn) showStory(btn.dataset.story);
});

searchInput?.addEventListener('input', e => renderStories(e.target.value));

function showStory(id) {
  stopPaymentPolling();
  const s = stories.find(x => x.id === id);
  if (!s) return;
  activeStory = s;

  const testBanner = meta.testMode
    ? '<div class="status" style="margin:10px 0">🧪 <strong>TEST MODE</strong> — មិនមានការកាត់លុយពិតទេ។</div>'
    : '';

  const checkoutReady = meta.testMode || meta.checkout;
  const buyText = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';

  modalBody.innerHTML = `
    <div class="eyebrow">TRAILER / PREVIEW</div>
    <h2 class="modal-title">${esc(s.title)}</h2>
    ${testBanner}
    ${s.preview_video_url
      ? `<video controls playsinline controlsList="nodownload" style="width:100%;border-radius:16px;margin:10px 0" src="${esc(s.preview_video_url)}"></video>`
      : '<div class="status">🎞️ រឿងនេះមិនទាន់មាន Trailer ទេ។</div>'}
    <p class="modal-preview">${esc(s.preview || '')}</p>
    <div class="amount-row">
      <span class="muted">តម្លៃរឿងពេញ</span>
      <strong class="price">${money(s.price_khr)}</strong>
    </div>
    ${checkoutReady
      ? `<button class="buy-btn" id="buyBtn" style="width:100%;margin-top:18px">${buyText}</button>`
      : '<div class="status error" style="margin-top:16px">Bakong KHQR មិនទាន់បានកំណត់នៅលើ Server ទេ។</div>'}
    <div class="checkout-hint"><span>🔐</span><span>Website នឹងបើករឿងពេញតែក្រោយ Server ផ្ទៀងផ្ទាត់ការទូទាត់ជោគជ័យប៉ុណ្ណោះ។</span></div>`;

  openModal();
  $('#buyBtn')?.addEventListener('click', () => createOrder(s.id));
}

async function createOrder(storyId) {
  stopPaymentPolling();

  const btn = $('#buyBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = meta.testMode
      ? '<span class="spinner"></span>កំពុងបង្កើត Test Order…'
      : '<span class="spinner"></span>កំពុងបង្កើត KHQR…';
  }

  try {
    const r = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Order failed');

    activeOrder = data.orderId;

    if (data.testMode) {
      modalBody.innerHTML = `
        <div class="eyebrow">🧪 BAKONG TEST MODE</div>
        <h2 class="modal-title">${esc(data.title)}</h2>
        <div class="pay-box">
          <div class="status" style="margin-bottom:14px">⚠️ TEST MODE — មិនកាត់លុយពិតទេ។</div>
          <div class="amount-row"><span>តម្លៃសាកល្បង</span><strong class="price">${money(data.amount)}</strong></div>
          <div class="order-id">Test Order: ${esc(data.orderId)}</div>
          <div id="status" class="status">🧪 ចុចប៊ូតុងខាងក្រោមដើម្បីសាក Unlock។</div>
          <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">🧪 សាកល្បង Payment Success</button>
        </div>`;
      $('#checkBtn').addEventListener('click', () => checkPayment({ manual: true }));
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
      <p class="small">KHQR នេះមានសុពលភាពប្រហែល 10 នាទី។ បង់ជោគជ័យនឹងបើករឿងពេញភ្លាមៗ។</p>`;

    $('#checkBtn').addEventListener('click', () => checkPayment({ manual: true }));

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
    if (btn) {
      btn.disabled = false;
      btn.textContent = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';
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
    status.textContent = meta.testMode
      ? '🧪 កំពុងសាកល្បង Payment Success…'
      : '⏳ កំពុងពិនិត្យ Transaction ជាមួយ Bakong…';
  }

  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(activeOrder)}/check`, { method: 'POST' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Check failed');

    if (data.paid) {
      stopPaymentPolling();
      savePurchase(activeStory, data.watchUrl);

      if (status) {
        status.className = 'status success';
        status.textContent = data.testMode
          ? '✅ TEST Payment ជោគជ័យ! កំពុងបើក Watch Page…'
          : '✅ បង់ជោគជ័យ! កំពុងបើករឿងពេញ…';
      }

      setTimeout(() => { location.href = data.watchUrl; }, 450);
      return;
    }

    if (status && manual) {
      status.className = 'status';
      status.textContent = '⏳ មិនទាន់រកឃើញការបង់ទេ។ Website នឹងបន្តពិនិត្យដោយស្វ័យប្រវត្តិ។';
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
      btn.textContent = meta.testMode ? '🧪 សាកល្បងម្តងទៀត' : '🔄 ពិនិត្យឥឡូវនេះ';
    }
  }
}

async function init() {
  renderLibrary();
  await loadMeta();
  await loadStories();
}

init();
