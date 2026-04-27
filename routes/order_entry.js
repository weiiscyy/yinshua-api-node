const express = require('express');
const db = require('../config/db');
const { authMiddleware, requireDept } = require('../middleware/auth');

const router = express.Router();

// 工序流程定义
const PROCESS_CLASSES = {
  YS: {
    2: { label: '印刷单', steps: ['A1-白料','A2-印白底','A3-双印白底','A4-双面印白底','A5-专色白底','A6-双面专色白底','C3-过油磨光','B3-胶装','B4-压痕','B5-烫金','B6-纸板上灰','B7-钉装','B8-粘盒','B11-UV上光','B12-局部上光','B13-过胶','B14-折页','B15-打包','C1-局部丝印','C4-烫银','C5-压纹','C6-凹凸压印','C7-裱卡纸','C8-海绵','C9-植绒','C10-打鸡眼'] },
    3: { label: '客户印', steps: ['A1-白料','A2-印白底','A3-双印白底','A4-双面印白底','A5-专色白底','A6-双面专色白底','C3-过油磨光','B3-胶装','B4-压痕','B5-烫金','B6-纸板上灰','B7-钉装','B8-粘盒','B11-UV上光','B12-局部上光','B13-过胶','B14-折页','B15-打包','C1-局部丝印','C4-烫银','C5-压纹','C6-凹凸压印','C7-裱卡纸','C8-海绵','C9-植绒','C10-打鸡眼'] },
  },
  YM: {
    5: { label: '印面单', steps: ['hzl1-晒版','hzl2-切纸','hzl3-印刷','hzl4-过油','hzl5-磨光','hzl6-烫金','hzl7-打包'] },
    6: { label: '印面单', steps: ['hzl1-晒版','hzl2-切纸','hzl3-印刷','hzl4-过油','hzl5-磨光','hzl6-烫金','hzl7-打包'] },
  },
  ZM: {
    1: { label: '纸盒单', steps: ['hzl1-开料','hzl2-印刷','hzl3-表面处理','hzl4-模切','hzl5-粘合','hzl6-钉装','hzl7-过胶','hzl8-烫金','hzl9-UV','hzl10-折页','hzl11-打包','hzl12-打鸡眼','hzl13-压纹','hzl14-植绒','hzl15-其他','hzl16-覆膜'] },
  },
  DS: {
    4: { label: '模切单', steps: ['hzl1-设计','hzl2-生产'] },
  },
};

