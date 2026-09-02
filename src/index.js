import express from 'express';
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

import settingRoutes from './routes/setting.js';
import vmRoutes from './routes/vmRoutes.js';
import vmGroupRoutes from './routes/vmGroup.js';
import systemRoutes from './routes/system.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import userGroupRoutes from './routes/usergroupGroup.js';
import taskRoutes from './routes/tasks.js';
import guacamoleRoutes from './routes/guacamole.js';

import { initAdmin } from './utils/initAdmin.js';
import { sequelize } from './config/db.js';
import { initVMWatcher } from './utils/syncVMs.js';
import { initTaskCleaner } from "./utils/taskCleaner.js";
import { updateHostIP } from './utils/networkUtils.js';
import { initOIDCConfig } from './utils/initOidc.js';
import { checkAndUpdateCertificate } from './utils/certUtils.js';
import { createOIDCProvider } from './utils/oidc.js';
import { initRdpgwConfig } from './utils/initrdpgw.js';
import { getConfig } from './utils/getConfig.js';
import { clearCert } from './utils/clearCert.js';
import { initJwt } from './utils/initJwt.js';
import { startHeartbeatChecker } from './utils/heartbeat.js';
import { initGuacamoleServer } from './utils/guacamole.js';
import { guacamoleJwt } from './utils/guacamoleJwt.js';

// 使用异步 IIFE 包裹整个启动逻辑
(async () => {
  // 清除旧的证书
  await clearCert();

  // 初始化 JWT 密钥
  initJwt();

  // 初始化 guacamoleJwt 密钥
  guacamoleJwt();
  
  // 等待 updateHostIP 完成，确保获取到最新的 IP
  await updateHostIP();

  // 确保证书存在
  checkAndUpdateCertificate('127.0.0.1');

  const key = fs.readFileSync(path.resolve('./cert/server.key'));
  const cert = fs.readFileSync(path.resolve('./cert/server.crt'));

  // ====================== ✅ 创建 OIDC 独立服务 ======================

  // 初始化 OIDC 配置，生成新的客户端密钥
  const newClientSecret = initOIDCConfig();

  const OIDC_PORT = getConfig('OIDC_PORT');
  // 使用新生成的客户端密钥，如果生成失败则使用环境变量中的值
  const OIDC_CLIENT_SECRET = newClientSecret;

  // 如果GW_HOST为空，则为HOST_IP
  const GW_HOST = getConfig('GW_HOST');
  const GW_PORT = getConfig('GW_PORT');
  const GW_PUBLIC_HOST = getConfig('GW_PUBLIC_HOST');
  const GW_PUBLIC_PORT = getConfig('GW_PUBLIC_PORT');
  const HOST_IP = getConfig('HOST_IP');

  const NEW_GW_HOST = GW_HOST || HOST_IP;
  const NEW_GW_PORT = GW_PORT || 8443;

  const NEW_GW_PUBLIC_HOST = GW_PUBLIC_HOST || HOST_IP;
  const NEW_GW_PUBLIC_PORT = GW_PUBLIC_PORT || 9443;

  const GW_URL_CALLBACK = `https://${NEW_GW_HOST}:${NEW_GW_PORT}/callback`;
  const PUBLIC_GW_URL_CALLBACK = `https://${NEW_GW_PUBLIC_HOST}:${NEW_GW_PUBLIC_PORT}/callback`;

  const { app: oidcApp } = createOIDCProvider({
    issuer: `https://127.0.0.1:${OIDC_PORT}`,
    clients: [
      {
        client_id: 'rdpgw',
        client_secret: OIDC_CLIENT_SECRET,
        redirect_uris: [GW_URL_CALLBACK, PUBLIC_GW_URL_CALLBACK],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'client_secret_basic',
      },
    ],
  });

  createHttpsServer({ key, cert }, oidcApp).listen(OIDC_PORT, '0.0.0.0', () => {
    console.log(`🔐 OIDC Provider 已启动: https://127.0.0.1:${OIDC_PORT}`);
    console.log(`健康检查: https://127.0.0.1:${OIDC_PORT}/health`);
    console.log(`发现端点: https://127.0.0.1:${OIDC_PORT}/.well-known/openid-configuration`);
  });

  // 初始化 rdpgw 配置（等待完成，确保使用最新的 HOST_IP）
  await initRdpgwConfig();

  // ====================== ✅ 原有业务服务（3000） ======================

  const app = express();
  app.use(cors());
  app.use(express.json());

  // 静态文件服务 - 提供前端的静态文件
  app.use(express.static(path.join(process.cwd(), 'dist')));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/vm', vmRoutes);
  app.use('/api/v1/vmgroup', vmGroupRoutes);
  app.use('/api/v1/system', systemRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/usergroup', userGroupRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/setting', settingRoutes);
  app.use('/api/v1/guacamole', guacamoleRoutes);

  // 单页应用路由支持 - 所有非 API 请求都返回 index.html
  app.use((req, res, next) => {
    // 检查是否是 API 请求
    if (req.path.startsWith('/api')) {
      next();
    } else {
      // 非 API 请求返回 index.html
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    }
  });

  const PORT = getConfig('PORT') || 443;

  // requestTimeout 默认 5 分钟：大文件在低带宽（如 100Mbps）下上传可能超时被强制中断，这里放宽到 2 小时
  const httpsServer = createHttpsServer({ key, cert, requestTimeout: 7200000 }, app);

  httpsServer.listen(PORT, async () => {
    try {
      await sequelize.sync();
      await initAdmin();
      initVMWatcher();
      initTaskCleaner();
      startHeartbeatChecker(0.5, 0.5);
      initGuacamoleServer(httpsServer);
      console.log(`🚀 业务服务已启动: https://${HOST_IP}:${PORT}`);
    } catch (err) {
      console.error('启动失败:', err);
    }
  });

  // ====================== ✅ HTTP -> HTTPS 重定向服务 ======================
  const httpApp = express();

  httpApp.use((req, res) => {
    const host = req.headers.host?.split(':')[0] || HOST_IP;
    res.redirect(`https://${host}:${PORT}${req.url}`);
  });

  createHttpServer(httpApp).listen(80, () => {
    console.log(`🌐 HTTP 重定向服务已启动: 80 -> ${PORT}`);
  });
})();
