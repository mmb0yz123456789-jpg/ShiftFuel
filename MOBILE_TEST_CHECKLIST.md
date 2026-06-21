# ShiftFuel Mobile Test Checklist

Manual tests to run before launch. Complete on real devices, not just browser DevTools emulation.

---

## iPhone Safari (iOS 16+)

### Landing page
- [ ] Page loads without horizontal scrolling
- [ ] Nav links are readable and tappable
- [ ] Hero "Book my vehicle service" button is easy to tap
- [ ] Services & Pricing section scrolls into view cleanly
- [ ] Fuel average prices display in the Fuel Concierge card
- [ ] Car wash packages are readable without zooming
- [ ] How it works steps are readable
- [ ] Safety proof grid shows 2 columns

### Booking form
- [ ] Tap "Book my vehicle service" — page scrolls to Book section
- [ ] Enter name, phone, email — keyboard does not cause layout to jump
- [ ] Inputs do not trigger iOS auto-zoom (font size should stay 16px)
- [ ] Enter street address — type and verify autocomplete does not interfere
- [ ] Tap "Validate Address" — button is easy to tap
- [ ] After validation: vehicle, parking, service fieldsets appear without layout break
- [ ] Vehicle year/make/model dropdowns open and select correctly
- [ ] Service type dropdown selects Fuel, Car Wash, Car Wash + Fuel
- [ ] Fuel type and fuel estimate dropdowns appear and work when fuel is selected
- [ ] Car wash package dropdown appears and works when wash is selected
- [ ] Desired return time dropdown works
- [ ] Quick inspection checkbox is easy to tap
- [ ] Estimated total updates correctly in payment box
- [ ] Payment authorization modal opens
- [ ] Stripe card field displays and accepts test card 4242 4242 4242 4242
- [ ] Modal is scrollable if keyboard is open
- [ ] Cancel and Authorize buttons are easy to tap
- [ ] Terms checkbox is easy to tap
- [ ] Submit button is visible and tappable
- [ ] Form submission completes without error

### Returning customer lookup
- [ ] Phone and email inputs are easy to tap
- [ ] "Find my info" button is tappable
- [ ] Returned results are readable

---

## Android Chrome (Chrome for Android, recent version)

Repeat all iPhone Safari tests above, and additionally:

- [ ] Page does not auto-zoom on input focus
- [ ] Stripe card element renders correctly in the payment modal
- [ ] Back button behavior does not break the booking flow
- [ ] Address field does not conflict with Android keyboard autocomplete

---

## Desktop Chrome

### Landing page
- [ ] Full nav renders without wrapping
- [ ] Three pricing cards render in a row
- [ ] How it works section renders side-by-side

### Booking form
- [ ] Full form is accessible by scrolling
- [ ] Payment modal opens centered and contained
- [ ] Stripe card field works with test card

### Tracker
- [ ] Tracking lookup form works
- [ ] Status timeline renders correctly
- [ ] Photo proof cards display

---

## Tracker — iPhone Safari and Android Chrome

- [ ] Tracker page loads
- [ ] Phone and email lookup form is tappable
- [ ] Request card appears after lookup
- [ ] Status timeline is readable on narrow screen
- [ ] Photo proof thumbnails do not overflow horizontally
- [ ] Worker profile card is readable
- [ ] Return location card is readable
- [ ] "Confirm and Pay" button is tappable (if request is in pending_customer_payment state)
- [ ] Final payment Stripe card field fits on screen
- [ ] Payment error messages are visible
- [ ] Cancel request button is tappable
- [ ] Cancel confirmation is readable

---

## Worker dashboard — iPhone Safari and Android Chrome

- [ ] Worker login page loads and inputs are tappable
- [ ] Login succeeds with correct credentials
- [ ] Job cards stack vertically on narrow screen
- [ ] Claim job button is tappable
- [ ] Pickup photo upload — tap file button, select from camera or gallery
- [ ] Pickup photos preview after selection
- [ ] Upload button is tappable
- [ ] Receipt upload works same way
- [ ] Final total is editable after upload
- [ ] Return location entry is tappable and keyboard-friendly
- [ ] Return photo upload works
- [ ] "Send to Customer for Payment" button is tappable
- [ ] Status updates appear after actions

---

## Admin dashboard — iPhone Safari and Android Chrome

Admin is not optimized for mobile as primary use, but should be usable for emergency review.

- [ ] Admin login page loads and inputs are tappable
- [ ] Login succeeds
- [ ] Request list loads and is scrollable
- [ ] Request cards are readable (may need horizontal scroll on some panels — acceptable)
- [ ] Status filter tabs are tappable
- [ ] Expand/collapse on request cards works
- [ ] Deny request dropdown and submit is tappable
- [ ] Edit final total panel is usable
- [ ] No major layout breaks that prevent all action

---

## Automated smoke tests

Run with Playwright before each deploy:

```bash
# Install Playwright once
npx playwright install

# Run against Vercel preview
BASE_URL=https://your-preview.vercel.app npm run test:e2e

# Mobile viewports only
BASE_URL=https://your-preview.vercel.app npm run test:e2e:mobile

# Desktop only
BASE_URL=https://your-preview.vercel.app npm run test:e2e:desktop
```

Automated tests check:
- All main pages load
- Booking form sections are hidden before address validation
- No horizontal overflow at 390px, 375px, and 360px viewports
- Primary buttons meet 44px tap target height
- Nav does not include removed "What we do" link

Automated tests do NOT check:
- Stripe card payment (requires manual test with test card)
- File upload from camera
- Photo proof display after upload
- Worker or admin login (requires test credentials)
