const express = require('express');
const mssql = require('mssql');
const db = require('../config/db');
const { authMiddleware, requireDept } = require('../middleware/auth');

const router = express.Router();

async function reqT(sqlStr, params) {
  const pool = await db.getPool();
  const req = pool.request();
  params.forEach(function(p) { req.input(p[0], p[1], p[2]); });
  return req.query(sqlStr);
}

// ── 发货单列表 ───────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/list:
 *   get:
 *     summary: 发货单列表
 *     tags: [发货]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: keyword
 *         description: 搜索关键词（公司/快递公司/快递号）
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
 *         description: 发货单分页列表
 */
router.get('/list', authMiddleware, async function(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.page_size) || 20;
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];

    if (req.query.keyword) {
      where.push('(f.company LIKE @kw OR f.kdgs LIKE @kw OR f.kdhao LIKE @kw)');
      params.push(['kw', mssql.NVarChar, '%' + req.query.keyword + '%']);
    }
    if (req.query.ywy) {
      where.push('f.ywy = @ywy');
      params.push(['ywy', mssql.Int, parseInt(req.query.ywy)]);
    }
    if (req.query.date1) {
      where.push('f.RegTime >= @date1');
      params.push(['date1', mssql.DateTime, req.query.date1]);
    }
    if (req.query.date2) {
      where.push('f.RegTime <= @date2');
      params.push(['date2', mssql.DateTime, req.query.date2]);
    }
    if (req.query.kdgs) {
      where.push('f.kdgs LIKE @kdgs');
      params.push(['kdgs', mssql.NVarChar, '%' + req.query.kdgs + '%']);
    }
    if (req.query.kdhao) {
      where.push('f.kdhao LIKE @kdhao');
      params.push(['kdhao', mssql.NVarChar, '%' + req.query.kdhao + '%']);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const cntR = await reqT('SELECT COUNT(*) as cnt FROM FaHuoDan f ' + whereStr, params);
    const total = cntR.recordset[0].cnt;

    const fCols = 'f.ID AS id, f.company, f.RegTime AS regtime, f.kdgs, f.kdhao, f.fhr, f.ywy, u.UserName AS ywy_name';
    const itemCols = 'f.pingming1,f.pingming2,f.pingming3,f.pingming4,f.pingming5,f.pingming6,f.pingming7,f.pingming8,f.pingming9,f.khao1,f.khao2,f.khao3,f.khao4,f.khao5,f.khao6,f.khao7,f.khao8,f.khao9,f.dnbh1,f.dnbh2,f.dnbh3,f.dnbh4,f.dnbh5,f.dnbh6,f.dnbh7,f.dnbh8,f.dnbh9,f.shuliang1,f.shuliang2,f.shuliang3,f.shuliang4,f.shuliang5,f.shuliang6,f.shuliang7,f.shuliang8,f.shuliang9,f.beizhu1,f.beizhu2,f.beizhu3,f.beizhu4,f.beizhu5,f.beizhu6,f.beizhu7,f.beizhu8,f.beizhu9';

    const allR = await reqT(
      'SELECT TOP 1000 ' + fCols + ',' + itemCols + ' FROM FaHuoDan f LEFT JOIN UserInfo u ON f.ywy = u.UserID ' + whereStr + ' ORDER BY f.ID DESC',
      params
    );
    const items = allR.recordset.slice(offset, offset + pageSize);

    res.json({ total, page, page_size: pageSize, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 获取单个发货单（含关联订单） ───────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/{id}:
 *   get:
 *     summary: 获取发货单详情
 *     tags: [发货]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 发货单ID
 *     responses:
 *       200:
 *         description: 发货单详情（含关联订单）
 *       404:
 *         description: 未找到该发货单
 */
router.get('/:id', authMiddleware, async function(req, res) {
  try {
    const fCols = 'f.ID AS id, f.company, f.RegTime AS regtime, f.kdgs, f.kdhao, f.fhr, f.ywy, u.UserName AS ywy_name';
    const itemCols = 'f.pingming1,f.pingming2,f.pingming3,f.pingming4,f.pingming5,f.pingming6,f.pingming7,f.pingming8,f.pingming9,f.khao1,f.khao2,f.khao3,f.khao4,f.khao5,f.khao6,f.khao7,f.khao8,f.khao9,f.dnbh1,f.dnbh2,f.dnbh3,f.dnbh4,f.dnbh5,f.dnbh6,f.dnbh7,f.dnbh8,f.dnbh9,f.shuliang1,f.shuliang2,f.shuliang3,f.shuliang4,f.shuliang5,f.shuliang6,f.shuliang7,f.shuliang8,f.shuliang9,f.beizhu1,f.beizhu2,f.beizhu3,f.beizhu4,f.beizhu5,f.beizhu6,f.beizhu7,f.beizhu8,f.beizhu9';

    const fhR = await reqT(
      'SELECT ' + fCols + ',' + itemCols + ' FROM FaHuoDan f LEFT JOIN UserInfo u ON f.ywy = u.UserID WHERE f.ID = @id',
      [['id', mssql.Int, parseInt(req.params.id)]]
    );
    if (!fhR.recordset.length) {
      return res.status(404).json({ error: '未找到该发货单' });
    }

    const ordersR = await reqT(
      'SELECT fo.*, y.ddbh FROM FahuoOrder fo LEFT JOIN YS y ON fo.dd_id = y.DD_id AND fo.product_type = \'YS\' WHERE fo.fahuo_id = @id ORDER BY fo.id',
      [['id', mssql.Int, parseInt(req.params.id)]]
    );

    const result = fhR.recordset[0];
    result.orders = ordersR.recordset;
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 待发货订单列表 ───────────────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/orders/pending:
 *   get:
 *     summary: 待发货订单列表
 *     tags: [发货]
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
 *         name: company
 *         schema:
 *           type: string
 *         description: 客户名称
 *     responses:
 *       200:
 *         description: 未完成发货的订单列表
 */
router.get('/orders/pending', authMiddleware, async function(req, res) {
  try {
    const pt = req.query.product_type;
    const company = req.query.company;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.page_size) || 50;

    let results = [];
    const tables = pt ? [[pt, pt]] : [['YS', 'YS'], ['YM', 'YM'], ['ZM', 'ZM'], ['DS', 'DS']];
    const limit = pt ? 1000 : 300;

    for (const [table, type] of tables) {
      const where = ['ZT=2', '(fahuo=0 OR fahuo IS NULL)'];
      const p = [];
      let idx = 0;

      if (company) {
        where.push('company LIKE @c' + idx);
        p.push(['c' + idx, mssql.NVarChar, '%' + company + '%']);
        idx++;
      }

      const whereStr = 'WHERE ' + where.join(' AND ');
      const pnCol = table === 'DS' ? 'yjbhao' : 'proudnumber';
      const selSql = 'SELECT TOP ' + limit + ' DD_id, ddbh, company, ' + pnCol + ' AS proudnumber, shuliang, overdate, zhidan FROM ' + table + ' ' + whereStr + ' ORDER BY DD_id DESC';
      const r = await reqT(selSql, p);

      for (const row of r.recordset) {
        results.push({
          dd_id: row.DD_id,
          ddbh: row.ddbh,
          product_type: type,
          company: row.company,
          proudnumber: row.proudnumber,
          shuliang: row.shuliang,
          overdate: row.overdate,
          zhidan: row.zhidan,
          total_sent: 0,
        });
      }
    }

    results.sort((a, b) => {
      if (!a.overdate) return 1;
      if (!b.overdate) return -1;
      return new Date(a.overdate) - new Date(b.overdate);
    });

    // 参数化 IN 查询，防止 SQL 注入
    const ddIds = results.map(r => r.dd_id);
    if (ddIds.length > 0) {
      const inPlaceholders = ddIds.map((_, i) => '@ddid' + i).join(',');
      const sentR = await reqT(
        `SELECT dd_id, SUM(shuliang_sent) as total FROM FahuoOrder WHERE dd_id IN (${inPlaceholders}) GROUP BY dd_id`,
        ddIds.map((id, i) => ['ddid' + i, mssql.Int, id])
      );
      const sentMap = {};
      sentR.recordset.forEach(r => { sentMap[r.dd_id] = r.total; });
      results.forEach(r => { r.total_sent = sentMap[r.dd_id] || 0; });
    }

    // 过滤已全部发完的
    results = results.filter(r => r.total_sent < r.shuliang || r.shuliang === 0);

    const total = results.length;
    const offset = (page - 1) * pageSize;
    const items = results.slice(offset, offset + pageSize);

    res.json({ total, page, page_size: pageSize, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '查询失败', detail: err.message });
  }
});

// ── 新建发货单 ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo:
 *   post:
 *     summary: 新建发货单
 *     tags: [发货]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company: { type: string, description: 收货单位 }
 *               kdgs: { type: string, description: 快递公司 }
 *               kdhao: { type: string, description: 快递号 }
 *               ywy: { type: integer, description: 业务员ID }
 *               orders: { type: array, description: 关联订单列表', items: { type: object } }
 *     responses:
 *       201:
 *         description: 创建成功
 *       400:
 *         description: 参数缺失
 */
router.post('/', authMiddleware, requireDept('A', 'S'), async function(req, res) {
  const pool = await db.getPool();
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();

    const body = req.body;
    if (!body.company) {
      return res.status(400).json({ error: '收货单位不能为空' });
    }

    // 1. 插入 FaHuoDan
    const fCols = [];
    const fParams = [];
    let fIdx = 0;

    function addF(name, type, value) {
      fCols.push(name);
      fParams.push(['fp' + fIdx, type, value]);
      fIdx++;
    }

    addF('company', mssql.NVarChar, body.company);
    addF('regtime', mssql.DateTime, new Date());
    if (body.kdgs) addF('kdgs', mssql.NVarChar, body.kdgs);
    if (body.kdhao) addF('kdhao', mssql.NVarChar, body.kdhao);
    addF('fhr', mssql.NVarChar, req.user.username || '');
    if (body.ywy) addF('ywy', mssql.Int, parseInt(body.ywy));

    for (let i = 0; i < 9; i++) {
      if (body['pingming' + (i+1)]) addF('pingming' + (i+1), mssql.NVarChar, String(body['pingming' + (i+1)] || ''));
      if (body['khao' + (i+1)]) addF('khao' + (i+1), mssql.NVarChar, String(body['khao' + (i+1)] || ''));
      if (body['dnbh' + (i+1)]) addF('dnbh' + (i+1), mssql.NVarChar, String(body['dnbh' + (i+1)] || ''));
      if (body['shuliang' + (i+1)]) addF('shuliang' + (i+1), mssql.NVarChar, String(body['shuliang' + (i+1)] || ''));
      if (body['beizhu' + (i+1)]) addF('beizhu' + (i+1), mssql.NVarChar, String(body['beizhu' + (i+1)] || ''));
    }

    const colNames = fCols.join(',');
    const paramNames = fParams.map(p => '@' + p[0]).join(',');
    const reqC = new mssql.Request(transaction);
    fParams.forEach(p => reqC.input(p[0], p[1], p[2]));
    const fhResult = await reqC.query('INSERT INTO FaHuoDan (' + colNames + ') VALUES (' + paramNames + '); SELECT SCOPE_IDENTITY() AS newId;');
    const newFhId = fhResult.recordset[0].newId;

    // 2. 插入关联订单（FahuoOrder）并更新订单 fahuo_id
    const orderItems = body.orders || [];
    for (const item of orderItems) {
      if (!item.dd_id || !item.product_type) continue;

      const sent = parseInt(item.shuliang_sent) || 0;
      const reqO = new mssql.Request(transaction);
      reqO.input('fid', mssql.Int, newFhId);
      reqO.input('did', mssql.Int, parseInt(item.dd_id));
      reqO.input('pt', mssql.NVarChar, item.product_type);
      reqO.input('ss', mssql.Int, sent);
      reqO.input('pn', mssql.NVarChar, item.proudnumber || '');
      reqO.input('kh', mssql.NVarChar, item.kuanhao || '');
      reqO.input('st', mssql.Int, parseInt(item.shuliang_total) || 0);
      reqO.input('bz', mssql.NVarChar, item.beizhu || '');
      await reqO.query(
        'INSERT INTO FahuoOrder (fahuo_id, dd_id, product_type, shuliang_sent, proudnumber, kuanhao, shuliang_total, beizhu, regtime) ' +
        'VALUES (@fid, @did, @pt, @ss, @pn, @kh, @st, @bz, GETDATE())'
      );

      const tblMap = { 'YS': 'YS', 'YM': 'YM', 'ZM': 'ZM', 'DS': 'DS' };
      const tbl = tblMap[item.product_type];
      if (tbl) {
        // 写入 fahuo_id
        const reqU = new mssql.Request(transaction);
        reqU.input('fid', mssql.Int, newFhId);
        reqU.input('did', mssql.Int, parseInt(item.dd_id));
        await reqU.query('UPDATE ' + tbl + ' SET fahuo_id = @fid WHERE DD_id = @did');

        // 更新订单发货状态：先算该订单所有已发货总量
        const sentR = await new mssql.Request(transaction)
          .input('did', mssql.Int, parseInt(item.dd_id))
          .query('SELECT SUM(shuliang_sent) as total FROM FahuoOrder WHERE dd_id = @did');
        const totalSent = parseInt(sentR.recordset[0].total) || 0;

        // 取订单总量
        const ordR = await new mssql.Request(transaction)
          .input('did', mssql.Int, parseInt(item.dd_id))
          .query('SELECT shuliang FROM ' + tbl + ' WHERE DD_id = @did');
        const totalQty = parseFloat(ordR.recordset[0]?.shuliang) || 0;

        // 发货数>=订单数 → 完全发货，ZT=1 且 fahuo=1；否则 fahuo=1（部分发货）
        const isFull = totalQty > 0 && totalSent >= totalQty;
        const reqSt = new mssql.Request(transaction);
        reqSt.input('did', mssql.Int, parseInt(item.dd_id));
        reqSt.input('fahuoVal', mssql.Int, 1);
        reqSt.input('ztVal', mssql.Int, isFull ? 1 : 2);
        await reqSt.query(
          'UPDATE ' + tbl + ' SET fahuo = @fahuoVal' + (isFull ? ', ZT = @ztVal' : '') + ' WHERE DD_id = @did'
        );
      }
    }

    await transaction.commit();
    res.json({ success: true, id: newFhId });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: '创建发货单失败', detail: err.message });
  }
});

// ── 修改发货单 ──────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/{id}:
 *   put:
 *     summary: 修改发货单
 *     tags: [发货]
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
 *               company: { type: string }
 *               kdgs: { type: string }
 *               kdhao: { type: string }
 *               ywy: { type: integer }
 *     responses:
 *       200:
 *         description: 修改成功
 */
router.put('/:id', authMiddleware, requireDept('A', 'S'), async function(req, res) {
  const pool = await db.getPool();
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();

    const fhId = parseInt(req.params.id);
    const body = req.body;

    // 1. 更新 FaHuoDan 主表
    const fhReq = new mssql.Request(transaction);
    fhReq.input('id', mssql.Int, fhId);
    if (body.company !== undefined) { fhReq.input('company', mssql.NVarChar, body.company); }
    if (body.kdgs !== undefined) { fhReq.input('kdgs', mssql.NVarChar, body.kdgs); }
    if (body.kdhao !== undefined) { fhReq.input('kdhao', mssql.NVarChar, body.kdhao); }
    if (body.ywy !== undefined) { fhReq.input('ywy', mssql.Int, body.ywy ? parseInt(body.ywy) : null); }

    const fhSets = [];
    if (body.company !== undefined) fhSets.push('company=@company');
    if (body.kdgs !== undefined) fhSets.push('kdgs=@kdgs');
    if (body.kdhao !== undefined) fhSets.push('kdhao=@kdhao');
    if (body.ywy !== undefined) fhSets.push('ywy=@ywy');

    // 手工模式：更新 pingming1-9
    for (let i = 1; i <= 9; i++) {
      fhSets.push('pingming' + i + '=@pm' + i);
      fhReq.input('pm' + i, mssql.NVarChar, body['pingming' + i] || '');
      fhSets.push('khao' + i + '=@kh' + i);
      fhReq.input('kh' + i, mssql.NVarChar, body['khao' + i] || '');
      fhSets.push('dnbh' + i + '=@dn' + i);
      fhReq.input('dn' + i, mssql.NVarChar, body['dnbh' + i] || '');
      fhSets.push('shuliang' + i + '=@sl' + i);
      fhReq.input('sl' + i, mssql.NVarChar, body['shuliang' + i] || '');
      fhSets.push('beizhu' + i + '=@bz' + i);
      fhReq.input('bz' + i, mssql.NVarChar, body['beizhu' + i] || '');
    }

    if (fhSets.length > 0) {
      await fhReq.query('UPDATE FaHuoDan SET ' + fhSets.join(',') + ' WHERE ID=@id');
    }

    // 2. 收集这次要处理的 dd_id（去重）
    const allDdIds = new Set();
    if (body.orders && body.orders.length > 0) {
      body.orders.forEach(o => { if (o.dd_id) allDdIds.add(String(o.dd_id)); });
    }

    // 3. 查出旧关联的 dd_id
    const oldR = await new mssql.Request(transaction)
      .input('fhId', mssql.Int, fhId)
      .query('SELECT dd_id FROM FahuoOrder WHERE fahuo_id = @fhId');
    oldR.recordset.forEach(r => allDdIds.add(String(r.dd_id)));

    // 4. 删除旧关联（FahuoOrder 里该 fahuo_id 的全部删掉）
    await new mssql.Request(transaction)
      .input('fhId', mssql.Int, fhId)
      .query('DELETE FROM FahuoOrder WHERE fahuo_id = @fhId');

    // 5. 插入新关联（如果有 orders）
    if (body.orders && body.orders.length > 0) {
      for (const item of body.orders) {
        if (!item.dd_id || !item.product_type) continue;
        const sent = parseInt(item.shuliang_sent) || 0;
        const reqO = new mssql.Request(transaction);
        reqO.input('fid', mssql.Int, fhId);
        reqO.input('did', mssql.Int, parseInt(item.dd_id));
        reqO.input('pt', mssql.NVarChar, item.product_type);
        reqO.input('ss', mssql.Int, sent);
        reqO.input('pn', mssql.NVarChar, item.proudnumber || '');
        reqO.input('kh', mssql.NVarChar, item.kuanhao || '');
        reqO.input('st', mssql.Int, parseInt(item.shuliang_total) || 0);
        reqO.input('bz', mssql.NVarChar, item.beizhu || '');
        await reqO.query(
          'INSERT INTO FahuoOrder (fahuo_id, dd_id, product_type, shuliang_sent, proudnumber, kuanhao, shuliang_total, beizhu, regtime) ' +
          'VALUES (@fid, @did, @pt, @ss, @pn, @kh, @st, @bz, GETDATE())'
        );
        const reqU = new mssql.Request(transaction);
        reqU.input('fid', mssql.Int, fhId);
        reqU.input('did', mssql.Int, parseInt(item.dd_id));
        await reqU.query('UPDATE ' + item.product_type + ' SET fahuo_id = @fid WHERE DD_id = @did');
      }
    }

    // 6. 统一重新计算所有受影响订单的 ZT/fahuo 状态
    const tblMap = { 'YS': 'YS', 'YM': 'YM', 'ZM': 'ZM', 'DS': 'DS' };
    for (const didStr of allDdIds) {
      const ddId = parseInt(didStr);
      let productType = null;
      // 找出这笔订单属于哪个产品线（在旧关联里查）
      for (const [pt, tbl] of Object.entries(tblMap)) {
        const chkR = await new mssql.Request(transaction)
          .input('did', mssql.Int, ddId)
          .query('SELECT 1 FROM ' + tbl + ' WHERE DD_id = @did');
        if (chkR.recordset.length > 0) { productType = pt; break; }
      }
      if (!productType) continue;
      const tbl = productType;

      // 算总发货量
      const sentR = await new mssql.Request(transaction)
        .input('did', mssql.Int, ddId)
        .query('SELECT SUM(shuliang_sent) as total FROM FahuoOrder WHERE dd_id = @did');
      const totalSent = parseInt(sentR.recordset[0]?.total) || 0;

      // 取订单总量
      const ordR = await new mssql.Request(transaction)
        .input('did', mssql.Int, ddId)
        .query('SELECT shuliang FROM ' + tbl + ' WHERE DD_id = @did');
      const totalQty = parseFloat(ordR.recordset[0]?.shuliang) || 0;

      // 决定状态
      if (totalSent <= 0) {
        await new mssql.Request(transaction)
          .input('did', mssql.Int, ddId)
          .query('UPDATE ' + tbl + ' SET fahuo=0, fahuo_id=NULL, ZT=2 WHERE DD_id=@did');
      } else {
        const isFull = totalQty > 0 && totalSent >= totalQty;
        const reqSt = new mssql.Request(transaction);
        reqSt.input('did', mssql.Int, ddId);
        reqSt.input('fahuoVal', mssql.Int, 1);
        if (isFull) { reqSt.input('ztVal', mssql.Int, 1); }
        await reqSt.query(
          'UPDATE ' + tbl + ' SET fahuo=@fahuoVal' +
          (isFull ? ', ZT=@ztVal' : '') +
          ' WHERE DD_id=@did'
        );
      }
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: '修改发货单失败', detail: err.message });
  }
});

// ── 删除发货单 ─────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/{id}:
 *   delete:
 *     summary: 删除发货单
 *     tags: [发货]
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
router.delete('/:id', authMiddleware, requireDept('A', 'S'), async function(req, res) {
  const pool = await db.getPool();
  const transaction = new mssql.Transaction(pool);
  try {
    await transaction.begin();

    const fhId = parseInt(req.params.id);
    const tblMap = { 'YS': 'YS', 'YM': 'YM', 'ZM': 'ZM', 'DS': 'DS' };

    // 1. 查出旧关联的 dd_id（删除前先收集）
    const ordersR = await new mssql.Request(transaction)
      .input('fhId', mssql.Int, fhId)
      .query('SELECT dd_id, product_type FROM FahuoOrder WHERE fahuo_id = @fhId');
    const oldOrders = ordersR.recordset; // [{dd_id, product_type}]

    // 2. 删除 FahuoOrder
    await new mssql.Request(transaction)
      .input('fhId', mssql.Int, fhId)
      .query('DELETE FROM FahuoOrder WHERE fahuo_id = @fhId');

    // 3. 删除 FaHuoDan
    await new mssql.Request(transaction)
      .input('fhId', mssql.Int, fhId)
      .query('DELETE FROM FaHuoDan WHERE ID = @fhId');

    // 4. 重新计算每笔受影响订单的 ZT/fahuo 状态
    for (const row of oldOrders) {
      const tbl = tblMap[row.product_type];
      if (!tbl) continue;
      const ddId = parseInt(row.dd_id);

      // 算剩余总发货量
      const sentR = await new mssql.Request(transaction)
        .input('did', mssql.Int, ddId)
        .query('SELECT SUM(shuliang_sent) as total FROM FahuoOrder WHERE dd_id = @did');
      const totalSent = parseInt(sentR.recordset[0]?.total) || 0;

      // 取订单总量
      const ordR = await new mssql.Request(transaction)
        .input('did', mssql.Int, ddId)
        .query('SELECT shuliang FROM ' + tbl + ' WHERE DD_id = @did');
      const totalQty = parseFloat(ordR.recordset[0]?.shuliang) || 0;

      if (totalSent <= 0) {
        // 无任何发货记录了，恢复为待发货状态
        await new mssql.Request(transaction)
          .input('did', mssql.Int, ddId)
          .query('UPDATE ' + tbl + ' SET fahuo=0, fahuo_id=NULL, ZT=2 WHERE DD_id=@did');
      } else {
        // 还有发货记录，更新状态（部分发货或已完）
        const isFull = totalQty > 0 && totalSent >= totalQty;
        const reqSt = new mssql.Request(transaction);
        reqSt.input('did', mssql.Int, ddId);
        reqSt.input('fahuoVal', mssql.Int, 1);
        if (isFull) { reqSt.input('ztVal', mssql.Int, 1); }
        await reqSt.query(
          'UPDATE ' + tbl + ' SET fahuo=@fahuoVal' +
          (isFull ? ', ZT=@ztVal' : '') +
          ' WHERE DD_id=@did'
        );
      }
    }

    await transaction.commit();
    res.json({ success: true });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: '删除发货单失败', detail: err.message });
  }
});

