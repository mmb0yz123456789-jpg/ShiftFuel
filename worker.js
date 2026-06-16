const workerDb = window.ShiftFuelSupabase;
const workerProfileForm = document.querySelector('#worker-profile-form');
const workerProfileName = document.querySelector('#worker-profile-name');
const workerProfilePhone = document.querySelector('#worker-profile-phone');
const workerProfileLocation = document.querySelector('#worker-profile-location');
const workerProfileStarted = document.querySelector('#worker-profile-started');
const workerProfilePhoto = document.querySelector('#worker-profile-photo');
const workerProfileStatus = document.querySelector('#worker-profile-status');
const workerProfilePhotoPreview = document.querySelector('#worker-profile-photo-preview');
const workerProfilePhotoPlaceholder = document.querySelector('#worker-profile-photo-placeholder');
const workerPortalHeading = document.querySelector('#worker-portal-heading');
const workerScheduleForm = document.querySelector('#worker-schedule-form');
const workerScheduleStatus = document.querySelector('#worker-schedule-status');
const workerLocation = document.querySelector('#worker-location');
const workerDaysGrid = document.querySelector('#worker-days-grid');
const workerDaysOffCalendar = document.querySelector('#worker-days-off-calendar');
const workerDaysOffSummary = document.querySelector('#worker-days-off-summary');
const openWorkdaysPanel = document.querySelector('#open-workdays-panel');
const closeWorkdaysPanel = document.querySelector('#close-workdays-panel');
const workdaysPanel = document.querySelector('#workdays-panel');
const saveWorkdaysButton = document.querySelector('#save-workdays');
const openDaysOffPanel = document.querySelector('#open-days-off-panel');
const closeDaysOffPanel = document.querySelector('#close-days-off-panel');
const daysOffPanel = document.querySelector('#days-off-panel');
const saveDaysOffButton = document.querySelector('#save-days-off');
const workerJobList = document.querySelector('#worker-job-list');
const workerReviewList = document.querySelector('#worker-review-list');

const SESSION_WORKER_NAME = sessionStorage.getItem('shiftfuel_worker') || 'Mark Urban';
const DEFAULT_WORK_LOCATION = 'ChristianaCare - 4755 Ogletown Stanton Rd, Newark, DE 19718';
const PHOTO_BUCKET = 'service-photos';
const workerDayOptions = [
  { dayOfWeek: 1, label: 'Monday' },
  { dayOfWeek: 2, label: 'Tuesday' },
  { dayOfWeek: 3, label: 'Wednesday' },
  { dayOfWeek: 4, label: 'Thursday' },
  { dayOfWeek: 5, label: 'Friday' },
  { dayOfWeek: 6, label: 'Saturday' },
  { dayOfWeek: 0, label: 'Sunday' },
];

let currentEmployee = null;
let selectedWorkerDaysOff = new Set();
let copiedWorkerDaySchedule = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatWorkerJobTime(request) {
  return [request.service_date, String(request.desired_return_time || '').slice(0, 5)]
    .filter(Boolean)
    .join(' ');
}

function setWorkerStatus(message) {
  if (workerProfileStatus) {
    workerProfileStatus.textContent = message;
  }
}

function setScheduleStatus(message) {
  if (workerScheduleStatus) {
    workerScheduleStatus.textContent = message;
  }
}

