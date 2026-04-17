const sql = require('mssql');

async function fix() {
  const config = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua_test',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const pool = await sql.connect(config);
  console.log('Connected');

  // 重建 SalesPerson 表，变成真正的 IDENTITY
  console.log('=== 重建 SalesPerson（带 IDENTITY）===');
  await pool.request().query(`
    SET IDENTITY_INSERT SalesPerson OFF;
    ALTER TABLE SalesPerson DROP COLUMN id;
    ALTER TABLE SalesPerson ADD id INT IDENTITY(1,1);
  `);
  console.log('id 已改为 IDENTITY(1,1)');

  await sql.close();
  console.log('Done');
}

fix().catch(e => console.error('Error:', e.message));
