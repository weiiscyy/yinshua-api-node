/**
 * 统一错误处理 & 通用输入校验中间件
 */

/**
 * 全局错误处理器（放在 app.js 最后作为 error handler）
 * 格式：{ error: '...', detail: '...' }
 */
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack || err.message);

  // 已知业务错误（带 status 的 Error 对象）
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // SQL 错误美化
  if (err.number) {
    if (err.number === 2627) { // UNIQUE VIOLATION
      return res.status(409).json({ error: '数据已存在，重复提交' });
    }
    if (err.number === 547) {  // CHECK VIOLATION
      return res.status(400).json({ error: '数据约束冲突' });
    }
    return res.status(500).json({ error: '数据库错误', detail: err.message });
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token 格式错误' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token 已过期' });
  }

  // 默认
  res.status(500).json({ error: '服务器内部错误', detail: process.env.DEBUG ? err.message : undefined });
}

/**
 * 通用输入校验器工厂
 * 用法：validate({ name: 'string|required|max:100', price: 'number|min:0' })
 *
 * 支持规则（pipe-separated）：
 *   required, optional
 *   string, number, boolean
 *   email, phone, date
 *   min:N, max:N, minLen:N, maxLen:N
 *   regex:pattern
 */
function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    const data = { ...req.body, ...req.query };

    for (const [field, ruleStr] of Object.entries(rules)) {
      const rules = ruleStr.split('|').map(r => r.trim());
      const value = data[field];
      const isMissing = (value === undefined || value === null || value === '');

      for (const rule of rules) {
        if (rule === 'required' && isMissing) {
          errors.push(`字段 [${field}] 不能为空`);
          break;
        }
        if (rule === 'optional') break;

        if (!isMissing) {
          // 类型校验
          if (rule === 'number' && isNaN(Number(value))) {
            errors.push(`字段 [${field}] 必须是数字`);
            break;
          }
          if (rule === 'string' && typeof value !== 'string') {
            errors.push(`字段 [${field}] 必须是字符串`);
            break;
          }
          if (rule === 'boolean' && value !== 'true' && value !== 'false' && typeof value !== 'boolean') {
            errors.push(`字段 [${field}] 必须是布尔值`);
            break;
          }

          // 范围校验
          const minMatch  = rule.match(/^min:(\d+(\.\d+)?)$/);
          const maxMatch  = rule.match(/^max:(\d+(\.\d+)?)$/);
          const minLenM   = rule.match(/^minLen:(\d+)$/);
          const maxLenM   = rule.match(/^maxLen:(\d+)$/);
          const regexM    = rule.match(/^regex:(.+)$/);

          if (minMatch  && Number(value) < Number(minMatch[1])) {
            errors.push(`字段 [${field}] 不能小于 ${minMatch[1]}`); break;
          }
          if (maxMatch  && Number(value) > Number(maxMatch[1])) {
            errors.push(`字段 [${field}] 不能大于 ${maxMatch[1]}`); break;
          }
          if (minLenM   && String(value).length < Number(minLenM[1])) {
            errors.push(`字段 [${field}] 长度不能少于 ${minLenM[1]} 个字符`); break;
          }
          if (maxLenM   && String(value).length > Number(maxLenM[1])) {
            errors.push(`字段 [${field}] 长度不能超过 ${maxLenM[1]} 个字符`); break;
          }
          if (regexM    && !new RegExp(regexM[1]).test(String(value))) {
            errors.push(`字段 [${field}] 格式不正确`); break;
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: '参数校验失败', details: errors });
    }
    next();
  };
}

/**
 * SQL 注入防护：检查字符串字段中是否有可疑字符模式
 * 如需对单个字段做严格检查可在此扩展
 */
function sqlInjectCheck(fields = []) {
  return (req, res, next) => {
    const dangerous = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|EXECUTE|script|javascript:)\b)/i;
    const data = { ...req.body, ...req.query, ...req.params };

    for (const field of fields) {
      const val = data[field];
      if (val && typeof val === 'string' && dangerous.test(val)) {
        return res.status(400).json({ error: `字段 [${field}] 包含可疑内容` });
      }
    }
    next();
  };
}

module.exports = { errorHandler, validate, sqlInjectCheck };
