/**
 * 数据库 Schema 比对工具
 * 用途：比对测试库(yinshua_test) 和 生产库(yinshua) 的结构差异
 *       生成迁移 SQL 脚本，应用于生产库
 *
 * 用法: node scripts/compare-db-schema.js
 */

const mssql = require('mssql');

// ====== 数据库配置 ======
const TEST_DB = {
  server: '10.147.19.187',
  port: 1433,
  user: 'sa',
  password: 'Admin12345',
  database: 'yinshua_test',   // 新系统开发库
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectionTimeout: 15000 }
};

const PROD_DB = {
  server: '10.147.19.187',
  port: 1433,
  user: 'sa',
  password: 'Admin12345',
  database: 'yinshua',         // 旧系统库（生产）
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectionTimeout: 15000 }
};

// ====== 忽略的表（比如测试库独有的临时表） ======
const IGNORE_TABLES = [
  'sysdiagrams',
  'TraceEvent',
  'BAK',
  // 加更多你想忽略的表
];

// ====== SQL：获取所有表和字段信息 ======
const GET_SCHEMA_SQL = `
SELECT
  t.name AS table_name,
  c.name AS column_name,
  ty.name AS data_type,
  c.max_length,
  c.precision,
  c.scale,
  c.is_nullable,
  c.is_identity,
  kcu.column_name AS pk_column
FROM sys.tables t
INNER JOIN sys.columns c ON t.object_id = c.object_id
INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
LEFT JOIN sys.indexes i ON t.object_id = i.object_id AND i.is_primary_key = 1
LEFT JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id AND ic.column_id = c.column_id
LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
  ON kcu.TABLE_NAME = t.name AND kcu.COLUMN_NAME = c.name AND kcu.CONSTRAINT_NAME LIKE 'PK%'
WHERE t.is_ms_shipped = 0
ORDER BY t.name, c.column_id;
`;

// ====== SQL：获取所有索引 ======
const GET_INDEXES_SQL = `
SELECT
  t.name AS table_name,
  i.name AS index_name,
  i.is_unique,
  i.is_primary_key,
  ic.key_ordinal,
  c.name AS column_name
FROM sys.tables t
INNER JOIN sys.indexes i ON t.object_id = i.object_id
INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE t.is_ms_shipped = 0 AND i.type > 0
ORDER BY t.name, i.name, ic.key_ordinal;
`;

// ====== SQL：获取所有外键 ======
const GET_FOREIGN_KEYS_SQL = `
SELECT
  fk.name AS fk_name,
  tp.name AS parent_table,
  cp.name AS parent_column,
  tr.name AS ref_table,
  cr.name AS ref_column
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.tables tp ON fkc.parent_object_id = tp.object_id
INNER JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id
INNER JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id
INNER JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id
WHERE tp.is_ms_shipped = 0 AND tr.is_ms_shipped = 0;
`;

// ====== 辅助函数 ======
function mapDataType(type, maxLength, precision, scale) {
  switch (type) {
    case 'nvarchar': return maxLength === -1 ? 'NVARCHAR(MAX)' : `NVARCHAR(${maxLength / 2})`;
    case 'varchar':  return maxLength === -1 ? 'VARCHAR(MAX)' : `VARCHAR(${maxLength})`;
    case 'nchar':    return `NCHAR(${maxLength / 2})`;
    case 'char':     return `CHAR(${maxLength})`;
    case 'decimal':  return `DECIMAL(${precision},${scale})`;
    default:         return type.toUpperCase();
  }
}

function isTestOnly(db, tableName) {
  return IGNORE_TABLES.includes(tableName);
}

