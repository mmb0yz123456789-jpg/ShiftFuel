const form = document.getElementById("worker-login-form");
const workerName = document.getElementById("worker-login-name");
const passwordInput = document.getElementById("worker-password");
const message = document.getElementById("worker-login-message");

if (!form) { console.warn("worker-login.js: form not found"); }

const LOCK_KEY = "shiftfuel_worker_locked_until";
const ATTEMPT_KEY = "shiftfuel_worker_failed_attempts";

function formatLoginPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function maybeFormatWorkerIdentifier() {
  if (!workerName) return;
  const raw = workerName.value;
  if (/[a-z]/i.test(raw)) return;
  workerName.value = formatLoginPhone(raw);
}

if (workerName) {
  workerName.addEventListener("input", maybeFormatWorkerIdentifier);
  workerName.addEventListener("blur", maybeFormatWorkerIdentifier);
}

function lockedUntil() {
  return Number(localStorage.getItem(LOCK_KEY) || 0);
}

function recordFailedAttempt() {
  const attempts = Number(localStorage.getItem(ATTEMPT_KEY) || 0) + 1;
  localStorage.setItem(ATTEMPT_KEY, String(attempts));
  if (attempts >= 3) {
    localStorage.setItem(LOCK_KEY, String(Date.now() + 15 * 60 * 1000));
    localStorage.setItem(ATTEMPT_KEY, "0");
    if (message) message.textContent = "Too many attempts. Worker login is locked for 15 minutes.";
    return;
  }
  if (message) message.textContent = `Incorrect username or password. ${3 - attempts} attempt${3 - attempts === 1 ? "" : "s"} left before a temporary lock.`;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lockTime = lockedUntil();
    if (lockTime > Date.now()) {
      const minutes = Math.ceil((lockTime - Date.now()) / 60000);
      if (message) message.textContent = `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
      return;
    }
    const loginValue = workerName ? workerName.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    if (message) message.textContent = "Signing in...";
    try {
      const { data, error } = await window.ShiftFuelSupabase.rpc("worker_login", {
        p_identifier: loginValue,
        p_password: password,
      });
      if (error) throw error;
      if (data?.token && data?.employee_id) {
        localStorage.removeItem(ATTEMPT_KEY);
        localStorage.removeItem(LOCK_KEY);
        sessionStorage.setItem("shiftfuel_worker", data.full_name || loginValue);
        sessionStorage.setItem("shiftfuel_worker_id", data.employee_id);
        sessionStorage.setItem("shiftfuel_worker_token", data.token);
        sessionStorage.setItem("shiftfuel_worker_expires", String(Date.now() + 8 * 60 * 60 * 1000));
        sessionStorage.setItem("shiftfuel_worker_must_change_pw", String(data.must_change_password === true));
        window.location.href = "/worker/dashboard";
        return;
      }
    } catch (error) {
      const msg = error?.message || "";
      if (msg.includes("ACCOUNT_LOCKED")) {
        if (message) message.textContent = "This account is temporarily locked. Try again in 15 minutes.";
        return;
      }
      console.warn("Worker login failed");
    }
    recordFailedAttempt();
  });
}
