(function () {
  if (document.querySelector('link[data-mobile-polish]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'mobile-polish.css';
  link.dataset.mobilePolish = '1';
  document.head.appendChild(link);
})();
