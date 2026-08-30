const $ = (q, root=document) => root.querySelector(q);
const SESSION_KEY = 'iDramaAiAdminPassword';
let password = sessionStorage.getItem(SESSION_KEY) || '';
let stories = [];

function esc(v=''){ return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function money(v){ return `${Number(v || 0).toLocaleString('en-US')}៛`; }
function headers(){ return {'Content-Type':'application/json','x-admin-password':password}; }
function showStatus(el, text, type=''){ el.hidden=false; el.className=`status ${type}`; el.textContent=text; }
function hideStatus(el){ el.hidden=true; }

function mediaReady(s, type){
  if(type === 'cover') return Boolean(s.cover_file_id || s.cover_url);
  if(type === 'trailer') return Boolean(s.preview_video_file_id || s.preview_video_url);
  return Boolean(s.full_video_file_id || s.full_video_url);
}

function setMediaStatus(type, ready, text=''){
  const el = $(`#${type}Status`);
  if(!el) return;
  el.textContent = text || (ready ? '✅ មាន File រួច' : 'មិនទាន់ជ្រើស File');
}

async function api(url, options={}){
  const res = await fetch(url, {...options, headers:{...headers(), ...(options.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function uploadMedia(kind, inputId, existingFileId){
  const input = $(`#${inputId}`);
  const file = input?.files?.[0];
  if(!file) return existingFileId || '';

  setMediaStatus(kind, false, `⏳ កំពុង Upload ${file.name}…`);
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);

  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: {'x-admin-password': password},
    body: form
  });

  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);

  setMediaStatus(kind, true, `✅ Upload រួច: ${file.name}`);
  return data.fileId || '';
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
    renderStories();
  }catch(err){
    showStatus($('#loginStatus'), err.message, 'error');
  }
}

async function loadDashboard(){
  if(!password) return;
  try{
    const data = await api('/api/admin/stories');
    stories = data.stories || [];
    $('#loginPanel').hidden = true;
    $('#dashboard').hidden = false;
    renderStories();
  }catch{
    sessionStorage.removeItem(SESSION_KEY);
    password='';
  }
}

function renderStories(){
  $('#adminCount').textContent = `${stories.length} រឿង`;

  $('#adminStories').innerHTML = stories.length ? stories.map(s=>{
    const coverTag = mediaReady(s,'cover') ? '🖼️ Cover ready' : '⚪ No cover';
    const trailerTag = mediaReady(s,'trailer') ? '✅ Trailer ready' : '⚪ No trailer';
    const fullTag = mediaReady(s,'full') ? '🔐 Full Movie ready' : '⚠️ No Full Movie';
    const coverSrc = s.cover_file_id ? `/api/media/${encodeURIComponent(s.cover_file_id)}` : (s.cover_url || '');

    return `
    <article class="admin-story-card">
      <div class="admin-thumb">${coverSrc ? `<img src="${esc(coverSrc)}" alt="">` : '<span>AI</span>'}</div>
      <div class="admin-story-copy">
        <h3>${esc(s.title)}</h3>
        <div class="muted">${money(s.price_khr)} • ID: ${esc(s.id)}</div>
        <p>${esc(s.preview || '')}</p>
        <div class="admin-tags">
          <span>🌐 Website</span>
          <span>${coverTag}</span>
          <span>${trailerTag}</span>
          <span>${fullTag}</span>
        </div>
      </div>
      <div class="admin-card-actions">
        <button class="ghost-btn" data-edit="${esc(s.id)}">កែ</button>
        <button class="danger-btn" data-delete="${esc(s.id)}">លុប</button>
      </div>
    </article>`;
  }).join('') : '<div class="loading">មិនទាន់មានរឿងទេ។</div>';
}

function resetForm(){
  $('#storyForm').reset();
  $('#price').value='5000';
  $('#storyId').value='';
  $('#coverFileId').value='';
  $('#trailerFileId').value='';
  $('#fullFileId').value='';
  $('#coverLegacyUrl').value='';
  $('#trailerLegacyUrl').value='';
  $('#fullLegacyUrl').value='';
  $('#formTitle').textContent='➕ បន្ថែមរឿងថ្មី';
  $('#cancelEdit').hidden=true;
  setMediaStatus('cover', false, 'មិនទាន់ជ្រើសរូប');
  setMediaStatus('trailer', false, 'មិនទាន់ជ្រើសវីដេអូ');
  setMediaStatus('full', false, 'មិនទាន់ជ្រើស Full Movie');
  hideStatus($('#formStatus'));
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

  setMediaStatus('cover', mediaReady(s,'cover'), mediaReady(s,'cover') ? '✅ Cover មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Cover');
  setMediaStatus('trailer', mediaReady(s,'trailer'), mediaReady(s,'trailer') ? '✅ Trailer មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Trailer');
  setMediaStatus('full', mediaReady(s,'full'), mediaReady(s,'full') ? '✅ Full Movie មានរួច — ជ្រើស File ថ្មីបើចង់ប្តូរ' : 'មិនទាន់មាន Full Movie');

  $('#formTitle').textContent=`✏️ កែ៖ ${s.title}`;
  $('#cancelEdit').hidden=false;
  window.scrollTo({top:0,behavior:'smooth'});
}

async function saveStory(e){
  e.preventDefault();
  const btn=e.submitter;
  if(btn) btn.disabled=true;
  showStatus($('#formStatus'),'⏳ កំពុង Upload និងរក្សាទុក…');

  try{
    let coverFileId = $('#coverFileId').value.trim();
    let trailerFileId = $('#trailerFileId').value.trim();
    let fullFileId = $('#fullFileId').value.trim();

    coverFileId = await uploadMedia('cover','coverFile',coverFileId);
    $('#coverFileId').value = coverFileId;

    trailerFileId = await uploadMedia('trailer','trailerFile',trailerFileId);
    $('#trailerFileId').value = trailerFileId;

    fullFileId = await uploadMedia('full','fullFile',fullFileId);
    $('#fullFileId').value = fullFileId;

    const body={
      id: $('#storyId').value.trim(),
      placement: 'web',
      title: $('#title').value.trim(),
      preview: $('#preview').value.trim(),
      price_khr: Number($('#price').value),
      cover_file_id: coverFileId,
      preview_video_file_id: trailerFileId,
      full_video_file_id: fullFileId,
      cover_url: $('#coverLegacyUrl').value.trim(),
      preview_video_url: $('#trailerLegacyUrl').value.trim(),
      full_video_url: $('#fullLegacyUrl').value.trim(),
      telegram_url: ''
    };

    const saved = await api('/api/admin/stories',{
      method:'POST',
      body:JSON.stringify(body)
    });

    if(saved.persistedToGitHub === false){
      showStatus(
        $('#formStatus'),
        '⚠️ Media បាន Upload រួច ប៉ុន្តែ Story រក្សាទុកលើ Server ប៉ុណ្ណោះ។ សូមពិនិត្យ GITHUB_TOKEN។',
        'error'
      );
    }else{
      showStatus(
        $('#formStatus'),
        '✅ រក្សាទុកជោគជ័យ — រឿងនេះបង្ហាញនៅ Website ហើយ Full Movie ត្រូវបង់ Bakong មុនមើល។',
        'success'
      );
    }

    const data=await api('/api/admin/stories');
    stories=data.stories||[];
    renderStories();

    if(saved.persistedToGitHub !== false) setTimeout(resetForm,1400);
  }catch(err){
    showStatus($('#formStatus'),err.message,'error');
  }

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
    if(deleted.persistedToGitHub === false){
      alert('រឿងត្រូវបានលុបលើ Server ប៉ុណ្ណោះ។ សូមពិនិត្យ GITHUB_TOKEN។');
    }
  }catch(err){
    alert(err.message);
  }
}

