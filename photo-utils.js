// Shared worker photo utilities used by worker.js, admin.js, and track.js.
// Loaded via <script src="photo-utils.js"> before page-specific scripts.

window.ShiftFuelPhoto = (() => {
  // ── Modal ──────────────────────────────────────────────────────────────────

  let modal = null;

  function initPhotoModal() {
    if (document.querySelector('#worker-photo-modal')) return;

    modal = document.createElement('div');
    modal.id = 'worker-photo-modal';
    modal.className = 'worker-photo-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Worker photo');
    modal.hidden = true;

    modal.innerHTML = `
      <div class="worker-photo-modal-content">
        <button class="worker-photo-modal-close" type="button" aria-label="Close photo">✕</button>
        <div class="worker-photo-modal-image-frame">
          <img class="worker-photo-modal-img" src="" alt="">
          <div class="worker-photo-modal-placeholder">No photo</div>
        </div>
        <p class="worker-photo-modal-name"></p>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.worker-photo-modal-close').addEventListener('click', closePhotoModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closePhotoModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closePhotoModal(); });
  }

  function openPhotoModal({ photo_url, name = '' }) {
    if (!modal) initPhotoModal();
    const img = modal.querySelector('.worker-photo-modal-img');
    const placeholder = modal.querySelector('.worker-photo-modal-placeholder');
    const nameEl = modal.querySelector('.worker-photo-modal-name');

    if (photo_url) {
      img.src = photo_url;
      img.alt = name;
      img.hidden = false;
      placeholder.hidden = true;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      placeholder.hidden = false;
    }

    nameEl.textContent = name;
    modal.hidden = false;
    modal.querySelector('.worker-photo-modal-close').focus();
  }

  function closePhotoModal() {
    if (modal) modal.hidden = true;
  }

  // ── Photo frame HTML helper ────────────────────────────────────────────────
  // Renders a circular worker photo frame.
  // displayUrl (cropped_photo_url || photo_url) shown in the frame.
  // modalUrl (original_photo_url || cropped_photo_url || photo_url) opens in the large modal.

  function renderPhotoFrame({ photo_url, cropped_photo_url, original_photo_url, name = '' }, { clickable = false, id = '' } = {}) {
    const displayUrl = cropped_photo_url || photo_url || '';
    const modalUrl   = original_photo_url || cropped_photo_url || photo_url || '';
    const clickAttr = clickable && displayUrl
      ? 'data-open-worker-photo="true" tabindex="0" role="button" aria-label="View larger photo"'
      : '';
    const photoData = clickable && displayUrl
      ? `data-photo-url="${escapeForAttr(modalUrl)}" data-photo-name="${escapeForAttr(name)}"`
      : '';
    const idAttr = id ? `id="${id}"` : '';

    return `
      <div class="worker-profile-photo-frame ${clickable && displayUrl ? 'worker-photo-clickable' : ''}"
           ${idAttr} ${clickAttr} ${photoData}>
        ${displayUrl
          ? `<img class="worker-profile-photo" src="${escapeForAttr(displayUrl)}" alt="${escapeForAttr(name)}">`
          : `<div class="worker-profile-photo-placeholder">No photo</div>`}
      </div>`;
  }

  // ── Canvas crop from boundary editor ──────────────────────────────────────
  // Reads the boundary editor's current state (object-fit:contain + CSS transform)
  // and renders the circular-overlay crop region to a square canvas blob.
  // Returns a File (image/jpeg) or null on failure.

  async function cropToBlobFromBoundaryEditor(imgEl, zoom, posXPercent, posYPercent, outputSize = 600) {
    if (!imgEl?.complete || !imgEl.naturalWidth) return null;

    const naturalW = imgEl.naturalWidth;
    const naturalH = imgEl.naturalHeight;
    const frameSize = imgEl.closest('.photo-boundary-preview')?.getBoundingClientRect().width || 320;

    // object-fit: contain rendered dimensions
    const containScale = Math.min(frameSize / naturalW, frameSize / naturalH);
    const renderedW = naturalW * containScale;
    const renderedH = naturalH * containScale;

    // CSS translate(%): percentage of element size (= frameSize)
    const translateX = (posXPercent / 100) * frameSize;
    const translateY = (posYPercent / 100) * frameSize;

    // Image top-left after scale(zoom) then translate:
    const imgLeft = frameSize / 2 + translateX - (renderedW * zoom) / 2;
    const imgTop  = frameSize / 2 + translateY - (renderedH * zoom) / 2;

    // Circular overlay is inset 12% on each side
    const cropInset = frameSize * 0.12;
    const cropSize  = frameSize * (1 - 2 * 0.12);

    // Source rect in natural pixels
    const sx = (cropInset - imgLeft) * naturalW / (renderedW * zoom);
    const sy = (cropInset - imgTop)  * naturalH / (renderedH * zoom);
    const sw = cropSize * naturalW / (renderedW * zoom);
    const sh = cropSize * naturalH / (renderedH * zoom);

    const canvas = document.createElement('canvas');
    canvas.width  = outputSize;
    canvas.height = outputSize;
    canvas.getContext('2d').drawImage(imgEl, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], 'profile-cropped.jpg', { type: 'image/jpeg' }) : null),
        'image/jpeg', 0.9
      );
    });
  }

  function escapeForAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Global click/keyboard delegation for clickable photo frames ───────────

  document.addEventListener('click', (event) => {
    const frame = event.target.closest('[data-open-worker-photo]');
    if (frame) {
      openPhotoModal({ photo_url: frame.dataset.photoUrl || '', name: frame.dataset.photoName || '' });
      return;
    }
    const card = event.target.closest('[data-lightbox-src]');
    if (card) {
      openPhotoModal({ photo_url: card.dataset.lightboxSrc || '', name: card.dataset.lightboxLabel || '' });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const frame = event.target.closest('[data-open-worker-photo]');
    if (frame) {
      event.preventDefault();
      openPhotoModal({ photo_url: frame.dataset.photoUrl || '', name: frame.dataset.photoName || '' });
      return;
    }
    const card = event.target.closest('[data-lightbox-src]');
    if (card) {
      event.preventDefault();
      openPhotoModal({ photo_url: card.dataset.lightboxSrc || '', name: card.dataset.lightboxLabel || '' });
    }
  });

  return { initPhotoModal, openPhotoModal, closePhotoModal, renderPhotoFrame, cropToBlobFromBoundaryEditor };
})();
