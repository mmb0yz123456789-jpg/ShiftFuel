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

  // mode: 'profile' (circular crop) | 'service' (rectangular, object-fit: contain)
  function openPhotoModal({ photo_url, name = '', mode = 'profile' }) {
    if (!modal) initPhotoModal();
    const img = modal.querySelector('.worker-photo-modal-img');
    const placeholder = modal.querySelector('.worker-photo-modal-placeholder');
    const nameEl = modal.querySelector('.worker-photo-modal-name');
    const frame = modal.querySelector('.worker-photo-modal-image-frame');
    const content = modal.querySelector('.worker-photo-modal-content');

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

    // Toggle between profile (circular) and service-photo (rectangular) styling.
    const isService = mode === 'service';
    frame.classList.toggle('worker-photo-modal-image-frame--service', isService);
    content.classList.toggle('worker-photo-modal-content--service', isService);

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
      // Profile photo — circular modal.
      openPhotoModal({ photo_url: frame.dataset.photoUrl || '', name: frame.dataset.photoName || '', mode: 'profile' });
      return;
    }
    const card = event.target.closest('[data-lightbox-src]');
    if (card) {
      // If the page has its own #photo-lightbox (track.js), let it handle this.
      // Otherwise open via our shared modal in rectangular/service mode.
      if (!document.getElementById('photo-lightbox')) {
        openPhotoModal({ photo_url: card.dataset.lightboxSrc || '', name: card.dataset.lightboxLabel || '', mode: 'service' });
      }
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const frame = event.target.closest('[data-open-worker-photo]');
    if (frame) {
      event.preventDefault();
      openPhotoModal({ photo_url: frame.dataset.photoUrl || '', name: frame.dataset.photoName || '', mode: 'profile' });
      return;
    }
    const card = event.target.closest('[data-lightbox-src]');
    if (card) {
      event.preventDefault();
      if (!document.getElementById('photo-lightbox')) {
        openPhotoModal({ photo_url: card.dataset.lightboxSrc || '', name: card.dataset.lightboxLabel || '', mode: 'service' });
      }
    }
  });

  return { initPhotoModal, openPhotoModal, closePhotoModal, renderPhotoFrame, cropToBlobFromBoundaryEditor };
})();

// Admin dashboard finish polish. Kept here because photo-utils.js is already
// loaded on admin.html before admin.js. The guard prevents changes on other pages.
(() => {
  function applyAdminDashboardFinish() {
    if (!document.body.classList.contains('admin-portal-page')) return;

    if (!document.getElementById('admin-dashboard-finish-style')) {
      const style = document.createElement('style');
      style.id = 'admin-dashboard-finish-style';
      style.textContent = `
        .admin-dashboard-main { min-width: 0; }
        .admin-queue-card .empty-state {
          border: 1px dashed rgba(0, 47, 42, 0.22);
          border-radius: 18px;
          background: rgba(241, 248, 245, 0.72);
          padding: 26px;
          text-align: center;
        }
        .admin-queue-card .empty-state strong {
          display: block;
          color: #002f2a;
          font-size: 1.05rem;
          margin-bottom: 6px;
        }
        .admin-queue-card .empty-state p {
          margin: 0;
          color: #4d615f;
        }
        .admin-request-tabs .admin-polish-hidden-tab { display: none !important; }
        .admin-shortcut-card em { letter-spacing: -0.01em; }
        .admin-side-card.admin-summary.compact { gap: 10px; }
        @media (min-width: 1100px) {
          .admin-dashboard-grid { align-items: start; }
          .admin-dashboard-side { position: sticky; top: 110px; }
        }
      `;
      document.head.appendChild(style);
    }

    const replacements = new Map([
      ['View Workers â†’', 'View Workers →'],
      ['Create New â†’', 'Create New →'],
      ['View Reports â†’', 'View Reports →'],
      ['Open Settings â†’', 'Open Settings →'],
      ['â€”', '—'],
      ['Optional â€” if known', 'Optional — if known'],
    ]);

    document.querySelectorAll('em, span, legend, p, strong, h2, h3, button').forEach((el) => {
      const fixed = replacements.get(el.textContent.trim());
      if (fixed) el.textContent = fixed;
    });

    const completedLabel = document.querySelector('#admin-completed-count')?.closest('.hero-stat')?.querySelector('.hero-stat-label');
    if (completedLabel) completedLabel.textContent = 'Completed total';

    const tabs = document.querySelectorAll('.admin-request-tabs .summary-button');
    if (tabs[0]) {
      const count = document.querySelector('#open-requests')?.textContent || '0';
      tabs[0].innerHTML = `Open requests <span id="open-requests">${count}</span>`;
    }
    if (tabs[1]) tabs[1].classList.add('admin-polish-hidden-tab');
    if (tabs[2]) tabs[2].classList.add('admin-polish-hidden-tab');
    if (tabs[3]) {
      const count = document.querySelector('#complete-requests')?.textContent || '0';
      tabs[3].innerHTML = `Completed all time <span id="complete-requests">${count}</span>`;
    }
    if (tabs[4]) {
      const count = document.querySelector('#denied-requests')?.textContent || '0';
      tabs[4].innerHTML = `Closed / on hold <span id="denied-requests">${count}</span>`;
    }

    const empty = document.querySelector('#request-list .empty-state');
    if (empty && !empty.dataset.polished) {
      const heading = document.querySelector('#request-queue-heading')?.textContent || 'requests';
      const showAll = empty.querySelector('.inline-show-all');
      if (showAll) {
        empty.innerHTML = `<strong>No recent ${heading.toLowerCase()}.</strong><p>No requests match this view from the last 7 days.</p>`;
        empty.querySelector('p').append(' ');
        empty.querySelector('p').appendChild(showAll);
      } else {
        const lower = heading.toLowerCase();
        const message = lower.includes('open')
          ? 'New customer requests will appear here when they enter the queue.'
          : 'Requests will appear here when they match this status.';
        empty.innerHTML = `<strong>No ${lower} right now.</strong><p>${message}</p>`;
      }
      empty.dataset.polished = 'true';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyAdminDashboardFinish();
    const observer = new MutationObserver(() => applyAdminDashboardFinish());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
})();
