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

  // 查找 id 列上的依赖
  console.log('=== 查找 id 列依赖 ===');
  const deps = await pool.request().query(`
    SELECT f.name, f.type_desc
    FROM sys.foreign_keys f
    JOIN sys.foreign_key_columns fc ON f.object_id = fc.constraint_object_id
    JOIN sys.columns c ON fc.parent_column_id = c.column_id AND fc.parent_object_id = c.object_id
    WHERE c.object_id = OBJECT_ID('SalesPerson') AND c.name = 'id'
  `);
  console.log('Dependencies:', JSON.stringify(deps.recordset));

  // 查看 SalesPerson 上的索引
  const idxs = await pool.request().query(`
    SELECT i.name, i.type_desc, i.is_primary_key
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('SalesPerson')
  `);
  console.log('Indexes:', JSON.stringify(idxs.recordset));

  await sql.close();
}

fix().catch(e => console.error('Error:', e.message));
