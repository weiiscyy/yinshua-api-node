const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 产品表映射（对应旧系统 print_*/query_* ASP 文件的表结构）
// YS=印刷(吊牌), YM=印刷面(印唛), ZM=纸盒(织唛), DS=模切(丝网印)
const TABLE_MAP = {
  YS: { table: 'YS',  huahao: 'yjbhao', jijia: 'danjia' },
  YM: { table: 'YM',  huahao: 'yjbhao', jijia: 'danjia' },
  ZM: { table: 'ZM',  huahao: 'huahao',  jijia: 'danjia' },
  DS: { table: 'DS',  huahao: 'yjbhao',  jijia: 'jiage' },
};

const PRODUCT_NAMES = { YS: '印刷(吊牌)', YM: '印刷面(印唛)', ZM: '纸盒(织唛)', DS: '模切(丝网印)' };

// 查询结果统一字段
function buildRow(r, ptype) {
  const { table, huahao, jijia } = TABLE_MAP[ptype];
  const shuliang = parseFloat(r.shuliang) || 0;
  const jijiaVal = parseFloat(r[jijia]) || 0;
  const jiagongfeiVal = parseFloat(r.jiagongfei) || 0;

  const jijia_amount = parseFloat((shuliang * jijiaVal).toFixed(4));
  const jiagongfei_amount = parseFloat((shuliang * jiagongfeiVal).toFixed(4));
  const total_amount = parseFloat((jijia_amount + jiagongfei_amount).toFixed(4));

  return {
    product_type: ptype,
    product_name: PRODUCT_NAMES[ptype],
    DD_id: r.DD_id,
    prouddate: r.prouddate ? new Date(r.prouddate).toISOString().slice(0, 10) : '',
    company: r.company || '',
    fahuodanwei: r.fahuodanwei || '',
    kuanhao: r.kuanhao || '',
    huahao: r[huahao] || '',
    shuliang,
    jijia: jijiaVal,
    jiagongfei: jiagongfeiVal,
    waifa: r.waifa === true || r.waifa === 1 ? '是' : '否',
    jijia_amount,
    jiagongfei_amount,
    total_amount,
    ddbh: r.ddbh || '',
  };
}

// 综合查询
/**
 * @swagger
 * /api/query/query:
 *   get:
 *     summary: 综合查询订单
 *     tags: [查询]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 接单日期起
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 接单日期止
 *       - in: query
 *         name: company
 *         schema:
 *           type: string
 *         description: 客户名称（模糊搜索）
 *       - in: query
 *         name: huahao
 *         schema:
 *           type: string
 *         description: 花号/料号
 *       - in: query
 *         name: product_types
 *         schema:
 *           type: string
 *         description: 产品线，多个用逗号分隔（如 YS,YM）
 *     responses:
 *       200:
 *         description: 查询结果
 *       400:
 *         description: 缺少查询条件
 */
router.get('/query', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date, company, huahao, product_types, page = 1, page_size = 50 } = req.query;

    const types = product_types
      ? product_types.split(',').filter(t => TABLE_MAP[t])
      : Object.keys(TABLE_MAP);

    if (!start_date && !end_date && !company && !huahao) {
      return res.status(400).json({ error: '请至少输入一个查询条件' });
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size);
    const allRows = [];

    for (const ptype of types) {
      const { table, huahao: hhField } = TABLE_MAP[ptype];
      let sql = `SELECT * FROM ${table} WHERE 1=1`;
      const params = [];

      if (start_date) {
        sql += ` AND prouddate >= @p${params.length}`;
        params.push(start_date);
      }
      if (end_date) {
        sql += ` AND prouddate <= @p${params.length}`;
        params.push(end_date);
      }
      if (company) {
        sql += ` AND company LIKE @p${params.length}`;
        params.push(`%${company}%`);
      }
      if (huahao) {
        sql += ` AND ${hhField} LIKE @p${params.length}`;
        params.push(`%${huahao}%`);
      }

      sql += ' ORDER BY prouddate DESC, DD_id DESC';

      const rows = await db.query(sql, params);
      for (const r of rows) {
        allRows.push(buildRow(r, ptype));
      }
    }

    // 排序：日期降序
    allRows.sort((a, b) => (b.prouddate || '').localeCompare(a.prouddate || ''));

    const total = allRows.length;
    const items = allRows.slice(offset, offset + parseInt(page_size));

    res.json({ total, page: parseInt(page), page_size: parseInt(page_size), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 导出查询（限制最多10000条，防止内存溢出）
/**
 * @swagger
 * /api/query/export:
 *   get:
 *     summary: 导出综合查询结果（JSON 格式）
 *     tags: [查询]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *       - in: query
 *         name: end_date
 *       - in: query
 *         name: company
 *       - in: query
 *         name: huahao
 *       - in: query
 *         name: product_types
 *     responses:
 *       200:
 *         description: 导出 JSON 数据（最多 10000 条）
 */
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date, company, huahao, product_types } = req.query;

    const types = product_types
      ? product_types.split(',').filter(t => TABLE_MAP[t])
      : Object.keys(TABLE_MAP);

    const MAX_EXPORT = 10000;
    const allRows = [];

    for (const ptype of types) {
      const { table, huahao: hhField } = TABLE_MAP[ptype];
      let sql = `SELECT * FROM ${table} WHERE 1=1`;
      const params = [];

      if (start_date) {
        sql += ` AND prouddate >= @p${params.length}`;
        params.push(start_date);
      }
      if (end_date) {
        sql += ` AND prouddate <= @p${params.length}`;
        params.push(end_date);
      }
      if (company) {
        sql += ` AND company LIKE @p${params.length}`;
        params.push(`%${company}%`);
      }
      if (huahao) {
        sql += ` AND ${hhField} LIKE @p${params.length}`;
        params.push(`%${huahao}%`);
      }

      sql += ' ORDER BY prouddate DESC, DD_id DESC';

      const rows = await db.query(sql, params);
      for (const r of rows) {
        if (allRows.length >= MAX_EXPORT) break;
        allRows.push(buildRow(r, ptype));
      }
      if (allRows.length >= MAX_EXPORT) break;
    }

    allRows.sort((a, b) => (b.prouddate || '').localeCompare(a.prouddate || ''));

    // 返回 JSON 供前端转换 Excel
    res.json({ total: allRows.length, items: allRows, truncated: allRows.length >= MAX_EXPORT });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '导出查询失败', detail: err.message });
  }
});

// 最新订单（首页展示）
router.get('/latest', authMiddleware, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const allRows = [];

    for (const [ptype, { table, huahao }] of Object.entries(TABLE_MAP)) {
      const sql = `SELECT TOP ${parseInt(limit)} DD_id, ddbh, prouddate, company, ${huahao} as huahao, kuanhao, shuliang FROM ${table} WHERE prouddate = CAST(GETDATE() AS DATE) ORDER BY DD_id DESC`;
      const rows = await db.query(sql);
      for (const r of rows) {
        allRows.push({
          product_type: ptype,
          product_name: PRODUCT_NAMES[ptype],
          DD_id: r.DD_id,
          ddbh: r.ddbh,
          prouddate: r.prouddate ? new Date(r.prouddate).toISOString().slice(0, 10) : '',
          company: r.company || '',
          huahao: r.huahao || '',
          kuanhao: r.kuanhao || '',
          shuliang: parseFloat(r.shuliang) || 0,
        });
      }
    }

    // 按 DD_id 降序排
    allRows.sort((a, b) => b.DD_id - a.DD_id);
    res.json({ items: allRows.slice(0, parseInt(limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

module.exports = router;
