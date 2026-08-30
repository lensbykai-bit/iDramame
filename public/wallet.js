const CFG = window.IDRAMA_SUPABASE || {};
const EDGE_URL = CFG.checkoutFunction || (CFG.url ? `${CFG.url}/functions/v1/idrama-checkout` : '');
const API_KEY = CFG.publishableKey || '';

const loginBox = document.getElementById('loginBox');
const wallet = document.getElementById('wallet');
const password = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const logoutBtn = document.getElementById('logoutBtn');
const bottomNav = document.getElementById('bottomNav');
const directQrBtn = document.getElementById('directQrBtn');
const amountQrBtn = document.getElementById('amountQrBtn');
const amount = document.getElementById('amount');
const refreshBtn = document.getElementById('refreshBtn');
const qrStatus = document.getElementById('qrStatus');
const qrBox = document.getElementById('qrBox');
const qrImage = document.getElementById('qrImage');
const qrMerchant = document.getElementById('qrMerchant');
const qrAmount = document.getElementById('qrAmount');
const qrType = document.getElementById('qrType');
const qrHint = document.getElementById('qrHint');
const transactions = document.getElementById('transactions');
const recordedBalance = document.getElementById('recordedBalance');
const paidCount = document.getElementById('paidCount');
const pendingCount = document.getElementById('pendingCount');
const orderCount = document.getElementById('orderCount');

let adminPassword = sessionStorage.getItem('idrama_wallet_admin') || '';

function money(v){ return `${Number(v || 0).toLocaleString('en-US')}៛`; }
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function adminCall(action,payload={}){
  const r = await fetch(EDGE_URL,{method:'POST',headers:{apikey:API_KEY,'Content-Type':'application/json'},body:JSON.stringify({action,adminPassword,...payload})});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error || 'Wallet request failed.');
  return d;
}

async function routeCall(path,payload={}){
  const r = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','x-admin-password':adminPassword},body:JSON.stringify(payload)});
  const d = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error || 'KHQR request failed.');
  return d;
}

function showWallet(){
  loginBox.hidden = true; wallet.classList.add('open'); logoutBtn.hidden = false; bottomNav.hidden = false;
}
function showLogin(){
  loginBox.hidden = false; wallet.classList.remove('open'); logoutBtn.hidden = true; bottomNav.hidden = true;
}

function renderOrders(rows){
  orderCount.textContent = rows.length;
  const paid = rows.filter(x=>x.status==='paid');
  const pending = rows.filter(x=>x.status==='awaiting_review'||x.status==='pending');
  paidCount.textContent = paid.length; pendingCount.textContent = pending.length;
  recordedBalance.textContent = money(paid.reduce((s,x)=>s+Number(x.amount_khr||0),0));
  if(!rows.length){ transactions.innerHTML='<div class="empty">មិនទាន់មានប្រវត្តិទូទាត់ទេ។</div>'; return; }
  transactions.innerHTML = rows.slice(0,80).map(o=>{
    const cls=o.status==='paid'?'paid':o.status==='rejected'?'rejected':'pending';
    const label=o.status==='paid'?'បានអនុម័ត':o.status==='rejected'?'បានបដិសេធ':'រង់ចាំ';
    return `<div class="tx"><div><strong>${esc(o.title||o.story_id||'Payment')}</strong><small>${new Date(o.created_at).toLocaleString('km-KH')}</small><small>${esc(o.id||'')}</small></div><div style="text-align:right"><strong>${money(o.amount_khr)}</strong><small class="${cls}">${label}</small></div></div>`;
  }).join('');
}

async function refresh(){
  refreshBtn.disabled=true;
  try{ const d=await adminCall('adminList'); renderOrders(d.orders||[]); }
  catch(e){ transactions.innerHTML=`<div class="empty" style="color:#ff9090">${esc(e.message)}</div>`; }
  finally{refreshBtn.disabled=false;}
}

async function login(){
  adminPassword=password.value.trim(); if(!adminPassword) return;
  loginBtn.disabled=true; loginStatus.textContent='កំពុងពិនិត្យ…'; loginStatus.className='status';
  try{ await adminCall('adminList'); sessionStorage.setItem('idrama_wallet_admin',adminPassword); showWallet(); await refresh(); }
  catch(e){ loginStatus.textContent=e.message; loginStatus.className='status error'; }
  finally{ loginBtn.disabled=false; }
}

function renderQr(d,isDirect){
  qrImage.src=d.qrDataUrl; qrMerchant.textContent=d.merchantName||'iDrama.ai';
  qrAmount.textContent=isDirect?'':money(d.amount);
  qrType.textContent=isDirect?'KHQR ទទួលប្រាក់ផ្ទាល់':'KHQR តាមចំនួនទឹកប្រាក់';
  qrHint.textContent=isDirect?'ភ្ញៀវបញ្ចូលចំនួនទឹកប្រាក់ក្នុង Bakong/Bank App':'សូមពិនិត្យចំនួនទឹកប្រាក់មុនបង់';
  qrBox.classList.add('open');
}

async function directQr(){
  directQrBtn.disabled=true; qrStatus.textContent='កំពុងបង្កើត KHQR…'; qrStatus.className='status'; qrBox.classList.remove('open');
  try{ const d=await routeCall('/api/admin/khqr/direct'); renderQr(d,true); qrStatus.textContent='✅ KHQR ទទួលប្រាក់ផ្ទាល់រួចរាល់'; qrStatus.className='status success'; }
  catch(e){ qrStatus.textContent=e.message; qrStatus.className='status error'; }
  finally{directQrBtn.disabled=false;}
}

async function amountQr(){
  const value=Number(amount.value||0); if(!Number.isInteger(value)||value<100){qrStatus.textContent='សូមបញ្ចូលចំនួនចាប់ពី 100៛ ឡើងទៅ។';qrStatus.className='status error';return;}
  amountQrBtn.disabled=true; qrStatus.textContent='កំពុងបង្កើត KHQR…'; qrStatus.className='status'; qrBox.classList.remove('open');
  try{ const d=await routeCall('/api/admin/khqr/generate',{amount:value}); renderQr(d,false); qrStatus.textContent='✅ KHQR រួចរាល់'; qrStatus.className='status success'; }
  catch(e){ qrStatus.textContent=e.message; qrStatus.className='status error'; }
  finally{amountQrBtn.disabled=false;}
}

loginBtn.addEventListener('click',login); password.addEventListener('keydown',e=>{if(e.key==='Enter')login();});
logoutBtn.addEventListener('click',()=>{sessionStorage.removeItem('idrama_wallet_admin');adminPassword='';password.value='';showLogin();});
directQrBtn.addEventListener('click',directQr); amountQrBtn.addEventListener('click',amountQr); refreshBtn.addEventListener('click',refresh);
document.getElementById('navReceive').addEventListener('click',()=>document.querySelector('.grid').scrollIntoView({behavior:'smooth'}));
document.getElementById('navHistory').addEventListener('click',()=>transactions.scrollIntoView({behavior:'smooth'}));

if(adminPassword){ showWallet(); refresh(); } else showLogin();