import { AppDatabase, AuditLog } from '../types';
import { INITIAL_DATABASE } from '../data/seedData';
import { exportMultiSheetExcel } from '../utils/excel';
import { encryptAndSignData, decryptAndVerifyData, decodeAndVerifySync } from '../utils/crypto';

const DB_KEY = 'import_payment_control_db';
const BACKUP_PREFIX = 'ipc_backup_';
const MAX_BACKUPS = 60;

// Runtime file + server persistence tracking
let activeFileHandle: FileSystemFileHandle | null = null;
let isFileConnected = false;
let isServerConnected = false;
let serverStoragePath: string | null = null;
let lastIntegrityError: string | null = null;
let lastSaveError: string | null = null;

type StorageListener = (db: AppDatabase, connectedToFile: boolean) => void;
const listeners: Set<StorageListener> = new Set();

export function subscribeStorage(callback: StorageListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners(db: AppDatabase) {
  listeners.forEach(cb => cb(db, isFileConnected));
}

export function getLastIntegrityError(): string | null {
  return lastIntegrityError;
}

export function getLastSaveError(): string | null {
  return lastSaveError;
}

export function getIsServerConnected(): boolean {
  return isServerConnected;
}

export function getServerStoragePath(): string | null {
  return serverStoragePath;
}

async function createAutoBackup(db: AppDatabase, reason: string = 'Daily auto-backup') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${BACKUP_PREFIX}${timestamp}`;
    const signedPayload = await encryptAndSignData({
      timestamp: new Date().toISOString(),
      reason,
      data: db,
    });
    localStorage.setItem(backupKey, signedPayload);

    const backupKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(BACKUP_PREFIX)) {
        backupKeys.push(key);
      }
    }
    backupKeys.sort();
    while (backupKeys.length > MAX_BACKUPS) {
      const oldestKey = backupKeys.shift();
      if (oldestKey) localStorage.removeItem(oldestKey);
    }
  } catch (e) {
    console.warn('Backup storage limit reached or error creating backup:', e);
  }
}

/**
 * Ensure optional Purchase & IGCR collections always exist even on older persisted databases
 */
export function normalizeDatabase(raw: AppDatabase): AppDatabase {
  return {
    ...raw,
    items: Array.isArray(raw.items) ? raw.items : [],
    purchaseRequisitions: Array.isArray(raw.purchaseRequisitions) ? raw.purchaseRequisitions : [],
    shipments: Array.isArray(raw.shipments) ? raw.shipments : [],
    igcrLots: Array.isArray(raw.igcrLots) ? raw.igcrLots : [],
    igcrConsumptions: Array.isArray(raw.igcrConsumptions) ? raw.igcrConsumptions : [],
    forexAdjustments: Array.isArray(raw.forexAdjustments) ? raw.forexAdjustments : [],
  };
}

/**
 * Synchronous initial load from encrypted browser cache or audited seed
 */
export function loadDatabase(): AppDatabase {
  lastIntegrityError = null;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const verified = decodeAndVerifySync(raw);
      if (!verified.success && verified.tampered) {
        lastIntegrityError = verified.error || 'TAMPER_DETECTED: Local storage checksum mismatch.';
      } else if (verified.success && verified.data) {
        const parsed = verified.data as AppDatabase;
        if (parsed && parsed.version === INITIAL_DATABASE.version) {
          return normalizeDatabase(parsed);
        }
      }
    }
  } catch (err) {
    console.error('Failed to parse cached database from localStorage:', err);
  }

  return normalizeDatabase(INITIAL_DATABASE);
}

/**
 * Authoritative async load from persistent disk storage on server (F:\Import Payment management\data\ipc-database.json)
 */
export async function loadDatabaseFromServer(): Promise<{
  success: boolean;
  data?: AppDatabase;
  storagePath?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/db', { credentials: 'same-origin' });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      isServerConnected = false;
      return { success: false, error: 'Server storage API unavailable.' };
    }

    const payload = await res.json();
    if (!res.ok || !payload.success || !payload.data) {
      isServerConnected = false;
      if (String(payload.error || '').includes('TAMPER_DETECTED')) {
        lastIntegrityError = payload.error;
      }
      return { success: false, error: payload.error || 'Failed to load database from server.' };
    }

    isServerConnected = true;
    serverStoragePath = payload.storagePath || null;
    lastIntegrityError = null;
    lastSaveError = null;

    // Mirror signed database to browser cache
    const normalized = normalizeDatabase(payload.data as AppDatabase);
    try {
      const signedJson = await encryptAndSignData(normalized);
      localStorage.setItem(DB_KEY, signedJson);
    } catch {
      // ignore storage quota errors
    }

    notifyListeners(normalized);
    return {
      success: true,
      data: normalized,
      storagePath: payload.storagePath,
    };
  } catch (err: any) {
    isServerConnected = false;
    return { success: false, error: err?.message || 'Server storage API unreachable.' };
  }
}

/**
 * Save Database:
 * 1. Persists atomically to F:\Import Payment management\data\ipc-database.json via PUT /api/db
 * 2. Mirrors SHA-256 signed package to localStorage
 * 3. Writes to connected local disk file handle if attached
 */
export async function saveDatabase(
  db: AppDatabase,
  triggerBackup: boolean = false,
  auditNote?: string,
  username?: string
): Promise<void> {
  db.lastUpdated = new Date().toISOString();

  if (auditNote) {
    const log: AuditLog = {
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      user: username || 'System',
      action: 'UPDATE',
      entity: 'System',
      entityId: 'All',
      details: auditNote,
    };
    db.auditLogs = [log, ...db.auditLogs.slice(0, 999)];
  }

  const signedJson = await encryptAndSignData(db);

  // 1. Server Persistent Disk Storage (F:\Import Payment management\data\ipc-database.json)
  try {
    const res = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ data: db, triggerBackup, reason: auditNote }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await res.json();
      if (res.ok && result.success) {
        isServerConnected = true;
        serverStoragePath = result.storagePath || serverStoragePath;
        lastSaveError = null;
      } else {
        lastSaveError = result.error || 'Server rejected database update.';
        notifyListeners(db);
        return;
      }
    }
  } catch {
    // Offline fallback mode
  }

  // 2. LocalStorage backup mirror
  try {
    localStorage.setItem(DB_KEY, signedJson);
    lastIntegrityError = null;
  } catch (e) {
    console.error('LocalStorage write error:', e);
  }

  // 3. Optional File System Access API disk handle
  if (activeFileHandle) {
    try {
      // @ts-expect-error FSA queryPermission
      const status = await activeFileHandle.queryPermission({ mode: 'readwrite' });
      if (status === 'granted') {
        const writable = await activeFileHandle.createWritable();
        await writable.write(signedJson);
        await writable.close();
        isFileConnected = true;
      } else {
        isFileConnected = false;
      }
    } catch (err) {
      console.warn('Could not write to local file handle directly:', err);
      isFileConnected = false;
    }
  }

  // 4. Local auto-backup if server isn't handling backups
  if (triggerBackup && !isServerConnected) {
    await createAutoBackup(db, auditNote || 'Manual / Pre-import backup');
  }

  notifyListeners(db);
}

/**
 * Connect to an existing JSON file on disk using File System Access API
 */
export async function connectDataFile(): Promise<{ success: boolean; filename?: string; error?: string }> {
  if (!('showOpenFilePicker' in window)) {
    return {
      success: false,
      error: 'File System Access API is not supported in this browser. Server disk storage or encrypted local caching is active.',
    };
  }

  try {
    // @ts-expect-error showOpenFilePicker
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'JSON Database File',
          accept: { 'application/json': ['.json'] },
        },
      ],
      multiple: false,
    });

    if (handle) {
      activeFileHandle = handle;
      const file = await handle.getFile();
      const content = await file.text();
      let db = loadDatabase();
      if (content.trim()) {
        const verified = await decryptAndVerifyData(content);
        if (!verified.success) {
          activeFileHandle = null;
          return { success: false, error: verified.error || 'Integrity check failed on disk file.' };
        }
        db = verified.data as AppDatabase;
      }
      isFileConnected = true;
      await saveDatabase(db, true, `Connected to disk file: ${file.name}`, 'System');
      return { success: true, filename: file.name };
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'User cancelled file selection' };
}

export async function createAndConnectDataFile(): Promise<{ success: boolean; filename?: string; error?: string }> {
  if (!('showSaveFilePicker' in window)) {
    return {
      success: false,
      error: 'File System Access API is not supported in this browser.',
    };
  }

  try {
    // @ts-expect-error showSaveFilePicker
    const handle = await window.showSaveFilePicker({
      suggestedName: `import_payment_control_data_${new Date().toISOString().split('T')[0]}.json`,
      types: [
        {
          description: 'JSON Database File',
          accept: { 'application/json': ['.json'] },
        },
      ],
    });

    if (handle) {
      activeFileHandle = handle;
      const db = loadDatabase();
      const signedJson = await encryptAndSignData(db);
      const writable = await handle.createWritable();
      await writable.write(signedJson);
      await writable.close();
      isFileConnected = true;
      notifyListeners(db);
      return { success: true, filename: handle.name };
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'User cancelled save dialog' };
}

export function getIsFileConnected(): boolean {
  return isFileConnected;
}

export function getActiveFileName(): string | null {
  return activeFileHandle ? activeFileHandle.name : null;
}

export async function downloadManualJSONBackup(db: AppDatabase) {
  const signedStr = await encryptAndSignData(db);
  const blob = new Blob([signedStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `IPC_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreFromJSONFile(file: File, username?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const text = await file.text();
    const verified = await decryptAndVerifyData(text);
    if (!verified.success) {
      return { success: false, error: verified.error || 'Tamper check failed on backup file.' };
    }
    const parsed = verified.data as AppDatabase;
    if (!parsed || !parsed.version || !Array.isArray(parsed.companies)) {
      return { success: false, error: 'Invalid backup file structure.' };
    }

    if (!isServerConnected) {
      await createAutoBackup(loadDatabase(), 'Auto-backup prior to restore');
    }
    await saveDatabase(normalizeDatabase(parsed), true, `Restored database from ${file.name}`, username);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to read backup file.' };
  }
}

