const $ = (q, root=document) => root.querySelector(q);
const SESSION_KEY = 'iDramaAiAdminPassword';
let password = sessionStorage.getItem(SESSION_KEY) || '';
let stories = [];
let meta = { checkout:false, testMode:false, mediaUploads:false, accountLibrary:false, series:false };
let episodeDraft = [];

function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c])); }
function money(v){ const n=Number(v || 0); return `$${(Number.isFinite(n)?n:0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function headers(){ return {'Content-Type':'application/json','x-admin-password':password}; }
function showStatus(el, text, type=''){ if(!el) return; el.hidden=false; el.className=`status ${type}`; el.textContent=text; }
function hideStatus(el){ if(el) el.hidden=true; }
function storyType(s){ return String(s?.content_type || '').toLowerCase()==='series' ? 'series' : 'movie'; }
function seriesEpisodes(s){ return Array.isArray(s?.episodes) ? s.episodes : []; }
function contentReady(s){ return storyType(s)==='series' ? seriesEpisodes(s).some(ep=>ep.file_id || ep.url) : Boolean(s?.full_video_file_id || s?.full_video_url); }

function mediaReady(s, type){
  if(type === 'cover') return Boolean(s.cover_file_id || s.cover_url);
  if(type === 'trailer') return Boolean(s.preview_video_file_id || s.preview_video_url);
  return contentReady(s);
}
function setMediaStatus(type, ready, text=''){
  const el = $(`#${type}Status`);
  if(!el) return;
  el.textContent = text || (ready ? '✅ មាន File រួច' : 'មិនទាន់ជ្រើស File');
  el.classList.toggle('ready', Boolean(ready));
}
function currentContentType(){ return document.querySelector('input[name="contentType"]:checked')?.value === 'series' ? 'series' : 'movie'; }
function nextEpisodeId(){
  let n=1;
  const used=new Set(episodeDraft.map(ep=>String(ep.id||'')));
  while(used.has(`ep-${String(n).padStart(2,'0')}`)) n++;
  return `ep-${String(n).padStart(2,'0')}`;
}
function newEpisode(data={}){
  return {
    key: `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,
    id: String(data.id || nextEpisodeId()),
    title: String(data.title || `ភាគ ${episodeDraft.length + 1}`),
    fileId: String(data.file_id || data.fileId || ''),
    url: String(data.url || ''),
    file: null
  };
}

async function api(url, options={}){
  const res = await fetch(url, {...options, headers:{...headers(), ...(options.headers||{})}, cache:'no-store'});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
async function uploadFile(kind, file){
  if(!file) return '';
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  const res = await fetch('/api/admin/upload', { method:'POST', headers:{'x-admin-password':password}, body:form });
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data.fileId || '';
}
async function uploadMedia(kind, inputId, existingFileId){
  const input = $(`#${inputId}`);
  const file = input?.files?.[0];
  if(!file) return existingFileId || '';
  setMediaStatus(kind, false, `⏳ កំពុង Upload ${file.name}…`);
  const fileId = await uploadFile(kind, file);
  setMediaStatus(kind, true, `✅ Upload រួច: ${file.name}`);
  return fileId;
}

async function loadMeta(){
  try{
    const res = await fetch('/api/meta', {cache:'no-store'});
    const data = await res.json();
    if(res.ok) meta = {...meta, ...data};
  }catch{}
  renderSystemStatus();
}
function renderSystemStatus(){
  const readyCount = stories.filter(contentReady).length;
  if($('#statStories')) $('#statStories').textContent = String(stories.length);
  if($('#statFull')) $('#statFull').textContent = String(readyCount);
  const bakongReady = Boolean(meta.checkout);
  const mediaReadyState = Boolean(meta.mediaUploads);
  const libraryReady = meta.accountLibrary !== false;
  if($('#statBakong')) $('#statBakong').textContent = bakongReady ? 'READY' : 'NOT READY';
  if($('#statMedia')) $('#statMedia').textContent = mediaReadyState ? 'READY' : 'NOT READY';
  if($('#bakongStatus')) $('#bakongStatus').textContent = bakongReady ? '✅ Ready' : '⚠️ Not configured';
  if($('#paymentMode')) $('#paymentMode').textContent = meta.testMode ? '🧪 USD Test Mode' : (bakongReady ? '💵 USD • Real Payment' : '—');
  if($('#mediaStatus')) $('#mediaStatus').textContent = mediaReadyState ? '✅ Ready' : '⚠️ Not configured';
  if($('#libraryStatus')) $('#libraryStatus').textContent = libraryReady ? '✅ Ready' : '⚠️ Not ready';
  const ok = bakongReady && libraryReady;
  if($('#systemOverall')){
    $('#systemOverall').textContent = ok ? '✅ Core System Ready' : '⚠️ Setup Required';
    $('#systemOverall').classList.toggle('ready', ok);
  }
}

function renderEpisodeManager(){
  const list=$('#episodeList');
  const empty=$('#episodeEmpty');
  if(!list || !empty) return;
  empty.hidden = episodeDraft.length > 0;
  list.innerHTML = episodeDraft.map((ep,index)=>{
    const ready=Boolean(ep.file || ep.fileId || ep.url);
    const state=ep.file ? `📎 ${esc(ep.file.name)}` : (ep.fileId || ep.url ? '✅ វីដេអូមានរួច' : 'មិនទាន់ជ្រើសវីដេអូ');
    return `<div class="episode-row" data-episode-key="${esc(ep.key)}">
      <div class="episode-number">${String(index+1).padStart(2,'0')}</div>
      <label class="episode-title-input"><input class="admin-input" data-episode-title="${esc(ep.key)}" value="${esc(ep.title)}" placeholder="ឈ្មោះភាគ ${index+1}" maxlength="140"></label>
      <label class="episode-file-wrap">
        <input class="admin-input" data-episode-file="${esc(ep.key)}" type="file" accept="video/*">
        <span class="episode-file-status ${ready?'ready':''}" data-episode-status="${esc(ep.key)}">${state}</span>
      </label>
      <button class="episode-remove" data-remove-episode="${esc(ep.key)}" type="button" title="លុបភាគ">✕</button>
    </div>`;
  }).join('');
}
function syncContentMode({autoEpisode=true}={}){
  const series=currentContentType()==='series';
  if($('#fullMovieCard')) $('#fullMovieCard').hidden=series;
  if($('#episodeSection')) $('#episodeSection').hidden=!series;
  if($('#mediaModeLabel')) $('#mediaModeLabel').textContent=series ? 'Cover + Trailer + Episodes' : 'Cover + Trailer + Full Movie';
  if(series && autoEpisode && !episodeDraft.length){ episodeDraft.push(newEpisode()); }
  renderEpisodeManager();
}

async function login(){
  password = $('#password').value.trim();
  if(!password) return showStatus($('#loginStatus'),'សូមបញ្ចូល Password','error');
  try{
    const data = await api('/api/admin/stories');
    sessionStorage.setItem(SESSION_KEY, password);
    stories = data.stories || [];
    $('#loginPanel').hidden = true;
    $('#dashboard').hidden = false;
    await loadMeta();
    renderStories();
  }catch(err){ showStatus($('#loginStatus'), err.message, 'error'); }
}
async function loadDashboard(){
  if(!password) return;
  try{
    const data = await api('/api/admin/stories');
    stories = data.stories || [];
    $('#loginPanel').hidden = true;
    $('#dashboard').hidden = false;
    await loadMeta();
    renderStories();
  }catch{
    sessionStorage.removeItem(SESSION_KEY);
    password='';
  }
}
function filteredStories(){
  const q = String($('#adminSearch')?.value || '').trim().toLowerCase();
  return q ? stories.filter(s=>`${s.title} ${s.preview || ''} ${s.id}`.toLowerCase().includes(q)) : stories;
}
function renderStories(){
  const visible = filteredStories();
  $('#adminCount').textContent = `${visible.length}/${stories.length} រឿង`;
  renderSystemStatus();
  $('#adminStories').innerHTML = visible.length ? visible.map(s=>{
    const type=storyType(s);
    const eps=seriesEpisodes(s).filter(ep=>ep.file_id || ep.url);
    const coverTag = mediaReady(s,'cover') ? '🖼️ Cover' : '⚪ No Cover';
    const trailerTag = mediaReady(s,'trailer') ? '🎞️ Trailer' : '⚪ No Trailer';
    const contentTag = type==='series' ? `📺 ${eps.length} ភាគ` : (contentReady(s) ? '🔐 Full Movie' : '⚠️ No Full Movie');
    const coverSrc = s.cover_file_id ? `/api/media/${encodeURIComponent(s.cover_file_id)}` : (s.cover_url || '');
    const readiness = contentReady(s) ? 'ready' : 'incomplete';
    return `<article class="admin-story-card ${readiness}">
      <div class="admin-thumb">${coverSrc ? `<img src="${esc(coverSrc)}" alt="${esc(s.title)}">` : '<span>iD</span>'}</div>
      <div class="admin-story-copy">
        <div class="story-title-line"><h3>${esc(s.title)}</h3><span class="story-ready-badge ${readiness}">${contentReady(s) ? 'READY TO SELL' : 'INCOMPLETE'}</span></div>
        <div class="muted">${money(s.price_khr)} • ${type==='series'?'Series':'Movie'} • ID: ${esc(s.id)}</div>
        <p>${esc(s.preview || '')}</p>
        <div class="admin-tags"><span>${coverTag}</span><span>${trailerTag}</span><span class="${type==='series'?'series-tag':''}">${contentTag}</span></div>
      </div>
      <div class="admin-card-actions"><button class="ghost-btn" data-edit="${esc(s.id)}">✏️ កែ</button><button class="danger-btn" data-delete="${esc(s.id)}">🗑️ លុប</button></div>
    </article>`;
  }).join('') : '<div class="loading">រកមិនឃើញរឿងទេ។</div>';
}

function resetForm(){
  $('#storyForm').reset();
  $('#price').value='1.00';
  $('#storyId').value='';
  $('#coverFileId').value='';
  $('#trailerFileId').value='';
  $('#fullFileId').value='';
  $('#coverLegacyUrl').value='';
  $('#trailerLegacyUrl').value='';
  $('#fullLegacyUrl').value='';
  episodeDraft=[];
  $('#formTitle').textContent='➕ បន្ថែមរឿងថ្មី';
  $('#cancelEdit').hidden=true;
  setMediaStatus('cover', false, 'មិនទាន់ជ្រើសរូប');
  setMediaStatus('trailer', false, 'មិនទាន់ជ្រើស Trailer');
  setMediaStatus('full', false, 'មិនទាន់ជ្រើស Full Movie');
  hideStatus($('#formStatus'));
  syncContentMode({autoEpisode:false});
}
function editStory(id){
  const s=stories.find(x=>x.id===id);
  if(!s) return;
  $('#storyId').value=s.id;
  $('#title').value=s.title || '';
  $('#preview').value=s.preview || '';
  $('#price').value=s.price_khr || 0;
  $('#coverFileId').value=s.cover_file_id || '';
  $('#trailerFileId').value=s.preview_video_file_id || '';
  $('#fullFileId').value=s.full_video_file_id || '';
  $('#coverLegacyUrl').value=s.cover_url || '';
  $('#trailerLegacyUrl').value=s.preview_video_url || '';
  $('#fullLegacyUrl').value=s.full_video_url || '';
  $('#coverFile').value='';
  $('#trailerFile').value='';
  $('#fullFile').value='';
  const type=storyType(s);
  const radio=document.querySelector(`input[name="contentType"][value="${type}"]`);
  if(radio) radio.checked=true;
  episodeDraft=seriesEpisodes(s).map(ep=>newEpisode(ep));
  setMediaStatus('cover', mediaReady(s,'cover'), mediaReady(s,'cover') ? '✅ Cover មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Cover');
  setMediaStatus('trailer', mediaReady(s,'trailer'), mediaReady(s,'trailer') ? '✅ Trailer មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Trailer');
  setMediaStatus('full', type==='movie' && contentReady(s), type==='movie' && contentReady(s) ? '✅ Full Movie មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Full Movie');
  syncContentMode({autoEpisode:type==='series'});
  $('#formTitle').textContent=`✏️ កែ៖ ${s.title}`;
  $('#cancelEdit').hidden=false;
  document.querySelector('.story-editor-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function saveStory(e){
  e.preventDefault();
  const btn=e.submitter || $('#saveBtn');
  if(btn) btn.disabled=true;
  showStatus($('#formStatus'),'⏳ កំពុង Upload និងរក្សាទុក…');
  try{
    const type=currentContentType();
    const usdPrice=Number($('#price').value);
    if(!Number.isFinite(usdPrice) || usdPrice <= 0) throw new Error('សូមបញ្ចូលតម្លៃ USD ដែលធំជាង $0.00។');
    let coverFileId = $('#coverFileId').value.trim();
    let trailerFileId = $('#trailerFileId').value.trim();
    let fullFileId = $('#fullFileId').value.trim();
    coverFileId = await uploadMedia('cover','coverFile',coverFileId);
    $('#coverFileId').value = coverFileId;
    trailerFileId = await uploadMedia('trailer','trailerFile',trailerFileId);
    $('#trailerFileId').value = trailerFileId;

    let episodes=[];
    if(type==='series'){
      if(!episodeDraft.length) throw new Error('សូមបន្ថែមយ៉ាងហោចណាស់ 1 ភាគ។');
      for(let i=0;i<episodeDraft.length;i++){
        const ep=episodeDraft[i];
        const title=String(ep.title||'').trim() || `ភាគ ${i+1}`;
        const status=$(`[data-episode-status="${CSS.escape(ep.key)}"]`);
        let fileId=ep.fileId || '';
        if(ep.file){
          if(status){status.textContent=`⏳ កំពុង Upload ${ep.file.name}…`;status.classList.remove('ready');}
          fileId=await uploadFile('episode',ep.file);
          ep.fileId=fileId;
          ep.file=null;
          if(status){status.textContent='✅ Upload រួច';status.classList.add('ready');}
        }
        if(!fileId && !ep.url) throw new Error(`សូមជ្រើសវីដេអូសម្រាប់ ${title}។`);
        episodes.push({id:ep.id,title,file_id:fileId,url:ep.url||''});
      }
    }else{
      fullFileId = await uploadMedia('full','fullFile',fullFileId);
      $('#fullFileId').value = fullFileId;
    }

    const body={
      id: $('#storyId').value.trim(),
      placement: 'web',
      content_type:type,
      title: $('#title').value.trim(),
      preview: $('#preview').value.trim(),
      price_khr: Math.round(usdPrice * 100) / 100,
      cover_file_id: coverFileId,
      preview_video_file_id: trailerFileId,
      full_video_file_id: type==='movie' ? fullFileId : '',
      episodes,
      cover_url: $('#coverLegacyUrl').value.trim(),
      preview_video_url: $('#trailerLegacyUrl').value.trim(),
      full_video_url: type==='movie' ? $('#fullLegacyUrl').value.trim() : '',
      telegram_url: ''
    };
    const saved = await api('/api/admin/stories',{method:'POST',body:JSON.stringify(body)});
    if(saved.persistedToGitHub === false){
      showStatus($('#formStatus'),'⚠️ Media បាន Upload រួច ប៉ុន្តែ Story រក្សាទុកលើ Server ប៉ុណ្ណោះ។ សូមពិនិត្យ GITHUB_TOKEN។','error');
    }else{
      showStatus($('#formStatus'),type==='series' ? `✅ រក្សាទុក Series ជោគជ័យ — ${episodes.length} ភាគ • ${money(usdPrice)}។` : `✅ រក្សាទុក Movie ជោគជ័យ • ${money(usdPrice)}។`,'success');
    }
    const data=await api('/api/admin/stories');
    stories=data.stories||[];
    renderStories();
    if(saved.persistedToGitHub !== false) setTimeout(resetForm,1100);
  }catch(err){ showStatus($('#formStatus'),err.message,'error'); }
  if(btn) btn.disabled=false;
}

async function deleteStory(id){
  const s=stories.find(x=>x.id===id);
  if(!s) return;
  if(!confirm(`លុប “${s.title}” មែនទេ?`)) return;
  try{
    const deleted = await api(`/api/admin/stories/${encodeURIComponent(id)}`,{method:'DELETE'});
    stories=stories.filter(x=>x.id!==id);
    renderStories();
    if(deleted.persistedToGitHub === false) alert('រឿងត្រូវបានលុបលើ Server ប៉ុណ្ណោះ។ សូមពិនិត្យ GITHUB_TOKEN។');
  }catch(err){ alert(err.message); }
}
async function refreshDashboard(){
  const btn = $('#refreshBtn');
  if(btn) btn.disabled = true;
  try{
    const data = await api('/api/admin/stories');
    stories = data.stories || [];
    await loadMeta();
    renderStories();
  }catch(err){ alert(err.message); }
  if(btn) btn.disabled = false;
}

$('#loginBtn').addEventListener('click', login);
$('#password').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
$('#logoutBtn').addEventListener('click',()=>{ sessionStorage.removeItem(SESSION_KEY); location.reload(); });
$('#refreshBtn')?.addEventListener('click',refreshDashboard);
$('#storyForm').addEventListener('submit', saveStory);
$('#cancelEdit').addEventListener('click', resetForm);
$('#clearBtn')?.addEventListener('click', resetForm);
$('#adminSearch')?.addEventListener('input', renderStories);

document.querySelectorAll('input[name="contentType"]').forEach(radio=>radio.addEventListener('change',()=>syncContentMode({autoEpisode:true})));
$('#addEpisodeBtn')?.addEventListener('click',()=>{ episodeDraft.push(newEpisode()); renderEpisodeManager(); });
$('#episodeList')?.addEventListener('input',e=>{
  const titleInput=e.target.closest('[data-episode-title]');
  if(!titleInput) return;
  const ep=episodeDraft.find(row=>row.key===titleInput.dataset.episodeTitle);
  if(ep) ep.title=titleInput.value;
});
$('#episodeList')?.addEventListener('change',e=>{
  const fileInput=e.target.closest('[data-episode-file]');
  if(!fileInput) return;
  const ep=episodeDraft.find(row=>row.key===fileInput.dataset.episodeFile);
  if(!ep) return;
  ep.file=fileInput.files?.[0] || null;
  const status=$(`[data-episode-status="${CSS.escape(ep.key)}"]`);
  if(status){ status.textContent=ep.file ? `📎 ${ep.file.name}` : (ep.fileId?'✅ វីដេអូមានរួច':'មិនទាន់ជ្រើសវីដេអូ'); status.classList.toggle('ready',Boolean(ep.file || ep.fileId || ep.url)); }
});
$('#episodeList')?.addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove-episode]');
  if(!remove) return;
  episodeDraft=episodeDraft.filter(ep=>ep.key!==remove.dataset.removeEpisode);
  renderEpisodeManager();
});

$('#coverFile').addEventListener('change',()=>setMediaStatus('cover',Boolean($('#coverFile').files[0]),$('#coverFile').files[0] ? `📎 ${$('#coverFile').files[0].name}` : 'មិនទាន់ជ្រើសរូប'));
$('#trailerFile').addEventListener('change',()=>setMediaStatus('trailer',Boolean($('#trailerFile').files[0]),$('#trailerFile').files[0] ? `📎 ${$('#trailerFile').files[0].name}` : 'មិនទាន់ជ្រើស Trailer'));
$('#fullFile').addEventListener('change',()=>setMediaStatus('full',Boolean($('#fullFile').files[0]),$('#fullFile').files[0] ? `📎 ${$('#fullFile').files[0].name}` : 'មិនទាន់ជ្រើស Full Movie'));

$('#adminStories').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]');
  if(edit) editStory(edit.dataset.edit);
  const del=e.target.closest('[data-delete]');
  if(del) deleteStory(del.dataset.delete);
});

syncContentMode({autoEpisode:false});
loadDashboard();