// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Landing page ────────────────────────────────────────────────────────────

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('loads without errors', async ({ page }) => {
    await expect(page).toHaveTitle(/ShiftFuel/i);
  });

  test('Book Now section is present', async ({ page }) => {
    const bookSection = page.locator('#book');
    await expect(bookSection).toBeVisible();
  });

  test('Services & Pricing section is present', async ({ page }) => {
    const pricingSection = page.locator('#services-pricing');
    await expect(pricingSection).toBeVisible();
  });

  test('address validation button exists', async ({ page }) => {
    const btn = page.locator('#validate-address-btn');
    await expect(btn).toBeVisible();
  });

  test('vehicle fieldset is hidden before address validation', async ({ page }) => {
    const fieldset = page.locator('#vehicle-fieldset');
    await expect(fieldset).toBeHidden();
  });

  test('service fieldset is hidden before address validation', async ({ page }) => {
    const fieldset = page.locator('#service-fieldset');
    await expect(fieldset).toBeHidden();
  });

  test('payment fieldset is hidden before address validation', async ({ page }) => {
    const fieldset = page.locator('#payment-fieldset');
    await expect(fieldset).toBeHidden();
  });

  test('booking submit button is hidden before form completion', async ({ page }) => {
    const btn = page.locator('#booking-submit-btn');
    await expect(btn).toBeHidden();
  });

  test('nav contains Services & Pricing link', async ({ page }) => {
    const link = page.locator('.nav a[href*="services-pricing"]');
    await expect(link).toBeVisible();
  });

  test('nav does not contain "What we do" link', async ({ page }) => {
    const link = page.locator('.nav a[href*="#services"]:not([href*="services-pricing"])');
    await expect(link).toHaveCount(0);
  });
});

// ─── Mobile: no horizontal overflow ──────────────────────────────────────────

test.describe('Mobile: no horizontal overflow', () => {
  const mobileViewport = { width: 390, height: 844 }; // iPhone 14 Pro size

  async function checkNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow, 'Page should not have horizontal overflow').toBe(false);
  }

  test('landing page: no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/index.html');
    await checkNoHorizontalOverflow(page);
  });

  test('tracker page: no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/track.html');
    await checkNoHorizontalOverflow(page);
  });

  test('worker login page: no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/worker-login.html');
    await checkNoHorizontalOverflow(page);
  });

  test('admin login page: no horizontal overflow at 390px', async ({ page }) => {
    await page.setViewportSize(mobileViewport);
    await page.goto('/admin-login.html');
    await checkNoHorizontalOverflow(page);
  });

  test('landing page: no horizontal overflow at 375px (iPhone SE)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/index.html');
    await checkNoHorizontalOverflow(page);
  });

  test('landing page: no horizontal overflow at 360px (small Android)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/index.html');
    await checkNoHorizontalOverflow(page);
  });
});

// ─── Tracker page ─────────────────────────────────────────────────────────────

test.describe('Tracker page', () => {
  test('loads without errors', async ({ page }) => {
    await page.goto('/track.html');
    await expect(page).toHaveTitle(/ShiftFuel|Track/i);
  });

  test('tracking lookup form is present', async ({ page }) => {
    await page.goto('/track.html');
    const form = page.locator('form, [id*="track"], [id*="lookup"]').first();
    await expect(form).toBeVisible();
  });
});

// ─── Auth pages ───────────────────────────────────────────────────────────────

test.describe('Admin login page', () => {
  test('loads without errors', async ({ page }) => {
    await page.goto('/admin-login.html');
    await expect(page).toHaveTitle(/ShiftFuel|Admin/i);
  });

  test('login form is present', async ({ page }) => {
    await page.goto('/admin-login.html');
    const input = page.locator('input[type="password"], input[type="text"]').first();
    await expect(input).toBeVisible();
  });
});

test.describe('Worker login page', () => {
  test('loads without errors', async ({ page }) => {
    await page.goto('/worker-login.html');
    await expect(page).toHaveTitle(/ShiftFuel|Worker/i);
  });

  test('login form is present', async ({ page }) => {
    await page.goto('/worker-login.html');
    const input = page.locator('input[type="password"], input[type="text"]').first();
    await expect(input).toBeVisible();
  });
});

// ─── Mobile tap targets ───────────────────────────────────────────────────────

test.describe('Mobile: tap target sizes', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
  });

  test('primary buttons meet 44px minimum height', async ({ page }) => {
    const buttons = page.locator('.button.primary');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) {
        expect(box.height, `Button ${i} height should be >= 44px`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('address validate button meets 44px minimum height', async ({ page }) => {
    const btn = page.locator('#validate-address-btn');
    const box = await btn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
