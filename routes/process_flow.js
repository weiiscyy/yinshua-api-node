const express = require('express');
const mssql = require('mssql');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { TABLE_MAP, PRODUCT_NAMES } = require('../utils/progress');

const router = express.Router();

// BZ 定义（对齐旧系统 liuchengPk.asp）
// 10=接单, 20=打印/晒版, 30=车间接收(仅写sccjjs字段), 40=缺料, 50=电脑, 60=生产, 70=完成
const BZ_STEPS = [
  { field: 'jhkddClass', label: '接单',      bz: 10 },
  { field: 'jhkprint',   label: '打印/晒版',  bz: 20 },
  { field: null,          label: '车间接收',   bz: 30 },
  { field: 'sccjyl',    label: '缺料',        bz: 40 },
  { field: 'sccjdn',    label: '电脑',        bz: 50 },
  { field: 'sccjsc',   label: '生产',        bz: 60 },
  { field: 'sccjwc',   label: '完成',        bz: 70 },
];

// 根据字段值计算BZ（对齐旧系统）
function calcBZ(order) {
  if (order.sccjwc)     return 70;
  if (order.sccjsc)    return 60;
  if (order.sccjdn)     return 50;
  if (order.sccjyl)    return 40;
  if (order.sccjjs)    return 30;
  if (order.jhkprint)  return 20;
  if (order.jhkddClass) return 10;
  return 0;
}

// 获取当前工序名称
function getCurrentStepName(order) {
  if (order.fahuo)       return '已发货';
  if (order.sccjwc)     return '已完成';
  if (order.sccjsc)     return '生产';
  if (order.sccjdn)     return '电脑';
  if (order.sccjyl)     return '缺料中';
  if (order.sccjjs)     return '车间接收';
  if (order.jhkprint)   return '打印/晒版';
  if (order.jhkddClass) return '接单';
  return '待接单';
}

