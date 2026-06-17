const trackForm = document.querySelector("#track-form");
const trackingId = document.querySelector("#tracking-id");
const trackingPhone = document.querySelector("#tracking-phone");
const trackingEmail = document.querySelector("#tracking-email");
const trackMessage = document.querySelector("#track-message");
const trackingResult = document.querySelector("#tracking-result");

const shiftFuelDb = window.ShiftFuelSupabase;

const terminalStatuses = ["complete", "denied", "customer_canceled", "unable_to_complete"];

const statusLabels = {
  request_received: "Request received",
  accepted: "Accepted",
  key_received: "Key received",
  pickup_vehicle_photo_uploaded: "Pickup vehicle photo uploaded",
  pickup_odometer_photo_uploaded: "Pickup odometer photo uploaded",
  vehicle_picked_up: "Vehicle picked up",
  fueling_in_progress: "Fueling in progress",
  fueling_complete: "Fueling complete",
  fuel_receipt_uploaded: "Fuel receipt uploaded",
  car_wash_in_progress: "Car wash in progress",
  car_wash_complete: "Car wash complete",
  car_wash_after_fuel_in_progress: "Car wash in progress",
  wash_receipt_uploaded: "Wash receipt uploaded",
  wash_receipt_after_fuel_uploaded: "Wash receipt uploaded",
  fueling_after_wash_in_progress: "Fueling in progress",
  fuel_receipt_after_wash_uploaded: "Fuel receipt uploaded",
  receipts_recorded: "Receipts recorded",
  returned_location_pending: "Vehicle returned",
  return_location_recorded: "Return location recorded",
  return_photos_needed: "Return photos needed",
  dropoff_vehicle_photo_uploaded: "Drop-off vehicle photo uploaded",
  dropoff_odometer_photo_uploaded: "Drop-off odometer photo uploaded",
  vehicle_returned: "Vehicle returned",
  inspection_needed: "Vehicle inspection needed",
  inspection_recorded: "Vehicle inspection recorded",
  complete: "Complete",
  denied: "Denied",
  customer_canceled: "Canceled by customer",
  unable_to_complete: "Unable to complete",
};

const statusSteps = [
  { key: "request_received", label: "Request received" },
  { key: "accepted", label: "Accepted" },
  { key: "key_received", label: "Key received" },
  { key: "vehicle_picked_up", label: "Vehicle picked up" },
  { key: "fueling_in_progress", label: "Fueling in progress" },
  { key: "vehicle_returned", label: "Vehicle returned" },
  { key: "complete", label: "Complete" },
];

function cleanPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function hoursSince(value) {
  const time = new Date(value || Date.now()).getTime();
  return (Date.now() - time) / (1000 * 60 * 60);
}

function canCustomerCancel(request) {
  return !terminalStatuses.includes(request.status);
}

function cancellationReasonForDisplay(request) {
  const reason = String(request.cancellation_reason || "").trim();

  if (!reason || !["denied", "customer_canceled"].includes(request.status)) {
    return "";
  }

  const looksLikeOperationalNotes = /\[(pickup_time|dropoff_time|receipt_totals|service_unable)\]|Quick inspection recorded|receipt recorded/i.test(reason);

  if (looksLikeOperationalNotes) {
    return "";
  }

  return reason;
}

