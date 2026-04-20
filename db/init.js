require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function init() {
  try {
    console.log('Initializing database...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await db.query(schema);
    console.log('✅ Schema created successfully');
    console.log('✅ Default admin user: admin@peach-crm.local / Admin1234!');
    process.exit(0);
  } catch (err) {
    console.error('❌ DB init failed:', err);
    process.exit(1);
  }
}

init();
