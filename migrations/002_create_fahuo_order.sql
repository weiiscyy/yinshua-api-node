-- ===============================================================
-- Migration 002: 发货单与订单关联
-- 创建时间: 2026-04-12
-- ===============================================================

-- 1. 新建关联表
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[FahuoOrder]') AND type in (N'U'))
BEGIN
  CREATE TABLE [dbo].[FahuoOrder](
    [id]            [int] IDENTITY(1,1) NOT NULL,
    [fahuo_id]      [int] NOT NULL,           -- 外键 → FaHuoDan.ID
    [dd_id]         [int] NOT NULL,           -- 外键 → YS/DD_id 等
    [product_type]  [nvarchar](2) NOT NULL,   -- YS / YM / ZM / DS
    [shuliang_sent] [int] NOT NULL DEFAULT 0, -- 本次发货数量
    [proudnumber]   [nvarchar](100) NULL,     -- 品名（冗余存储，订单变更不受影响）
    [kuanhao]       [nvarchar](100) NULL,     -- 款号
    [shuliang_total][int] NULL,               -- 订单总数量（冗余）
    [beizhu]        [nvarchar](200) NULL,      -- 本次发货备注
    [regtime]       [datetime] NULL DEFAULT GETDATE(),
    CONSTRAINT [PK_FahuoOrder] PRIMARY KEY CLUSTERED ( [id] ASC )
  );
  PRINT 'Created FahuoOrder table.';
END
ELSE
  PRINT 'FahuoOrder already exists.';
GO

-- 2. FaHuoDan 新增字段（兼容旧数据 + 支持关联）
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FaHuoDan]') AND name = 'dd_id')
BEGIN
  ALTER TABLE [dbo].[FaHuoDan] ADD [dd_id] [int] NULL;
  PRINT 'Added dd_id to FaHuoDan.';
END
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[FaHuoDan]') AND name = 'product_type')
BEGIN
  ALTER TABLE [dbo].[FaHuoDan] ADD [product_type] [nvarchar](2) NULL;
  PRINT 'Added product_type to FaHuoDan.';
END
GO

-- 3. 4张订单表新增 fahuo_id 字段
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[YS]') AND name = 'fahuo_id')
BEGIN
  ALTER TABLE [dbo].[YS] ADD [fahuo_id] [int] NULL;
  PRINT 'Added fahuo_id to YS.';
END
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[YM]') AND name = 'fahuo_id')
BEGIN
  ALTER TABLE [dbo].[YM] ADD [fahuo_id] [int] NULL;
  PRINT 'Added fahuo_id to YM.';
END
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[ZM]') AND name = 'fahuo_id')
BEGIN
  ALTER TABLE [dbo].[ZM] ADD [fahuo_id] [int] NULL;
  PRINT 'Added fahuo_id to ZM.';
END
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[DS]') AND name = 'fahuo_id')
BEGIN
  ALTER TABLE [dbo].[DS] ADD [fahuo_id] [int] NULL;
  PRINT 'Added fahuo_id to DS.';
END
GO

PRINT 'Migration 002 completed successfully.';
