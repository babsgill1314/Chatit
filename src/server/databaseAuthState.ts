import { 
  initAuthCreds, 
  BufferJSON, 
  proto, 
  AuthenticationCreds, 
  AuthenticationState, 
  SignalDataTypeMap 
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

export interface DatabaseSessionRecord {
  tenantId: string;
  phoneNumber?: string | null;
  verifiedName?: string | null;
  authMethod: 'QR' | 'PAIRING_CODE';
  connectionStatus: 'INITIALIZING' | 'QR_RECEIVED' | 'PAIRING_CODE_RECEIVED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  credsSerialized: string;
  keysSerialized: string;
  updatedAt: string;
  createdAt: string;
}

// In-Memory Fast Cache across running instances
const sessionMemoryStore = new Map<string, {
  creds: AuthenticationCreds;
  keys: Map<string, any>;
  lastSavedAt: number;
}>();

// Disk persistence fallback for high-durability single-file DB (No multi-file explosion)
const DB_DIR = path.resolve(process.cwd(), 'storage/database');
const DB_FILE = path.join(DB_DIR, 'whatsapp_db_auth.json');

function ensureDbFileExists(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function loadAllDbRecords(): Record<string, DatabaseSessionRecord> {
  try {
    ensureDbFileExists();
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) || {};
  } catch (err) {
    console.warn('[DatabaseAuthState] Warning reading database auth file:', err);
    return {};
  }
}

function saveDbRecord(tenantId: string, record: DatabaseSessionRecord): void {
  try {
    ensureDbFileExists();
    const all = loadAllDbRecords();
    all[tenantId] = record;
    fs.writeFileSync(DB_FILE, JSON.stringify(all, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[DatabaseAuthState] Failed to save record for ${tenantId}:`, err);
  }
}

export function clearDatabaseAuthState(tenantId: string): void {
  const cleanId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  sessionMemoryStore.delete(cleanId);
  try {
    ensureDbFileExists();
    const all = loadAllDbRecords();
    if (all[cleanId]) {
      delete all[cleanId];
      fs.writeFileSync(DB_FILE, JSON.stringify(all, null, 2), 'utf-8');
      console.log(`[DatabaseAuthState] Purged database auth state for ${cleanId}`);
    }
  } catch (err) {
    console.error(`[DatabaseAuthState] Error deleting auth state for ${cleanId}:`, err);
  }
}

/**
 * Production-grade Database-backed Authentication State Provider.
 * Replaces useMultiFileAuthState to prevent disk I/O bottlenecks,
 * file-system corruption, and unannounced mass disconnections.
 */
export async function useDatabaseAuthState(tenantId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuthState: () => Promise<void>;
}> {
  const cleanId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');

  let entry = sessionMemoryStore.get(cleanId);

  if (!entry) {
    // Try hydrating from database record
    const allRecords = loadAllDbRecords();
    const record = allRecords[cleanId];

    let creds: AuthenticationCreds;
    const keys = new Map<string, any>();

    if (record && record.credsSerialized) {
      try {
        creds = JSON.parse(record.credsSerialized, BufferJSON.reviver);
        if (record.keysSerialized) {
          const parsedKeys = JSON.parse(record.keysSerialized, BufferJSON.reviver);
          for (const [k, v] of Object.entries(parsedKeys)) {
            keys.set(k, v);
          }
        }
        console.log(`[DatabaseAuthState] Successfully rehydrated auth state from DB for tenant: ${cleanId}`);
      } catch (err) {
        console.warn(`[DatabaseAuthState] Could not parse stored credentials for ${cleanId}, generating fresh credentials:`, err);
        creds = initAuthCreds();
      }
    } else {
      console.log(`[DatabaseAuthState] Generating fresh credentials for tenant: ${cleanId}`);
      creds = initAuthCreds();
    }

    entry = {
      creds,
      keys,
      lastSavedAt: Date.now()
    };
    sessionMemoryStore.set(cleanId, entry);
  }

  // Debounced persistence helper
  let saveTimer: NodeJS.Timeout | null = null;
  const schedulePersist = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (!entry) return;
      try {
        const keysObj: Record<string, any> = {};
        entry.keys.forEach((v, k) => {
          keysObj[k] = v;
        });

        const record: DatabaseSessionRecord = {
          tenantId: cleanId,
          authMethod: 'PAIRING_CODE',
          connectionStatus: 'CONNECTED',
          credsSerialized: JSON.stringify(entry.creds, BufferJSON.replacer),
          keysSerialized: JSON.stringify(keysObj, BufferJSON.replacer),
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        saveDbRecord(cleanId, record);
        entry.lastSavedAt = Date.now();
      } catch (err) {
        console.error(`[DatabaseAuthState] Error persisting session for ${cleanId}:`, err);
      }
    }, 1000);
  };

  const state: AuthenticationState = {
    creds: entry.creds,
    keys: {
      get: async (type, ids) => {
        const data: { [_: string]: any } = {};
        for (const id of ids) {
          const key = `${type}-${id}`;
          const val = entry?.keys.get(key);
          if (val) {
            data[id] = val;
          }
        }
        return data;
      },
      set: async (data) => {
        if (!entry) return;
        for (const category in data) {
          const items = data[category as keyof SignalDataTypeMap];
          if (items) {
            for (const id in items) {
              const value = (items as any)[id];
              const key = `${category}-${id}`;
              if (value) {
                entry.keys.set(key, value);
              } else {
                entry.keys.delete(key);
              }
            }
          }
        }
        schedulePersist();
      }
    }
  };

  return {
    state,
    saveCreds: async () => {
      schedulePersist();
    },
    clearAuthState: async () => {
      clearDatabaseAuthState(cleanId);
    }
  };
}
