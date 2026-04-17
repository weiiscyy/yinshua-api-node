const sql = require('mssql');

async function createDb() {
  const config = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true }
  };

  try {
    await sql.connect(config);
    const result = await sql.query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'yinshua_test')
        CREATE DATABASE yinshua_test
    `);
    console.log('Done. rowsAffected:', result.rowsAffected);
    await sql.close();
  } catch (e) {
    console.error('Error:', e.message);
  }
}

createDb();
