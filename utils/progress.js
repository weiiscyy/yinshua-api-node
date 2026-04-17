/**
 * 工序进度计算工具
 * 统一 STEPS / buildProgress 定义，消除重复代码
 */

const STEPS = [
  { field: 'jhkddClass', label: '接单',     order: 1, timeField: 'jhkddTime' },
  { field: 'jhkprint',   label: '打印/晒版', order: 2, timeField: 'jhkprintTime' },
  { field: 'sccjjs',    label: '车间接收',  order: 3, timeField: 'sccjjsTime' },
  { field: 'sccjyl',    label: '预领料',    order: 4, timeField: 'sccjylTime' },
  { field: 'sccjdn',    label: '电脑制版',  order: 5, timeField: 'sccjdnTime' },
  { field: 'sccjsc',    label: '生产',      order: 6, timeField: 'sccjscTime' },
  { field: 'sccjwc',   label: '完成',      order: 7, timeField: 'sccjwcTime' },
  { field: 'hzljs',     label: '汇总',      order: 8, timeField: 'hzljsTime' },
  { field: 'fahuo',     label: '发货',      order: 9, timeField: 'fahuoTime' },
];

const PRODUCT_NAMES = { YS: '印刷', YM: '印刷面', ZM: '纸盒', DS: '模切' };
const TABLE_MAP = { YS: 'YS', YM: 'YM', ZM: 'ZM', DS: 'DS' };

/**
 * 工序进度可视化
 * @param {object} order - 订单行数据
 * @param {string} productType - 产品线 YS/YM/ZM/DS
 * @returns {object} 包含 steps 数组和基本信息的进度对象
 */
function buildProgress(order, productType) {
  const steps = STEPS.map(s => {
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
    product_name: PRODUCT_NAMES[productType] || productType,
    steps,
    ZT: order.ZT || 0,
    fahuo: order.fahuo === true || order.fahuo === 1,
    prouddate: order.prouddate ? new Date(order.prouddate).toISOString() : null,
    overdate: order.overdate ? new Date(order.overdate).toISOString() : null,
  };
}

/**
 * 按产品线过滤工序步骤
 * @param {string} productType - YS/YM/ZM/DS
 * @returns {array} 过滤后的 steps 数组
 */
function getStepsForType(productType) {
  // YS 没有 sccjyl 和 sccjdn 同时存在的情况，按需过滤
  if (productType === 'YS') {
    return STEPS.filter(s =>
      ['jhkddClass', 'jhkprint', 'sccjjs', 'sccjyl', 'sccjdn', 'sccjsc', 'sccjwc', 'hzljs', 'fahuo']
      .includes(s.field)
    );
  }
  return STEPS;
}

module.exports = { STEPS, PRODUCT_NAMES, TABLE_MAP, buildProgress, getStepsForType };
