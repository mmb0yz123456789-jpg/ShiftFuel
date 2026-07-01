(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (error) {
      console.warn('[ShiftFuel PWA] Service worker registration failed:', error);
    });
  });
})();
