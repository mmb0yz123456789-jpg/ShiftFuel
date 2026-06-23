// returning.html loads this before booking-flow.js.
// Supabase rpc() returns a thenable query object, but booking-flow.js uses .catch()
// for one optional returning-customer lookup. Wrap rpc() so it behaves like a real Promise.
(function () {
  const db = window.ShiftFuelSupabase;
  if (!db || typeof db.rpc !== "function" || db.__shiftfuelRpcPromisePatched) return;

  const originalRpc = db.rpc.bind(db);
  db.rpc = function patchedRpc(...args) {
    return Promise.resolve(originalRpc(...args));
  };
  db.__shiftfuelRpcPromisePatched = true;
})();
