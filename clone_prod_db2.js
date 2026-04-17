const sql = require('mssql');

async function cloneDb() {
  const masterConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const prodConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const masterPool = await sql.connect(masterConfig);
  console.log('Connected to master');

  // 删除并重建测试库
  console.log('\n=== 重建测试库 ===');
  await masterPool.request().query(`
    IF EXISTS (SELECT name FROM sys.databases WHERE name = 'yinshua_test')
      DROP DATABASE yinshua_test;
    CREATE DATABASE yinshua_test;
  `);
  console.log('yinshua_test 创建成功');
  await masterPool.close();

  // 直接用 sql.queryPool 连生产库查表（只读不受影响）
  const prodPool = await sql.connect(prodConfig);
  const testPool = await sql.connect({ ...prodConfig, database: 'yinshua_test' });

  // 用 INSERT INTO ... SELECT 方式复制（SQL Server 最高效）
  // 先获取所有表名
  console.log('\n=== 获取生产库表列表 ===');
  const tables = await prodPool.request().query(
    "SELECT TABLE_NAME FROM yinshua.INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
  );
  const tableNames = tables.recordset.map(r => r.TABLE_NAME);
  console.log(`共 ${tableNames.length} 张表: ${tableNames.join(', ')}`);

  console.log('\n=== 复制表结构和数据 ===');
  for (const tname of tableNames) {
    try {
      // 检查是否有人尝试写入只读库的SalesPerson
      if (tname === 'SalesPerson' || tname === 'Company' || tname === 'ShippingAddress') {
        console.log(`  ${tname}: 跳过（基础数据表）`);
        continue;
      }
      // 用 SELECT INTO 复制（自动建表+数据）
      await testPool.request().query(
        `SELECT * INTO yinshua_test.dbo.[${tname}] FROM yinshua.dbo.[${tname}]`
      );
      // 检查行数
      const cnt = await testPool.request().query(`SELECT COUNT(*) as cnt FROM [${tname}]`);
      console.log(`  ✓ ${tname}: ${cnt.recordset[0].cnt} 条`);
    } catch (e) {
      console.log(`  ✗ ${tname}: ${e.message}`);
    }
  }

  // 重建 SalesPerson 表（IDENTITY）
  console.log('\n=== 重建 SalesPerson（IDENTITY + 同步数据）===');
  try {
    await testPool.request().query(`
      CREATE TABLE SalesPerson (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(50),
        department NVARCHAR(10) DEFAULT 'A',
        isDel BIT DEFAULT 0
      );
      INSERT INTO SalesPerson (name, department)
      SELECT UserName, Department FROM yinshua.dbo.UserInfo WHERE Department = 'A' AND IsDel = 0;
    `);
    const cnt = await testPool.request().query('SELECT COUNT(*) as cnt FROM SalesPerson');
    console.log(`  ✓ SalesPerson: ${cnt.recordset[0].cnt} 条（已IDENTITY自增）`);
  } catch (e) {
    console.log(`  ✗ SalesPerson 重建失败: ${e.message}`);
  }

  // 补充测试基础数据
  console.log('\n=== 补充测试数据 ===');
  try {
    await testPool.request().query(`
      INSERT INTO Company (name, address, contact, phone) VALUES
        (N'美特斯邦威', N'上海市浦东新区', N'张经理', N'021-12345678'),
        (N'汇鸿集团', N'江苏省南京市', N'李经理', N'025-87654321'),
        (N'DKC服饰', N'浙江省杭州市', N'王经理', N'0571-11223344');
      INSERT INTO ShippingAddress (company_id, address, contact, phone, isDefault) VALUES
        (1, N'上海市浦东新区某路', N'张经理', N'021-12345678', 1),
        (2, N'江苏省南京市某路', N'李经理', N'025-87654321', 0);
    `);
    console.log('  ✓ 基础测试数据已添加');
  } catch (e) {
    console.log(`  ✗ 基础数据失败: ${e.message}`);
  }

  await sql.close();
  console.log('\n✅ 数据库克隆完成！');
}

cloneDb().catch(e => console.error('Error:', e.message));
