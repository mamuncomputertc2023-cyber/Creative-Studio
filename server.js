/**
 * LicenseKey PRO - Multi-Tenant Software Licensing & Update SaaS Platform
 * Free Public Platform for Developers, Adobe Plugin Creators & SaaS Founders
 * 100% Free of Cost - Native Node.js & Express Architecture
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 4000;
const GLOBAL_SIGNING_SECRET = process.env.SIGNING_SECRET || 'SECURE_ANTIPIRACY_SIGNING_KEY_2026_@!';
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(path.join(__dirname, '..', 'dist_cloud')));

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
const RELEASES_FILE = path.join(DATA_DIR, 'releases.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');
const WEBHOOK_LOGS_FILE = path.join(DATA_DIR, 'webhook_logs.json');
const CLOUD_CATALOG_FILE = path.join(DATA_DIR, 'cloud_catalog.json');

// Convert 2-letter ISO code to flag emoji
function getCountryFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt());
    return String.fromCodePoint(...codePoints);
  } catch(e) {
    return '🌐';
  }
}

// Common country names
const COUNTRY_NAMES = {
  'BD': 'Bangladesh', 'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada',
  'DE': 'Germany', 'FR': 'France', 'IN': 'India', 'PK': 'Pakistan', 'AU': 'Australia',
  'NL': 'Netherlands', 'IT': 'Italy', 'ES': 'Spain', 'BR': 'Brazil', 'JP': 'Japan',
  'SG': 'Singapore', 'AE': 'United Arab Emirates', 'MY': 'Malaysia', 'ID': 'Indonesia',
  'SA': 'Saudi Arabia', 'TR': 'Turkey', 'PL': 'Poland', 'SE': 'Sweden', 'CH': 'Switzerland'
};

// Resolve Geo-Location from Request IP
function resolveGeoLocation(req) {
  let ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress || '127.0.0.1';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  // Local / Private IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
    return {
      ip: ip,
      country: 'Local Network',
      countryCode: 'LOCAL',
      city: 'Workstation',
      flag: '💻'
    };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo && geo.country) {
      const code = geo.country.toUpperCase();
      return {
        ip: ip,
        country: COUNTRY_NAMES[code] || code,
        countryCode: code,
        city: geo.city || '',
        region: geo.region || '',
        timezone: geo.timezone || '',
        flag: getCountryFlag(code)
      };
    }
  } catch(e) {
    console.warn('GeoIP lookup error:', e);
  }

  return {
    ip: ip,
    country: 'Global',
    countryCode: 'XX',
    city: '',
    flag: '🌐'
  };
}

// Helper: Read JSON Data
function readData(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

// Helper: Write JSON Data
function writeData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Write error:', err);
    return false;
  }
}

// Password hashing helper (PBKDF2 - Native Node crypto, zero cost)
function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

// Helper: Log Security / Activation Event
function logAudit(developerId, event, details = {}) {
  const logs = readData(AUDIT_LOG_FILE, []);
  logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    developerId: developerId || 'system',
    event,
    details,
    timestamp: new Date().toISOString()
  });
  if (logs.length > 800) logs.pop();
  writeData(AUDIT_LOG_FILE, logs);
}

// Helper: Generate Cryptographically Secure License Key
function generateLicenseKey(prefix = 'PRO') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = (len) => {
    let res = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
      res += chars[bytes[i] % chars.length];
    }
    return res;
  };
  return `${prefix.toUpperCase()}-${block(4)}-${block(4)}-${block(4)}`;
}

// Helper: Sign Response with HMAC-SHA256 (Anti-Tamper & Anti-Cracking)
function createSignature(payload, secretKey = GLOBAL_SIGNING_SECRET) {
  return crypto.createHmac('sha256', secretKey)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}

// Seed Demo Developer & Initial Products
(function seedInitialData() {
  const users = readData(USERS_FILE, []);
  let demoUser = users.find(u => u.email === 'demo@creator.com');
  
  if (!demoUser) {
    const { hash, salt } = hashPassword('demo1234');
    demoUser = {
      id: 'dev_demo_creative_studio',
      name: 'Rahim Designer',
      email: 'demo@creator.com',
      studioName: 'Apex Creative Tools',
      passwordHash: hash,
      passwordSalt: salt,
      apiKey: 'pk_live_apex_' + crypto.randomBytes(8).toString('hex'),
      apiSecret: 'sk_live_' + crypto.randomBytes(16).toString('hex'),
      createdAt: new Date().toISOString()
    };
    users.push(demoUser);
    writeData(USERS_FILE, users);
  }

  // Seed Products for Demo Developer
  const products = readData(PRODUCTS_FILE, []);
  if (!products.some(p => p.developerId === demoUser.id)) {
    const demoProducts = [
      {
        id: 'prod_1',
        developerId: demoUser.id,
        name: 'AutoSaviour Pro',
        prefix: 'SAVR',
        category: 'Adobe Illustrator Plugin',
        latestVersion: '1.2.0',
        trialDays: 14,
        maxDefaultSeats: 2,
        downloadUrl: 'https://updates.yourdomain.com/downloads/AutoSaviour_Setup_v1.2.0.exe',
        description: 'Persistent automated backup, crash recovery and unsaved artboards safety guard for Adobe Illustrator.'
      },
      {
        id: 'prod_2',
        developerId: demoUser.id,
        name: 'Halftone Poster Studio',
        prefix: 'POST',
        category: 'Adobe Illustrator Extension',
        latestVersion: '1.0.0',
        trialDays: 14,
        maxDefaultSeats: 2,
        downloadUrl: 'https://updates.yourdomain.com/downloads/PosterStudio_Setup_v1.0.exe',
        description: 'Instant Swiss minimal vector poster maker, CMYK duotones and halftone engraving generator.'
      }
    ];
    writeData(PRODUCTS_FILE, [...products, ...demoProducts]);
  }

  // Seed demo license for AutoSaviour Pro
  const licenses = readData(LICENSES_FILE, []);
  if (!licenses.some(l => l.developerId === demoUser.id)) {
    const demoLicense = {
      id: 'lic_demo_01',
      developerId: demoUser.id,
      key: 'SAVR-9X82-KL41-MN88',
      product: 'AutoSaviour Pro',
      customerName: 'Studio Creative Labs',
      customerEmail: 'client@studio.com',
      type: 'lifetime',
      status: 'active',
      maxDevices: 2,
      activations: [
        {
          hwid: 'HWID-PC-OFFICE-881',
          deviceName: 'Lead-Designer-iMac',
          activatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
          lastHeartbeat: new Date().toISOString()
        }
      ],
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      expiresAt: null
    };
    licenses.push(demoLicense);
    writeData(LICENSES_FILE, licenses);
  }
})();

// =========================================================
// AUTHENTICATION MIDDLEWARE
// =========================================================
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || null);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }

  const sessions = readData(SESSIONS_FILE, []);
  const session = sessions.find(s => s.token === token);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
  }

  const users = readData(USERS_FILE, []);
  const user = users.find(u => u.id === session.userId);

  if (!user) {
    return res.status(401).json({ success: false, message: 'User account not found.' });
  }

  req.dev = user;
  next();
}

// Optional Auth (for hybrid endpoints)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || null);

  if (token) {
    const sessions = readData(SESSIONS_FILE, []);
    const session = sessions.find(s => s.token === token);
    if (session) {
      const users = readData(USERS_FILE, []);
      const user = users.find(u => u.id === session.userId);
      if (user) req.dev = user;
    }
  }
  next();
}

// =========================================================
// AUTHENTICATION API ROUTES (PUBLIC)
// =========================================================

// POST /api/v1/auth/register - Any user can register for free
app.post('/api/v1/auth/register', (req, res) => {
  const { name, email, password, studioName } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const users = readData(USERS_FILE, []);

  if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });
  }

  const { hash, salt } = hashPassword(password);
  const developerId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const apiKey = 'pk_live_' + crypto.randomBytes(12).toString('hex');
  const apiSecret = 'sk_live_' + crypto.randomBytes(20).toString('hex');

  const newUser = {
    id: developerId,
    name: String(name).trim(),
    email: cleanEmail,
    studioName: studioName ? String(studioName).trim() : `${name}'s Software Studio`,
    passwordHash: hash,
    passwordSalt: salt,
    apiKey,
    apiSecret,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeData(USERS_FILE, users);

  // Generate session token
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const sessions = readData(SESSIONS_FILE, []);
  sessions.push({ token, userId: newUser.id, createdAt: new Date().toISOString() });
  writeData(SESSIONS_FILE, sessions);

  logAudit(newUser.id, 'DEVELOPER_REGISTERED', { name: newUser.name, email: newUser.email });

  res.status(201).json({
    success: true,
    message: 'Welcome! Your free developer account is ready.',
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      studioName: newUser.studioName,
      apiKey: newUser.apiKey
    }
  });
});

// POST /api/v1/auth/login - Log in with existing credentials
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const users = readData(USERS_FILE, []);
  const user = users.find(u => u.email.toLowerCase() === cleanEmail);

  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const sessions = readData(SESSIONS_FILE, []);
  sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  writeData(SESSIONS_FILE, sessions);

  logAudit(user.id, 'DEVELOPER_LOGGED_IN', { email: user.email });

  res.json({
    success: true,
    message: 'Login successful!',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      studioName: user.studioName,
      apiKey: user.apiKey
    }
  });
});

// POST /api/v1/auth/demo-login - 1-Click test account for quick exploration
app.post('/api/v1/auth/demo-login', (req, res) => {
  const users = readData(USERS_FILE, []);
  const demoUser = users.find(u => u.email === 'demo@creator.com');

  if (!demoUser) {
    return res.status(404).json({ success: false, message: 'Demo account not initialized.' });
  }

  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  const sessions = readData(SESSIONS_FILE, []);
  sessions.push({ token, userId: demoUser.id, createdAt: new Date().toISOString() });
  writeData(SESSIONS_FILE, sessions);

  res.json({
    success: true,
    message: 'Logged in as Demo Developer!',
    token,
    user: {
      id: demoUser.id,
      name: demoUser.name,
      email: demoUser.email,
      studioName: demoUser.studioName,
      apiKey: demoUser.apiKey
    }
  });
});

// GET /api/v1/auth/me - Verify session
app.get('/api/v1/auth/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.dev.id,
      name: req.dev.name,
      email: req.dev.email,
      studioName: req.dev.studioName,
      apiKey: req.dev.apiKey
    }
  });
});

// POST /api/v1/auth/logout
app.post('/api/v1/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const sessions = readData(SESSIONS_FILE, []);
    const filtered = sessions.filter(s => s.token !== token);
    writeData(SESSIONS_FILE, filtered);
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// =========================================================
// DEVELOPER WORKSPACE API (AUTHENTICATED)
// =========================================================

// GET /api/v1/stats - High-level Dashboard KPIs for the logged-in developer
app.get('/api/v1/stats', authenticate, (req, res) => {
  const licenses = readData(LICENSES_FILE, []).filter(l => l.developerId === req.dev.id);
  const products = readData(PRODUCTS_FILE, []).filter(p => p.developerId === req.dev.id);
  const releases = readData(RELEASES_FILE, []).filter(r => r.developerId === req.dev.id);

  const total = licenses.length;
  let active = 0;
  let expired = 0;
  let revoked = 0;
  let totalDevices = 0;

  const now = new Date();
  licenses.forEach(l => {
    if (l.status === 'revoked') {
      revoked++;
    } else if (l.expiresAt && new Date(l.expiresAt) < now) {
      expired++;
    } else {
      active++;
    }
    totalDevices += (l.activations ? l.activations.length : 0);
  });

  res.json({
    success: true,
    stats: {
      totalLicenses: total,
      activeLicenses: active,
      expiredLicenses: expired,
      revokedLicenses: revoked,
      activeDevices: totalDevices,
      totalProducts: products.length,
      totalReleases: releases.length
    }
  });
});

// GET /api/v1/analytics - Visual Telemetry for the logged-in developer
app.get('/api/v1/analytics', authenticate, (req, res) => {
  const licenses = readData(LICENSES_FILE, []).filter(l => l.developerId === req.dev.id);

  const productDistribution = {};
  const tierDistribution = {};

  licenses.forEach(l => {
    productDistribution[l.product] = (productDistribution[l.product] || 0) + 1;
    tierDistribution[l.type] = (tierDistribution[l.type] || 0) + 1;
  });

  const timeline = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    timeline[key] = 0;
  }

  licenses.forEach(l => {
    const d = (l.createdAt || '').split('T')[0];
    if (timeline[d] !== undefined) {
      timeline[d]++;
    }
  });

  const geoDistribution = {};
  licenses.forEach(l => {
    (l.activations || []).forEach(act => {
      const country = act.country || 'Global';
      const flag = act.flag || '🌐';
      const key = `${flag} ${country}`;
      geoDistribution[key] = (geoDistribution[key] || 0) + 1;
    });
  });

  res.json({
    success: true,
    analytics: {
      productDistribution,
      tierDistribution,
      geoDistribution,
      timeline
    }
  });
});

// =========================================================
// DEVELOPER PRODUCTS CATALOG API
// =========================================================
app.get('/api/v1/products', authenticate, (req, res) => {
  const products = readData(PRODUCTS_FILE, []).filter(p => p.developerId === req.dev.id);
  res.json({ success: true, count: products.length, products });
});

app.post('/api/v1/products', authenticate, (req, res) => {
  const { name, prefix, category, latestVersion, trialDays, downloadUrl, description } = req.body;
  if (!name || !prefix) {
    return res.status(400).json({ success: false, message: 'Product name and prefix are required.' });
  }

  const products = readData(PRODUCTS_FILE, []);
  const existing = products.find(p => p.developerId === req.dev.id && p.name.toLowerCase() === name.toLowerCase());

  if (existing) {
    existing.prefix = prefix.toUpperCase();
    existing.category = category || existing.category;
    existing.latestVersion = latestVersion || existing.latestVersion;
    existing.trialDays = parseInt(trialDays, 10) || existing.trialDays;
    existing.downloadUrl = downloadUrl || existing.downloadUrl;
    existing.description = description || existing.description;
  } else {
    products.push({
      id: 'prod_' + Date.now(),
      developerId: req.dev.id,
      name,
      prefix: prefix.toUpperCase(),
      category: category || 'Adobe Plugin',
      latestVersion: latestVersion || '1.0.0',
      trialDays: parseInt(trialDays, 10) || 14,
      downloadUrl: downloadUrl || '',
      description: description || ''
    });
  }

  writeData(PRODUCTS_FILE, products);
  logAudit(req.dev.id, 'PRODUCT_CONFIGURED', { name, prefix });

  res.json({ success: true, message: 'Product successfully added to your catalog!' });
});

app.delete('/api/v1/products/:id', authenticate, (req, res) => {
  const products = readData(PRODUCTS_FILE, []);
  const filtered = products.filter(p => !(p.id === req.params.id && p.developerId === req.dev.id));
  writeData(PRODUCTS_FILE, filtered);
  res.json({ success: true, message: 'Product deleted.' });
});

// =========================================================
// DEVELOPER LICENSES MANAGEMENT API
// =========================================================
app.get('/api/v1/licenses', authenticate, (req, res) => {
  const licenses = readData(LICENSES_FILE, []).filter(l => l.developerId === req.dev.id);
  res.json({ success: true, count: licenses.length, licenses });
});

// POST /api/v1/licenses/generate - Generate single license for developer's product
app.post('/api/v1/licenses/generate', authenticate, (req, res) => {
  const {
    product,
    customerName = 'Valued Customer',
    customerEmail = '',
    type = 'lifetime',
    durationDays = 365,
    maxDevices = 1,
    prefix = 'KEY'
  } = req.body;

  if (!product) {
    return res.status(400).json({ success: false, message: 'Product name is required.' });
  }

  const key = generateLicenseKey(prefix);
  const now = new Date();
  let expiresAt = null;
  const parsedDays = parseInt(durationDays, 10);

  if (type === 'trial') {
    const days = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 14;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'custom') {
    const days = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 30;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'monthly') {
    const days = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 30;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'yearly') {
    const days = !isNaN(parsedDays) && parsedDays > 0 ? parsedDays : 365;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  }

  const newLicense = {
    id: 'lic_' + Date.now(),
    developerId: req.dev.id,
    key,
    product,
    customerName,
    customerEmail,
    type,
    durationDays: type === 'lifetime' ? null : (parsedDays || (type === 'yearly' ? 365 : (type === 'trial' ? 14 : 30))),
    status: 'active',
    maxDevices: parseInt(maxDevices, 10) || 1,
    activations: [],
    createdAt: now.toISOString(),
    expiresAt
  };

  const licenses = readData(LICENSES_FILE, []);
  licenses.unshift(newLicense);
  writeData(LICENSES_FILE, licenses);

  logAudit(req.dev.id, 'LICENSE_GENERATED', { key, product, customerEmail, type });

  res.status(201).json({
    success: true,
    message: 'License key created successfully',
    license: newLicense
  });
});

// POST /api/v1/licenses/batch-generate - Bulk key generator for developer
app.post('/api/v1/licenses/batch-generate', authenticate, (req, res) => {
  const {
    count = 10,
    product,
    prefix = 'KEY',
    type = 'lifetime',
    durationDays = 365,
    maxDevices = 2,
    batchTag = 'Campaign-Batch'
  } = req.body;

  if (!product) {
    return res.status(400).json({ success: false, message: 'Product is required.' });
  }

  const qty = Math.min(Math.max(1, parseInt(count, 10) || 1), 100);
  const licenses = readData(LICENSES_FILE, []);
  const generatedBatch = [];
  const now = new Date();

  let expiresAt = null;
  const parsedBatchDays = parseInt(durationDays, 10);

  if (type === 'trial') {
    const days = !isNaN(parsedBatchDays) && parsedBatchDays > 0 ? parsedBatchDays : 14;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'custom') {
    const days = !isNaN(parsedBatchDays) && parsedBatchDays > 0 ? parsedBatchDays : 30;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'monthly') {
    const days = !isNaN(parsedBatchDays) && parsedBatchDays > 0 ? parsedBatchDays : 30;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  } else if (type === 'yearly') {
    const days = !isNaN(parsedBatchDays) && parsedBatchDays > 0 ? parsedBatchDays : 365;
    expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  }

  for (let i = 0; i < qty; i++) {
    const key = generateLicenseKey(prefix);
    const item = {
      id: 'lic_' + Date.now() + '_' + i,
      developerId: req.dev.id,
      key,
      product,
      customerName: `${batchTag} #${i + 1}`,
      customerEmail: `batch_${Date.now()}@distribution.com`,
      type,
      durationDays: type === 'lifetime' ? null : (parsedBatchDays || (type === 'yearly' ? 365 : (type === 'trial' ? 14 : 30))),
      status: 'active',
      maxDevices: parseInt(maxDevices, 10) || 1,
      activations: [],
      createdAt: now.toISOString(),
      expiresAt,
      batchTag
    };
    licenses.unshift(item);
    generatedBatch.push(item);
  }

  writeData(LICENSES_FILE, licenses);
  logAudit(req.dev.id, 'BATCH_LICENSES_GENERATED', { count: qty, product, batchTag });

  res.status(201).json({
    success: true,
    message: `Successfully generated ${qty} license keys!`,
    count: qty,
    keys: generatedBatch
  });
});

// POST /api/v1/licenses/revoke - Revoke key belonging to developer
app.post('/api/v1/licenses/revoke', authenticate, (req, res) => {
  const { key, reason = 'Administrative revocation' } = req.body;
  const licenses = readData(LICENSES_FILE, []);
  const cleanKey = String(key).trim().toUpperCase();
  const target = licenses.find(l => (l.developerId === req.dev.id || !l.developerId) && l.key.toUpperCase() === cleanKey);

  if (!target) {
    return res.status(404).json({ success: false, message: 'License key not found in your account.' });
  }

  const newStatus = target.status === 'revoked' ? 'active' : 'revoked';
  // Update all instances of this key to maintain 100% database consistency
  licenses.forEach(l => {
    if (l.key.toUpperCase() === cleanKey) {
      l.developerId = req.dev.id;
      l.status = newStatus;
      l.revokedReason = newStatus === 'revoked' ? reason : null;
    }
  });

  writeData(LICENSES_FILE, licenses);

  logAudit(req.dev.id, newStatus === 'revoked' ? 'LICENSE_REVOKED' : 'LICENSE_RESTORED', { key: cleanKey, reason });

  res.json({
    success: true,
    message: `License key status changed to ${newStatus}`,
    license: target
  });
});

// POST /api/v1/licenses/reset-hwid - Reset devices belonging to developer
app.post('/api/v1/licenses/reset-hwid', authenticate, (req, res) => {
  const { key, hwid } = req.body;
  const licenses = readData(LICENSES_FILE, []);
  const cleanKey = String(key).trim().toUpperCase();
  const target = licenses.find(l => (l.developerId === req.dev.id || !l.developerId) && l.key.toUpperCase() === cleanKey);

  if (!target) {
    return res.status(404).json({ success: false, message: 'License key not found in your account.' });
  }

  licenses.forEach(l => {
    if (l.key.toUpperCase() === cleanKey) {
      l.developerId = req.dev.id;
      if (hwid) {
        l.activations = (l.activations || []).filter(a => a.hwid !== hwid);
      } else {
        l.activations = [];
      }
    }
  });

  writeData(LICENSES_FILE, licenses);
  logAudit(req.dev.id, 'DEVICE_RESET', { key: cleanKey, hwid: hwid || 'ALL' });

  res.json({
    success: true,
    message: 'Hardware binding successfully reset',
    license: target
  });
});

// =========================================================
// DEVELOPER RELEASES & REMOTE UPDATE DELIVERY API
// =========================================================
app.get('/api/v1/releases', authenticate, (req, res) => {
  const releases = readData(RELEASES_FILE, []).filter(r => r.developerId === req.dev.id);
  res.json({ success: true, count: releases.length, releases });
});

app.post('/api/v1/releases/publish', authenticate, (req, res) => {
  const { product, version, changelog, downloadUrl, mandatory = false } = req.body;

  if (!product || !version) {
    return res.status(400).json({ success: false, message: 'Product and version required' });
  }

  const newRelease = {
    id: 'rel_' + Date.now(),
    developerId: req.dev.id,
    product,
    version,
    releaseDate: new Date().toISOString(),
    mandatory: Boolean(mandatory),
    changelog: changelog || 'Performance improvements and bug fixes.',
    downloadUrl: downloadUrl || ''
  };

  const releases = readData(RELEASES_FILE, []);
  releases.unshift(newRelease);
  writeData(RELEASES_FILE, releases);

  // Update latestVersion in products catalog
  const products = readData(PRODUCTS_FILE, []);
  const targetProd = products.find(p => p.developerId === req.dev.id && p.name.toLowerCase() === product.toLowerCase());
  if (targetProd) {
    targetProd.latestVersion = version;
    if (downloadUrl) targetProd.downloadUrl = downloadUrl;
    writeData(PRODUCTS_FILE, products);
  }

  logAudit(req.dev.id, 'RELEASE_PUBLISHED', { product, version, mandatory });

  res.status(201).json({
    success: true,
    message: `Version ${version} published for ${product}`,
    release: newRelease
  });
});

// GET /api/v1/audit-logs - Security Logs for the developer
app.get('/api/v1/audit-logs', authenticate, (req, res) => {
  const logs = readData(AUDIT_LOG_FILE, []).filter(l => l.developerId === req.dev.id);
  res.json({ success: true, count: logs.length, logs: logs.slice(0, 50) });
});

// GET /api/v1/backup - Export developer workspace data
app.get('/api/v1/backup', authenticate, (req, res) => {
  const backup = {
    developer: {
      id: req.dev.id,
      name: req.dev.name,
      email: req.dev.email,
      studioName: req.dev.studioName
    },
    exportedAt: new Date().toISOString(),
    products: readData(PRODUCTS_FILE, []).filter(p => p.developerId === req.dev.id),
    licenses: readData(LICENSES_FILE, []).filter(l => l.developerId === req.dev.id),
    releases: readData(RELEASES_FILE, []).filter(r => r.developerId === req.dev.id),
    auditLogs: readData(AUDIT_LOG_FILE, []).filter(l => l.developerId === req.dev.id)
  };
  res.setHeader('Content-Disposition', `attachment; filename=license_backup_${req.dev.id}_${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.json(backup);
});

// =========================================================
// PUBLIC CLIENT-FACING ANTI-PIRACY & ACTIVATION API
// (Called by Adobe Illustrator Plugins, Desktop Apps, SaaS)
// =========================================================

// POST /api/v1/client/activate - Validate key & bind HWID
app.post('/api/v1/client/activate', (req, res) => {
  const { licenseKey, hwid, deviceName = 'Client Device', os = 'Unknown OS', appName } = req.body;

  if (!licenseKey || !hwid) {
    return res.status(400).json({
      success: false,
      message: 'License key and Hardware ID (HWID) are required for activation.'
    });
  }

  const licenses = readData(LICENSES_FILE, []);
  const cleanKey = String(licenseKey).trim().toUpperCase();
  const target = licenses.find(l => l.key.toUpperCase() === cleanKey);

  if (!target) {
    logAudit('public', 'FAILED_ACTIVATION_ATTEMPT', { key: cleanKey, hwid, ip: req.ip });
    return res.status(401).json({
      success: false,
      code: 'INVALID_KEY',
      message: 'License key does not exist or was typed incorrectly.'
    });
  }

  if (target.status !== 'active') {
    return res.status(403).json({
      success: false,
      code: 'LICENSE_REVOKED',
      message: 'This license has been suspended or revoked. Contact software vendor.'
    });
  }

  if (target.expiresAt && new Date(target.expiresAt) < new Date()) {
    return res.status(403).json({
      success: false,
      code: 'LICENSE_EXPIRED',
      message: 'This software license subscription has expired.'
    });
  }

  if (!target.activations) target.activations = [];
  const existingDevice = target.activations.find(a => a.hwid === hwid);

  const geo = resolveGeoLocation(req);

  if (!existingDevice) {
    if (target.activations.length >= target.maxDevices) {
      return res.status(403).json({
        success: false,
        code: 'DEVICE_LIMIT_REACHED',
        message: `Device activation limit reached (${target.activations.length}/${target.maxDevices}). Unbind previous devices in your license portal.`
      });
    }

    target.activations.push({
      hwid,
      deviceName,
      os,
      ip: geo.ip,
      country: geo.country,
      countryCode: geo.countryCode,
      city: geo.city,
      flag: geo.flag,
      activatedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    });

    writeData(LICENSES_FILE, licenses);
    logAudit(target.developerId, 'DEVICE_ACTIVATED', {
      key: cleanKey,
      hwid,
      deviceName,
      product: target.product,
      location: `${geo.flag} ${geo.city ? geo.city + ', ' : ''}${geo.country}`,
      ip: geo.ip
    });
  } else {
    existingDevice.lastHeartbeat = new Date().toISOString();
    existingDevice.ip = geo.ip;
    existingDevice.country = geo.country;
    existingDevice.countryCode = geo.countryCode;
    existingDevice.city = geo.city;
    existingDevice.flag = geo.flag;
    writeData(LICENSES_FILE, licenses);
  }

  // Find developer's secret for signing
  const users = readData(USERS_FILE, []);
  const dev = users.find(u => u.id === target.developerId);
  const secretToUse = dev ? dev.apiSecret : GLOBAL_SIGNING_SECRET;

  const responseData = {
    valid: true,
    licenseKey: cleanKey,
    product: target.product,
    type: target.type,
    customerName: target.customerName,
    expiresAt: target.expiresAt,
    activatedDevices: target.activations.length,
    maxDevices: target.maxDevices,
    serverTimestamp: Date.now()
  };

  const signature = createSignature(responseData, secretToUse);

  res.json({
    success: true,
    message: 'Software activated successfully!',
    data: responseData,
    signature
  });
});

// POST /api/v1/client/verify - Periodic & Startup validation (Instant Revoke & Unbind Detection + Notice Delivery)
app.post('/api/v1/client/verify', (req, res) => {
  const { licenseKey, hwid } = req.body;

  if (!licenseKey || !hwid) {
    return res.status(400).json({
      valid: false,
      code: 'MISSING_PARAMS',
      message: 'License key and HWID required.'
    });
  }

  const licenses = readData(LICENSES_FILE, []);
  const cleanKey = String(licenseKey).trim().toUpperCase();
  const target = licenses.find(l => l.key.toUpperCase() === cleanKey);

  if (!target) {
    return res.json({
      valid: false,
      code: 'KEY_NOT_FOUND',
      message: 'License key was not found or has been deleted.'
    });
  }

  // 1. Check if revoked or not active
  if (target.status !== 'active') {
    return res.json({
      valid: false,
      code: 'LICENSE_REVOKED',
      message: 'This license has been revoked or suspended by the developer.'
    });
  }

  // 2. Check if expired
  if (target.expiresAt && new Date(target.expiresAt) < new Date()) {
    return res.json({
      valid: false,
      code: 'LICENSE_EXPIRED',
      message: 'This software license has expired.'
    });
  }

  // 3. Check if device is bound in activations
  if (!target.activations) target.activations = [];
  const deviceBinding = target.activations.find(a => a.hwid === hwid);

  if (!deviceBinding) {
    return res.json({
      valid: false,
      code: 'DEVICE_UNBOUND',
      message: 'This device is no longer bound to the license (may have been reset from the portal).'
    });
  }

  // Update heartbeat and location
  const geo = resolveGeoLocation(req);
  deviceBinding.lastHeartbeat = new Date().toISOString();
  deviceBinding.ip = geo.ip;
  if (!deviceBinding.country || deviceBinding.country === 'Unknown') {
    deviceBinding.country = geo.country;
    deviceBinding.countryCode = geo.countryCode;
    deviceBinding.city = geo.city;
    deviceBinding.flag = geo.flag;
  }
  writeData(LICENSES_FILE, licenses);

  // Check active remote notice for this product or ALL
  const notices = readData(NOTICES_FILE, []);
  const activeNotice = notices.find(n => n.active && (n.product === target.product || n.product === 'ALL'));

  return res.json({
    valid: true,
    code: 'VALID',
    message: 'License is active and valid.',
    licenseKey: cleanKey,
    customerName: target.customerName,
    product: target.product,
    expiresAt: target.expiresAt,
    notice: activeNotice ? {
      id: activeNotice.id,
      title: activeNotice.title,
      message: activeNotice.message,
      type: activeNotice.type,
      actionText: activeNotice.actionText,
      actionUrl: activeNotice.actionUrl
    } : null
  });
});

// =========================================================
// REMOTE NOTICE & IN-APP ANNOUNCEMENT SYSTEM API
// =========================================================
app.get('/api/v1/notices', authenticate, (req, res) => {
  const notices = readData(NOTICES_FILE, []).filter(n => n.developerId === req.dev.id);
  res.json({ success: true, count: notices.length, notices });
});

app.post('/api/v1/notices', authenticate, (req, res) => {
  const { product = 'ALL', title, message, type = 'promo', actionText = '', actionUrl = '', active = true } = req.body;

  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Notice title and message are required.' });
  }

  const notices = readData(NOTICES_FILE, []);
  const newNotice = {
    id: 'notice_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    developerId: req.dev.id,
    product: product || 'ALL',
    title: String(title).trim(),
    message: String(message).trim(),
    type: type || 'promo', // promo, info, warning
    actionText: String(actionText || '').trim(),
    actionUrl: String(actionUrl || '').trim(),
    active: Boolean(active),
    createdAt: new Date().toISOString()
  };

  notices.unshift(newNotice);
  writeData(NOTICES_FILE, notices);
  logAudit(req.dev.id, 'NOTICE_PUBLISHED', { title, product, type });

  res.json({ success: true, message: 'Remote announcement published successfully!', notice: newNotice });
});

app.post('/api/v1/notices/:id/toggle', authenticate, (req, res) => {
  const notices = readData(NOTICES_FILE, []);
  const target = notices.find(n => n.id === req.params.id && n.developerId === req.dev.id);
  if (!target) {
    return res.status(404).json({ success: false, message: 'Notice not found.' });
  }

  target.active = !target.active;
  writeData(NOTICES_FILE, notices);

  res.json({ success: true, message: `Notice status updated to ${target.active ? 'Active' : 'Inactive'}`, notice: target });
});

app.delete('/api/v1/notices/:id', authenticate, (req, res) => {
  const notices = readData(NOTICES_FILE, []);
  const filtered = notices.filter(n => !(n.id === req.params.id && n.developerId === req.dev.id));
  writeData(NOTICES_FILE, filtered);
  res.json({ success: true, message: 'Notice deleted successfully.' });
});

// Public client endpoint for checking notice standalone
app.get('/api/v1/client/notice', (req, res) => {
  const { product } = req.query;
  const notices = readData(NOTICES_FILE, []);
  const activeNotice = notices.find(n => n.active && (n.product === product || n.product === 'ALL'));
  res.json({
    success: true,
    hasNotice: Boolean(activeNotice),
    notice: activeNotice || null
  });
});

// =========================================================
// AUTO-PILOT LICENSE DELIVERY (WEBHOOKS) API
// =========================================================

// Helper: Handle auto-pilot order and create license
function processAutoPilotOrder({ developerId, product, customerName, customerEmail, source = 'Webhook', orderId = '', maxDevices = 2, durationDays = null, type = 'lifetime' }) {
  const products = readData(PRODUCTS_FILE, []);
  const targetProduct = products.find(p => p.name.toLowerCase() === String(product).toLowerCase() || p.id === product);

  const prefix = targetProduct ? targetProduct.prefix : 'PRO';
  const resolvedProductName = targetProduct ? targetProduct.name : (product || 'AutoSaviour Pro');
  const resolvedMaxDevices = parseInt(maxDevices, 10) || (targetProduct ? targetProduct.maxDefaultSeats : 2);

  const key = generateLicenseKey(prefix);
  const now = new Date();
  let expiresAt = null;
  if (type === 'trial' || type === 'yearly' || (durationDays && parseInt(durationDays, 10) > 0)) {
    const days = parseInt(durationDays, 10) || (type === 'yearly' ? 365 : 14);
    const exp = new Date();
    exp.setDate(exp.getDate() + days);
    expiresAt = exp.toISOString();
  }

  const licenses = readData(LICENSES_FILE, []);
  const newLic = {
    id: 'lic_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    developerId: developerId || (targetProduct ? targetProduct.developerId : 'dev_demo_creative_studio'),
    key,
    product: resolvedProductName,
    customerName: customerName || 'Valued Customer',
    customerEmail: customerEmail || '',
    type: type || 'lifetime',
    durationDays: durationDays ? parseInt(durationDays, 10) : null,
    status: 'active',
    maxDevices: resolvedMaxDevices,
    activations: [],
    source: source || 'Auto-Pilot Webhook',
    orderId: orderId || ('ORD-' + Date.now()),
    createdAt: now.toISOString(),
    expiresAt
  };

  licenses.unshift(newLic);
  writeData(LICENSES_FILE, licenses);

  // Log in webhook deliveries
  const webhookLogs = readData(WEBHOOK_LOGS_FILE, []);
  webhookLogs.unshift({
    id: 'wh_' + Date.now(),
    developerId: newLic.developerId,
    source,
    orderId: newLic.orderId,
    customer: newLic.customerName,
    email: newLic.customerEmail,
    product: newLic.product,
    key: newLic.key,
    timestamp: now.toISOString()
  });
  if (webhookLogs.length > 500) webhookLogs.pop();
  writeData(WEBHOOK_LOGS_FILE, webhookLogs);

  logAudit(newLic.developerId, 'AUTO_PILOT_DELIVERY', {
    source,
    orderId: newLic.orderId,
    key: newLic.key,
    customer: newLic.customerName,
    product: newLic.product
  });

  return newLic;
}

// 1. Universal Checkout Webhook (JSON) - Gumroad, LemonSqueezy, Payhip, Shopify, Zapier
app.post('/api/v1/webhooks/checkout', (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'] || req.body.apiKey;
  const users = readData(USERS_FILE, []);
  const dev = users.find(u => u.apiKey === apiKey);

  const { product, customerName, customerEmail, source, orderId, maxDevices, durationDays, type } = req.body;

  if (!product) {
    return res.status(400).json({ success: false, message: 'Missing product parameter.' });
  }

  const devId = dev ? dev.id : (users[0] ? users[0].id : 'dev_demo_creative_studio');

  const lic = processAutoPilotOrder({
    developerId: devId,
    product,
    customerName: customerName || 'Customer',
    customerEmail: customerEmail || '',
    source: source || 'Custom Webhook',
    orderId: orderId || req.body.id || '',
    maxDevices,
    durationDays,
    type
  });

  res.json({
    success: true,
    message: 'Auto-pilot license generated and delivered!',
    licenseKey: lic.key,
    product: lic.product,
    customerName: lic.customerName,
    customerEmail: lic.customerEmail,
    orderId: lic.orderId
  });
});

// 2. Gumroad Webhook Handler (URL-encoded or JSON)
app.post('/api/v1/webhooks/gumroad', (req, res) => {
  const body = req.body || {};
  const product = body.product_name || body.permalink || 'AutoSaviour Pro';
  const customerEmail = body.email || body.buyer_email || '';
  const customerName = body.full_name || body.name || (customerEmail ? customerEmail.split('@')[0] : 'Gumroad Customer');
  const orderId = body.sale_id || body.order_number || '';

  const lic = processAutoPilotOrder({
    product,
    customerName,
    customerEmail,
    source: 'Gumroad',
    orderId
  });

  res.json({
    success: true,
    license_key: lic.key,
    message: 'Gumroad license key created!'
  });
});

// 3. LemonSqueezy Webhook Handler
app.post('/api/v1/webhooks/lemonsqueezy', (req, res) => {
  const body = req.body || {};
  const attrs = (body.data && body.data.attributes) || {};

  const customerEmail = attrs.user_email || '';
  const customerName = attrs.user_name || 'LemonSqueezy Buyer';
  const product = (attrs.first_order_item && attrs.first_order_item.variant_name) || 'AutoSaviour Pro';
  const orderId = String(body.data && body.data.id || '');

  const lic = processAutoPilotOrder({
    product,
    customerName,
    customerEmail,
    source: 'LemonSqueezy',
    orderId
  });

  res.json({
    success: true,
    licenseKey: lic.key,
    message: 'LemonSqueezy order processed'
  });
});

// 4. Developer Webhook Deliveries List
app.get('/api/v1/webhooks/logs', authenticate, (req, res) => {
  const logs = readData(WEBHOOK_LOGS_FILE, []).filter(l => l.developerId === req.dev.id);
  res.json({ success: true, count: logs.length, logs });
});

// GET /api/v1/client/check-update - Software checks for newer versions
app.get('/api/v1/client/check-update', (req, res) => {
  const { product, currentVersion } = req.query;

  if (!product) {
    return res.status(400).json({ success: false, message: 'Product parameter is required' });
  }

  const releases = readData(RELEASES_FILE, []);
  const productReleases = releases.filter(r => r.product.toLowerCase() === String(product).toLowerCase());

  if (productReleases.length === 0) {
    return res.json({ hasUpdate: false, message: 'Up to date' });
  }

  const latest = productReleases[0];

  function semverCompare(v1, v2) {
    const p1 = String(v1).replace(/[^0-9.]/g, '').split('.').map(Number);
    const p2 = String(v2).replace(/[^0-9.]/g, '').split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  const isNewer = currentVersion ? semverCompare(latest.version, currentVersion) > 0 : true;

  res.json({
    hasUpdate: isNewer,
    latestVersion: latest.version,
    currentVersion: currentVersion || 'unknown',
    mandatory: latest.mandatory,
    changelog: latest.changelog,
    downloadUrl: latest.downloadUrl,
    releaseDate: latest.releaseDate
  });
});

// POST /api/v1/portal/lookup - Public license verification
app.post('/api/v1/portal/lookup', (req, res) => {
  const { query } = req.body;
  if (!query || String(query).trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Please enter a valid License Key or Email address.' });
  }

  const cleanQuery = String(query).trim().toLowerCase();
  const licenses = readData(LICENSES_FILE, []);
  const releases = readData(RELEASES_FILE, []);

  const matched = licenses.filter(l => 
    l.key.toLowerCase() === cleanQuery || 
    (l.customerEmail && l.customerEmail.toLowerCase() === cleanQuery)
  );

  if (matched.length === 0) {
    return res.status(404).json({ success: false, message: 'No license found matching that key or email.' });
  }

  const now = new Date();
  const results = matched.map(lic => {
    let computedStatus = lic.status;
    let daysRemaining = null;

    if (lic.status === 'active' && lic.expiresAt) {
      const expDate = new Date(lic.expiresAt);
      const diffMs = expDate - now;
      daysRemaining = Math.max(0, Math.ceil(diffMs / 86400000));
      if (diffMs <= 0) computedStatus = 'expired';
    }

    const prodRelease = releases.find(r => r.product.toLowerCase() === lic.product.toLowerCase());

    return {
      id: lic.id,
      key: lic.key,
      product: lic.product,
      customerName: lic.customerName,
      customerEmail: lic.customerEmail,
      type: lic.type,
      status: computedStatus,
      maxDevices: lic.maxDevices || 1,
      createdAt: lic.createdAt,
      expiresAt: lic.expiresAt,
      daysRemaining,
      activations: (lic.activations || []).map(a => ({
        hwid: a.hwid,
        deviceName: a.deviceName || 'Registered PC',
        activatedAt: a.activatedAt
      })),
      latestRelease: prodRelease || null
    };
  });

  res.json({ success: true, count: results.length, licenses: results });
});

// POST /api/v1/portal/deactivate-device - Public self-service deactivation
app.post('/api/v1/portal/deactivate-device', (req, res) => {
  const { key, hwid } = req.body;
  if (!key || !hwid) {
    return res.status(400).json({ success: false, message: 'Key and HWID required.' });
  }

  const licenses = readData(LICENSES_FILE, []);
  const target = licenses.find(l => l.key.toUpperCase() === String(key).trim().toUpperCase());

  if (!target) {
    return res.status(404).json({ success: false, message: 'License key not found.' });
  }

  const initialCount = (target.activations || []).length;
  target.activations = (target.activations || []).filter(a => a.hwid !== hwid);

  if (target.activations.length === initialCount) {
    return res.status(400).json({ success: false, message: 'Device was not found on this license.' });
  }

  writeData(LICENSES_FILE, licenses);
  logAudit(target.developerId, 'DEVICE_UNBOUND_BY_USER', { key: target.key, hwid });

  res.json({ success: true, message: 'Device successfully deactivated. You can now activate your software on a new computer!' });
});

// Global Platform Stats (for public landing page)
app.get('/api/v1/public/stats', (req, res) => {
  const users = readData(USERS_FILE, []);
  const licenses = readData(LICENSES_FILE, []);
  const products = readData(PRODUCTS_FILE, []);

  let totalActivations = 0;
  licenses.forEach(l => {
    totalActivations += (l.activations ? l.activations.length : 0);
  });

  res.json({
    success: true,
    totalDevelopers: users.length,
    totalProducts: products.length,
    totalLicenses: licenses.length,
    totalActivations
  });
});

// =========================================================
// ASTUTE STUDIO MANAGER CLOUD INTEGRATION ENDPOINTS
// =========================================================

// Helper: Format Google Drive direct download URL
function resolveDownloadUrl(item, req) {
  const host = `${req.protocol}://${req.get('host')}`;
  
  // 1. If explicit Google Drive URL or ID is set
  if (item.googleDriveUrl && item.googleDriveUrl.trim() !== '') {
    return item.googleDriveUrl.trim();
  }
  if (item.googleDriveId && item.googleDriveId.trim() !== '') {
    let id = item.googleDriveId.trim();
    // If full google drive sharing link was pasted, extract the ID
    const match = id.match(/\/d\/([a-zA-Z0-9_-]+)/) || id.match(/id=([a-zA-Z0-9_-]+)/);
    if (match) id = match[1];
    return `https://drive.google.com/uc?export=download&id=${id}`;
  }

  // 2. Direct server fallback
  const subPath = item.zipFile.startsWith('res-') ? 'bundles' : 'plugins';
  return `${host}/downloads/${subPath}/${item.zipFile}`;
}

// GET /api/v1/manager/catalog - Central Dynamic Cloud Catalog
app.get('/api/v1/manager/catalog', (req, res) => {
  const catalog = readData(CLOUD_CATALOG_FILE, { plugins: [], bundles: [] });
  
  const pluginsWithUrls = (catalog.plugins || []).map(p => ({
    ...p,
    downloadUrl: resolveDownloadUrl(p, req)
  }));

  const bundlesWithUrls = (catalog.bundles || []).map(b => ({
    ...b,
    downloadUrl: resolveDownloadUrl(b, req)
  }));

  res.json({
    success: true,
    version: catalog.version || '1.0.0',
    generatedAt: catalog.generatedAt,
    agentPort: 48200,
    serverUrl: `${req.protocol}://${req.get('host')}`,
    totalPlugins: pluginsWithUrls.length,
    totalBundles: bundlesWithUrls.length,
    plugins: pluginsWithUrls,
    bundles: bundlesWithUrls
  });
});

// GET /api/v1/manager/download/:type/:id - Secure Download / Google Drive Redirect
app.get('/api/v1/manager/download/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const catalog = readData(CLOUD_CATALOG_FILE, { plugins: [], bundles: [] });
  const list = type === 'bundle' ? catalog.bundles : catalog.plugins;
  const item = list.find(x => x.id === id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found in catalog' });
  }

  // If Google Drive link exists, 302 redirect directly to Google Drive
  if (item.googleDriveUrl || item.googleDriveId) {
    const url = resolveDownloadUrl(item, req);
    return res.redirect(url);
  }

  // Otherwise serve directly from server dist_cloud folder
  const subFolder = type === 'bundle' ? 'bundles' : 'plugins';
  const filePath = path.join(__dirname, '..', 'dist_cloud', subFolder, item.zipFile);

  if (fs.existsSync(filePath)) {
    return res.download(filePath, item.zipFile);
  }

  res.status(404).json({ success: false, message: 'Download archive not found on server' });
});

// POST /api/v1/manager/update-cloud-link - Set Google Drive link or ID for any plugin/bundle
app.post('/api/v1/manager/update-cloud-link', (req, res) => {
  const { id, type, googleDriveId, googleDriveUrl } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Item ID is required.' });
  }

  const catalog = readData(CLOUD_CATALOG_FILE, { plugins: [], bundles: [] });
  const list = type === 'bundle' ? catalog.bundles : catalog.plugins;
  const item = list.find(x => x.id === id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found in catalog' });
  }

  if (googleDriveId !== undefined) item.googleDriveId = googleDriveId.trim();
  if (googleDriveUrl !== undefined) item.googleDriveUrl = googleDriveUrl.trim();

  // If googleDriveId was a full share link, auto format
  if (item.googleDriveId) {
    const match = item.googleDriveId.match(/\/d\/([a-zA-Z0-9_-]+)/) || item.googleDriveId.match(/id=([a-zA-Z0-9_-]+)/);
    if (match) {
      item.googleDriveId = match[1];
      item.googleDriveUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  writeData(CLOUD_CATALOG_FILE, catalog);
  res.json({ success: true, message: `Cloud link updated for ${item.name}!`, item });
});

// POST /api/v1/manager/batch-update-links - Bulk update Google Drive links
app.post('/api/v1/manager/batch-update-links', (req, res) => {
  const { mappings } = req.body; // Array of { id, type, driveLink }
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ success: false, message: 'mappings array is required' });
  }

  const catalog = readData(CLOUD_CATALOG_FILE, { plugins: [], bundles: [] });
  let updatedCount = 0;

  for (const m of mappings) {
    const list = m.type === 'bundle' ? catalog.bundles : catalog.plugins;
    const item = list.find(x => x.id === m.id);
    if (item && m.driveLink) {
      let link = m.driveLink.trim();
      const match = link.match(/\/d\/([a-zA-Z0-9_-]+)/) || link.match(/id=([a-zA-Z0-9_-]+)/);
      if (match) {
        item.googleDriveId = match[1];
        item.googleDriveUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      } else {
        item.googleDriveUrl = link;
      }
      updatedCount++;
    }
  }

  writeData(CLOUD_CATALOG_FILE, catalog);
  res.json({ success: true, message: `Updated ${updatedCount} items with Google Drive links!` });
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  🛡️ MULTI-TENANT SOFTWARE LICENSING CLOUD RUNNING`);
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`  Data Folder: ${DATA_DIR}`);
  console.log(`=======================================================`);
});