// ── 查询订单工序列表（SQL分页） ───────────────────────────────────────
router.get('/orders', authMiddleware, async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const {
      product_type, bz_min, bz_max, sccjyl,
      date_from, date_to, keyword,
      page = 1, page_size = 50,
    } = req.query;

    const types = product_type && TABLE_MAP[product_type]
      ? [product_type]
      : ['YS', 'YM', 'ZM', 'DS'];

    const pageNum  = Math.max(1, parseInt(page));
    const pageSize = Math.min(100, Math.max(1, parseInt(page_size)));

    // ── 统一 WHERE 片段 ─────────────────────────────────────────────────
    const buildWhere = (table) => {
      const conditions = ['1=1'];
      const params = [];
      let pi = 0;

      if (sccjyl !== undefined) {
        conditions.push(`sccjyl = @p${pi++}`);
        params.push(parseInt(sccjyl));
      }
      if (date_from) {
        conditions.push(`${table}.jhkddTime >= @p${pi++}`);
        params.push(date_from);
      }
      if (date_to) {
        conditions.push(`${table}.jhkddTime <= @p${pi++}`);
        params.push(date_to + 'T23:59:59');
      }
      if (keyword) {
        conditions.push(`(${table}.ddbh LIKE @p${pi} OR ${table}.company LIKE @p${pi})`);
        params.push('%' + keyword + '%');
        pi++;
      }
      if (bz_min !== undefined || bz_max !== undefined) {
        const bzExpr = `
          CASE WHEN ${table}.sccjwc = 1 THEN 70
               WHEN ${table}.sccjsc = 1 THEN 60
               WHEN ${table}.sccjdn = 1 THEN 50
               WHEN ${table}.sccjyl = 1 THEN 40
               WHEN ${table}.sccjjs = 1 THEN 30
               WHEN ${table}.jhkprint = 1 THEN 20
               WHEN ${table}.jhkddClass IS NOT NULL THEN 10
               ELSE 0 END`;
        if (bz_min !== undefined) {
          conditions.push(`${bzExpr} >= @p${pi++}`);
          params.push(parseInt(bz_min));
        }
        if (bz_max !== undefined) {
          conditions.push(`${bzExpr} <= @p${pi++}`);
          params.push(parseInt(bz_max));
        }
      }
      return { conditions, params };
    };

    // ── 第一步：各表查总数 & 预取行数 ───────────────────────────────────
    // 为每个表计算：需要取前 N 条（pageNum * pageSize），以便 JS 层全局排序分页
    let totalAll = 0;
    const tableCounts = {};  // { YS: { count, rows: [] } }

    for (const ptype of types) {
      const table = TABLE_MAP[ptype];
      const { conditions, params } = buildWhere(table);

      const cntR = await db.queryOne(
        `SELECT COUNT(*) as cnt FROM ${table} WHERE ${conditions.join(' AND ')}`,
        params
      );
      totalAll += cntR.cnt;
      tableCounts[ptype] = { count: cntR.cnt, rows: [] };
    }

    // ── 第二步：分表取足够行（TOP pageNum*pageSize）──────────────────────
    const needRows = pageNum * pageSize; // 每表至少取到第几行
    for (const ptype of types) {
      const table = TABLE_MAP[ptype];
      const { conditions, params } = buildWhere(table);

      const sql = `
        SELECT TOP ${needRows} *
        FROM ${table}
        WHERE ${conditions.join(' AND ')}
        ORDER BY DD_id DESC`;

      const rows = await db.query(sql, params);
      tableCounts[ptype].rows = rows;
    }

    // ── 第三步：JS 聚合所有表行，全局排序后精确分页 ─────────────────────
    const allResults = [];

    for (const ptype of types) {
      const { rows } = tableCounts[ptype];
      for (const order of rows) {
        const bz = calcBZ(order);
        allResults.push({
          DD_id:         order.DD_id,
          ddbh:          order.ddbh,
          product_type:  ptype,
          product_name:  PRODUCT_NAMES[ptype],
          company:       order.company,
          bz,
          current_step:  getCurrentStepName(order),
          jhkddTime:     order.jhkddTime  ? new Date(order.jhkddTime).toISOString() : null,
          jhkprint:      !!order.jhkprint,
          jhkprintTime:  order.jhkprintTime ? new Date(order.jhkprintTime).toISOString() : null,
          sccjjs:        !!order.sccjjs,
          sccjjsTime:    order.sccjjsTime  ? new Date(order.sccjjsTime).toISOString() : null,
          sccjyl:        !!order.sccjyl,
          sccjylTime:    order.sccjylTime  ? new Date(order.sccjylTime).toISOString() : null,
          sccjdn:        !!order.sccjdn,
          sccjdnTime:    order.sccjdnTime  ? new Date(order.sccjdnTime).toISOString() : null,
          sccjsc:        !!order.sccjsc,
          sccjscTime:    order.sccjscTime  ? new Date(order.sccjscTime).toISOString() : null,
          sccjwc:        !!order.sccjwc,
          sccjwcTime:    order.sccjwcTime  ? new Date(order.sccjwcTime).toISOString() : null,
          fahuo:         !!order.fahuo,
          fahuoTime:     order.fahuoTime   ? new Date(order.fahuoTime).toISOString() : null,
          shuliang:      parseFloat(order.shuliang) || 0,
        });
      }
    }

    // 全局按 DD_id 降序排列
    allResults.sort((a, b) => b.DD_id - a.DD_id);

    // 精确分页切片
    const offset = (pageNum - 1) * pageSize;
    const pageItems = allResults.slice(offset, offset + pageSize);

    // ── 第四步：批量取发货数量 ─────────────────────────────────────────
    const ddIds = pageItems.map(r => r.DD_id).filter(Boolean);
    let fahuoMap = {};
    if (ddIds.length > 0) {
      const placeholders = ddIds.map((_, i) => `@p${i}`).join(',');
      const fhRows = await db.query(
        `SELECT dd_id, SUM(CAST(shuliang_sent AS FLOAT)) as total
         FROM FahuoOrder
         WHERE dd_id IN (${placeholders})
         GROUP BY dd_id`,
        ddIds
      );
      for (const fh of fhRows) {
        fahuoMap[fh.dd_id] = parseFloat(fh.total) || 0;
      }
    }
    pageItems.forEach(item => {
      item.fahuoQty = fahuoMap[item.DD_id] || null;
    });

    res.json({
      total: totalAll,
      page: pageNum,
      page_size: pageSize,
      items: pageItems,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 推进/回退单个工序 ────────────────────────────────────────────────
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

    const order = await db.queryOne(
      `SELECT * FROM ${table} WHERE ddbh = @p0`,
      [ddbh]
    );
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }

    // 各操作字段定义（BZ 值对齐旧系统）
    const OPERATIONS = {
      jhkdd: {
        fields: [
          { col: 'jhkddClass', val: 1 },
          { col: 'jhkddTime',  val: () => new Date() },
          { col: 'BZSM',       val: value === 1 ? '计划科,生产订单' : '计划科,打样单' },
        ]
      },
      jhkprint: {
        fields: [
          { col: 'jhkprint',     val: 1 },
          { col: 'jhkprintTime', val: () => new Date() },
        ]
      },
      sccjjs: {
        fields: [
          { col: 'sccjjs',     val: 1 },
          { col: 'sccjjsTime', val: () => new Date() },
        ]
      },
      sccjyl: {
        fields: [
          { col: 'sccjyl',     val: value === 0 ? 0 : 1 },
          { col: 'sccjylTime', val: () => new Date() },
        ]
      },
      sccjdn: {
        fields: [
          { col: 'sccjdn',     val: 1 },
          { col: 'sccjdnTime', val: () => new Date() },
          { col: 'sccjyl',     val: 0 },
          { col: 'sccjylTime', val: 0 },
        ]
      },
      sccjsc: {
        fields: [
          { col: 'sccjsc',     val: 1 },
          { col: 'sccjscTime', val: () => new Date() },
          { col: 'sccjyl',     val: 0 },
          { col: 'sccjylTime', val: 0 },
        ]
      },
      sccjwc: {
        fields: [
          { col: 'sccjwc',     val: 1 },
          { col: 'sccjwcTime', val: () => new Date() },
          { col: 'sccjyl',     val: 0 },
          { col: 'sccjylTime', val: 0 },
        ]
      },
      fahuo: {
        fields: [
          { col: 'fahuo',     val: 1 },
          { col: 'fahuoTime', val: () => new Date() },
        ]
      },
    };

    const op = OPERATIONS[action];
    if (!op) {
      return res.status(400).json({ error: `未知操作：${action}` });
    }

    const updates = [];
    const params = [];
    let pi = 0;

    for (const { col, val } of op.fields) {
      updates.push(`${col} = @p${pi++}`);
      params.push(typeof val === 'function' ? val() : val);
    }

    params.push(ddbh);

    await db.query(
      `UPDATE ${table} SET ${updates.join(', ')} WHERE ddbh = @p${pi}`,
      params
    );

    const updated = await db.queryOne(
      `SELECT * FROM ${table} WHERE ddbh = @p0`,
      [ddbh]
    );

    res.json({
      success: true,
      ddbh,
      product_type,
      action,
      bz: calcBZ(updated),
      current_step: getCurrentStepName(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '操作失败', detail: err.message });
  }
});

