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

  await sql.connect(config);

  // 建表
  await sql.query(`
    IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserInfo]') AND type in (N'U'))
    CREATE TABLE UserInfo (
      UserID     SMALLINT     PRIMARY KEY,
      UserName   NVARCHAR(50),
      PassWord   NVARCHAR(100),
      Department NVARCHAR(50),
      Dep_cj     NVARCHAR(50),
      IsDel      BIT          DEFAULT 0
    )
  `);
  console.log('UserInfo table created');

  // 插入 admin 用户 (密码: 123456, MD5哈希: 49ba59abbe56e057)
  await sql.query(`
    IF NOT EXISTS (SELECT * FROM UserInfo WHERE UserID = 23)
    INSERT INTO UserInfo (UserID, UserName, PassWord, Department, Dep_cj, IsDel)
    VALUES (23, 'admin', '49ba59abbe56e057', 'S', 'S', 0)
  `);
  console.log('admin user inserted');

  await sql.close();
  console.log('Done');
}

setup().catch(e => console.error(e.message));
