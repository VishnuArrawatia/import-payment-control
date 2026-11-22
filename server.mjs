import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ipc-database.json');
const USERS_FILE = path.join(DATA_DIR, 'ipc-users.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const DIST_DIR = path.join(__dirname, 'dist');
const SEED_FILE = path.join(__dirname, 'src', 'data', 'initialSeed.json');
const MAX_BACKUPS = 60;
const SESSION_COOKIE_NAME = 'ipc_session';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

// Salted SHA-256 hashes only (zero plaintext passwords anywhere)
const DEFAULT_USERS = [
  {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Head Administrator',
    role: 'admin',
    salt: 'a1b2c3d4e5f60718',
    passwordHash: '97fc2de4971b70bca5d3ccffe45f6633f9116da01f827ad67353f426e0684a7c',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-mgmt',
    username: 'management',
    displayName: 'Executive Management',
    role: 'management',
    salt: 'b2c3d4e5f60718a1',
    passwordHash: '62d7db37429a4c72aec42d369a03b3eee8144095acda53bcdbcb95bc6537e3ac',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec1',
    username: 'executor1',
    displayName: 'Import Operations Lead',
    role: 'executor',
    salt: 'c3d4e5f60718a1b2',
    passwordHash: '20bc5b10ab1b9ff7d4033568f9311287ffacb44ffe2bd852a6b9a40cbad5a5b2',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec2',
    username: 'executor2',
    displayName: 'Customs & BOE Specialist',
    role: 'executor',
    salt: 'd4e5f60718a1b2c3',
    passwordHash: '2ed3e4a930f521959db6fa432034c8d663aa5d9e8286fd23539ee35ebf366c46',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-exec3',
    username: 'executor3',
    displayName: 'Bank Remittance Executive',
    role: 'executor',
    salt: 'e5f60718a1b2c3d4',
    passwordHash: 'c4fbf8d4dca5468652f837759a8cd416b5a35ffbe932fc533a8e2f87ed07e651',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-purch1',
    username: 'purchase1',
    displayName: 'Purchase Manager',
    role: 'purchase',
    salt: 'f60718a1b2c3d4e5',
    passwordHash: 'd125f652547521a350a6aae6d12782a75bea7e4040f767d07d4100ce1c1bbf25',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'user-purch2',
    username: 'purchase2',
    displayName: 'Purchase & Logistics Executive',
    role: 'purchase',
    salt: '0718a1b2c3d4e5f6',
    passwordHash: 'f355af8e46a32b96d4b1ef3ea590401fdd82ce15c7e8cce0bd3fcbbcba9f1bea',
    active: true,
    createdAt: '2026-04-01T00:00:00.000Z',
  },
];

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function hashPasswordServer(password, salt) {
  return sha256Hex(`${salt}:${password}:IPC_SECURE_SALT_2026`);
}

function encryptAndSignObject(obj) {
  const json = JSON.stringify(obj);
  const checksum = sha256Hex(`IPC_INTEGRITY_SALT:${json}`);
  const envelope = {
    _securityHeader: 'IPC_ENCRYPTED_STORE_V1',
    _integrityChecksum: checksum,
    _timestamp: new Date().toISOString(),
    _payload: Buffer.from(json, 'utf8').toString('base64'),
  };
  return JSON.stringify(envelope, null, 2);
}

function decryptAndVerifyString(rawString) {
  try {
    const parsed = JSON.parse(rawString);
    if (parsed && parsed._securityHeader === 'IPC_ENCRYPTED_STORE_V1' && parsed._payload) {
      const decodedJson = Buffer.from(parsed._payload, 'base64').toString('utf8');
      const expectedChecksum = sha256Hex(`IPC_INTEGRITY_SALT:${decodedJson}`);
      if (expectedChecksum !== parsed._integrityChecksum) {
        return {
          success: false,
          tampered: true,
          error: 'TAMPER_DETECTED: Disk database integrity check failed. File was modified externally.',
        };
      }
      return { success: true, data: JSON.parse(decodedJson) };
    }
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to parse stored database.' };
  }
}

function atomicWriteFile(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function sanitizeUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

function compareVersions(a, b) {
  const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

let SESSION_SECRET = '';

function createBackupFile(rawContentOrObj, reason) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `ipc_backup_${stamp}.json`;
    const fullPath = path.join(BACKUPS_DIR, filename);
    const wrapped =
      typeof rawContentOrObj === 'string'
        ? rawContentOrObj
        : encryptAndSignObject({
            timestamp: new Date().toISOString(),
            reason: reason || 'Server snapshot',
            data: rawContentOrObj,
          });
    atomicWriteFile(fullPath, wrapped);

    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift();
      if (oldest) {
        fs.unlinkSync(path.join(BACKUPS_DIR, oldest));
      }
    }
    return filename;
  } catch (err) {
    console.error('Failed to write backup snapshot:', err);
    return null;
  }
}

function initStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  if (!fs.existsSync(SECRET_FILE)) {
    atomicWriteFile(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  }
  SESSION_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();

  if (!fs.existsSync(USERS_FILE)) {
    atomicWriteFile(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2));
  } else {
    try {
      const existingUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (!Array.isArray(existingUsers) || existingUsers.length < 5) {
        atomicWriteFile(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2));
      } else {
        let changed = false;
        for (const defUser of DEFAULT_USERS) {
          if (!existingUsers.some(u => u.id === defUser.id)) {
            existingUsers.push(defUser);
            changed = true;
          }
        }
        if (changed) {
          atomicWriteFile(USERS_FILE, JSON.stringify(existingUsers, null, 2));
        }
      }
    } catch {
      atomicWriteFile(USERS_FILE, JSON.stringify(DEFAULT_USERS, null, 2));
    }
  }

  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  if (!fs.existsSync(DB_FILE)) {
    atomicWriteFile(DB_FILE, encryptAndSignObject(seed));
  } else {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const verified = decryptAndVerifyString(raw);
    if (verified.success && verified.data && compareVersions(verified.data.version, seed.version) < 0) {
      createBackupFile(verified.data, `Pre-upgrade backup from v${verified.data.version}`);
      if (compareVersions(verified.data.version, '2.2.0') >= 0) {
        // Surgical upgrade: preserve all existing user/purchase/IGCR/finance records and update only seeded Sakar opening balances
        const correctedMap = new Map((seed.openingBalances || []).map(o => [o.id, o]));
        const existingObs = Array.isArray(verified.data.openingBalances) ? verified.data.openingBalances : [];
        const migratedObs = existingObs.map(o => correctedMap.get(o.id) || o);
        for (const seedOb of seed.openingBalances || []) {
          if (!migratedObs.some(o => o.id === seedOb.id)) {
            migratedObs.push(seedOb);
          }
        }
        const existingItems = Array.isArray(verified.data.items) && verified.data.items.length > 0
          ? verified.data.items
          : (seed.items || []);
        const migratedDb = normalizeDb({
          ...verified.data,
          items: existingItems,
          openingBalances: migratedObs,
          version: seed.version,
          lastUpdated: new Date().toISOString(),
        });
        atomicWriteFile(DB_FILE, encryptAndSignObject(migratedDb));
      } else {
        atomicWriteFile(DB_FILE, encryptAndSignObject(seed));
      }
    }
  }
}

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function writeUsers(users) {
  atomicWriteFile(USERS_FILE, JSON.stringify(users, null, 2));
}

function normalizeDb(d) {
  if (!d || typeof d !== 'object') return d;
  return {
    ...d,
    items: Array.isArray(d.items) ? d.items : [],
    purchaseRequisitions: Array.isArray(d.purchaseRequisitions) ? d.purchaseRequisitions : [],
    shipments: Array.isArray(d.shipments) ? d.shipments : [],
    igcrLots: Array.isArray(d.igcrLots) ? d.igcrLots : [],
    igcrConsumptions: Array.isArray(d.igcrConsumptions) ? d.igcrConsumptions : [],
  };
}

function redactDbForPurchase(d) {
  const norm = normalizeDb(d);
  return {
    ...norm,
    bankAccounts: [],
    payments: [],
    debitNotes: [],
    refundReceipts: [],
    adjustments: [],
    openingBalances: [],
    boeSubmissions: [],
    monthEndRates: [],
    igcrLots: [],
    igcrConsumptions: [],
  };
}

function readDbVerified() {
  if (!fs.existsSync(DB_FILE)) {
    return { success: false, error: 'Database file missing on disk.' };
  }
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  const dec = decryptAndVerifyString(raw);
  if (dec.success && dec.data) {
    return { success: true, data: normalizeDb(dec.data) };
  }
  return dec;
}

function signSessionToken(user) {
  const payload = {
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySessionCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      cookies[k] = v;
    }
  }
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || !payload.uid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    const users = readUsers();
    const user = users.find(u => u.id === payload.uid && u.active);
    return user || null;
  } catch {
    return null;
  }
}

function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self';"
  );
}

