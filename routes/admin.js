const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireDept } = require('../middleware/auth');
const { STEPS, PRODUCT_NAMES, TABLE_MAP } = require('../utils/progress');

const router = express.Router();

// buildProgress 保留本地（含 YS/YM/ZM/DS 额外字段），引用共享 STEPS/TABLE_MAP/PRODUCT_NAMES

// ── 通用数据
// 注意：根据生产环境验证，实际列名是 jhkddClass（接单状态），jhkddTime 记录时间
const STEPS_LOCAL = [
  { field: 'jhkddClass', label: '接单',     timeField: 'jhkddTime' },
  { field: 'jhkprint',  label: '打印/晒版', timeField: 'jhkprintTime' },
  { field: 'sccjjs',    label: '车间接收',  timeField: 'sccjjsTime' },
  { field: 'sccjyl',    label: '预领料',    timeField: 'sccjylTime' },
  { field: 'sccjdn',    label: '电脑制版',  timeField: 'sccjdnTime' },
  { field: 'sccjsc',    label: '生产',      timeField: 'sccjscTime' },
  { field: 'sccjwc',    label: '完成',      timeField: 'sccjwcTime' },
  { field: 'hzljs',     label: '汇总',      timeField: 'hzljsTime' },
  { field: 'fahuo',     label: '发货',      timeField: 'fahuoTime' },
];

