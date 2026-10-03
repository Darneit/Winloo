(()=>{const header=document.querySelector('.site-header');const menu=document.querySelector('.menu-toggle');const mobile=document.querySelector('.mobile-nav');const topBtn=document.querySelector('.scroll-top');const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;const onScroll=()=>{const y=scrollY;header?.classList.toggle('scrolled',y>30);topBtn?.classList.toggle('show',y>650)};addEventListener('scroll',onScroll,{passive:true});onScroll();menu?.addEventListener('click',()=>{const open=!mobile.classList.contains('open');mobile.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));document.body.classList.toggle('menu-open',open)});mobile?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.classList.remove('open');menu?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));topBtn?.addEventListener('click',()=>scrollTo({top:0,behavior:reduced?'auto':'smooth'}));if(!reduced&&'IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}}),{threshold:.08,rootMargin:'0px 0px -5%'});document.querySelectorAll('.reveal').forEach(el=>io.observe(el))}else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('is-visible'));
// Project filtering
const filterBtns=[...document.querySelectorAll('.filter-btn')];const projectCards=[...document.querySelectorAll('[data-project-status]')];filterBtns.forEach(btn=>btn.addEventListener('click',()=>{filterBtns.forEach(b=>b.classList.remove('active'));btn.classList.add('active');const f=btn.dataset.filter;projectCards.forEach(card=>card.hidden=!(f==='all'||card.dataset.projectStatus===f))}));
// Seamless client marquee: transform-driven, no hover pause, drag/swipe supported.
const marquee=document.querySelector('.client-marquee');const track=marquee?.querySelector('.client-track');if(marquee&&track&&!reduced){const first=track.querySelector('.client-set');let cycle=0,offset=0,down=false,dragging=false,startX=0,lastX=0,lastTime=performance.now(),raf;const speed=48;const cloneSet=()=>{const clone=first.cloneNode(true);clone.setAttribute('aria-hidden','true');clone.removeAttribute('role');clone.querySelectorAll('[role]').forEach(el=>el.removeAttribute('role'));clone.querySelectorAll('img').forEach(img=>img.alt='');return clone};const measure=()=>{if(!first)return;const gap=parseFloat(getComputedStyle(track).columnGap)||0;cycle=first.getBoundingClientRect().width+gap;if(!cycle)return;while(track.children.length<3||track.scrollWidth<marquee.clientWidth+cycle*2)track.appendChild(cloneSet());offset=((offset%cycle)+cycle)%cycle;track.style.transform=`translate3d(${-offset}px,0,0)`};const render=()=>track.style.transform=`translate3d(${-offset}px,0,0)`;const normalize=()=>{if(cycle)offset=((offset%cycle)+cycle)%cycle};const tick=now=>{const dt=Math.min(Math.max(now-lastTime,0),50);lastTime=now;if(!dragging&&cycle){offset+=speed*dt/1000;normalize();render()}raf=requestAnimationFrame(tick)};marquee.addEventListener('pointerdown',e=>{down=true;dragging=false;startX=lastX=e.clientX;try{marquee.setPointerCapture(e.pointerId)}catch{}});marquee.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-lastX;if(!dragging&&Math.abs(e.clientX-startX)>5){dragging=true;marquee.classList.add('dragging')}if(dragging){offset-=dx;normalize();render();e.preventDefault()}lastX=e.clientX});const release=e=>{down=false;dragging=false;marquee.classList.remove('dragging');lastTime=performance.now();try{marquee.releasePointerCapture(e.pointerId)}catch{}};marquee.addEventListener('pointerup',release);marquee.addEventListener('pointercancel',release);marquee.addEventListener('lostpointercapture',()=>{down=false;dragging=false;marquee.classList.remove('dragging');lastTime=performance.now()});addEventListener('resize',measure,{passive:true});addEventListener('load',measure,{once:true});requestAnimationFrame(now=>{measure();lastTime=now;tick(now)})}
// Project logos are self-hosted; hide a tile only if a local asset unexpectedly fails.
document.querySelectorAll('.project-brand img').forEach(img=>{img.addEventListener('error',()=>img.closest('.project-brand')?.remove(),{once:true})});
// File input feedback without changing the email-based submission flow.
document.querySelectorAll('input[type="file"]').forEach(input=>{const field=input.closest('.field');if(!field)return;const status=document.createElement('div');status.className='file-selection';status.setAttribute('aria-live','polite');field.appendChild(status);input.addEventListener('change',()=>{const names=[...input.files].map(f=>f.name);status.textContent=names.length?(names.length===1?`Selected: ${names[0]}`:`${names.length} files selected`):''})});
// Supabase backend integration.
const SUPABASE_URL='/api/supabase';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsamZyYW56aGNiaWNxbG1kemNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTI5MjksImV4cCI6MjEwNjU4ODkyOX0.Q-4RG7m8QelzCQdryNV0eYokD2pwoXv17t2U6Cl43H0';
const supabaseHeaders={apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

document.querySelectorAll('form[data-email-form]').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(!form.checkValidity())return form.reportValidity();
  const kind=form.dataset.emailForm;
  const endpoint=kind==='career'?'submit-application':'submit-enquiry';
  const button=form.querySelector('button[type="submit"]');
  let status=form.querySelector('.form-submit-status');
  if(!status){status=document.createElement('div');status.className='form-submit-status';status.setAttribute('aria-live','polite');button?.closest('.field')?.appendChild(status)}
  const oldText=button?.textContent;
  if(button){button.disabled=true;button.textContent=kind==='career'?'Submitting Application…':'Submitting Enquiry…'}
  if(status){status.textContent='';status.classList.remove('success','error')}
  try{
    const response=await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`,{method:'POST',headers:supabaseHeaders,body:new FormData(form)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'Submission failed. Please try again.');
    if(status){status.textContent=kind==='career'?'Application submitted successfully. Thank you for applying.':'Project enquiry submitted successfully. Our team will review it.';status.classList.add('success')}
    form.reset();
    form.querySelectorAll('.file-selection').forEach(el=>el.textContent='');
    if(kind==='career'){
      const jobId=form.querySelector('[name="job_id"]');
      if(jobId)jobId.value='';
    }
  }catch(err){
    if(status){status.textContent=err?.message||'Something went wrong. Please try again.';status.classList.add('error')}
  }finally{
    if(button){button.disabled=false;button.textContent=oldText||'Submit'}
  }
}));

// Public careers feed. RLS only exposes currently published vacancies.
const jobsList=document.querySelector('[data-jobs-list]');
if(jobsList){
  const notice=document.querySelector('[data-jobs-notice]');
  fetch(`${SUPABASE_URL}/rest/v1/jobs?select=id,title,department,location,employment_type,experience,description,requirements,closing_date&status=eq.published&order=sort_order.asc,created_at.desc`,{headers:supabaseHeaders})
    .then(r=>{if(!r.ok)throw new Error('Could not load vacancies');return r.json()})
    .then(jobs=>{
      if(!jobs.length){jobsList.innerHTML='';if(notice)notice.hidden=false;return}
      if(notice)notice.hidden=true;
      jobsList.innerHTML=jobs.map(job=>`<article class="job-card reveal is-visible">
        <div class="job-card-top">
          <div>
            <div class="eyebrow">${esc(job.department||'Open Position')}</div>
            <h3>${esc(job.title)}</h3>
          </div>
          <span class="tag">${esc(job.location||'Saudi Arabia')}</span>
        </div>
        <div class="job-meta">
          ${job.employment_type?`<span>${esc(job.employment_type)}</span>`:''}
          ${job.experience?`<span>${esc(job.experience)}</span>`:''}
          ${job.closing_date?`<span>Closes ${esc(job.closing_date)}</span>`:''}
        </div>
        <p>${esc(job.description)}</p>
        ${Array.isArray(job.requirements)&&job.requirements.length?`<ul>${job.requirements.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}
        <button class="btn btn-dark arrow job-apply" type="button" data-job-id="${esc(job.id)}" data-job-title="${esc(job.title)}">Apply for this position</button>
      </article>`).join('');
      jobsList.querySelectorAll('.job-apply').forEach(btn=>btn.addEventListener('click',()=>{
        const form=document.querySelector('form[data-email-form="career"]');
        if(!form)return;
        const jobId=form.querySelector('[name="job_id"]');
        const position=form.querySelector('[name="position"]');
        if(jobId)jobId.value=btn.dataset.jobId||'';
        if(position)position.value=btn.dataset.jobTitle||'';
        form.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
        position?.focus({preventScroll:true});
      }));
    })
    .catch(()=>{if(notice){notice.hidden=false;notice.textContent='Vacancies could not be loaded right now. General applications are still welcome.'}});
}
})();