const express = require('express');
const db = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { PRODUCT_NAMES, TABLE_MAP } = require('../utils/progress');

const router = express.Router();

// 工序步骤定义（production.js 专用，查库用 jhkdd 列名）
const STEPS = [
  { field: 'jhkdd',    label: '接单',     order: 1, timeField: 'jhkddTime' },
  { field: 'jhkprint', label: '打印',     order: 2, timeField: 'jhkprintTime' },
  { field: 'sccjjs',   label: '车间接收', order: 3, timeField: 'sccjjsTime' },
  { field: 'sccjyl',   label: '预领料',   order: 4, timeField: 'sccjylTime' },
  { field: 'sccjdn',   label: '电脑制版', order: 5, timeField: 'sccjdnTime' },
  { field: 'sccjsc',   label: '生产',     order: 6, timeField: 'sccjscTime' },
  { field: 'sccjwc',   label: '完成',     order: 7, timeField: 'sccjwcTime' },
  { field: 'hzljs',    label: '汇总',     order: 8, timeField: 'hzljsTime' },
  { field: 'fahuo',    label: '发货',     order: 9, timeField: 'fahuoTime' },
];

// 按产品线过滤工序
function getStepsForType(productType) {
  if (productType === 'YS') {
    return STEPS.filter(s =>
      ['jhkdd', 'jhkprint', 'sccjjs', 'sccjyl', 'sccjdn', 'sccjsc', 'sccjwc', 'hzljs', 'fahuo'].includes(s.field)
    );
  }
  return STEPS;
}

