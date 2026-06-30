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
      // No session - redirect to customer.html for login
      window.location.href = 'customer.html';
      return;
    }

    currentAccountSession = session;

    // Setup event listeners
    setupTabNavigation();
    setupForms();
    setupSignOut();
    setupAddButtons();

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

  // ============================================================
  // Tab Navigation
  // ============================================================
  function setupTabNavigation() {
    accountTabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.accountTab;
        switchToTab(tabName);
      });
    });
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

      // Load saved vehicles
      await loadSavedVehicles();

      // Load saved addresses
      await loadSavedAddresses();

      // Load notification preferences
      await loadNotificationPreferences();

    } catch (error) {
      console.error('Failed to load account data:', error);
    }
  }

  async function loadProfileData() {
    if (!profileForm || !currentAccountSession) return;

    try {
      // Try to find customer by phone/email
      const { data, error } = await db
        .from('customers')
        .select('*')
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email)
        .maybeSingle();

      if (error || !data) {
        // Pre-fill from session if no database record
        profileForm.elements.firstName.value = currentAccountSession.name.split(' ')[0] || '';
        profileForm.elements.lastName.value = currentAccountSession.name.split(' ').slice(1).join(' ') || '';
        profileForm.elements.phone.value = formatPhoneDisplay(currentAccountSession.phone);
        profileForm.elements.email.value = currentAccountSession.email;
        return;
      }

      // Populate form with database values
      profileForm.elements.firstName.value = data.first_name || '';
      profileForm.elements.lastName.value = data.last_name || '';
      profileForm.elements.phone.value = formatPhoneDisplay(data.phone);
      profileForm.elements.email.value = data.email || '';
      profileForm.elements.serviceArea.value = data.service_area || '';
      profileForm.elements.zipCode.value = data.zip_code || '';

    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  }

  async function loadSavedVehicles() {
    if (!vehiclesList || !currentAccountSession) return;

    try {
      // Get customer ID
      const { data: customer } = await db
        .from('customers')
        .select('id')
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email)
        .maybeSingle();

      if (!customer) {
        vehiclesList.innerHTML = '<p class="form-help">No saved vehicles yet.</p>';
        return;
      }

      // Get vehicles
      const { data: vehicles, error } = await db
        .from('vehicles')
        .select('*')
        .eq('user_id', customer.id)
        .order('created_at', { ascending: false });

      if (error || !vehicles || vehicles.length === 0) {
        vehiclesList.innerHTML = '<p class="form-help">No saved vehicles yet. Add one to book faster.</p>';
        return;
      }

      vehiclesList.innerHTML = vehicles.map(vehicle => `
        <div class="account-vehicle-card">
          <div class="account-vehicle-info">
            <strong>${escapeHtml([vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '))}</strong>
            <span>${escapeHtml(vehicle.color || '')}${vehicle.license_plate ? ` · Plate: ${escapeHtml(vehicle.license_plate)}` : ''}${vehicle.fuel_type ? ` · ${escapeHtml(vehicle.fuel_type)}` : ''}</span>
          </div>
          <div class="account-card-actions">
            <button class="button secondary" type="button" data-edit-vehicle="${vehicle.id}">Edit</button>
            <button class="button danger" type="button" data-delete-vehicle="${vehicle.id}">Delete</button>
          </div>
        </div>
      `).join('');

      // Add delete handlers
      vehiclesList.querySelectorAll('[data-delete-vehicle]').forEach(btn => {
        btn.addEventListener('click', () => deleteVehicle(btn.dataset.deleteVehicle));
      });

    } catch (error) {
      console.error('Failed to load vehicles:', error);
      vehiclesList.innerHTML = '<p class="form-help">Could not load vehicles. Please refresh.</p>';
    }
  }

  async function loadSavedAddresses() {
    if (!addressesList || !currentAccountSession) return;

    try {
      // Get customer ID
      const { data: customer } = await db
        .from('customers')
        .select('id')
        .eq('phone', currentAccountSession.phone)
        .eq('email', currentAccountSession.email)
        .maybeSingle();

      if (!customer) {
        addressesList.innerHTML = '<p class="form-help">No saved addresses yet.</p>';
        return;
      }

      // Get addresses
      const { data: addresses, error } = await db
        .from('saved_addresses')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });

      if (error || !addresses || addresses.length === 0) {
        addressesList.innerHTML = '<p class="form-help">No saved addresses yet. Add one for faster booking.</p>';
        return;
      }

      addressesList.innerHTML = addresses.map(addr => `
        <div class="account-address-card">
          <div class="account-address-info">
            <strong>${escapeHtml([addr.street, addr.unit].filter(Boolean).join(', '))}</strong>
            <span>${escapeHtml([addr.city, addr.state, addr.zip].filter(Boolean).join(', '))}</span>
          </div>
          <div class="account-card-actions">
            <button class="button secondary" type="button" data-edit-address="${addr.id}">Edit</button>
            <button class="button danger" type="button" data-delete-address="${addr.id}">Delete</button>
          </div>
        </div>
      `).join('');

      // Add delete handlers
      addressesList.querySelectorAll('[data-delete-address]').forEach(btn => {
        btn.addEventListener('click', () => deleteAddress(btn.dataset.deleteAddress));
      });

    } catch (error) {
      console.error('Failed to load addresses:', error);
      addressesList.innerHTML = '<p class="form-help">Could not load addresses. Please refresh.</p>';
    }
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

      // Upsert customer record
      const { data, error } = await db
        .from('customers')
        .upsert(updates, { onConflict: 'phone' })
        .select()
        .single();

      if (error) throw error;

      // Update session
      currentAccountSession.name = `${updates.first_name} ${updates.last_name}`.trim();
      currentAccountSession.email = updates.email;
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
  // Vehicle Management
  // ============================================================
  function setupAddButtons() {
    if (addVehicleBtn) {
      addVehicleBtn.addEventListener('click', () => {
        // TODO: Open add vehicle modal/form
        alert('Add vehicle form coming soon!');
      });
    }

    if (addAddressBtn) {
      addAddressBtn.addEventListener('click', () => {
        // TODO: Open add address modal/form
        alert('Add address form coming soon!');
      });
    }
  }

  async function deleteVehicle(vehicleId) {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    try {
      const { error } = await db
        .from('vehicles')
        .delete()
        .eq('id', vehicleId);

      if (error) throw error;

      // Reload vehicles
      await loadSavedVehicles();

    } catch (error) {
      console.error('Failed to delete vehicle:', error);
      alert('Could not delete vehicle. Please try again.');
    }
  }

  async function deleteAddress(addressId) {
    if (!confirm('Are you sure you want to delete this address?')) return;

    try {
      const { error } = await db
        .from('saved_addresses')
        .delete()
        .eq('id', addressId);

      if (error) throw error;

      // Reload addresses
      await loadSavedAddresses();

    } catch (error) {
      console.error('Failed to delete address:', error);
      alert('Could not delete address. Please try again.');
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
          window.location.href = 'index.html';
        }
      });
    }
  }

  // ============================================================
  // Utility Functions
  // ============================================================
  function formatPhoneDisplay(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
    return raw;
  }

  function cleanPhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#039;');
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