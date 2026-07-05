// rdpgw-token.js - 完整可运行版本
import https from 'https';
import { parse } from 'node-html-parser';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { getConfig } from './getConfig.js';

export class RDPGatewayAuth {
  constructor({ rdpgwhost, rdpgwport, vmip, vmport }) {

    this.rdpgwhost = rdpgwhost;
    this.rdpgwport = rdpgwport;
    this.vmip = vmip;
    this.vmport = vmport;
    this.vmpath = `/connect?host=${vmip}:${vmport}`;

    this.cookieJar = new Map();
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    this.maxRedirects = 10;

    this._lastHost = rdpgwhost; // 上一次 host
    const OIDC_ADMIN_PASSWORD = getConfig('OIDC_ADMIN_PASSWORD')
    this.oidcAdminPassword = OIDC_ADMIN_PASSWORD || 'admin';
  }

  // -------------------- cookie/session 管理 --------------------
  clearCookies() {
    this.cookieJar.clear();
  }

  checkHostChange(newHost) {
    if (this._lastHost !== newHost) {
      this.clearCookies();
      this._lastHost = newHost;
      // console.log('[RDPGatewayAuth] Host 改变，清空 cookie 会话');
    }
  }

  parseCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    setCookieHeaders.forEach(cookieHeader => {
      const cookie = cookieHeader.split(';')[0].trim();
      const [name, ...valueParts] = cookie.split('=');
      const value = valueParts.join('=');
      if (name && value) this.cookieJar.set(name, value);
    });
  }

  getCookieHeader() {
    return Array.from(this.cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join('; ');
  }

  // -------------------- 请求 --------------------
  async request(options, postData = null, redirectCount = 0) {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cookie': this.getCookieHeader(),
      ...options.headers
    };

    return new Promise((resolve, reject) => {
      const req = https.request({
        rejectUnauthorized: false,
        port: options.port || 443,
        ...options,
        headers
      }, res => {
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
            this.handleRedirect(res.headers.location, options, postData, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          } else {
            resolve(response);
          }
        });
      });

      if (postData) req.write(postData);
      req.on('error', reject);
      req.end();
    });
  }

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

  // -------------------- Token 获取 --------------------
  async getToken() {
    this.checkHostChange(this.rdpgwhost); // 检查 host 是否改变

    const finalResponse = await this.request({
      hostname: this.rdpgwhost,
      port: this.rdpgwport,
      path: this.vmpath,
      method: 'GET'
    });

    if (this.isRDPFile(finalResponse.data)) {
      return this.extractGatewayToken(finalResponse.data);
    } else {
      return await this.processPage(finalResponse.data, finalResponse.url);
    }
  }

  async processPage(html, currentUrl) {
    const root = parse(html);

    if (html.includes('Invalid credentials') || html.includes('login error')) {
      throw new Error('登录失败，无效的凭证');
    }

    if (this.isRDPFile(html)) return this.extractGatewayToken(html);

    const forms = root.querySelectorAll('form');
    for (const form of forms) {
      if (this.isLoginForm(form)) return await this.submitLoginForm(form, currentUrl);
      if (this.isAuthForm(form)) return await this.submitAuthForm(form, currentUrl);
    }

    if (html.includes('gatewayaccesstoken:s:')) return this.extractGatewayToken(html);

    const rdpLinks = root.querySelectorAll('a[href$=".rdp"]');
    if (rdpLinks.length > 0) {
      const rdpLink = rdpLinks[0].getAttribute('href');
      const rdpUrl = rdpLink.startsWith('http') ? new URL(rdpLink) : new URL(rdpLink, currentUrl);
      const rdpResponse = await this.request({
        hostname: rdpUrl.hostname,
        port: rdpUrl.port || 443,
        path: rdpUrl.pathname + rdpUrl.search,
        method: 'GET'
      });
      if (this.isRDPFile(rdpResponse.data)) return this.extractGatewayToken(rdpResponse.data);
    }

    throw new Error('未知页面类型，无法获取 token');
  }

  // -------------------- 表单检测 --------------------
  isLoginForm(form) {
    const inputs = form.querySelectorAll('input');
    const hasUsernameInput = Array.from(inputs).some(input => {
      const type = input.getAttribute('type');
      const name = input.getAttribute('name');
      return type === 'text' || type === 'email' || name?.toLowerCase().includes('user');
    });
    const hasPasswordInput = Array.from(inputs).some(input => {
      const type = input.getAttribute('type');
      const name = input.getAttribute('name');
      return type === 'password' || name?.toLowerCase().includes('pass');
    });
    return hasUsernameInput && hasPasswordInput;
  }

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

  isRDPFile(content) {
    return content && content.includes('full address');
  }

  extractGatewayToken(content) {
    const tokenLine = content.split('\n').find(line => line.startsWith('gatewayaccesstoken:s:'));
    if (tokenLine) return tokenLine.replace('gatewayaccesstoken:s:', '').trim();
    throw new Error('未找到 gatewayaccesstoken');
  }

  // -------------------- 表单提交 --------------------
  async submitLoginForm(loginForm, currentUrl) {
    const formAction = loginForm.getAttribute('action');
    const formMethod = loginForm.getAttribute('method') || 'POST';
    const formData = new URLSearchParams();

    loginForm.querySelectorAll('input').forEach(input => {
      const name = input.getAttribute('name');
      const value = input.getAttribute('value') || '';
      const type = input.getAttribute('type');
      if (!name) return;

      if (type === 'text' || type === 'email' || name.toLowerCase().includes('user')) {
        formData.append(name, 'admin');
      } else if (type === 'password' || name.toLowerCase().includes('pass')) {
        let latestPassword = 'admin';
        const envPath = path.resolve(process.cwd(), '.env');
        try {
          if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const match = envContent.match(/OIDC_ADMIN_PASSWORD=(.*)$/m);
            if (match && match[1]) latestPassword = match[1];
          }
        } catch {}
        formData.append(name, latestPassword);
      } else {
        formData.append(name, value);
      }
    });

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

    if (this.isRDPFile(result.data)) return this.extractGatewayToken(result.data);
    else if (result.statusCode === 200) return await this.processPage(result.data, result.url);
    else throw new Error(`登录失败，状态码: ${result.statusCode}`);
  }

  async submitAuthForm(authForm, currentUrl) {
    const formData = new URLSearchParams();
    authForm.querySelectorAll('input').forEach(input => {
      const name = input.getAttribute('name');
      const value = input.getAttribute('value') || '';
      if (name) formData.append(name, value);
    });

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

    if (this.isRDPFile(result.data)) return this.extractGatewayToken(result.data);
    else if (result.statusCode === 200) return await this.processPage(result.data, result.url);
  }
}

// -------------------- 外部调用函数 --------------------
export async function getGatewayAccessToken({ rdpgwhost, rdpgwport, vmip, vmport }) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const auth = new RDPGatewayAuth({ rdpgwhost, rdpgwport, vmip, vmport });
  return await auth.getToken();
}