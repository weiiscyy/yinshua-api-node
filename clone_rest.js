const sql = require('mssql');

async function fix() {
  const prodConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const testConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua_test',
    options: { encrypt: false, trustServerCertificate: true }
  };

  // 先单独连测试库建基础表
  console.log('=== 建基础数据表 ===');
  const testPool = await sql.connect(testConfig);

  await testPool.request().query(`
    CREATE TABLE SalesPerson (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(50),
      department NVARCHAR(10) DEFAULT 'A',
      isDel BIT DEFAULT 0
    )
  `);
  console.log('✓ SalesPerson 创建成功');

  await testPool.request().query(`
    CREATE TABLE Company (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(100) NOT NULL,
      address NVARCHAR(200),
      phone NVARCHAR(50),
      contact NVARCHAR(50),
      isDel BIT DEFAULT 0
    )
  `);
  console.log('✓ Company 创建成功');

  await testPool.request().query(`
    CREATE TABLE ShippingAddress (
      id INT IDENTITY(1,1) PRIMARY KEY,
      company_id INT,
      address NVARCHAR(200) NOT NULL,
      contact NVARCHAR(50),
      phone NVARCHAR(50),
      isDefault BIT DEFAULT 0,
      isDel BIT DEFAULT 0
    )
  `);
  console.log('✓ ShippingAddress 创建成功');

  // 同步业务员
  const prodPool = await sql.connect(prodConfig);
  await testPool.request().query(`
    INSERT INTO SalesPerson (name, department)
    SELECT UserName, Department FROM yinshua.dbo.UserInfo WHERE Department = 'A' AND IsDel = 0
  `);
  console.log('✓ SalesPerson 同步完成');

  // 补充测试公司
  await testPool.request().query(`
    INSERT INTO Company (name, address, contact, phone) VALUES
      (N'美特斯邦威', N'上海市浦东新区', N'张经理', N'021-12345678'),
      (N'汇鸿集团', N'江苏省南京市', N'李经理', N'025-87654321'),
      (N'DKC服饰', N'浙江省杭州市', N'王经理', N'0571-11223344')
  `);
  console.log('✓ 测试公司数据已添加');

  await sql.close();
  console.log('\n基础表完成！');

  // 单独处理 YM 和 ZM 大表（增加超时）
  console.log('\n=== 克隆 YM / ZM（单独长超时）===');
  const longTimeoutConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 120000 }
  };
  const longPool = await sql.connect(longTimeoutConfig);
  const testPool2 = await sql.connect({ ...longTimeoutConfig, database: 'yinshua_test' });

  for (const t of ['YM', 'ZM']) {
    try {
      console.log(`  复制 ${t}...`);
      await testPool2.request().query(
        `SELECT * INTO yinshua_test.dbo.[${t}] FROM yinshua.dbo.[${t}]`
      );
      const cnt = await testPool2.request().query(`SELECT COUNT(*) as cnt FROM [${t}]`);
      console.log(`  ✓ ${t}: ${cnt.recordset[0].cnt} 条`);
    } catch (e) {
      console.log(`  ✗ ${t}: ${e.message}`);
    }
  }

  await sql.close();
  console.log('\n✅ 全部完成！');
}

fix().catch(e => console.error('Error:', e.message));