export function exportAllDataToExcel(db: AppDatabase) {
  const sheets = [
    { name: 'Companies', data: db.companies },
    { name: 'BankAccounts', data: db.bankAccounts },
    { name: 'Suppliers', data: db.suppliers },
    { name: 'PI_Register', data: db.proformaInvoices },
    { name: 'CI_Purchase_Register', data: db.commercialInvoices },
    { name: 'Payments', data: db.payments },
    { name: 'DebitNotes', data: db.debitNotes },
    { name: 'RefundReceipts', data: db.refundReceipts },
    { name: 'Adjustments', data: db.adjustments },
    { name: 'OpeningBalances', data: db.openingBalances },
    { name: 'BOESubmissions', data: db.boeSubmissions },
    { name: 'AuditLog', data: db.auditLogs },
  ];

  exportMultiSheetExcel(sheets, 'Import_Payment_Control_Full_Export');
}

export function listAutoBackups(): Array<{ key: string; timestamp: string; reason: string }> {
  const list: Array<{ key: string; timestamp: string; reason: string }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const decoded = decodeAndVerifySync(raw);
          if (decoded.success && decoded.data) {
            list.push({
              key,
              timestamp: decoded.data.timestamp || key.replace(BACKUP_PREFIX, ''),
              reason: decoded.data.reason || 'Auto backup',
            });
          }
        }
      } catch {
        // ignore malformed
      }
    }
  }
  return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function listServerBackups(): Promise<Array<{ key: string; timestamp: string; reason: string }>> {
  try {
    const res = await fetch('/api/backups', { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.backups)) return data.backups;
    }
  } catch {
    // ignore
  }
  return listAutoBackups();
}

export async function restoreServerBackup(key: string): Promise<boolean> {
  try {
    const res = await fetch('/api/backups/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data) {
        try {
          const signedJson = await encryptAndSignData(data.data);
          localStorage.setItem(DB_KEY, signedJson);
        } catch {
          // ignore
        }
        notifyListeners(data.data as AppDatabase);
        return true;
      }
    }
  } catch (err) {
    console.error(err);
  }
  return false;
}

export async function restoreAutoBackup(key: string, username?: string): Promise<boolean> {
  if (isServerConnected) {
    return await restoreServerBackup(key);
  }
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try {
    const verified = await decryptAndVerifyData(raw);
    if (verified.success && verified.data && verified.data.data) {
      await saveDatabase(verified.data.data, true, `Restored from backup: ${key}`, username);
      return true;
    }
  } catch (err) {
    console.error(err);
  }
  return false;
}
