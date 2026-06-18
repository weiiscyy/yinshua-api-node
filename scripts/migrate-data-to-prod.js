/**
 * 数据迁移脚本
 * 功能：把旧库(yinshua)的数据迁移到新库(yinshua_test)
 * 时机：新系统开发完成、准备上线前
 *
 * 用法: node scripts/migrate-data-to-prod.js
 *
 * ⚠️  执行前请：
 * 1. 备份旧库 (yinshua)
 * 2. 备份新库 (yinshua_test)
 * 3. 在测试环境先运行验证
 */

const mssql = require('mssql');
const fs = require('fs');
const path = require('path');

// ====== 数据库配置 ======
const OLD_DB = {
  name: '旧库(yinshua)',
  server: '10.147.19.187',
  port: 1433,
  user: 'sa',
  password: 'Admin12345',
  database: 'yinshua',
  options: { encrypt: false, trustServerCertificate: true, connectionTimeout: 15000 }
};

const NEW_DB = {
  name: '新库(yinshua_test)',
  server: '10.147.19.187',
  port: 1433,
  user: 'sa',
  password: 'Admin12345',
  database: 'yinshua_test',
  options: { encrypt: false, trustServerCertificate: true, connectionTimeout: 15000 }
};

// ====== 忽略的系统表 ======
const SYSTEM_TABLES = [
  'sysdiagrams', 'dtproperties',
  'MSpub_identity_range', 'sysarticles', 'sysarticleupdates',
  'syspublications', 'sysschemaarticles', 'syssubscriptions', 'systranschemas'
];

// ====== 业务表，按迁移顺序排列（考虑外键依赖）======
// 顺序很重要！要先迁主表，再迁子表
const TABLE_ORDER = [
  // 1. 基础参考表（无外键依赖）
  { name: 'HuaHao',      mode: 'replace', comment: '花号表' },
  { name: 'UserInfo',    mode: 'replace', comment: '用户表' },
  { name: 'SalesPerson', mode: 'merge',   comment: '业务员表' },  // 新库可能有开发数据
  { name: 'Company',     mode: 'merge',   comment: '公司表' },     // 新库可能有开发数据
  { name: 'ShippingAddress', mode: 'merge', comment: '收货地址表' },

  // 2. 工序定义（无外键依赖）
  { name: 'GongXuDefine', mode: 'merge', comment: '工序定义表' }, // 新库可能有开发数据

  // 3. 订单主表（有外键依赖 HuaHao/UserInfo）
  { name: 'YS',  mode: 'replace', comment: '印刷订单' },
  { name: 'YM',  mode: 'replace', comment: '印面订单', issue: '⚠️ 新库当前为空，必须迁移' },
  { name: 'ZM',  mode: 'replace', comment: '纸盒订单', issue: '⚠️ 新库当前为空，必须迁移' },
  { name: 'DS',  mode: 'replace', comment: '打色订单' },

  // 4. 订单工序表（依赖主表 YS/YM/ZM/DS）
  { name: 'YSGX', mode: 'replace', comment: '印刷工序' },
  { name: 'YMGX', mode: 'replace', comment: '印面工序', issue: '⚠️ 新库工序数据存在但订单为空，需一起迁' },
  { name: 'ZMGX', mode: 'replace', comment: '纸盒工序', issue: '⚠️ 新库工序数据存在但订单为空，需一起迁' },
  { name: 'DSGX', mode: 'replace', comment: '打色工序' },

  // 5. 报工日志（依赖订单）
  { name: 'BaoGongLog', mode: 'merge', comment: '报工日志', issue: '新库可能有开发测试数据，保留新的' },

  // 6. 发货单（依赖订单）
  { name: 'FaHuoDan', mode: 'merge', comment: '发货单', issue: '⚠️ 新库有83条，旧库77条，开发新增的6条要保留' },
  { name: 'FahuoOrder', mode: 'merge', comment: '发货明细', issue: '新库有10条，旧库无，新开发的功能' },

  // 7. 问题反馈
  { name: 'wenti', mode: 'replace', comment: '问题反馈' },
];

// ====== 辅助函数 ======
async function getTableCount(conn, tableName) {
  try {
    const result = await conn.query(`SELECT COUNT(*) as cnt FROM [dbo].[${tableName}]`);
    return result.recordset[0].cnt;
  } catch {
    return 0;
  }
}

