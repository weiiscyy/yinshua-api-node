const sql = require('mssql');
async function check() {
  const config = { server: '10.147.19.187', port: 1433, user: 'sa', password: 'Admin12345', database: 'yinshua_test', options: { encrypt: false, trustServerCertificate: true } };
  const pool = await sql.connect(config);
  const cols = await pool.request().query(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='YS' AND COLUMN_NAME IN ('ddbh','prouddate','company','yjbhao','shuliang','ywy','zhidan','waifa','BZ','BZBM','ZT','overdate','cpgg','pingshu','fahuodanwei','kuanhao','jiagongfei','danjia','yszj','beizhuYS') ORDER BY ORDINAL_POSITION"
  );
  console.log('YS key columns:');
  cols.recordset.forEach(r => console.log('  ' + r.COLUMN_NAME + ': ' + r.DATA_TYPE + '(' + r.CHARACTER_MAXIMUM_LENGTH + ') ' + (r.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL')));
  await sql.close();
}
check().catch(e => console.error(e.message));
