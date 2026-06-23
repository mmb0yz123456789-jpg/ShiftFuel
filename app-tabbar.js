// Reusable mobile app-style bottom tab bar.
// Markup: <nav class="app-tabbar" data-app-tabbar> with buttons that carry one of:
//   data-tab-target="<css selector>"  → smooth-scrolls that section into view
//   data-tab-action="<css selector>"   → clicks that element (e.g. a page tab / opens a modal)
// Plain <a class="app-tab" href="…"> entries just navigate (no data-tab needed).
// The active tab highlights on tap, and (for scroll targets) as you scroll.
(() => {
  function init() {
    const bar = document.querySelector('[data-app-tabbar]');
    if (!bar) return;
    const tabs = Array.from(bar.querySelectorAll('[data-tab]'));
    if (!tabs.length) return;

    const setActive = (tab) => tabs.forEach((t) => t.classList.toggle('is-active', t === tab));

    tabs.forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        setActive(tab); // immediate tap feedback
        const actionSel = tab.dataset.tabAction;
        const targetSel = tab.dataset.tabTarget;
        if (actionSel) {
          document.querySelector(actionSel)?.click();
        }
        if (targetSel) {
          const el = document.querySelector(targetSel);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // Highlight whichever scroll-target section is currently centered in the viewport.
    const targets = tabs
      .filter((t) => t.dataset.tabTarget)
      .map((t) => ({ tab: t, el: document.querySelector(t.dataset.tabTarget) }))
      .filter((x) => x.el);

    if (targets.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = targets.find((x) => x.el === entry.target);
          if (match) setActive(match.tab);
        });
      }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
      targets.forEach((x) => io.observe(x.el));
    }

    setActive(tabs[0]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
