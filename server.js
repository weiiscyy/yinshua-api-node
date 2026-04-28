require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Swagger spec JSON 端点（供前端 UI 调用）
app.get('/api-docs/spec.json', (req, res) => {
  res.json(swaggerSpec);
});

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: '印刷订单 API 文档',
  swaggerOptions: {
    persistAuthorization: true,
    spec: swaggerSpec,
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', require('./routes/admin'));
app.use('/api/order-entry', require('./routes/order_entry'));
app.use('/api/base-data', require('./routes/base_data'));
app.use('/api/users', require('./routes/users'));
app.use('/api/fahuo', require('./routes/fahuo'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/query', require('./routes/query'));
app.use('/api/production', require('./routes/production'));

// Static files (production build)
const staticPath = path.join(__dirname, '../yinshua-admin/dist');
app.use(express.static(staticPath));

// 开发记录（.md 渲染为 HTML）- 必须放在 static 中间件之后、SPA fallback 之前
app.get('/changelog', (req, res) => {
  const fs = require('fs');
  const mdPath = path.join(__dirname, '../印刷订单管理系统-开发记录.md');
  const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '# 开发记录\n\n文件不存在。';
  const bodyHtml = content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n{3,}/g, '\n\n');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>开发记录</title><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;background:#f5f7fa;color:#333}
    h1{background:#1677ff;color:#fff;padding:16px 24px;border-radius:6px;margin-bottom:24px}
    h2{color:#1677ff;margin-top:32px;border-bottom:2px solid #e6f4ff;padding-bottom:8px}
    h3{color:#555;margin-top:20px}
    code{background:#f0f0f0;padding:2px 6px;border-radius:3px}
    pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto;font-size:13px}
    ul{line-height:2}
    strong{color:#c0392b}
  </style></head><body>${bodyHtml}</body></html>`;
  res.send(html);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/api-docs')) {
    res.sendFile(path.join(staticPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// 全局错误处理 & 审计日志（最外层）
const { errorHandler } = require('./middleware/common');
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`印刷订单 API 已启动: http://0.0.0.0:${PORT}`);
  console.log(`API 文档: http://0.0.0.0:${PORT}/api-docs`);
});
