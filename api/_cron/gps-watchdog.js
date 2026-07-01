/**
 * _cron/gps-watchdog.js — nudge workers whose live GPS has gone dark.
 *
 * A backgrounded/closed PWA suspends its JavaScript, so worker-gps-tracking.js
 * stops sending pings and the customer's live map freezes. The app can't notify
 * itself while suspended, so this job runs server-side on a schedule (a free
 * external cron — see README/SETUP + memory gps-watchdog-external-cron) and
 * pushes a "reopen the app" alert that reaches the phone even when the worker is
 * in a totally different app.
 *
 * Tapping the notification reopens /worker/dashboard, where refreshGpsPanels()
 * auto-resumes tracking (permission was already granted at "Key received").
 *
 * Served via the shared /api/cron dispatcher (job=gps-watchdog). The public
 * /api/gps-watchdog path is preserved by a vercel.json rewrite so the external
 * cron-job.org trigger keeps working without a URL change. Consolidated here to
 * stay under Vercel Hobby's 12-function limit.
 *
 * Auth: same Bearer CRON_SECRET as the other scheduled jobs.
 */

const { getSupabaseAdmin } = require('../_auth');
const { sendToSubs } = require('../_push');

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Tunable without a redeploy via env vars. Defaults: 4 min dark = nudge,
  // re-nudge no more than every 10 min so the worker isn't spammed.
  const staleSeconds = Number(process.env.GPS_STALE_SECONDS) || 240;
  const renudgeSeconds = Number(process.env.GPS_RENUDGE_SECONDS) || 600;

  const db = getSupabaseAdmin();
  const { data: jobs, error } = await db.rpc('gps_watchdog_collect', {
    p_stale_seconds: staleSeconds,
    p_renudge_seconds: renudgeSeconds,
  });
  if (error) {
    console.error('[gps-watchdog] collect error:', error.message);
    return res.status(500).json({ error: 'Could not collect stale jobs' });
  }

  const results = { checked: (jobs || []).length, nudged: [], skipped: [] };

  for (const job of jobs || []) {
    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('subscriber_type', 'worker')
      .eq('employee_id', job.employee_id);

    if (!subs || !subs.length) {
      // Worker never enabled alerts — nothing to push to. (gps_last_nudge_at was
      // still stamped, so we won't re-check them every single run.)
      results.skipped.push({ request_id: job.request_id, reason: 'no worker subscription' });
      continue;
    }

    const sent = await sendToSubs(subs, {
      title: '⚠️ Reopen ShiftFuel to keep tracking',
      body: `Your ${job.service_label || 'active'} job isn’t being tracked right now — tap to resume live GPS.`,
      tag: `gps-watchdog-${job.request_id}`, // collapses repeat nudges for the same job
      url: '/worker/dashboard',
    });
    const failed = (sent || []).find((r) => r && !r.ok);
    results.nudged.push({ request_id: job.request_id, ok: !failed, error: failed && failed.error });
  }

  console.log(`[gps-watchdog] checked ${results.checked}, nudged ${results.nudged.length}, skipped ${results.skipped.length}`);
  return res.status(200).json(results);
};
