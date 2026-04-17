const mssql = require('mssql');

const config = {
  server: process.env.DB_SERVER || '10.147.19.187',
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Admin12345',
  database: process.env.DB_NAME || 'yinshua',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function run() {
  try {
    const pool = await mssql.connect(config);
    console.log('Connected to SQL Server');

    const sql = `
-- 报工记录表
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BaoGongLog]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[BaoGongLog](
    [ID] [int] IDENTITY(1,1) NOT NULL,
    [DD_id] [int] NOT NULL,
    [ProductType] [varchar](2) NOT NULL,
    [GongXuField] [nvarchar](50) NOT NULL,
    [GongXuName] [nvarchar](50) NOT NULL,
    [WorkerID] [varchar](50) NOT NULL,
    [WorkerName] [nvarchar](100) NOT NULL,
    [BaoChanNum] [decimal](18,4) NOT NULL DEFAULT(0),
    [BuLiangNum] [decimal](18,4) NOT NULL DEFAULT(0),
    [BaoGongTime] [datetime] NOT NULL,
    [Remark] [nvarchar](500) NULL,
    [CreatedAt] [datetime] NULL DEFAULT(GETDATE()),
 CONSTRAINT [PK_BaoGongLog] PRIMARY KEY CLUSTERED ([ID] ASC)
)
END
`;

    await pool.request().query(sql);
    console.log('BaoGongLog table created or already exists');

    // Create indexes
    const indexes = [
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BaoGongLog_DD_id')
       CREATE INDEX [IX_BaoGongLog_DD_id] ON [dbo].[BaoGongLog]([DD_id], [ProductType])`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BaoGongLog_Worker')
       CREATE INDEX [IX_BaoGongLog_Worker] ON [dbo].[BaoGongLog]([WorkerID], [BaoGongTime])`
    ];

    for (const idxSql of indexes) {
      await pool.request().query(idxSql);
    }
    console.log('Indexes created');

    // GongXuDefine table
    const gongxuSql = `
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GongXuDefine]') AND type in (N'U'))
BEGIN
CREATE TABLE [dbo].[GongXuDefine](
    [ID] [int] IDENTITY(1,1) NOT NULL,
    [ProductType] [varchar](2) NOT NULL,
    [StepOrder] [int] NOT NULL,
    [GongXuName] [nvarchar](50) NOT NULL,
    [GongXuField] [nvarchar](50) NOT NULL,
    [IsRequired] [bit] DEFAULT(1),
    [StandardTime] [int] NULL,
    [UnitPrice] [decimal](18,4) NULL,
    [IsActive] [bit] DEFAULT(1),
 CONSTRAINT [PK_GongXuDefine] PRIMARY KEY CLUSTERED ([ID] ASC)
)
END
`;
    await pool.request().query(gongxuSql);
    console.log('GongXuDefine table created or already exists');

    // Insert initial data
    const insertData = `
IF NOT EXISTS (SELECT * FROM [dbo].[GongXuDefine] WHERE ProductType = 'YS')
BEGIN
INSERT INTO [dbo].[GongXuDefine] ([ProductType], [StepOrder], [GongXuName], [GongXuField], [IsRequired], [StandardTime])
VALUES
('YS', 1, '接单', 'jhkdd', 1, 10),
('YS', 2, '打印', 'jhkprint', 1, NULL),
('YS', 3, '车间接收', 'sccjjs', 1, NULL),
('YS', 4, '预领料', 'sccjyl', 1, NULL),
('YS', 5, '电脑制版', 'sccjdn', 1, NULL),
('YS', 6, '生产', 'sccjsc', 1, NULL),
('YS', 7, '完成', 'sccjwc', 1, NULL),
('YS', 8, '汇总', 'hzljs', 1, NULL),
('YS', 9, '发货', 'fahuo', 1, NULL)
END
`;
    await pool.request().query(insertData);
    console.log('YS data inserted');

    const ymData = `
IF NOT EXISTS (SELECT * FROM [dbo].[GongXuDefine] WHERE ProductType = 'YM')
BEGIN
INSERT INTO [dbo].[GongXuDefine] ([ProductType], [StepOrder], [GongXuName], [GongXuField], [IsRequired], [StandardTime])
VALUES
('YM', 1, '接单', 'jhkdd', 1, 10),
('YM', 2, '晒版', 'jhkprint', 1, NULL),
('YM', 3, '车间接收', 'sccjjs', 1, NULL),
('YM', 4, '预领料', 'sccjyl', 1, NULL),
('YM', 5, '印刷', 'sccjdn', 1, NULL),
('YM', 6, '生产', 'sccjsc', 1, NULL),
('YM', 7, '打包', 'sccjwc', 1, NULL),
('YM', 8, '汇总', 'hzljs', 1, NULL),
('YM', 9, '发货', 'fahuo', 1, NULL)
END
`;
    await pool.request().query(ymData);
    console.log('YM data inserted');

    const zmData = `
IF NOT EXISTS (SELECT * FROM [dbo].[GongXuDefine] WHERE ProductType = 'ZM')
BEGIN
INSERT INTO [dbo].[GongXuDefine] ([ProductType], [StepOrder], [GongXuName], [GongXuField], [IsRequired], [StandardTime])
VALUES
('ZM', 1, '接单', 'jhkdd', 1, 10),
('ZM', 2, '晒版', 'jhkprint', 1, NULL),
('ZM', 3, '车间接收', 'sccjjs', 1, NULL),
('ZM', 4, '开版', 'sccjyl', 1, NULL),
('ZM', 5, '模切', 'sccjdn', 1, NULL),
('ZM', 6, '糊盒', 'sccjsc', 1, NULL),
('ZM', 7, '完成', 'sccjwc', 1, NULL),
('ZM', 8, '汇总', 'hzljs', 1, NULL),
('ZM', 9, '发货', 'fahuo', 1, NULL)
END
`;
    await pool.request().query(zmData);
    console.log('ZM data inserted');

    const dsData = `
IF NOT EXISTS (SELECT * FROM [dbo].[GongXuDefine] WHERE ProductType = 'DS')
BEGIN
INSERT INTO [dbo].[GongXuDefine] ([ProductType], [StepOrder], [GongXuName], [GongXuField], [IsRequired], [StandardTime])
VALUES
('DS', 1, '接单', 'jhkdd', 1, 10),
('DS', 2, '设计', 'jhkprint', 1, NULL),
('DS', 3, '车间接收', 'sccjjs', 1, NULL),
('DS', 4, '生产', 'sccjsc', 1, NULL),
('DS', 5, '完成', 'sccjwc', 1, NULL),
('DS', 6, '汇总', 'hzljs', 1, NULL),
('DS', 7, '发货', 'fahuo', 1, NULL)
END
`;
    await pool.request().query(dsData);
    console.log('DS data inserted');

    console.log('\n✅ 数据库设置完成！');

    // Verify
    const result = await pool.request().query('SELECT COUNT(*) as cnt FROM BaoGongLog');
    console.log(`BaoGongLog rows: ${result.recordset[0].cnt}`);

    const gongxuResult = await pool.request().query('SELECT * FROM GongXuDefine ORDER BY ProductType, StepOrder');
    console.log('\n工序定义:');
    gongxuResult.recordset.forEach(r => {
      console.log(`  ${r.ProductType} - ${r.StepOrder}. ${r.GongXuName} (${r.GongXuField})`);
    });

    await pool.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
