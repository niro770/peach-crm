const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { status, assigned_to, donor_id, priority } = req.query;
    const conds = []; const params = []; let idx = 1;
    if (status)      { conds.push(`t.status = $${idx++}`); params.push(status); }
    if (assigned_to) { conds.push(`t.assigned_to = $${idx++}`); params.push(assigned_to); }
    if (donor_id)    { conds.push(`t.donor_id = $${idx++}`); params.push(donor_id); }
    if (priority)    { conds.push(`t.priority = $${idx++}`); params.push(priority); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const { rows } = await db.query(`
      SELECT t.*,
        d.first_name||' '||d.last_name as donor_name,
        u.name as assigned_name
      FROM tasks t
      LEFT JOIN donors d ON d.id=t.donor_id
      LEFT JOIN users u ON u.id=t.assigned_to
      ${where}
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        t.due_date ASC NULLS LAST
    `, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { title, description, donor_id, assigned_to, priority, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { rows } = await db.query(`
      INSERT INTO tasks (title, description, donor_id, assigned_to, priority, due_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [title, description, donor_id, assigned_to||req.user.id, priority||'normal', due_date, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const completedAt = status === 'done' ? 'NOW()' : 'NULL';
    const { rows } = await db.query(`
      UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4,
        due_date=$5, assigned_to=$6, completed_at=${completedAt}
      WHERE id=$7 RETURNING *
    `, [title, description, status, priority, due_date, assigned_to, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
