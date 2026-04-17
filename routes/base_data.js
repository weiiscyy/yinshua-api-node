const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 初始化基础数据表（仅建表，不重复创建）
/**
 * @swagger
 * /api/base_data/init:
 *   post:
 *     summary: 初始化基础数据表
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 初始化完成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       500:
 *         description: 初始化失败
 */
router.post('/init', authMiddleware, async (req, res) => {
  try {
    // 业务员表（从 UserInfo 同步）
    await db.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SalesPerson]') AND type = 'U')
      CREATE TABLE SalesPerson (
        id        INT PRIMARY KEY,
        name      NVARCHAR(50),
        department NVARCHAR(10) DEFAULT 'A',
        isDel     BIT DEFAULT 0
      )
    `);

    // 公司表
    await db.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Company]') AND type = 'U')
      CREATE TABLE Company (
        id       INT IDENTITY(1,1) PRIMARY KEY,
        name     NVARCHAR(100) NOT NULL,
        address  NVARCHAR(200),
        phone    NVARCHAR(50),
        contact  NVARCHAR(50),
        isDel    BIT DEFAULT 0
      )
    `);

    // 发货地址表
    await db.query(`
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ShippingAddress]') AND type = 'U')
      CREATE TABLE ShippingAddress (
        id         INT IDENTITY(1,1) PRIMARY KEY,
        company_id INT,
        address    NVARCHAR(200) NOT NULL,
        contact    NVARCHAR(50),
        phone      NVARCHAR(50),
        isDefault  BIT DEFAULT 0,
        isDel      BIT DEFAULT 0
      )
    `);

    res.json({ message: '基础表初始化完成' });
  } catch (err) {
    res.status(500).json({ error: '初始化失败', detail: err.message });
  }
});

// 同步业务员（从 UserInfo）
/**
 * @swagger
 * /api/base_data/sync-salespersons:
 *   post:
 *     summary: 同步业务员（从 UserInfo）
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 同步完成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 count: { type: integer }
 *       500:
 *         description: 同步失败
 */
router.post('/sync-salespersons', authMiddleware, async (req, res) => {
  try {
    const users = await db.query(
      "SELECT UserID, UserName FROM UserInfo WHERE Department = 'A' AND IsDel = 0"
    );

    for (const u of users) {
      await db.query(
        "IF NOT EXISTS (SELECT * FROM SalesPerson WHERE id = @p0) INSERT INTO SalesPerson (id, name) VALUES (@p0, @p1)",
        [u.UserID, u.UserName]
      );
    }

    res.json({ message: '同步完成', count: users.length });
  } catch (err) {
    res.status(500).json({ error: '同步失败', detail: err.message });
  }
});

// ===== 业务员 CRUD =====
/**
 * @swagger
 * /api/base_data/salespersons:
 *   get:
 *     summary: 获取业务员列表
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 业务员列表
 *   post:
 *     summary: 新增业务员
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: 姓名
 *               department:
 *                 type: string
 *                 description: 部门（默认 A）
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 姓名为必填项
 */