function savedFeeOrDefault(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function requestNeedsFuel(request) {
  return String(request.service_type || "").includes("fuel");
}

function requestNeedsWash(request) {
  return String(request.service_type || "").includes("wash");
}

function receiptTotalsFromNotes(request) {
  const matches = Array.from(String(request.notes || "").matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

function serviceUnableReasonsFromNotes(request) {
  const notes = String(request.notes || "");
  const reasons = { fuel: "", wash: "" };

  for (const match of notes.matchAll(/\[service_unable (fuel|wash)\] [^:]+: ([^\n]+)/g)) {
    reasons[match[1]] = match[2];
  }

  return reasons;
}

function renderAssignedWorker(request) {
  if (!request.assigned_worker_name) {
    return "";
  }

  return `
    <section class="assigned-worker-card">
      ${request.assigned_worker_photo_url ? `<img class="worker-avatar" src="${escapeHtml(request.assigned_worker_photo_url)}" alt="${escapeHtml(request.assigned_worker_name)}">` : '<div class="worker-avatar worker-avatar-placeholder">No photo</div>'}
      <div>
        <p class="eyebrow">Who is working on your car</p>
        <h3>${escapeHtml(request.assigned_worker_name)}</h3>
        ${request.assigned_worker_phone ? `<p><strong>Phone:</strong> ${escapeHtml(request.assigned_worker_phone)}</p>` : '<p class="field-help">Contact information will be added soon.</p>'}
      </div>
    </section>
  `;
}

function renderTimeline(currentStatus) {
  const currentIndex = statusSteps.findIndex((step) => step.key === currentStatus);

  return `
    <ol class="customer-timeline">
      ${statusSteps
        .map((step, index) => {
          const isDone = index <= currentIndex;
          return `
            <li class="${isDone ? "done" : ""}">
              <span>${isDone ? "✓" : index + 1}</span>
              <p>${step.label}</p>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function renderPhotos(request, photos) {
  const photoByType = new Map();
  photos.forEach((photo) => {
    if (!photoByType.has(photo.photo_type)) {
      photoByType.set(photo.photo_type, photo);
    }
  });

  const photoSlot = (label, types) => {
    const photo = types.map((type) => photoByType.get(type)).find(Boolean);

    if (!photo) {
      return `
        <div class="photo-proof-card photo-proof-missing">
          <span>${escapeHtml(label)}</span>
          <p>Not uploaded yet</p>
        </div>
      `;
    }

    return `
      <a class="photo-proof-card" href="${escapeHtml(photo.image_url)}" target="_blank" rel="noopener">
        <img src="${escapeHtml(photo.image_url)}" alt="${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
      </a>
    `;
  };

  const section = (title, slots, isCompact = false) => `
    <section class="photo-proof-section ${isCompact ? "photo-proof-section-compact" : ""}">
      <h3>${escapeHtml(title)}</h3>
      <div class="photo-proof-grid">
        ${slots.map((slot) => photoSlot(slot.label, slot.types)).join("")}
      </div>
    </section>
  `;

  return `
    <div class="photo-proof-sections">
      ${section("Pickup", [
        { label: "Driver Side Front", types: ["pickup_driver_front", "pickup_front"] },
        { label: "Passenger Side Front", types: ["pickup_passenger_front", "pickup_passenger_side"] },
        { label: "Driver Side Rear", types: ["pickup_driver_rear", "pickup_driver_side"] },
        { label: "Passenger Side Rear", types: ["pickup_passenger_rear", "pickup_rear"] },
        { label: "Odometer", types: ["pickup_odometer"] },
      ])}
      ${requestNeedsFuel(request) ? section("Fuel Receipt", [
        { label: "Receipt", types: ["fuel_receipt"] },
      ], true) : ""}
      ${requestNeedsWash(request) ? section("Car Wash Receipt", [
        { label: "Receipt", types: ["wash_receipt"] },
      ], true) : ""}
      ${section("Drop off", [
        { label: "Driver Side Front", types: ["dropoff_driver_front", "dropoff_front"] },
        { label: "Passenger Side Front", types: ["dropoff_passenger_front", "dropoff_passenger_side"] },
        { label: "Driver Side Rear", types: ["dropoff_driver_rear", "dropoff_driver_side"] },
        { label: "Passenger Side Rear", types: ["dropoff_passenger_rear", "dropoff_rear"] },
        { label: "Odometer", types: ["dropoff_odometer"] },
      ])}
      ${section("Return back", [
        { label: "Ending Fuel Gauge", types: ["dropoff_fuel_gauge"] },
      ], true)}
    </div>
  `;
}

function inspectionSummaryFromNotes(request) {
  const notes = String(request.notes || "");
  const codeMatches = Array.from(notes.matchAll(/Trouble code ([A-Z0-9]+): ([\s\S]*?) Possible fixes: ([^\n]+)/g));
  const psiMatches = Array.from(notes.matchAll(/Tire PSI before\/after: ([\s\S]*?)(?:\. Trouble code|\n|$)/g));
  const latestCode = codeMatches.at(-1);
  const latestPsi = psiMatches.at(-1);

  if (!latestCode && !latestPsi) {
    return "";
  }

  return `
    <section class="inspection-summary">
      <h3>Vehicle inspection</h3>
      ${latestPsi ? `<p><strong>Tire pressure:</strong> ${escapeHtml(latestPsi[1].trim().replace(/\.$/, ""))}.</p>` : ""}
      ${latestCode ? `
        <p><strong>Trouble code ${escapeHtml(latestCode[1])}:</strong> ${escapeHtml(latestCode[2].trim())}</p>
        <p><strong>Possible fixes:</strong> ${escapeHtml(latestCode[3].trim())}</p>
      ` : ""}
    </section>
  `;
}

function serviceSummaryFromRequest(request) {
  const receiptTotals = receiptTotalsFromNotes(request);
  const unableReasons = serviceUnableReasonsFromNotes(request);
  const fuelFee = requestNeedsFuel(request) && receiptTotals.fuel > 0 ? savedFeeOrDefault(request.fuel_convenience_fee, 15) : 0;
  const washFee = requestNeedsWash(request) && receiptTotals.wash > 0 ? savedFeeOrDefault(request.wash_convenience_fee, 15) : 0;
  const inspectionFee = request.quick_inspection ? savedFeeOrDefault(request.quick_inspection_fee, 5) : 0;
  const lines = [];

  if (requestNeedsFuel(request)) {
    lines.push(unableReasons.fuel
      ? `<p><strong>Fuel:</strong> Not completed. ${escapeHtml(unableReasons.fuel)}</p>`
      : `<p><strong>Fuel:</strong> ${formatCurrency(receiptTotals.fuel)} receipt + ${formatCurrency(fuelFee)} convenience fee.</p>`);
  }

  if (requestNeedsWash(request)) {
    lines.push(unableReasons.wash
      ? `<p><strong>Car wash:</strong> Not completed. ${escapeHtml(unableReasons.wash)}</p>`
      : `<p><strong>Car wash:</strong> ${formatCurrency(receiptTotals.wash)} receipt + ${formatCurrency(washFee)} convenience fee.</p>`);
  }

  if (request.quick_inspection) {
    lines.push(`<p><strong>Quick inspection:</strong> ${formatCurrency(inspectionFee)}</p>`);
  }

  if (!lines.length && request.final_total == null) {
    return "";
  }

  return `
    <section class="inspection-summary">
      <h3>Service summary</h3>
      ${lines.join("")}
      <p><strong>Final total:</strong> ${formatCurrency(request.final_total)}</p>
    </section>
  `;
}

function serviceTimingFromNotes(request) {
  const notes = String(request.notes || "");
  const pickupMatches = Array.from(notes.matchAll(/\[pickup_time ([^\]]+)\]/g));
  const dropoffMatches = Array.from(notes.matchAll(/\[dropoff_time ([^\]]+)\]/g));
  const pickup = pickupMatches.at(-1)?.[1] || "";
  const dropoff = dropoffMatches.at(-1)?.[1] || "";

  if (!pickup && !dropoff) {
    return "";
  }

  const format = (value) => new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  return `
    <section class="inspection-summary">
      <h3>Service timing</h3>
      ${pickup ? `<p><strong>Pickup photo timestamp:</strong> ${escapeHtml(format(pickup))}</p>` : ""}
      ${dropoff ? `<p><strong>Drop-off photo timestamp:</strong> ${escapeHtml(format(dropoff))}</p>` : ""}
    </section>
  `;
}

async function loadRequestPhotos(requestId) {
  const { data, error } = await shiftFuelDb
    .from("photos")
    .select("photo_type,image_url,created_at")
    .eq("service_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Photo lookup skipped:", error);
    return [];
  }

  return data || [];
}

async function loadRequestReview(requestId) {
  const { data, error } = await shiftFuelDb
    .from("service_reviews")
    .select("id,rating,comments,submitted_at")
    .eq("service_request_id", requestId)
    .maybeSingle();

  if (error) {
    console.warn("Review lookup skipped:", error);
    return null;
  }

  return data || null;
}

function shouldShowReviewPrompt(request, review) {
  return request.status === "complete" && !review && hoursSince(request.updated_at || request.created_at) <= 24;
}

function renderReviewPrompt(request, review) {
  if (review) {
    return "";
  }

  if (!shouldShowReviewPrompt(request, review)) {
    return "";
  }

  const ratingLabels = {
    5: "5 - Amazing",
    4: "4 - Good",
    3: "3 - Okay",
    2: "2 - Poor",
    1: "1 - Terrible",
  };

  return `
    <section class="review-panel">
      <h3>Please review our service</h3>
      <p class="field-help">Tell us how we did. After you submit, this review request will disappear from tracking.</p>
      <p class="field-help">5 is amazing. 1 is terrible. Comments are optional for 4-5 and required for 1-3.</p>
      <div class="rating-options" role="radiogroup" aria-label="Service rating">
        ${[5, 4, 3, 2, 1].map((rating) => `
          <label>
            <input type="radio" name="service-rating" value="${rating}">
            <span>${ratingLabels[rating]}</span>
          </label>
        `).join("")}
      </div>
      <label>
        Comments
        <textarea id="service-review-comments" rows="3" placeholder="Optional for 4-5. Required if rating is 3 or below."></textarea>
      </label>
      <button
        class="button primary submit-service-review"
        data-request-id="${escapeHtml(request.id)}"
        data-customer-name="${escapeHtml(request.customer_name)}"
        data-customer-phone="${escapeHtml(request.customer_phone)}"
        data-customer-email="${escapeHtml(request.customer_email || "")}"
        type="button"
      >Submit review</button>
    </section>
  `;
}

function routeHomeAfterReview() {
  window.location.href = "index.html";
}

async function markReviewComplete(requestId) {
  const updates = {
    status: "complete",
    review_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let { error } = await shiftFuelDb
    .from("service_requests")
    .update(updates)
    .eq("id", requestId);

  if (error?.code === "PGRST204" && String(error.message || "").includes("'review_completed_at'")) {
    delete updates.review_completed_at;
    ({ error } = await shiftFuelDb
      .from("service_requests")
      .update(updates)
      .eq("id", requestId));
  }

  if (error) {
    console.warn("Could not mark review complete:", error);
  }
}

function renderRequest(request, photos = [], review = null) {
  const statusLabel = statusLabels[request.status] || request.status;
  const cancellationReason = cancellationReasonForDisplay(request);

  trackingResult.innerHTML = `
    <article class="request-card" data-request-id="${escapeHtml(request.id)}">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(request.id)}</p>
          <h2>${escapeHtml(statusLabel)}</h2>
        </div>
        <span class="status-pill">${escapeHtml(statusLabel)}</span>
      </div>

      <div class="request-details">
        <p><strong>Customer:</strong> ${escapeHtml(request.customer_name)}</p>
        <p><strong>Vehicle:</strong> ${escapeHtml(request.vehicle_year)} ${escapeHtml(request.vehicle_make)} ${escapeHtml(request.vehicle_model)}, ${escapeHtml(request.vehicle_color)}</p>
        <p><strong>Service:</strong> ${escapeHtml(request.service_type)}</p>
        <p><strong>Parking:</strong> ${escapeHtml(request.parking_location)}, spot ${escapeHtml(request.parking_spot)}</p>
        ${request.return_parking_location ? `<p><strong>Drop-off site:</strong> ${escapeHtml(request.return_parking_location)}, spot ${escapeHtml(request.return_parking_spot || "")}</p>` : ""}
        ${request.return_parking_map_url ? `<p><strong>Drop-off map:</strong> <a href="${escapeHtml(request.return_parking_map_url)}" target="_blank" rel="noopener">Open map</a></p>` : ""}
        <p><strong>Estimated total:</strong> ${formatCurrency(request.estimated_total)}</p>
        <p><strong>Final total:</strong> ${formatCurrency(request.final_total)}</p>
        ${cancellationReason ? `<p><strong>Reason:</strong> ${escapeHtml(cancellationReason)}</p>` : ""}
      </div>
      ${renderAssignedWorker(request)}
      ${serviceTimingFromNotes(request)}
      ${serviceSummaryFromRequest(request)}
      ${inspectionSummaryFromNotes(request)}
      ${renderPhotos(request, photos)}
      ${renderReviewPrompt(request, review)}
      ${canCustomerCancel(request) ? `
        <div class="tracking-actions">
          <button class="button danger show-cancel-request" type="button">Cancel request</button>
        </div>
        <div class="cancel-panel" hidden>
          <label>
            Reason for cancellation
            <textarea id="customer-cancel-reason" rows="3" placeholder="Example: I no longer need service today."></textarea>
          </label>
          <button class="button danger confirm-cancel-request" data-request-id="${escapeHtml(request.id)}" type="button">
            Confirm cancellation
          </button>
        </div>
      ` : ""}
    </article>
  `;
}

trackForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = trackingId.value.trim();
  const phone = cleanPhone(trackingPhone.value);
  const email = trackingEmail.value.trim().toLowerCase();

  trackingResult.innerHTML = "";

  if (!id && (!phone || !email)) {
    trackMessage.textContent = "Enter both phone number and email address, or enter a request ID with one matching contact detail.";
    trackingPhone.focus();
    return;
  }

  if (id && !phone && !email) {
    trackMessage.textContent = "For security, enter the request ID plus the phone number or email used to book.";
    trackingPhone.focus();
    return;
  }

  trackMessage.textContent = "Looking up request...";

  let query = shiftFuelDb
    .from("service_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (id) {
    query = query.eq("id", id);
  } else if (email) {
    query = query.ilike("customer_email", email);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    console.error("Tracking lookup error:", error);
    trackMessage.textContent = "No request found.";
    return;
  }

  let matchedRequest = null;

  if (id) {
    matchedRequest = data.find((request) => {
      const phoneMatches = phone && cleanPhone(request.customer_phone) === phone;
      const emailMatches = email && String(request.customer_email || "").toLowerCase() === email;
      return phoneMatches || emailMatches;
    });
  } else {
    matchedRequest = data.find((request) => {
      return cleanPhone(request.customer_phone) === phone
        && String(request.customer_email || "").toLowerCase() === email;
    });
  }

  if (!matchedRequest) {
    trackMessage.textContent = "No request found.";
    return;
  }

  trackMessage.textContent = "";
  const photos = await loadRequestPhotos(matchedRequest.id);
  const review = await loadRequestReview(matchedRequest.id);
  renderRequest(matchedRequest, photos, review);
});