async function getTableColumns(conn, tableName) {
  const result = await conn.query(`
    SELECT c.name, ty.name as type_name, c.max_length, c.is_nullable
    FROM sys.columns c
    JOIN sys.types ty ON c.user_type_id = ty.user_type_id
    WHERE c.object_id = OBJECT_ID('[dbo].[${tableName}]')
    ORDER BY c.column_id
  `);
  return result.recordset;
}

async function checkTableExists(conn, tableName) {
  const result = await conn.query(`
    SELECT COUNT(*) as cnt FROM sys.tables
    WHERE name = '${tableName}' AND is_ms_shipped = 0
  `);
  return result.recordset[0].cnt > 0;
}

// ====== 迁移策略函数 ======

/**
 * replace 模式：清空新库表，从旧库导入全部数据
 */
async function modeReplace(srcPool, dstPool, tableName, log) {
  const exists = await checkTableExists(dstPool, tableName);
  if (!exists) {
    log(`  ⏭️  表 ${tableName} 在新库不存在，跳过`);
    return;
  }

  const columns = await getTableColumns(dstPool, tableName);
  const colNames = columns.map(c => `[${c.name}]`).join(', ');
  const colList = columns.map(c => c.name);

  // 1. 记录新库当前数量
  const dstBefore = await getTableCount(dstPool, tableName);

  // 2. 获取旧库数据
  const srcData = await srcPool.query(`SELECT ${colNames} FROM [dbo].[${tableName}]`);
  const srcCount = srcData.recordset.length;

  // 3. 清空新库
  await dstPool.query(`DELETE FROM [dbo].[${tableName}]`);

  // 4. 批量插入旧库数据
  if (srcData.recordset.length > 0) {
    const batchSize = 1000;
    let inserted = 0;
    for (let i = 0; i < srcData.recordset.length; i += batchSize) {
      const batch = srcData.recordset.slice(i, i + batchSize);
      const values = batch.map(row => {
        return '(' + colList.map(col => {
          const val = row[col];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          return val;
        }).join(', ') + ')';
      }).join(', ');

      await dstPool.query(`INSERT INTO [dbo].[${tableName}] (${colNames}) VALUES ${values}`);
      inserted += batch.length;
      log(`  📤 插入 ${inserted}/${srcCount}...`);
    }
  }

  const dstAfter = await getTableCount(dstPool, tableName);
  log(`  ✅ ${tableName}: 旧库 ${srcCount} 条 → 新库 ${dstBefore} 条清空 → ${dstAfter} 条`);
}

/**
 * merge 模式：保留新库数据，追加旧库不存在的记录（按主键判断）
 */
async function modeMerge(srcPool, dstPool, tableName, log) {
  const exists = await checkTableExists(dstPool, tableName);
  if (!exists) {
    log(`  ⏭️  表 ${tableName} 在新库不存在，跳过`);
    return;
  }

  // 获取主键列
  const pkResult = await dstPool.query(`
    SELECT c.name
    FROM sys.indexes i
    JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
    WHERE i.object_id = OBJECT_ID('[dbo].[${tableName}]') AND i.is_primary_key = 1
  `);
  const pkCols = pkResult.recordset.map(r => r.name);

  // 获取所有列
  const columns = await getTableColumns(dstPool, tableName);
  const colNames = columns.map(c => `[${c.name}]`).join(', ');
  const colList = columns.map(c => c.name);

  const dstBefore = await getTableCount(dstPool, tableName);

  // 从旧库获取数据
  const srcData = await srcPool.query(`SELECT ${colNames} FROM [dbo].[${tableName}]`);

  if (pkCols.length === 0) {
    log(`  ⚠️  表 ${tableName} 没有主键，无法 merge，跳过`);
    return;
  }

  // 逐条检查：如果新库没有（按主键判断），则插入
  let merged = 0;
  for (const row of srcData.recordset) {
    const pkCond = pkCols.map(c => {
      const val = row[c];
      if (val === null) return `[${c}] IS NULL`;
      if (typeof val === 'string') return `[${c}] = '${val.replace(/'/g, "''")}'`;
      return `[${c}] = ${val}`;
    }).join(' AND ');

    const exists = await dstPool.query(`SELECT COUNT(*) as cnt FROM [dbo].[${tableName}] WHERE ${pkCond}`);
    if (exists.recordset[0].cnt === 0) {
      const vals = colList.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
        if (val instanceof Date) return `'${val.toISOString()}'`;
        return val;
      }).join(', ');

      await dstPool.query(`INSERT INTO [dbo].[${tableName}] (${colNames}) VALUES (${vals})`);
      merged++;
    }
  }

  const dstAfter = await getTableCount(dstPool, tableName);
  log(`  ✅ ${tableName}: 旧库 ${srcData.recordset.length} 条，新增 ${merged} 条，新库 ${dstBefore}→${dstAfter} 条`);
}

