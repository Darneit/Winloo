const nav=document.querySelector('.navlinks'),menu=document.querySelector('.menu-btn');if(menu)menu.onclick=()=>nav.classList.toggle('open');
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('in')}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();const b=f.querySelector('button');const t=b.textContent;b.textContent='Thanks — enquiry prepared';setTimeout(()=>b.textContent=t,2200)}));