// ── 取消单个订单的发货关联 ────────────────────────────────────────────
/**
 * @swagger
 * /api/fahuo/{fhId}/orders/{ddId}:
 *   delete:
 *     summary: 取消单个订单的发货关联
 *     tags: [发货]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fhId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 发货单ID
 *       - in: path
 *         name: ddId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 订单ID
 *     responses:
 *       200:
 *         description: 取消成功
 */
router.delete('/:fhId/orders/:ddId', authMiddleware, requireDept('A', 'S'), async function(req, res) {
  try {
    const fhId = parseInt(req.params.fhId);
    const ddId = parseInt(req.params.ddId);
    const pool = await db.getPool();

    await pool.request()
      .input('fhId', mssql.Int, fhId)
      .input('ddId', mssql.Int, ddId)
      .query('DELETE FROM FahuoOrder WHERE fahuo_id = @fhId AND dd_id = @ddId');

    const remaining = await pool.request()
      .input('ddId', mssql.Int, ddId)
      .query('SELECT COUNT(*) as cnt FROM FahuoOrder WHERE dd_id = @ddId');
    if (remaining.recordset[0].cnt === 0) {
      for (const tbl of ['YS', 'YM', 'ZM', 'DS']) {
        await pool.request()
          .input('fhId', mssql.Int, fhId)
          .input('ddId', mssql.Int, ddId)
          .query('UPDATE ' + tbl + ' SET fahuo_id = NULL WHERE DD_id = @ddId AND fahuo_id = @fhId');
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '取消发货关联失败', detail: err.message });
  }
});

module.exports = router;
