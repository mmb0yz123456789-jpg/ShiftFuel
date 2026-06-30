/**
 * ShiftFuel - Orphaned Hold Cleanup Cron
 * 
 * Runs periodically (every hour via Vercel Cron) to clean up Stripe PaymentIntents
 * that were authorized but never converted to bookings. These are "orphaned holds"
 * that would otherwise expire in 7 days, blocking customer card limits.
 * 
 * Deployment:
 * 1. Deploy this file to Vercel
 * 2. Add to vercel.json cron config:
 *    {
 *      "crons": [
 *        { "path": "/api/cron-cleanup-holds", "schedule": "0 * * * *" }
 *      ]
 *    }
 * 3. Set CRON_SECRET in Vercel environment variables
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Only allow cron-triggered requests (Vercel Cron sends a secret header)
export default async function handler(req, res) {
  // Verify cron secret
  const cronSecret = req.headers['x-vercel-cron-secret'];
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only allow GET (cron) and POST (manual trigger)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[cron-cleanup-holds] Starting orphaned hold cleanup...');
  const startTime = Date.now();
  let cleaned = 0;
  let errors = 0;
  let skipped = 0;

  try {
    // Get Supabase admin client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Find pending authorizations older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: pendingAuths, error: fetchError } = await supabase
      .from('pending_authorizations')
      .select('payment_intent_id, amount_cents, customer_name, customer_email, service_label, created_at')
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('[cron-cleanup-holds] Failed to fetch pending authorizations:', fetchError);
      return res.status(500).json({ error: 'Database query failed', details: fetchError.message });
    }

    if (!pendingAuths || pendingAuths.length === 0) {
      console.log('[cron-cleanup-holds] No orphaned holds found.');
      return res.status(200).json({
        success: true,
        message: 'No orphaned holds found',
        cleaned,
        errors,
        skipped,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[cron-cleanup-holds] Found ${pendingAuths.length} potential orphaned holds.`);

    // Check each one with Stripe
    for (const auth of pendingAuths) {
      try {
        if (!auth.payment_intent_id) {
          console.warn(`[cron-cleanup-holds] Missing payment_intent_id for auth ${auth.id}`);
          skipped++;
          continue;
        }

        // Retrieve the PaymentIntent from Stripe
        const intent = await stripe.paymentIntents.retrieve(auth.payment_intent_id);

        // If it's still a valid hold, cancel it
        if (intent.status === 'requires_capture') {
          try {
            const canceled = await stripe.paymentIntents.cancel(auth.payment_intent_id);
            console.log(`[cron-cleanup-holds] Canceled orphaned hold ${auth.payment_intent_id} for ${auth.customer_email}`);

            // Update the pending_authorizations record
            await supabase
              .from('pending_authorizations')
              .update({
                status: 'voided',
                reason: 'orphaned_hold_cleanup',
                resolved_at: new Date().toISOString(),
              })
              .eq('payment_intent_id', auth.payment_intent_id);

            cleaned++;
          } catch (cancelError) {
            // If it's already canceled or in a terminal state, that's fine
            if (cancelError.code === 'payment_intent_unexpected_state') {
              console.log(`[cron-cleanup-holds] PI ${auth.payment_intent_id} already in terminal state: ${cancelError.message}`);
              
              // Mark as resolved
              await supabase
                .from('pending_authorizations')
                .update({
                  status: 'voided',
                  reason: 'already_terminal',
                  resolved_at: new Date().toISOString(),
                })
                .eq('payment_intent_id', auth.payment_intent_id);
              
              skipped++;
            } else {
              console.error(`[cron-cleanup-holds] Failed to cancel ${auth.payment_intent_id}:`, cancelError);
              errors++;
            }
          }
        } else if (intent.status === 'canceled') {
          // Already canceled, just mark as resolved
          console.log(`[cron-cleanup-holds] PI ${auth.payment_intent_id} already canceled`);
          
          await supabase
            .from('pending_authorizations')
            .update({
              status: 'voided',
              reason: 'already_canceled',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          
          skipped++;
        } else if (intent.status === 'succeeded') {
          // This shouldn't happen for a manual-capture intent, but handle it
          console.warn(`[cron-cleanup-holds] PI ${auth.payment_intent_id} is succeeded (unexpected)`);
          
          await supabase
            .from('pending_authorizations')
            .update({
              status: 'booked', // It's captured, so it's not orphaned
              reason: 'already_captured',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          
          skipped++;
        } else if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
          // Never became a real hold - mark as voided
          console.log(`[cron-cleanup-holds] PI ${auth.payment_intent_id} never became a hold (status: ${intent.status})`);
          
          try {
            await stripe.paymentIntents.cancel(auth.payment_intent_id);
          } catch (cancelError) {
            // Ignore - it's not a real hold anyway
          }
          
          await supabase
            .from('pending_authorizations')
            .update({
              status: 'voided',
              reason: 'never_became_hold',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          
          skipped++;
        } else {
          // Unknown status - log and skip
          console.warn(`[cron-cleanup-holds] PI ${auth.payment_intent_id} in unexpected status: ${intent.status}`);
          skipped++;
        }

      } catch (error) {
        console.error(`[cron-cleanup-holds] Error processing ${auth.payment_intent_id}:`, error);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[cron-cleanup-holds] Cleanup complete: ${cleaned} cleaned, ${errors} errors, ${skipped} skipped in ${duration}ms`);

    return res.status(200).json({
      success: true,
      message: `Cleaned ${cleaned} orphaned holds`,
      cleaned,
      errors,
      skipped,
      duration_ms: duration,
    });

  } catch (error) {
    console.error('[cron-cleanup-holds] Fatal error:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      details: error.message,
      cleaned,
      errors,
      skipped,
      duration_ms: Date.now() - startTime,
    });
  }
}