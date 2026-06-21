const flowRoot = document.querySelector("[data-booking-flow]");
const navToggle = document.querySelector("[data-nav-toggle]");
const nav = document.querySelector("[data-nav]");
const year = document.querySelector("#year");

if (year) year.textContent = new Date().getFullYear();

navToggle?.addEventListener("click", () => {
  const isOpen = navToggle.getAttribute("aria-expanded") === "true";
  navToggle.setAttribute("aria-expanded", String(!isOpen));
  nav?.classList.toggle("is-open", !isOpen);
});

const sharedSteps = ["Vehicle", "Service", "Schedule", "Handoff", "Payment", "Review"];
const flows = {
  "book-now": ["Customer", "Address", ...sharedSteps],
  returning: ["Verify", "Service Area", ...sharedSteps],
};

const stepCopy = {
  Customer: {
    title: "Customer Info",
    intro: "Tell us who is booking the service.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Full name</span><input data-required name="customerName" type="text" placeholder="Jordan Smith"></label>
        <label><span>Phone number</span><input data-required name="customerPhone" type="tel" placeholder="(302) 555-0100"></label>
        <label><span>Email</span><input data-required name="customerEmail" type="email" placeholder="jordan@example.com"></label>
      </div>
    `,
  },
  Address: {
    title: "Service Address",
    intro: "Add the workplace or approved service location. Full address validation will be connected later.",
    fields: `
      <div class="booking-field-grid">
        <label class="span-2"><span>Street address</span><input data-required name="street" type="text" placeholder="123 Main Street"></label>
        <label><span>Apt / Suite / Unit</span><input name="apt" type="text" placeholder="Optional"></label>
        <label><span>City</span><input data-required name="city" type="text" placeholder="Wilmington"></label>
        <label><span>State</span><input data-required name="state" type="text" placeholder="DE" value="DE"></label>
        <label><span>ZIP</span><input data-required name="zip" type="text" placeholder="19804"></label>
      </div>
      <div class="placeholder-note">Address validation placeholder. The final flow will validate service availability before continuing.</div>
    `,
  },
  Verify: {
    title: "Verify This Is You",
    intro: "Enter your phone number, email, ticket number, or any combination of these so we can find your previous booking information.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Phone number</span><input name="verifyPhone" type="tel" placeholder="(302) 555-0100" data-any-required="verify"></label>
        <label><span>Email address</span><input name="verifyEmail" type="email" placeholder="email@example.com" data-any-required="verify"></label>
        <label><span>Ticket/request number</span><input name="verifyTicket" type="text" placeholder="Request number" data-any-required="verify"></label>
      </div>
      <div class="placeholder-note">Verification lookup placeholder. After verification, the flow continues into the shared booking steps.</div>
    `,
  },
  "Service Area": {
    title: "Validated Service Area",
    intro: "Choose a saved validated service area or add a new address. New or edited addresses must be validated before continuing.",
    fields: `
      <div class="choice-grid">
        <label class="choice-card"><input data-required type="radio" name="serviceArea" value="saved"><span><strong>Use saved service area</strong><small>1702 Saint Mihiel Ave, Wilmington, DE 19804</small></span></label>
        <label class="choice-card"><input data-required type="radio" name="serviceArea" value="new"><span><strong>Add new service address</strong><small>Validate a new approved service location.</small></span></label>
      </div>
    `,
  },
  Vehicle: {
    title: "Vehicle",
    intro: "Choose a saved vehicle or enter vehicle details for this booking.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Year</span><input data-required name="vehicleYear" type="text" placeholder="2020"></label>
        <label><span>Make</span><input data-required name="vehicleMake" type="text" placeholder="Honda"></label>
        <label><span>Model</span><input data-required name="vehicleModel" type="text" placeholder="Fit"></label>
        <label><span>Color</span><input name="vehicleColor" type="text" placeholder="Blue"></label>
        <label><span>Plate number</span><input name="licensePlate" type="text" placeholder="TEST"></label>
      </div>
      <div class="placeholder-note">Saved vehicle picker placeholder. The same vehicle step is shared by Book Now and Returning Customer.</div>
    `,
  },
  Service: {
    title: "Service",
    intro: "Select the service and add-ons for this request.",
    fields: `
      <div class="choice-grid">
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="fuel"><span><strong>Fuel Fill-Up</strong><small>Fuel service only.</small></span></label>
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="wash"><span><strong>Car Wash</strong><small>Car wash service only.</small></span></label>
        <label class="choice-card"><input data-required type="radio" name="serviceType" value="fuel_wash"><span><strong>Fuel + Car Wash</strong><small>Bundle both services.</small></span></label>
        <label class="choice-card"><input type="checkbox" name="quickCare" value="quick-care"><span><strong>Quick Vehicle Care</strong><small>Optional add-on.</small></span></label>
      </div>
    `,
  },
  Schedule: {
    title: "Schedule",
    intro: "Pick the service date and desired return time.",
    fields: `
      <div class="booking-field-grid">
        <label><span>Service date</span><input data-required name="serviceDate" type="date"></label>
        <label><span>Desired return time</span><select data-required name="returnTime">
          <option value="">Select return time</option>
          <option>9:00 AM</option>
          <option>9:30 AM</option>
          <option>10:00 AM</option>
          <option>10:30 AM</option>
          <option>11:00 AM</option>
        </select></label>
      </div>
      <div class="placeholder-note">Availability and booked-slot checks will be connected later.</div>
    `,
  },
  Handoff: {
    title: "Parking and Key Handoff",
    intro: "Tell the worker where the vehicle is parked and how keys will be handled for this request.",
    fields: `
      <div class="booking-field-grid">
        <label class="span-2"><span>Parking location</span><textarea data-required name="parking" rows="4" placeholder="Lot, row, spot, or nearby landmark"></textarea></label>
        <label class="span-2"><span>Key handoff details</span><textarea data-required name="handoff" rows="4" placeholder="How should the worker receive the keys?"></textarea></label>
      </div>
    `,
  },
  Payment: {
    title: "Payment Authorization",
    intro: "Review the payment authorization language. Payment capture will be connected later.",
    fields: `
      <div class="payment-placeholder">
        <strong>Payment placeholder</strong>
        <p>Service prices include payment and operating costs. Final fuel cost is based on the actual receipt. Final totals are rounded up to the nearest dollar.</p>
      </div>
      <label class="booking-check"><input data-required type="checkbox" name="paymentReady"><span>I understand payment authorization will be completed before booking.</span></label>
    `,
  },
  Review: {
    title: "Review",
    intro: "Confirm the booking details before submission. Final submission logic will be connected later.",
    fields: `
      <div class="review-placeholder">
        <strong>Review placeholder</strong>
        <p>This step will summarize customer, address/service area, vehicle, service, schedule, handoff, and payment authorization details.</p>
      </div>
    `,
  },
};

function stepIsComplete(panel) {
  const anyGroups = new Map();
  panel.querySelectorAll("[data-any-required]").forEach((input) => {
    const key = input.dataset.anyRequired;
    anyGroups.set(key, (anyGroups.get(key) || false) || Boolean(input.value.trim()));
  });
  for (const complete of anyGroups.values()) {
    if (!complete) return false;
  }

  const required = Array.from(panel.querySelectorAll("[data-required]"));
  return required.every((input) => {
    if (input.type === "radio") {
      return Boolean(panel.querySelector(`input[name="${input.name}"]:checked`));
    }
    if (input.type === "checkbox") return input.checked;
    return Boolean(input.value.trim());
  });
}

function createProgress(steps, currentIndex) {
  return `
    <ol class="booking-progress" aria-label="Booking progress">
      ${steps.map((step, index) => `
        <li class="${index === currentIndex ? "is-current" : ""} ${index < currentIndex ? "is-complete" : ""}">
          <span>${index + 1}</span>
          <strong>${step}</strong>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderFlow(root) {
  const flowName = root.dataset.bookingFlow || "book-now";
  const steps = flows[flowName] || flows["book-now"];
  let currentIndex = 0;

  const render = () => {
    const step = steps[currentIndex];
    const content = stepCopy[step];
    root.innerHTML = `
      ${createProgress(steps, currentIndex)}
      <article class="booking-step-card" data-current-step="${step}">
        <div class="booking-step-kicker">Step ${currentIndex + 1} of ${steps.length}</div>
        <h2>${content.title}</h2>
        <p>${content.intro}</p>
        <div class="booking-step-fields">${content.fields}</div>
        <div class="booking-step-actions">
          <button class="button secondary" type="button" data-back ${currentIndex === 0 ? "disabled" : ""}>Back</button>
          <button class="button primary" type="button" data-continue>${currentIndex === steps.length - 1 ? "Finish Review" : "Continue"}</button>
        </div>
      </article>
    `;
    updateContinue();
  };

  const updateContinue = () => {
    const panel = root.querySelector(".booking-step-card");
    const continueButton = root.querySelector("[data-continue]");
    if (!panel || !continueButton) return;
    continueButton.disabled = !stepIsComplete(panel);
  };

  root.addEventListener("input", updateContinue);
  root.addEventListener("change", updateContinue);
  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-back]")) {
      currentIndex = Math.max(0, currentIndex - 1);
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (event.target.closest("[data-continue]")) {
      const panel = root.querySelector(".booking-step-card");
      if (!panel || !stepIsComplete(panel)) return;
      currentIndex = Math.min(steps.length - 1, currentIndex + 1);
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  render();
}

if (flowRoot) renderFlow(flowRoot);
