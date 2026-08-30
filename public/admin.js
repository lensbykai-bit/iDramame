const $ = (q, root=document) => root.querySelector(q);
const SESSION_KEY = 'aiStoryAdminPassword';
let password = sessionStorage.getItem(SESSION_KEY) || '';
let stories = [];

function esc(v=''){ return String(v).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c])); }
function money(v){ return `${Number(v || 0).toLocaleString('en-US')}៛`; }
function headers(){ return {'Content-Type':'application/json','x-admin-password':password}; }
function showStatus(el, text, type=''){ el.hidden=false; el.className=`status ${type}`; el.textContent=text; }
function hideStatus(el){ el.hidden=true; }

async function api(url, options={}){
  const res = await fetch(url, {...options, headers:{...headers(), ...(options.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
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
  $('#adminStories').innerHTML = stories.length ? stories.map(s=>`
    <article class="admin-story-card">
      <div class="admin-thumb">${s.cover_url ? `<img src="${esc(s.cover_url)}" alt="">` : '<span>AI</span>'}</div>
      <div class="admin-story-copy">
        <h3>${esc(s.title)}</h3>
        <div class="muted">${money(s.price_khr)} • ID: ${esc(s.id)}</div>
        <p>${esc(s.preview || '')}</p>
        <div class="admin-tags"><span>${s.preview_video_url ? '✅ Trailer' : '⚪ No trailer'}</span><span>${s.full_video_url ? '🔐 Full ready' : '⚠️ No full video'}</span></div>
      </div>
      <div class="admin-card-actions">
        <button class="ghost-btn" data-edit="${esc(s.id)}">កែ</button>
        <button class="danger-btn" data-delete="${esc(s.id)}">លុប</button>
      </div>
    </article>`).join('') : '<div class="loading">មិនទាន់មានរឿងទេ។</div>';
}

function resetForm(){
  $('#storyForm').reset();
  $('#price').value='5000';
  $('#storyId').value='';
  $('#formTitle').textContent='➕ បន្ថែមរឿងថ្មី';
  $('#cancelEdit').hidden=true;
  hideStatus($('#formStatus'));
}

function editStory(id){
  const s=stories.find(x=>x.id===id); if(!s) return;
  $('#storyId').value=s.id;
  $('#title').value=s.title || '';
  $('#preview').value=s.preview || '';
  $('#price').value=s.price_khr || 0;
  $('#coverUrl').value=s.cover_url || '';
  $('#trailerUrl').value=s.preview_video_url || '';
  $('#fullUrl').value=s.full_video_url || '';
  $('#formTitle').textContent=`✏️ កែ៖ ${s.title}`;
  $('#cancelEdit').hidden=false;
  window.scrollTo({top:0,behavior:'smooth'});
}

async function saveStory(e){
  e.preventDefault();
  const body={
    id: $('#storyId').value.trim(),
    title: $('#title').value.trim(),
    preview: $('#preview').value.trim(),
    price_khr: Number($('#price').value),
    cover_url: $('#coverUrl').value.trim(),
    preview_video_url: $('#trailerUrl').value.trim(),
    full_video_url: $('#fullUrl').value.trim()
  };
  const btn=e.submitter; if(btn) btn.disabled=true;
  showStatus($('#formStatus'),'កំពុងរក្សាទុក…');
  try{
    const saved = await api('/api/admin/stories',{method:'POST',body:JSON.stringify(body)});
    if(saved.persistedToGitHub === false){
      showStatus($('#formStatus'),'⚠️ បានរក្សាទុកលើ Server ប៉ុណ្ណោះ។ សូមដាក់ GITHUB_TOKEN ដើម្បីរក្សាទុកអចិន្ត្រៃយ៍។','error');
    }else{
      showStatus($('#formStatus'),'✅ រក្សាទុកជោគជ័យ','success');
    }
    const data=await api('/api/admin/stories'); stories=data.stories||[]; renderStories();
    if(saved.persistedToGitHub !== false) setTimeout(resetForm,700);
  }catch(err){ showStatus($('#formStatus'),err.message,'error'); }
  if(btn) btn.disabled=false;
}

async function deleteStory(id){
  const s=stories.find(x=>x.id===id); if(!s) return;
  if(!confirm(`លុប “${s.title}” មែនទេ?`)) return;
  try{
    const deleted = await api(`/api/admin/stories/${encodeURIComponent(id)}`,{method:'DELETE'});
    stories=stories.filter(x=>x.id!==id); renderStories();
    if(deleted.persistedToGitHub === false) alert('រឿងត្រូវបានលុបលើ Server ប៉ុណ្ណោះ។ ដាក់ GITHUB_TOKEN ដើម្បីរក្សាការកែប្រែឲ្យអចិន្ត្រៃយ៍។');
  }catch(err){ alert(err.message); }
}

$('#loginBtn').addEventListener('click', login);
$('#password').addEventListener('keydown', e=>{ if(e.key==='Enter') login(); });
$('#logoutBtn').addEventListener('click',()=>{ sessionStorage.removeItem(SESSION_KEY); location.reload(); });
$('#storyForm').addEventListener('submit', saveStory);
$('#cancelEdit').addEventListener('click', resetForm);
$('#adminStories').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]'); if(edit) editStory(edit.dataset.edit);
  const del=e.target.closest('[data-delete]'); if(del) deleteStory(del.dataset.delete);
});

loadDashboard();