// ====== 主迁移流程 ======
async function migrate() {
  console.log('========================================');
  console.log('🚀 数据迁移脚本启动');
  console.log('  旧库: ' + OLD_DB.server + '/' + OLD_DB.database);
  console.log('  新库: ' + NEW_DB.server + '/' + NEW_DB.database);
  console.log('========================================\n');

  let oldPool, newPool;
  const results = [];

  const log = (msg) => {
    console.log(msg);
    results.push(msg);
  };

  try {
    // 1. 连接数据库
    console.log('📡 连接旧库...');
    oldPool = await mssql.connect(OLD_DB);
    log('  ✅ 旧库连接成功\n');

    console.log('📡 连接新库...');
    newPool = await mssql.connect(NEW_DB);
    log('  ✅ 新库连接成功\n');

    // 2. 显示当前数据概览
    console.log('📊 迁移前数据概览:\n');
    log('【旧库】');
    for (const t of TABLE_ORDER) {
      if (SYSTEM_TABLES.includes(t.name)) continue;
      const cnt = await getTableCount(oldPool, t.name);
      log(`  ${t.name}: ${cnt} 条`);
    }
    log('\n【新库】');
    for (const t of TABLE_ORDER) {
      if (SYSTEM_TABLES.includes(t.name)) continue;
      const cnt = await getTableCount(newPool, t.name);
      log(`  ${t.name}: ${cnt} 条`);
    }
    console.log('');

    // 3. 确认操作
    console.log('⚠️  即将执行以下迁移策略:\n');
    for (const t of TABLE_ORDER) {
      if (SYSTEM_TABLES.includes(t.name)) continue;
      const mode = t.mode === 'replace' ? '🗑️  清空后重写' : '➕ 合并追加';
      const issue = t.issue ? ` (${t.issue})` : '';
      console.log(`  ${mode}  ${t.name} - ${t.comment}${issue}`);
    }

    console.log('\n========================================');
    console.log('⚠️  确认要开始迁移吗？');
    console.log('  - replace 模式会清空新库相关表');
    console.log('  - 请确保已备份两个数据库');
    console.log('  - 按 Ctrl+C 取消，或等待 5 秒后自动开始...');
    console.log('========================================\n');

    // 等待5秒让用户取消
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. 开始迁移
    console.log('\n========================================');
    console.log('🔄 开始迁移...\n');
    log('\n========================================');
    log('🔄 开始迁移...');

    for (const t of TABLE_ORDER) {
      if (SYSTEM_TABLES.includes(t.name)) continue;

      console.log(`\n📦 ${t.name} (${t.mode}) - ${t.comment}`);
      log(`\n📦 ${t.name} (${t.mode})`);

      if (t.mode === 'replace') {
        await modeReplace(oldPool, newPool, t.name, log);
      } else {
        await modeMerge(oldPool, newPool, t.name, log);
      }
    }

    // 5. 迁移后验证
    console.log('\n========================================');
    console.log('📊 迁移后数据验证:\n');
    log('\n========================================');
    log('📊 迁移后数据验证:');

    for (const t of TABLE_ORDER) {
      if (SYSTEM_TABLES.includes(t.name)) continue;
      const oldCnt = await getTableCount(oldPool, t.name);
      const newCnt = await getTableCount(newPool, t.name);
      const status = oldCnt === newCnt ? '✅' : '⚠️ ';
      console.log(`  ${status} ${t.name}: 旧库 ${oldCnt} → 新库 ${newCnt}`);
      log(`  ${status} ${t.name}: 旧库 ${oldCnt} → 新库 ${newCnt}`);
    }

    console.log('\n========================================');
    console.log('✅ 迁移完成！');
    console.log('========================================\n');
    log('\n========================================');
    log('✅ 迁移完成！');
    log('========================================');

    // 6. 保存日志
    const logPath = path.join(__dirname, '../logs/migration-' + Date.now() + '.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, results.join('\n'), 'utf8');
    console.log(`📄 迁移日志已保存: ${logPath}`);

  } catch (err) {
    console.error('\n❌ 迁移失败:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    if (oldPool) await oldPool.close();
    if (newPool) await newPool.close();
    console.log('🔌 数据库连接已关闭');
  }
}

migrate();
