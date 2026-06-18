const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');
const { JWT_SECRET } = require('../config');

const router = express.Router();

// ASP MD5(..., 16) = 取标准MD5的 WordToHex(b) & WordToHex(c)
function aspMd5(str) {
  const hash = crypto.createHash('md5').update(str).digest();
  return hash.slice(4, 8).toString('hex') + hash.slice(8, 12).toString('hex');
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [认证]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 description: 用户名
 *                 example: admin
 *               password:
 *                 type: string
 *                 description: 密码（支持明文或旧系统 MD5 截断格式）
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 登录成功，返回 JWT Token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token: { type: string }
 *                 token_type: { type: string, example: bearer }
 *                 user:
 *                   type: object
 *                   properties:
 *                     UserID: { type: integer }
 *                     UserName: { type: string }
 *                     Department: { type: string }
 *       401:
 *         description: 用户名或密码错误
 *       400:
 *         description: 参数缺失
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await db.queryOne(
      'SELECT * FROM UserInfo WHERE UserName = @p0 AND IsDel = 0',
      [username]
    );

    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // MD5 兼容旧系统密码
    const inputHash = aspMd5(password);
    const passwordsMatch = (user.PassWord === inputHash || user.PassWord === password);

    if (!passwordsMatch) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { userId: user.UserID, username: user.UserName, dept: user.Department },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      access_token: token,
      token_type: 'bearer',
      user: {
        UserID: user.UserID,
        UserName: user.UserName,
        Department: user.Department,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败', detail: err.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: 获取当前登录用户信息
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 当前用户信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 UserID: { type: integer }
 *                 UserName: { type: string }
 *                 Department: { type: string }
 *                 Dep_cj: { type: string }
 *       401:
 *         description: 未提供认证令牌或令牌无效
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.queryOne(
      'SELECT UserID, UserName, Department, Dep_cj FROM UserInfo WHERE UserID = @p0',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    res.json(user);
  } catch (err) {
    res.status(401).json({ error: '认证失败', detail: err.message });
  }
});

module.exports = router;
