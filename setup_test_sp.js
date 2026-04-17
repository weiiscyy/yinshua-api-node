const sql = require('mssql');

async function setup() {
  const config = {
    server: '10.147.19.187',
    port: 1433,
    user: 'sa',
    password: 'Admin12345',
    database: 'yinshua_test',
    options: { encrypt: false, trustServerCertificate: true }
  };

  const pool = await sql.connect(config);

  // 插入测试业务员
  const testSalespersons = [
    { id: 57, name: '肖凤' },
    { id: 79, name: '汪成香' },
    { id: 148, name: '汪成梅' },
    { id: 161, name: '李敏' },
    { id: 246, name: '廖莉君' },
  ];

  for (const sp of testSalespersons) {
    await pool.request()
      .input('id', sp.id)
      .input('name', sp.name)
      .query("IF NOT EXISTS (SELECT * FROM SalesPerson WHERE id = @id) INSERT INTO SalesPerson (id, name) VALUES (@id, @name)");
  }
  console.log('业务员插入完成:', testSalespersons.length);

  // 插入测试公司
  const testCompanies = [
    { name: '美特斯邦威', address: '上海市浦东新区', contact: '张经理', phone: '021-12345678' },
    { name: '汇鸿集团', address: '江苏省南京市', contact: '李经理', phone: '025-87654321' },
    { name: 'DKC服饰', address: '浙江省杭州市', contact: '王经理', phone: '0571-11223344' },
  ];

  for (const c of testCompanies) {
    await pool.request()
      .input('name', c.name)
      .input('address', c.address)
      .input('contact', c.contact)
      .input('phone', c.phone)
      .query("INSERT INTO Company (name, address, contact, phone) VALUES (@name, @address, @contact, @phone)");
  }
  console.log('公司插入完成:', testCompanies.length);

  await pool.close();
  console.log('Done');
}

setup().catch(e => console.error(e.message));
