// Reusable mobile app-style bottom tab bar.
// A tab carries ONE of:
//   data-tab-view="<name>"    → switches to that "screen" (shows only [data-app-view="<name>"] sections)
//   data-tab-action="<sel>"   → clicks that element (e.g. opens a modal)
//   data-tab-target="<sel>"   → smooth-scrolls that section into view
// Plain <a class="app-tab" href="…"> entries just navigate.
// Switching screens always closes any open modal first, so a modal can't get
// stranded on top of a different tab's screen.
(() => {
  function init() {
    const bar = document.querySelector('[data-app-tabbar]');
    if (!bar) return;
    const tabs = Array.from(bar.querySelectorAll('[data-tab]'));
    if (!tabs.length) return;

    const viewTabs = tabs.filter((t) => t.dataset.tabView);
    const hasViews = viewTabs.length > 0;

    const setActive = (tab) => tabs.forEach((t) => t.classList.toggle('is-active', t === tab));

    const reactivateView = () => {
      const current = document.body.dataset.appView;
      const t = viewTabs.find((x) => x.dataset.tabView === current);
      if (t) setActive(t);
    };

    const closeOpenModals = () => {
      document.querySelectorAll('.modal-overlay:not([hidden])').forEach((modal) => {
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.click();
        else modal.hidden = true;
      });
    };

    const showView = (view) => {
      document.body.dataset.appView = view;
      window.scrollTo(0, 0);
    };

    tabs.forEach((tab) => {
      tab.addEventListener('click', (event) => {
        event.preventDefault();
        const view = tab.dataset.tabView;
        const actionSel = tab.dataset.tabAction;
        const targetSel = tab.dataset.tabTarget;

        if (view) {
          closeOpenModals();      // never leave a modal stranded over another screen
          showView(view);
          setActive(tab);
          // A view tab may also point at a section within that view — switch the
          // screen first, then scroll the requested section into view.
          if (targetSel) {
            requestAnimationFrame(() => {
              document.querySelector(targetSel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }
          return;
        }
        if (actionSel) {
          setActive(tab);
          document.querySelector(actionSel)?.click();
          return;
        }
        if (targetSel) {
          setActive(tab);
          document.querySelector(targetSel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    // When a modal is closed by its own ✕ / backdrop, restore the active screen's tab
    // so the bar reflects where the user actually is.
    if (hasViews) {
      document.addEventListener('click', (event) => {
        if (event.target.closest('.modal-close, .modal-overlay')) {
          setTimeout(reactivateView, 0);
        }
      });
    }

    // Scroll-target highlighting (only for data-tab-target tabs).
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

    // Default screen / active tab.
    if (hasViews) {
      showView(viewTabs[0].dataset.tabView);
      setActive(viewTabs[0]);
    } else {
      setActive(tabs[0]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