async function generateDdbh(product_type) {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const yymmdd = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  // 兼容旧系统：查同日期最新序号，补4位序号
  const tableMap_ = { YS: 'YS', YM: 'YM', ZM: 'ZM', DS: 'DS' };
  const table = tableMap_[product_type] || 'YS';
  try {
    const lastRows = await db.query(
      `SELECT TOP 1 ddbh FROM ${table} WHERE ddbh LIKE @p0 ORDER BY DD_id DESC`,
      [`${yymmdd}%`]
    );
    let seq = 1;
    if (lastRows.length > 0 && lastRows[0].ddbh && lastRows[0].ddbh.length >= 10) {
      const n = parseInt(lastRows[0].ddbh.slice(-4));
      if (!isNaN(n)) seq = n + 1;
    }
    return yymmdd + String(seq).padStart(4, '0');
  } catch {
    return yymmdd + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
}

/**
 * @swagger
 * /api/order_entry/process-classes:
 *   get:
 *     summary: 获取工序流程分类
 *     tags: [订单录入]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 工序流程分类
 */
router.get('/process-classes', authMiddleware, async (req, res) => {
  const result = {};
  for (const [pt, classes] of Object.entries(PROCESS_CLASSES)) {
    result[pt] = Object.entries(classes).map(([k, v]) => ({
      value: parseInt(k),
      label: v.label,
      stepCount: v.steps.length,
    }));
  }
  res.json(result);
});

/**
 * @swagger
 * /api/order_entry:
 *   post:
 *     summary: 创建新订单
 *     tags: [订单录入]
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
 *                 description: 产品类型
 *               company:
 *                 type: string
 *                 description: 客户公司
 *               ddbh:
 *                 type: string
 *                 description: 订单编号（可选，自动生成）
 *               prouddate:
 *                 type: string
 *                 format: date-time
 *                 description: 制单日期
 *               overdate:
 *                 type: string
 *                 format: date-time
 *                 description: 交货日期
 *               yjbhao:
 *                 type: string
 *                 description: 样板号
 *               cpgg:
 *                 type: string
 *                 description: 产品规格
 *               pingshu:
 *                 type: string
 *                 description: 品名/品书
 *               shuliang:
 *                 type: string
 *                 description: 数量
 *               ywy:
 *                 type: integer
 *                 description: 业务员ID
 *               zhidan:
 *                 type: string
 *                 description: 制单人
 *               fahuodanwei:
 *                 type: string
 *                 description: 发货单位
 *               kuanhao:
 *                 type: string
 *                 description: 款号
 *               jiagongfei:
 *                 type: string
 *                 description: 加工费
 *               waifa:
 *                 type: boolean
 *                 description: 是否外发
 *               danjia:
 *                 type: number
 *                 description: 单价
 *               sydazhang:
 *                 type: integer
 *                 description: 是否有大账
 *               syMoney:
 *                 type: number
 *                 description: 大账金额
 *               beizhu:
 *                 type: string
 *                 description: 备注
 *               sclcSteps:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 工序步骤列表
 *               proudnumber:
 *                 type: string
 *                 description: 产品编号（YS/YM）
 *               lldate:
 *                 type: string
 *                 format: date-time
 *                 description: 领料日期（YS/YM）
 *               cidiehao:
 *                 type: string
 *                 description: 刺青号（ZM）
 *               allcount:
 *                 type: string
 *                 description: 总数（ZM）
 *               weidu:
 *                 type: string
 *                 description: 维度（ZM）
 *               kuandu:
 *                 type: string
 *                 description: 宽度（ZM）
 *               changdu:
 *                 type: string
 *                 description: 长度（ZM）
 *               huachang:
 *                 type: string
 *                 description: 花厂（ZM）
 *               huahao:
 *                 type: string
 *                 description: 花号（ZM）
 *               jiage:
 *                 type: string
 *                 description: 价格（DS）
 *               zhengli:
 *                 type: string
 *                 description: 整理（DS）
 *               fhdw:
 *                 type: string
 *                 description: 发货单位（DS）
 *               fhdate:
 *                 type: string
 *                 format: date-time
 *                 description: 发货日期（DS）
 *               fhr:
 *                 type: string
 *                 description: 发货人（DS）
 *     responses:
 *       200:
 *         description: 创建成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 ddbh: { type: string }
 *                 DD_id: { type: integer }
 *       400:
 *         description: 参数错误
 *       500:
 *         description: 创建失败
 */
router.post('/', authMiddleware, requireDept('A', 'S'), async (req, res) => {
  try {
    const body = req.body;
    const {
      product_type, ddbh: reqDdbh, prouddate, overdate, company,
      yjbhao, cpgg, pingshu, shuliang, ywy, zhidan,
      fahuodanwei, kuanhao, jiagongfei, waifa,
      danjia, sydazhang, syMoney, beizhu,
      sclcSteps = [],
      // YS 专用
      klcc, kaishu, ylzd, xukaisl, bcsl, klyaoqiu, jyyaoqiu,
      proudnumber, lldate, yssj,
      // ZM 专用
      cidiehao, allcount, weidu, kuandu, changdu, huachang, huahao,
      chenpingcc, dhdw, sxdate, soujianjl, proudbanbie,
      zm_zhijian, gyyq, kts, jijia,
      // YM 专用
      beizhu8, upfile,
      // DS 专用
      jiage, zhengli, fhdw, fhdate, fhr,
    } = body;

    if (!product_type || !company) {
      return res.status(400).json({ error: '产品类型和客户公司不能为空' });
    }

    const ddbhVal = reqDdbh || await generateDdbh(product_type);
    const now = new Date();

    const reqT = async (sql, params = []) => {
      const pool2 = await db.getPool();
      const req = pool2.request();
      params.forEach(([n, t, v]) => req.input(n, t, v));
      return req.query(sql);
    };

      // 主表字段映射（按产品线，完全独立定义）
      const S = v => (v === undefined || v === null || v === '') ? null : String(v);
      const commonFields = {
        ddbh: ['ddbh', db.mssql.NVarChar, ddbhVal],
        prouddate: ['prouddate', db.mssql.DateTime, prouddate ? new Date(prouddate) : now],
        company: ['company', db.mssql.NVarChar, S(company)],
        yjbhao: ['yjbhao', db.mssql.NVarChar, S(yjbhao)],
        shuliang: ['shuliang', db.mssql.NVarChar, S(shuliang)],
        ywy: ['ywy', db.mssql.Int, Number.isInteger(ywy) ? ywy : (ywy ? parseInt(ywy, 10) : null)],
        zhidan: ['zhidan', db.mssql.NVarChar, zhidan || req.user.username || ''],
        waifa: ['waifa', db.mssql.Int, waifa ? 1 : 0],
        BZ: ['BZ', db.mssql.TinyInt, 0],
        BZBM: ['BZBM', db.mssql.NVarChar, 'A'],
        ZT: ['ZT', db.mssql.TinyInt, 0],
      };

      const productFields = {
        YS: {
          ...commonFields,
          overdate: ['overdate', db.mssql.DateTime, overdate || null],
          proudnumber: ['proudnumber', db.mssql.NVarChar, proudnumber || ''],
          lldate: ['lldate', db.mssql.DateTime, lldate || null],
          cpgg: ['cpgg', db.mssql.NVarChar, cpgg || ''],
          pingshu: ['pingshu', db.mssql.NVarChar, pingshu || ''],
          fahuodanwei: ['fahuodanwei', db.mssql.NVarChar, fahuodanwei || ''],
          kuanhao: ['kuanhao', db.mssql.NVarChar, kuanhao || ''],
          jiagongfei: ['jiagongfei', db.mssql.NVarChar, jiagongfei || ''],
          danjia: ['danjia', db.mssql.Money, danjia || null],
          sydazhang: ['sydazhang', db.mssql.Int, sydazhang || null],
          syMoney: ['syMoney', db.mssql.Money, syMoney || null],
          klcc: ['klcc', db.mssql.NVarChar, klcc || ''],
          kaishu: ['kaishu', db.mssql.NVarChar, kaishu || ''],
          ylzd: ['ylzd', db.mssql.NVarChar, ylzd || ''],
          xukaisl: ['xukaisl', db.mssql.NVarChar, xukaisl || ''],
          bcsl: ['bcsl', db.mssql.NVarChar, bcsl || ''],
          klyaoqiu: ['klyaoqiu', db.mssql.NVarChar, klyaoqiu || ''],
          jyyaoqiu: ['jyyaoqiu', db.mssql.NVarChar, jyyaoqiu || ''],
          yszj: ['yszj', db.mssql.Money, body.yszj || null],
          beizhuYS: ['beizhuYS', db.mssql.NVarChar, beizhu || ''],
        },
        YM: {
          ...commonFields,
          overdate: ['overdate', db.mssql.DateTime, overdate || null],
          cpgg: ['cpgg', db.mssql.NVarChar, cpgg || ''],
          pingshu: ['pingshu', db.mssql.NVarChar, pingshu || ''],
          fahuodanwei: ['fahuodanwei', db.mssql.NVarChar, fahuodanwei || ''],
          kuanhao: ['kuanhao', db.mssql.NVarChar, kuanhao || ''],
          jiagongfei: ['jiagongfei', db.mssql.NVarChar, jiagongfei || ''],
          danjia: ['danjia', db.mssql.Money, danjia || null],
          sydazhang: ['sydazhang', db.mssql.Numeric(18,4), sydazhang || null],
          syMoney: ['syMoney', db.mssql.Money, syMoney || null],
          yszj: ['yszj', db.mssql.Money, body.yszj || null],
          proudnumber: ['proudnumber', db.mssql.NVarChar, proudnumber || ''],
          lldate: ['lldate', db.mssql.DateTime, lldate || null],
          zhengli: ['zhengli', db.mssql.NVarChar, zhengli || ''],
          gyyq: ['gyyq', db.mssql.NVarChar, gyyq || ''],
          yjbhao: ['yjbhao', db.mssql.NVarChar, yjbhao || ''],
          ylzd: ['ylzd', db.mssql.NVarChar, ylzd || ''],
          jyyaoqiu: ['jyyaoqiu', db.mssql.NVarChar, jyyaoqiu || ''],
          beizhuYM: ['beizhuYM', db.mssql.NVarChar, body.beizhu || body.beizhuYM || ''],
          beizhu8: ['beizhu8', db.mssql.NVarChar, beizhu8 || ''],
          UpFile: ['UpFile', db.mssql.NVarChar, upfile || ''],
        },
        ZM: {
          ...commonFields,
          overdate: ['overdate', db.mssql.DateTime, overdate || null],
          fahuodanwei: ['fahuodanwei', db.mssql.NVarChar, fahuodanwei || ''],
          cidiehao: ['cidiehao', db.mssql.NVarChar, cidiehao || ''],
          jiagongfei: ['jiagongfei', db.mssql.NVarChar, String(jiagongfei || '')],
          kuanhao: ['kuanhao', db.mssql.NVarChar, kuanhao || ''],
          soujianjl: ['soujianjl', db.mssql.NVarChar, soujianjl || ''],
          waifa: ['waifa', db.mssql.Int, waifa ? 1 : 0],
          kts: ['kts', db.mssql.NVarChar, kts || ''],
          jijia: ['jijia', db.mssql.NVarChar, jijia || ''],
          zm_zhijian: ['zm_zhijian', db.mssql.NVarChar, zm_zhijian || ''],
          gyyq: ['gyyq', db.mssql.NVarChar, gyyq || ''],
          huahao: ['huahao', db.mssql.NVarChar, huahao || ''],
          allcount: ['allcount', db.mssql.NVarChar, allcount || ''],
          weidu: ['weidu', db.mssql.NVarChar, weidu || ''],
          kuandu: ['kuandu', db.mssql.NVarChar, kuandu || ''],
          changdu: ['changdu', db.mssql.NVarChar, changdu || ''],
          huachang: ['huachang', db.mssql.NVarChar, huachang || ''],
          chenpingcc: ['chenpingcc', db.mssql.NVarChar, chenpingcc || ''],
          dhdw: ['dhdw', db.mssql.NVarChar, dhdw || ''],
          sxdate: ['sxdate', db.mssql.NVarChar, sxdate || ''],
          proudbanbie: ['proudbanbie', db.mssql.NVarChar, proudbanbie || ''],
          // bz/bz1-bz12/qw1-qw12/ss1-ss12/cmh1-cmh10/hzl1-hzl15 由 commonFields 提供
        },
        DS: {
          ...commonFields,
          overdate: ['overdate', db.mssql.DateTime, overdate || null],
          cpgg: ['cpgg', db.mssql.NVarChar, cpgg || ''],
          pingshu: ['pingshu', db.mssql.NVarChar, pingshu || ''],
          fahuodanwei: ['fahuodanwei', db.mssql.NVarChar, fahuodanwei || ''],
          kuanhao: ['kuanhao', db.mssql.NVarChar, kuanhao || ''],
          jiagongfei: ['jiagongfei', db.mssql.NVarChar, jiagongfei || ''],
          jiage: ['jiage', db.mssql.NVarChar, jiage || ''],
          zhengli: ['zhengli', db.mssql.NVarChar, zhengli || ''],
          fhdw: ['fhdw', db.mssql.NVarChar, fhdw || ''],
          fhdate: ['fhdate', db.mssql.DateTime, fhdate || null],
          fhr: ['fhr', db.mssql.NVarChar, fhr || ''],
          yjbhao: ['yjbhao', db.mssql.NVarChar, yjbhao || ''],
        },
      };

      const fields = productFields[product_type] || {};

      // 工序分类（默认1）
      const sclcClassMap = { YS: 2, YM: 5, ZM: 1, DS: 4 };
      const sclcClassVal = sclcClassMap[product_type] || 1;

      // 过滤空值，构建 INSERT
      const present = Object.fromEntries(
        Object.entries(fields).filter(([_, v]) => v[2] !== undefined && v[2] !== null)
      );

      const colNames = Object.keys(present);
      const pNames = colNames.map((_, i) => `p${i}`);
      const paramsFlat = colNames.map((k, i) => [pNames[i], present[k][1], present[k][2]]);

      const insertSql = `INSERT INTO ${product_type} (${colNames.join(',')}) VALUES (${pNames.map(p => '@' + p).join(',')}); SELECT SCOPE_IDENTITY() as newId;`;
      console.log('>>> INSERT fields:', colNames.join(', '));
      console.log('>>> params:', paramsFlat.map(p => p[0]+'='+JSON.stringify(p[2])).join(', '));
      const result1 = await reqT(insertSql, paramsFlat);
      const newId = result1.recordset[0].newId;

      // 工序明细表
      if (sclcSteps.length > 0) {
        const gxTable = { YS: 'YSGX', YM: 'YMGX', ZM: 'ZMGX', DS: 'DSGX' }[product_type];

        // 构建工序字段
        const gxFields = { DD_id: newId, sclcClass: sclcClassVal, GXS: sclcSteps.length };

        if (product_type === 'YS') {
          // YS GX 表直接使用字段名如 hzlA1, hzlB3, hzlC1（前端直接传字段名）
          sclcSteps.forEach(step => {
            gxFields[step] = 1;
          });
        } else {
          // ZM/YM/DS GX 表使用 hzl1-hzl16，前端传 step 格式为 hzl1-开料
          sclcSteps.forEach(step => {
            const num = step.split('-')[0].replace(/[^0-9]/g, '');
            gxFields[`hzl${num}`] = 1;
          });
        }

        const gxCols = Object.keys(gxFields);
        const gxPnames = gxCols.map((_, i) => `p${i}`);
        const gxParams = gxCols.map((k, i) => [gxPnames[i], db.mssql.Int, gxFields[k]]);
        const gxInsert = `INSERT INTO ${gxTable} (${gxCols.join(',')}) VALUES (${gxPnames.map(p => '@' + p).join(',')})`;
        await reqT(gxInsert, gxParams);
      }

      // YS 印刷色数明细（yssl1-9, jine1-9, yss20, jine10, yszj）
      if (product_type === 'YS') {
        const updateParts = [];
        const updateParams = [];
        let pi = 0;
        for (let i = 1; i <= 9; i++) {
          if (body[`yssl${i}`] !== undefined || body[`jine${i}`] !== undefined) {
            updateParts.push(`yssl${i}=@p${pi}`, `jine${i}=@p${pi+1}`);
            updateParams.push([`p${pi}`, db.mssql.NVarChar, String(body[`yssl${i}`] || '')], [`p${pi+1}`, db.mssql.NVarChar, String(body[`jine${i}`] || '')]);
            pi += 2;
          }
        }
        if (body.yss20 !== undefined || body.jine10 !== undefined) {
          updateParts.push(`yss20=@p${pi}`, `jine10=@p${pi+1}`);
          updateParams.push([`p${pi}`, db.mssql.NVarChar, String(body.yss20 || '')], [`p${pi+1}`, db.mssql.NVarChar, String(body.jine10 || '')]);
          pi += 2;
        }
        if (body.yszj !== undefined) {
          updateParts.push(`yszj=@p${pi}`);
          updateParams.push([`p${pi}`, db.mssql.NVarChar, String(body.yszj || '')]);
          pi += 1;
        }
        if (updateParts.length > 0) {
          updateParams.push([`p${pi}`, db.mssql.Int, newId]);
          const updateSql = `UPDATE ${product_type} SET ${updateParts.join(',')} WHERE DD_id=@p${pi}`;
          await reqT(updateSql, updateParams);
        }
      }

      // YM 印刷色数明细（yssl1-9, jine1-9, yszj）
      if (product_type === 'YM') {
        const updateParts = [];
        const updateParams = [];
        let pi = 0;
        for (let i = 1; i <= 9; i++) {
          if (body[`yssl${i}`] !== undefined || body[`jine${i}`] !== undefined) {
            updateParts.push(`yssl${i}=@p${pi}`, `jine${i}=@p${pi+1}`);
            updateParams.push([`p${pi}`, db.mssql.NVarChar, String(body[`yssl${i}`] || '')], [`p${pi+1}`, db.mssql.NVarChar, String(body[`jine${i}`] || '')]);
            pi += 2;
          }
        }
        if (body.yszj !== undefined) {
          updateParts.push(`yszj=@p${pi}`);
          updateParams.push([`p${pi}`, db.mssql.NVarChar, String(body.yszj || '')]);
          pi += 1;
        }
        if (updateParts.length > 0) {
          updateParams.push([`p${pi}`, db.mssql.Int, newId]);
          const updateSql = `UPDATE ${product_type} SET ${updateParts.join(',')} WHERE DD_id=@p${pi}`;
          await reqT(updateSql, updateParams);
        }
      }

      // ZM 色卡明细 qw/ss/bz, 尺码 sl/lieshu
      if (product_type === 'ZM') {
        const zmParts = [];
        const zmParams = [];
        let pi = 0;
        for (let i = 1; i <= 12; i++) {
          if (body[`qw${i}`]) { zmParts.push(`qw${i}=@p${pi}`, `ss${i}=@p${pi+1}`, `bz${i}=@p${pi+2}`); zmParams.push(...[[`p${pi}`,db.mssql.NVarChar,body[`qw${i}`]],[`p${pi+1}`,db.mssql.NVarChar,body[`ss${i}`]],[`p${pi+2}`,db.mssql.NVarChar,body[`bz${i}`]]]); pi += 3; }
        }
        for (let i = 1; i <= 10; i++) {
          if (body[`sl${i}`]) { zmParts.push(`sl${i}=@p${pi}`, `lieshu${i}=@p${pi+1}`); zmParams.push(...[[`p${pi}`,db.mssql.NVarChar,body[`sl${i}`]],[`p${pi+1}`,db.mssql.NVarChar,body[`lieshu${i}`]]]); pi += 2; }
        }
        if (zmParts.length > 0) {
          zmParams.push([`p${pi}`, db.mssql.Int, newId]);
          const zmSql = `UPDATE ZM SET ${zmParts.join(',')} WHERE DD_id=@p${pi}`;
          await reqT(zmSql, zmParams);
        }
      }

      res.json({ success: true, ddbh: ddbhVal, DD_id: newId });
  } catch (err) {
    console.error('ORDER ENTRY ERROR:', err.message);
    res.status(500).json({ error: '创建订单失败', detail: err.message });
  }
});

module.exports = router;
