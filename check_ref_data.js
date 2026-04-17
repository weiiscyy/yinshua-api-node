const sql = require('mssql');
async function check() {
  const config = {
    server: '10.147.19.187', port: 1433, user: 'sa',
    password: 'Admin12345', database: 'yinshua',
    options: { encrypt: false, trustServerCertificate: true }
  };
  await sql.connect(config);
  
  // ywy distinct values
  const ywy = await sql.query("SELECT DISTINCT ywy FROM YS WHERE ywy IS NOT NULL AND ywy <> ''");
  console.log('业务员:', JSON.stringify(ywy.recordset.map(r=>r.ywy)));

  // companies
  const companies = await sql.query("SELECT TOP 10 company FROM YS WHERE company IS NOT NULL AND company <> '' GROUP BY company");
  console.log('公司:', JSON.stringify(companies.recordset.map(r=>r.company)));

  // FaHuoDan structure
  const fh = await sql.query("SELECT TOP 1 * FROM FaHuoDan");
  console.log('FaHuoDan columns:', Object.keys(fh.recordset[0] || {}));

  await sql.close();
}
check().catch(e => console.error(e.message));
