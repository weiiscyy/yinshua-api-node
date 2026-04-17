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

  // 1. 创建新的 SalesPerson 表（带 IDENTITY），迁移数据
  console.log('=== 重建 SalesPerson（带 IDENTITY）===');
  await pool.request().query(`
    IF OBJECT_ID('SalesPerson_new', 'U') IS NOT NULL DROP TABLE SalesPerson_new;
    CREATE TABLE SalesPerson_new (
      id INT IDENTITY(1000,1) PRIMARY KEY,
      name NVARCHAR(50),
      department NVARCHAR(10) DEFAULT 'A',
      isDel BIT DEFAULT 0
    );
    SET IDENTITY_INSERT SalesPerson_new ON;
    INSERT INTO SalesPerson_new (id, name, department, isDel) SELECT id, name, department, isDel FROM SalesPerson;
    SET IDENTITY_INSERT SalesPerson_new OFF;
    DROP TABLE SalesPerson;
    EXEC sp_rename 'SalesPerson_new', 'SalesPerson';
  `);
  console.log('SalesPerson 重建完成，IDENTITY 种子1000');

  // 2. 直接在 DB 里测 Company 插入
  console.log('\n=== 测试 Company 插入 ===');
  const r = await pool.request()
    .input('p0', '测试公司XX')
    .input('p1', '测试地址')
    .input('p2', '测试联系人')
    .input('p3', '12345678')
    .query('INSERT INTO Company (name, address, contact, phone) OUTPUT INSERTED.* VALUES (@p0, @p1, @p2, @p3)');
  console.log('Result:', JSON.stringify(r.recordset));

  await sql.close();
  console.log('\nAll done');
}

fix().catch(e => console.error('Error:', e.message));
