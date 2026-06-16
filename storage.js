(function () {
  const requestKey = "shiftfuel_service_requests";

  function readRequests() {
    try {
      return JSON.parse(localStorage.getItem(requestKey)) || [];
    } catch (error) {
      console.warn("Could not read saved ShiftFuel requests.", error);
      return [];
    }
  }

  function writeRequests(requests) {
    localStorage.setItem(requestKey, JSON.stringify(requests));
  }

  function createRequestId() {
    const date = new Date();
    const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `SF-${stamp}-${random}`;
  }

  function saveRequest(payload) {
    const requests = readRequests();
    const now = new Date().toISOString();
    const request = {
      id: createRequestId(),
      createdAt: now,
      updatedAt: now,
      ...payload,
    };

    requests.unshift(request);
    writeRequests(requests);
    return request;
  }

  function updateRequest(id, updates) {
    const requests = readRequests();
    const nextRequests = requests.map((request) => {
      if (request.id !== id) {
        return request;
      }

      return {
        ...request,
        ...updates,
        request: {
          ...request.request,
          ...(updates.request || {}),
        },
        payment: {
          ...request.payment,
          ...(updates.payment || {}),
        },
        updatedAt: new Date().toISOString(),
      };
    });

    writeRequests(nextRequests);
    return nextRequests.find((request) => request.id === id);
  }

  function clearRequests() {
    writeRequests([]);
  }

  const api = {
    clearRequests,
    readRequests,
    saveRequest,
    updateRequest,
  };

  window.ShiftFuelStorage = api;
  globalThis.ShiftFuelStorage = api;
})();
