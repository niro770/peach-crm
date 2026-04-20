const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/payments  — list with filters
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, type, donor_id, month } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = []; const conds = []; let idx = 1;

    if (status)   { conds.push(`t.status = $${idx++}`); params.push(status); }
    if (type)     { conds.push(`t.type = $${idx++}`); params.push(type); }
    if (donor_id) { conds.push(`t.donor_id = $${idx++}`); params.push(donor_id); }
    if (month)    { conds.push(`DATE_TRUNC('month', t.charge_date) = $${idx++}`); params.push(month); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const countR = await db.query(`SELECT COUNT(*) FROM transactions t ${where}`, params);

    params.push(parseInt(limit), offset);
    const { rows } = await db.query(`
      SELECT t.*,
        d.first_name || ' ' || d.last_name as donor_name,
        d.mobile as donor_phone, d.email as donor_email
      FROM transactions t
      JOIN donors d ON d.id = t.donor_id
      ${where}
      ORDER BY t.charge_date DESC NULLS LAST, t.created_at DESC
      LIMIT $${idx} OFFSET $${idx+1}
    `, params);

    res.json({ total: parseInt(countR.rows[0].count), page: parseInt(page), data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payments/summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status='success' AND charge_date >= DATE_TRUNC('month',NOW())),0) as this_month,
        COALESCE(SUM(amount) FILTER (WHERE status='success' AND charge_date >= DATE_TRUNC('year',NOW())),0) as this_year,
        COALESCE(SUM(amount) FILTER (WHERE status='pending'),0) as pending,
        COALESCE(SUM(amount) FILTER (WHERE status='failed' AND charge_date >= DATE_TRUNC('month',NOW())),0) as failed_this_month,
        COUNT(*) FILTER (WHERE status='failed' AND charge_date >= DATE_TRUNC('month',NOW())) as failed_count,
        COUNT(*) FILTER (WHERE status='success' AND charge_date >= DATE_TRUNC('month',NOW())) as success_count
      FROM transactions
    `);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payments
router.post('/', auth, async (req, res) => {
  try {
    const { donor_id, type, amount, payment_method, charge_date, notes, campaign_id } = req.body;
    if (!donor_id || !amount) return res.status(400).json({ error: 'donor_id and amount required' });

    const { rows } = await db.query(`
      INSERT INTO transactions (donor_id, type, amount, payment_method, charge_date, notes, campaign_id, created_by, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'success') RETURNING *
    `, [donor_id, type||'one_time', amount, payment_method, charge_date||new Date(), notes, campaign_id, req.user.id]);

    // Update donor totals
    await db.query(`
      UPDATE donors SET
        total_donations = total_donations + $1,
        last_donation_amount = $1,
        last_donation_date = $2,
        highest_single_donation = GREATEST(COALESCE(highest_single_donation,0), $1),
        updated_at = NOW()
      WHERE id = $3
    `, [amount, charge_date||new Date(), donor_id]);

    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payments/:id/status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['pending','success','failed','refunded','cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await db.query(
      `UPDATE transactions SET status=$1, processed_at=NOW() WHERE id=$2 RETURNING *`, [status, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payments/:id/receipt
router.post('/:id/receipt', auth, async (req, res) => {
  try {
    const { rows: [txn] } = await db.query(
      'SELECT t.*, d.first_name, d.last_name, d.email FROM transactions t JOIN donors d ON d.id=t.donor_id WHERE t.id=$1',
      [req.params.id]
    );
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    const receiptNum = `REC-${Date.now()}`;
    const { rows: [receipt] } = await db.query(`
      INSERT INTO receipts (transaction_id, donor_id, receipt_number, amount, sent_via, sent_to)
      VALUES ($1,$2,$3,$4,'email',$5) ON CONFLICT DO NOTHING RETURNING *
    `, [txn.id, txn.donor_id, receiptNum, txn.amount, txn.email]);

    await db.query('UPDATE transactions SET receipt_sent=true, receipt_sent_at=NOW() WHERE id=$1', [txn.id]);
    res.json({ receipt, message: `Receipt ${receiptNum} generated` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payments/export  — CSV export
router.get('/export', auth, async (req, res) => {
  try {
    const { month } = req.query;
    const monthFilter = month ? `AND DATE_TRUNC('month', t.charge_date) = '${month}'` : '';
    const { rows } = await db.query(`
      SELECT d.first_name||' '||d.last_name as name, d.mobile, t.amount, t.type,
             t.payment_method, t.charge_date, t.status, t.receipt_number
      FROM transactions t JOIN donors d ON d.id=t.donor_id
      WHERE t.status='success' ${monthFilter}
      ORDER BY t.charge_date DESC
    `);

    const headers = ['שם','טלפון','סכום','סוג','אמצעי תשלום','תאריך','סטטוס','קבלה'];
    const csv = [headers.join(','), ...rows.map(r =>
      [r.name,r.mobile,r.amount,r.type,r.payment_method,r.charge_date,r.status,r.receipt_number||''].join(',')
    )].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=payments.csv');
    res.send('\uFEFF' + csv); // BOM for Excel Hebrew
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
