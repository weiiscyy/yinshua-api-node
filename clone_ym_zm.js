const sql = require('mssql');

async function copyLargeTable(srcPool, dstPool, tname) {
  // 小批量复制，避免超时
  const batchSize = 1000;
  const countR = await srcPool.request().query(`SELECT COUNT(*) as cnt FROM [${tname}]`);
  const total = countR.recordset[0].cnt;
  if (total === 0) { console.log(`  ${tname}: 0条，跳过`); return; }

  console.log(`  ${tname}: ${total} 条，开始复制...`);
  let offset = 0;
  let copied = 0;

  while (offset < total) {
    const rows = await srcPool.request().query(
      `SELECT * FROM [${tname}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY`
    );
    if (rows.recordset.length === 0) break;

    const cols = Object.keys(rows.recordset[0]);
    const colNames = cols.map(c => `[${c}]`).join(',');
    const pNames = cols.map((_, i) => `@p${i}`).join(',');
    const insertSql = `INSERT INTO [${tname}] (${colNames}) VALUES (${pNames})`;

    for (const row of rows.recordset) {
      const req = dstPool.request();
      cols.forEach((c, i) => req.input(`p${i}`, row[c] === undefined ? null : row[c]));
      try {
        await req.query(insertSql);
      } catch (e) {
        // 如果是IDENTITY插入错误，尝试去掉自增列
        if (e.message.includes('identity')) {
          const nonIdCols = cols.filter(c => !c.endsWith('_id') || c !== 'DD_id');
          // 跳过这条
          continue;
        }
      }
    }
    copied += rows.recordset.length;
    offset += batchSize;
    process.stdout.write(`\r    ${tname}: ${copied}/${total}`);
  }
  console.log(`\r  ✓ ${tname}: ${copied} 条完成`);
}

async function fix() {
  const longConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 300000 }
  };
  const testConfig = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua_test',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 300000 }
  };

  const srcPool = await sql.connect(longConfig);
  const dstPool = await sql.connect(testConfig);

  // 先清空已存在的 YM/ZM/YMGX/ZMGX 重新复制
  for (const t of ['YM', 'ZM', 'YMGX', 'ZMGX']) {
    try {
      await dstPool.request().query(`DELETE FROM [${t}]`);
      console.log(`  ${t} 已清空`);
    } catch(e) {
      console.log(`  ${t} 清空失败: ${e.message}`);
    }
  }

  console.log('\n开始复制...');
  for (const t of ['YM', 'ZM']) {
    try {
      await copyLargeTable(srcPool, dstPool, t);
    } catch (e) {
      console.log(`  ✗ ${t} 失败: ${e.message}`);
    }
  }

  // YMGX/ZMGX 也需要重试
  for (const t of ['YMGX', 'ZMGX']) {
    try {
      await copyLargeTable(srcPool, dstPool, t);
    } catch (e) {
      console.log(`  ✗ ${t} 失败: ${e.message}`);
    }
  }

  // ShippingAddress 补充数据
  console.log('\n补充 ShippingAddress 测试数据...');
  const testPool = await sql.connect(testConfig);
  await testPool.request().query(`
    INSERT INTO ShippingAddress (company_id, address, contact, phone, isDefault) VALUES
      (1, N'上海市浦东新区张江路', N'张经理', N'021-12345678', 1),
      (2, N'江苏省南京市鼓楼区', N'李经理', N'025-87654321', 0)
  `);
  console.log('✓ ShippingAddress 数据已添加');

  // 验证
  console.log('\n=== 最终验证 ===');
  const tables = ['YS','YM','ZM','DS','YSGX','YMGX','ZMGX','DSGX','SalesPerson','Company','ShippingAddress'];
  for (const t of tables) {
    try {
      const r = await testPool.request().query(`SELECT COUNT(*) as cnt FROM [${t}]`);
      console.log(`  ${t}: ${r.recordset[0].cnt} 条`);
    } catch(e) {
      console.log(`  ${t}: 不存在`);
    }
  }

  await sql.close();
  console.log('\n✅ 全部完成！');
}

fix().catch(e => console.error('Error:', e.message));
