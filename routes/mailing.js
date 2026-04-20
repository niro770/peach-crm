const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM mailings ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { type, subject, body, audience_filter, scheduled_at } = req.body;
    if (!type || !body) return res.status(400).json({ error: 'type and body required' });

    // Count recipients based on filter
    let recipientCount = 0;
    try {
      const conds = []; const params = [];
      if (audience_filter?.standing_order) { conds.push('standing_order_active = true'); }
      if (audience_filter?.tags?.length)   { conds.push(`tags && $${params.length+1}`); params.push(audience_filter.tags); }
      if (type === 'sms') { conds.push("mobile IS NOT NULL AND mobile != ''"); }
      if (type === 'email') { conds.push("email IS NOT NULL AND email != ''"); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const { rows } = await db.query(`SELECT COUNT(*) FROM donors ${where}`, params);
      recipientCount = parseInt(rows[0].count);
    } catch {}

    const { rows } = await db.query(`
      INSERT INTO mailings (type, subject, body, audience_filter, recipient_count, scheduled_at, created_by, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [type, subject, body, audience_filter, recipientCount, scheduled_at, req.user.id,
        scheduled_at ? 'scheduled' : 'draft']);

    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/mailing/:id/send  — mark as sent (integrate with SMS/email provider here)
router.post('/:id/send', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      UPDATE mailings SET status='sent', sent_at=NOW(), sent_count=recipient_count
      WHERE id=$1 RETURNING *
    `, [req.params.id]);
    // TODO: integrate Twilio SMS / Nodemailer here
    res.json({ message: 'Mailing sent', mailing: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(sent_count),0) as total_sent,
        COALESCE(SUM(open_count),0) as total_opens,
        COALESCE(AVG(CASE WHEN sent_count>0 THEN open_count::float/sent_count*100 END),0)::int as avg_open_rate
      FROM mailings WHERE status='sent'
    `);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