function showWorkerPhoto(photoUrl) {
  if (workerProfilePhotoPreview && workerProfilePhotoPlaceholder) {
    workerProfilePhotoPreview.hidden = !photoUrl;
    workerProfilePhotoPlaceholder.hidden = Boolean(photoUrl);

    if (photoUrl) {
      workerProfilePhotoPreview.src = photoUrl;
    }
  }
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function ensureWorkerProfile() {
  const storedEmployeeId = localStorage.getItem(`shiftfuel_worker_id_${SESSION_WORKER_NAME}`);

  if (storedEmployeeId) {
    let { data: stored, error: storedError } = await workerDb
      .from('employees')
      .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
      .eq('id', storedEmployeeId)
      .limit(1);

    if (storedError) {
      const fallback = await workerDb
        .from('employees')
        .select('id,full_name,phone,home_location')
        .eq('id', storedEmployeeId)
        .limit(1);

      stored = fallback.data;
      storedError = fallback.error;
    }

    if (!storedError && stored?.length) {
      return {
        photo_url: '',
        started_at: '',
        ...stored[0],
      };
    }
  }

  let { data, error } = await workerDb
    .from('employees')
    .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
    .eq('full_name', SESSION_WORKER_NAME)
    .limit(1);

  if (error) {
    const fallback = await workerDb
      .from('employees')
      .select('id,full_name,phone,home_location')
      .eq('full_name', SESSION_WORKER_NAME)
      .limit(1);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;

  if (data?.length) {
    return {
      photo_url: '',
      started_at: '',
      ...data[0],
    };
  }

  let { data: inserted, error: insertError } = await workerDb
    .from('employees')
    .insert({
      employee_code: `EMP-${SESSION_WORKER_NAME.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER'}`,
      full_name: SESSION_WORKER_NAME,
      active: true,
      home_location: DEFAULT_WORK_LOCATION,
    })
    .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
    .single();

  if (insertError) {
    const fallback = await workerDb
      .from('employees')
      .insert({
        employee_code: `EMP-${SESSION_WORKER_NAME.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WORKER'}`,
        full_name: SESSION_WORKER_NAME,
        active: true,
        home_location: DEFAULT_WORK_LOCATION,
      })
      .select('id,full_name,phone,home_location')
      .single();

    inserted = fallback.data;
    insertError = fallback.error;
  }

  if (insertError) throw insertError;
  return {
    photo_url: '',
    started_at: '',
    ...inserted,
  };
}

function renderWorkerDaysGrid(workdays = []) {
  if (!workerDaysGrid) return;

  const workdayMap = new Map(workdays.map((day) => [Number(day.dayOfWeek), day]));

  workerDaysGrid.innerHTML = workerDayOptions.map(({ dayOfWeek, label }) => {
    const savedDay = workdayMap.get(dayOfWeek);
    const enabled = savedDay ? 'checked' : '';
    const startsAt = savedDay?.startsAt || '07:00';
    const endsAt = savedDay?.endsAt || '22:00';

    return `
      <div class="worker-day-row" data-day-of-week="${dayOfWeek}">
        <label class="checkbox-label worker-day-toggle">
          <input class="worker-day-enabled" type="checkbox" data-day-of-week="${dayOfWeek}" ${enabled}>
          <span>${label}</span>
        </label>
        <label>Start
          <input class="worker-day-start" type="time" data-day-of-week="${dayOfWeek}" value="${startsAt}">
        </label>
        <label>End
          <input class="worker-day-end" type="time" data-day-of-week="${dayOfWeek}" value="${endsAt}">
        </label>
        <div class="worker-day-copy-actions">
          <button class="button worker-copy-day" type="button">Copy</button>
          <button class="button worker-paste-day" type="button" ${copiedWorkerDaySchedule ? '' : 'disabled'}>Paste</button>
        </div>
      </div>
    `;
  }).join('');
}

function selectedWorkdaysFromForm() {
  if (!workerDaysGrid) return [];

  return Array.from(workerDaysGrid.querySelectorAll('.worker-day-enabled:checked'))
    .map((checkbox) => {
      const dayOfWeek = Number(checkbox.dataset.dayOfWeek);
      const row = workerDaysGrid.querySelector(`.worker-day-row[data-day-of-week="${dayOfWeek}"]`);
      return {
        dayOfWeek,
        startsAt: row?.querySelector('.worker-day-start')?.value || '07:00',
        endsAt: row?.querySelector('.worker-day-end')?.value || '22:00',
      };
    })
    .filter((day) => day.startsAt && day.endsAt);
}

function refreshWorkerPasteButtons() {
  workerDaysGrid?.querySelectorAll('.worker-paste-day').forEach((button) => {
    button.disabled = !copiedWorkerDaySchedule;
  });
}

function setWorkerCopyMode(mode) {
  if (!workerDaysGrid) return;
  workerDaysGrid.classList.toggle('paste-ready', mode === 'paste');
  workerDaysGrid.classList.toggle('copy-ready', mode === 'copy');
}

function updateWorkerDaysOffSummary() {
  if (!workerDaysOffSummary) return;

  const daysOff = Array.from(selectedWorkerDaysOff).sort();
  workerDaysOffSummary.textContent = daysOff.length
    ? `Days marked unbookable: ${daysOff.join(', ')}`
    : 'No days off selected.';
}

function renderWorkerDaysOffCalendar() {
  if (!workerDaysOffCalendar) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastBookableDate = new Date(today);
  lastBookableDate.setMonth(lastBookableDate.getMonth() + 3);
  const monthCount = ((lastBookableDate.getFullYear() - startMonth.getFullYear()) * 12)
    + lastBookableDate.getMonth()
    - startMonth.getMonth()
    + 1;

  workerDaysOffCalendar.innerHTML = Array.from({ length: monthCount }, (_, index) => {
    const monthDate = new Date(startMonth.getFullYear(), startMonth.getMonth() + index, 1);
    const firstDayOffset = monthDate.getDay();
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const blankDays = Array.from({ length: firstDayOffset }, () => '<span class="calendar-empty"></span>').join('');
    const dayButtons = Array.from({ length: daysInMonth }, (_, dayIndex) => {
      const dayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayIndex + 1);
      const value = localDateValue(dayDate);
      const isPast = dayDate < today;
      const isOutsideWindow = dayDate > lastBookableDate;
      const classes = ['calendar-day'];
      if (selectedWorkerDaysOff.has(value)) classes.push('day-off');

      return `
        <button type="button" class="${classes.join(' ')}" data-day-off="${value}" ${isPast || isOutsideWindow ? 'disabled' : ''}>
          ${dayIndex + 1}
        </button>
      `;
    }).join('');

    return `
      <section class="worker-calendar-month">
        <h4>${monthLabel(monthDate)}</h4>
        <div class="calendar-weekdays">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>
        <div class="calendar-days">${blankDays}${dayButtons}</div>
      </section>
    `;
  }).join('');

  updateWorkerDaysOffSummary();
}

async function loadWorkerSchedule() {
  if (!currentEmployee) return;

  const { data: availability, error: availabilityError } = await workerDb
    .from('employee_availability')
    .select('day_of_week,starts_at,ends_at,work_location')
    .eq('employee_id', currentEmployee.id);

  if (availabilityError) {
    console.warn('Could not load worker availability:', availabilityError);
    renderWorkerDaysGrid([]);
  } else {
    const rows = availability || [];
    renderWorkerDaysGrid(rows.map((row) => ({
      dayOfWeek: row.day_of_week,
      startsAt: String(row.starts_at || '07:00').slice(0, 5),
      endsAt: String(row.ends_at || '22:00').slice(0, 5),
    })));

    const location = rows.find((row) => row.work_location)?.work_location || currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerLocation) workerLocation.value = location;
    if (workerProfileLocation) workerProfileLocation.value = location;
  }

  const { data: daysOff, error: daysOffError } = await workerDb
    .from('employee_days_off')
    .select('day_off')
    .eq('employee_id', currentEmployee.id);

  if (daysOffError) {
    console.warn('Could not load worker days off:', daysOffError);
  } else {
    selectedWorkerDaysOff = new Set((daysOff || []).map((item) => item.day_off));
  }

  renderWorkerDaysOffCalendar();
}

