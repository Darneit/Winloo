import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';

const SUPABASE_URL='https://kljfranzhcbicqlmdzci.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsamZyYW56aGNiaWNxbG1kemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTI5MjksImV4cCI6MjEwNjU4ODkyOX0.Q-4RG7m8QelzCQdryNV0eYokD2pwoXv17t2U6Cl43H0';
const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=d=>d?new Date(d).toLocaleString():'—';
let enquiries=[],applications=[],jobs=[],currentUser=null;

async function isAdmin(user){
  if(!user)return false;
  const {data,error}=await supabase.from('admin_users').select('user_id,display_name').eq('user_id',user.id).maybeSingle();
  return !error&&!!data;
}

async function boot(){
  const {data:{session}}=await supabase.auth.getSession();
  if(session?.user&&await isAdmin(session.user))return enterAdmin(session.user);
  if(session)await supabase.auth.signOut();
  $('#login-view').hidden=false;$('#admin-view').hidden=true;
}

async function enterAdmin(user){
  currentUser=user;
  $('#login-view').hidden=true;$('#admin-view').hidden=false;
  $('#admin-user').textContent=user.email||'Administrator';
  await refreshAll();
}

$('#admin-login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const status=$('#login-status');status.textContent='Signing in…';status.className='admin-form-status';
  const {data,error}=await supabase.auth.signInWithPassword({email:$('#admin-email').value.trim(),password:$('#admin-password').value});
  if(error){status.textContent=error.message;status.classList.add('error');return}
  if(!await isAdmin(data.user)){await supabase.auth.signOut();status.textContent='This account is not authorised for Winloo Admin.';status.classList.add('error');return}
  status.textContent='';enterAdmin(data.user);
});

$('#admin-logout').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload()});

$$('.admin-nav').forEach(btn=>btn.addEventListener('click',()=>{
  $$('.admin-nav').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
  const p=btn.dataset.panel;$$('[data-panel-view]').forEach(v=>{v.hidden=v.dataset.panelView!==p});
  $('#panel-title').textContent=btn.textContent.trim();
}));

async function refreshAll(){
  await Promise.all([loadEnquiries(),loadApplications(),loadJobs()]);
  renderOverview();
}

async function loadEnquiries(){
  const {data,error}=await supabase.from('enquiries').select('*').order('created_at',{ascending:false});
  if(error)throw error;enquiries=data||[];renderEnquiries();
}
async function loadApplications(){
  const {data,error}=await supabase.from('applications').select('*,jobs(title)').order('created_at',{ascending:false});
  if(error)throw error;applications=data||[];renderApplications();
}
async function loadJobs(){
  const {data,error}=await supabase.from('jobs').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});
  if(error)throw error;jobs=data||[];renderJobs();
}

function renderOverview(){
  $('#stat-enquiries').textContent=enquiries.filter(x=>x.status==='new').length;
  $('#stat-applications').textContent=applications.filter(x=>x.status==='new').length;
  $('#stat-jobs').textContent=jobs.filter(x=>x.status==='published').length;
  const activity=[
    ...enquiries.slice(0,5).map(x=>({type:'Enquiry',name:x.project_name||x.company||x.contact_person,date:x.created_at})),
    ...applications.slice(0,5).map(x=>({type:'Application',name:x.full_name+' — '+x.position,date:x.created_at}))
  ].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  $('#recent-activity').innerHTML=activity.length?activity.map(x=>`<div class="admin-activity-item"><span><strong>${esc(x.type)}</strong> · ${esc(x.name)}</span><small>${esc(fmt(x.date))}</small></div>`).join(''):'<p>No submissions yet.</p>';
}

function enquiryStatus(id,value){return `<select data-status-type="enquiry" data-id="${esc(id)}"><option value="new" ${value==='new'?'selected':''}>New</option><option value="contacted" ${value==='contacted'?'selected':''}>Contacted</option><option value="in_progress" ${value==='in_progress'?'selected':''}>In progress</option><option value="closed" ${value==='closed'?'selected':''}>Closed</option><option value="spam" ${value==='spam'?'selected':''}>Spam</option></select>`}
function applicationStatus(id,value){return `<select data-status-type="application" data-id="${esc(id)}"><option value="new" ${value==='new'?'selected':''}>New</option><option value="reviewing" ${value==='reviewing'?'selected':''}>Reviewing</option><option value="shortlisted" ${value==='shortlisted'?'selected':''}>Shortlisted</option><option value="interview" ${value==='interview'?'selected':''}>Interview</option><option value="hired" ${value==='hired'?'selected':''}>Hired</option><option value="rejected" ${value==='rejected'?'selected':''}>Rejected</option><option value="archived" ${value==='archived'?'selected':''}>Archived</option></select>`}

