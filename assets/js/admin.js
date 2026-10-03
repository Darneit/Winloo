const SUPABASE_URL='/api/supabase';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsamZyYW56aGNiaWNxbG1kemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTI5MjksImV4cCI6MjEwNjU4ODkyOX0.Q-4RG7m8QelzCQdryNV0eYokD2pwoXv17t2U6Cl43H0';
const SESSION_KEY='winloo_admin_session';
const SEEN_ENQUIRIES_KEY='winloo_seen_enquiries';
const SEEN_APPLICATIONS_KEY='winloo_seen_applications';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString():'—';
const plain=s=>String(s??'').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7E\n]/g,' ');

let session=null;
let enquiries=[],applications=[],jobs=[];
let trashedEnquiries=[],trashedApplications=[],trashedJobs=[];
let liveStarted=false,liveTimer=null,liveBusy=false,initialLiveSnapshot=true;
let enquiryFingerprint='',applicationFingerprint='',jobsFingerprint='',trashFingerprint='';

function authHeaders(extra={}){
  return {apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${session?.access_token||SUPABASE_ANON_KEY}`,...extra};
}
async function refreshSession(){
  if(!session?.refresh_token)throw new Error('Session expired. Please sign in again.');
  const res=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{
    method:'POST',
    headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.msg||data?.error_description||data?.message||'Session refresh failed');
  saveSession(data);
  return data;
}
async function api(path,{method='GET',body,headers={},retry=true}={}){
  const make=()=>fetch(SUPABASE_URL+path,{
    method,
    headers:authHeaders({...headers,...(body?{'Content-Type':'application/json'}:{})}),
    body:body?JSON.stringify(body):undefined
  });
  let res=await make();
  if(res.status===401&&retry&&session?.refresh_token){
    try{await refreshSession();res=await make()}
    catch{
      saveSession(null);showLogin();
      throw new Error('Session expired. Please sign in again.');
    }
  }
  const text=await res.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||`Request failed (${res.status})`);
  return data;
}
function saveSession(value){session=value;if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{session=null}}

async function signIn(email,password){
  const res=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
    method:'POST',
    headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.msg||data?.error_description||data?.message||'Sign in failed');
  saveSession(data);
}
async function signOut(){saveSession(null)}
async function isAdmin(){
  if(!session?.user?.id)return false;
  try{
    const rows=await api(`/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(session.user.id)}`);
    return Array.isArray(rows)&&rows.length===1;
  }catch{return false}
}
function showLogin(){
  const login=$('#login-view'),admin=$('#admin-view');
  login.hidden=false;admin.hidden=true;login.style.display='grid';admin.style.display='none';
}
function showAdmin(){
  const login=$('#login-view'),admin=$('#admin-view');
  login.hidden=true;admin.hidden=false;login.style.display='none';admin.style.display='grid';
}
async function boot(){
  loadSession();
  if(session?.access_token){
    if(session.expires_at&&Date.now()>=(session.expires_at*1000)-30000){
      try{await refreshSession()}catch{saveSession(null)}
    }
    if(session?.access_token&&await isAdmin())return enterAdmin();
  }
  saveSession(null);showLogin();
}
async function enterAdmin(){
  showAdmin();
  $('#admin-user').textContent=session?.user?.email||'Administrator';
  try{await refreshAll();startLiveUpdates()}
  catch(err){
    const recent=$('#recent-activity');
    if(recent)recent.innerHTML='<p>Admin loaded, but dashboard data could not be loaded: '+esc(err.message)+'</p>';
  }
}

$('#admin-login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#login-status');
  status.textContent='Signing in…';status.className='admin-form-status';
  try{
    await signIn($('#admin-email').value.trim(),$('#admin-password').value);
    if(!await isAdmin()){await signOut();throw new Error('This account is not authorised for Winloo Admin.')}
    status.textContent='Signed in. Opening dashboard…';showAdmin();location.reload();
  }catch(err){status.textContent=err.message||'Sign in failed.';status.classList.add('error')}
});
$('#admin-logout').addEventListener('click',async()=>{await signOut();location.reload()});

$$('.admin-nav').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.admin-nav').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  const p=btn.dataset.panel;
  $$('[data-panel-view]').forEach(v=>v.hidden=v.dataset.panelView!==p);
  $('#panel-title').textContent=btn.querySelector('span')?.textContent?.trim()||btn.textContent.trim();
  if(p==='enquiries')markAllSeen('enquiries');
  if(p==='applications')markAllSeen('applications');
}));

async function refreshAll(){
  await Promise.all([loadEnquiries(true),loadApplications(true),loadJobs(true),loadTrash(true)]);
  renderOverview();updateNavBadges();initialLiveSnapshot=false;
}
async function loadEnquiries(force=false){
  const next=await api('/rest/v1/enquiries?select=*&deleted_at=is.null&order=created_at.desc')||[];
  const fp=JSON.stringify(next.map(x=>[x.id,x.status,x.updated_at]));
  if(force||fp!==enquiryFingerprint){
    const oldIds=new Set(enquiries.map(x=>x.id));
    const added=initialLiveSnapshot?[]:next.filter(x=>!oldIds.has(x.id));
    enquiries=next;enquiryFingerprint=fp;renderEnquiries();renderOverview();updateNavBadges();
    if(added.length)showLiveToast(added.length===1?'New enquiry received':added.length+' new enquiries received');
  }
}
async function loadApplications(force=false){
  const next=await api('/rest/v1/applications?select=*,jobs(title)&deleted_at=is.null&order=created_at.desc')||[];
  const fp=JSON.stringify(next.map(x=>[x.id,x.status,x.updated_at,x.job_id]));
  if(force||fp!==applicationFingerprint){
    const oldIds=new Set(applications.map(x=>x.id));
    const added=initialLiveSnapshot?[]:next.filter(x=>!oldIds.has(x.id));
    applications=next;applicationFingerprint=fp;renderApplications();renderOverview();updateNavBadges();
    if(added.length)showLiveToast(added.length===1?'New application received':added.length+' new applications received');
  }
}
async function loadJobs(force=false){
  const next=await api('/rest/v1/jobs?select=*&deleted_at=is.null&order=sort_order.asc,created_at.desc')||[];
  const fp=JSON.stringify(next.map(x=>[x.id,x.status,x.updated_at,x.sort_order]));
  if(force||fp!==jobsFingerprint){
    jobs=next;jobsFingerprint=fp;renderJobs();renderOverview();updateNavBadges();
  }
}
async function loadTrash(force=false){
  const [e,a,j]=await Promise.all([
    api('/rest/v1/enquiries?select=*&deleted_at=not.is.null&order=deleted_at.desc'),
    api('/rest/v1/applications?select=*,jobs(title)&deleted_at=not.is.null&order=deleted_at.desc'),
    api('/rest/v1/jobs?select=*&deleted_at=not.is.null&order=deleted_at.desc')
  ]);
  const fp=JSON.stringify([
    ...(e||[]).map(x=>['e',x.id,x.deleted_at]),
    ...(a||[]).map(x=>['a',x.id,x.deleted_at]),
    ...(j||[]).map(x=>['j',x.id,x.deleted_at])
  ]);
  if(force||fp!==trashFingerprint){
    trashedEnquiries=e||[];trashedApplications=a||[];trashedJobs=j||[];trashFingerprint=fp;
    renderTrash();updateNavBadges();
  }
}

function getSeenIds(key){try{return new Set(JSON.parse(localStorage.getItem(key)||'[]'))}catch{return new Set()}}
function saveSeenIds(key,set){localStorage.setItem(key,JSON.stringify([...set].slice(-500)))}
function markAllSeen(type){
  const key=type==='enquiries'?SEEN_ENQUIRIES_KEY:SEEN_APPLICATIONS_KEY;
  const seen=getSeenIds(key);
  (type==='enquiries'?enquiries:applications).forEach(x=>seen.add(x.id));
  saveSeenIds(key,seen);updateNavBadges();
}
function unseenCount(items,key){const seen=getSeenIds(key);return items.filter(x=>!seen.has(x.id)).length}
function setBadge(id,count){const el=$(id);if(!el)return;el.textContent=String(count);el.hidden=count<1}
function updateNavBadges(){
  setBadge('#badge-enquiries',unseenCount(enquiries,SEEN_ENQUIRIES_KEY));
  setBadge('#badge-applications',unseenCount(applications,SEEN_APPLICATIONS_KEY));
  setBadge('#badge-jobs',jobs.filter(x=>x.status==='published').length);
  setBadge('#badge-trash',trashedEnquiries.length+trashedApplications.length+trashedJobs.length);
}

let toastTimer=null;
function showLiveToast(message){
  const el=$('#admin-live-toast');if(!el)return;
  el.textContent=message;el.hidden=false;requestAnimationFrame(()=>el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>{el.hidden=true},220)},2600);
}
async function silentLiveRefresh(){
  if(liveBusy||document.hidden||!session?.access_token)return;
  liveBusy=true;
  try{await Promise.all([loadEnquiries(),loadApplications(),loadJobs(),loadTrash()])}catch{}
  finally{liveBusy=false}
}
function startLiveUpdates(){
  if(liveStarted)return;
  liveStarted=true;clearInterval(liveTimer);liveTimer=setInterval(silentLiveRefresh,2000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)silentLiveRefresh()});
}

function renderOverview(){
  $('#stat-enquiries').textContent=enquiries.filter(x=>x.status==='new').length;
  $('#stat-applications').textContent=applications.filter(x=>x.status==='new').length;
  $('#stat-jobs').textContent=jobs.filter(x=>x.status==='published').length;
  const activity=[
    ...enquiries.slice(0,5).map(x=>({type:'Enquiry',name:x.project_name||x.company||x.contact_person,date:x.created_at})),
    ...applications.slice(0,5).map(x=>({type:'Application',name:x.full_name+' - '+x.position,date:x.created_at}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  $('#recent-activity').innerHTML=activity.length?activity.map(x=>`<div class="admin-activity-item"><span><strong>${esc(x.type)}</strong> · ${esc(x.name)}</span><small>${esc(fmt(x.date))}</small></div>`).join(''):'<p>No submissions yet.</p>';
}

function sortRows(rows,mode,nameGetter){
  const out=[...rows];
  if(mode==='oldest')out.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(mode==='name'||mode==='title')out.sort((a,b)=>nameGetter(a).localeCompare(nameGetter(b)));
  else if(mode==='status')out.sort((a,b)=>String(a.status||'').localeCompare(String(b.status||''))||new Date(b.created_at)-new Date(a.created_at));
  else out.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return out;
}
function visibleEnquiries(){
  const q=$('#enquiry-search')?.value.trim().toLowerCase()||'';
  const status=$('#enquiry-status-filter')?.value||'';
  let rows=enquiries.filter(x=>(!status||x.status===status)&&(!q||[x.contact_person,x.company,x.project_name,x.required_service,x.email].some(v=>String(v||'').toLowerCase().includes(q))));
  return sortRows(rows,$('#enquiry-sort')?.value||'newest',x=>x.contact_person||'');
}
function visibleApplications(){
  const q=$('#application-search')?.value.trim().toLowerCase()||'';
  const status=$('#application-status-filter')?.value||'';
  let rows=applications.filter(x=>(!status||x.status===status)&&(!q||[x.full_name,x.position,x.email,x.current_location,x.jobs?.title].some(v=>String(v||'').toLowerCase().includes(q))));
  return sortRows(rows,$('#application-sort')?.value||'newest',x=>x.full_name||'');
}
function visibleJobs(){
  return sortRows(jobs,$('#job-sort')?.value||'newest',x=>x.title||'');
}

function enquiryStatus(id,value){return `<select data-status-type="enquiry" data-id="${esc(id)}"><option value="new" ${value==='new'?'selected':''}>New</option><option value="contacted" ${value==='contacted'?'selected':''}>Contacted</option><option value="in_progress" ${value==='in_progress'?'selected':''}>In progress</option><option value="closed" ${value==='closed'?'selected':''}>Closed</option><option value="spam" ${value==='spam'?'selected':''}>Spam</option></select>`}
function applicationStatus(id,value){return `<select data-status-type="application" data-id="${esc(id)}"><option value="new" ${value==='new'?'selected':''}>New</option><option value="reviewing" ${value==='reviewing'?'selected':''}>Reviewing</option><option value="shortlisted" ${value==='shortlisted'?'selected':''}>Shortlisted</option><option value="interview" ${value==='interview'?'selected':''}>Interview</option><option value="hired" ${value==='hired'?'selected':''}>Hired</option><option value="rejected" ${value==='rejected'?'selected':''}>Rejected</option><option value="archived" ${value==='archived'?'selected':''}>Archived</option></select>`}

function renderEnquiries(){
  const rows=visibleEnquiries();
  $('#enquiries-body').innerHTML=rows.map(x=>`<tr><td><input type="checkbox" class="admin-row-check" data-select-kind="enquiry" data-select-id="${esc(x.id)}" aria-label="Select enquiry"></td><td>${esc(fmt(x.created_at))}</td><td><strong>${esc(x.contact_person)}</strong><br><small>${esc(x.email)}</small></td><td>${esc(x.company||'—')}</td><td>${esc(x.project_name)}</td><td>${esc(x.required_service)}</td><td>${enquiryStatus(x.id,x.status)}</td><td><div class="admin-row-actions"><button class="admin-mini-btn" data-open-enquiry="${esc(x.id)}">View</button><button class="admin-mini-btn" data-pdf-enquiry="${esc(x.id)}">PDF</button><button class="admin-mini-btn danger" data-trash-enquiry="${esc(x.id)}">Trash</button></div></td></tr>`).join('')||'<tr><td colspan="8">No enquiries found.</td></tr>';
  bindRowActions();
}
function renderApplications(){
  const rows=visibleApplications();
  $('#applications-body').innerHTML=rows.map(x=>`<tr><td><input type="checkbox" class="admin-row-check" data-select-kind="application" data-select-id="${esc(x.id)}" aria-label="Select application"></td><td>${esc(fmt(x.created_at))}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.email)}</small></td><td>${esc(x.jobs?.title||x.position)}</td><td>${esc(x.current_location||'—')}</td><td>${esc(x.years_experience??'—')}</td><td>${applicationStatus(x.id,x.status)}</td><td><div class="admin-row-actions"><button class="admin-mini-btn" data-open-application="${esc(x.id)}">View</button><button class="admin-mini-btn" data-pdf-application="${esc(x.id)}">PDF</button><button class="admin-mini-btn danger" data-trash-application="${esc(x.id)}">Trash</button></div></td></tr>`).join('')||'<tr><td colspan="8">No applications found.</td></tr>';
  bindRowActions();
}

async function patchRow(table,id,payload){
  return api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:payload,headers:{Prefer:'return=minimal'}});
}
async function moveToTrash(kind,id){
  const table=kind==='enquiry'?'enquiries':kind==='application'?'applications':'jobs';
  await patchRow(table,id,{deleted_at:new Date().toISOString()});
  await Promise.all([kind==='enquiry'?loadEnquiries(true):kind==='application'?loadApplications(true):loadJobs(true),loadTrash(true)]);
  renderOverview();showLiveToast('Moved to Trash');
}
async function restoreFromTrash(kind,id){
  const table=kind==='enquiry'?'enquiries':kind==='application'?'applications':'jobs';
  await patchRow(table,id,{deleted_at:null});
  await Promise.all([kind==='enquiry'?loadEnquiries(true):kind==='application'?loadApplications(true):loadJobs(true),loadTrash(true)]);
  renderOverview();showLiveToast('Restored');
}

function bindRowActions(){
  $$('[data-status-type]').forEach(el=>el.onchange=async()=>{
    const table=el.dataset.statusType==='enquiry'?'enquiries':'applications';
    try{await patchRow(table,el.dataset.id,{status:el.value});if(table==='enquiries')await loadEnquiries(true);else await loadApplications(true);renderOverview()}catch(err){alert(err.message)}
  });
  $$('[data-open-enquiry]').forEach(b=>b.onclick=()=>openEnquiry(b.dataset.openEnquiry));
  $$('[data-open-application]').forEach(b=>b.onclick=()=>openApplication(b.dataset.openApplication));
  $$('[data-pdf-enquiry]').forEach(b=>b.onclick=()=>downloadRecordPdf('enquiry',b.dataset.pdfEnquiry));
  $$('[data-pdf-application]').forEach(b=>b.onclick=()=>downloadRecordPdf('application',b.dataset.pdfApplication));
  $$('[data-trash-enquiry]').forEach(b=>b.onclick=()=>moveToTrash('enquiry',b.dataset.trashEnquiry).catch(e=>alert(e.message)));
  $$('[data-trash-application]').forEach(b=>b.onclick=()=>moveToTrash('application',b.dataset.trashApplication).catch(e=>alert(e.message)));
}

async function getFiles(kind,id){
  const table=kind==='enquiry'?'enquiry_files':'application_files';
  const key=kind==='enquiry'?'enquiry_id':'application_id';
  return await api(`/rest/v1/${table}?select=*&${key}=eq.${encodeURIComponent(id)}&order=created_at.asc`)||[];
}
async function signedUrl(path){
  const res=await fetch(`${SUPABASE_URL}/storage/v1/object/sign/winloo-submissions/${path.split('/').map(encodeURIComponent).join('/')}`,{
    method:'POST',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:300})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.message||'Could not create file link');
  return data?.signedURL?SUPABASE_URL+'/storage/v1'+data.signedURL:data?.signedUrl||'#';
}
async function filesHtml(kind,id){
  const files=await getFiles(kind,id);if(!files.length)return '<p>No uploaded files.</p>';
  const out=[];
  for(const f of files){let url='#';try{url=await signedUrl(f.storage_path)}catch{}out.push(`<a class="admin-file-link" href="${esc(url)}" target="_blank" rel="noopener"><span>${esc(f.original_name)}</span><small>${Math.round((f.size_bytes||0)/1024)} KB</small></a>`)}
  return '<div class="admin-files">'+out.join('')+'</div>';
}

async function openEnquiry(id){
  const x=[...enquiries,...trashedEnquiries].find(v=>v.id===id);if(!x)return;
  $('#dialog-title').textContent='Project enquiry';
  $('#dialog-content').innerHTML=`<div class="admin-dialog-actions"><button class="admin-mini-btn" id="dialog-pdf">Download PDF</button>${x.deleted_at?'':'<button class="admin-mini-btn danger" id="dialog-trash">Move to Trash</button>'}</div><div class="admin-detail-grid"><div><small>Contact</small>${esc(x.contact_person)}</div><div><small>Company</small>${esc(x.company||'—')}</div><div><small>Email</small><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div><div><small>Phone</small><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></div><div><small>Project</small>${esc(x.project_name)}</div><div><small>Location</small>${esc(x.project_location)}</div><div><small>Service</small>${esc(x.required_service)}</div><div><small>Stage</small>${esc(x.project_stage||'—')}</div><div><small>Expected start</small>${esc(x.expected_start_date||'—')}</div><div><small>Submitted</small>${esc(fmt(x.created_at))}</div></div><h3>Description</h3><p>${esc(x.project_description)}</p><h3>Files</h3><div id="dialog-files">Loading…</div><div class="admin-notes"><label>Internal notes<textarea id="dialog-notes">${esc(x.internal_notes||'')}</textarea></label><button class="btn btn-dark" id="save-dialog-notes">Save notes</button></div>`;
  $('#record-dialog').showModal();$('#dialog-files').innerHTML=await filesHtml('enquiry',id);
  $('#dialog-pdf').onclick=()=>downloadRecordPdf('enquiry',id);
  $('#dialog-trash')?.addEventListener('click',async()=>{await moveToTrash('enquiry',id);$('#record-dialog').close()});
  $('#save-dialog-notes').onclick=async()=>{await patchRow('enquiries',id,{internal_notes:$('#dialog-notes').value});await loadEnquiries(true)};
}
async function openApplication(id){
  const x=[...applications,...trashedApplications].find(v=>v.id===id);if(!x)return;
  $('#dialog-title').textContent='Career application';
  $('#dialog-content').innerHTML=`<div class="admin-dialog-actions"><button class="admin-mini-btn" id="dialog-pdf">Download PDF</button>${x.deleted_at?'':'<button class="admin-mini-btn danger" id="dialog-trash">Move to Trash</button>'}</div><div class="admin-detail-grid"><div><small>Applicant</small>${esc(x.full_name)}</div><div><small>Position</small>${esc(x.jobs?.title||x.position)}</div><div><small>Email</small><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div><div><small>Phone</small><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></div><div><small>Current location</small>${esc(x.current_location||'—')}</div><div><small>Experience</small>${esc(x.years_experience??'—')} years</div><div><small>Submitted</small>${esc(fmt(x.created_at))}</div></div><h3>Message</h3><p>${esc(x.message||'—')}</p><h3>CV / Files</h3><div id="dialog-files">Loading…</div><div class="admin-notes"><label>Internal notes<textarea id="dialog-notes">${esc(x.internal_notes||'')}</textarea></label><button class="btn btn-dark" id="save-dialog-notes">Save notes</button></div>`;
  $('#record-dialog').showModal();$('#dialog-files').innerHTML=await filesHtml('application',id);
  $('#dialog-pdf').onclick=()=>downloadRecordPdf('application',id);
  $('#dialog-trash')?.addEventListener('click',async()=>{await moveToTrash('application',id);$('#record-dialog').close()});
  $('#save-dialog-notes').onclick=async()=>{await patchRow('applications',id,{internal_notes:$('#dialog-notes').value});await loadApplications(true)};
}
$('#dialog-close').onclick=()=>$('#record-dialog').close();

function renderJobs(){
  const rows=visibleJobs();
  $('#jobs-admin-list').innerHTML=rows.map(j=>`<article class="admin-job-item"><div class="admin-job-select"><input type="checkbox" class="admin-row-check" data-select-kind="job" data-select-id="${esc(j.id)}" aria-label="Select vacancy"></div><div class="admin-job-item-head"><div><h3>${esc(j.title)}</h3><p>${esc(j.location)} · ${esc(j.status)}${j.closing_date?' · closes '+esc(j.closing_date):''}</p></div></div><div class="admin-job-actions"><button class="admin-mini-btn" data-edit-job="${esc(j.id)}">Edit</button><button class="admin-mini-btn" data-pdf-job="${esc(j.id)}">PDF</button><button class="admin-mini-btn danger" data-trash-job="${esc(j.id)}">Trash</button></div></article>`).join('')||'<p>No vacancies yet.</p>';
  $$('[data-edit-job]').forEach(b=>b.onclick=()=>editJob(b.dataset.editJob));
  $$('[data-pdf-job]').forEach(b=>b.onclick=()=>downloadRecordPdf('job',b.dataset.pdfJob));
  $$('[data-trash-job]').forEach(b=>b.onclick=()=>moveToTrash('job',b.dataset.trashJob).catch(e=>alert(e.message)));
}
function resetJobForm(){const f=$('#job-form');f.reset();f.elements.id.value='';f.elements.location.value='Saudi Arabia';f.elements.sort_order.value='0';$('#job-form-title').textContent='Add vacancy';$('#job-status').textContent=''}
$('#job-reset').onclick=resetJobForm;
const jobForm=$('#job-form');
const jobTitleInput=jobForm?.elements?.title;
const jobSlugInput=jobForm?.elements?.slug;
jobTitleInput?.addEventListener('input',()=>{
  if(!jobForm.elements.id.value && (!jobSlugInput.dataset.edited || !jobSlugInput.value)){
    jobSlugInput.value=jobTitleInput.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }
});
jobSlugInput?.addEventListener('input',()=>{jobSlugInput.dataset.edited='1'});

function editJob(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;
  const f=$('#job-form');
  for(const k of ['id','title','slug','department','location','employment_type','experience','status','closing_date','description','sort_order'])if(f.elements[k])f.elements[k].value=j[k]??'';
  f.elements.requirements.value=(j.requirements||[]).join('\n');$('#job-form-title').textContent='Edit vacancy';f.scrollIntoView({behavior:'smooth'});
}
$('#job-form').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,s=$('#job-status');s.textContent='Saving…';s.className='admin-form-status';
  const fd=new FormData(f),id=String(fd.get('id')||'');
  const payload={title:String(fd.get('title')||'').trim(),slug:String(fd.get('slug')||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),department:String(fd.get('department')||'').trim()||null,location:String(fd.get('location')||'').trim(),employment_type:String(fd.get('employment_type')||'').trim()||null,experience:String(fd.get('experience')||'').trim()||null,status:String(fd.get('status')||'draft'),closing_date:String(fd.get('closing_date')||'')||null,description:String(fd.get('description')||'').trim(),requirements:String(fd.get('requirements')||'').split('\n').map(x=>x.trim()).filter(Boolean),sort_order:Number(fd.get('sort_order')||0)};
  if(payload.status==='published'){
    const existing=id?jobs.find(x=>x.id===id):null;
    if(!existing?.published_at)payload.published_at=new Date().toISOString();
  }
  try{
    if(id)await patchRow('jobs',id,payload);else await api('/rest/v1/jobs',{method:'POST',body:payload,headers:{Prefer:'return=minimal'}});
    s.textContent='Vacancy saved.';s.classList.add('success');resetJobForm();await loadJobs(true);renderOverview();
  }catch(err){s.textContent=err.message;s.classList.add('error')}
});

function trashRows(){
  const q=$('#trash-search')?.value.trim().toLowerCase()||'';
  const type=$('#trash-type-filter')?.value||'';
  let rows=[
    ...trashedEnquiries.map(x=>({type:'enquiry',name:x.project_name||x.contact_person,created_at:x.created_at,deleted_at:x.deleted_at,data:x})),
    ...trashedApplications.map(x=>({type:'application',name:x.full_name+' - '+(x.jobs?.title||x.position),created_at:x.created_at,deleted_at:x.deleted_at,data:x})),
    ...trashedJobs.map(x=>({type:'job',name:x.title,created_at:x.created_at,deleted_at:x.deleted_at,data:x}))
  ].filter(x=>(!type||x.type===type)&&(!q||x.name.toLowerCase().includes(q)));
  const sort=$('#trash-sort')?.value||'newest';
  if(sort==='oldest')rows.sort((a,b)=>new Date(a.deleted_at)-new Date(b.deleted_at));
  else if(sort==='name')rows.sort((a,b)=>a.name.localeCompare(b.name));
  else rows.sort((a,b)=>new Date(b.deleted_at)-new Date(a.deleted_at));
  return rows;
}
function renderTrash(){
  const rows=trashRows();
  $('#trash-body').innerHTML=rows.map(x=>`<tr><td><input type="checkbox" class="admin-row-check" data-select-kind="trash" data-select-type="${x.type}" data-select-id="${esc(x.data.id)}" aria-label="Select trashed item"></td><td>${esc(fmt(x.deleted_at))}</td><td>${esc(x.type[0].toUpperCase()+x.type.slice(1))}</td><td><strong>${esc(x.name)}</strong></td><td>${esc(fmt(x.created_at))}</td><td><div class="admin-row-actions"><button class="admin-mini-btn" data-restore-type="${x.type}" data-restore-id="${esc(x.data.id)}">Restore</button><button class="admin-mini-btn" data-trash-pdf-type="${x.type}" data-trash-pdf-id="${esc(x.data.id)}">PDF</button><button class="admin-mini-btn danger" data-permanent-type="${x.type}" data-permanent-id="${esc(x.data.id)}">Delete forever</button></div></td></tr>`).join('')||'<tr><td colspan="6">Trash is empty.</td></tr>';
  $$('[data-restore-id]').forEach(b=>b.onclick=()=>restoreFromTrash(b.dataset.restoreType,b.dataset.restoreId).catch(e=>alert(e.message)));
  $$('[data-trash-pdf-id]').forEach(b=>b.onclick=()=>downloadRecordPdf(b.dataset.trashPdfType,b.dataset.trashPdfId));
  $$('[data-permanent-id]').forEach(b=>b.onclick=()=>permanentDelete(b.dataset.permanentType,b.dataset.permanentId));
}

async function permanentDelete(kind,id,skipConfirm=false){
  if(!skipConfirm&&!confirm('Permanently delete this item? This cannot be undone.'))return;
  const table=kind==='enquiry'?'enquiries':kind==='application'?'applications':'jobs';
  if(kind!=='job'){
    try{
      const files=await getFiles(kind,id);
      for(const f of files){
        try{await fetch(`${SUPABASE_URL}/storage/v1/object/winloo-submissions/${f.storage_path.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:authHeaders()})}catch{}
      }
    }catch{}
  }
  try{
    await api(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    await loadTrash(true);showLiveToast('Permanently deleted');
  }catch(err){alert(err.message)}
}


