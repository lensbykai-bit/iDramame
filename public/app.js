const $ = (q, root=document) => root.querySelector(q);
const BRAND_NAME = 'iDramaAi';
const modal = $('#modal');
const modalBody = $('#modalBody');
let stories = [];
let activeOrder = null;
let meta = { testMode: false };

function money(v){ return `${Number(v).toLocaleString('en-US')}៛`; }
function esc(v=''){ return String(v).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c])); }
function openModal(){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
function closeModal(){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); document.body.style.overflow=''; activeOrder=null; }
modal.addEventListener('click', e => { if(e.target.matches('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') closeModal(); });

function storyCard(s){
  const media = s.cover_url ? `<img src="${esc(s.cover_url)}" alt="${esc(s.title)}" loading="lazy">` : '<div class="poster-fallback">AI</div>';
  return `<article class="story-card">
    <div class="poster">${media}</div>
    <div class="card-body">
      <h3>${esc(s.title)}</h3>
      <div class="preview-text">${esc(s.preview)}</div>
      <div class="card-bottom"><div class="price">${money(s.price_khr)}</div><button class="card-btn" data-story="${esc(s.id)}">មើល Trailer</button></div>
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
    $('#storyGrid').innerHTML = stories.length ? stories.map(storyCard).join('') : '<div class="loading">មិនទាន់មានរឿងទេ។</div>';
    const wanted = new URLSearchParams(location.search).get('story');
    if(wanted && stories.some(s=>s.id===wanted)) showStory(wanted);
  }catch{
    $('#storyGrid').innerHTML = '<div class="loading error">មិនអាចផ្ទុក Catalog បាន។</div>';
  }
}

$('#storyGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-story]'); if(btn) showStory(btn.dataset.story);
});

function showStory(id){
  const s = stories.find(x=>x.id===id); if(!s) return;
  const testBanner = meta.testMode
    ? '<div class="status" style="margin:10px 0">🧪 <strong>TEST MODE</strong> — មិនមានការកាត់លុយពិតទេ។ ប្រើសម្រាប់សាក Unlock ប៉ុណ្ណោះ។</div>'
    : '';
  const buyText = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';
  const note = meta.testMode
    ? 'TEST MODE នឹងបើក Watch Page ដោយមិនផ្ញើ Transaction ទៅ Bakong។'
    : `ការទិញ និងការមើលរឿងពេញធ្វើនៅលើ ${BRAND_NAME}។ បង់ជោគជ័យរួច Website នឹងបើក Watch Page សម្រាប់អ្នក។`;

  modalBody.innerHTML = `
    <div class="eyebrow">TRAILER / PREVIEW</div>
    <h2 class="modal-title">${esc(s.title)}</h2>
    ${testBanner}
    ${s.preview_video_url ? `<video controls playsinline controlsList="nodownload" style="width:100%;border-radius:16px;margin:10px 0" src="${esc(s.preview_video_url)}"></video>` : '<div class="status">🎞️ រឿងនេះមិនទាន់មាន Trailer ទេ។</div>'}
    <p class="modal-preview">${esc(s.preview)}</p>
    <div class="amount-row"><span class="muted">តម្លៃរឿងពេញ</span><strong class="price">${money(s.price_khr)}</strong></div>
    <button class="buy-btn" id="buyBtn" style="width:100%;margin-top:18px">${buyText}</button>
    <p class="small">${note}</p>`;
  openModal();
  $('#buyBtn').addEventListener('click', () => createOrder(s.id));
}

async function createOrder(storyId){
  const btn = $('#buyBtn');
  btn.disabled = true;
  btn.innerHTML = meta.testMode
    ? '<span class="spinner"></span>កំពុងបង្កើត Test Order…'
    : '<span class="spinner"></span>កំពុងបង្កើត KHQR…';

  try{
    const r = await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storyId})});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Order failed');
    activeOrder = data.orderId;

    if(data.testMode){
      modalBody.innerHTML = `
        <div class="eyebrow">🧪 BAKONG TEST MODE</div>
        <h2 class="modal-title">${esc(data.title)}</h2>
        <div class="pay-box">
          <div class="status" style="margin-bottom:14px">⚠️ TEST MODE — មិនបង្កើត KHQR ពិត និងមិនកាត់លុយពីគណនីណាមួយទេ។</div>
          <div class="amount-row"><span>តម្លៃសាកល្បង</span><strong class="price">${money(data.amount)}</strong></div>
          <div class="order-id">Test Order: ${esc(data.orderId)}</div>
          <div id="status" class="status">🧪 ចុចប៊ូតុងខាងក្រោម ដើម្បីសាកល្បង Payment Success និង Unlock Watch Page។</div>
          <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">🧪 សាកល្បង Payment Success</button>
        </div>
        <p class="small">បន្ទាប់ពីសាករួច សូមប្តូរ BAKONG_TEST_MODE ទៅ false មុនប្រើទទួលការទូទាត់ពិត។</p>`;
      $('#checkBtn').addEventListener('click', checkPayment);
      return;
    }

    modalBody.innerHTML = `
      <div class="eyebrow">BAKONG KHQR</div>
      <h2 class="modal-title">${esc(data.title)}</h2>
      <div class="pay-box">
        <div class="amount-row"><span>ត្រូវបង់</span><strong class="price">${money(data.amount)}</strong></div>
        <div class="qr-wrap"><img src="${data.qrDataUrl}" alt="Bakong KHQR"></div>
        <div class="order-id">Order: ${esc(data.orderId)}</div>
        <div id="status" class="status">⏳ Scan KHQR ហើយបង់តាមចំនួនខាងលើ។ បន្ទាប់មកចុច “ពិនិត្យការបង់”។</div>
        <button id="checkBtn" class="check-btn" style="width:100%;margin-top:13px">✅ ខ្ញុំបានបង់រួច — ពិនិត្យ</button>
      </div>
      <p class="small">កុំបិទផ្ទាំងនេះរហូតដល់ការបង់ត្រូវបានបញ្ជាក់។</p>`;
    $('#checkBtn').addEventListener('click', checkPayment);
  }catch(err){
    btn.disabled=false;
    btn.textContent = meta.testMode ? '🧪 សាកល្បង Payment' : '💳 ទិញតាម Bakong KHQR';
    modalBody.insertAdjacentHTML('beforeend', `<div class="status error">${esc(err.message)}</div>`);
  }
}

async function checkPayment(){
  if(!activeOrder) return;
  const btn = $('#checkBtn'); const status = $('#status');
  btn.disabled=true; btn.innerHTML='<span class="spinner"></span>កំពុងពិនិត្យ…';
  status.className='status';
  status.textContent = meta.testMode ? '🧪 កំពុងសាកល្បង Payment Success…' : 'កំពុងពិនិត្យ Transaction ជាមួយ Bakong…';

  try{
    const r = await fetch(`/api/orders/${encodeURIComponent(activeOrder)}/check`,{method:'POST'});
    const data = await r.json();
    if(!r.ok) throw new Error(data.error || 'Check failed');
    if(data.paid){
      status.className='status success';
      status.textContent = data.testMode
        ? '✅ TEST Payment ជោគជ័យ! កំពុងបើក Watch Page…'
        : '✅ បង់ជោគជ័យ! កំពុងបើករឿងពេញ…';
      setTimeout(()=>{ location.href=data.watchUrl; },700);
      return;
    }
    status.textContent='⏳ មិនទាន់រកឃើញការបង់ទេ។ សូមពិនិត្យចំនួនទឹកប្រាក់ ហើយសាកម្ដងទៀត។';
  }catch(err){
    status.className='status error';
    status.textContent=err.message;
  }
  btn.disabled=false;
  btn.textContent = meta.testMode ? '🧪 សាកល្បងម្តងទៀត' : '🔄 ពិនិត្យម្តងទៀត';
}

async function init(){
  await loadMeta();
  await loadStories();
}

init();
