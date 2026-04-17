const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// 工序步骤定义（orders.js 专用，注意 jhkdd 不是 jhkddClass）
const STEPS_ORDERS = [
  { field: 'jhkdd',    label: '接单',     timeField: 'jhkddTime' },
  { field: 'jhkprint', label: '打印',     timeField: 'jhkprintTime' },
  { field: 'sccjjs',   label: '车间接收', timeField: 'sccjjsTime' },
  { field: 'sccjyl',   label: '预领料',   timeField: 'sccjylTime' },
  { field: 'sccjdn',   label: '电脑制版', timeField: 'sccjdnTime' },
  { field: 'sccjsc',   label: '生产',     timeField: 'sccjscTime' },
  { field: 'sccjwc',   label: '完成',     timeField: 'sccjwcTime' },
  { field: 'hzljs',    label: '汇总',     timeField: 'hzljsTime' },
  { field: 'fahuo',    label: '发货',     timeField: 'fahuoTime' },
];

// buildProgress 简化版（orders.js 专用，无 YS/YM/ZM/DS 额外字段）
function buildProgressOrders(order, productType) {
  const steps = STEPS_ORDERS.map(s => {
    const val = order[s.field];
    const time = order[s.timeField];
    return {
      step: s.label,
      field: s.field,
      completed: val === true || val === 1,
      time: time ? new Date(time).toISOString() : null,
    };
  });
  return {
    DD_id: order.DD_id,
    ddbh: order.ddbh,
    company: order.company,
    product_type: productType,
    steps,
    ZT: order.ZT || 0,
    fahuo: order.fahuo === true || order.fahuo === 1,
    prouddate: order.prouddate ? new Date(order.prouddate).toISOString() : null,
    overdate: order.overdate ? new Date(order.overdate).toISOString() : null,
  };
}

// 产品表映射（包含 table 和 gx）
const TABLE_MAP = {
  YS: { table: 'YS',  gx: 'YSGX' },
  YM: { table: 'YM',  gx: 'YMGX' },
  ZM: { table: 'ZM',  gx: 'ZMGX' },
  DS: { table: 'DS',  gx: 'DSGX' },
};

/**
 * @swagger
 * /api/orders/search:
 *   get:
 *     summary: 搜索订单列表
 *     tags: [订单]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 搜索关键词（订单号/客户/料号）
 *       - in: query
 *         name: product_type
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *         description: 产品线筛选
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [0, 1]
 *         description: 发货状态（0=未发货，1=已发货）
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
 *         description: 订单列表
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
 *                     properties:
 *                       DD_id: { type: integer }
 *                       ddbh: { type: string }
 *                       company: { type: string }
 *                       product_type: { type: string }
 *                       ZT: { type: integer }
 *                       fahuo: { type: boolean }
 *                       prouddate: { type: string, format: date-time }
 *                       overdate: { type: string, format: date-time }
 *                       steps: { type: array }
 */
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { keyword, product_type, status, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const results = [];

    const types = product_type && TABLE_MAP[product_type] ? [product_type] : Object.keys(TABLE_MAP);

    for (const ptype of types) {
      const { table } = TABLE_MAP[ptype];
      let sql = `SELECT TOP ${parseInt(page_size) * 3} * FROM ${table} WHERE 1=1`;
      let countSql = `SELECT COUNT(*) as cnt FROM ${table} WHERE 1=1`;
      const params = [];

      if (keyword) {
        const k = `%${keyword}%`;
        sql += ` AND (ddbh LIKE @p${params.length} OR company LIKE @p${params.length} OR yjbhao LIKE @p${params.length})`;
        countSql += ` AND (ddbh LIKE @p${params.length} OR company LIKE @p${params.length} OR yjbhao LIKE @p${params.length})`;
        params.push(k);
      }

      if (status === '0') {
        sql += ' AND (fahuo IS NULL OR fahuo = 0)';
        countSql += ' AND (fahuo IS NULL OR fahuo = 0)';
      } else if (status === '1') {
        sql += ' AND fahuo = 1';
        countSql += ' AND fahuo = 1';
      }

      sql += ' ORDER BY DD_id DESC';

      const [rows, countResult] = await Promise.all([
        db.query(sql, params),
        db.queryOne(countSql, params),
      ]);

      for (const order of rows) {
        results.push(buildProgressOrders(order, ptype));
      }
    }

    // 全局排序并分页
    results.sort((a, b) => b.DD_id - a.DD_id);
    const total = results.length;
    const items = results.slice(offset, offset + parseInt(page_size));

    res.json({ total, page: parseInt(page), page_size: parseInt(page_size), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

/**
 * @swagger
 * /api/orders/progress/{product_type}/{dd_id}:
 *   get:
 *     summary: 获取订单进度详情
 *     tags: [订单]
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
 *         description: 订单ID
 *     responses:
 *       200:
 *         description: 订单进度详情
 *       404:
 *         description: 订单不存在
 */
router.get('/progress/:product_type/:dd_id', authMiddleware, async (req, res) => {
  try {
    const { product_type, dd_id } = req.params;
    if (!TABLE_MAP[product_type]) return res.status(400).json({ error: '无效的产品类型' });

    const order = await db.queryOne(
      `SELECT * FROM ${TABLE_MAP[product_type].table} WHERE DD_id = @p0`,
      [parseInt(dd_id)]
    );

    if (!order) return res.status(404).json({ error: '订单不存在' });

    res.json(buildProgressOrders(order, product_type));
  } catch (err) {
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

/**
 * @swagger
 * /api/orders/stats:
 *   get:
 *     summary: 获取各产品线订单统计
 *     tags: [订单]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 各产品线统计
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   total: { type: integer }
 *                   in_progress: { type: integer }
 *                   completed: { type: integer }
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const stats = {};
    const PRODUCT_NAMES = { YS: '印刷', YM: '印刷面', ZM: '纸盒', DS: '模切' };
    for (const [ptype, { table }] of Object.entries(TABLE_MAP)) {
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
    res.status(500).json({ error: '统计失败', detail: err.message });
  }
});

module.exports = router;
