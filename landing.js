const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const year = document.querySelector("#year");

if (year) year.textContent = new Date().getFullYear();

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  nav?.classList.toggle("is-open", !isOpen);
});

nav?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  navToggle?.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
});

async function loadFuelPrices() {
  const list = document.querySelector("[data-fuel-prices]");
  if (!list || !window.ShiftFuelSupabase) return;
  try {
    const { data, error } = await window.ShiftFuelSupabase.rpc("public_get_fuel_prices");
    if (error || !data) throw error || new Error("No fuel price data");
    const rows = [
      ["Regular", data.regular_price],
      ["Mid-grade", data.midgrade_price],
      ["Premium", data.premium_price],
      ["Diesel", data.diesel_price],
    ];
    list.innerHTML = rows.map(([label, price]) => `<li><span>${label}</span><strong>$${Number(price).toFixed(3)}/gal</strong></li>`).join("");
  } catch (error) {
    console.warn("Could not load fuel prices:", error);
    list.innerHTML = `<li><span>Current fuel prices shown during booking.</span></li>`;
  }
}

loadFuelPrices();
