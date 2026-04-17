/**
 * 审计日志中间件
 * 自动记录所有写操作（POST/PUT/PATCH/DELETE）到 audit_log 表
 */
const { query } = require('../config/db');

// 确保 audit_log 表存在（幂等创建）
async function ensureAuditTable() {
  const sql = `
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'audit_log' AND xtype = 'U')
    BEGIN
      CREATE TABLE audit_log (
        id          BIGINT IDENTITY(1,1) PRIMARY KEY,
        created_at  DATETIME2 DEFAULT GETDATE(),
        user_id     NVARCHAR(50),
        username    NVARCHAR(100),
        dept        NVARCHAR(50),
        method      NVARCHAR(10),
        path        NVARCHAR(500),
        action      NVARCHAR(200),
        detail      NVARCHAR(MAX),
        ip          NVARCHAR(50),
        status      INT
      )
    END
  `;
  try {
    await query(sql);
  } catch (err) {
    console.error('[Audit] 建表失败（可能已存在）:', err.message);
  }
}
// 启动时建表
ensureAuditTable();

// ✅ 审计日志中间件：拦截所有写操作，记录到数据库
function auditLog(action) {
  return async (req, res, next) => {
    const user = req.user || {};
    const logEntry = {
      user_id:  user.id  || user.uid || '',
      username: user.name || user.yhmc || '',
      dept:     user.dept || user.bm  || '',
      method:   req.method,
      path:     req.originalUrl,
      action:   action || `${req.method} ${req.originalUrl}`,
      detail:   JSON.stringify(req.body).slice(0, 2000), // 最多2000字符
      ip:       req.ip || req.connection.remoteAddress || '',
      status:   0
    };

    // 用 then 避免阻塞主流程
    query(
      `INSERT INTO audit_log (user_id, username, dept, method, path, action, detail, ip, status)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8)`,
      [logEntry.user_id, logEntry.username, logEntry.dept, logEntry.method,
       logEntry.path, logEntry.action, logEntry.detail, logEntry.ip, logEntry.status]
    ).catch(err => console.error('[Audit] 写入失败:', err.message));

    next();
  };
}

module.exports = { auditLog };
