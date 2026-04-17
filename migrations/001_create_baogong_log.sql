-- Migration 001: 创建报工日志表（BaoGongLog）
-- 生产库首次部署需要执行此 SQL
-- 用途：记录每个订单每道工序的报工明细，含颜色和不良原因
-- 执行前请备份数据库

-- ================================================================
-- 1. 创建 BaoGongLog 表（如果不存在）
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BaoGongLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[BaoGongLog] (
        [ID]            INT IDENTITY(1,1) NOT NULL,
        [DD_id]         INT                NOT NULL,           -- 订单ID
        [ProductType]   NVARCHAR(10)       NOT NULL,           -- 产品线 YS/YM/ZM/DS
        [GongXuField]   NVARCHAR(50)       NOT NULL,           -- 工序字段名（如 jhkddClass, sccjsc）
        [GongXuName]    NVARCHAR(50)       NOT NULL,           -- 工序显示名（如 接单, 生产）
        [GongXuColor]   NVARCHAR(20)       NULL,               -- 颜色标识（例：色1/色2/.../UV）
        [BaoChanNum]    DECIMAL(18,4)      NOT NULL DEFAULT 0, -- 报产数量
        [BuLiangNum]   DECIMAL(18,4)      NOT NULL DEFAULT 0, -- 不良数量
        [BuLiangReason] NVARCHAR(200)     NULL,               -- 不良原因（从预设列表选择）
        [WorkerID]      NVARCHAR(50)       NULL,               -- 报工人工号
        [WorkerName]    NVARCHAR(50)       NULL,               -- 报工工人姓名
        [BaoGongTime]  DATETIME           NOT NULL DEFAULT GETDATE(), -- 报工时间
        [Remark]        NVARCHAR(500)      NULL,               -- 备注
        [CreatedAt]     DATETIME           NOT NULL DEFAULT GETDATE(), -- 记录创建时间

        CONSTRAINT [PK_BaoGongLog] PRIMARY KEY CLUSTERED ([ID] ASC)
    );

    -- 索引：按订单+工序查询
    CREATE NONCLUSTERED INDEX [IX_BaoGongLog_DD_ProductType]
        ON [dbo].[BaoGongLog] ([DD_id] ASC, [ProductType] ASC, [GongXuField] ASC)
        WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF);

    -- 索引：按工人+日期查询
    CREATE NONCLUSTERED INDEX [IX_BaoGongLog_Worker_Time]
        ON [dbo].[BaoGongLog] ([WorkerID] ASC, [BaoGongTime] ASC)
        WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF);

    PRINT '✅ BaoGongLog 表创建成功';
END
ELSE
BEGIN
    PRINT '⚠️  BaoGongLog 表已存在，跳过创建';

    -- 即使表已存在，也检查并添加新增字段（向后兼容）
    -- 新增字段：GongXuColor（颜色）、BuLiangReason（不良原因）

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE OBJECT_ID = OBJECT_ID(N'[dbo].[BaoGongLog]') AND name = 'GongXuColor')
    BEGIN
        ALTER TABLE [dbo].[BaoGongLog] ADD [GongXuColor] NVARCHAR(20) NULL;
        PRINT '✅ 已添加字段 GongXuColor';
    END

    IF NOT EXISTS (SELECT * FROM sys.columns WHERE OBJECT_ID = OBJECT_ID(N'[dbo].[BaoGongLog]') AND name = 'BuLiangReason')
    BEGIN
        ALTER TABLE [dbo].[BaoGongLog] ADD [BuLiangReason] NVARCHAR(200) NULL;
        PRINT '✅ 已添加字段 BuLiangReason';
    END
END
GO

PRINT '========================================';
PRINT ' Migration 001 完成';
PRINT ' 新增字段：GongXuColor（颜色）、BuLiangReason（不良原因）';
PRINT '========================================';
GO
