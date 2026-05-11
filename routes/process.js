const express = require('express');
const mssql = require('mssql');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { TABLE_MAP, PRODUCT_NAMES } = require('../utils/progress');

const router = express.Router();

// 工序定义（主流程，不含 hzl 细分工序）
const STEPS = [
  { field: 'jhkdd',    label: '接单',     bz: 10, timeField: 'jhkddTime',    group: '接单' },
  { field: 'jhkprint', label: '打印/晒版', bz: 20, timeField: 'jhkprintTime' },
  { field: 'sccjjs',   label: '车间接收', bz: 30, timeField: 'sccjjsTime'   },
  { field: 'sccjyl',   label: '缺料',     bz: 40, timeField: 'sccjylTime'   }, // 缺料，不推进BZ
  { field: 'sccjdn',   label: '电脑',     bz: 60, timeField: 'sccjdnTime'   },
  { field: 'sccjsc',   label: '生产',     bz: 70, timeField: 'sccjscTime'   },
  { field: 'sccjwc',   label: '完成',     bz: 80, timeField: 'sccjwcTime'   },
];

// BZ 计算：根据已完成的字段推导 BZ 值
function calcBZ(order) {
  if (order.sccjwc)      return 80;
  if (order.sccjsc)     return 70;
  if (order.sccjdn)     return 60;
  if (order.sccjjs)     return 30;
  if (order.jhkprint)   return 20;
  if (order.jhkddTime)  return 10;
  return 0;
}

// 获取当前工序名称
function getCurrentStepName(order) {
  const bz = calcBZ(order);
  if (order.sccjyl)     return '缺料中';
  if (order.sccjwc)     return '已完成';
  if (order.sccjsc)     return '生产';
  if (order.sccjdn)     return '电脑';
  if (order.sccjjs)     return '车间接收';
  if (order.jhkprint)   return '打印/晒版';
  if (order.jhkddTime)  return '接单';
  return '待接单';
}

// 判断 action 是否会清除缺料状态
function clearsSccjyl(action) {
  return ['sccjdn', 'sccjsc', 'sccjwc', 'fahuo'].includes(action);
}

// 获取某订单在 FahuoOrder 表中的发货总量
async function getFahuoQuantity(ddId, productType) {
  try {
    const r = await db.queryOne(
      `SELECT SUM(CAST(shuliang_sent AS FLOAT)) as total
       FROM FahuoOrder WHERE dd_id = @p0 AND product_type = @p1`,
      [ddId, productType]
    );
    return parseFloat(r?.total) || null;
  } catch {
    return null;
  }
}

