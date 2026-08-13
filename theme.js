(() => {
  const storageKey = 'story-is-straight-theme';
  const root = document.body;
  const toggle = document.querySelector('#theme-toggle');

  function applyTheme(theme) {
    root.dataset.theme = theme;
    const isLight = theme === 'light';
    toggle.setAttribute('aria-pressed', String(isLight));
    toggle.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    toggle.innerHTML = isLight ? '<span aria-hidden="true">◐</span> Dark' : '<span aria-hidden="true">☼</span> Light';
  }

  applyTheme(localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark');
  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(storageKey, next);
    applyTheme(next);
  });
})();