$('#loginBtn').addEventListener('click', login);
$('#password').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
$('#logoutBtn').addEventListener('click',()=>{ sessionStorage.removeItem(SESSION_KEY); location.reload(); });
$('#storyForm').addEventListener('submit', saveStory);
$('#cancelEdit').addEventListener('click', resetForm);

$('#coverFile').addEventListener('change',()=>setMediaStatus(
  'cover',
  Boolean($('#coverFile').files[0]),
  $('#coverFile').files[0] ? `📎 ${$('#coverFile').files[0].name}` : 'មិនទាន់ជ្រើសរូប'
));
$('#trailerFile').addEventListener('change',()=>setMediaStatus(
  'trailer',
  Boolean($('#trailerFile').files[0]),
  $('#trailerFile').files[0] ? `📎 ${$('#trailerFile').files[0].name}` : 'មិនទាន់ជ្រើសវីដេអូ'
));
$('#fullFile').addEventListener('change',()=>setMediaStatus(
  'full',
  Boolean($('#fullFile').files[0]),
  $('#fullFile').files[0] ? `📎 ${$('#fullFile').files[0].name}` : 'មិនទាន់ជ្រើស Full Movie'
));

$('#adminStories').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]');
  if(edit) editStory(edit.dataset.edit);

  const del=e.target.closest('[data-delete]');
  if(del) deleteStory(del.dataset.delete);
});

loadDashboard();