async function loadWorkerProfile() {
  try {
    currentEmployee = await ensureWorkerProfile();
    localStorage.setItem(`shiftfuel_worker_id_${SESSION_WORKER_NAME}`, currentEmployee.id);
    const workerName = currentEmployee.full_name || SESSION_WORKER_NAME;
    sessionStorage.setItem('shiftfuel_worker', workerName);

    if (workerPortalHeading) workerPortalHeading.textContent = workerName;
    if (workerProfileName) workerProfileName.value = workerName;
    if (workerProfilePhone) workerProfilePhone.value = currentEmployee.phone || '';
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;

    showWorkerPhoto(currentEmployee.photo_url || '');
    setWorkerStatus('');
    await loadWorkerSchedule();
    await loadWorkerJobs();
    await loadWorkerReviews();
  } catch (error) {
    console.error('Could not load worker profile:', error);
    setWorkerStatus('Could not load worker profile. Run supabase-operational-upgrades.sql in Supabase.');
  }
}

async function uploadWorkerPhoto(file) {
  const safeName = file.name.replace(/[^a-z0-9.-]/gi, '-').toLowerCase();
  const path = `workers/${currentEmployee.id}/${Date.now()}-${safeName || 'profile.jpg'}`;

  const { error } = await workerDb.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;

  const { data } = workerDb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data?.publicUrl || path;
}

