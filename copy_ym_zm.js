const sql = require('mssql');

async function copyTableById(srcPool, dstPool, tname, idCol = 'DD_id') {
  const batchSize = 500;
  let lastId = null;
  let total = 0;

  const cntR = await srcPool.request().query(`SELECT COUNT(*) as cnt FROM [${tname}]`);
  total = cntR.recordset[0].cnt;
  console.log(`\n  ${tname}: ${total} 条`);

  while (true) {
    let query = `SELECT TOP ${batchSize} * FROM [${tname}]`;
    if (lastId !== null) query += ` WHERE ${idCol} > ${lastId}`;
    query += ` ORDER BY ${idCol}`;

    const rows = await srcPool.request().query(query);
    if (rows.recordset.length === 0) break;

    const cols = Object.keys(rows.recordset[0]);
    const colNames = cols.map(c => `[${c}]`).join(',');
    const pNames = cols.map((_, i) => `@p${i}`).join(',');

    for (const row of rows.recordset) {
      const req = dstPool.request();
      cols.forEach((c, i) => req.input(`p${i}`, row[c] === undefined ? null : row[c]));
      try {
        await req.query(`INSERT INTO [${tname}] (${colNames}) VALUES (${pNames})`);
      } catch(e) { /* skip failed rows */ }
    }

    lastId = rows.recordset[rows.recordset.length - 1][idCol];
    process.stdout.write(`\r    ${tname}: ${lastId}`);
    if (rows.recordset.length < batchSize) break;
  }
  console.log(`\r    ✓ ${tname} 完成`);
}

async function fix() {
  const cfg = {
    server: '10.147.19.187', port: 1433, user: 'sa', password: 'Admin12345',
    database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true, requestTimeout: 300000 }
  };
  const testCfg = { ...cfg, database: 'yinshua_test' };

  const srcPool = await sql.connect(cfg);
  const dstPool = await sql.connect(testCfg);

  // 按依赖顺序：先删子表再删父表，再按同样顺序复制
  const parentFirst = ['YM', 'ZM'];
  const childFirst = ['YMGX', 'ZMGX'];

  console.log('清空测试库旧数据...');
  // 禁用外键检查
  await dstPool.request().query('EXEC sp_MSforeachtable "ALTER TABLE ? NOCHECK CONSTRAINT ALL"').catch(()=>{});
  for (const t of [...childFirst, ...parentFirst]) {
    try {
      await dstPool.request().query(`DELETE FROM [${t}]`);
      console.log(`  ${t} 已清空`);
    } catch(e) { console.log(`  ${t} 清空: ${e.message}`); }
  }

  console.log('\n按DD_id分页复制...');
  for (const t of ['YM', 'ZM']) {
    try {
      await copyTableById(srcPool, dstPool, t, 'DD_id');
    } catch (e) {
      console.log(`  ✗ ${t}: ${e.message}`);
    }
  }

  // 重新启用外键
  await dstPool.request().query('EXEC sp_MSforeachtable "ALTER TABLE ? CHECK CONSTRAINT ALL"').catch(()=>{});

  console.log('\n验证:');
  for (const t of ['YM', 'ZM', 'YMGX', 'ZMGX']) {
    try {
      const r = await dstPool.request().query(`SELECT COUNT(*) as cnt FROM [${t}]`);
      console.log(`  ${t}: ${r.recordset[0].cnt} 条`);
    } catch(e) { console.log(`  ${t}: ${e.message}`); }
  }

  await sql.close();
  console.log('\n✅ 完成！');
}

fix().catch(e => console.error(e.message));
