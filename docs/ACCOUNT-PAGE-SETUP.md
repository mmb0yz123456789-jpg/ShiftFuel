# ShiftFuel My Account Page - Setup Guide

## Overview

A new standalone "My Account" page has been created at `/account.html` to replace the old customer account system embedded in `customer.html`.

## What Changed

### New Files Created
- **`account.html`** - Main account page with sidebar navigation
- **`account.css`** - Complete styling for the account hub
- **`account.js`** - Account functionality (profile, security, billing, notifications, vehicles, addresses)

### Files Updated
All navigation links across the site now point to `account.html` instead of `customer.html`:
- ✅ `index.html` (2 links updated)
- ✅ `book.html` (1 link updated)
- ✅ `hiring.html` (1 link updated)
- ✅ `liability-waiver.html` (1 link updated)
- ✅ `privacy.html` (1 link updated)
- ✅ `returning.html` (1 link updated)
- ✅ `terms.html` (1 link updated)
- ✅ `track.html` (1 link updated)
- ✅ `customer.html` (1 link updated - now redirects to account)

## Features

### Account Hub Layout
- **Left sidebar** with icon navigation
- **Right content area** with tabbed sections
- **Fully responsive** - collapses to bottom nav on mobile

### Tab Sections
1. **Profile** - Name, phone, email, service area
2. **Security** - Password change (requires RPCs: `verify_customer_password`, `update_customer_password`)
3. **Billing** - Payment methods & billing history (placeholder for Stripe integration)
4. **Notifications** - Email & SMS notification preferences
5. **Vehicles** - Saved vehicle management
6. **Addresses** - Saved service address management

### Technical Details
- **Session Management**: Uses `localStorage` with key `shiftfuel_customer_account`
- **Database**: Reads/writes to `customers`, `vehicles`, `saved_addresses` tables
- **Authentication**: Phone + email based (no password required for access)
- **Redirect**: If no session exists, redirects to `customer.html` for login

## Database Requirements

### Required Tables
```sql
-- Customers table (for profile & notifications)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  service_area text,
  zip_code text,
  notification_preferences jsonb,
  password_hash text, -- for future password auth
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vehicles table (already exists)
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  color text NOT NULL,
  license_plate text NOT NULL,
  fuel_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Saved addresses table (may need to be created)
CREATE TABLE saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  address_street text NOT NULL,
  address_apt text,
  address_city text NOT NULL,
  address_state text NOT NULL,
  address_zip text NOT NULL,
  parking_location text,
  key_handoff_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Required RPCs (for password change)
```sql
-- Verify customer password
CREATE OR REPLACE FUNCTION verify_customer_password(
  p_customer_id uuid,
  p_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Implement password verification logic
  -- Compare p_password with stored password_hash
  RETURN true; -- placeholder
END;
$$;

-- Update customer password
CREATE OR REPLACE FUNCTION update_customer_password(
  p_customer_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Hash and store new password
  -- UPDATE customers SET password_hash = hash(p_new_password) WHERE id = p_customer_id;
END;
$$;
```

## Migration from customer.html

### Old System (customer.html)
- Single-page account dashboard
- Embedded login form + dashboard in same page
- Uses `public_track_request` and `public_returning_customer_options` RPCs
- Edit vehicles/addresses via `prompt()` dialogs

### New System (account.html)
- Standalone account hub with sidebar navigation
- Separate login page (customer.html) → redirects to account.html
- Direct database access via Supabase client
- Inline forms for editing (no prompt dialogs)
- More scalable and maintainable

### Backward Compatibility
- `customer.html` still exists and works
- Old session format is compatible
- Users can still log in via customer.html and get redirected

## Styling

### Color Scheme
- Primary: `#073233` (dark teal)
- Background: `#f5f7f8` (light gray)
- Text: `#3d4a47` (dark gray)
- Success: `#16a34a` (green)
- Error: `#dc2626` (red)

### Responsive Breakpoints
- **Desktop**: 280px sidebar + fluid content
- **Tablet** (768px): Single column, horizontal tab nav
- **Mobile** (480px): Icon-only tabs, full-width forms

## Future Enhancements

### Ready to Add
1. **Profile photo upload** - Use the root `photo-utils.js` helpers for validation/compression
2. **Stripe customer portal** - Link to Stripe-hosted billing page
3. **Email/SMS preferences** - Connect to notification service (SendGrid, Twilio)
4. **Two-factor authentication** - Add TOTP or SMS 2FA
5. **Login history** - Track IPs, devices, timestamps
6. **Active sessions** - Let users revoke other sessions
7. **Add vehicle form** - Replace `alert()` with modal form
8. **Add address form** - Replace `alert()` with modal form
9. **Edit vehicle form** - Inline editing instead of prompt dialogs
10. **Edit address form** - Inline editing instead of prompt dialogs

### Integration Points
- **Stripe**: Add "Manage Payment Methods" button linking to Stripe Customer Portal
- **Email service**: Send notification preference changes to email
- **SMS service**: Send verification codes for phone number changes
- **Analytics**: Track account page engagement

## Testing Checklist

- [ ] Login with valid phone/email → redirects to account.html
- [ ] Login with invalid phone/email → shows error
- [ ] Profile form saves successfully
- [ ] Profile form validates required fields
- [ ] Password change works (requires RPCs)
- [ ] Notification preferences save
- [ ] Vehicles list loads
- [ ] Vehicle delete works
- [ ] Addresses list loads
- [ ] Address delete works
- [ ] Sign out clears session
- [ ] Sign out redirects to customer.html
- [ ] Mobile layout works at 480px
- [ ] Mobile layout works at 768px
- [ ] Desktop layout works at 1024px+
- [ ] All navigation links work
- [ ] Tab switching works
- [ ] Forms show success/error messages

## Deployment

1. **Deploy files** to Vercel/production
2. **Create database tables** (customers, saved_addresses)
3. **Create RPCs** (verify_customer_password, update_customer_password)
4. **Set environment variables**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. **Test login flow** end-to-end
6. **Monitor console errors** in production

## Support

For issues or questions:
- Check browser console for errors
- Verify Supabase connection in Network tab
- Test RPCs in Supabase SQL Editor
- Review localStorage for session data

## Next Steps

1. **Create database tables** (customers, saved_addresses)
2. **Implement password RPCs** (or remove password change feature)
3. **Add vehicle/address forms** (replace alert placeholders)
4. **Integrate Stripe** for billing section
5. **Add email/SMS** notification service
6. **Migrate existing users** from old customer.html system
7. **Add unit tests** for account.js functions