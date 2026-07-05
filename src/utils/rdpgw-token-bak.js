// rdpgw-token.js - RDP 网关令牌获取工具
import https from 'https';
import { parse } from 'node-html-parser';
import { URL } from 'url';
import dotenvx from '@dotenvx/dotenvx';
import fs from 'fs';
import path from 'path';


/**
 * RDP 网关认证类
 * 用于获取 RDP 网关的访问令牌
 */
export class RDPGatewayAuth {
  /**
   * 构造函数
   * @param {Object} options 配置选项
   * @param {string} options.rdpgwhost RDP 网关主机
   * @param {string} options.rdpgwport RDP 网关端口
   * @param {string} options.vmip 虚拟机 IP
   * @param {string} options.vmport 虚拟机 RDP 端口
   */
  constructor({ rdpgwhost, rdpgwport, vmip, vmport }) {
    // 加载环境变量
    dotenvx.config({ overload: true });

    this.rdpgwhost = rdpgwhost;
    this.rdpgwport = rdpgwport;

    // console.log('RDPGatewayAuth 构造函数参数:', rdpgwhost, rdpgwport);

    this.vmip = vmip;
    this.vmport = vmport;
    this.vmpath = `/connect?host=${vmip}:${vmport}`;

    this.cookieJar = new Map();
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.maxRedirects = 10;

    // 从环境变量获取 OIDC 管理员密码
    this.oidcAdminPassword = process.env.OIDC_ADMIN_PASSWORD || 'admin';
    // console.log('[RDPGatewayAuth] 使用 OIDC 管理员密码:', this.oidcAdminPassword ? '******' : 'admin (默认)');
  }