// ── 批量推进工序 ────────────────────────────────────────────────────
router.post('/batch-advance', authMiddleware, async (req, res) => {
  try {
    const { items, action } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 必填' });
    }
    if (!action) {
      return res.status(400).json({ error: 'action 必填' });
    }
    if (items.length > 50) {
      return res.status(400).json({ error: '最多50条/批' });
    }

    const ACTION_FIELDS = {
      jhkdd:    [{ col: 'jhkddClass', val: 1 }, { col: 'jhkddTime', val: () => new Date() }],
      jhkprint: [{ col: 'jhkprint', val: 1 }, { col: 'jhkprintTime', val: () => new Date() }],
      sccjjs:   [{ col: 'sccjjs', val: 1 }, { col: 'sccjjsTime', val: () => new Date() }],
      sccjyl:   [{ col: 'sccjyl', val: 1 }, { col: 'sccjylTime', val: () => new Date() }],
      sccjdn:   [{ col: 'sccjdn', val: 1 }, { col: 'sccjdnTime', val: () => new Date() }, { col: 'sccjyl', val: 0 }, { col: 'sccjylTime', val: 0 }],
      sccjsc:   [{ col: 'sccjsc', val: 1 }, { col: 'sccjscTime', val: () => new Date() }, { col: 'sccjyl', val: 0 }, { col: 'sccjylTime', val: 0 }],
      sccjwc:   [{ col: 'sccjwc', val: 1 }, { col: 'sccjwcTime', val: () => new Date() }, { col: 'sccjyl', val: 0 }, { col: 'sccjylTime', val: 0 }],
      fahuo:    [{ col: 'fahuo', val: 1 }, { col: 'fahuoTime', val: () => new Date() }],
    };

    const fieldDefs = ACTION_FIELDS[action];
    if (!fieldDefs) {
      return res.status(400).json({ error: `未知操作：${action}` });
    }

    const byType = {};
    for (const item of items) {
      if (!TABLE_MAP[item.product_type]) continue;
      if (!byType[item.product_type]) byType[item.product_type] = [];
      byType[item.product_type].push(item.ddbh);
    }

    const results = [];
    for (const [ptype, ddbhs] of Object.entries(byType)) {
      const table = TABLE_MAP[ptype];
      const fieldVals = [];
      const updates = [];
      for (const { col, val } of fieldDefs) {
        updates.push(`${col} = @p${fieldVals.length}`);
        fieldVals.push(typeof val === 'function' ? val() : val);
      }

      await db.query(
        `UPDATE ${table} SET ${updates.join(', ')} WHERE ddbh IN (${ddbhs.map(d => `'${d}'`).join(',')})`,
        fieldVals
      );

      for (const ddbh of ddbhs) {
        results.push({ ddbh, product_type: ptype, action, success: true });
      }
    }

      res.json({ success: true, results, processed: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '批量操作失败', detail: err.message });
  }
});

module.exports = router;
