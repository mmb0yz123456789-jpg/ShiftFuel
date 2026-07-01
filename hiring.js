const RESUME_BUCKET = 'applicant-resumes';

const yearEl = document.querySelector('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

async function uploadApplicantResume(file, applicantName) {
  if (!file) return { resumeUrl: null, resumeStoragePath: null };

  const safeName = String(applicantName || 'applicant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const extension = file.name.split('.').pop() || 'pdf';
  const resumeStoragePath = `${Date.now()}-${safeName || 'applicant'}.${extension}`;

  const { error } = await window.ShiftFuelSupabase.storage
    .from(RESUME_BUCKET)
    .upload(resumeStoragePath, file, { upsert: false });

  if (error) throw error;

  const { data } = window.ShiftFuelSupabase.storage.from(RESUME_BUCKET).getPublicUrl(resumeStoragePath);
  return { resumeUrl: data?.publicUrl || null, resumeStoragePath };
}

const applicantForm = document.querySelector('#applicant-form');
const applicantStatus = document.querySelector('#applicant-status');
const applicantPhoneInput = applicantForm?.querySelector('input[name="applicantPhone"]');

function normalizePhone(value) {
  return window.ShiftFuelPhone?.digits(value) || String(value || '').replace(/\D/g, '').slice(0, 10);
}

function formatPhone(value) {
  return window.ShiftFuelPhone?.format(value) || value || '';
}

function attachPhoneInputFormatting(input) {
  window.ShiftFuelPhone?.attachInput(input);
}

attachPhoneInputFormatting(applicantPhoneInput);

applicantForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = new FormData(applicantForm);
  const firstName = String(data.get('applicantFirstName') || '').trim();
  const lastName = String(data.get('applicantLastName') || '').trim();
  const applicantName = `${firstName} ${lastName}`.trim();
  const applicantEmail = String(data.get('applicantEmail') || '').trim();
  const applicantPhone = normalizePhone(String(data.get('applicantPhone') || '').trim());
  const applicantResume = data.get('applicantResume');

  if (!firstName || !lastName || !applicantEmail || !window.ShiftFuelPhone?.isValid(applicantPhone)) {
    if (applicantStatus) applicantStatus.textContent = !window.ShiftFuelPhone?.isValid(applicantPhone)
      ? (window.ShiftFuelPhone?.validationMessage || 'Enter a valid 10-digit phone number.')
      : 'First name, last name, email, and phone number are all required.';
    return;
  }

  if (applicantStatus) applicantStatus.textContent = 'Submitting application...';

  try {
    const resume = applicantResume instanceof File && applicantResume.size > 0
      ? await uploadApplicantResume(applicantResume, applicantName)
      : { resumeUrl: null, resumeStoragePath: null };

    // Screening answers are folded into `notes` as a labeled block so they're
    // saved + visible to admins without needing a new applicants-table column.
    const licenseState = String(data.get('applicantLicenseState') || '').trim().toUpperCase();
    // Derive age (and the 21+ flag admins care about) from the date of birth.
    const dob = String(data.get('applicantDob') || '').trim();
    let dobLine = 'Date of birth: —';
    if (dob) {
      const d = new Date(dob);
      let age = NaN;
      if (!Number.isNaN(d.getTime())) {
        const now = new Date();
        age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
      }
      dobLine = `Date of birth: ${dob}${Number.isFinite(age) ? ` (age ${age} — ${age >= 21 ? '21+' : 'UNDER 21'})` : ''}`;
    }
    const screeningLines = [
      `Driver's license: ${String(data.get('applicantLicense') || '—').trim()}${licenseState ? ` (${licenseState})` : ''}`,
      dobLine,
      String(data.get('applicantViolations') || '').trim() ? `Moving violations (last 3 yr): ${String(data.get('applicantViolations')).trim()}` : null,
      `Work authorized (US): ${String(data.get('applicantWorkAuth') || '—').trim()}`,
      String(data.get('applicantServiceArea') || '').trim() ? `Service area: ${String(data.get('applicantServiceArea')).trim()}` : null,
      String(data.get('applicantTransport') || '').trim() ? `Reliable transport: ${String(data.get('applicantTransport')).trim()}` : null,
      `Background-check consent: ${data.get('applicantBgConsent') ? 'Yes' : 'No'}`,
    ].filter(Boolean);
    const freeNotes = String(data.get('applicantNotes') || '').trim();
    const combinedNotes = [`— Screening —\n${screeningLines.join('\n')}`, freeNotes].filter(Boolean).join('\n\n');

    const applicantRow = {
      name: applicantName,
      first_name: firstName,
      last_name: lastName,
      email: applicantEmail || null,
      phone: applicantPhone || null,
      availability: String(data.get('applicantAvailability') || '').trim() || null,
      notes: combinedNotes || null,
      resume_url: resume.resumeUrl,
      resume_storage_path: resume.resumeStoragePath,
    };

    let { error } = await window.ShiftFuelSupabase.from('applicants').insert(applicantRow);

    // Older schema (before the background-check migration) lacks the new
    // columns — retry with only the core fields. `name` always exists.
    if (error?.code === 'PGRST204') {
      delete applicantRow.resume_url;
      delete applicantRow.resume_storage_path;
      delete applicantRow.first_name;
      delete applicantRow.last_name;
      ({ error } = await window.ShiftFuelSupabase.from('applicants').insert(applicantRow));
    }

    if (error) throw error;

    applicantForm.reset();
    const fileNameEl = document.querySelector('#resume-file-name');
    if (fileNameEl) fileNameEl.textContent = 'No file chosen';

    if (applicantStatus) applicantStatus.textContent = 'Application submitted. We will follow up soon.';
  } catch (err) {
    console.error('Applicant save error:', err);
    const message = String(err?.message || err?.error_description || '').toLowerCase();
    const isResumeBucketError = message.includes('bucket') || message.includes('storage');
    if (applicantStatus) {
      applicantStatus.textContent = isResumeBucketError
        ? 'Could not upload the resume. Please submit without a resume or try again shortly.'
        : 'Could not submit application. Please try again shortly.';
    }
  }
});

// Resume upload control — filename display + drag-and-drop
(function () {
  const dropZone = document.getElementById('resume-drop-zone');
  const fileInput = document.getElementById('applicant-resume-input');
  const fileNameEl = document.getElementById('resume-file-name');
  if (!dropZone || !fileInput || !fileNameEl) return;

  function showFileName(file) {
    fileNameEl.textContent = file ? file.name : 'No file chosen';
  }

  fileInput.addEventListener('change', () => {
    showFileName(fileInput.files?.[0] || null);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const accepted = ['.pdf', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!accepted.includes(ext)) {
      fileNameEl.textContent = 'Please upload a PDF or Word document.';
      return;
    }
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    showFileName(file);
  });
}());