function sendJson(res, status, obj, extraHeaders = {}) {
  setSecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(obj));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const LIMIT = 25 * 1024 * 1024; // 25 MB limit
    req.on('data', chunk => {
      total += chunk.length;
      if (total > LIMIT) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, urlPath) {
  // Block hidden files and .map source maps
  if (urlPath.includes('/.') || urlPath.endsWith('.map')) {
    setSecurityHeaders(res);
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  let relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let targetPath = path.resolve(DIST_DIR, relPath);

  if (!targetPath.startsWith(path.resolve(DIST_DIR))) {
    setSecurityHeaders(res);
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    // SPA fallback for client routes
    targetPath = path.join(DIST_DIR, 'index.html');
  }

  if (!fs.existsSync(targetPath)) {
    setSecurityHeaders(res);
    res.writeHead(404);
    res.end('Production build not found. Run npm run build first.');
    return;
  }

  const ext = path.extname(targetPath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  setSecurityHeaders(res);

  if (urlPath.startsWith('/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(targetPath).pipe(res);
}

initStorage();

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = (req.method || 'GET').toUpperCase();

  try {
    // 1. Health Check
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, storage: 'disk', dataDir: DATA_DIR, dbFile: DB_FILE });
    }

    // 2. Public Roles List (strictly no hashes or salts!)
    if (method === 'GET' && pathname === '/api/auth/roles') {
      const users = readUsers();
      return sendJson(res, 200, {
        roles: users
          .filter(u => u.active)
          .map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role })),
      });
    }

    // 3. Check Active Session
    if (method === 'GET' && pathname === '/api/auth/me') {
      const user = verifySessionCookie(req);
      if (!user) {
        return sendJson(res, 401, { authenticated: false });
      }
      return sendJson(res, 200, { authenticated: true, user: sanitizeUser(user) });
    }

    // 4. Login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');

      const users = readUsers();
      const user = users.find(u => u.username.toLowerCase() === username);
      if (!user) {
        return sendJson(res, 401, { success: false, error: 'Invalid username or password.' });
      }
      if (!user.active) {
        return sendJson(res, 403, { success: false, error: 'User account is inactive. Contact Administrator.' });
      }

      const computed = hashPasswordServer(password, user.salt);
      if (computed !== user.passwordHash) {
        return sendJson(res, 401, { success: false, error: 'Invalid username or password.' });
      }

      user.lastLoginAt = new Date().toISOString();
      writeUsers(users);

      const token = signSessionToken(user);
      const cookieVal = `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
      return sendJson(res, 200, { success: true, user: sanitizeUser(user) }, { 'Set-Cookie': cookieVal });
    }

    // 5. Logout
    if (method === 'POST' && pathname === '/api/auth/logout') {
      return sendJson(
        res,
        200,
        { success: true },
        { 'Set-Cookie': `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0` }
      );
    }

    // 6. List Users (Admin only)
    if (method === 'GET' && pathname === '/api/auth/users') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { error: 'Authentication required.' });
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Administrator privileges required.' });
      return sendJson(res, 200, { users: readUsers().map(sanitizeUser) });
    }

    // 7. Update Password (Admin only)
    if (method === 'POST' && pathname === '/api/auth/users/password') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { success: false, error: 'Authentication required.' });
      if (user.role !== 'admin') return sendJson(res, 403, { success: false, error: 'Administrator privileges required.' });

      const body = await readJsonBody(req);
      const userId = String(body.userId || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 6) {
        return sendJson(res, 400, { success: false, error: 'Password must be at least 6 characters long.' });
      }

      const users = readUsers();
      const target = users.find(u => u.id === userId);
      if (!target) {
        return sendJson(res, 404, { success: false, error: 'User not found.' });
      }

      target.passwordHash = hashPasswordServer(newPassword, target.salt);
      writeUsers(users);
      return sendJson(res, 200, { success: true });
    }

    // 8. Get Database (Authenticated only)
    if (method === 'GET' && pathname === '/api/db') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { success: false, error: 'Authentication required.' });

      const verified = readDbVerified();
      if (!verified.success) {
        return sendJson(res, 500, { success: false, error: verified.error || 'Failed to read database.' });
      }
      const payloadData = user.role === 'purchase' ? redactDbForPurchase(verified.data) : verified.data;
      return sendJson(res, 200, { success: true, data: payloadData, storagePath: DB_FILE });
    }

    // 9. Save Database (RBAC enforced!)
    if (method === 'PUT' && pathname === '/api/db') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { success: false, error: 'Authentication required.' });
      if (user.role === 'management') {
        return sendJson(res, 403, { success: false, error: 'Management role is read-only and cannot modify data.' });
      }

      const body = await readJsonBody(req);
      const incomingDb = normalizeDb(body.data);
      if (!incomingDb || !incomingDb.version || !Array.isArray(incomingDb.companies)) {
        return sendJson(res, 400, { success: false, error: 'Invalid database payload.' });
      }

      // If purchase role, merge strictly purchase-owned tables onto authoritative disk DB so bank/finance data is never overwritten
      if (user.role === 'purchase') {
        const current = readDbVerified();
        if (!current.success || !current.data) {
          return sendJson(res, 500, { success: false, error: current.error || 'Failed to verify existing database.' });
        }
        const currLogs = Array.isArray(current.data.auditLogs) ? current.data.auditLogs : [];
        const newLogs = Array.isArray(incomingDb.auditLogs)
          ? incomingDb.auditLogs.filter(a => a && !currLogs.some(e => e.id === a.id))
          : [];
        const mergedDb = {
          ...current.data,
          items: Array.isArray(incomingDb.items) ? incomingDb.items : current.data.items,
          purchaseRequisitions: Array.isArray(incomingDb.purchaseRequisitions)
            ? incomingDb.purchaseRequisitions
            : current.data.purchaseRequisitions,
          proformaInvoices: Array.isArray(incomingDb.proformaInvoices)
            ? incomingDb.proformaInvoices
            : current.data.proformaInvoices,
          shipments: Array.isArray(incomingDb.shipments) ? incomingDb.shipments : current.data.shipments,
          auditLogs: [...newLogs, ...currLogs].slice(0, 1000),
          lastUpdated: new Date().toISOString(),
        };
        atomicWriteFile(DB_FILE, encryptAndSignObject(mergedDb));
        return sendJson(res, 200, { success: true, storagePath: DB_FILE });
      }

      // If executor, block changes to Admin-only protected tables (Masters, Settings, Opening Balances)
      if (user.role === 'executor') {
        const current = readDbVerified();
        if (current.success && current.data) {
          const protectedKeys = [
            'companies',
            'bankAccounts',
            'suppliers',
            'currencies',
            'monthEndRates',
            'settings',
            'openingBalances',
          ];
          for (const key of protectedKeys) {
            if (JSON.stringify(incomingDb[key]) !== JSON.stringify(current.data[key])) {
              return sendJson(res, 403, {
                success: false,
                error: `Access Denied: Executor cannot modify protected Admin configuration (${key}).`,
              });
            }
          }
        }
      }

      incomingDb.lastUpdated = new Date().toISOString();
      atomicWriteFile(DB_FILE, encryptAndSignObject(incomingDb));

      if (body.triggerBackup) {
        createBackupFile(incomingDb, body.reason || `Manual/Import backup by ${user.username}`);
      }

      return sendJson(res, 200, { success: true, storagePath: DB_FILE });
    }

    // 10. List Backups (Admin only)
    if (method === 'GET' && pathname === '/api/backups') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { error: 'Authentication required.' });
      if (user.role !== 'admin') return sendJson(res, 403, { error: 'Administrator privileges required.' });

      const files = fs
        .readdirSync(BACKUPS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();

      const backups = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(BACKUPS_DIR, file), 'utf8');
          const dec = decryptAndVerifyString(raw);
          if (dec.success && dec.data) {
            backups.push({
              key: file,
              timestamp: dec.data.timestamp || file,
              reason: dec.data.reason || 'Server snapshot',
            });
          }
        } catch {
          // ignore malformed
        }
      }
      return sendJson(res, 200, { backups });
    }

    // 11. Restore Backup (Admin only)
    if (method === 'POST' && pathname === '/api/backups/restore') {
      const user = verifySessionCookie(req);
      if (!user) return sendJson(res, 401, { success: false, error: 'Authentication required.' });
      if (user.role !== 'admin') return sendJson(res, 403, { success: false, error: 'Administrator privileges required.' });

      const body = await readJsonBody(req);
      const safeName = path.basename(String(body.key || ''));
      if (!safeName || !safeName.endsWith('.json')) {
        return sendJson(res, 400, { success: false, error: 'Invalid snapshot key.' });
      }
      const targetFile = path.join(BACKUPS_DIR, safeName);
      if (!fs.existsSync(targetFile)) {
        return sendJson(res, 404, { success: false, error: 'Backup snapshot not found.' });
      }

      const verified = decryptAndVerifyString(fs.readFileSync(targetFile, 'utf8'));
      if (!verified.success || !verified.data || !verified.data.data) {
        return sendJson(res, 400, { success: false, error: verified.error || 'Corrupted or tampered backup.' });
      }

      const current = readDbVerified();
      if (current.success && current.data) {
        createBackupFile(current.data, `Pre-restore snapshot before ${safeName}`);
      }

      const restoredDb = verified.data.data;
      atomicWriteFile(DB_FILE, encryptAndSignObject(restoredDb));
      return sendJson(res, 200, { success: true, data: restoredDb, storagePath: DB_FILE });
    }

    // Unknown /api routes
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'API endpoint not found.' });
    }

    // Static assets + SPA
    serveStatic(req, res, pathname);
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { success: false, error: err?.message || 'Internal Server Error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Import Payment Control Server running at http://localhost:${PORT}/`);
  console.log(`Persistent Data Directory: ${DATA_DIR}`);
  console.log(`Database File: ${DB_FILE}`);
});
