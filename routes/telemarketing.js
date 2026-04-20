const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/telemarketing/queue  — next donors to call
router.get('/queue', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT d.id, d.first_name, d.last_name, d.mobile, d.whatsapp,
             d.payment_method, d.monthly_standing_order, d.total_donations,
             d.last_call_date, d.last_call_status, d.callback_date,
             d.call_notes, d.tags, d.standing_order_active
      FROM donors d
      WHERE d.mobile IS NOT NULL AND d.mobile != ''
        AND (
          d.callback_date <= CURRENT_DATE
          OR d.last_call_date IS NULL
          OR d.standing_order_active = false
        )
      ORDER BY
        CASE WHEN d.callback_date IS NOT NULL AND d.callback_date <= CURRENT_DATE THEN 0 ELSE 1 END,
        d.last_call_date ASC NULLS FIRST,
        d.total_donations DESC NULLS LAST
      LIMIT 20
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/telemarketing/calls  — log a call
router.post('/calls', auth, async (req, res) => {
  try {
    const { donor_id, outcome, donation_amount, notes, callback_date, duration_seconds } = req.body;
    if (!donor_id || !outcome) return res.status(400).json({ error: 'donor_id and outcome required' });

    let transaction_id = null;

    // If call resulted in donation, create transaction
    if (donation_amount && outcome === 'donation') {
      const { rows: [txn] } = await db.query(`
        INSERT INTO transactions (donor_id, type, amount, payment_method, charge_date, created_by, status, notes)
        VALUES ($1,'one_time',$2,'phone_call',NOW(),$3,'success',$4) RETURNING id
      `, [donor_id, donation_amount, req.user.id, `שיחת טלמרקטינג: ${notes||''}`]);
      transaction_id = txn.id;

      // Update donor total
      await db.query(`
        UPDATE donors SET total_donations=total_donations+$1,
          last_donation_amount=$1, last_donation_date=NOW(),
          last_donation_via_telemarketer=$1
        WHERE id=$2
      `, [donation_amount, donor_id]);
    }

    // Log the call
    const { rows: [call] } = await db.query(`
      INSERT INTO call_logs (donor_id, user_id, ended_at, duration_seconds, outcome, donation_amount, transaction_id, notes, callback_date)
      VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8) RETURNING *
    `, [donor_id, req.user.id, duration_seconds, outcome, donation_amount, transaction_id, notes, callback_date]);

    // Update donor's call info
    await db.query(`
      UPDATE donors SET
        last_call_date = NOW(),
        last_call_status = $1,
        last_call_notes = $2,
        last_call_telemarketer = $3,
        callback_date = $4,
        updated_at = NOW()
      WHERE id = $5
    `, [outcome, notes, req.user.id, callback_date, donor_id]);

    res.status(201).json({ call, transaction_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/telemarketing/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE outcome='donation') as donations,
        COUNT(*) FILTER (WHERE outcome='not_answered') as not_answered,
        COUNT(*) FILTER (WHERE outcome='not_interested') as not_interested,
        COUNT(*) FILTER (WHERE outcome='interested_callback') as callbacks,
        COALESCE(SUM(donation_amount) FILTER (WHERE outcome='donation'),0) as total_raised,
        COALESCE(AVG(duration_seconds),0)::int as avg_duration
      FROM call_logs
      WHERE started_at >= DATE_TRUNC('month', NOW())
    `);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/telemarketing/calls  — history
router.get('/calls', auth, async (req, res) => {
  try {
    const { limit = 50, user_id } = req.query;
    const where = user_id ? 'WHERE cl.user_id = $2' : '';
    const params = user_id ? [parseInt(limit), user_id] : [parseInt(limit)];
    const { rows } = await db.query(`
      SELECT cl.*, d.first_name||' '||d.last_name as donor_name, d.mobile,
             u.name as caller_name
      FROM call_logs cl
      JOIN donors d ON d.id=cl.donor_id
      JOIN users u ON u.id=cl.user_id
      ${where}
      ORDER BY cl.started_at DESC LIMIT $1
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