async function saveWorkerAvailability() {
  const workdays = selectedWorkdaysFromForm();
  if (!currentEmployee || !workdays.length) {
    setScheduleStatus('Choose at least one workday before saving.');
    return;
  }

  const workLocation = workerLocation?.value || DEFAULT_WORK_LOCATION;
  const { error: deleteError } = await workerDb
    .from('employee_availability')
    .delete()
    .eq('employee_id', currentEmployee.id);

  if (deleteError) throw deleteError;

  const { error: insertError } = await workerDb.from('employee_availability').insert(workdays.map((day) => ({
    employee_id: currentEmployee.id,
    day_of_week: day.dayOfWeek,
    starts_at: day.startsAt,
    ends_at: day.endsAt,
    work_location: workLocation,
  })));

  if (insertError) throw insertError;

  await workerDb
    .from('employees')
    .update({ home_location: workLocation, profile_updated_at: new Date().toISOString() })
    .eq('id', currentEmployee.id);

  currentEmployee.home_location = workLocation;
  if (workerProfileLocation) workerProfileLocation.value = workLocation;
  setScheduleStatus('Work days and shift times saved.');
}

async function saveWorkerDaysOff() {
  if (!currentEmployee) return;

  const { error: deleteError } = await workerDb
    .from('employee_days_off')
    .delete()
    .eq('employee_id', currentEmployee.id);

  if (deleteError) throw deleteError;

  const rows = Array.from(selectedWorkerDaysOff).sort().map((dayOff) => ({
    employee_id: currentEmployee.id,
    day_off: dayOff,
  }));

  if (rows.length) {
    const { error: insertError } = await workerDb.from('employee_days_off').insert(rows);
    if (insertError) throw insertError;
  }

  setScheduleStatus('Days off saved and marked unbookable.');
}

async function loadWorkerReviews() {
  if (!workerReviewList || !currentEmployee) return;

  workerReviewList.innerHTML = '<div class="empty-state"><p>Loading reviews...</p></div>';

  const { data: requests, error: requestError } = await workerDb
    .from('service_requests')
    .select('id,customer_name,vehicle_year,vehicle_make,vehicle_model')
    .eq('assigned_employee_id', currentEmployee.id);

  if (requestError) {
    console.warn('Could not load assigned requests:', requestError);
    workerReviewList.innerHTML = '<div class="empty-state"><p>Could not load assigned requests.</p></div>';
    return;
  }

  const requestMap = new Map((requests || []).map((request) => [request.id, request]));
  const requestIds = Array.from(requestMap.keys());

  if (!requestIds.length) {
    workerReviewList.innerHTML = '<div class="empty-state"><p>No assigned reviews yet.</p></div>';
    return;
  }

  const { data: reviews, error: reviewError } = await workerDb
    .from('service_reviews')
    .select('id,service_request_id,rating,comments,customer_name,submitted_at')
    .in('service_request_id', requestIds)
    .order('submitted_at', { ascending: false });

  if (reviewError) {
    console.warn('Could not load worker reviews:', reviewError);
    workerReviewList.innerHTML = '<div class="empty-state"><p>Could not load reviews. Run supabase-service-reviews.sql in Supabase.</p></div>';
    return;
  }

  if (!reviews?.length) {
    workerReviewList.innerHTML = '<div class="empty-state"><p>No reviews for this worker yet.</p></div>';
    return;
  }

  workerReviewList.innerHTML = reviews.map((review) => {
    const request = requestMap.get(review.service_request_id) || {};
    return `
      <article class="request-card">
        <div class="request-card-header">
          <div>
            <p class="eyebrow">${escapeHtml(formatDateTime(review.submitted_at))}</p>
            <h3>${escapeHtml(review.rating)} / 5 rating</h3>
          </div>
          <span class="status-pill">${escapeHtml(request.vehicle_make || 'Review')}</span>
        </div>
        <div class="request-details">
          <p><strong>Customer:</strong> ${escapeHtml(review.customer_name || request.customer_name || 'Unknown')}</p>
          <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Not listed')}</p>
          <p><strong>Comments:</strong> ${escapeHtml(review.comments || 'No comments provided.')}</p>
        </div>
      </article>
    `;
  }).join('');
}

