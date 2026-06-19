// Custom calendar date picker — replaces <input type="date"> to prevent iOS from
// allowing past/out-of-range dates via the native scroll wheel.
//
// Usage:
//   ShiftFuelDatePicker.attach(hostEl, options)
//   options: { min, max, value, placeholder, onChange }
//
// The host element should contain an <input type="hidden"> with name/id already set.
// The picker appends a trigger button and popup calendar into the host.
// Returns: { getValue(), setValue(v), destroy() }

window.ShiftFuelDatePicker = (() => {
  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_ABBRS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function localDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function todayStr() {
    return localDateStr(new Date());
  }

  function defaultMax() {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return localDateStr(d);
  }

  function parseYMD(str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const [y, m, d] = str.split('-').map(Number);
    return { y, m, d };
  }

  function formatDisplay(str) {
    const p = parseYMD(str);
    if (!p) return '';
    return new Date(p.y, p.m - 1, p.d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function attach(host, options = {}) {
    const min         = options.min         || todayStr();
    const max         = options.max         || defaultMax();
    const placeholder = options.placeholder || 'Select a date';
    const onChange    = options.onChange    || null;

    const minP = parseYMD(min);
    const maxP = parseYMD(max);

    // Use existing hidden input inside host, or create one
    const hiddenInput = host.querySelector('input[type="hidden"]') || (() => {
      const el = document.createElement('input');
      el.type = 'hidden';
      host.prepend(el);
      return el;
    })();

    let currentValue = hiddenInput.value || options.value || '';

    // Start calendar view on current value's month, or today if none
    const initP = parseYMD(currentValue) || minP || parseYMD(todayStr()) || { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
    let viewYear  = initP.y;
    let viewMonth = initP.m;

    // ── Trigger button ──────────────────────────────────────────────────────

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sfp-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Choose a service date');

    // ── Popup calendar ──────────────────────────────────────────────────────

    const popup = document.createElement('div');
    popup.className = 'sfp-popup';
    popup.hidden = true;
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Select a date');

    host.classList.add('sfp-host');
    host.appendChild(trigger);
    host.appendChild(popup);

    // ── Value management ────────────────────────────────────────────────────

    function updateTriggerText() {
      trigger.innerHTML = '';
      const text = document.createElement('span');
      text.className = 'sfp-trigger-label';
      text.textContent = currentValue ? formatDisplay(currentValue) : placeholder;
      const chevron = document.createElement('span');
      chevron.className = 'sfp-trigger-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▾';
      trigger.append(text, chevron);
      trigger.classList.toggle('sfp-trigger--empty', !currentValue);
    }

    function setValue(v, fireChange) {
      currentValue = v || '';
      hiddenInput.value = currentValue;
      updateTriggerText();
      if (fireChange) {
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        if (onChange) onChange(currentValue);
      }
    }

    // ── Calendar rendering ──────────────────────────────────────────────────

    function clampView() {
      if (minP && (viewYear < minP.y || (viewYear === minP.y && viewMonth < minP.m))) {
        viewYear = minP.y; viewMonth = minP.m;
      }
      if (maxP && (viewYear > maxP.y || (viewYear === maxP.y && viewMonth > maxP.m))) {
        viewYear = maxP.y; viewMonth = maxP.m;
      }
    }

    function renderCalendar() {
      clampView();
      const today = todayStr();
      const canPrev = !minP || !(viewYear === minP.y && viewMonth <= minP.m);
      const canNext = !maxP || !(viewYear === maxP.y && viewMonth >= maxP.m);
      const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
      const firstDOW    = new Date(viewYear, viewMonth - 1, 1).getDay();

      let cells = '';
      // Leading empty cells (days before the 1st)
      for (let i = 0; i < firstDOW; i++) {
        cells += '<span class="sfp-cell sfp-cell--empty" aria-hidden="true"></span>';
      }
      // Day cells
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isDisabled = ds < min || ds > max;
        const isSelected = ds === currentValue;
        const isToday    = ds === today;
        const cls = [
          'sfp-cell sfp-day',
          isDisabled ? 'sfp-day--disabled' : 'sfp-day--ok',
          isSelected ? 'sfp-day--selected' : '',
          isToday    ? 'sfp-day--today'    : '',
        ].filter(Boolean).join(' ');

        if (isDisabled) {
          cells += `<span class="${cls}" aria-hidden="true">${d}</span>`;
        } else {
          cells += `<button type="button" class="${cls}" data-date="${ds}" aria-label="${formatDisplay(ds)}"${isSelected ? ' aria-pressed="true"' : ''}>${d}</button>`;
        }
      }

      popup.innerHTML = `
        <div class="sfp-header">
          <button type="button" class="sfp-nav sfp-prev" aria-label="Previous month"${canPrev ? '' : ' disabled aria-disabled="true"'}>&#8249;</button>
          <span class="sfp-month-title">${MONTH_NAMES[viewMonth - 1]} ${viewYear}</span>
          <button type="button" class="sfp-nav sfp-next" aria-label="Next month"${canNext ? '' : ' disabled aria-disabled="true"'}>&#8250;</button>
        </div>
        <div class="sfp-weekdays" aria-hidden="true">${DAY_ABBRS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="sfp-grid">${cells}</div>
      `;
    }

    // ── Open / close ────────────────────────────────────────────────────────

    function openPopup() {
      const p = parseYMD(currentValue) || minP || parseYMD(todayStr());
      if (p) { viewYear = p.y; viewMonth = p.m; }
      renderCalendar();
      popup.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      // Flip above if insufficient space below
      requestAnimationFrame(() => {
        const rect = trigger.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        popup.classList.toggle('sfp-popup--above', spaceBelow < 300 && rect.top > 300);
      });
    }

    function closePopup() {
      popup.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      popup.classList.remove('sfp-popup--above');
    }

    // ── Events ──────────────────────────────────────────────────────────────

    trigger.addEventListener('click', (e) => {
      e.preventDefault(); // prevent label double-activation on iOS
      e.stopPropagation();
      popup.hidden ? openPopup() : closePopup();
    });

    popup.addEventListener('click', (e) => {
      e.stopPropagation();

      const dayBtn = e.target.closest('.sfp-day--ok');
      if (dayBtn && dayBtn.dataset.date) {
        setValue(dayBtn.dataset.date, true);
        closePopup();
        trigger.focus();
        return;
      }

      if (e.target.closest('.sfp-prev:not([disabled])')) {
        viewMonth--;
        if (viewMonth < 1) { viewMonth = 12; viewYear--; }
        renderCalendar();
        return;
      }

      if (e.target.closest('.sfp-next:not([disabled])')) {
        viewMonth++;
        if (viewMonth > 12) { viewMonth = 1; viewYear++; }
        renderCalendar();
      }
    });

    function onOutsideClick(e) {
      if (!popup.hidden && !host.contains(e.target)) closePopup();
    }
    document.addEventListener('click', onOutsideClick);

    function onEscape(e) {
      if (e.key === 'Escape' && !popup.hidden) {
        closePopup();
        trigger.focus();
      }
    }
    document.addEventListener('keydown', onEscape);

    // ── Init ────────────────────────────────────────────────────────────────

    updateTriggerText();

    return {
      getValue: () => currentValue,
      setValue: (v) => setValue(v, false),
      destroy: () => {
        document.removeEventListener('click', onOutsideClick);
        document.removeEventListener('keydown', onEscape);
      },
    };
  }

  return { attach };
})();
