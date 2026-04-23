/**
 * 统一认证 & 权限中间件
 * 所有路由应引用此文件，而非各自定义
 */

// ✅ 认证中间件：检查 JWT token
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权，缺少 Token' });
  }
  const token = authHeader.slice(7);
  try {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../config');
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

// ✅ 部门权限中间件工厂：检查用户所属部门
// 用法：requireDept('A', 'S') 返回一个中间件函数
function requireDept(...depts) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    const userDept = req.user.dept || req.user.bm || '';
    // dept 可能是逗号分隔的字符串，如 "A,S"
    const userDepts = userDept.split(',').map(d => d.trim());
    const hasPermission = depts.some(d => userDepts.includes(d));
    if (!hasPermission) {
      return res.status(403).json({ error: `需要部门权限: ${depts.join(' 或 ')}` });
    }
    next();
  };
}

module.exports = { authMiddleware, requireDept };
