const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

async function query(sql, params = []) {
  const pool = await db.getPool();
  const req = pool.request();
  params.forEach(p => req.input(p[0], p[1], p[2]));
  return req.query(sql);
}

// 每日订单趋势（近30天）
router.get('/trend', authMiddleware, async function(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;
    const tables = ['YS', 'YM', 'ZM', 'DS'];
    const result = {};

    for (const table of tables) {
      // 参数化 days，防止注入（days 已是 parseInt 产物）
      const sql = `SELECT CONVERT(varchar(10), prouddate, 120) as date, COUNT(*) as cnt ` +
                  `FROM ${table} ` +
                  `WHERE prouddate >= DATEADD(day, -@days, CAST(GETDATE() AS DATE)) ` +
                  `GROUP BY CONVERT(varchar(10), prouddate, 120) ` +
                  `ORDER BY date`;
      const rows = await query(sql, [['days', db.mssql.Int, days]]);
      result[table] = rows.recordset;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '趋势数据查询失败', detail: err.message });
  }
});

// 各产品线统计（数量 + 完成率）
router.get('/overview', authMiddleware, async function(req, res) {
  try {
    const tables = ['YS', 'YM', 'ZM', 'DS'];
    const result = {};

    for (const table of tables) {
      const sql = `SELECT ` +
                  `COUNT(*) as total, ` +
                  `SUM(CASE WHEN ZT = 1 THEN 1 ELSE 0 END) as completed, ` +
                  `SUM(CASE WHEN ZT = 0 AND (fahuo IS NULL OR fahuo = 0) THEN 1 ELSE 0 END) as in_progress, ` +
                  `SUM(CASE WHEN fahuo = 1 THEN 1 ELSE 0 END) as shipped ` +
                  `FROM ${table}`;
      const rows = await query(sql, []);
      const r = rows.recordset[0];
      result[table] = {
        total: r.total || 0,
        completed: r.completed || 0,
        in_progress: r.in_progress || 0,
        shipped: r.shipped || 0,
      };
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '统计查询失败', detail: err.message });
  }
});

// 在制订单状态分布（按ZT值分布）
router.get('/status_dist', authMiddleware, async function(req, res) {
  try {
    const tables = ['YS', 'YM', 'ZM', 'DS'];
    const result = {};

    for (const table of tables) {
      const sql = `SELECT ZT, fahuo, COUNT(*) as cnt FROM ${table} GROUP BY ZT, fahuo`;
      const rows = await query(sql, []);
      const dist = { '0_0': 0, '0_1': 0, '1_0': 0, '1_1': 0 };
      rows.recordset.forEach(r => {
        const key = r.ZT + '_' + (r.fahuo || 0);
        dist[key] = r.cnt;
      });
      result[table] = dist;
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '状态分布查询失败', detail: err.message });
  }
});

// 业务员业绩统计
router.get('/ywy_stats', authMiddleware, async function(req, res) {
  try {
    const tables = ['YS', 'YM', 'ZM', 'DS'];
    const allRows = [];

    for (const table of tables) {
      const sql = `SELECT u.UserName as ywy_name, COUNT(*) as order_count, ` +
                  `SUM(CASE WHEN ZT = 1 THEN 1 ELSE 0 END) as completed ` +
                  `FROM ${table} o ` +
                  `LEFT JOIN UserInfo u ON o.ywy = u.Userid ` +
                  `WHERE o.ywy IS NOT NULL ` +
                  `GROUP BY u.UserName ` +
                  `ORDER BY order_count DESC`;
      const rows = await query(sql, []);
      rows.recordset.forEach(r => {
        r.product_type = table;
        allRows.push(r);
      });
    }

    // 按业务员汇总
    const ywyMap = {};
    allRows.forEach(r => {
      const name = r.ywy_name || '未知';
      if (!ywyMap[name]) ywyMap[name] = { ywy_name: name, order_count: 0, completed: 0, products: {} };
      ywyMap[name].order_count += r.order_count;
      ywyMap[name].completed += r.completed;
      ywyMap[name].products[r.product_type] = r.order_count;
    });

    const ywyList = Object.values(ywyMap).sort((a, b) => b.order_count - a.order_count);
    res.json(ywyList.slice(0, 50));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '业务员统计查询失败', detail: err.message });
  }
});

module.exports = router;
