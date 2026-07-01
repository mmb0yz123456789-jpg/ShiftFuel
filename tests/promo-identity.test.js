const assert = require('node:assert/strict');
const { validatePromoForCustomer, recordPromoRedemption } = require('../api/_promos.js');

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = {};
  }

  select() { return this; }
  limit() { return this; }
  order() { return this; }
  ilike(column, value) {
    this.filters[column] = value;
    return this;
  }
  eq(column, value) {
    this.filters[column] = value;
    return this;
  }
  or(value) {
    this.filters.or = value;
    return this;
  }
  maybeSingle() {
    return Promise.resolve({ data: this.rows()[0] || null });
  }
  then(resolve, reject) {
    return Promise.resolve({ data: this.rows() }).then(resolve, reject);
  }

  rows() {
    if (this.table === 'promo_codes') {
      const code = String(this.filters.code || '').toUpperCase();
      return this.db.promos.filter((promo) => String(promo.code || '').toUpperCase() === code);
    }
    if (this.table === 'promo_redemptions') {
      return this.db.redemptions.filter((row) => {
        const samePromo = !this.filters.promo_code_id || row.promo_code_id === this.filters.promo_code_id;
        const or = String(this.filters.or || '');
        const phoneMatch = row.customer_phone_digits && or.includes(`customer_phone_digits.eq.${row.customer_phone_digits}`);
        const emailMatch = row.customer_email_normalized && or.includes(`customer_email_normalized.eq.${row.customer_email_normalized}`);
        return samePromo && (phoneMatch || emailMatch);
      });
    }
    if (this.table === 'service_requests') {
      return this.db.requests.filter((row) => {
        const or = String(this.filters.or || '');
        const phoneMatch = row.customer_phone_digits && or.includes(`customer_phone_digits.eq.${row.customer_phone_digits}`);
        const emailMatch = row.customer_email_normalized && or.includes(`customer_email_normalized.eq.${row.customer_email_normalized}`);
        return phoneMatch || emailMatch;
      });
    }
    return [];
  }
}

function fakeDb({ redemptions = [], requests = [], rpcError = null } = {}) {
  return {
    promos: [{
      id: 'promo-1',
      code: 'FIRST',
      active: true,
      target_audience: 'new',
      per_customer_limit: 1,
      discount_type: 'fixed',
      discount_value: 10,
      applies_to: 'service_fees',
    }],
    redemptions,
    requests,
    from(table) {
      return new Query(this, table);
    },
    rpc() {
      return Promise.resolve(rpcError ? { error: rpcError } : { data: { ok: true } });
    },
  };
}

async function validate(db, phone = '(908) 500-6350', email = 'MMBoyz12@AOL.com') {
  return validatePromoForCustomer({
    db,
    code: 'first',
    phone,
    email,
    amounts: { total: 100, fuel_service: 20 },
  });
}

(async () => {
  const phone = cleanPhone('(908) 500-6350');
  const email = cleanEmail('MMBoyz12@AOL.com');

  const redeemedDb = fakeDb({
    redemptions: [{ promo_code_id: 'promo-1', customer_phone_digits: phone, customer_email_normalized: email }],
    requests: [{ customer_phone_digits: phone, customer_email_normalized: email }],
  });
  const redeemed = await validate(redeemedDb, '908.500.6350', 'mmboyz12@aol.com');
  assert.equal(redeemed.ok, false);
  assert.equal(redeemed.reason, 'This first-time promo has already been used for this customer.');

  const historyOnly = await validate(fakeDb({
    requests: [{ customer_phone_digits: phone, customer_email_normalized: email }],
  }));
  assert.equal(historyOnly.ok, false);
  assert.equal(historyOnly.reason, 'This code is for first-time customers only.');

  const validFirstUse = await validate(fakeDb());
  assert.equal(validFirstUse.ok, true);
  assert.equal(validFirstUse.discount, 10);

  await assert.rejects(
    () => recordPromoRedemption({
      db: fakeDb({ rpcError: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
      promo: fakeDb().promos[0],
      phone,
      email,
      discount: 10,
    }),
    /This first-time promo has already been used for this customer\./
  );

  console.log('promo-identity tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