function selectedIds(kind){
  return $('[data-select-kind="'+kind+'"]:checked').map(x=>x.dataset.selectId);
}
function selectedTrashRows(){
  return $('[data-select-kind="trash"]:checked').map(x=>({
    type:x.dataset.selectType,
    id:x.dataset.selectId,
    data:findRecord(x.dataset.selectType,x.dataset.selectId)
  })).filter(x=>x.data);
}
function wireSelectAll(masterId,kind){
  const master=$(masterId);if(!master)return;
  master.onchange=()=>$('[data-select-kind="'+kind+'"]').forEach(x=>x.checked=master.checked);
}
function csvEscape(v){
  const s=String(v??'');
  return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function downloadCsv(filename,headers,rows){
  const csv=[headers.map(csvEscape).join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\r\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportEnquiriesCsv(rows=visibleEnquiries()){
  downloadCsv('winloo-enquiries-'+new Date().toISOString().slice(0,10)+'.csv',
    ['Date','Contact','Company','Email','Phone','Project','Location','Service','Stage','Status'],
    rows.map(x=>[fmt(x.created_at),x.contact_person,x.company,x.email,x.phone,x.project_name,x.project_location,x.required_service,x.project_stage,x.status]));
}
function exportApplicationsCsv(rows=visibleApplications()){
  downloadCsv('winloo-applications-'+new Date().toISOString().slice(0,10)+'.csv',
    ['Date','Applicant','Email','Phone','Position','Location','Experience','Status'],
    rows.map(x=>[fmt(x.created_at),x.full_name,x.email,x.phone,x.jobs?.title||x.position,x.current_location,x.years_experience,x.status]));
}
function exportJobsCsv(rows=visibleJobs()){
  downloadCsv('winloo-vacancies-'+new Date().toISOString().slice(0,10)+'.csv',
    ['Title','Department','Location','Employment type','Experience','Status','Closing date','Published'],
    rows.map(x=>[x.title,x.department,x.location,x.employment_type,x.experience,x.status,x.closing_date,fmt(x.published_at)]));
}
function exportTrashCsv(rows=trashRows()){
  downloadCsv('winloo-trash-'+new Date().toISOString().slice(0,10)+'.csv',
    ['Deleted','Type','Name / Title','Original date'],
    rows.map(x=>[fmt(x.deleted_at),x.type,x.name,fmt(x.created_at)]));
}
async function bulkTrash(kind){
  const ids=selectedIds(kind);
  if(!ids.length)return showLiveToast('Select at least one item');
  if(!confirm('Move '+ids.length+' selected item(s) to Trash?'))return;
  for(const id of ids)await moveToTrash(kind,id);
}
async function bulkPdf(kind){
  const ids=selectedIds(kind);
  if(!ids.length)return showLiveToast('Select at least one item');
  const rows=ids.map(id=>findRecord(kind,id)).filter(Boolean);
  await downloadCollectionPdf(kind,rows);
}
async function bulkRestoreTrash(){
  const rows=selectedTrashRows();
  if(!rows.length)return showLiveToast('Select at least one item');
  for(const x of rows)await restoreFromTrash(x.type,x.id);
}
async function bulkDeleteTrash(){
  const rows=selectedTrashRows();
  if(!rows.length)return showLiveToast('Select at least one item');
  if(!confirm('Permanently delete '+rows.length+' selected item(s)? This cannot be undone.'))return;
  for(const x of rows)await permanentDelete(x.type,x.id,true);
}
async function bulkPdfTrash(){
  const rows=selectedTrashRows();
  if(!rows.length)return showLiveToast('Select at least one item');
  const lines=['WINLOO - SELECTED TRASH EXPORT','Generated: '+new Date().toLocaleString(),'Items: '+rows.length,''];
  for(const r of rows){lines.push(...await recordLines(r.type,r.data),'','------------------------------------------------------------','')}
  makePdf(lines,'winloo-trash-selected-'+new Date().toISOString().slice(0,10)+'.pdf');
}

function pdfEscape(s){return plain(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function wrapLine(s,max=92){
  const words=plain(s).replace(/\s+/g,' ').trim().split(' ');
  const out=[];let line='';
  for(const w of words){
    if(!w)continue;
    if((line+' '+w).trim().length>max){if(line)out.push(line);line=w}else line=(line+' '+w).trim();
  }
  if(line)out.push(line);
  return out.length?out:[''];
}
function makePdf(lines,filename){
  const normalized=[];
  for(const line of lines)normalized.push(...wrapLine(line,86));
  const pages=[];for(let i=0;i<normalized.length;i+=42)pages.push(normalized.slice(i,i+42));
  if(!pages.length)pages.push(['No records.']);

  const objects={};
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const firstPageObj=5;
  const kids=pages.map((_,i)=>`${firstPageObj+i*2} 0 R`).join(' ');
  objects[2]=`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;

  pages.forEach((page,i)=>{
    const pageObj=firstPageObj+i*2,contentObj=pageObj+1;
    const content=[];
    content.push('BT','/F2 15 Tf','50 794 Td','(WINLOO CONTRACTING COMPANY LLP) Tj','ET');
    content.push('0.75 w','50 780 m','562 780 l','S');
    content.push('BT','/F1 8 Tf','50 766 Td',`(Admin export - page ${i+1} of ${pages.length}) Tj`,'ET');
    content.push('BT','/F1 10 Tf','50 742 Td','15 TL');
    page.forEach((line,index)=>{
      if(index===0){
        content.push('/F2 13 Tf',`(${pdfEscape(line)}) Tj T*`,'/F1 10 Tf');
      }else if(!line){
        content.push('() Tj T*');
      }else if(/^(Description:|Internal notes:|Requirements:|Attachments:|Message:)$/.test(line)){
        content.push('/F2 10 Tf',`(${pdfEscape(line)}) Tj T*`,'/F1 10 Tf');
      }else{
        content.push(`(${pdfEscape(line)}) Tj T*`);
      }
    });
    content.push('ET');
    content.push('BT','/F1 7 Tf','50 26 Td',`(Generated ${pdfEscape(new Date().toLocaleString())}) Tj`,'ET');
    const stream=content.join('\n');
    objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[contentObj]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  const maxObj=Math.max(...Object.keys(objects).map(Number));
  let pdf='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<=maxObj;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}
  const xref=pdf.length;
  pdf+=`xref\n0 ${maxObj+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=maxObj;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+=`trailer\n<< /Size ${maxObj+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const blob=new Blob([pdf],{type:'application/pdf'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function recordLines(kind,x){
  const lines=[];
  if(kind==='enquiry'){
    lines.push('WINLOO - PROJECT ENQUIRY','','Contact: '+x.contact_person,'Company: '+(x.company||'-'),'Email: '+x.email,'Phone: '+x.phone,'Project: '+x.project_name,'Location: '+x.project_location,'Service: '+x.required_service,'Stage: '+(x.project_stage||'-'),'Expected start: '+(x.expected_start_date||'-'),'Status: '+x.status,'Submitted: '+fmt(x.created_at),'','Description:',x.project_description||'-','','Internal notes:',x.internal_notes||'-');
  }else if(kind==='application'){
    lines.push('WINLOO - CAREER APPLICATION','','Applicant: '+x.full_name,'Email: '+x.email,'Phone: '+x.phone,'Position: '+(x.jobs?.title||x.position),'Location: '+(x.current_location||'-'),'Experience: '+(x.years_experience??'-')+' years','Status: '+x.status,'Submitted: '+fmt(x.created_at),'','Message:',x.message||'-','','Internal notes:',x.internal_notes||'-');
  }else{
    lines.push('WINLOO - VACANCY','','Title: '+x.title,'Department: '+(x.department||'-'),'Location: '+x.location,'Employment type: '+(x.employment_type||'-'),'Experience: '+(x.experience||'-'),'Status: '+x.status,'Closing date: '+(x.closing_date||'-'),'Published: '+fmt(x.published_at),'','Description:',x.description||'-','','Requirements:',...(x.requirements||['-']));
  }
  if(kind!=='job'){
    try{
      const files=await getFiles(kind,x.id);
      lines.push('','Attachments:');
      if(files.length)files.forEach(f=>lines.push('- '+f.original_name+' ('+Math.round((f.size_bytes||0)/1024)+' KB)'));
      else lines.push('- None');
    }catch{}
  }
  if(x.deleted_at)lines.push('','Deleted: '+fmt(x.deleted_at));
  return lines;
}
function findRecord(kind,id){
  if(kind==='enquiry')return [...enquiries,...trashedEnquiries].find(x=>x.id===id);
  if(kind==='application')return [...applications,...trashedApplications].find(x=>x.id===id);
  return [...jobs,...trashedJobs].find(x=>x.id===id);
}
async function downloadRecordPdf(kind,id){
  const x=findRecord(kind,id);if(!x)return;
  const lines=await recordLines(kind,x);
  const base=kind==='enquiry'?(x.project_name||'enquiry'):kind==='application'?(x.full_name||'application'):(x.title||'vacancy');
  makePdf(lines,'winloo-'+kind+'-'+plain(base).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.pdf');
}
async function downloadCollectionPdf(kind,rows){
  const lines=['WINLOO ADMIN EXPORT','Generated: '+new Date().toLocaleString(),'Records: '+rows.length,''];
  for(const x of rows){lines.push(...await recordLines(kind,x),'','------------------------------------------------------------','')}
  makePdf(lines,`winloo-${kind}-export-${new Date().toISOString().slice(0,10)}.pdf`);
}
async function downloadTrashPdf(){
  const rows=trashRows(),lines=['WINLOO - TRASH EXPORT','Generated: '+new Date().toLocaleString(),'Items: '+rows.length,''];
  for(const r of rows){lines.push(...await recordLines(r.type,r.data),'','------------------------------------------------------------','')}
  makePdf(lines,'winloo-trash-export-'+new Date().toISOString().slice(0,10)+'.pdf');
}

$('#enquiry-search').addEventListener('input',renderEnquiries);
$('#enquiry-status-filter').addEventListener('change',renderEnquiries);
$('#enquiry-sort').addEventListener('change',renderEnquiries);
$('#application-search').addEventListener('input',renderApplications);
$('#application-status-filter').addEventListener('change',renderApplications);
$('#application-sort').addEventListener('change',renderApplications);
$('#job-sort').addEventListener('change',renderJobs);
$('#trash-search').addEventListener('input',renderTrash);
$('#trash-type-filter').addEventListener('change',renderTrash);
$('#trash-sort').addEventListener('change',renderTrash);

$('#refresh-enquiries').onclick=()=>loadEnquiries(true);
$('#refresh-applications').onclick=()=>loadApplications(true);
$('#download-enquiries-pdf').onclick=()=>downloadCollectionPdf('enquiry',visibleEnquiries());
$('#download-applications-pdf').onclick=()=>downloadCollectionPdf('application',visibleApplications());
$('#download-jobs-pdf').onclick=()=>downloadCollectionPdf('job',visibleJobs());
$('#download-trash-pdf').onclick=downloadTrashPdf;
$('#download-enquiries-csv').onclick=()=>exportEnquiriesCsv();
$('#download-applications-csv').onclick=()=>exportApplicationsCsv();
$('#download-jobs-csv').onclick=()=>exportJobsCsv();
$('#download-trash-csv').onclick=()=>exportTrashCsv();

$('#pdf-selected-enquiries').onclick=()=>bulkPdf('enquiry');
$('#pdf-selected-applications').onclick=()=>bulkPdf('application');
$('#pdf-selected-jobs').onclick=()=>bulkPdf('job');
$('#pdf-selected-trash').onclick=bulkPdfTrash;
$('#trash-selected-enquiries').onclick=()=>bulkTrash('enquiry').catch(e=>alert(e.message));
$('#trash-selected-applications').onclick=()=>bulkTrash('application').catch(e=>alert(e.message));
$('#trash-selected-jobs').onclick=()=>bulkTrash('job').catch(e=>alert(e.message));
$('#restore-selected-trash').onclick=()=>bulkRestoreTrash().catch(e=>alert(e.message));
$('#delete-selected-trash').onclick=()=>bulkDeleteTrash().catch(e=>alert(e.message));

wireSelectAll('#select-all-enquiries','enquiry');
wireSelectAll('#select-all-applications','application');
wireSelectAll('#select-all-trash','trash');

boot();