(() => {
  const targets = document.querySelectorAll('[data-fadein]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('opacity-100', 'translate-y-0');
      entry.target.classList.remove('opacity-0', 'translate-y-2');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  targets.forEach((el) => {
    el.classList.add('opacity-0', 'translate-y-2', 'transition', 'duration-500');
    observer.observe(el);
  });
})();