function renderWorkerJobCard(request, mode) {
  return `
    <article class="request-card worker-job-card">
      <div class="request-card-header">
        <div>
          <p class="eyebrow">${escapeHtml(formatWorkerJobTime(request))}</p>
          <h3>${escapeHtml(request.customer_name || 'Customer')}</h3>
        </div>
        <span class="status-pill">${escapeHtml(request.status || '')}</span>
      </div>
      <div class="request-details">
        <p><strong>Vehicle:</strong> ${escapeHtml([request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Not listed')}</p>
        <p><strong>Service:</strong> ${escapeHtml(request.service_label || request.service_type || 'Service')}</p>
        <p><strong>Pickup:</strong> ${escapeHtml(request.parking_location || '')}, spot ${escapeHtml(request.parking_spot || '')}</p>
      </div>
      ${mode === 'available' ? `
        <button class="button primary claim-worker-job" data-id="${escapeHtml(request.id)}" type="button">Claim job</button>
      ` : '<p class="field-help">Assigned to you. Admin controls the service workflow.</p>'}
    </article>
  `;
}

async function loadWorkerJobs() {
  if (!workerJobList || !currentEmployee) return;

  workerJobList.innerHTML = '<div class="empty-state"><p>Loading jobs...</p></div>';

  const { data, error } = await workerDb
    .from('service_requests')
    .select('id,customer_name,vehicle_year,vehicle_make,vehicle_model,service_type,service_label,parking_location,parking_spot,service_date,desired_return_time,status,assigned_employee_id')
    .in('status', ['accepted', 'key_received', 'vehicle_picked_up'])
    .order('service_date', { ascending: true });

  if (error) {
    console.warn('Could not load worker jobs:', error);
    workerJobList.innerHTML = '<div class="empty-state"><p>Could not load jobs.</p></div>';
    return;
  }

  const jobs = data || [];
  const myJobs = jobs.filter((job) => job.assigned_employee_id === currentEmployee.id);
  const availableJobs = jobs.filter((job) => !job.assigned_employee_id);

  if (!myJobs.length && !availableJobs.length) {
    workerJobList.innerHTML = '<div class="empty-state"><p>No jobs available right now.</p></div>';
    return;
  }

  workerJobList.innerHTML = `
    ${myJobs.length ? '<h3>Assigned to me</h3>' : ''}
    ${myJobs.map((job) => renderWorkerJobCard(job, 'mine')).join('')}
    ${availableJobs.length ? '<h3>Available to claim</h3>' : ''}
    ${availableJobs.map((job) => renderWorkerJobCard(job, 'available')).join('')}
  `;
}