trackingResult.addEventListener("click", async (event) => {
  const showCancelButton = event.target.closest(".show-cancel-request");
  const confirmCancelButton = event.target.closest(".confirm-cancel-request");
  const submitReviewButton = event.target.closest(".submit-service-review");

  if (submitReviewButton) {
    const panel = submitReviewButton.closest(".review-panel");
    const rating = panel.querySelector("input[name='service-rating']:checked")?.value;
    const comments = panel.querySelector("#service-review-comments")?.value.trim() || "";
    const requestId = submitReviewButton.dataset.requestId;

    if (!rating) {
      trackMessage.textContent = "Choose a rating before submitting your review.";
      return;
    }

    if (Number(rating) <= 3 && !comments) {
      trackMessage.textContent = "Please add a comment for ratings of 3 or below so we know what to fix.";
      panel.querySelector("#service-review-comments")?.focus();
      return;
    }

    submitReviewButton.disabled = true;
    submitReviewButton.textContent = "Submitting...";
    trackMessage.textContent = "";

    const reviewRow = {
      service_request_id: requestId,
      rating: Number(rating),
      comments,
      customer_name: submitReviewButton.dataset.customerName || null,
      customer_phone: submitReviewButton.dataset.customerPhone || null,
      customer_email: submitReviewButton.dataset.customerEmail || null,
    };

    let { error } = await shiftFuelDb.from("service_reviews").insert(reviewRow);

    if (error?.code === "PGRST204") {
      delete reviewRow.customer_name;
      delete reviewRow.customer_phone;
      delete reviewRow.customer_email;
      ({ error } = await shiftFuelDb.from("service_reviews").insert(reviewRow));
    }

    if (error?.code === "23505") {
      await markReviewComplete(requestId);
      panel.remove();
      trackMessage.textContent = "Thank you for reviewing our service.";
      routeHomeAfterReview();
      return;
    }

    if (error) {
      console.error("Review submit error:", error);
      if (error.code === "42P01" || error.code === "PGRST205") {
        trackMessage.textContent = "Review table is missing in Supabase. Run supabase-service-reviews.sql.";
      } else if (error.code === "42501" || String(error.message || "").toLowerCase().includes("row-level security")) {
        trackMessage.textContent = "Supabase blocked review saving. Run the review SQL again so the insert policy is added.";
      } else {
        trackMessage.textContent = `Could not save the review: ${error.message || "Supabase rejected the request."}`;
      }
      submitReviewButton.disabled = false;
      submitReviewButton.textContent = "Submit review";
      return;
    }

    await markReviewComplete(requestId);
    panel.remove();
    trackMessage.textContent = "Thank you for reviewing our service.";
    routeHomeAfterReview();
    return;
  }

  if (showCancelButton) {
    const panel = trackingResult.querySelector(".cancel-panel");
    const reasonInput = trackingResult.querySelector("#customer-cancel-reason");

    if (panel) {
      panel.hidden = !panel.hidden;
    }

    if (reasonInput && panel && !panel.hidden) {
      reasonInput.focus();
    }

    return;
  }

  if (!confirmCancelButton) {
    return;
  }

  const requestId = confirmCancelButton.dataset.requestId;
  const reasonInput = trackingResult.querySelector("#customer-cancel-reason");
  const reason = reasonInput?.value.trim() || "";

  if (!reason) {
    trackMessage.textContent = "Please add a reason before canceling.";
    reasonInput?.focus();
    return;
  }

  confirmCancelButton.textContent = "Canceling...";
  confirmCancelButton.disabled = true;
  trackMessage.textContent = "";

  let { data, error } = await shiftFuelDb
    .from("service_requests")
    .update({
      status: "customer_canceled",
      cancellation_reason: reason,
    })
    .eq("id", requestId)
    .select()
    .single();

  if (error?.code === "PGRST204") {
    ({ data, error } = await shiftFuelDb
      .from("service_requests")
      .update({
        status: "customer_canceled",
        notes: `Customer cancellation reason: ${reason}`,
      })
      .eq("id", requestId)
      .select()
      .single());
  }

  if (error) {
    console.error("Customer cancellation error:", error);
    trackMessage.textContent = "Could not cancel this request.";
    confirmCancelButton.textContent = "Confirm cancellation";
    confirmCancelButton.disabled = false;
    return;
  }

  trackMessage.textContent = "Request canceled.";
  const photos = await loadRequestPhotos(data.id);
  const review = await loadRequestReview(data.id);
  renderRequest(data, photos, review);
});
