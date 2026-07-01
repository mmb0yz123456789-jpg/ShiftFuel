/**
 * ShiftFuel - My Account Page
 * Standalone account hub with sidebar navigation
 */

(function () {
  'use strict';

  // ============================================================
  // DOM Elements
  // ============================================================
  const accountTabButtons = document.querySelectorAll('[data-account-tab]');
  const accountTabContents = document.querySelectorAll('[data-tab-content]');
  const accountGreeting = document.querySelector('[data-account-greeting]');
  const signOutButton = document.querySelector('.account-sign-out');
  
  // Forms
  const profileForm = document.querySelector('[data-account-profile-form]');
  const passwordForm = document.querySelector('[data-account-password-form]');
  const notificationsForm = document.querySelector('[data-account-notifications-form]');
  
  // Status elements
  const profileSaveStatus = document.querySelector('[data-profile-save-status]');
  const passwordSaveStatus = document.querySelector('[data-password-save-status]');
  const notificationsSaveStatus = document.querySelector('[data-notifications-save-status]');
  
  // Lists
  const vehiclesList = document.querySelector('[data-saved-vehicles-list]');
  const addressesList = document.querySelector('[data-saved-addresses-list]');
  
  // Buttons
  const addVehicleBtn = document.querySelector('[data-add-vehicle-btn]');
  const addAddressBtn = document.querySelector('[data-add-address-btn]');

  // ============================================================
  // State
  // ============================================================
  let currentAccountSession = null;
  let db = null;

  // ============================================================
  // Initialization
  // ============================================================
  async function init() {
    // Set current year in footer
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Initialize Supabase
    db = window.ShiftFuelSupabase;
    if (!db) {
      console.error('ShiftFuelSupabase not initialized');
      return;
    }

    // Check for existing session
    const session = getCustomerAccountSession();
    if (!session) {
      // No session - redirect to the customer account login route.
      window.location.href = '/account';
      return;
    }

    currentAccountSession = session;

    // Setup event listeners
    setupTabNavigation();
    setupForms();
    setupSignOut();
    setupSavedOptionsUI();

    // Load account data
    await loadAccountData();
  }

  // ============================================================
  // Session Management
  // ============================================================
  function getCustomerAccountSession() {
    try {
      const session = JSON.parse(localStorage.getItem('shiftfuel_customer_account') || 'null');
      if (!session?.phone || !session?.email) return null;
      return {
        phone: String(session.phone || '').trim(),
        email: String(session.email || '').trim().toLowerCase(),
        name: String(session.name || '').trim(),
      };
    } catch (_) {
      return null;
    }
  }

  function clearCustomerAccountSession() {
    localStorage.removeItem('shiftfuel_customer_account');
    currentAccountSession = null;
  }

  async function lookupCustomerAccount(phone = currentAccountSession?.phone, email = currentAccountSession?.email) {
    if (!db || !phone || !email) return null;
    const { data, error } = await db.rpc('public_lookup_customer_account', {
      p_phone: phone,
      p_email: email,
    });
    if (error) throw error;
    return data && typeof data === 'object' ? data : null;
  }

  // ============================================================
  // Tab Navigation
  // ============================================================
  // Mobile drill-down: the Account tab opens a clean MENU (nav list) and each row
  // opens a detail PAGE. Desktop keeps the sidebar + content side by side (the CSS
  // ignores data-acct-view above 768px), so this is mobile-only behaviour.
  const isMobileAccount = () => window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  function setAcctView(view) {
    document.body.setAttribute('data-acct-view', view);
    if (view === 'detail') { window.scrollTo(0, 0); const c = document.querySelector('.account-content'); if (c) c.scrollTop = 0; }
  }

  function setupTabNavigation() {
    accountTabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.accountTab;
        switchToTab(tabName);
        if (isMobileAccount()) setAcctView('detail');
        // Keep the URL hash in sync so the tab survives a refresh / is shareable.
        if (history.replaceState) history.replaceState(null, '', '#' + tabName);
      });
    });

    // Back button (mobile): return from a detail page to the account menu.
    const backBtn = document.querySelector('[data-account-back]');
    if (backBtn) backBtn.addEventListener('click', () => {
      setAcctView('menu');
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    });

    // Deep-link: open the tab named in the URL hash (e.g. /account/settings#vehicles).
    // The dashboard's "Add Vehicle"/"Add Service Address" quick actions link to
    // #add-vehicle / #add-address — those open the matching tab AND reveal its add
    // form. Only honour tabs whose nav button exists and isn't hidden.
    const addFormHash = { 'add-vehicle': { tab: 'vehicles', form: '[data-add-vehicle-form]' },
                          'add-address': { tab: 'addresses', form: '[data-add-address-form]' } };
    const applyHash = () => {
      const raw = (location.hash || '').replace('#', '').trim();
      if (!raw) { setAcctView('menu'); return; }
      const add = addFormHash[raw];
      const name = add ? add.tab : raw;
      const btn = document.querySelector(`[data-account-tab="${name}"]`);
      if (btn && !btn.hidden) {
        switchToTab(name);
        if (isMobileAccount()) setAcctView('detail');
      }
      if (add) {
        const form = document.querySelector(add.form);
        if (form) toggleAddForm(form, true);
      }
    };
    // Default to the menu on mobile; a deep-link hash jumps straight to its detail page.
    setAcctView('menu');
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }

  function switchToTab(tabName) {
    // Update button states
    accountTabButtons.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.accountTab === tabName);
    });

    // Update content visibility
    accountTabContents.forEach(content => {
      const isActive = content.dataset.tabContent === tabName;
      content.classList.toggle('is-active', isActive);
    });

    // Scroll to top of content
    document.querySelector('.account-content').scrollTop = 0;
  }

  // ============================================================
  // Account Data Loading
  // ============================================================
  async function loadAccountData() {
    if (!currentAccountSession) return;

    try {
      // Update greeting
      const nameParts = currentAccountSession.name.split(' ');
      const firstName = nameParts[0] || 'there';
      if (accountGreeting) {
        accountGreeting.textContent = `Welcome back, ${firstName}!`;
      }

      // Load profile data
      await loadProfileData();

      // Load saved vehicles + addresses (single RPC)
      await refreshSavedOptions();

      // Load notification preferences
      await loadNotificationPreferences();

    } catch (error) {
      console.error('Failed to load account data:', error);
    }
  }

  async function loadProfileData() {
    if (!profileForm || !currentAccountSession) return;

    // Always pre-fill from the signed-in session FIRST so the Profile tab shows
    // the customer's own details immediately. Without this, a failed/empty profile
    // lookup left the name/phone/email fields blank, which looks like a sign-in
    // form and makes signed-in users think they've been logged out.
    const nameParts = (currentAccountSession.name || '').split(' ');
    profileForm.elements.firstName.value = nameParts[0] || '';
    profileForm.elements.lastName.value = nameParts.slice(1).join(' ') || '';
    profileForm.elements.phone.value = formatPhoneDisplay(currentAccountSession.phone);
    profileForm.elements.email.value = currentAccountSession.email;

    try {
      const data = await lookupCustomerAccount();
      if (!data) return;

      // Enrich with database values where present (keep session values otherwise).
      if (data.first_name) profileForm.elements.firstName.value = data.first_name;
      if (data.last_name) profileForm.elements.lastName.value = data.last_name;
      if (data.phone) profileForm.elements.phone.value = formatPhoneDisplay(data.phone);
      if (data.email) profileForm.elements.email.value = data.email;
      if (data.service_area) profileForm.elements.serviceArea.value = data.service_area;
      if (data.zip_code) profileForm.elements.zipCode.value = data.zip_code;

    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  // Saved vehicles + addresses come from the same RPC the returning-customer
  // booking flow uses (tables: saved_customer_vehicles / saved_service_addresses).
  async function loadReturningOptions() {
    if (!db || !currentAccountSession) return { vehicles: [], addresses: [] };
    const { data, error } = await db.rpc('public_returning_customer_options', {
      p_phone: currentAccountSession.phone,
      p_email: currentAccountSession.email,
    });
    if (error) throw error;
    const opts = data && typeof data === 'object' ? data : {};
    return {
      vehicles: Array.isArray(opts.vehicles) ? opts.vehicles : [],
      addresses: Array.isArray(opts.addresses) ? opts.addresses : [],
    };
  }

  // Load both lists in one call and render them. Called on load and after any
  // add/remove so the UI always reflects the database.
  async function refreshSavedOptions() {
    if (!currentAccountSession) return;
    try {
      const { vehicles, addresses } = await loadReturningOptions();
      renderVehicles(vehicles);
      renderAddresses(addresses);
    } catch (error) {
      console.error('Failed to load saved options:', error);
      if (vehiclesList) vehiclesList.innerHTML = '<p class="form-help">Could not load vehicles. Please refresh.</p>';
      if (addressesList) addressesList.innerHTML = '<p class="form-help">Could not load addresses. Please refresh.</p>';
    }
  }

  function renderVehicles(vehicles) {
    if (!vehiclesList) return;
    if (!vehicles.length) {
      vehiclesList.innerHTML = '<p class="form-help">No saved vehicles yet. Add one to book faster.</p>';
      return;
    }
    vehiclesList.innerHTML = vehicles.map((v) => {
      const title = [v.vehicle_year, v.vehicle_make, v.vehicle_model].filter(Boolean).join(' ') || 'Saved vehicle';
      const details = [
        v.vehicle_color,
        v.license_plate ? `Plate: ${v.license_plate}` : '',
        v.fuel_type,
      ].filter(Boolean).join(' · ');
      return `
        <div class="account-vehicle-card">
          <div class="account-vehicle-info">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(details)}</span>
          </div>
          <div class="account-card-actions">
            <button class="button danger" type="button" data-delete-vehicle="${escapeHtml(v.id)}">Remove</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderAddresses(addresses) {
    if (!addressesList) return;
    if (!addresses.length) {
      addressesList.innerHTML = '<p class="form-help">No saved addresses yet. Add one for faster booking.</p>';
      return;
    }
    addressesList.innerHTML = addresses.map((a) => {
      const line1 = a.address_street || a.hospital || 'Saved address';
      const line2 = [a.address_apt, a.address_city, a.address_state, a.address_zip].filter(Boolean).join(', ');
      return `
        <div class="account-address-card">
          <div class="account-address-info">
            <strong>${escapeHtml(line1)}</strong>
            <span>${escapeHtml(line2)}</span>
          </div>
          <div class="account-card-actions">
            <button class="button danger" type="button" data-delete-address="${escapeHtml(a.id)}">Remove</button>
          </div>
        </div>`;
    }).join('');
  }

  async function loadNotificationPreferences() {
    if (!notificationsForm || !currentAccountSession) return;

    try {
      // Get customer ID
      const { data: customer } = await db
        .from('customers')
        .select('id, notification_preferences')
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email)
        .maybeSingle();

      if (!customer || !customer.notification_preferences) {
        // Use defaults (all checked)
        return;
      }

      const prefs = customer.notification_preferences;
      
      // Email notifications
      if (notificationsForm.elements.emailBookingConfirmations) {
        notificationsForm.elements.emailBookingConfirmations.checked = prefs.emailBookingConfirmations !== false;
      }
      if (notificationsForm.elements.emailServiceUpdates) {
        notificationsForm.elements.emailServiceUpdates.checked = prefs.emailServiceUpdates !== false;
      }
      if (notificationsForm.elements.emailPromotions) {
        notificationsForm.elements.emailPromotions.checked = prefs.emailPromotions !== false;
      }
      if (notificationsForm.elements.emailReceipts) {
        notificationsForm.elements.emailReceipts.checked = prefs.emailReceipts !== false;
      }

      // SMS notifications
      if (notificationsForm.elements.smsBookingConfirmations) {
        notificationsForm.elements.smsBookingConfirmations.checked = prefs.smsBookingConfirmations !== false;
      }
      if (notificationsForm.elements.smsServiceUpdates) {
        notificationsForm.elements.smsServiceUpdates.checked = prefs.smsServiceUpdates !== false;
      }
      if (notificationsForm.elements.smsArrivalAlerts) {
        notificationsForm.elements.smsArrivalAlerts.checked = prefs.smsArrivalAlerts !== false;
      }

    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  }

  // ============================================================
  // Form Handlers
  // ============================================================
  function setupForms() {
    // Profile form
    if (profileForm) {
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProfile();
      });
    }

    // Password form
    if (passwordForm) {
      passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await changePassword();
      });
    }

    // Notifications form
    if (notificationsForm) {
      notificationsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveNotificationPreferences();
      });
    }
  }

  async function saveProfile() {
    if (!profileForm || !currentAccountSession) return;

    const submitBtn = profileForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    profileSaveStatus.textContent = '';
    profileSaveStatus.removeAttribute('data-status');

    try {
      const formData = new FormData(profileForm);
      const updates = {
        first_name: formData.get('firstName'),
        last_name: formData.get('lastName'),
        phone: cleanPhone(formData.get('phone')),
        email: formData.get('email').toLowerCase().trim(),
        service_area: formData.get('serviceArea'),
        zip_code: formData.get('zipCode'),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db.rpc('public_upsert_customer_account', {
        p_phone: updates.phone,
        p_email: updates.email,
        p_first_name: updates.first_name,
        p_last_name: updates.last_name,
        p_name: `${updates.first_name} ${updates.last_name}`.trim(),
        p_service_area: updates.service_area,
        p_zip_code: updates.zip_code,
      });

      if (error) throw error;

      // Update session
      currentAccountSession.phone = cleanPhone(data?.phone || updates.phone);
      currentAccountSession.name = data?.name || `${updates.first_name} ${updates.last_name}`.trim();
      currentAccountSession.email = String(data?.email || updates.email).toLowerCase().trim();
      localStorage.setItem('shiftfuel_customer_account', JSON.stringify(currentAccountSession));

      // Update greeting
      const firstName = updates.first_name.split(' ')[0];
      if (accountGreeting) {
        accountGreeting.textContent = `Welcome back, ${firstName}!`;
      }

      profileSaveStatus.textContent = 'Profile saved successfully!';
      profileSaveStatus.setAttribute('data-status', 'success');

    } catch (error) {
      console.error('Failed to save profile:', error);
      profileSaveStatus.textContent = 'Failed to save profile. Please try again.';
      profileSaveStatus.setAttribute('data-status', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save changes';
    }
  }

  async function changePassword() {
    if (!passwordForm || !currentAccountSession) return;

    const submitBtn = passwordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';
    passwordSaveStatus.textContent = '';
    passwordSaveStatus.removeAttribute('data-status');

    try {
      const formData = new FormData(passwordForm);
      const currentPassword = formData.get('currentPassword');
      const newPassword = formData.get('newPassword');
      const confirmPassword = formData.get('confirmPassword');

      // Validation
      if (newPassword.length < 10) {
        throw new Error('New password must be at least 10 characters.');
      }

      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      // Get customer record
      const { data: customer, error: fetchError } = await db
        .from('customers')
        .select('id, password_hash')
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email)
        .maybeSingle();

      if (fetchError || !customer) {
        throw new Error('Customer record not found.');
      }

      // Verify current password (simplified - implement proper hash verification)
      // In production, use bcrypt or similar
      const { error: verifyError } = await db.rpc('verify_customer_password', {
        p_customer_id: customer.id,
        p_password: currentPassword,
      });

      if (verifyError) {
        throw new Error('Current password is incorrect.');
      }

      // Hash new password (simplified - use proper hashing in production)
      const { error: updateError } = await db.rpc('update_customer_password', {
        p_customer_id: customer.id,
        p_new_password: newPassword,
      });

      if (updateError) throw updateError;

      passwordSaveStatus.textContent = 'Password updated successfully!';
      passwordSaveStatus.setAttribute('data-status', 'success');
      passwordForm.reset();

    } catch (error) {
      console.error('Failed to change password:', error);
      passwordSaveStatus.textContent = error.message || 'Failed to update password. Please try again.';
      passwordSaveStatus.setAttribute('data-status', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update password';
    }
  }

  async function saveNotificationPreferences() {
    if (!notificationsForm || !currentAccountSession) return;

    const submitBtn = notificationsForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
    notificationsSaveStatus.textContent = '';
    notificationsSaveStatus.removeAttribute('data-status');

    try {
      const formData = new FormData(notificationsForm);
      const preferences = {
        emailBookingConfirmations: notificationsForm.elements.emailBookingConfirmations.checked,
        emailServiceUpdates: notificationsForm.elements.emailServiceUpdates.checked,
        emailPromotions: notificationsForm.elements.emailPromotions.checked,
        emailReceipts: notificationsForm.elements.emailReceipts.checked,
        smsBookingConfirmations: notificationsForm.elements.smsBookingConfirmations.checked,
        smsServiceUpdates: notificationsForm.elements.smsServiceUpdates.checked,
        smsArrivalAlerts: notificationsForm.elements.smsArrivalAlerts.checked,
      };

      const { error } = await db
        .from('customers')
        .update({
          notification_preferences: preferences,
          updated_at: new Date().toISOString(),
        })
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email);

      if (error) throw error;

      notificationsSaveStatus.textContent = 'Notification preferences saved!';
      notificationsSaveStatus.setAttribute('data-status', 'success');

    } catch (error) {
      console.error('Failed to save notifications:', error);
      notificationsSaveStatus.textContent = 'Failed to save preferences. Please try again.';
      notificationsSaveStatus.setAttribute('data-status', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save preferences';
    }
  }

  // ============================================================
  // Vehicle & Address Management (add / remove)
  // ============================================================
  function setFormStatus(el, type, message) {
    if (!el) return;
    el.textContent = message || '';
    if (type) el.setAttribute('data-status', type);
    else el.removeAttribute('data-status');
  }

  function toggleAddForm(form, show) {
    if (!form) return;
    form.hidden = !show;
    if (show) {
      const first = form.querySelector('input, select');
      if (first) { try { first.focus(); } catch (_) { /* best effort */ } }
    } else {
      form.reset();
      setFormStatus(form.querySelector('.form-status'), '', '');
    }
  }

  // Surface the RPC's own guardrail messages (duplicate / outside area) to the
  // user; fall back to a generic message for anything unexpected.
  function friendlyRpcError(error, fallback) {
    const msg = String((error && (error.message || error.hint || error.details)) || '').trim();
    if (/already saved|already appears|outside the service area/i.test(msg)) return msg;
    return fallback;
  }

  async function addVehicle(form) {
    const status = form.querySelector('[data-add-vehicle-status]');
    const fd = new FormData(form);
    const data = {
      customer_name: currentAccountSession.name || '',
      vehicle_year: String(fd.get('vehicleYear') || '').trim(),
      vehicle_make: String(fd.get('vehicleMake') || '').trim(),
      vehicle_model: String(fd.get('vehicleModel') || '').trim(),
      vehicle_color: String(fd.get('vehicleColor') || '').trim(),
      license_plate: String(fd.get('licensePlate') || '').trim(),
      fuel_type: String(fd.get('fuelType') || '').trim(),
    };
    if (!data.vehicle_make || !data.vehicle_model || !data.license_plate) {
      setFormStatus(status, 'error', 'Make, model, and license plate are required.');
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Saving...';
    setFormStatus(status, 'warning', 'Saving vehicle...');
    try {
      const { error } = await db.rpc('public_add_saved_vehicle', {
        p_phone: currentAccountSession.phone,
        p_email: currentAccountSession.email,
        p_data: data,
      });
      if (error) throw error;
      toggleAddForm(form, false);
      await refreshSavedOptions();
    } catch (error) {
      console.error('Failed to add vehicle:', error);
      setFormStatus(status, 'error', friendlyRpcError(error, 'Could not save the vehicle. Please try again.'));
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Save vehicle';
    }
  }

  async function addAddress(form) {
    const status = form.querySelector('[data-add-address-status]');
    const fd = new FormData(form);
    const street = String(fd.get('street') || '').trim();
    const unit = String(fd.get('unit') || '').trim();
    const city = String(fd.get('city') || '').trim();
    const state = (String(fd.get('state') || '').trim() || 'DE').toUpperCase();
    const zip = String(fd.get('zip') || '').trim();
    const parking = String(fd.get('parking') || '').trim();
    const keys = String(fd.get('keys') || '').trim();
    if (!street || !city || !state || !zip) {
      setFormStatus(status, 'error', 'Street, city, state, and ZIP are required.');
      return;
    }
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true; submitBtn.textContent = 'Checking area...';
    setFormStatus(status, 'warning', 'Checking that we serve this address...');
    try {
      // Same server-side service-area check the booking flow uses. The add RPC
      // rejects addresses that aren't validated, so this gate is required.
      const res = await fetch('/api/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate_service_area', street, apt: unit, city, state, zip }),
      });
      const vd = await res.json().catch(() => ({}));
      if (!res.ok || !vd.valid) {
        setFormStatus(status, 'error', vd.message || 'We do not currently serve this area.');
        return;
      }
      setFormStatus(status, 'warning', 'Saving address...');
      const { error } = await db.rpc('public_add_saved_address', {
        p_phone: currentAccountSession.phone,
        p_email: currentAccountSession.email,
        p_data: {
          customer_name: currentAccountSession.name || '',
          hospital: [street, city, state, zip].filter(Boolean).join(', '),
          address_street: street,
          address_apt: unit,
          address_city: city,
          address_state: state,
          address_zip: zip,
          parking_location: parking,
          key_handoff_details: keys,
          service_area_valid: true,
        },
      });
      if (error) throw error;
      toggleAddForm(form, false);
      await refreshSavedOptions();
    } catch (error) {
      console.error('Failed to add address:', error);
      setFormStatus(status, 'error', friendlyRpcError(error, 'Could not save the address. Please try again.'));
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = 'Save address';
    }
  }

  function setupSavedOptionsUI() {
    const addVehicleForm = document.querySelector('[data-add-vehicle-form]');
    const addAddressForm = document.querySelector('[data-add-address-form]');

    if (addVehicleBtn && addVehicleForm) {
      addVehicleBtn.addEventListener('click', () => toggleAddForm(addVehicleForm, addVehicleForm.hidden));
      addVehicleForm.querySelector('[data-cancel-add-vehicle]')?.addEventListener('click', () => toggleAddForm(addVehicleForm, false));
      addVehicleForm.addEventListener('submit', (e) => { e.preventDefault(); addVehicle(addVehicleForm); });
    }
    if (addAddressBtn && addAddressForm) {
      addAddressBtn.addEventListener('click', () => toggleAddForm(addAddressForm, addAddressForm.hidden));
      addAddressForm.querySelector('[data-cancel-add-address]')?.addEventListener('click', () => toggleAddForm(addAddressForm, false));
      addAddressForm.addEventListener('submit', (e) => { e.preventDefault(); addAddress(addAddressForm); });
    }

    // Delete via event delegation — the card lists are re-rendered on every
    // refresh, so binding the container once survives re-renders.
    if (vehiclesList) vehiclesList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-vehicle]');
      if (btn) deleteVehicle(btn.dataset.deleteVehicle);
    });
    if (addressesList) addressesList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-address]');
      if (btn) deleteAddress(btn.dataset.deleteAddress);
    });
  }

  async function deleteVehicle(vehicleId) {
    if (!confirm('Remove this vehicle from your saved list?')) return;
    try {
      const { error } = await db.rpc('public_soft_delete_saved_vehicle', {
        p_vehicle_id: vehicleId,
        p_phone: currentAccountSession.phone,
        p_email: currentAccountSession.email,
      });
      if (error) throw error;
      await refreshSavedOptions();
    } catch (error) {
      console.error('Failed to remove vehicle:', error);
      alert('Could not remove the vehicle. Please try again.');
    }
  }

  async function deleteAddress(addressId) {
    if (!confirm('Remove this address from your saved list?')) return;
    try {
      const { error } = await db.rpc('public_soft_delete_saved_address', {
        p_address_id: addressId,
        p_phone: currentAccountSession.phone,
        p_email: currentAccountSession.email,
      });
      if (error) throw error;
      await refreshSavedOptions();
    } catch (error) {
      console.error('Failed to remove address:', error);
      alert('Could not remove the address. Please try again.');
    }
  }

  // ============================================================
  // Sign Out
  // ============================================================
  function setupSignOut() {
    if (signOutButton) {
      signOutButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to sign out?')) {
          clearCustomerAccountSession();
          window.location.href = '/account';
        }
      });
    }
  }

  // ============================================================
  // Utility Functions
  // ============================================================
  function formatPhoneDisplay(raw) {
    return window.ShiftFuelPhone?.format(raw) || raw || '';
  }

  function cleanPhone(value) {
    return window.ShiftFuelPhone?.digits(value) || String(value || '').replace(/\D/g, '').slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ============================================================
  // Start App
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