// ── 查订单工序列表 ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/process/orders:
 *   get:
 *     summary: 工序管理-查询订单工序列表
 *     tags: [工序]
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
 *         name: bz_min
 *         schema:
 *           type: integer
 *         description: BZ最小值
 *       - in: query
 *         name: bz_max
 *         schema:
 *           type: integer
 *         description: BZ最大值
 *       - in: query
 *         name: sccjyl
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: 缺料状态筛选
 *       - in: query
 *         name: date_from
 *         schema:
 *           type: string
 *           format: date
 *         description: 接单日期开始
 *       - in: query
 *         name: date_to
 *         schema:
 *           type: string
 *           format: date
 *         description: 接单日期结束
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: 订单号/单位名搜索
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: 订单工序列表
 */
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const {
      product_type, bz_min, bz_max, sccjyl,
      date_from, date_to, keyword,
      page = 1, page_size = 50,
    } = req.query;

    const types = product_type && TABLE_MAP[product_type]
      ? [product_type]
      : ['YS', 'YM', 'ZM', 'DS'];

    const allResults = [];
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(page_size);
    let grandTotal = 0; // 四表总条数

    for (const ptype of types) {
      const table = TABLE_MAP[ptype];
      const conditions = [];
      const params = [];
      let paramIdx = 0;

      // ── BZ 范围过滤推入 SQL（基于计算出的 BZ）────────────
      // calcBZ: sccjwc→80, sccjsc→70, sccjdn→60, sccjjs→30, jhkprint→20, jhkddTime→10
      if (bz_min !== undefined) {
        const min = parseInt(bz_min);
        if (min >= 80)      conditions.push(`sccjwc = 1`);
        else if (min >= 70) conditions.push(`(sccjsc = 1 OR (sccjwc = 1 AND sccjsc = 1))`);
        else if (min >= 60) conditions.push(`sccjsc = 1`);
        else if (min >= 30) conditions.push(`sccjjs = 1`);
        else if (min >= 20) conditions.push(`jhkprint = 1`);
        else if (min >= 10) conditions.push(`jhkddTime IS NOT NULL`);
      }
      if (bz_max !== undefined) {
        const max = parseInt(bz_max);
        if (max < 70)       conditions.push(`sccjsc = 0`);           // BZ<=69，排除已完成
        else if (max < 80)  conditions.push(`sccjwc = 0`);           // BZ<80
        // max>=80: 不过滤
      }

      if (sccjyl !== undefined) {
        conditions.push(`sccjyl = @p${paramIdx++}`);
        params.push(parseInt(sccjyl));
      }

      if (date_from) {
        conditions.push(`jhkddTime >= @p${paramIdx++}`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`jhkddTime <= @p${paramIdx++}`);
        params.push(date_to);
      }
      if (keyword) {
        conditions.push(`(ddbh LIKE @p${paramIdx} OR company LIKE @p${paramIdx})`);
        params.push('%' + keyword + '%');
        paramIdx++;
      }

      const whereStr = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      // 查总数
      const cntR = await db.queryOne(
        `SELECT COUNT(*) as cnt FROM ${table} ${whereStr}`,
        params
      );
      const total = cntR.cnt;
      grandTotal += total;

      // 每表取 pageNum*pageSizeNum 条（以便 JS 全局排序后精确分页）
      const needRows = pageNum * pageSizeNum;
      const sql = `SELECT TOP ${needRows} * FROM ${table} ${whereStr} ORDER BY DD_id DESC`;
      const rows = await db.query(sql, params);

      for (const order of rows) {
        const bz = calcBZ(order);
        const currentStep = getCurrentStepName(order);

        allResults.push({
          DD_id:         order.DD_id,
          ddbh:          order.ddbh,
          product_type:  ptype,
          product_name:  PRODUCT_NAMES[ptype],
          company:       order.company,
          bz,
          current_step:  currentStep,
          jhkddTime:     order.jhkddTime ? new Date(order.jhkddTime).toISOString() : null,
          jhkprint:      !!order.jhkprint,
          jhkprintTime:  order.jhkprintTime ? new Date(order.jhkprintTime).toISOString() : null,
          sccjjs:        !!order.sccjjs,
          sccjjsTime:    order.sccjjsTime ? new Date(order.sccjjsTime).toISOString() : null,
          sccjyl:        !!order.sccjyl,
          sccjylTime:    order.sccjylTime ? new Date(order.sccjylTime).toISOString() : null,
          sccjdn:        !!order.sccjdn,
          sccjdnTime:    order.sccjdnTime ? new Date(order.sccjdnTime).toISOString() : null,
          sccjsc:        !!order.sccjsc,
          sccjscTime:    order.sccjscTime ? new Date(order.sccjscTime).toISOString() : null,
          sccjwc:        !!order.sccjwc,
          sccjwcTime:    order.sccjwcTime ? new Date(order.sccjwcTime).toISOString() : null,
          fahuo:         !!order.fahuo,
          fahuoTime:     order.fahuoTime ? new Date(order.fahuoTime).toISOString() : null,
          fahuoQty:      null,   // FahuoOrder 表为空，设为 null
          shuliang:      parseFloat(order.shuliang) || 0,
        });
      }
    }

    // ── 四表结果合并后全局排序，再精确分页 ──────────────────────────
    allResults.sort((a, b) => b.DD_id - a.DD_id);
    const skip = (pageNum - 1) * pageSizeNum;
    const items = allResults.slice(skip, skip + pageSizeNum);

    res.json({
      total: grandTotal,
      page: pageNum,
      page_size: pageSizeNum,
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 推进单个工序 ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/process/advance:
 *   post:
 *     summary: 工序管理-推进/回退/标记工序
 *     tags: [工序]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ddbh, product_type, action]
 *             properties:
 *               ddbh:
 *                 type: string
 *                 description: 订单编号
 *               product_type:
 *                 type: string
 *                 enum: [YS, YM, ZM, DS]
 *               action:
 *                 type: string
 *                 enum: [jhkdd, jhkdd_sample, jhkprint, sccjjs, sccjyl, sccjdn, sccjsc, sccjwc]
 *                 description: |
 *                   操作类型：
 *                   jhkdd=接单(生产) | jhkdd_sample=接单(打样)
 *                   jhkprint=打印/晒版 | sccjjs=车间接收
 *                   sccjyl=标记/解除缺料 | sccjdn=电脑 | sccjsc=生产 | sccjwc=完成
 *               value:
 *                 type: integer
 *                 description: "sccjyl操作时：1=标记缺料，0=解除缺料；其他action忽略"
 *     responses:
 *       200:
 *         description: 操作成功
 *       400:
 *         description: 参数错误
 *       404:
 *         description: 订单不存在
 */
router.post('/advance', authMiddleware, async (req, res) => {
  try {
    const { ddbh, product_type, action, value } = req.body;

    if (!ddbh || !product_type || !action) {
      return res.status(400).json({ error: '参数不完整：ddbh, product_type, action 必填' });
    }
    if (!TABLE_MAP[product_type]) {
      return res.status(400).json({ error: '无效的产品类型' });
    }

    const table = TABLE_MAP[product_type];

    // 查订单
    const order = await db.queryOne(
      `SELECT * FROM ${table} WHERE ddbh = @p0`,
      [ddbh]
    );
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    const stepDef = STEPS.find(s => s.field === action);
    const now = new Date();
    const updates = [];
    const setParts = [];
    let newBz = calcBZ(order);
    let newSccjyl = !!order.sccjyl;

    switch (action) {
      case 'jhkdd':
      case 'jhkdd_sample': {
        setParts.push('jhkddTime = @p0', 'jhkddClass = @p1');
        updates.push({ field: 'jhkddTime', value: now });
        updates.push({ field: 'jhkddClass', value: action === 'jhkdd_sample' ? 2 : 1 });
        newBz = 10;
        break;
      }
      case 'jhkprint': {
        setParts.push('jhkprint = 1', 'jhkprintTime = @p0');
        updates.push({ field: 'jhkprint', value: true });
        updates.push({ field: 'jhkprintTime', value: now });
        newBz = 20;
        // 清除缺料
        if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
        break;
      }
      case 'sccjjs': {
        setParts.push('sccjjs = 1', 'sccjjsTime = @p0');
        updates.push({ field: 'sccjjs', value: true });
        updates.push({ field: 'sccjjsTime', value: now });
        newBz = 30;
        // 清除缺料
        if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
        break;
      }
      case 'sccjyl': {
        // 缺料标记/解除（不推进 BZ）
        const val = parseInt(value);
        if (val === 1) {
          setParts.push('sccjyl = 1', 'sccjylTime = @p0');
          updates.push({ field: 'sccjyl', value: true });
          updates.push({ field: 'sccjylTime', value: now });
          newSccjyl = true;
        } else {
          setParts.push('sccjyl = 0');
          updates.push({ field: 'sccjyl', value: false });
          newSccjyl = false;
        }
        break;
      }
      case 'sccjdn': {
        setParts.push('sccjdn = 1', 'sccjdnTime = @p0');
        updates.push({ field: 'sccjdn', value: true });
        updates.push({ field: 'sccjdnTime', value: now });
        newBz = 60;
        // 自动清除缺料
        if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
        break;
      }
      case 'sccjsc': {
        setParts.push('sccjsc = 1', 'sccjscTime = @p0');
        updates.push({ field: 'sccjsc', value: true });
        updates.push({ field: 'sccjscTime', value: now });
        newBz = 70;
        // 自动清除缺料
        if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
        break;
      }
      case 'sccjwc': {
        setParts.push('sccjwc = 1', 'sccjwcTime = @p0');
        updates.push({ field: 'sccjwc', value: true });
        updates.push({ field: 'sccjwcTime', value: now });
        newBz = 80;
        // 自动清除缺料
        if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
        break;
      }
      default:
        return res.status(400).json({ error: `不支持的 action: ${action}` });
    }

    if (setParts.length === 0) {
      return res.status(400).json({ error: '无效操作' });
    }

    // 执行更新
    await db.query(
      `UPDATE ${table} SET ${setParts.join(', ')} WHERE ddbh = @ddbh`,
      [now, action === 'jhkdd_sample' ? 2 : 1, ddbh]
    );

    // 重新查询最新状态
    const updated = await db.queryOne(`SELECT * FROM ${table} WHERE ddbh = @p0`, [ddbh]);
    const fahuoQty = await getFahuoQuantity(updated.DD_id, product_type);

    res.json({
      success: true,
      ddbh,
      product_type,
      action,
      bz: calcBZ(updated),
      sccjyl: !!updated.sccjyl,
      current_step: getCurrentStepName(updated),
      fahuoQty,
      updates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败', detail: err.message });
  }
});

// ── 批量推进工序 ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/process/batch-advance:
 *   post:
 *     summary: 工序管理-批量推进工序
 *     tags: [工序]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orders, action]
 *             properties:
 *               orders:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     ddbh:
 *                       type: string
 *                     product_type:
 *                       type: string
 *               action:
 *                 type: string
 *                 description: 同 /advance 的 action
 *               value:
 *                 type: integer
 *                 description: sccjyl操作时的值
 *     responses:
 *       200:
 *         description: 批量操作结果
 */
router.post('/batch-advance', authMiddleware, async (req, res) => {
  try {
    const { orders = [], action, value } = req.body;
    if (!orders.length || !action) {
      return res.status(400).json({ error: 'orders 和 action 必填' });
    }

    const results = [];
    const failed = [];

    for (const { ddbh, product_type } of orders) {
      try {
        // 直接调用单个逻辑（复用上面的 switch）
        // 为避免代码重复，这里内联执行
        if (!TABLE_MAP[product_type]) {
          failed.push({ ddbh, product_type, reason: '无效产品类型' });
          continue;
        }
        const table = TABLE_MAP[product_type];
        const order = await db.queryOne(`SELECT * FROM ${table} WHERE ddbh = @p0`, [ddbh]);
        if (!order) {
          failed.push({ ddbh, product_type, reason: '订单不存在' });
          continue;
        }

        let setParts = [];
        const now = new Date();
        let newBz = calcBZ(order);
        let newSccjyl = !!order.sccjyl;

        switch (action) {
          case 'jhkdd':
          case 'jhkdd_sample':
            setParts = ['jhkddTime = @p0', 'jhkddClass = @p1'];
            newBz = 10;
            break;
          case 'jhkprint':
            setParts = ['jhkprint = 1', 'jhkprintTime = @p0'];
            newBz = 20;
            if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
            break;
          case 'sccjjs':
            setParts = ['sccjjs = 1', 'sccjjsTime = @p0'];
            newBz = 30;
            if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
            break;
          case 'sccjyl': {
            const val = parseInt(value);
            if (val === 1) {
              setParts = ['sccjyl = 1', 'sccjylTime = @p0'];
              newSccjyl = true;
            } else {
              setParts = ['sccjyl = 0'];
              newSccjyl = false;
            }
            break;
          }
          case 'sccjdn':
            setParts = ['sccjdn = 1', 'sccjdnTime = @p0'];
            newBz = 60;
            if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
            break;
          case 'sccjsc':
            setParts = ['sccjsc = 1', 'sccjscTime = @p0'];
            newBz = 70;
            if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
            break;
          case 'sccjwc':
            setParts = ['sccjwc = 1', 'sccjwcTime = @p0'];
            newBz = 80;
            if (order.sccjyl) { setParts.push('sccjyl = 0'); newSccjyl = false; }
            break;
          default:
            failed.push({ ddbh, product_type, reason: `不支持action: ${action}` });
            continue;
        }

        await db.query(
          `UPDATE ${table} SET ${setParts.join(', ')} WHERE ddbh = @ddbh`,
          [now, action === 'jhkdd_sample' ? 2 : 1, ddbh]
        );
        results.push({ ddbh, product_type, bz: newBz, sccjyl: newSccjyl });
      } catch (e) {
        failed.push({ ddbh, product_type, reason: e.message });
      }
    }

    res.json({
      success: true,
      processed: results.length,
      failed_count: failed.length,
      results,
      failed,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '批量操作失败', detail: err.message });
  }
});

module.exports = router;