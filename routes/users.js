const express = require('express');
const crypto = require('crypto');
const db = require('../config/db');
const { authMiddleware, requireDept } = require('../middleware/auth');
const { validate, errorHandler } = require('../middleware/common');

const router = express.Router();

// ASP MD5截断格式（兼容旧系统密码存储）
function aspMd5(str) {
  const hash = crypto.createHash('md5').update(str).digest();
  return hash.slice(4, 8).toString('hex') + hash.slice(8, 12).toString('hex');
}

// 部门选项
const DEPT_OPTIONS = [
  { value: 'A', label: '销售部(正式)' },
  { value: 'A2', label: '销售部(试用)' },
  { value: 'A3', label: '销售部(删除)' },
  { value: 'C1', label: '车间主任' },
  { value: 'C2', label: '车间副主任' },
  { value: 'D', label: '发货' },
  { value: 'E', label: '业务员' },
  { value: 'F', label: '财务' },
  { value: 'M', label: '面料' },
  { value: 'S', label: '系统管理员' },
];

// 车间选项（C1/C2 专属）
const Cj_OPTIONS = [
  { value: '1', label: '织造' },
  { value: '2', label: '印刷刷' },
  { value: '3', label: '喷印' },
  { value: '4', label: '丝印' },
];

// 部门标签
function getDeptLabel(dept) {
  const found = DEPT_OPTIONS.find(d => d.value === dept);
  return found ? found.label : dept;
}

// 列出所有用户
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { department, isDel } = req.query;
    let sql = 'SELECT UserID, UserName, Department, Dep_cj, IsDel FROM UserInfo WHERE 1=1';
    const params = [];

    if (department) {
      sql += ' AND Department = @p' + params.length;
      params.push(department);
    }
    if (isDel !== undefined) {
      sql += ' AND IsDel = @p' + params.length;
      params.push(parseInt(isDel));
    }

    sql += ' ORDER BY UserID DESC';
    const rows = await db.query(sql, params);
    // 附加部门标签
    const data = rows.map(r => ({
      ...r,
      departmentLabel: getDeptLabel(r.Department),
    }));
    res.json(data);
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 获取单个用户
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await db.queryOne(
      'SELECT UserID, UserName, Department, Dep_cj, IsDel FROM UserInfo WHERE UserID = @p0',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: '用户不存在' });
    res.json({ ...user, departmentLabel: getDeptLabel(user.Department) });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 新增用户（仅系统管理员）
