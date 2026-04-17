require('dotenv').config();
const db = require('./config/db');

async function test() {
  try {
    console.log('DB_NAME:', process.env.DB_NAME);
    const rows = await db.query('SELECT * FROM SalesPerson WHERE isDel = 0');
    console.log('result type:', typeof rows);
    console.log('is array:', Array.isArray(rows));
    console.log('length:', rows.length);
    console.log('data:', JSON.stringify(rows));
    await db.getPool().then(p => p.close());
    process.exit(0);
  } catch(e) {
    console.error('Error:', e.message, e.stack);
    process.exit(1);
  }
}

test();
