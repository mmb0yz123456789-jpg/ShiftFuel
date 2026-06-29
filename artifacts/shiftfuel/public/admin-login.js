const form = document.getElementById("admin-login-form");
const usernameInput = document.getElementById("admin-username");
const passwordInput = document.getElementById("admin-password");
const message = document.getElementById("login-message");
const LOCK_KEY = "shiftfuel_admin_locked_until";
const ATTEMPT_KEY = "shiftfuel_admin_failed_attempts";

if (!form) { console.warn("admin-login.js: form not found"); }

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function lockedUntil() {
  return Number(localStorage.getItem(LOCK_KEY) || 0);
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const lockTime = lockedUntil();
    if (lockTime > Date.now()) {
      const minutes = Math.ceil((lockTime - Date.now()) / 60000);
      message.textContent = `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
      return;
    }
    const password = passwordInput.value;
    const username = usernameInput.value.trim().toLowerCase();
    const usernameHash = await sha256Hex(username);
    const passwordHash = await sha256Hex(password);
    message.textContent = "Signing in...";
    try {
      const resp = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_login", username_hash: usernameHash, password_hash: passwordHash }),
      });
      const result = await resp.json().catch(() => ({}));
      if (resp.ok && result.token) {
        localStorage.removeItem(ATTEMPT_KEY);
        localStorage.removeItem(LOCK_KEY);
        sessionStorage.setItem("shiftfuel_admin", "true");
        sessionStorage.setItem("shiftfuel_admin_token", result.token);
        sessionStorage.setItem("shiftfuel_admin_expires", String(Date.now() + 8 * 60 * 60 * 1000));
        window.location.href = "/admin/dashboard";
        return;
      }
      if (resp.status === 429) {
        const retry = Number(resp.headers.get("Retry-After") || 0);
        const mins = retry ? Math.ceil(retry / 60) : 15;
        message.textContent = `Too many attempts from your network. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
        return;
      }
      if (resp.status === 423 || result.error === "ACCOUNT_LOCKED") {
        message.textContent = "Admin login is temporarily locked. Try again later.";
        return;
      }
      throw new Error(result.error || "INVALID_CREDENTIALS");
    } catch (err) {
      message.textContent = "";
      const attempts = Number(localStorage.getItem(ATTEMPT_KEY) || 0) + 1;
      localStorage.setItem(ATTEMPT_KEY, String(attempts));
      if (attempts >= 3) {
        localStorage.setItem(LOCK_KEY, String(Date.now() + 15 * 60 * 1000));
        localStorage.setItem(ATTEMPT_KEY, "0");
        message.textContent = "Too many attempts. Admin login is locked for 15 minutes.";
        return;
      }
      message.textContent = `Incorrect username or password. ${3 - attempts} attempt${3 - attempts === 1 ? "" : "s"} left before a temporary lock.`;
    }
  });
}