async function claimWorkerJob(requestId) {
  if (!currentEmployee) return;

  const { error } = await workerDb
    .from('service_requests')
    .update({
      assigned_employee_id: currentEmployee.id,
      assigned_worker_name: currentEmployee.full_name,
      assigned_worker_phone: currentEmployee.phone || null,
      assigned_worker_photo_url: currentEmployee.photo_url || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .is('assigned_employee_id', null);

  if (error) throw error;

  await loadWorkerJobs();
  await loadWorkerReviews();
}

workerProfilePhoto?.addEventListener('change', () => {
  const file = workerProfilePhoto.files?.[0];
  showWorkerPhoto(file ? URL.createObjectURL(file) : currentEmployee?.photo_url || '');
});

workerJobList?.addEventListener('click', (event) => {
  const button = event.target.closest('.claim-worker-job');
  if (!button) return;

  button.disabled = true;
  button.textContent = 'Claiming...';

  claimWorkerJob(button.dataset.id).catch((error) => {
    console.error('Could not claim job:', error);
    button.disabled = false;
    button.textContent = 'Claim job';
  });
});

workerProfileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentEmployee) {
    setWorkerStatus('Worker profile is still loading. Try again in a moment.');
    return;
  }

  setWorkerStatus('Saving worker profile...');

  try {
    const file = workerProfilePhoto?.files?.[0];
    const photoUrl = file ? await uploadWorkerPhoto(file) : currentEmployee.photo_url || null;
    const fullName = workerProfileName?.value.trim() || currentEmployee.full_name;
    const phone = workerProfilePhone?.value.trim() || null;
    const homeLocation = workerProfileLocation?.value || currentEmployee.home_location || DEFAULT_WORK_LOCATION;

    const { data, error } = await workerDb
      .from('employees')
      .update({
        full_name: fullName,
        phone,
        home_location: homeLocation,
        photo_url: photoUrl,
        profile_updated_at: new Date().toISOString(),
      })
      .eq('id', currentEmployee.id)
      .select('id,employee_code,full_name,phone,photo_url,home_location,started_at')
      .single();

    if (error) throw error;

    await workerDb
      .from('service_requests')
      .update({
        assigned_worker_name: data.full_name,
        assigned_worker_phone: data.phone || null,
        assigned_worker_photo_url: data.photo_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('assigned_employee_id', currentEmployee.id);

    currentEmployee = data;
    sessionStorage.setItem('shiftfuel_worker', currentEmployee.full_name);
    if (workerPortalHeading) workerPortalHeading.textContent = currentEmployee.full_name;
    workerProfileForm.reset();
    if (workerProfileName) workerProfileName.value = currentEmployee.full_name;
    if (workerProfilePhone) workerProfilePhone.value = currentEmployee.phone || '';
    if (workerProfileLocation) workerProfileLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    if (workerProfileStarted) workerProfileStarted.value = currentEmployee.started_at || '';
    if (workerLocation) workerLocation.value = currentEmployee.home_location || DEFAULT_WORK_LOCATION;
    showWorkerPhoto(currentEmployee.photo_url || '');
    setWorkerStatus('Worker profile saved.');
  } catch (error) {
    console.error('Worker profile save failed:', error);
    setWorkerStatus('Could not save worker profile. Make sure employee profile columns and storage are set up.');
  }
});

workerDaysGrid?.addEventListener('click', (event) => {
  const copyButton = event.target.closest('.worker-copy-day');
  const pasteButton = event.target.closest('.worker-paste-day');
  if (!copyButton && !pasteButton) return;

  const row = event.target.closest('.worker-day-row');
  const checkbox = row?.querySelector('.worker-day-enabled');
  const startInput = row?.querySelector('.worker-day-start');
  const endInput = row?.querySelector('.worker-day-end');

  if (copyButton) {
    copiedWorkerDaySchedule = {
      startsAt: startInput?.value || '07:00',
      endsAt: endInput?.value || '22:00',
      enabled: Boolean(checkbox?.checked),
    };
    refreshWorkerPasteButtons();
    setWorkerCopyMode('paste');
    setScheduleStatus(`Copied ${copiedWorkerDaySchedule.startsAt} to ${copiedWorkerDaySchedule.endsAt}.`);
    return;
  }

  if (pasteButton && copiedWorkerDaySchedule) {
    if (startInput) startInput.value = copiedWorkerDaySchedule.startsAt;
    if (endInput) endInput.value = copiedWorkerDaySchedule.endsAt;
    if (checkbox) checkbox.checked = copiedWorkerDaySchedule.enabled;
    const pastedSchedule = copiedWorkerDaySchedule;
    copiedWorkerDaySchedule = null;
    refreshWorkerPasteButtons();
    setWorkerCopyMode('copy');
    setScheduleStatus(`Pasted ${pastedSchedule.startsAt} to ${pastedSchedule.endsAt}. Copy another day to paste again.`);
  }
});

workerDaysOffCalendar?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-day-off]');
  if (!button || button.disabled) return;

  const dayOff = button.dataset.dayOff;
  if (selectedWorkerDaysOff.has(dayOff)) {
    selectedWorkerDaysOff.delete(dayOff);
  } else {
    selectedWorkerDaysOff.add(dayOff);
  }

  renderWorkerDaysOffCalendar();
});

openWorkdaysPanel?.addEventListener('click', () => {
  if (workdaysPanel) workdaysPanel.hidden = false;
  if (daysOffPanel) daysOffPanel.hidden = true;
});

closeWorkdaysPanel?.addEventListener('click', () => {
  if (workdaysPanel) workdaysPanel.hidden = true;
});

openDaysOffPanel?.addEventListener('click', () => {
  if (daysOffPanel) daysOffPanel.hidden = false;
  if (workdaysPanel) workdaysPanel.hidden = true;
});

closeDaysOffPanel?.addEventListener('click', () => {
  if (daysOffPanel) daysOffPanel.hidden = true;
});

workerScheduleForm?.addEventListener('submit', (event) => event.preventDefault());

saveWorkdaysButton?.addEventListener('click', () => {
  saveWorkerAvailability().catch((error) => {
    console.error('Worker availability save failed:', error);
    setScheduleStatus('Could not save work days. Check Supabase setup.');
  });
});

saveDaysOffButton?.addEventListener('click', () => {
  saveWorkerDaysOff().catch((error) => {
    console.error('Worker days off save failed:', error);
    setScheduleStatus('Could not save days off. Check Supabase setup.');
  });
});

renderWorkerDaysGrid([]);
renderWorkerDaysOffCalendar();
loadWorkerProfile();