function buildProgress(order, productType) {
  const steps = STEPS_LOCAL.map(s => ({
    step: s.label,
    field: s.field,
    completed: order[s.field] === true || order[s.field] === 1,
    time: order[s.timeField] ? new Date(order[s.timeField]).toISOString() : null,
  }));

  const base = {
    DD_id: order.DD_id,
    ddbh: order.ddbh,
    company: order.company,
    product_type: productType,
    product_name: PRODUCT_NAMES[productType],
    steps,
    ZT: order.ZT || 0,
    fahuo: order.fahuo === true || order.fahuo === 1,
    prouddate: order.prouddate ? new Date(order.prouddate).toISOString() : null,
    overdate: order.overdate ? new Date(order.overdate).toISOString() : null,
    ywy: order.ywy,
    zhidan: order.zhidan,
  };

  // YS 额外字段
  if (productType === 'YS') {
    return {
      ...base,
      shuliang: order.shuliang,
      yjbhao: order.yjbhao,
      kuanhao: order.kuanhao,
      cpgg: order.cpgg,
      pingshu: order.pingshu,
      danjia: order.danjia,
      yszj: order.yszj,
      fahuodanwei: order.fahuodanwei,
      jiagongfei: order.jiagongfei,
      waifa: order.waifa,
      beizhu: order.beizhuYS,
      beizhuYS: order.beizhuYS,
      sclcClass: order.sclcClass,
      ylzd: order.ylzd,
      klcc: order.klcc,
      kaishu: order.kaishu,
      xukaisl: order.xukaisl,
      bcsl: order.bcsl,
      klyaoqiu: order.klyaoqiu,
      jyyaoqiu: order.jyyaoqiu,
      zhengli: order.zhengli,
      proudnumber: order.proudnumber,
      lldate: order.lldate ? new Date(order.lldate).toISOString() : null,
      sydazhang: order.sydazhang,
      syMoney: order.syMoney,
      yssl1: order.yssl1, yssl2: order.yssl2, yssl3: order.yssl3, yssl4: order.yssl4,
      yssl5: order.yssl5, yssl6: order.yssl6, yssl7: order.yssl7, yssl8: order.yssl8, yssl9: order.yssl9,
      ysdw1: order.ysdw1, ysdw2: order.ysdw2, ysdw3: order.ysdw3, ysdw4: order.ysdw4,
      ysdw5: order.ysdw5, ysdw6: order.ysdw6, ysdw7: order.ysdw7, ysdw8: order.ysdw8, ysdw9: order.ysdw9,
      ysyl1: order.ysyl1, ysyl2: order.ysyl2, ysyl3: order.ysyl3, ysyl4: order.ysyl4,
      ysyl5: order.ysyl5, ysyl6: order.ysyl6, ysyl7: order.ysyl7, ysyl8: order.ysyl8, ysyl9: order.ysyl9,
      yss20: order.yss20, ysdw10: order.ysdw10, ysy20: order.ysy20,
      jine1: order.jine1, jine2: order.jine2, jine3: order.jine3, jine4: order.jine4,
      jine5: order.jine5, jine6: order.jine6, jine7: order.jine7, jine8: order.jine8, jine9: order.jine9,
      jine10: order.jine10,
    };
  }

  // YM 额外字段
  if (productType === 'YM') {
    return {
      ...base,
      shuliang: order.shuliang,
      yjbhao: order.yjbhao,
      cpgg: order.cpgg,
      pingshu: order.pingshu,
      danjia: order.danjia,
      yszj: order.yszj,
      zhengli: order.zhengli,
      gyyq: order.gyyq,
      proudnumber: order.proudnumber,
      lldate: order.lldate ? new Date(order.lldate).toISOString() : null,
      waifa: order.waifa,
      yssl1: order.yssl1, yssl2: order.yssl2, yssl3: order.yssl3, yssl4: order.yssl4,
      yssl5: order.yssl5, yssl6: order.yssl6, yssl7: order.yssl7, yssl8: order.yssl8, yssl9: order.yssl9,
      ysdw1: order.ysdw1, ysdw2: order.ysdw2, ysdw3: order.ysdw3, ysdw4: order.ysdw4,
      ysdw5: order.ysdw5, ysdw6: order.ysdw6, ysdw7: order.ysdw7, ysdw8: order.ysdw8, ysdw9: order.ysdw9,
      ysyl1: order.ysyl1, ysyl2: order.ysyl2, ysyl3: order.ysyl3, ysyl4: order.ysyl4,
      ysyl5: order.ysyl5, ysyl6: order.ysyl6, ysyl7: order.ysyl7, ysyl8: order.ysyl8, ysyl9: order.ysyl9,
      yss20: order.yss20, ysdw10: order.ysdw10, ysy20: order.ysy20,
      jine1: order.jine1, jine2: order.jine2, jine3: order.jine3, jine4: order.jine4,
      jine5: order.jine5, jine6: order.jine6, jine7: order.jine7, jine8: order.jine8, jine9: order.jine9,
      jine10: order.jine10,
    };
  }

  // ZM 额外字段
  if (productType === 'ZM') {
    const zmColor = {};
    for (let i = 1; i <= 12; i++) {
      zmColor[`qw${i}`] = order[`qw${i}`];
      zmColor[`ss${i}`] = order[`ss${i}`];
      zmColor[`bz${i}`] = order[`bz${i}`];
    }
    const zmSize = {};
    for (let i = 1; i <= 10; i++) {
      zmSize[`sl${i}`] = order[`sl${i}`];
      zmSize[`lieshu${i}`] = order[`lieshu${i}`];
    }
    return {
      ...base,
      shuliang: order.shuliang,
      huahao: order.huahao,
      cidiehao: order.cidiehao,
      kuandu: order.kuandu,
      changdu: order.changdu,
      huachang: order.huachang,
      weidu: order.weidu,
      chenpingcc: order.chenpingcc,
      gyyq: order.gyyq,
      jiagongfei: order.jiagongfei,
      jijia: order.jijia,
      beizhuZM: order.beizhuZM,
      soujianjl: order.soujianjl,
      ...zmColor,
      ...zmSize,
    };
  }

  // DS 额外字段
  if (productType === 'DS') {
    return {
      ...base,
      shuliang: order.shuliang,
      yjbhao: order.yjbhao,
      cpgg: order.cpgg,
      jiage: order.jiage,
      zhengli: order.zhengli,
      jiagongfei: order.jiagongfei,
      fhdw: order.fhdw,
      fhdate: order.fhdate ? new Date(order.fhdate).toISOString() : null,
      fhr: order.fhr,
      waifa: order.waifa,
    };
  }

  return base;
}

// ⚠️ 路由顺序很重要：具体路径必须放在参数路径前面

// ── 1. 概览统计（要放在 /:product_type 前面）────────────────
/**
 * @swagger
 * /api/admin/orders/stats/overview:
 *   get:
 *     summary: 订单统计概览
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 各产品线订单统计（总数/进行中/已完成）
 */
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    const stats = {};
    for (const [ptype, table] of Object.entries(TABLE_MAP)) {
      const [total, inProgress, completed] = await Promise.all([
        db.queryOne(`SELECT COUNT(*) as cnt FROM ${table}`),
        db.queryOne(`SELECT COUNT(*) as cnt FROM ${table} WHERE fahuo IS NULL OR fahuo = 0`),
        db.queryOne(`SELECT COUNT(*) as cnt FROM ${table} WHERE fahuo = 1`),
      ]);
      stats[ptype] = {
        name: PRODUCT_NAMES[ptype],
        total: total?.cnt || 0,
        in_progress: inProgress?.cnt || 0,
        completed: completed?.cnt || 0,
      };
    }
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '统计失败', detail: err.message });
  }
});