router.get('/salespersons', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM SalesPerson WHERE isDel = 0');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/salespersons', authMiddleware, async (req, res) => {
  try {
    const { name, department = 'A' } = req.body;
    if (!name) return res.status(400).json({ error: '姓名为必填项' });
    const rows = await db.query(
      'INSERT INTO SalesPerson (name, department) OUTPUT INSERTED.* VALUES (@p0, @p1)',
      [name, department]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /salespersons error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/base_data/salespersons/{id}:
 *   put:
 *     summary: 更新业务员
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               department: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除业务员
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.put('/salespersons/:id', authMiddleware, async (req, res) => {
  try {
    const { name, department } = req.body;
    await db.query(
      "UPDATE SalesPerson SET name = @p1, department = @p2 WHERE id = @p0",
      [req.params.id, name, department]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/salespersons/:id', authMiddleware, async (req, res) => {
  try {
    await db.query("UPDATE SalesPerson SET isDel = 1 WHERE id = @p0", [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 公司 CRUD =====
/**
 * @swagger
 * /api/base_data/companies:
 *   get:
 *     summary: 获取公司列表
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 公司列表
 *   post:
 *     summary: 新增公司
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: 公司名称 }
 *               address: { type: string, description: 地址 }
 *               phone: { type: string, description: 电话 }
 *               contact: { type: string, description: 联系人 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.get('/companies', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM Company WHERE isDel = 0');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/companies', authMiddleware, async (req, res) => {
  try {
    const { name, address, phone, contact } = req.body;
    const pool = await db.getPool();
    const rows = await pool.request()
      .input('name', name)
      .input('address', address || '')
      .input('contact', contact || '')
      .input('phone', phone || '')
      .query('INSERT INTO Company (name, address, contact, phone) OUTPUT INSERTED.* VALUES (@name, @address, @contact, @phone)');
    res.json(rows.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/base_data/companies/{id}:
 *   put:
 *     summary: 更新公司
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               contact: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除公司
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.put('/companies/:id', authMiddleware, async (req, res) => {
  try {
    const { name, address, phone, contact } = req.body;
    const pool = await db.getPool();
    await pool.request()
      .input('id', req.params.id)
      .input('name', name)
      .input('address', address || '')
      .input('contact', contact || '')
      .input('phone', phone || '')
      .query('UPDATE Company SET name=@name, address=@address, contact=@contact, phone=@phone WHERE id=@id');
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/companies/:id', authMiddleware, async (req, res) => {
  try {
    await db.query("UPDATE Company SET isDel = 1 WHERE id = @p0", [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 发货地址 CRUD =====
/**
 * @swagger
 * /api/base_data/shipping-addresses:
 *   get:
 *     summary: 获取发货地址列表
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 发货地址列表
 *   post:
 *     summary: 新增发货地址
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               company_id: { type: integer, description: 公司ID }
 *               address: { type: string, description: 地址 }
 *               contact: { type: string, description: 联系人 }
 *               phone: { type: string, description: 电话 }
 *               isDefault: { type: boolean, description: 是否默认 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.get('/shipping-addresses', authMiddleware, async (req, res) => {
  try {
    const rows = await db.query(
      'SELECT sa.*, c.name as company_name FROM ShippingAddress sa LEFT JOIN Company c ON sa.company_id = c.id WHERE sa.isDel = 0'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shipping-addresses', authMiddleware, async (req, res) => {
  try {
    const { company_id, address, contact, phone, isDefault = false } = req.body;
    const pool = await db.getPool();
    if (isDefault) {
      await pool.request().input('cid', company_id)
        .query('UPDATE ShippingAddress SET isDefault=0 WHERE company_id=@cid');
    }
    const rows = await pool.request()
      .input('company_id', company_id || null)
      .input('address', address)
      .input('contact', contact || '')
      .input('phone', phone || '')
      .input('isDefault', isDefault ? 1 : 0)
      .query('INSERT INTO ShippingAddress (company_id, address, contact, phone, isDefault) OUTPUT INSERTED.* VALUES (@company_id, @address, @contact, @phone, @isDefault)');
    res.json(rows.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/base_data/shipping-addresses/{id}:
 *   put:
 *     summary: 更新发货地址
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_id: { type: integer }
 *               address: { type: string }
 *               contact: { type: string }
 *               phone: { type: string }
 *               isDefault: { type: boolean }
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除发货地址
 *     tags: [基础数据]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.put('/shipping-addresses/:id', authMiddleware, async (req, res) => {
  try {
    const { company_id, address, contact, phone, isDefault } = req.body;
    const pool = await db.getPool();
    if (isDefault) {
      await pool.request().input('cid', company_id)
        .query('UPDATE ShippingAddress SET isDefault=0 WHERE company_id=@cid');
    }
    await pool.request()
      .input('id', req.params.id)
      .input('company_id', company_id || null)
      .input('address', address)
      .input('contact', contact || '')
      .input('phone', phone || '')
      .input('isDefault', isDefault ? 1 : 0)
      .query('UPDATE ShippingAddress SET company_id=@company_id, address=@address, contact=@contact, phone=@phone, isDefault=@isDefault WHERE id=@id');
    res.json({ message: '更新成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/shipping-addresses/:id', authMiddleware, async (req, res) => {
  try {
    await db.query("UPDATE ShippingAddress SET isDel = 1 WHERE id = @p0", [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