function renderEnquiries(){
  const q=$('#enquiry-search').value.trim().toLowerCase();
  const rows=enquiries.filter(x=>!q||[x.contact_person,x.company,x.project_name,x.required_service,x.email].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#enquiries-body').innerHTML=rows.map(x=>`<tr><td>${esc(fmt(x.created_at))}</td><td><strong>${esc(x.contact_person)}</strong><br><small>${esc(x.email)}</small></td><td>${esc(x.company||'—')}</td><td>${esc(x.project_name)}</td><td>${esc(x.required_service)}</td><td>${enquiryStatus(x.id,x.status)}</td><td><div class="admin-row-actions"><button class="admin-mini-btn" data-open-enquiry="${esc(x.id)}">View</button><button class="admin-mini-btn danger" data-delete-enquiry="${esc(x.id)}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="7">No enquiries found.</td></tr>';
  bindRowActions();
}
function renderApplications(){
  const q=$('#application-search').value.trim().toLowerCase();
  const rows=applications.filter(x=>!q||[x.full_name,x.position,x.email,x.current_location,x.jobs?.title].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#applications-body').innerHTML=rows.map(x=>`<tr><td>${esc(fmt(x.created_at))}</td><td><strong>${esc(x.full_name)}</strong><br><small>${esc(x.email)}</small></td><td>${esc(x.jobs?.title||x.position)}</td><td>${esc(x.current_location||'—')}</td><td>${esc(x.years_experience??'—')}</td><td>${applicationStatus(x.id,x.status)}</td><td><div class="admin-row-actions"><button class="admin-mini-btn" data-open-application="${esc(x.id)}">View</button><button class="admin-mini-btn danger" data-delete-application="${esc(x.id)}">Delete</button></div></td></tr>`).join('')||'<tr><td colspan="7">No applications found.</td></tr>';
  bindRowActions();
}

function bindRowActions(){
  $$('[data-status-type]').forEach(el=>el.onchange=async()=>{
    const table=el.dataset.statusType==='enquiry'?'enquiries':'applications';
    await supabase.from(table).update({status:el.value}).eq('id',el.dataset.id);
    if(table==='enquiries')await loadEnquiries();else await loadApplications();renderOverview();
  });
  $$('[data-open-enquiry]').forEach(b=>b.onclick=()=>openEnquiry(b.dataset.openEnquiry));
  $$('[data-open-application]').forEach(b=>b.onclick=()=>openApplication(b.dataset.openApplication));
  $$('[data-delete-enquiry]').forEach(b=>b.onclick=()=>deleteRecord('enquiry',b.dataset.deleteEnquiry));
  $$('[data-delete-application]').forEach(b=>b.onclick=()=>deleteRecord('application',b.dataset.deleteApplication));
}

async function getFiles(kind,id){
  const table=kind==='enquiry'?'enquiry_files':'application_files';
  const key=kind==='enquiry'?'enquiry_id':'application_id';
  const {data}=await supabase.from(table).select('*').eq(key,id).order('created_at');
  return data||[];
}
async function filesHtml(kind,id){
  const files=await getFiles(kind,id);
  if(!files.length)return '<p>No uploaded files.</p>';
  const out=[];
  for(const f of files){
    const {data}=await supabase.storage.from('winloo-submissions').createSignedUrl(f.storage_path,300);
    out.push(`<a class="admin-file-link" href="${esc(data?.signedUrl||'#')}" target="_blank" rel="noopener"><span>${esc(f.original_name)}</span><small>${Math.round((f.size_bytes||0)/1024)} KB</small></a>`);
  }
  return '<div class="admin-files">'+out.join('')+'</div>';
}

async function openEnquiry(id){
  const x=enquiries.find(v=>v.id===id);if(!x)return;
  $('#dialog-title').textContent='Project enquiry';
  $('#dialog-content').innerHTML=`<div class="admin-detail-grid"><div><small>Contact</small>${esc(x.contact_person)}</div><div><small>Company</small>${esc(x.company||'—')}</div><div><small>Email</small><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div><div><small>Phone</small><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></div><div><small>Project</small>${esc(x.project_name)}</div><div><small>Location</small>${esc(x.project_location)}</div><div><small>Service</small>${esc(x.required_service)}</div><div><small>Stage</small>${esc(x.project_stage||'—')}</div><div><small>Expected start</small>${esc(x.expected_start_date||'—')}</div><div><small>Submitted</small>${esc(fmt(x.created_at))}</div></div><h3>Description</h3><p>${esc(x.project_description)}</p><h3>Files</h3><div id="dialog-files">Loading…</div><div class="admin-notes"><label>Internal notes<textarea id="dialog-notes">${esc(x.internal_notes||'')}</textarea></label><button class="btn btn-dark" id="save-dialog-notes">Save notes</button></div>`;
  $('#record-dialog').showModal();
  $('#dialog-files').innerHTML=await filesHtml('enquiry',id);
  $('#save-dialog-notes').onclick=async()=>{await supabase.from('enquiries').update({internal_notes:$('#dialog-notes').value}).eq('id',id);await loadEnquiries();};
}
async function openApplication(id){
  const x=applications.find(v=>v.id===id);if(!x)return;
  $('#dialog-title').textContent='Career application';
  $('#dialog-content').innerHTML=`<div class="admin-detail-grid"><div><small>Applicant</small>${esc(x.full_name)}</div><div><small>Position</small>${esc(x.jobs?.title||x.position)}</div><div><small>Email</small><a href="mailto:${esc(x.email)}">${esc(x.email)}</a></div><div><small>Phone</small><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a></div><div><small>Current location</small>${esc(x.current_location||'—')}</div><div><small>Experience</small>${esc(x.years_experience??'—')} years</div><div><small>Submitted</small>${esc(fmt(x.created_at))}</div></div><h3>Message</h3><p>${esc(x.message||'—')}</p><h3>CV / Files</h3><div id="dialog-files">Loading…</div><div class="admin-notes"><label>Internal notes<textarea id="dialog-notes">${esc(x.internal_notes||'')}</textarea></label><button class="btn btn-dark" id="save-dialog-notes">Save notes</button></div>`;
  $('#record-dialog').showModal();
  $('#dialog-files').innerHTML=await filesHtml('application',id);
  $('#save-dialog-notes').onclick=async()=>{await supabase.from('applications').update({internal_notes:$('#dialog-notes').value}).eq('id',id);await loadApplications();};
}
$('#dialog-close').onclick=()=>$('#record-dialog').close();

async function deleteRecord(kind,id){
  if(!confirm('Delete this record permanently?'))return;
  const files=await getFiles(kind,id);
  if(files.length)await supabase.storage.from('winloo-submissions').remove(files.map(x=>x.storage_path));
  await supabase.from(kind==='enquiry'?'enquiries':'applications').delete().eq('id',id);
  if(kind==='enquiry')await loadEnquiries();else await loadApplications();renderOverview();
}

function renderJobs(){
  $('#jobs-admin-list').innerHTML=jobs.map(j=>`<article class="admin-job-item"><div class="admin-job-item-head"><div><h3>${esc(j.title)}</h3><p>${esc(j.location)} · ${esc(j.status)}${j.closing_date?' · closes '+esc(j.closing_date):''}</p></div></div><div class="admin-job-actions"><button class="admin-mini-btn" data-edit-job="${esc(j.id)}">Edit</button><button class="admin-mini-btn danger" data-delete-job="${esc(j.id)}">Delete</button></div></article>`).join('')||'<p>No vacancies yet.</p>';
  $$('[data-edit-job]').forEach(b=>b.onclick=()=>editJob(b.dataset.editJob));
  $$('[data-delete-job]').forEach(b=>b.onclick=()=>deleteJob(b.dataset.deleteJob));
}
function resetJobForm(){
  const f=$('#job-form');f.reset();f.elements.id.value='';f.elements.location.value='Saudi Arabia';f.elements.sort_order.value='0';$('#job-form-title').textContent='Add vacancy';$('#job-status').textContent='';
}
$('#job-reset').onclick=resetJobForm;
function editJob(id){
  const j=jobs.find(x=>x.id===id);if(!j)return;const f=$('#job-form');
  for(const k of ['id','title','slug','department','location','employment_type','experience','status','closing_date','description','sort_order'])if(f.elements[k])f.elements[k].value=j[k]??'';
  f.elements.requirements.value=(j.requirements||[]).join('\n');$('#job-form-title').textContent='Edit vacancy';f.scrollIntoView({behavior:'smooth'});
}
$('#job-form').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.currentTarget,s=$('#job-status');s.textContent='Saving…';s.className='admin-form-status';
  const fd=new FormData(f);const id=String(fd.get('id')||'');
  const payload={title:String(fd.get('title')||'').trim(),slug:String(fd.get('slug')||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),department:String(fd.get('department')||'').trim()||null,location:String(fd.get('location')||'').trim(),employment_type:String(fd.get('employment_type')||'').trim()||null,experience:String(fd.get('experience')||'').trim()||null,status:String(fd.get('status')||'draft'),closing_date:String(fd.get('closing_date')||'')||null,description:String(fd.get('description')||'').trim(),requirements:String(fd.get('requirements')||'').split('\n').map(x=>x.trim()).filter(Boolean),sort_order:Number(fd.get('sort_order')||0)};
  if(payload.status==='published'&&!id)payload.published_at=new Date().toISOString();
  let result;if(id)result=await supabase.from('jobs').update(payload).eq('id',id);else result=await supabase.from('jobs').insert(payload);
  if(result.error){s.textContent=result.error.message;s.classList.add('error');return}
  s.textContent='Vacancy saved.';s.classList.add('success');resetJobForm();await loadJobs();renderOverview();
});
async function deleteJob(id){if(!confirm('Delete this vacancy? Applications already received will remain, but their vacancy link will be cleared.'))return;await supabase.from('jobs').delete().eq('id',id);await loadJobs();renderOverview();}

$('#enquiry-search').addEventListener('input',renderEnquiries);
$('#application-search').addEventListener('input',renderApplications);
$('#refresh-enquiries').onclick=loadEnquiries;
$('#refresh-applications').onclick=loadApplications;
boot();