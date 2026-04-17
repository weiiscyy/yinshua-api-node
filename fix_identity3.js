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

  // 用单条 batch 执行所有操作（保证同一连接）
  const batchSQL = `
    SET IDENTITY_INSERT SalesPerson OFF;
    IF OBJECT_ID('SalesPerson_new', 'U') IS NOT NULL DROP TABLE SalesPerson_new;
    CREATE TABLE SalesPerson_new (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(50),
      department NVARCHAR(10) DEFAULT 'A',
      isDel BIT DEFAULT 0
    );
    SET IDENTITY_INSERT SalesPerson_new ON;
    INSERT INTO SalesPerson_new (id, name, department, isDel) SELECT id, name, department, isDel FROM SalesPerson;
    SET IDENTITY_INSERT SalesPerson_new OFF;
    DROP TABLE SalesPerson;
    EXEC sp_rename 'SalesPerson_new', 'SalesPerson';
  `;

  console.log('执行表结构转换...');
  const r = await pool.request().batch(batchSQL);
  console.log('完成:', JSON.stringify(r));

  // 验证：直接插入（不需要指定id）
  const insertR = await pool.request()
    .input('name', '测试员Y')
    .input('dept', 'A')
    .query('INSERT INTO SalesPerson (name, department) OUTPUT INSERTED.* VALUES (@name, @dept)');
  console.log('测试插入:', JSON.stringify(insertR.recordset));

  await sql.close();
  console.log('全部完成');
}

fix().catch(e => console.error('Error:', e.message));