// ── 2. 用户列表（要放在 /:product_type 前面）────────────────
/**
 * @swagger
 * /api/admin/orders/users/list:
 *   get:
 *     summary: 用户列表
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户列表
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   UserID: { type: integer }
 *                   UserName: { type: string }
 *                   Department: { type: string }
 *                   Dep_cj: { type: string }
 */
router.get('/users/list', authMiddleware, requireDept('A', 'S'), async (req, res) => {
  try {
    const users = await db.query('SELECT UserID, UserName, Department, Dep_cj FROM UserInfo WHERE IsDel = 0');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 3. 订单列表（精确路径 /）────────────────────────────────
/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: 订单列表（管理端）
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: product_type
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *         description: 产品线筛选
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 关键词搜索（订单号/客户/花号/制单人）
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [0, 1]
 *         description: 发货状态（0=未发货，1=已发货）
 *       - in: query
 *         name: ywy
 *         schema:
 *           type: integer
 *         description: 业务员ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 订单分页列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 page_size: { type: integer }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { product_type, keyword, status, ywy, page = 1, page_size = 20 } = req.query;
    const results = [];
    const types = product_type && TABLE_MAP[product_type] ? [product_type] : Object.keys(TABLE_MAP);

    for (const ptype of types) {
      const table = TABLE_MAP[ptype];
      // SQL Server 2008 compatible: use TOP for reasonable upper bound,
      // fetch enough to cover the requested page across all 4 product lines
      const perTableLimit = 5000;
      let sql = `SELECT TOP ${perTableLimit} * FROM ${table} WHERE 1=1`;
      const params = [];

      if (keyword) {
        const k = `%${keyword}%`;
        sql += ` AND (ddbh LIKE @p${params.length} OR company LIKE @p${params.length} OR yjbhao LIKE @p${params.length} OR zhidan LIKE @p${params.length})`;
        params.push(k);
      }

      if (status === '0') sql += ' AND (fahuo IS NULL OR fahuo = 0)';
      else if (status === '1') sql += ' AND fahuo = 1';

      if (ywy) { sql += ` AND ywy = @p${params.length}`; params.push(parseInt(ywy)); }

      if (req.user.dept === 'E') {
        sql += ` AND zhidan = @p${params.length}`;
        params.push(req.user.username);
      }

      sql += ' ORDER BY DD_id DESC';
      const rows = await db.query(sql, params);
      for (const order of rows) results.push(buildProgress(order, ptype));
    }

    results.sort((a, b) => b.DD_id - a.DD_id);
    const total = results.length;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const items = results.slice(offset, offset + parseInt(page_size));

    res.json({ total, page: parseInt(page), page_size: parseInt(page_size), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 4. 新建订单（精确路径 POST /）───────────────────────────
/**
 * @swagger
 * /api/admin/orders:
 *   post:
 *     summary: 新建订单（管理端）
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [product_type, company]
 *             properties:
 *               product_type:
 *                 type: string
 *                 enum: [YS, YM, ZM, DS]
 *               company:
 *                 type: string
 *               yjbhao: { type: string }
 *               cpgg: { type: string }
 *               pingshu: { type: string }
 *               shuliang: { type: string }
 *               ywy: { type: integer }
 *               jyyaoqiu: { type: string }
 *               zhengli: { type: string }
 *     responses:
 *       200:
 *         description: 创建成功
 *       400:
 *         description: 参数错误
 *       401:
 *         description: 未授权
 */
router.post('/', authMiddleware, requireDept('A', 'S'), async (req, res) => {
  try {
    const { product_type, company, yjbhao, cpgg, pingshu, shuliang, ywy, jyyaoqiu, zhengli } = req.body;

    if (!TABLE_MAP[product_type]) return res.status(400).json({ error: '无效的产品类型' });
    if (!company) return res.status(400).json({ error: '客户公司不能为空' });

    const today = new Date();
    const yymmdd = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

    const lastOrder = await db.queryOne(
      `SELECT TOP 1 ddbh FROM ${TABLE_MAP[product_type]} WHERE ddbh LIKE @p0 ORDER BY DD_id DESC`,
      [`${yymmdd}%`]
    );

    let seq = 1;
    if (lastOrder?.ddbh?.length >= 10) {
      const n = parseInt(lastOrder.ddbh.slice(-4));
      if (!isNaN(n)) seq = n + 1;
    }
    const newDdbh = yymmdd + String(seq).padStart(4, '0');

    const pool = await db.getPool();
    const req_ = pool.request();
    req_.input('ddbh',   db.mssql.NVarChar, newDdbh);
    req_.input('company', db.mssql.NVarChar, company);
    req_.input('yjbhao',  db.mssql.NVarChar, yjbhao || '');
    req_.input('cpgg',    db.mssql.NVarChar, cpgg || '');
    req_.input('pingshu', db.mssql.NVarChar, pingshu || '');
    req_.input('shuliang',db.mssql.NVarChar, shuliang || '');
    req_.input('ywy',     db.mssql.Int, ywy || null);
    req_.input('jyyaoqiu',db.mssql.NVarChar, jyyaoqiu || '');
    req_.input('zhengli', db.mssql.NVarChar, zhengli || '');
    req_.input('prouddate',  db.mssql.DateTime, today);
    req_.input('jhkddTime',  db.mssql.DateTime, today);
    req_.input('jhkdd',      db.mssql.Bit, 1);
    req_.input('zhidan',     db.mssql.NVarChar, req.user.username);
    req_.input('ZT',         db.mssql.TinyInt, 0);

    const result = await req_.query(`
      INSERT INTO ${TABLE_MAP[product_type]}
        (ddbh,company,yjbhao,cpgg,pingshu,shuliang,ywy,jyyaoqiu,zhengli,prouddate,jhkddTime,jhkdd,zhidan,ZT)
      VALUES (@ddbh,@company,@yjbhao,@cpgg,@pingshu,@shuliang,@ywy,@jyyaoqiu,@zhengli,@prouddate,@jhkddTime,@jhkdd,@zhidan,@ZT);
      SELECT SCOPE_IDENTITY() as newId;
    `);

    res.json({ success: true, ddbh: newDdbh, DD_id: result.recordset[0].newId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '创建订单失败', detail: err.message });
  }
});

// ── 5. 订单详情（参数路径，放后面）──────────────────────────
/**
 * @swagger
 * /api/admin/orders/{product_type}/{dd_id}:
 *   get:
 *     summary: 订单详情
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *       - in: path
 *         name: dd_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 订单详情（含工序进度）
 *       404:
 *         description: 订单不存在
 */
router.get('/:product_type/:dd_id', authMiddleware, async (req, res) => {
  try {
    const { product_type, dd_id } = req.params;
    if (!TABLE_MAP[product_type]) return res.status(400).json({ error: '无效的产品类型' });

    const order = await db.queryOne(
      `SELECT * FROM ${TABLE_MAP[product_type]} WHERE DD_id = @p0`,
      [parseInt(dd_id)]
    );
    if (!order) return res.status(404).json({ error: '订单不存在' });

    res.json(buildProgress(order, product_type));
  } catch (err) {
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 6. 更新工序节点（参数路径）──────────────────────────────
/**
 * @swagger
 * /api/admin/orders/{product_type}/{dd_id}/step:
 *   post:
 *     summary: 更新工序完成状态
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *       - in: path
 *         name: dd_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [step, completed]
 *             properties:
 *               step:
 *                 type: string
 *                 description: 工序字段名，如 jhkdd, jhkprint, sccjjs 等
 *               completed:
 *                 type: boolean
 *                 description: true=完成，false=撤销
 *     responses:
 *       200:
 *         description: 更新成功
 *       400:
 *         description: 参数错误
 */
router.post('/:product_type/:dd_id/step', authMiddleware, async (req, res) => {
  try {
    const { product_type, dd_id } = req.params;
    const { step, completed } = req.body;

    if (!TABLE_MAP[product_type]) return res.status(400).json({ error: '无效的产品类型' });
    const stepDef = STEPS.find(s => s.field === step);
    if (!stepDef) return res.status(400).json({ error: '无效的工序步骤' });

    const pool = await db.getPool();
    const transaction = new db.mssql.Transaction(pool);
    await transaction.begin();

    try {
      const req_ = new db.mssql.Request(transaction);
      req_.input('dd_id', db.mssql.Int, parseInt(dd_id));
      req_.input('completed', db.mssql.Bit, completed ? 1 : 0);

      const timeSet = completed ? `, ${stepDef.timeField} = GETDATE()` : `, ${stepDef.timeField} = NULL`;
      await req_.query(
        `UPDATE ${TABLE_MAP[product_type]} SET ${step} = @completed ${timeSet} WHERE DD_id = @dd_id`
      );

      await transaction.commit();

      const order = await db.queryOne(
        `SELECT * FROM ${TABLE_MAP[product_type]} WHERE DD_id = @p0`,
        [parseInt(dd_id)]
      );

      res.json({ success: true, message: `工序 [${stepDef.label}] 已${completed ? '完成' : '撤销'}`, data: buildProgress(order, product_type) });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败', detail: err.message });
  }
});

// ── 7. 车间修改订单（JHK Edit）──────────────────────────────
// 允许修改：接单日期、交货日期、数量、备注、开料要求、机印要求、JHK工序字段
/**
 * @swagger
 * /api/admin/orders/{product_type}/{dd_id}:
 *   patch:
 *     summary: 车间修改订单
 *     tags: [管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: product_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *       - in: path
 *         name: dd_id
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
 *               prouddate: { type: string, format: date-time }
 *               overdate: { type: string, format: date-time }
 *               shuliang: { type: string }
 *               beizhu: { type: string }
 *               beizhuYS: { type: string }
 *               beizhuZM: { type: string }
 *               klyaoqiu: { type: string }
 *               jyyaoqiu: { type: string }
 *               fahuodanwei: { type: string }
 *               jhkdd: { type: boolean }
 *               jhkprint: { type: boolean }
 *               sccjjs: { type: boolean }
 *               sccjyl: { type: boolean }
 *               sccjdn: { type: boolean }
 *               sccjsc: { type: boolean }
 *               sccjwc: { type: boolean }
 *               hzljs: { type: boolean }
 *               fahuo: { type: boolean }
 *     responses:
 *       200:
 *         description: 更新成功
 *       403:
 *         description: 无权修改此产品线
 */
router.patch('/:product_type/:dd_id', authMiddleware, async (req, res) => {
  try {
    const { product_type, dd_id } = req.params;
    if (!TABLE_MAP[product_type]) return res.status(400).json({ error: '无效的产品类型' });

    // 权限：S/A 可以修改所有，B/C 只能修改自己部门的订单
    const user = req.user;
    const deptWorkshopMap = { B: ['YS'], C: ['YM', 'ZM', 'DS'] };
    if (user.dept !== 'S' && user.dept !== 'A') {
      const allowed = deptWorkshopMap[user.dept];
      if (!allowed || !allowed.includes(product_type)) {
        return res.status(403).json({ error: '无权修改此产品线的订单' });
      }
    }

    // 允许编辑的字段（白名单）
    const ALLOWED_FIELDS = [
      'prouddate', 'overdate', 'shuliang',
      'beizhu', 'beizhuYS', 'beizhuZM',
      'klyaoqiu', 'jyyaoqiu', 'fahuodanwei',
      'jhkdd', 'jhkprint', 'sccjjs', 'sccjyl', 'sccjdn', 'sccjsc', 'sccjwc', 'hzljs', 'fahuo',
    ];

    const updates = [];
    const params = [];
    let pi = 0;

    for (const [key, val] of Object.entries(req.body)) {
      if (!ALLOWED_FIELDS.includes(key)) continue;
      if (val === undefined) continue;

      if (key === 'prouddate' || key === 'overdate') {
        updates.push(`[${key}] = @p${pi}`);
        params.push([`p${pi}`, db.mssql.DateTime, val ? new Date(val) : null]);
        pi++;
      } else if (key === 'shuliang') {
        updates.push(`[${key}] = @p${pi}`);
        params.push([`p${pi}`, db.mssql.NVarChar, String(val)]);
        pi++;
      } else if (typeof val === 'boolean') {
        updates.push(`[${key}] = @p${pi}`);
        params.push([`p${pi}`, db.mssql.Bit, val ? 1 : 0]);
        pi++;
      } else {
        updates.push(`[${key}] = @p${pi}`);
        params.push([`p${pi}`, db.mssql.NVarChar, String(val ?? '')]);
        pi++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有有效的更新字段' });
    }

    params.push([`p${pi}`, db.mssql.Int, parseInt(dd_id)]);
    const sql = `UPDATE ${TABLE_MAP[product_type]} SET ${updates.join(', ')} WHERE DD_id = @p${pi}`;

    await db.query(sql, params);

    const order = await db.queryOne(
      `SELECT * FROM ${TABLE_MAP[product_type]} WHERE DD_id = @p0`,
      [parseInt(dd_id)]
    );

    res.json({ success: true, message: '订单已更新', data: buildProgress(order, product_type) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '更新失败', detail: err.message });
  }
});

module.exports = router;