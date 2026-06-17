const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Only allow GET (Vercel cron) or POST with cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Find authorized (uncaptured) bookings where the service date + return time has passed
  const now = new Date();
  const { data: lapsed, error } = await supabase
    .from('service_requests')
    .select('id, payment_intent_id, service_date, desired_return_time')
    .eq('payment_status', 'authorized')
    .not('payment_intent_id', 'is', null);

  if (error) {
    console.error('Supabase query error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const voided = [];
  for (const row of lapsed || []) {
    // Build a date from service_date + desired_return_time and check if it's in the past
    const serviceDateTime = parseDatetime(row.service_date, row.desired_return_time);
    if (!serviceDateTime || serviceDateTime > now) continue;

    try {
      await stripe.paymentIntents.cancel(row.payment_intent_id);
      await supabase
        .from('service_requests')
        .update({ payment_status: 'voided' })
        .eq('id', row.id);
      voided.push(row.id);
    } catch (err) {
      // Already captured/canceled — update status to reflect reality
      if (err.code === 'payment_intent_unexpected_state') {
        await supabase
          .from('service_requests')
          .update({ payment_status: 'already_finalized' })
          .eq('id', row.id);
      } else {
        console.error(`Failed to void ${row.id}:`, err.message);
      }
    }
  }

  res.status(200).json({ voided, count: voided.length });
};

function parseDatetime(serviceDate, returnTime) {
  if (!serviceDate) return null;
  try {
    // serviceDate: "2026-06-20", returnTime: "5:30 PM" or "17:30"
    const base = new Date(serviceDate + 'T00:00:00');
    if (returnTime) {
      const match = returnTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = (match[3] || '').toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        base.setHours(hours, minutes, 0, 0);
      }
    } else {
      base.setHours(23, 59, 0, 0);
    }
    return base;
  } catch {
    return null;
  }
}