// ====== 主流程 ======
async function compareSchemas() {
  console.log('🔍 开始比对数据库结构...\n');
  console.log(`  测试库: ${TEST_DB.server}/${TEST_DB.database}`);
  console.log(`  生产库: ${PROD_DB.server}/${PROD_DB.database}\n`);

  let testPool, prodPool;

  try {
    // 连接两个库
    console.log('📡 连接测试库...');
    testPool = await mssql.connect(TEST_DB);
    console.log('  ✅ 测试库连接成功\n');

    console.log('📡 连接旧库(yinshua)...');
    prodPool = await mssql.connect(PROD_DB);
    console.log('  ✅ 生产库连接成功\n');

    // 获取 Schema
    console.log('📋 获取测试库 Schema...');
    const testSchema = await testPool.query(GET_SCHEMA_SQL);
    console.log('📋 获取生产库 Schema...');
    const prodSchema = await prodPool.query(GET_SCHEMA_SQL);

    console.log('📋 获取索引信息...');
    const testIndexes = await testPool.query(GET_INDEXES_SQL);
    const prodIndexes = await prodPool.query(GET_INDEXES_SQL);

    console.log('📋 获取外键信息...');
    const testFKs = await testPool.query(GET_FOREIGN_KEYS_SQL);
    const prodFKs = await prodPool.query(GET_FOREIGN_KEYS_SQL);

    // 整理数据
    const testTables = {};
    testSchema.recordset.forEach(row => {
      if (isTestOnly(TEST_DB, row.table_name)) return;
      if (!testTables[row.table_name]) testTables[row.table_name] = { columns: {}, pk: null };
      testTables[row.table_name].columns[row.column_name] = {
        dataType: mapDataType(row.data_type, row.max_length, row.precision, row.scale),
        isNullable: row.is_nullable === 1,
        isIdentity: row.is_identity === 1,
        defaultValue: row.column_default
      };
      if (row.pk_column === row.column_name) {
        testTables[row.table_name].pk = row.column_name;
      }
    });

    const prodTables = {};
    prodSchema.recordset.forEach(row => {
      if (!prodTables[row.table_name]) prodTables[row.table_name] = { columns: {}, pk: null };
      prodTables[row.table_name].columns[row.column_name] = {
        dataType: mapDataType(row.data_type, row.max_length, row.precision, row.scale),
        isNullable: row.is_nullable === 1,
        isIdentity: row.is_identity === 1,
        defaultValue: row.column_default
      };
      if (row.pk_column === row.column_name) {
        prodTables[row.table_name].pk = row.column_name;
      }
    });

    // 比对：测试库有，生产库没有的表
    const tablesOnlyInTest = Object.keys(testTables).filter(t => !prodTables[t]);
    // 比对：测试库有，生产库也有的表，但字段不同
    const columnsDiff = [];

    Object.keys(testTables).forEach(table => {
      if (!prodTables[table]) return;
      const testCols = testTables[table].columns;
      const prodCols = prodTables[table].columns;

      Object.keys(testCols).forEach(col => {
        if (!prodCols[col]) {
          columnsDiff.push({ table, column: col, testDef: testCols[col], action: 'ADD' });
        } else if (testCols[col].dataType !== prodCols[col].dataType || 
                   testCols[col].isNullable !== prodCols[col].isNullable) {
          columnsDiff.push({ table, column: col, testDef: testCols[col], prodDef: prodCols[col], action: 'ALTER' });
        }
      });
    });

    // 比对：索引差异
    const testIndexMap = {};
    testIndexes.recordset.forEach(idx => {
      if (!testIndexMap[idx.table_name]) testIndexMap[idx.table_name] = {};
      if (!testIndexMap[idx.table_name][idx.index_name]) {
        testIndexMap[idx.table_name][idx.index_name] = { ...idx, columns: idx.column_name };
      } else {
        testIndexMap[idx.table_name][idx.index_name].columns += ', ' + idx.column_name;
      }
    });
    const prodIndexMap = {};
    prodIndexes.recordset.forEach(idx => {
      if (!prodIndexMap[idx.table_name]) prodIndexMap[idx.table_name] = {};
      if (!prodIndexMap[idx.table_name][idx.index_name]) {
        prodIndexMap[idx.table_name][idx.index_name] = { ...idx, columns: idx.column_name };
      } else {
        prodIndexMap[idx.table_name][idx.index_name].columns += ', ' + idx.column_name;
      }
    });

    const indexesOnlyInTest = [];
    Object.keys(testIndexMap).forEach(table => {
      if (!prodIndexMap[table]) return;
      Object.keys(testIndexMap[table]).forEach(idxName => {
        if (!prodIndexMap[table][idxName]) {
          indexesOnlyInTest.push({ table, index: testIndexMap[table][idxName] });
        }
      });
    });

    // ====== 生成迁移 SQL ======
    let migrationSQL = '';
    migrationSQL += `-- ===============================================================
-- 数据库结构迁移脚本
-- 生成时间: ${new Date().toLocaleString('zh-CN')}
-- 来源: ${TEST_DB.server}/${TEST_DB.database}（新库）
-- 目标: ${PROD_DB.server}/${PROD_DB.database}（旧库）
-- ===============================================================
-- ⚠️  执行前请：
-- 1. 备份旧库数据库
-- 2. 在测试库验证脚本正确性
-- ===============================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '========================================';
PRINT '开始数据库结构迁移';
PRINT '========================================';

`;

    // 新增表
    if (tablesOnlyInTest.length > 0) {
      migrationSQL += `\n-- >>>>> 新增的表 (${tablesOnlyInTest.length} 个) <<<<<\n\n`;
      tablesOnlyInTest.forEach(table => {
        migrationSQL += `-- ---- 表: ${table} ----\n`;
        migrationSQL += `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[${table}]') AND type in (N'U'))\nBEGIN\n  CREATE TABLE [dbo].[${table}](...);  -- TODO: 请从测试库导出完整建表语句\n  PRINT '✅ 创建表 ${table}';\nEND\nELSE\n  PRINT '⚠️  表 ${table} 已存在，跳过';\nGO\n\n`;
      });
    }

    // 新增/修改字段
    if (columnsDiff.length > 0) {
      migrationSQL += `\n-- >>>>> 字段变更 (${columnsDiff.length} 处) <<<<<\n\n`;
      columnsDiff.forEach(diff => {
        if (diff.action === 'ADD') {
          migrationSQL += `-- 表 [${diff.table}] 新增字段 [${diff.column}]\n`;
          migrationSQL += `IF NOT EXISTS (SELECT * FROM sys.columns WHERE OBJECT_ID = OBJECT_ID(N'[dbo].[${diff.table}]') AND name = '${diff.column}')\nBEGIN\n  ALTER TABLE [dbo].[${diff.table}] ADD [${diff.column}] ${diff.testDef.dataType}${diff.testDef.isNullable ? ' NULL' : ' NOT NULL'};\n  PRINT '✅ ${diff.table}.${diff.column} 字段添加成功';\nEND\nELSE\n  PRINT '⚠️  ${diff.table}.${diff.column} 已存在，跳过';\nGO\n\n`;
        } else if (diff.action === 'ALTER') {
          migrationSQL += `-- ⚠️  表 [${diff.table}] 字段 [${diff.column}] 类型变更\n`;
          migrationSQL += `--    生产库: ${diff.prodDef.dataType} ${diff.prodDef.isNullable ? 'NULL' : 'NOT NULL'}\n`;
          migrationSQL += `--    测试库: ${diff.testDef.dataType} ${diff.testDef.isNullable ? 'NULL' : 'NOT NULL'}\n`;
          migrationSQL += `-- 请手动评估是否需要修改\n`;
          migrationSQL += `-- ALTER TABLE [dbo].[${diff.table}] ALTER COLUMN [${diff.column}] ${diff.testDef.dataType}${diff.testDef.isNullable ? ' NULL' : ' NOT NULL'};\nGO\n\n`;
        }
      });
    }

    // 新增索引
    if (indexesOnlyInTest.length > 0) {
      migrationSQL += `\n-- >>>>> 新增索引 (${indexesOnlyInTest.length} 个) <<<<<\n\n`;
      indexesOnlyInTest.forEach(({ table, index }) => {
        migrationSQL += `-- 表 [${table}] 索引 [${index.index_name}]\n`;
        const uniqueStr = index.is_unique ? 'UNIQUE ' : '';
        const pkStr = index.is_primary_key ? 'PRIMARY KEY' : uniqueStr;
        migrationSQL += `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${index.index_name}' AND object_id = OBJECT_ID(N'[dbo].[${table}]'))\nBEGIN\n  CREATE ${pkStr} INDEX [${index.index_name}] ON [dbo].[${table}] (${index.columns});\n  PRINT '✅ ${table}.${index.index_name} 索引创建成功';\nEND\nGO\n\n`;
      });
    }

    // 结尾
    migrationSQL += `PRINT '========================================';
PRINT '数据库结构迁移完成';
PRINT '========================================';

COMMIT TRANSACTION;
`;

    // 输出结果
  console.log('\n========== 比对结果 ==========\n');
  console.log(`📊 新库(yinshua_test)表数量: ${Object.keys(testTables).length}`);
  console.log(`📊 旧库(yinshua)表数量: ${Object.keys(prodTables).length}`);
    console.log(`🆕 仅在新库的表: ${tablesOnlyInTest.length} 个`);
    console.log(`🔄 字段差异: ${columnsDiff.length} 处`);
    console.log(`📇 仅在新库的索引: ${indexesOnlyInTest.length} 个\n`);

    if (tablesOnlyInTest.length > 0) {
      console.log('🆕 仅在新库的表:');
      tablesOnlyInTest.forEach(t => console.log(`   - ${t}`));
      console.log();
    }

    if (columnsDiff.length > 0) {
      console.log('🔄 字段差异:');
      columnsDiff.slice(0, 30).forEach(d => {
        console.log(`   - ${d.table}.${d.column} [${d.action}] ${d.testDef.dataType}`);
      });
      if (columnsDiff.length > 30) console.log(`   ... 还有 ${columnsDiff.length - 30} 处差异`);
      console.log();
    }

    // 保存迁移脚本
    const fs = require('fs');
    const path = require('path');
    const migrationPath = path.join(__dirname, '../migrations/003_sync_test_to_prod.sql');
    fs.writeFileSync(migrationPath, migrationSQL, 'utf8');
    console.log(`💾 迁移脚本已保存: ${migrationPath}`);

    // 同时打印到控制台
    console.log('\n========== 迁移 SQL 内容 ==========\n');
    console.log(migrationSQL);

  } catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  } finally {
    if (testPool) await testPool.close();
    if (prodPool) await prodPool.close();
    console.log('\n🔌 数据库连接已关闭');
  }
}

compareSchemas();
