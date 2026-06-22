// Worker portal queue fix: separate My Jobs and Open Jobs.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;
  console.log('worker open queue fix loaded');
})();
