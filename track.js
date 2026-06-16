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
  fuel_receipt_uploaded: "Fuel receipt uploaded",
  car_wash_in_progress: "Car wash in progress",
  car_wash_after_fuel_in_progress: "Car wash in progress",
  wash_receipt_uploaded: "Wash receipt uploaded",
  wash_receipt_after_fuel_uploaded: "Wash receipt uploaded",
  fueling_after_wash_in_progress: "Fueling in progress",
  fuel_receipt_after_wash_uploaded: "Fuel receipt uploaded",
  dropoff_vehicle_photo_uploaded: "Drop-off vehicle photo uploaded",
  dropoff_odometer_photo_uploaded: "Drop-off odometer photo uploaded",
  vehicle_returned: "Vehicle returned",
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

function canCustomerCancel(request) {
  return !terminalStatuses.includes(request.status);
}

function cancellationReasonForDisplay(request) {
  if (request.cancellation_reason) {
    return request.cancellation_reason;
  }

  if (terminalStatuses.includes(request.status) && request.notes) {
    return request.notes;
  }

  return "";
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

function renderRequest(request) {
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

      ${renderTimeline(request.status)}

      <div class="request-details">
        <p><strong>Customer:</strong> ${escapeHtml(request.customer_name)}</p>
        <p><strong>Vehicle:</strong> ${escapeHtml(request.vehicle_year)} ${escapeHtml(request.vehicle_make)} ${escapeHtml(request.vehicle_model)}, ${escapeHtml(request.vehicle_color)}</p>
        <p><strong>Service:</strong> ${escapeHtml(request.service_type)}</p>
        <p><strong>Parking:</strong> ${escapeHtml(request.parking_location)}, spot ${escapeHtml(request.parking_spot)}</p>
        <p><strong>Estimated total:</strong> ${formatCurrency(request.estimated_total)}</p>
        <p><strong>Final total:</strong> ${formatCurrency(request.final_total)}</p>
        ${cancellationReason ? `<p><strong>Reason:</strong> ${escapeHtml(cancellationReason)}</p>` : ""}
      </div>
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

  trackMessage.textContent = "Looking up request...";
  trackingResult.innerHTML = "";

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

  let matchedRequest = data[0];

  if (phone && !id && !email) {
    matchedRequest = data.find((request) => {
      return cleanPhone(request.customer_phone) === phone;
    });
  }

  if (!matchedRequest) {
    trackMessage.textContent = "No request found.";
    return;
  }

  trackMessage.textContent = "";
  renderRequest(matchedRequest);
});

trackingResult.addEventListener("click", async (event) => {
  const showCancelButton = event.target.closest(".show-cancel-request");
  const confirmCancelButton = event.target.closest(".confirm-cancel-request");

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
  renderRequest(data);
});
