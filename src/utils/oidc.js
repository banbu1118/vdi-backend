import fs from 'fs';
import path from 'path';
import express from 'express';
import { Provider } from 'oidc-provider';
import crypto from 'crypto';
import { getConfig } from './getConfig.js';
import {setConfig} from './setConfig.js';

export function createOIDCProvider({ issuer, clients}) {
  // 生成随机密码并加密
  const generateRandomPassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      const bytes = crypto.randomBytes(36);
      let password = '';
      for (let i = 0; i < 36; i++) {
          password += chars.charAt(bytes[i] % chars.length);
      }
      return password;
  };

  // 每次启动生成admin用户密码
  const password = generateRandomPassword();
  // console.log('Generated password:', password);

  // 更新配置
  setConfig('OIDC_ADMIN_PASSWORD', password);

  // 如果没有提供cookieKey，生成一个
  const CookieKey =crypto.randomBytes(32).toString('hex');
  // console.log('Cookie key:', finalCookieKey);

  // 用户数据
  const users = {
      'admin': { sub: 'admin', username: 'admin', password: password, email: 'admin@example.com' }
  };

  // 配置
  const configuration = {
      clients,
      features: {
          devInteractions: { enabled: false },
          introspection: { enabled: true },
          revocation: { enabled: true },
      },
      cookies: {
        keys: [CookieKey],
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      },
      claims: {
          openid: ['sub', 'username', 'preferred_username'],
          profile: ['username', 'preferred_username', 'email'],
      },
      findAccount: async (ctx, id) => {
          const user = users[id];
          if (!user) return undefined;

          return {
              accountId: id,
              async claims(use, scope) {
                  return {
                      sub: user.sub,
                      username: user.username,
                      preferred_username: user.username,
                      email: user.email,
                  };
              },
          };
      },
      // 配置登录页面
      interactions: {
          url: (ctx, interaction) => {
              const { prompt } = interaction;
              if (prompt && prompt.name === 'consent') {
                  return `/interaction/${interaction.uid}/consent`;
              }
              return `/interaction/${interaction.uid}`;
          },
      },
  };

  // 启动 Provider
  const oidc = new Provider(issuer, configuration);

  const app = express();

  // 允许的域名列表
