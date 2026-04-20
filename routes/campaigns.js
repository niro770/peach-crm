const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? 'WHERE status = $1' : '';
    const params = status ? [status] : [];
    const { rows } = await db.query(
      `SELECT c.*,
        CASE WHEN c.goal_amount > 0 THEN ROUND((c.raised_amount / c.goal_amount)*100, 1) ELSE 0 END as pct,
        (SELECT COUNT(*) FROM campaign_donations WHERE campaign_id = c.id) as donor_count
       FROM campaigns c ${where} ORDER BY created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM campaign_donations WHERE campaign_id=c.id) as donor_count,
        (SELECT json_agg(row_to_json(t)) FROM (
          SELECT d.first_name||' '||d.last_name as name, t.amount, t.charge_date
          FROM campaign_donations cd
          JOIN transactions t ON t.id=cd.transaction_id
          JOIN donors d ON d.id=cd.donor_id
          WHERE cd.campaign_id=c.id ORDER BY t.charge_date DESC LIMIT 10
        ) t) as recent_donations
      FROM campaigns c WHERE c.id=$1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, description, type, goal_amount, start_date, end_date } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await db.query(`
      INSERT INTO campaigns (name, description, type, goal_amount, start_date, end_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [name, description, type||'fundraising', goal_amount, start_date, end_date, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, status, goal_amount, start_date, end_date } = req.body;
    const { rows } = await db.query(`
      UPDATE campaigns SET name=$1, description=$2, status=$3, goal_amount=$4,
        start_date=$5, end_date=$6, updated_at=NOW()
      WHERE id=$7 RETURNING *
    `, [name, description, status, goal_amount, start_date, end_date, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
