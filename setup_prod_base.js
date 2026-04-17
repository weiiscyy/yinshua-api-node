const sql = require('mssql');

async function setup() {
  const config = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const pool = await sql.connect(config);
  console.log('Connected to yinshua');

  // 1. 创建 SalesPerson 表
  console.log('\n=== 创建 SalesPerson 表 ===');
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SalesPerson]') AND type = 'U')
    CREATE TABLE SalesPerson (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(50),
      department NVARCHAR(10) DEFAULT 'A',
      isDel BIT DEFAULT 0
    );
    PRINT 'SalesPerson created';
  `);

  // 从 UserInfo 同步销售部门业务员到 SalesPerson
  console.log('\n=== 同步业务员 ===');
  const users = await pool.request().query(
    "SELECT UserID, UserName FROM UserInfo WHERE Department = 'A' AND IsDel = 0"
  );
  console.log(`找到 ${users.recordset.length} 名业务员`);
  for (const u of users.recordset) {
    await pool.request()
      .input('id', u.UserID)
      .input('name', u.UserName)
      .query(
        "IF NOT EXISTS (SELECT * FROM SalesPerson WHERE id = @id) INSERT INTO SalesPerson (id, name) VALUES (@id, @name)"
      );
  }
  console.log('业务员同步完成');

  // 2. 创建 Company 表
  console.log('\n=== 创建 Company 表 ===');
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Company]') AND type = 'U')
    CREATE TABLE Company (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(100) NOT NULL,
      address NVARCHAR(200),
      phone NVARCHAR(50),
      contact NVARCHAR(50),
      isDel BIT DEFAULT 0
    );
    PRINT 'Company created';
  `);

  // 3. 创建 ShippingAddress 表
  console.log('\n=== 创建 ShippingAddress 表 ===');
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ShippingAddress]') AND type = 'U')
    CREATE TABLE ShippingAddress (
      id INT IDENTITY(1,1) PRIMARY KEY,
      company_id INT,
      address NVARCHAR(200) NOT NULL,
      contact NVARCHAR(50),
      phone NVARCHAR(50),
      isDefault BIT DEFAULT 0,
      isDel BIT DEFAULT 0
    );
    PRINT 'ShippingAddress created';
  `);

  // 验证
  console.log('\n=== 验证 ===');
  const sp = await pool.request().query('SELECT * FROM SalesPerson');
  console.log(`SalesPerson: ${sp.recordset.length} 条`);
  const co = await pool.request().query('SELECT * FROM Company');
  console.log(`Company: ${co.recordset.length} 条`);

  await sql.close();
  console.log('\n全部完成！');
}

setup().catch(e => console.error('Error:', e.message));