//   const allowedOrigins = ['https://192.168.1.50:8443'];
// 允许所有域名
const allow_url = 'https://' +getConfig('HOST_IP') + ':' + getConfig('PORT');
const allowedOrigins = [allow_url];

  // 配置CORS和安全头部
  app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (allowedOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      // 安全头部
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      
      if (req.method === 'OPTIONS') {
          return res.status(200).end();
      }
      next();
  });

  // 解析请求体
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // 健康检查
  app.get('/health', (req, res) => res.status(200).send('ok'));

  // 登录页面
  app.get('/interaction/:uid', async (req, res) => {
      try {
          const details = await oidc.interactionDetails(req, res);
          const { uid, prompt, params } = details;
          
          // HTML转义函数
          const escapeHtml = (str) => {
              return str
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
          };
          
          // 简单的登录表单
          res.send(`
              <html>
                  <head>
                      <title>Login</title>
                      <style>
                          body { font-family: Arial, sans-serif; margin: 40px; }
                          .login-form { max-width: 300px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                          .form-group { margin-bottom: 15px; }
                          label { display: block; margin-bottom: 5px; }
                          input { width: 100%; padding: 8px; box-sizing: border-box; }
                          button { width: 100%; padding: 10px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                          button:hover { background-color: #45a049; }
                          .error { color: red; margin-top: 10px; }
                      </style>
                  </head>
                  <body>
                      <div class="login-form">
                          <h2>Login</h2>
                          <form method="post" action="/interaction/${escapeHtml(uid)}/login">
                              <div class="form-group">
                                  <label>Username:</label>
                                  <input type="text" name="username" required>
                              </div>
                              <div class="form-group">
                                  <label>Password:</label>
                                  <input type="password" name="password" required>
                              </div>
                              <button type="submit">Login</button>
                          </form>
                      </div>
                  </body>
              </html>
          `);
      } catch (error) {
          // console.error('Error rendering login page:', error);
          res.status(500).send('Internal Server Error');
      }
  });

  // 处理登录提交
  app.post('/interaction/:uid/login', async (req, res) => {
      try {
          const { uid } = req.params;
          let { username, password } = req.body;
          
          // 输入验证
          if (!username || !password) {
              // console.log('Missing username or password');
              // HTML转义函数
              const escapeHtml = (str) => {
                  return str
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
              };
              return res.send(`
                  <html>
                      <head>
                          <title>Login Error</title>
                      </head>
                      <body>
                          <h2>Missing username or password</h2>
                          <p>Please provide both username and password.</p>
                          <a href="/interaction/${escapeHtml(uid)}">Back to login</a>
                      </body>
                  </html>
              `);
          }
          
          // 清理输入
          username = username.trim();
          password = password.trim();
          
          // 验证长度
          if (username.length < 3 || username.length > 20) {
              // console.log('Invalid username length:', username);
              // HTML转义函数
              const escapeHtml = (str) => {
                  return str
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
              };
              return res.send(`
                  <html>
                      <head>
                          <title>Login Error</title>
                      </head>
                      <body>
                          <h2>Invalid username</h2>
                          <p>Username must be between 3 and 20 characters.</p>
                          <a href="/interaction/${escapeHtml(uid)}">Back to login</a>
                      </body>
                  </html>
              `);
          }
          
          // 验证用户名格式（只允许字母、数字和下划线）
          if (!/^[a-zA-Z0-9_]+$/.test(username)) {
              // console.log('Invalid username format:', username);
              // HTML转义函数
              const escapeHtml = (str) => {
                  return str
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
              };
              return res.send(`
                  <html>
                      <head>
                          <title>Login Error</title>
                      </head>
                      <body>
                          <h2>Invalid username</h2>
                          <p>Username can only contain letters, numbers, and underscores.</p>
                          <a href="/interaction/${escapeHtml(uid)}">Back to login</a>
                      </body>
                  </html>
              `);
          }
          
          // console.log('Login attempt for user:', username);
          // console.log('Interaction ID:', uid);
          
          // 从 .env 文件读取最新的 OIDC_ADMIN_PASSWORD
          let correctPassword = password;
          // 用户验证
          const user = users[username];
          if (!user) {
              // console.log('Invalid credentials for user:', username);
              // HTML转义函数
              const escapeHtml = (str) => {
                  return str
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
              };
              return res.send(`
                  <html>
                      <head>
                          <title>Login Error</title>
                      </head>
                      <body>
                          <h2>Invalid credentials</h2>
                          <p>Please try again.</p>
                          <a href="/interaction/${escapeHtml(uid)}">Back to login</a>
                      </body>
                  </html>
              `);
          }
          
          if (username === 'admin') {
              try {
                  const envPath = path.resolve(process.cwd(), '.env');
                  if (fs.existsSync(envPath)) {
                      const envContent = fs.readFileSync(envPath, 'utf8');
                      const match = envContent.match(/OIDC_ADMIN_PASSWORD=(.*)$/m);
                      if (match && match[1]) {
                          correctPassword = match[1];
                          // console.log('[OIDC] 从 .env 文件读取最新的 OIDC 管理员密码: ******');
                      }
                  }
              } catch (error) {
                  // console.error('[OIDC] 读取 .env 文件失败:', error);
              }
          } else {
              // 对于非 admin 用户，使用内存中的密码
              correctPassword = user.password;
          }
          
          if (correctPassword !== password) {
              // console.log('Invalid credentials for user:', username);
              // HTML转义函数
              const escapeHtml = (str) => {
                  return str
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
              };
              return res.send(`
                  <html>
                      <head>
                          <title>Login Error</title>
                      </head>
                      <body>
                          <h2>Invalid credentials</h2>
                          <p>Please try again.</p>
                          <a href="/interaction/${escapeHtml(uid)}">Back to login</a>
                      </body>
                  </html>
              `);
          }
          
          // console.log('Login successful for user:', username);
          
          const result = {
              login: {
                  accountId: user.sub,
              },
          };
          
          // console.log('Attempting to finish login interaction with result:', result);
          
          await oidc.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
          
          // console.log('Login interaction finished successfully');
      } catch (error) {
          // console.error('Error processing login:', error);
          res.status(500).send('Internal Server Error');
      }
  });

  // 同意页面
  app.get('/interaction/:uid/consent', async (req, res) => {
      try {
          const details = await oidc.interactionDetails(req, res);
          const { uid, prompt, params } = details;
          
          // console.log('Consent interaction details:', JSON.stringify(details, null, 2));
          
          // HTML转义函数
          const escapeHtml = (str) => {
              return str
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
          };
          
          // 简单的同意表单
          res.send(`
              <html>
                  <head>
                      <title>Consent</title>
                      <style>
                          body { font-family: Arial, sans-serif; margin: 40px; }
                          .consent-form { max-width: 400px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                          .scope-list { margin: 20px 0; }
                          .scope-item { margin: 5px 0; }
                          button { padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                          button:hover { background-color: #45a049; }
                      </style>
                  </head>
                  <body>
                      <div class="consent-form">
                          <h2>Consent</h2>
                          <p>Client <strong>${escapeHtml(params.client_id)}</strong> is requesting access to:</p>
                          <div class="scope-list">
                              ${params.scope.split(' ').map(scope => `<div class="scope-item">• ${escapeHtml(scope)}</div>`).join('')}
                          </div>
                          <form method="post" action="/interaction/${escapeHtml(uid)}/consent">
                              <button type="submit">Allow</button>
                          </form>
                      </div>
                  </body>
              </html>
          `);
      } catch (error) {
          // console.error('Error rendering consent page:', error);
          res.status(500).send('Internal Server Error');
      }
  });

  // 处理同意提交
  app.post('/interaction/:uid/consent', async (req, res) => {
      try {
          const { uid } = req.params;

          const interactionDetails = await oidc.interactionDetails(req, res);
          const { prompt, params, session } = interactionDetails;

          let grant;

          if (interactionDetails.grantId) {
              grant = await oidc.Grant.find(interactionDetails.grantId);
          } else {
              grant = new oidc.Grant({
                  accountId: session.accountId,
                  clientId: params.client_id,
              });
          }

          if (prompt && prompt.details && prompt.details.missingOIDCScope) {
              grant.addOIDCScope(prompt.details.missingOIDCScope.join(' '));
          }

          const grantId = await grant.save();

          const result = { consent: { grantId } };

          await oidc.interactionFinished(req, res, result);

      } catch (err) {
          // console.error(err);
          res.status(500).send('consent error');
      }
  });

  // 全局错误处理
  app.use((err, req, res, next) => {
      // console.error('Error:', err);
      
      // 始终返回通用错误信息，不暴露详细错误
      res.status(err.status || 500).json({
          error: {
              message: 'Internal Server Error',
              status: err.status || 500,
          },
      });
  });

  // 注册oidc路由
  app.use(oidc.callback());

  return { app, oidc };
}