router.post('/', authMiddleware, requireDept('S'), validate({
  UserName: 'string|required|maxLen:50',
  PassWord: 'string|required|minLen:4|maxLen:20',
  Department: 'string|required',
  Dep_cj: 'string|optional',
  IsDel: 'number|optional',
}), async (req, res) => {
  try {
    const { UserName, PassWord, Department, Dep_cj, IsDel = 0 } = req.body;

    // 检查用户名是否已存在
    const exist = await db.queryOne(
      'SELECT UserID FROM UserInfo WHERE UserName = @p0 AND IsDel = 0',
      [UserName]
    );
    if (exist) return res.status(409).json({ error: '用户名已存在' });

    // C1/C2 车间必须选车间权限
    if ((Department === 'C1' || Department === 'C2') && !Dep_cj) {
      return res.status(400).json({ error: '车间主任/副主任必须选择车间权限' });
    }

    const passwordHash = aspMd5(PassWord);
    const pool = await db.getPool();
    const result = await pool.request()
      .input('UserName', UserName)
      .input('PassWord', passwordHash)
      .input('Department', Department)
      .input('Dep_cj', Dep_cj || '')
      .input('IsDel', IsDel)
      .query('INSERT INTO UserInfo (UserName, PassWord, Department, Dep_cj, IsDel) OUTPUT INSERTED.* VALUES (@UserName, @PassWord, @Department, @Dep_cj, @IsDel)');

    const user = result.recordset[0];
    res.status(201).json({
      UserID: user.UserID,
      UserName: user.UserName,
      Department: user.Department,
      Dep_cj: user.Dep_cj,
      IsDel: user.IsDel,
      departmentLabel: getDeptLabel(user.Department),
    });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 更新用户（仅系统管理员）
router.put('/:id', authMiddleware, requireDept('S'), async (req, res) => {
  try {
    const { UserName, Department, Dep_cj, IsDel } = req.body;

    // 检查目标用户存在
    const exist = await db.queryOne(
      'SELECT UserID FROM UserInfo WHERE UserID = @p0',
      [req.params.id]
    );
    if (!exist) return res.status(404).json({ error: '用户不存在' });

    // 检查用户名是否被其他用户占用
    if (UserName) {
      const dup = await db.queryOne(
        'SELECT UserID FROM UserInfo WHERE UserName = @p0 AND UserID != @p1 AND IsDel = 0',
        [UserName, req.params.id]
      );
      if (dup) return res.status(409).json({ error: '用户名已存在' });
    }

    // C1/C2 车间必须选车间权限
    if ((Department === 'C1' || Department === 'C2') && !Dep_cj) {
      return res.status(400).json({ error: '车间主任/副主任必须选择车间权限' });
    }

    const pool = await db.getPool();
    await pool.request()
      .input('UserID', req.params.id)
      .input('UserName', UserName || exist.UserName)
      .input('Department', Department || exist.Department)
      .input('Dep_cj', Dep_cj !== undefined ? Dep_cj : exist.Dep_cj)
      .input('IsDel', IsDel !== undefined ? IsDel : exist.IsDel)
      .query('UPDATE UserInfo SET UserName=@UserName, Department=@Department, Dep_cj=@Dep_cj, IsDel=@IsDel WHERE UserID=@UserID');

    res.json({ message: '更新成功' });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 删除用户（软删除，仅系统管理员）
router.delete('/:id', authMiddleware, requireDept('S'), async (req, res) => {
  try {
    const exist = await db.queryOne(
      'SELECT UserID FROM UserInfo WHERE UserID = @p0',
      [req.params.id]
    );
    if (!exist) return res.status(404).json({ error: '用户不存在' });

    await db.query(
      'UPDATE UserInfo SET IsDel = 1 WHERE UserID = @p0',
      [req.params.id]
    );
    res.json({ message: '删除成功' });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 重置密码（仅系统管理员）
router.post('/:id/reset-password', authMiddleware, requireDept('S'), async (req, res) => {
  try {
    const exist = await db.queryOne(
      'SELECT UserID FROM UserInfo WHERE UserID = @p0',
      [req.params.id]
    );
    if (!exist) return res.status(404).json({ error: '用户不存在' });

    const passwordHash = aspMd5('123456');
    await db.query(
      'UPDATE UserInfo SET PassWord = @p0 WHERE UserID = @p1',
      [passwordHash, req.params.id]
    );
    res.json({ message: '密码已重置为 123456' });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 修改自己的密码
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '旧密码和新密码都不能为空' });
    }
    if (newPassword.length < 4 || newPassword.length > 20) {
      return res.status(400).json({ error: '新密码长度必须在 4-20 位之间' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader.slice(7);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yinshua-secret');

    const user = await db.queryOne(
      'SELECT UserID, PassWord FROM UserInfo WHERE UserID = @p0',
      [decoded.userId]
    );
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const oldHash = aspMd5(oldPassword);
    if (user.PassWord !== oldHash && user.PassWord !== oldPassword) {
      return res.status(401).json({ error: '旧密码错误' });
    }

    const newHash = aspMd5(newPassword);
    await db.query(
      'UPDATE UserInfo SET PassWord = @p0 WHERE UserID = @p1',
      [newHash, decoded.userId]
    );
    res.json({ message: '密码修改成功' });
  } catch (err) {
    errorHandler(err, req, res);
  }
});

// 获取部门选项
router.get('/options/departments', authMiddleware, (req, res) => {
  res.json(DEPT_OPTIONS);
});

// 获取车间选项
router.get('/options/cj', authMiddleware, (req, res) => {
  res.json(Cj_OPTIONS);
});

module.exports = router;