// 获取可报工的订单列表
/**
 * @swagger
 * /api/production/orders:
 *   get:
 *     summary: 获取可报工的订单列表
 *     tags: [生产]
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
 *         description: 可报工订单列表
 */
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const { product_type, page = 1, page_size = 20 } = req.query;
    const types = product_type && TABLE_MAP[product_type] ? [product_type] : Object.keys(TABLE_MAP);
    const results = [];
    const offset = (parseInt(page) - 1) * parseInt(page_size);

    for (const ptype of types) {
      const table = TABLE_MAP[ptype];
      // 只查进行中的订单（未发货）
      const sql = `SELECT TOP 200 * FROM ${table} WHERE (fahuo IS NULL OR fahuo = 0) AND ZT = 0 ORDER BY DD_id DESC`;
      const rows = await db.query(sql);

      for (const order of rows) {
        const steps = getStepsForType(ptype);
        
        // 找当前可报工的工序（第一个未完成的）
        let currentStep = null;
        let nextStep = null;
        let completedCount = 0;
        
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const completed = order[s.field] === true || order[s.field] === 1;
          if (completed) {
            completedCount++;
          } else if (!currentStep) {
            currentStep = s;
            nextStep = steps[i + 1] || null;
          }
        }

        // 计算已报工总量（从BaoGongLog）
        let totalReported = 0;
        if (currentStep) {
          const bgResult = await db.queryOne(
            `SELECT SUM(BaoChanNum) as total FROM BaoGongLog WHERE DD_id = @p0 AND ProductType = @p1 AND GongXuField = @p2`,
            [order.DD_id, ptype, currentStep.field]
          );
          totalReported = parseFloat(bgResult?.total) || 0;
        }

        results.push({
          DD_id: order.DD_id,
          ddbh: order.ddbh,
          product_type: ptype,
          product_name: PRODUCT_NAMES[ptype],
          company: order.company,
          shuliang: parseFloat(order.shuliang) || 0,
          prouddate: order.prouddate ? new Date(order.prouddate).toISOString().slice(0, 10) : null,
          current_step: currentStep?.field || null,
          current_step_name: currentStep?.label || '已完成',
          next_step: nextStep?.field || null,
          next_step_name: nextStep?.label || null,
          completed_steps: completedCount,
          total_steps: steps.length,
          can_report: !!currentStep,
          progress_percent: steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 100,
          total_reported: totalReported,
          remain: Math.max(0, (parseFloat(order.shuliang) || 0) - totalReported),
        });
      }
    }

    // 按DD_id降序
    results.sort((a, b) => b.DD_id - a.DD_id);
    const total = results.length;
    const items = results.slice(offset, offset + parseInt(page_size));

    res.json({ total, page: parseInt(page), page_size: parseInt(page_size), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 获取订单报工状态详情
/**
 * @swagger
 * /api/production/order/{dd_id}:
 *   get:
 *     summary: 获取订单报工状态详情
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dd_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: product_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *     responses:
 *       200:
 *         description: 订单报工详情
 *       400:
 *         description: 请指定产品类型
 *       404:
 *         description: 订单不存在
 */
router.get('/order/:dd_id', authMiddleware, async (req, res) => {
  try {
    const { dd_id } = req.params;
    const { product_type } = req.query;
    
    if (!product_type || !TABLE_MAP[product_type]) {
      return res.status(400).json({ error: '请指定产品类型' });
    }

    const order = await db.queryOne(
      `SELECT * FROM ${TABLE_MAP[product_type]} WHERE DD_id = @p0`,
      [parseInt(dd_id)]
    );

    if (!order) return res.status(404).json({ error: '订单不存在' });

    const steps = getStepsForType(product_type);
    const stepDetails = [];
    let totalReported = 0;
    let totalShuliang = parseFloat(order.shuliang) || 0;
    let foundFirstUncompleted = false;

    for (const s of steps) {
      const completed = order[s.field] === true || order[s.field] === 1;
      const isCurrentStep = !completed && !foundFirstUncompleted;
      if (isCurrentStep) foundFirstUncompleted = true;
      
      // 获取该工序报工汇总
      const bgResult = await db.queryOne(
        `SELECT SUM(BaoChanNum) as total, SUM(BuLiangNum) as buliang, COUNT(*) as times FROM BaoGongLog WHERE DD_id = @p0 AND GongXuField = @p1`,
        [parseInt(dd_id), s.field]
      );

      const gongxuTotal = parseFloat(bgResult?.total) || 0;
      const gongxuBuliang = parseFloat(bgResult?.buliang) || 0;
      if (completed) totalReported += gongxuTotal;

      // 获取最新一条报工记录
      const lastReport = await db.queryOne(
        `SELECT top 1 * FROM BaoGongLog WHERE DD_id = @p0 AND GongXuField = @p1 ORDER BY BaoGongTime DESC`,
        [parseInt(dd_id), s.field]
      );

      stepDetails.push({
        field: s.field,
        label: s.label,
        order: s.order,
        completed,
        completed_at: order[s.timeField] ? new Date(order[s.timeField]).toISOString() : null,
        can_report: isCurrentStep,  // 只有第一个未完成工序可报工
        total_reported: gongxuTotal,
        total_buliang: gongxuBuliang,
        report_times: bgResult?.times || 0,
        last_report: lastReport ? {
          worker_name: lastReport.WorkerName,
          baochan_num: parseFloat(lastReport.BaoChanNum),
          buliang_num: parseFloat(lastReport.BuLiangNum),
          buliang_reason: lastReport.BuLiangReason || null,
          gongxu_color: lastReport.GongXuColor || null,
          time: new Date(lastReport.BaoGongTime).toISOString(),
          remark: lastReport.Remark,
        } : null,
      });
    }

    // 当前可报工工序
    const currentStep = stepDetails.find(s => !s.completed && s.can_report);

    // remain 计算要包含当前工序的已报数量（不能只看已 JHK 完成的工序）
    // 已完成工序的报工总量 + 当前工序的报工量 = 实际已报总量
    const currentStepReported = currentStep ? currentStep.total_reported : 0;
    const effectiveReported = totalReported + currentStepReported;

    // 颜色选项：YS/YM 从订单的 ysdw1-9 + ysdw10(UV) 提取
    const colorOptions = [];
    if (product_type === 'YS' || product_type === 'YM') {
      const colorFields = [
        { key: 'ysdw1', label: '色1' }, { key: 'ysdw2', label: '色2' },
        { key: 'ysdw3', label: '色3' }, { key: 'ysdw4', label: '色4' },
        { key: 'ysdw5', label: '色5' }, { key: 'ysdw6', label: '色6' },
        { key: 'ysdw7', label: '色7' }, { key: 'ysdw8', label: '色8' },
        { key: 'ysdw9', label: '色9' }, { key: 'ysdw10', label: 'UV' },
      ];
      for (const c of colorFields) {
        if (order[c.key]) colorOptions.push({ value: c.label, label: `${c.label}（${order[c.key]}）` });
      }
    }

    res.json({
      DD_id: order.DD_id,
      ddbh: order.ddbh,
      product_type,
      product_name: PRODUCT_NAMES[product_type],
      company: order.company,
      shuliang: totalShuliang,
      prouddate: order.prouddate ? new Date(order.prouddate).toISOString().slice(0, 10) : null,
      steps: stepDetails,
      current_step: currentStep ? { field: currentStep.field, label: currentStep.label } : null,
      color_options: colorOptions,
      total_reported: totalReported,
      total_reported_incl_current: effectiveReported,
      remain: Math.max(0, totalShuliang - effectiveReported),
      all_reported: effectiveReported >= totalShuliang,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 提交报工
/**
 * @swagger
 * /api/production/report:
 *   post:
 *     summary: 提交报工
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dd_id, product_type, gongxu_field, baochan_num]
 *             properties:
 *               dd_id:
 *                 type: integer
 *                 description: 订单ID
 *               product_type:
 *                 type: string
 *                 enum: [YS, YM, ZM, DS]
 *                 description: 产品类型
 *               gongxu_field:
 *                 type: string
 *                 description: 工序字段名
 *               gongxu_color:
 *                 type: string
 *                 nullable: true
 *                 description: 工序颜色
 *               baochan_num:
 *                 type: number
 *                 description: 报产数量
 *               buliang_num:
 *                 type: number
 *                 description: 不良数量（默认0）
 *               buliang_reason:
 *                 type: string
 *                 nullable: true
 *                 description: 不良原因
 *               remark:
 *                 type: string
 *                 description: 备注
 *     responses:
 *       200:
 *         description: 报工成功
 *       400:
 *         description: 参数错误或不允许报工
 *       404:
 *         description: 订单不存在
 *       500:
 *         description: 报工失败
 */
router.post('/report', authMiddleware, async (req, res) => {
  try {
    const {
      dd_id, product_type, gongxu_field,
      gongxu_color = null,
      baochan_num, buliang_num = 0,
      buliang_reason = null,
      remark = '',
    } = req.body;

    if (!dd_id || !product_type || !gongxu_field) {
      return res.status(400).json({ error: '参数不完整' });
    }
    if (!TABLE_MAP[product_type]) {
      return res.status(400).json({ error: '无效的产品类型' });
    }

    const baochan = parseFloat(baochan_num);
    const buliang = parseFloat(buliang_num);
    if (isNaN(baochan) || baochan <= 0) {
      return res.status(400).json({ error: '报产数量必须大于0' });
    }
    if (buliang < 0 || buliang > baochan) {
      return res.status(400).json({ error: '不良数量不能为负或超过报产数量' });
    }

    // 获取订单
    const order = await db.queryOne(
      `SELECT * FROM ${TABLE_MAP[product_type]} WHERE DD_id = @p0`,
      [parseInt(dd_id)]
    );
    if (!order) return res.status(404).json({ error: '订单不存在' });

    // 检查工序是否可以报工
    if (!canReportStep(order, gongxu_field)) {
      return res.status(400).json({ error: '前序工序未完成，无法报工' });
    }

    // 获取工序名称
    const stepDef = STEPS.find(s => s.field === gongxu_field);
    if (!stepDef) return res.status(400).json({ error: '无效的工序' });

    // 计算已报工总量
    const bgResult = await db.queryOne(
      `SELECT SUM(BaoChanNum) as total FROM BaoGongLog WHERE DD_id = @p0 AND GongXuField = @p1`,
      [parseInt(dd_id), gongxu_field]
    );
    const currentTotal = parseFloat(bgResult?.total) || 0;
    const orderShuliang = parseFloat(order.shuliang) || 0;
    const afterReport = currentTotal + baochan;

    // 检查是否超产（允许小幅超产，这里限制10%以内）
    if (afterReport > orderShuliang * 1.1) {
      return res.status(400).json({ 
        error: '报产数量将超过订单总量110%，请确认',
        current_total: currentTotal,
        order_shuliang: orderShuliang,
        after_report: afterReport,
      });
    }

    // 插入报工记录
    const insertResult = await db.queryOne(
      `INSERT INTO BaoGongLog (DD_id, ProductType, GongXuField, GongXuName, GongXuColor, WorkerID, WorkerName, BaoChanNum, BuLiangNum, BuLiangReason, BaoGongTime, Remark)
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, GETDATE(), @p10);
       SELECT SCOPE_IDENTITY() as newId;`,
      [parseInt(dd_id), product_type, gongxu_field, stepDef.label, gongxu_color || null,
       req.user.username || '', req.user.name || req.user.username || '未知',
       baochan, buliang, buliang_reason || null, remark]
    );

    const newId = insertResult.newId;

    // 注意：报工只记录产量，不自动完工工序
    // 工序完工需要在订单详情页单独操作

    res.json({
      success: true,
      message: '报工成功',
      data: {
        id: newId,
        dd_id: parseInt(dd_id),
        gongxu_field,
        gongxu_name: stepDef.label,
        gongxu_color: gongxu_color || null,
        baochan_num: baochan,
        buliang_num: buliang,
        buliang_reason: buliang_reason || null,
        hege_num: baochan - buliang,
        worker_name: req.user.name || req.user.username || '未知',
        bao_time: new Date().toISOString(),
        total_reported: afterReport,
        remain: Math.max(0, orderShuliang - afterReport),
        all_reported: afterReport >= orderShuliang,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '报工失败', detail: err.message });
  }
});

// 我的报工记录
/**
 * @swagger
 * /api/production/my-reports:
 *   get:
 *     summary: 获取我的报工记录
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: 筛选日期
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
 *         description: 报工记录列表
 */
router.get('/my-reports', authMiddleware, async (req, res) => {
  try {
    const { date, page = 1, page_size = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(page_size);
    
    let sql = 'SELECT * FROM BaoGongLog WHERE WorkerID = @p0';
    let countSql = 'SELECT COUNT(*) as cnt FROM BaoGongLog WHERE WorkerID = @p0';
    const params = [req.user.username || ''];

    if (date) {
      sql += ' AND CAST(BaoGongTime AS DATE) = @p' + params.length;
      countSql += ' AND CAST(BaoGongTime AS DATE) = @p' + params.length;
      params.push(date);
    }

    sql += ' ORDER BY BaoGongTime DESC';

    const [rows, countResult] = await Promise.all([
      db.query(sql, params),
      db.queryOne(countSql, params),
    ]);

    const items = rows.map(r => ({
      id: r.ID,
      dd_id: r.DD_id,
      product_type: r.ProductType,
      product_name: PRODUCT_NAMES[r.ProductType],
      gongxu_field: r.GongXuField,
      gongxu_name: r.GongXuName,
      gongxu_color: r.GongXuColor || null,
      baochan_num: parseFloat(r.BaoChanNum),
      buliang_num: parseFloat(r.BuLiangNum),
      buliang_reason: r.BuLiangReason || null,
      hege_num: parseFloat(r.BaoChanNum) - parseFloat(r.BuLiangNum),
      worker_name: r.WorkerName,
      bao_time: new Date(r.BaoGongTime).toISOString(),
      remark: r.Remark,
    }));

    res.json({
      total: countResult.cnt,
      page: parseInt(page),
      page_size: parseInt(page_size),
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 工人产量统计
/**
 * @swagger
 * /api/production/stats/worker:
 *   get:
 *     summary: 工人产量统计
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 开始日期
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 结束日期
 *     responses:
 *       200:
 *         description: 工人产量统计
 */
router.get('/stats/worker', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let sql = 'SELECT WorkerID, WorkerName, ProductType, GongXuField, GongXuName,';
    sql += ' SUM(BaoChanNum) as total_baochan, SUM(BuLiangNum) as total_buliang, COUNT(*) as report_times';
    sql += ' FROM BaoGongLog WHERE 1=1';
    
    const params = [];
    if (start_date) {
      sql += ' AND BaoGongTime >= @p' + params.length;
      params.push(start_date);
    }
    if (end_date) {
      sql += ' AND BaoGongTime <= @p' + params.length;
      params.push(end_date);
    }
    
    sql += ' GROUP BY WorkerID, WorkerName, ProductType, GongXuField, GongXuName';
    sql += ' ORDER BY WorkerID, GongXuField';

    const rows = await db.query(sql, params);
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 订单报工明细
/**
 * @swagger
 * /api/production/stats/order/{dd_id}:
 *   get:
 *     summary: 订单报工明细
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dd_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: product_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *     responses:
 *       200:
 *         description: 订单报工明细
 *       400:
 *         description: 请指定产品类型
 */
router.get('/stats/order/:dd_id', authMiddleware, async (req, res) => {
  try {
    const { dd_id } = req.params;
    const { product_type } = req.query;
    
    if (!product_type) return res.status(400).json({ error: '请指定产品类型' });

    const rows = await db.query(
      `SELECT * FROM BaoGongLog WHERE DD_id = @p0 AND ProductType = @p1 ORDER BY BaoGongTime DESC`,
      [parseInt(dd_id), product_type]
    );

    const items = rows.map(r => ({
      id: r.ID,
      dd_id: r.DD_id,
      product_type: r.ProductType,
      gongxu_field: r.GongXuField,
      gongxu_name: r.GongXuName,
      gongxu_color: r.GongXuColor || null,
      worker_name: r.WorkerName,
      baochan_num: parseFloat(r.BaoChanNum),
      buliang_num: parseFloat(r.BuLiangNum),
      buliang_reason: r.BuLiangReason || null,
      hege_num: parseFloat(r.BaoChanNum) - parseFloat(r.BuLiangNum),
      bao_time: new Date(r.BaoGongTime).toISOString(),
      remark: r.Remark,
    }));

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 不良原因统计
/**
 * @swagger
 * /api/production/stats/defects:
 *   get:
 *     summary: 不良原因统计
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 开始日期
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: 结束日期
 *       - in: query
 *         name: product_type
 *         schema:
 *           type: string
 *           enum: [YS, YM, ZM, DS]
 *         description: 产品类型
 *     responses:
 *       200:
 *         description: 不良原因统计
 */
router.get('/stats/defects', authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date, product_type } = req.query;

    let sql = `SELECT BuLiangReason, ProductType, GongXuField, GongXuName,
                      SUM(BuLiangNum) as total_buliang, COUNT(*) as report_times
               FROM BaoGongLog WHERE BuLiangNum > 0 AND BuLiangReason IS NOT NULL`;
    const params = [];

    if (start_date) {
      sql += ` AND BaoGongTime >= @p${params.length}`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND BaoGongTime <= @p${params.length}`;
      params.push(end_date);
    }
    if (product_type) {
      sql += ` AND ProductType = @p${params.length}`;
      params.push(product_type);
    }

    sql += ' GROUP BY BuLiangReason, ProductType, GongXuField, GongXuName ORDER BY total_buliang DESC';

    const rows = await db.query(sql, params);

    // 总计
    let totalSql = `SELECT SUM(BuLiangNum) as total FROM BaoGongLog WHERE BuLiangNum > 0`;
    if (start_date) { totalSql += ` AND BaoGongTime >= @p0`; }
    if (end_date) { totalSql += ` AND BaoGongTime <= @p${start_date ? 1 : 0}`; }

    const totalResult = await db.queryOne(totalSql, params);

    res.json({
      total_buliang: parseFloat(totalResult?.total) || 0,
      items: rows.map(r => ({
        reason: r.BuLiangReason,
        product_type: r.ProductType,
        gongxu_name: r.GongXuName,
        total_buliang: parseFloat(r.total_buliang) || 0,
        report_times: r.report_times,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// 日报统计
/**
 * @swagger
 * /api/production/stats/daily:
 *   get:
 *     summary: 日报统计
 *     tags: [生产]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: 日期（默认当天）
 *     responses:
 *       200:
 *         description: 日报统计
 */
router.get('/stats/daily', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const sql = `
      SELECT ProductType, GongXuField, GongXuName,
             SUM(BaoChanNum) as total_baochan,
             SUM(BuLiangNum) as total_buliang,
             COUNT(*) as report_times
      FROM BaoGongLog
      WHERE CAST(BaoGongTime AS DATE) = @p0
      GROUP BY ProductType, GongXuField, GongXuName
      ORDER BY ProductType, GongXuField
    `;

    const rows = await db.query(sql, [targetDate]);
    
    // 总计
    const totalResult = await db.queryOne(
      `SELECT SUM(BaoChanNum) as total, SUM(BuLiangNum) as buliang, COUNT(*) as times FROM BaoGongLog WHERE CAST(BaoGongTime AS DATE) = @p0`,
      [targetDate]
    );

    res.json({
      date: targetDate,
      summary: {
        total_baochan: parseFloat(totalResult?.total) || 0,
        total_buliang: parseFloat(totalResult?.buliang) || 0,
        report_times: totalResult?.times || 0,
      },
      items: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

module.exports = router;
