const mssql = require('mssql');

const config = {
  server: '10.147.19.81',
  port: 1433,
  user: 'sa',
  password: '1Zhihama!@',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function test() {
  console.log('正在连接 10.147.19.81 ...');
  try {
    const pool = await mssql.connect(config);
    console.log('连接成功！');

    // 查询数据库名称
    const result = await pool.query("SELECT name FROM sys.databases");
    console.log('数据库列表:', result.recordset.map(r => r.name).join(', '));

    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('连接失败:', err.message);
    process.exit(1);
  }
}

test();
