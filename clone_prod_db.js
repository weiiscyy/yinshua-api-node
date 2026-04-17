const sql = require('mssql');

async function cloneDb() {
  // 先连 master，删除旧测试库（如果存在），创建新的
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

  // 删除已存在的测试库
  console.log('\n=== 删除旧测试库 ===');
  await masterPool.request().query(`
    IF EXISTS (SELECT name FROM sys.databases WHERE name = 'yinshua_test')
      DROP DATABASE yinshua_test
  `);
  console.log('旧测试库已删除');

  // 创建新测试库
  console.log('\n=== 创建新测试库 ===');
  await masterPool.request().query('CREATE DATABASE yinshua_test');
  console.log('新测试库 yinshua_test 创建成功');

  await masterPool.close();

  // 连接新测试库，逐表复制结构（只读库，所以只读）
  const testPool = await sql.connect({
    ...prodConfig,
    database: 'yinshua_test'
  });

  console.log('\n=== 复制表结构 ===');
  const prodPool = await sql.connect(prodConfig);

  // 获取所有用户表
  const tables = await prodPool.request().query(
    "SELECT name FROM sys.tables WHERE type='U' ORDER BY name"
  );
  console.log(`共 ${tables.recordset.length} 张表`);

  for (const t of tables.recordset) {
    const tname = t.name;
    // 获取列信息
    const cols = await prodPool.request().query(`
      SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
             c.NUMERIC_PRECISION, c.NUMERIC_SCALE, c.IS_NULLABLE, c.COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = @t
      ORDER BY c.ORDINAL_POSITION
    `, { t: tname });

    // 构建建表语句
    const colDefs = cols.recordset.map(c => {
      let def = `[${c.COLUMN_NAME}] ${c.DATA_TYPE}`;
      if (c.CHARACTER_MAXIMUM_LENGTH) def += `(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'max' : c.CHARACTER_MAXIMUM_LENGTH})`;
      if (c.NUMERIC_PRECISION !== null && c.DATA_TYPE !== 'decimal' && c.DATA_TYPE !== 'numeric') {
        // skip
      }
      if (c.NUMERIC_PRECISION !== null && (c.DATA_TYPE === 'decimal' || c.DATA_TYPE === 'numeric')) {
        def += `(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`;
      }
      def += c.IS_NULLABLE === 'NO' ? ' NOT NULL' : ' NULL';
      if (c.COLUMN_DEFAULT) def += ` DEFAULT ${c.COLUMN_DEFAULT}`;
      return def;
    });

    // 获取主键信息
    const pkResult = await prodPool.request().query(`
      SELECT ku.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = @t AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `, { t: tname });

    const pkCols = pkResult.recordset.map(r => `[${r.COLUMN_NAME}]`).join(', ');

    // 构建完整建表SQL
    let createSql = `CREATE TABLE [${tname}] (${colDefs.join(', ')}`;
    if (pkCols) createSql += `, CONSTRAINT [PK_${tname}] PRIMARY KEY (${pkCols})`;
    createSql += ')';

    try {
      await testPool.request().query(createSql);
      console.log(`  ✓ ${tname} 表结构创建成功`);
    } catch (e) {
      console.log(`  ✗ ${tname} 建表失败: ${e.message}`);
    }
  }

  console.log('\n=== 复制数据（分表批量插入） ===');
  // 复制数据 - 按批次小量多次，避免锁表
  const batchSize = 500;
  for (const t of tables.recordset) {
    const tname = t.name;
    try {
      // 先获取总行数
      const countR = await prodPool.request().query(`SELECT COUNT(*) as cnt FROM [${tname}]`);
      const total = countR.recordset[0].cnt;
      if (total === 0) { console.log(`  ${tname}: 0 条，跳过`); continue; }

      let offset = 0;
      let copied = 0;
      while (offset < total) {
        const rows = await prodPool.request().query(
          `SELECT * FROM [${tname}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY`
        );
        const cols = Object.keys(rows.recordset[0] || {});
        if (rows.recordset.length === 0) break;

        const colNames = cols.map(c => `[${c}]`).join(',');
        const pNames = cols.map((_, i) => `@p${i}`).join(',');
        const insertSql = `INSERT INTO [${tname}] (${colNames}) VALUES (${pNames})`;

        for (const row of rows.recordset) {
          const req = testPool.request();
          cols.forEach((c, i) => req.input(`p${i}`, row[c] !== undefined ? row[c] : null));
          await req.query(insertSql);
        }

        copied += rows.recordset.length;
        offset += batchSize;
        process.stdout.write(`\r  ${tname}: ${copied}/${total} 条`);
      }
      console.log(`  ✓ ${tname}: ${copied} 条数据复制完成`);
    } catch (e) {
      console.log(`  ✗ ${tname} 数据复制失败: ${e.message}`);
    }
  }

  // 重建 SalesPerson 的 IDENTITY（之前的空测试库SalesPerson不是IDENTITY）
  console.log('\n=== 重建 SalesPerson（IDENTITY）===');
  try {
    await testPool.request().query(`
      SET IDENTITY_INSERT SalesPerson OFF;
      ALTER TABLE SalesPerson DROP COLUMN id;
      ALTER TABLE SalesPerson ADD id INT IDENTITY(1,1);
    `);
    console.log('SalesPerson IDENTITY 重建完成');
  } catch (e) {
    console.log('SalesPerson IDENTITY 重建失败（可能本来就不是问题）:', e.message);
  }

  // 基础数据表里补充几条测试公司/地址
  console.log('\n=== 补充测试基础数据 ===');
  const req = testPool.request();
  req.input('name', '美特斯邦威');
  req.input('addr', '上海市浦东新区');
  req.input('contact', '张经理');
  req.input('phone', '021-12345678');
  await req.query(
    "IF NOT EXISTS (SELECT * FROM Company WHERE name=@name) INSERT INTO Company (name,address,contact,phone) VALUES (@name,@addr,@contact,@phone)"
  );

  await sql.close();
  console.log('\n✅ 完整克隆完成！测试库: yinshua_test');
  console.log('总表数:', tables.recordset.length);
}

cloneDb().catch(e => console.error('Error:', e.message));
