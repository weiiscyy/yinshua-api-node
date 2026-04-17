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

  // 1. 重建 SalesPerson 表，加 IDENTITY
  console.log('=== 重建 SalesPerson 表 ===');
  await pool.request().query(`
    SET IDENTITY_INSERT SalesPerson OFF;
    ALTER TABLE SalesPerson DROP COLUMN id;
    ALTER TABLE SalesPerson ADD id INT IDENTITY(1000,1) PRIMARY KEY;
  `);
  console.log('SalesPerson id 已改为 IDENTITY，当前种子1000');

  // 2. 测试 Company 插入（直接用 request 的 input）
  console.log('\n=== 测试 Company 插入 ===');
  const req = pool.request();
  req.input('p0', '测试公司X');
  req.input('p1', '地址X');
  req.input('p2', '联系人X');
  req.input('p3', '电话X');
  const r = await req.query(
    'INSERT INTO Company (name, address, contact, phone) OUTPUT INSERTED.* VALUES (@p0, @p1, @p2, @p3)'
  );
  console.log('Company insert result:', JSON.stringify(r.recordset));

  await sql.close();
  console.log('\nDone');
}

fix().catch(e => console.error('Error:', e.message));
