const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '印刷订单管理系统 API',
      version: '1.0.0',
      description: '印刷订单管理系统后端 API 文档\n\n> 所有需要认证的接口，请在请求头中添加：\n> `Authorization: Bearer <token>`',
    },
    servers: [
      { url: 'http://localhost:8000', description: '开发环境' },
      { url: 'http://10.147.19.111:8000', description: '生产环境' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: '错误信息' },
          },
        },
        Ddbh: {
          type: 'object',
          properties: {
            ddbh: { type: 'string', description: '订单编号', example: '2604170001' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

module.exports = swaggerJsdoc(options);
