/**
 * 统一配置中心
 * 所有敏感配置从此处导出，启动时校验
 */

const JWT_SECRET = process.env.JWT_SECRET;

// 启动时强制校验：禁止使用不安全的默认值
if (!JWT_SECRET || JWT_SECRET === 'your-secret-jwt-token' || JWT_SECRET === 'yinshua-secret' || JWT_SECRET === 'fallback-secret') {
  console.error('❌ FATAL: JWT_SECRET 未正确配置！请在 .env 中设置有效的 JWT_SECRET（至少32字符）');
  console.error('   当前值:', JWT_SECRET || '(空)');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET 长度必须至少32字符，当前长度: ' + JWT_SECRET.length);
}

module.exports = { JWT_SECRET };
