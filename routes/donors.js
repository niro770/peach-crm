const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/donors  — list with search, filter, pagination
router.get('/', auth, async (req, res) => {
  try {
    const {
      q = '', page = 1, limit = 50,
      method, status, city, group,
      no_email, no_phone, gold,
      sort = 'last_name', order = 'ASC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];
    let paramIdx = 1;

    if (q) {
      conditions.push(`(
        first_name ILIKE $${paramIdx} OR last_name ILIKE $${paramIdx} OR
        mobile ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR
        CONCAT(first_name,' ',last_name) ILIKE $${paramIdx}
      )`);
      params.push(`%${q}%`); paramIdx++;
    }
    if (method) { conditions.push(`payment_method = $${paramIdx}`); params.push(method); paramIdx++; }
    if (city)   { conditions.push(`city ILIKE $${paramIdx}`); params.push(`%${city}%`); paramIdx++; }
    if (group)  { conditions.push(`$${paramIdx} = ANY(groups)`); params.push(group); paramIdx++; }
    if (no_email === 'true') { conditions.push(`(email IS NULL OR email = '')`); }
    if (no_phone === 'true') { conditions.push(`(mobile IS NULL OR mobile = '')`); }
    if (gold === 'true')     { conditions.push(`'זהב' = ANY(tags)`); }
    if (status === 'active') { conditions.push(`standing_order_active = true`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const allowedSort = ['last_name','first_name','total_donations','last_donation_date','created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'last_name';
    const sortDir = order === 'DESC' ? 'DESC' : 'ASC';

    const countQ = await db.query(`SELECT COUNT(*) FROM donors ${where}`, params);
    const total = parseInt(countQ.rows[0].count);

    params.push(parseInt(limit), offset);
    const { rows } = await db.query(`
      SELECT id, short_id, first_name, last_name, mobile, email, city,
             payment_method, monthly_standing_order, donation_amount,
             standing_order_active, tags, groups, whatsapp,
             total_donations, last_donation_date, last_call_date,
             callback_date, eligibility_status
      FROM donors ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${paramIdx} OFFSET $${paramIdx+1}
    `, params);

    res.json({ total, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donors/stats  — dashboard KPIs
router.get('/stats', auth, async (req, res) => {
  try {
    const [totals, methods, monthly, top] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total_donors,
          COUNT(*) FILTER (WHERE standing_order_active) as active_standing_orders,
          SUM(monthly_standing_order) FILTER (WHERE standing_order_active) as monthly_recurring,
          COUNT(*) FILTER (WHERE 'זהב' = ANY(tags)) as gold_donors
        FROM donors
      `),
      db.query(`
        SELECT payment_method, COUNT(*) as count, SUM(donation_amount) as total
        FROM donors WHERE payment_method IS NOT NULL
        GROUP BY payment_method ORDER BY total DESC NULLS LAST
      `),
      db.query(`
        SELECT DATE_TRUNC('month', charge_date) as month,
               SUM(amount) as total, COUNT(*) as count
        FROM transactions WHERE status = 'success'
          AND charge_date >= NOW() - INTERVAL '12 months'
        GROUP BY 1 ORDER BY 1
      `),
      db.query(`
        SELECT d.id, d.first_name, d.last_name, d.total_donations, d.tags
        FROM donors d ORDER BY total_donations DESC NULLS LAST LIMIT 5
      `),
    ]);

    const thisMonth = await db.query(`
      SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count
      FROM transactions
      WHERE status = 'success'
        AND charge_date >= DATE_TRUNC('month', NOW())
    `);

    res.json({
      totals: totals.rows[0],
      this_month: thisMonth.rows[0],
      by_method: methods.rows,
      monthly_trend: monthly.rows,
      top_donors: top.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/donors/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM donors WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Donor not found' });

    const [dedications, transactions, calls, tasks] = await Promise.all([
      db.query('SELECT * FROM dedications WHERE donor_id = $1 ORDER BY sort_order', [req.params.id]),
      db.query('SELECT * FROM transactions WHERE donor_id = $1 ORDER BY charge_date DESC LIMIT 20', [req.params.id]),
      db.query(`
        SELECT cl.*, u.name as user_name FROM call_logs cl
        LEFT JOIN users u ON u.id = cl.user_id
        WHERE cl.donor_id = $1 ORDER BY cl.started_at DESC LIMIT 10
      `, [req.params.id]),
      db.query('SELECT * FROM tasks WHERE donor_id = $1 AND status != $2 ORDER BY due_date', [req.params.id, 'done']),
    ]);

    res.json({
      ...rows[0],
      dedications: dedications.rows,
      recent_transactions: transactions.rows,
      recent_calls: calls.rows,
      open_tasks: tasks.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/donors
router.post('/', auth, async (req, res) => {
  try {
    const fields = buildDonorFields(req.body);
    const { rows } = await db.query(`
      INSERT INTO donors (${fields.cols.join(',')})
      VALUES (${fields.vals.map((_,i) => `$${i+1}`).join(',')})
      RETURNING *
    `, fields.vals);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/donors/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const fields = buildDonorFields(req.body);
    const sets = fields.cols.map((c, i) => `${c} = $${i+1}`).join(', ');
    fields.vals.push(req.params.id);
    const { rows } = await db.query(
      `UPDATE donors SET ${sets}, updated_at = NOW() WHERE id = $${fields.vals.length} RETURNING *`,
      fields.vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/donors/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    await db.query('DELETE FROM donors WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/donors/import  — bulk import from Excel data
router.post('/import', auth, async (req, res) => {
  try {
    const { donors } = req.body;
    if (!Array.isArray(donors)) return res.status(400).json({ error: 'donors array required' });

    let imported = 0, skipped = 0;
    for (const d of donors) {
      try {
        const fields = buildDonorFields(d);
        await db.query(`
          INSERT INTO donors (${fields.cols.join(',')})
          VALUES (${fields.vals.map((_,i) => `$${i+1}`).join(',')})
          ON CONFLICT DO NOTHING
        `, fields.vals);
        imported++;
      } catch { skipped++; }
    }
    res.json({ imported, skipped, total: donors.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedications
router.post('/:id/dedications', auth, async (req, res) => {
  try {
    const { hebrew_date, gregorian_date, dedication_text, sort_order } = req.body;
    const { rows } = await db.query(
      `INSERT INTO dedications (donor_id, hebrew_date, gregorian_date, dedication_text, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, hebrew_date, gregorian_date, dedication_text, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/dedications/:did', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM dedications WHERE id = $1 AND donor_id = $2', [req.params.did, req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper
function buildDonorFields(data) {
  const allowed = [
    'import_id','first_name','last_name','mothers_name','marital_status','children_names',
    'language','id_number','mobile','home_phone','extra_phone','email','whatsapp',
    'city','neighborhood','street','building_number','apartment_number','zip_code','mail_address',
    'business_name','business_city','business_neighborhood','business_street','business_building',
    'payment_method','monthly_standing_order','monthly_payment','standing_order_active',
    'receipts_dispatch','donation_amount','charge_date',
    'bank_name','bank_branch','account_number','bank_account_name',
    'groups','tags','is_ambassador','ambassador_id','display_type',
    'eligibility_status','receipt_name','general_notes','call_notes','callback_date'
  ];
  const cols = [], vals = [];
  for (const key of allowed) {
    if (data[key] !== undefined) { cols.push(key); vals.push(data[key]); }
  }
  return { cols, vals };
}

module.exports = router;
