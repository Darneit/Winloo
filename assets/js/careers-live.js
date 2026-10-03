(function(){
  const API='/api/supabase';
  const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsamZyYW56aGNiaWNxbG1kemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTI5MjksImV4cCI6MjEwNjU4ODkyOX0.Q-4RG7m8QelzCQdryNV0eYokD2pwoXv17t2U6Cl43H0';
  const headers={apikey:KEY,Authorization:'Bearer '+KEY};
  const jobsList=document.querySelector('[data-jobs-list]');
  const notice=document.querySelector('[data-jobs-notice]');
  const form=document.querySelector('form[data-email-form="career"]');
  if(!jobsList||!form)return;

  const native=form.querySelector('#career-position');
  const jobId=form.querySelector('[name="job_id"]');
  const root=form.querySelector('[data-career-dropdown]');
  const trigger=root?.querySelector('.career-dropdown-trigger');
  const text=root?.querySelector('#career-position-text');
  const menu=root?.querySelector('.career-dropdown-menu');
  let fingerprint='';
  let busy=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function setChoice(value,id,label){
    if(native)native.value=value||'';
    if(jobId)jobId.value=id||'';
    if(text)text.textContent=label||'Select an open position';
    if(menu)menu.querySelectorAll('.career-dropdown-option').forEach(o=>o.classList.toggle('selected',o.dataset.value===value));
  }

  function renderDropdown(jobs){
    if(!native||!menu||!trigger||!text)return;
    const currentId=jobId?.value||'';
    const options=jobs.length?jobs:[{id:'',title:'General Application',location:''}];
    native.innerHTML=options.map(j=>'<option value="'+esc(j.title)+'" data-job-id="'+esc(j.id)+'">'+esc(j.title+(j.location?' — '+j.location:''))+'</option>').join('');
    menu.innerHTML=options.map(j=>'<button type="button" class="career-dropdown-option" role="option" data-value="'+esc(j.title)+'" data-job-id="'+esc(j.id)+'">'+esc(j.title+(j.location?' — '+j.location:''))+'</button>').join('');
    menu.querySelectorAll('.career-dropdown-option').forEach(opt=>opt.onclick=()=>{
      setChoice(opt.dataset.value,opt.dataset.jobId,opt.textContent);
      menu.hidden=true;
      trigger.setAttribute('aria-expanded','false');
    });
    const selected=options.find(j=>j.id===currentId)||options[0];
    setChoice(selected.title,selected.id,selected.title+(selected.location?' — '+selected.location:''));
  }

  function bindApply(){
    jobsList.querySelectorAll('.job-apply').forEach(btn=>btn.onclick=()=>{
      const opt=[...native.options].find(o=>o.dataset.jobId===btn.dataset.jobId);
      setChoice(opt?.value||btn.dataset.jobTitle,btn.dataset.jobId,opt?.textContent||btn.dataset.jobTitle);
      form.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  function renderJobs(jobs){
    renderDropdown(jobs);
    if(!jobs.length){
      jobsList.innerHTML='';
      if(notice){notice.hidden=false;notice.textContent='There are currently no published vacancies. You may submit a general application.'}
      return;
    }
    if(notice)notice.hidden=true;
    jobsList.innerHTML=jobs.map(job=>'<article class="job-card reveal is-visible"><div class="job-card-top"><div><div class="eyebrow">'+esc(job.department||'Open Position')+'</div><h3>'+esc(job.title)+'</h3></div><span class="tag">'+esc(job.location||'Saudi Arabia')+'</span></div><div class="job-meta">'+(job.employment_type?'<span>'+esc(job.employment_type)+'</span>':'')+(job.experience?'<span>'+esc(job.experience)+'</span>':'')+(job.closing_date?'<span>Closes '+esc(job.closing_date)+'</span>':'')+'</div><p>'+esc(job.description)+'</p>'+(Array.isArray(job.requirements)&&job.requirements.length?'<ul>'+job.requirements.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'<button class="btn btn-dark arrow job-apply" type="button" data-job-id="'+esc(job.id)+'" data-job-title="'+esc(job.title)+'">Apply for this position</button></article>').join('');
    bindApply();
  }

  async function sync(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const url=API+'/rest/v1/jobs?select=id,title,department,location,employment_type,experience,description,requirements,closing_date&status=eq.published&order=sort_order.asc,created_at.desc';
      const r=await fetch(url,{headers,cache:'no-store'});
      if(!r.ok)return;
      const jobs=await r.json();
      const next=JSON.stringify(jobs);
      if(next!==fingerprint){fingerprint=next;renderJobs(jobs)}
    }finally{busy=false}
  }

  if(trigger&&menu){
    trigger.addEventListener('click',()=>{
      menu.hidden=!menu.hidden;
      trigger.setAttribute('aria-expanded',String(!menu.hidden));
    });
    document.addEventListener('click',e=>{
      if(root&&!root.contains(e.target)){menu.hidden=true;trigger.setAttribute('aria-expanded','false')}
    });
  }

  sync();
  setInterval(sync,2000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
})();