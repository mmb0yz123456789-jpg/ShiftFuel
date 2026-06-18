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

applicantForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = new FormData(applicantForm);
  const applicantName = String(data.get('applicantName') || '').trim();
  const applicantEmail = String(data.get('applicantEmail') || '').trim();
  const applicantPhone = String(data.get('applicantPhone') || '').trim();
  const applicantResume = data.get('applicantResume');

  if (!applicantName || (!applicantEmail && !applicantPhone)) {
    if (applicantStatus) applicantStatus.textContent = 'Add your name and either a phone number or email.';
    return;
  }

  if (applicantStatus) applicantStatus.textContent = 'Submitting application...';

  try {
    const resume = applicantResume instanceof File && applicantResume.size > 0
      ? await uploadApplicantResume(applicantResume, applicantName)
      : { resumeUrl: null, resumeStoragePath: null };

    const applicantRow = {
      name: applicantName,
      email: applicantEmail || null,
      phone: applicantPhone || null,
      availability: String(data.get('applicantAvailability') || '').trim() || null,
      notes: String(data.get('applicantNotes') || '').trim() || null,
      resume_url: resume.resumeUrl,
      resume_storage_path: resume.resumeStoragePath,
    };

    let { error } = await window.ShiftFuelSupabase.from('applicants').insert(applicantRow);

    if (error?.code === 'PGRST204') {
      delete applicantRow.resume_url;
      delete applicantRow.resume_storage_path;
      ({ error } = await window.ShiftFuelSupabase.from('applicants').insert(applicantRow));
    }

    if (error) throw error;

    applicantForm.reset();
    const fileNameEl = document.querySelector('#resume-file-name');
    if (fileNameEl) fileNameEl.textContent = 'No file chosen';

    if (applicantStatus) applicantStatus.textContent = 'Application submitted. We will follow up soon.';
  } catch (err) {
    console.error('Applicant save error:', err);
    if (applicantStatus) applicantStatus.textContent = 'Could not submit application. Make sure the applicants table is added in Supabase.';
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
