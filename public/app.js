const $ = (q, root=document) => root.querySelector(q);
const BRAND_NAME = 'iDramaAi';
const modal = $('#modal');
const modalBody = $('#modalBody');

let stories = [];
let activeOrder = null;
let meta = { testMode: false };
let paymentTimer = null;
let checkingPayment = false;

function money(v){ return `${Number(v).toLocaleString('en-US')}៛`; }
function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function stopPaymentPolling(){
  if(paymentTimer){
    clearInterval(paymentTimer);
    paymentTimer = null;
  }
  checkingPayment = false;
}

function openModal(){
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}

function closeModal(){
  stopPaymentPolling();
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
  activeOrder=null;
}

modal.addEventListener('click', e => { if(e.target.matches('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

function storyCard(s){
  const media = s.cover_url
    ? `<img src="${esc(s.cover_url)}" alt="${esc(s.title)}" loading="lazy">`
    : '<div class="poster-fallback">AI</div>';

  return `<article class="story-card">
    <div class="poster">${media}</div>
    <div class="card-body">
      <h3>${esc(s.title)}</h3>
      <div class="preview-text">${esc(s.preview)}</div>
      <div class="card-bottom">
        <div class="price">${money(s.price_khr)}</div>
        <button class="card-btn" data-story="${esc(s.id)}">មើល Trailer</button>
      </div>
    </div>
  </article>`;
}

async function loadMeta(){
  try{
    const r = await fetch('/api/meta');
    const data = await r.json();
    if(r.ok) meta = data || meta;
  }catch{}
}

async function loadStories(){
  try{
    const r = await fetch('/api/stories');
    const data = await r.json();
    stories = data.stories || [];
    $('#storyCount').textContent = `${stories.length} រឿង`;
    $('#storyGrid').innerHTML = stories.length
      ? stories.map(storyCard).join('')
      : '<div class="loading">មិនទាន់មានរឿងទេ។</div>';

    const wanted = new URLSearchParams(location.search).get('story');
    if(wanted && stories.some(s=>s.id===wanted)) showStory(wanted);
  }catch{
    $('#storyGrid').innerHTML = '<div class="loading error">មិនអាចផ្ទុក Catalog បាន។</div>';
  }
}

$('#storyGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-story]');
  if(btn) showStory(btn.dataset.story);
});

function showStory(id){
  stopPaymentPolling();

  const s = stories.find(x=>x.id===id);
  if(!s) return;

  const testBanner = meta.testMode
    ? '<div class="status" style="margin:10px 0">🧪 <strong>TEST MODE</strong> — មិនមានការកាត់លុយពិតទេ។</div>'
    : '';

  const buyText = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';

  modalBody.innerHTML = `
    <div class="eyebrow">TRAILER / PREVIEW</div>
    <h2 class="modal-title">${esc(s.title)}</h2>
    ${testBanner}
    ${s.preview_video_url
      ? `<video controls playsinline controlsList="nodownload" style="width:100%;border-radius:16px;margin:10px 0" src="${esc(s.preview_video_url)}"></video>`
      : '<div class="status">🎞️ រឿងនេះមិនទាន់មាន Trailer ទេ។</div>'}
    <p class="modal-preview">${esc(s.preview)}</p>
    <div class="amount-row">
      <span class="muted">តម្លៃ Full Movie</span>
      <strong class="price">${money(s.price_khr)}</strong>
    </div>
    <button class="buy-btn" id="buyBtn" style="width:100%;margin-top:18px">${buyText}</button>
    <p class="small">បង់ជោគជ័យរួច Website នឹងបើក Full Movie នៅ Watch Page ដោយស្វ័យប្រវត្តិ។</p>`;

  openModal();
  $('#buyBtn').addEventListener('click', () => createOrder(s.id));
}

async function createOrder(storyId){
  stopPaymentPolling();

  const btn = $('#buyBtn');
  btn.disabled = true;
  btn.innerHTML = meta.testMode
    ? '<span class="spinner"></span>កំពុងបង្កើត Test Order…'
    : '<span class="spinner"></span>កំពុងបង្កើត KHQR…';

  try{
    const r = await fetch('/api/orders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({storyId})
    });

    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Order failed');

    activeOrder = data.orderId;

    if(data.testMode){
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

      $('#checkBtn').addEventListener('click', () => checkPayment({ manual:true }));
      return;
    }

    modalBody.innerHTML = `
      <div class="eyebrow">BAKONG KHQR</div>
      <h2 class="modal-title">${esc(data.title)}</h2>
      <div class="pay-box">
        <div class="amount-row"><span>ត្រូវបង់</span><strong class="price">${money(data.amount)}</strong></div>
        <div class="qr-wrap"><img src="${data.qrDataUrl}" alt="Bakong KHQR"></div>
        <div class="order-id">Order: ${esc(data.orderId)}</div>
        <div id="status" class="status">⏳ Scan KHQR និងបង់។ Website កំពុងពិនិត្យការបង់ដោយស្វ័យប្រវត្តិ…</div>
        <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">🔄 ពិនិត្យឥឡូវនេះ</button>
      </div>
      <p class="small">ពេល Bakong បញ្ជាក់ជោគជ័យ Website នឹងបើក Full Movie ភ្លាមៗ។</p>`;

    $('#checkBtn').addEventListener('click', () => checkPayment({ manual:true }));

    let attempts = 0;
    paymentTimer = setInterval(async () => {
      attempts += 1;
      if(attempts > 120){
        stopPaymentPolling();
        const status = $('#status');
        if(status) status.textContent = '⌛ QR ផុតពេល។ សូមបង្កើត KHQR ថ្មី។';
        return;
      }
      await checkPayment({ manual:false });
    }, 5000);

  }catch(err){
    btn.disabled=false;
    btn.textContent = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';
    modalBody.insertAdjacentHTML('beforeend', `<div class="status error">${esc(err.message)}</div>`);
  }
}

async function checkPayment({ manual=false } = {}){
  if(!activeOrder || checkingPayment) return;
  checkingPayment = true;

  const btn = $('#checkBtn');
  const status = $('#status');

  if(manual && btn){
    btn.disabled=true;
    btn.innerHTML='<span class="spinner"></span>កំពុងពិនិត្យ…';
  }

  if(status && manual){
    status.className='status';
    status.textContent = meta.testMode
      ? '🧪 កំពុងសាកល្បង Payment Success…'
      : '⏳ កំពុងពិនិត្យ Transaction ជាមួយ Bakong…';
  }

  try{
    const r = await fetch(`/api/orders/${encodeURIComponent(activeOrder)}/check`,{method:'POST'});
    const data = await r.json();

    if(!r.ok) throw new Error(data.error || 'Check failed');

    if(data.paid){
      stopPaymentPolling();

      if(status){
        status.className='status success';
        status.textContent = data.testMode
          ? '✅ TEST Payment ជោគជ័យ! កំពុងបើក Watch Page…'
          : '✅ បង់ជោគជ័យ! កំពុងបើក Full Movie…';
      }

      setTimeout(()=>{ location.href=data.watchUrl; },500);
      return;
    }

    if(status && manual){
      status.className='status';
      status.textContent='⏳ មិនទាន់រកឃើញការបង់ទេ។ Website នឹងបន្តពិនិត្យដោយស្វ័យប្រវត្តិ។';
    }

  }catch(err){
    if(status && manual){
      status.className='status error';
      status.textContent=err.message;
    }
  }finally{
    checkingPayment = false;

    if(manual && btn && document.body.contains(btn)){
      btn.disabled=false;
      btn.textContent = meta.testMode ? '🧪 សាកល្បងម្តងទៀត' : '🔄 ពិនិត្យឥឡូវនេះ';
    }
  }
}

async function init(){
  await loadMeta();
  await loadStories();
}

init();
