import axios from 'axios';
import qs from 'qs';
import https from 'https';
import { getConfig } from '../utils/getConfig.js';

const refreshMargin = 10 * 60 * 1000;

function getPVEConfig() {
  const PVE_USER = getConfig('PVE_USER') || '';
  const PVE_PASSWORD = getConfig('PVE_PASSWORD') || '';
  const PVE_HOST = getConfig('PVE_HOST') || '';
  const PVE_PORT = getConfig('PVE_PORT') || 8006;
  return {
    username: PVE_USER + '@pam',
    password: PVE_PASSWORD,
    host: PVE_HOST,
    port: PVE_PORT
  };
}

let cachedAuth = null;
let expireTime = 0;
let refreshing = false;

async function fetchAuth() {
  const configPVE = getPVEConfig();
  const data = qs.stringify({
    username: configPVE.username,
    password: configPVE.password
  });

  const config = {
    method: 'post',
    url: `https://${configPVE.host}:${configPVE.port}/api2/json/access/ticket`,
    headers: {},
    data,
    httpsAgent: new https.Agent({ rejectUnauthorized: false })
  };

  const res = await axios(config);
  const ticket = res.data.data.ticket;
  const CSRFPreventionToken = res.data.data.CSRFPreventionToken;

  const ttl = 120 * 60 * 1000;
  expireTime = Date.now() + ttl - refreshMargin;

  cachedAuth = { ticket, CSRFPreventionToken };
  console.log(`[ProxmoxAuth] 刷新票据成功，下一次刷新约在 ${new Date(expireTime).toLocaleTimeString()}`);
  return cachedAuth;
}

export async function getProxmoxAuth() {
  if (cachedAuth && Date.now() < expireTime) return cachedAuth;

  if (refreshing) {
    await new Promise(res => setTimeout(res, 100));
    return getProxmoxAuth();
  }

  try {
    refreshing = true;
    return await fetchAuth();
  } finally {
    refreshing = false;
  }
}

export async function pveRequest(method, endpoint, data = null) {
  try {
    const { ticket, CSRFPreventionToken, message } = await getProxmoxAuth();

    if (!ticket) {
      return { error: '认证失败', message };
    }

    const configPVE = getPVEConfig();
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    const config = {
      method: method.toLowerCase(),
      url: `https://${configPVE.host}:${configPVE.port}/api2/json${formattedEndpoint}`,
      headers: {
        'CSRFPreventionToken': CSRFPreventionToken,
        'Cookie': 'PVEAuthCookie=' + ticket
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    };

    if (data && ['post', 'put', 'patch'].includes(method.toLowerCase())) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;

  } catch (error) {
    const status = error.response?.status;
    const errorData = error.response?.data?.data || error.response?.data;
    const errorMessage = errorData?.errors || errorData?.message || error.message;

    console.error(`PVE API 请求失败 [${method} ${endpoint}]:`, status, errorMessage);

    return {
      error: '请求失败',
      status,
      details: errorMessage,
      endpoint,
      method
    };
  }
}