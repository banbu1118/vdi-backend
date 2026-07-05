import crypto from 'crypto';
import GuacamoleLite from 'guacamole-lite';
import { getConfig } from './getConfig.js';

const SECRET_KEY = getConfig('guacamole_SECRET');

function encryptToken(value) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('AES-256-CBC', Buffer.from(SECRET_KEY), iv);
  let encrypted = cipher.update(JSON.stringify(value), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const data = {
    iv: iv.toString('base64'),
    value: encrypted,
    exp: Date.now() + 3 * 60 * 1000
  };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function generateGuacamoleToken(userInfo,vmInfo, width = 1920, height = 1080) {

    const cs_clipboard = userInfo.client_to_server_clipboard == '0' ? true:false
    const sc_clipboard = userInfo.server_to_client_clipboard == '0' ? true:false

  const tokenObj = {
    connection: {
      type: 'rdp',
      settings: {
        hostname: vmInfo.ip || '127.0.0.1',
        port: vmInfo.rdp_port || '3389',
        username: vmInfo.vm_user || 'administrator',
        password: vmInfo.vm_password || '123456',
        security: 'any',
        'ignore-cert': true,
        width: width,
        height: height,
        'color-depth': 32,
        'enable-gfx': true,
        'enable-video': true,
        'video-codec': 'h264',
        'image-quality': 100,
        compression: 0,
        'resize-method': 'display-update',
        'disable-copy': sc_clipboard,
        'disable-paste': cs_clipboard,
        'clipboard-encoding': 'utf-8',
        'enable-wallpaper': true,
        'enable-font-smoothing': true,
        'enable-full-window-drag': true,
        'enable-desktop-composition': true,
        'enable-theming': true,
        'enable-audio': true,
        'enable-printing': false,
        'enable-drive': false,
        'enable-smartcard': false,
        'enable-usb': false,
        'enable-printer': false,
        'enable-comport': true,
        'enable-clipboard': true,
        'redirect-clipboard': true,
        'redirect-drives': true,
        'redirect-printers': true,
        'redirect-smartcards': true,
        'redirect-usb': true,
        'rdpdr-drive': true
      }
    }
  };
  return encryptToken(tokenObj);
}

let guacServer = null;

function initGuacamoleServer(httpServer) {
  if (guacServer) {
    return guacServer;
  }

  const websocketOptions = {
    server: httpServer,
    path: '/guacamole/'
  };

  const guacdOptions = {
    host: '127.0.0.1',
    port: 4822
  };

  const clientOptions = {
    crypt: {
      cypher: 'AES-256-CBC',
      key: SECRET_KEY
    }
  };

  guacServer = new GuacamoleLite(websocketOptions, guacdOptions, clientOptions);

  guacServer.on('connection', (clientConnection, args) => {
    console.log('New Guacamole connection:', args);
  });

  guacServer.on('error', (error) => {
    console.error('Guacamole error:', error);
  });

  console.log('✅ Guacamole Lite server initialized');
  return guacServer;
}

export { encryptToken, generateGuacamoleToken, initGuacamoleServer };