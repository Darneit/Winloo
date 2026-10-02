(() => {
  const header = document.querySelector('.site-header');
  const mobileToggle = document.querySelector('.mobile-toggle');
  const mobilePanel = document.querySelector('.mobile-panel');
  const scrollTop = document.querySelector('.scroll-top');

  // Editorial-style scroll progress indicator.
  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  progress.innerHTML = '<span></span>';
  document.body.appendChild(progress);
  const progressBar = progress.firstElementChild;

  const onScroll = () => {
    const y = window.scrollY;
    if (header) {
      header.classList.toggle('scrolled', y > 38);
      header.classList.toggle('hero-mode', y < 72);
    }
    scrollTop?.classList.toggle('show', y > 600);
    const max = document.documentElement.scrollHeight - innerHeight;
    if (progressBar) progressBar.style.width = `${max > 0 ? (y / max) * 100 : 0}%`;
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const closeMobile = () => {
    mobilePanel?.classList.remove('open');
    mobileToggle?.setAttribute('aria-expanded', 'false');
  };
  mobileToggle?.addEventListener('click', () => {
    const open = mobilePanel?.classList.toggle('open');
    mobileToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  mobilePanel?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobile));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMobile(); });
  scrollTop?.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08, rootMargin: '0px 0px -5% 0px' });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  const counters = document.querySelectorAll('[data-count]');
  const animateCounter = el => {
    const end = Number(el.dataset.count || 0), suffix = el.dataset.suffix || '';
    const start = performance.now(), duration = 1200;
    const frame = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = `${Math.round(end * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  if ('IntersectionObserver' in window) {
    const co = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      animateCounter(entry.target); co.unobserve(entry.target);
    }), { threshold: .5 });
    counters.forEach(el => co.observe(el));
  } else counters.forEach(animateCounter);

  document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    document.querySelectorAll('.project-card').forEach(card => {
      card.hidden = !(filter === 'all' || card.dataset.category === filter);
    });
  }));

  const form = document.querySelector('#contactForm');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const status = form.querySelector('.form-status') || document.querySelector('.form-status');
    if (status) {
      status.textContent = 'Thank you. Your enquiry details are ready for submission once the enquiry system is connected.';
      status.style.color = '#8c6a22';
    }
  });
})();
