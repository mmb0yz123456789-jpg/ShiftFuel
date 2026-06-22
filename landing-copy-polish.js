function updateText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

const pricingCards = document.querySelectorAll(".pricing-card");
const fuelCard = pricingCards[0];
const washCard = pricingCards[1];
const careCard = pricingCards[2];

if (fuelCard) {
  updateText(".pricing-card:nth-child(1) > p:not(.pricing-from)", "We refuel your vehicle so you do not have to leave work.");
  const fuelFrom = fuelCard.querySelector(".pricing-from");
  if (fuelFrom) fuelFrom.innerHTML = 'Starting at $15 <span>service fee</span> + fuel cost at pump price';

  const includes = fuelCard.querySelectorAll(".pricing-includes li");
  if (includes[0]) includes[0].textContent = "Pick up your vehicle at your service address";
  if (includes[1]) includes[1].textContent = "Fill up with your selected fuel type";
  if (includes[3]) includes[3].textContent = "Return your vehicle to your parking spot";
}

if (washCard) {
  const washIntro = washCard.querySelector("h3 + p");
  if (washIntro) washIntro.textContent = "Premium exterior car wash, because first impressions matter.";
}

if (careCard) {
  const careIntro = careCard.querySelector("h3 + p");
  if (careIntro) careIntro.textContent = "Optional add-on for any fuel or car wash request.";

  const includes = careCard.querySelectorAll(".pricing-includes li");
  if (includes[1]) includes[1].textContent = "Washer fluid top-off, if needed";
}

updateText(
  ".pricing-disclaimer",
  "Service fees start at $15. Final authorization includes the estimated fuel or wash cost, service fee, and payment processing fee."
);
