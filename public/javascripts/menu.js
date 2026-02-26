(() => {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const toggleButtons = document.querySelectorAll('[data-sidebar-toggle]');
  if (!sidebar || !toggleButtons.length) return;

  const open = () => {
    sidebar.classList.remove('translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (overlay) {
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      overlay.classList.add('opacity-100', 'pointer-events-auto');
    }
    document.body.classList.add('overflow-hidden');
  };

  const close = () => {
    sidebar.classList.add('translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (overlay) {
      overlay.classList.add('opacity-0', 'pointer-events-none');
      overlay.classList.remove('opacity-100', 'pointer-events-auto');
    }
    document.body.classList.remove('overflow-hidden');
  };

  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const hidden = sidebar.classList.contains('translate-x-full');
      hidden ? open() : close();
    });
  });

  overlay?.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
})();