  /**
   * 解析响应中的 cookie
   * @param {Array} setCookieHeaders Set-Cookie 响应头
   */
  parseCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    setCookieHeaders.forEach(cookieHeader => {
      const cookie = cookieHeader.split(';')[0].trim();
      const [name, ...valueParts] = cookie.split('=');
      const value = valueParts.join('=');
      if (name && value) this.cookieJar.set(name, value);
    });
  }

  /**
   * 获取 Cookie 头部
   * @returns {string} Cookie 头部字符串
   */
  getCookieHeader() {
    return Array.from(this.cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
  }

  /**
   * 发送 HTTP 请求
   * @param {Object} options 请求选项
   * @param {string} postData POST 数据
   * @param {number} redirectCount 重定向计数
   * @returns {Promise} 响应对象
   */
  async request(options, postData = null, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cookie': this.getCookieHeader(),
        ...options.headers
      };

      const req = https.request({
        rejectUnauthorized: false,
        port: options.port || 443,
        ...options,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.headers['set-cookie']) this.parseCookies(res.headers['set-cookie']);

          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            data,
            url: `https://${options.hostname}:${options.port || 443}${options.path}`
          };

          if ((res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 303) &&
            res.headers.location && redirectCount < this.maxRedirects) {
            // console.log(`[RDPGatewayAuth] 重定向到: ${res.headers.location}`);
            this.handleRedirect(res.headers.location, options, postData, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          } else {
            resolve(response);
          }
        });
      });

      if (postData) req.write(postData);
      req.on('error', (error) => {
        // console.error('[RDPGatewayAuth] 请求错误:', error);
        reject(error);
      });
      req.end();
    });
  }

  /**
   * 处理重定向
   * @param {string} location 重定向地址
   * @param {Object} previousOptions 之前的请求选项
   * @param {string} postData POST 数据
   * @param {number} redirectCount 重定向计数
   * @returns {Promise} 响应对象
   */
  async handleRedirect(location, previousOptions, postData, redirectCount) {
    const baseUrl = `https://${previousOptions.hostname}:${previousOptions.port || 443}`;
    const url = location.startsWith('http') ? new URL(location) : new URL(location, baseUrl);
    return await this.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Cookie': this.getCookieHeader() }
    }, null, redirectCount);
  }

  /**
   * 获取 RDP 网关令牌
   * @returns {Promise} 网关访问令牌
   */
  async getToken() {
    console.log(`[RDPGatewayAuth] 开始获取 RDP 网关令牌: ${this.rdpgwhost}:${this.rdpgwport}`);
    console.log(`[RDPGatewayAuth] 目标虚拟机: ${this.vmip}:${this.vmport}`);
    console.log('[RDPGatewayAuth] 传入的 rdpgwhost:', this.rdpgwhost);
    console.log('[RDPGatewayAuth] 传入的 rdpgwport:', this.rdpgwport);

    try {
      console.log('[RDPGatewayAuth] 准备发送请求，参数:', {
        hostname: this.rdpgwhost,
        port: this.rdpgwport,
        path: this.vmpath,
        method: 'GET'
      });
      const finalResponse = await this.request({
        hostname: this.rdpgwhost,
        port: this.rdpgwport,
        path: this.vmpath,
        method: 'GET'
      });

      // console.log('[RDPGatewayAuth] 最终响应状态码:', finalResponse.statusCode);
      // console.log('[RDPGatewayAuth] 最终响应 URL:', finalResponse.url);
      // console.log('[RDPGatewayAuth] 最终响应头:', finalResponse.headers);
      // console.log('[RDPGatewayAuth] 最终响应数据:', finalResponse.data);

      if (this.isRDPFile(finalResponse.data)) {
        // console.log('[RDPGatewayAuth] 直接获取到 RDP 文件');
        return this.extractGatewayToken(finalResponse.data);
      } else {
        // console.log('[RDPGatewayAuth] 需要处理登录/授权页面');
        return await this.processPage(finalResponse.data, finalResponse.url);
      }
    } catch (error) {
      console.error('[RDPGatewayAuth] 获取令牌失败:', error);
      throw error;
    }
  }

  /**
   * 处理页面
   * @param {string} html 页面 HTML
   * @param {string} currentUrl 当前 URL
   * @returns {Promise} 网关访问令牌
   */
  async processPage(html, currentUrl) {
    try {
      const root = parse(html);

      // 检查是否是错误页面
      if (html.includes('Invalid credentials') || html.includes('login error') || html.includes('invalid username') || html.includes('invalid password')) {
        // console.error('[RDPGatewayAuth] 登录失败，无效的凭证');
        throw new Error('登录失败，无效的凭证');
      }

      // 检查是否是 RDP 文件
      if (this.isRDPFile(html)) {
        // console.log('[RDPGatewayAuth] 直接获取到 RDP 文件');
        return this.extractGatewayToken(html);
      }

      // 检查所有表单
      const forms = root.querySelectorAll('form');
      for (const form of forms) {
        if (this.isLoginForm(form)) {
          // console.log('[RDPGatewayAuth] 处理登录页面');
          return await this.submitLoginForm(form, currentUrl);
        } else if (this.isAuthForm(form)) {
          // console.log('[RDPGatewayAuth] 处理授权页面');
          return await this.submitAuthForm(form, currentUrl);
        }
      }

      // 检查是否是其他类型的页面
      // console.warn('[RDPGatewayAuth] 未知页面类型，尝试提取令牌');
      // console.warn('[RDPGatewayAuth] 页面内容预览:', html.substring(0, 1000) + '...');
      // console.warn('[RDPGatewayAuth] 当前 URL:', currentUrl);
      // console.warn('[RDPGatewayAuth] 页面长度:', html.length);
      // console.warn('[RDPGatewayAuth] 页面是否包含 form:', html.includes('form'));
      // console.warn('[RDPGatewayAuth] 页面是否包含 gatewayaccesstoken:', html.includes('gatewayaccesstoken'));

      // 尝试直接从页面中提取令牌
      if (html.includes('gatewayaccesstoken:s:')) {
        // console.log('[RDPGatewayAuth] 从页面中提取到令牌');
        return this.extractGatewayToken(html);
      }

      // 尝试检查是否有重定向到 RDP 文件的链接
      const rdpLinks = root.querySelectorAll('a[href$=".rdp"]');
      if (rdpLinks.length > 0) {
        // console.log('[RDPGatewayAuth] 找到 RDP 文件链接，尝试获取');
        const rdpLink = rdpLinks[0].getAttribute('href');
        const rdpUrl = rdpLink.startsWith('http') ? new URL(rdpLink) : new URL(rdpLink, currentUrl);
        const rdpResponse = await this.request({
          hostname: rdpUrl.hostname,
          port: rdpUrl.port || 443,
          path: rdpUrl.pathname + rdpUrl.search,
          method: 'GET'
        });
        if (this.isRDPFile(rdpResponse.data)) {
          // console.log('[RDPGatewayAuth] 从 RDP 文件链接获取到 RDP 文件');
          return this.extractGatewayToken(rdpResponse.data);
        }
      }

      throw new Error('未知页面类型，无法获取 token');
    } catch (error) {
      // console.error('[RDPGatewayAuth] 处理页面失败:', error);
      throw error;
    }
  }

  /**
   * 检查是否是登录表单
   * @param {Object} form 表单元素
   * @returns {boolean} 是否是登录表单
   */
  isLoginForm(form) {
    const inputs = form.querySelectorAll('input');
    // 检查是否存在用户名输入框（可能是 text、email 或其他类型）
    const hasUsernameInput = Array.from(inputs).some(input => {
      const type = input.getAttribute('type');
      const name = input.getAttribute('name');
      return type === 'text' || type === 'email' || name?.toLowerCase().includes('user') || name?.toLowerCase().includes('email');
    });
    // 检查是否存在密码输入框
    const hasPasswordInput = Array.from(inputs).some(input => {
      const type = input.getAttribute('type');
      const name = input.getAttribute('name');
      return type === 'password' || name?.toLowerCase().includes('pass');
    });
    return hasUsernameInput && hasPasswordInput;
  }

  /**
   * 检查是否是授权表单
   * @param {Object} form 表单元素
   * @returns {boolean} 是否是授权表单
   */
  isAuthForm(form) {
    const buttons = form.querySelectorAll('button, input[type="submit"]');
    return Array.from(buttons).some(button =>
      button.textContent?.includes('Continue') ||
      button.getAttribute('value')?.includes('Continue') ||
      button.textContent?.includes('Authorize') ||
      button.getAttribute('value')?.includes('Authorize') ||
      button.textContent?.includes('同意') ||
      button.getAttribute('value')?.includes('同意') ||
      button.textContent?.includes('授权') ||
      button.getAttribute('value')?.includes('授权') ||
      button.textContent?.includes('Allow') ||
      button.getAttribute('value')?.includes('Allow')
    );
  }

  /**
   * 提交登录表单
   * @param {Object} loginForm 登录表单
   * @param {string} currentUrl 当前 URL
   * @returns {Promise} 网关访问令牌
   */
  async submitLoginForm(loginForm, currentUrl) {
    const formAction = loginForm.getAttribute('action');
    const formMethod = loginForm.getAttribute('method') || 'POST';
    const formData = new URLSearchParams();

    // 构建表单数据
    loginForm.querySelectorAll('input').forEach(input => {
      const name = input.getAttribute('name');
      const value = input.getAttribute('value') || '';
      const type = input.getAttribute('type');
      if (!name) return;
      // 处理用户名输入框（可能是 text、email 或其他类型）
      if (type === 'text' || type === 'email' || name.toLowerCase().includes('user') || name.toLowerCase().includes('email')) {
        formData.append(name, 'admin');
        // console.log('[RDPGatewayAuth] 表单字段:', name, '值: admin');
      } else if (type === 'password' || name.toLowerCase().includes('pass')) {
        // 每次提交登录表单时都重新读取 .env 文件，以获取最新的 OIDC_ADMIN_PASSWORD
        const envPath = path.resolve(process.cwd(), '.env');
        let latestPassword = 'admin';

        try {
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/OIDC_ADMIN_PASSWORD=(.*)$/m);
            if (match && match[1]) {
              latestPassword = match[1];
              // console.log('[RDPGatewayAuth] 从 .env 文件读取最新的 OIDC 管理员密码: ******');
            }
          }
        } catch (error) {
          // console.error('[RDPGatewayAuth] 读取 .env 文件失败:', error);
        }

        formData.append(name, latestPassword);
        // console.log('[RDPGatewayAuth] 表单字段:', name, '值: ******');
      } else {
        formData.append(name, value);
        // console.log('[RDPGatewayAuth] 表单字段:', name, '值:', value);
      }
    });

    // console.log('[RDPGatewayAuth] 提交登录表单，使用用户名: admin');
    // console.log('[RDPGatewayAuth] 表单数据:', formData.toString());

    const targetUrl = formAction.startsWith('http') ? new URL(formAction) : new URL(formAction, currentUrl);
    const result = await this.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: targetUrl.pathname + targetUrl.search,
      method: formMethod,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': `https://${targetUrl.hostname}:${targetUrl.port || 443}`,
        'Referer': currentUrl
      }
    }, formData.toString());

    // console.log('[RDPGatewayAuth] 登录表单提交响应状态码:', result.statusCode);
    // console.log('[RDPGatewayAuth] 登录表单提交响应 URL:', result.url);
    // console.log('[RDPGatewayAuth] 登录表单提交响应内容长度:', result.data.length);
    // console.log('[RDPGatewayAuth] 登录表单提交响应内容预览:', result.data.substring(0, 500) + '...');

    if (this.isRDPFile(result.data)) {
      // console.log('[RDPGatewayAuth] 登录成功，获取到 RDP 文件');
      return this.extractGatewayToken(result.data);
    } else if (result.statusCode === 200) {
      // console.log('[RDPGatewayAuth] 登录后需要继续处理页面');
      return await this.processPage(result.data, result.url);
    } else {
      // console.error('[RDPGatewayAuth] 登录失败，状态码:', result.statusCode);
      throw new Error(`登录失败，状态码: ${result.statusCode}`);
    }
  }

  /**
   * 提交授权表单
   * @param {Object} authForm 授权表单
   * @param {string} currentUrl 当前 URL
   * @returns {Promise} 网关访问令牌
   */
  async submitAuthForm(authForm, currentUrl) {
    const formData = new URLSearchParams();

    // 构建表单数据
    authForm.querySelectorAll('input').forEach(input => {
      const name = input.getAttribute('name');
      const value = input.getAttribute('value') || '';
      if (name) formData.append(name, value);
    });

    // console.log('[RDPGatewayAuth] 提交授权表单');

    const formAction = authForm.getAttribute('action');
    const targetUrl = formAction.startsWith('http') ? new URL(formAction) : new URL(formAction, currentUrl);
    const result = await this.request({
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': `https://${targetUrl.hostname}:${targetUrl.port || 443}`,
        'Referer': currentUrl
      }
    }, formData.toString());

    if (this.isRDPFile(result.data)) {
      // console.log('[RDPGatewayAuth] 授权成功，获取到 RDP 文件');
      return this.extractGatewayToken(result.data);
    } else if (result.statusCode === 200) {
      // console.log('[RDPGatewayAuth] 授权后需要继续处理页面');
      return await this.processPage(result.data, result.url);
    }
  }

  /**
   * 检查是否是 RDP 文件
   * @param {string} content 内容
   * @returns {boolean} 是否是 RDP 文件
   */
  isRDPFile(content) {
    return content && content.includes('full address');
  }

  /**
   * 提取网关访问令牌
   * @param {string} content RDP 文件内容
   * @returns {string} 网关访问令牌
   */
  extractGatewayToken(content) {
    const tokenLine = content.split('\n').find(line => line.startsWith('gatewayaccesstoken:s:'));
    if (tokenLine) {
      const token = tokenLine.replace('gatewayaccesstoken:s:', '').trim();
      // console.log('[RDPGatewayAuth] 成功提取网关访问令牌');
      return token;
    }
    throw new Error('未找到 gatewayaccesstoken');
  }
}

/**
 * 获取 RDP 网关访问令牌
 * @param {Object} options 配置选项
 * @param {string} options.rdpgwhost RDP 网关主机
 * @param {string} options.rdpgwport RDP 网关端口
 * @param {string} options.vmip 虚拟机 IP
 * @param {string} options.vmport 虚拟机 RDP 端口
 * @returns {Promise} 网关访问令牌
 */
export async function getGatewayAccessToken({ rdpgwhost, rdpgwport, vmip, vmport }) {
  // console.log('[RDPGateway] 开始获取 RDP 网关访问令牌');

  // 禁用 TLS 证书验证（仅用于开发环境）
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    const auth = new RDPGatewayAuth({ rdpgwhost, rdpgwport, vmip, vmport });
    const token = await auth.getToken();
    // console.log('[RDPGateway] 成功获取 RDP 网关访问令牌');
    return token;
  } catch (error) {
    // console.error('[RDPGateway] 获取 RDP 网关访问令牌失败:', error);
    throw error;
  }
}
