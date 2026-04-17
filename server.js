require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 8000;
// Middleware

app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin/orders', require('./routes/admin'));
app.use('/api/order-entry', require('./routes/order_entry'));
app.use('/api/base-data', require('./routes/base_data'));
app.use('/api/fahuo', require('./routes/fahuo'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/query', require('./routes/query'));
app.use('/api/production', require('./routes/production'));

// Static files (production build)
const staticPath = path.join(__dirname, '../yinshua-admin/dist');
app.use(express.static(staticPath));

// Health check
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
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
});
