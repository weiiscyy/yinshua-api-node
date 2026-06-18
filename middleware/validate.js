/**
 * 轻量级输入校验中间件
 * 用法: validate({ name: 'string|required', age: 'number|optional' })
 */

const types = {
  string: v => typeof v === 'string',
  number: v => typeof v === 'number' || !isNaN(parseFloat(v)),
  boolean: v => typeof v === 'boolean' || v === 'true' || v === 'false',
  array: v => Array.isArray(v),
  object: v => v && typeof v === 'object' && !Array.isArray(v),
};

function parseRule(rule) {
  const parts = rule.split('|');
  const result = { required: false, type: 'string' };
  for (const p of parts) {
    if (p === 'required') result.required = true;
    else if (types[p]) result.type = p;
  }
  return result;
}

function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    const data = { ...req.body, ...req.query, ...req.params };

    for (const [field, rule] of Object.entries(schema)) {
      const { required, type } = parseRule(rule);
      const value = data[field];

      if (value === undefined || value === null || value === '') {
        if (required) errors.push(`字段 "${field}" 不能为空`);
        continue;
      }

      if (!types[type](value)) {
        errors.push(`字段 "${field}" 类型错误，期望 ${type}，实际 ${typeof value}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: '参数校验失败', details: errors });
    }

    next();
  };
}

module.exports = { validate };