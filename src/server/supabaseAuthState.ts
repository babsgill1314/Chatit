import { 
  initAuthCreds, 
  BufferJSON, 
  proto, 
  AuthenticationCreds, 
  AuthenticationState, 
  SignalDataTypeMap 
} from '@whiskeysockets/baileys';
import { supabase } from '../services/supabaseClient';

export interface SupabaseWhatsAppSessionRecord {
  store_id: string;
  phone_number: string | null;
  verified_name: string | null;
  auth_method: 'QR' | 'PAIRING_CODE';
  connection_status: 'INITIALIZING' | 'QR_RECEIVED' | 'PAIRING_CODE_RECEIVED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  creds_serialized: string;
  keys_serialized: string;
  updated_at: string;
  created_at: string;
}

// In-Memory Fast Cache to prevent repetitive database read/write bottlenecks
const sessionMemoryStore = new Map<string, {
  creds: AuthenticationCreds;
  keys: Map<string, any>;
  lastSavedAt: number;
}>();

/**
 * SECTION 1.2: Supabase PostgreSQL Authentication State Adapter.
 * Replaces useMultiFileAuthState to permanently prevent local filesystem corruption,
 * disk descriptor limits, and unannounced mass disconnections on Render.
 */
export async function useSupabaseAuthState(storeId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearAuthState: () => Promise<void>;
}> {
  const cleanStoreId = (storeId || 'store_aura_main').replace(/[^a-zA-Z0-9_-]/g, '_');
  let entry = sessionMemoryStore.get(cleanStoreId);

  if (!entry) {
    let creds: AuthenticationCreds = initAuthCreds();
    const keys = new Map<string, any>();

    // 1. Attempt to re-hydrate active session tokens from Supabase PostgreSQL table
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('whatsapp_sessions')
          .select('*')
          .eq('store_id', cleanStoreId)
          .maybeSingle();

        if (!error && data && data.creds_serialized) {
          creds = JSON.parse(data.creds_serialized, BufferJSON.reviver);
          if (data.keys_serialized) {
            const parsedKeys = JSON.parse(data.keys_serialized, BufferJSON.reviver);
            for (const [k, v] of Object.entries(parsedKeys)) {
              keys.set(k, v);
            }
          }
          console.log(`[SupabaseAuthState] Rehydrated credentials from PostgreSQL for store: ${cleanStoreId}`);
        } else {
          console.log(`[SupabaseAuthState] No prior session in PostgreSQL for ${cleanStoreId}. Initialized fresh auth creds.`);
        }
      } catch (dbErr: any) {
        console.warn(`[SupabaseAuthState] PostgreSQL check note for ${cleanStoreId}:`, dbErr.message);
      }
    } else {
      console.warn(`[SupabaseAuthState] Supabase client offline: using memory session store for ${cleanStoreId}`);
    }

    entry = {
      creds,
      keys,
      lastSavedAt: Date.now()
    };
    sessionMemoryStore.set(cleanStoreId, entry);
  }

  // 2. Debounced asynchronous synchronization into Supabase PostgreSQL
  let saveTimer: NodeJS.Timeout | null = null;
  const schedulePersistToSupabase = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      if (!entry) return;

      try {
        const keysObj: Record<string, any> = {};
        entry.keys.forEach((v, k) => {
          keysObj[k] = v;
        });

        const recordPayload = {
          store_id: cleanStoreId,
          auth_method: 'PAIRING_CODE',
          connection_status: 'CONNECTED',
          creds_serialized: JSON.stringify(entry.creds, BufferJSON.replacer),
          keys_serialized: JSON.stringify(keysObj, BufferJSON.replacer),
          updated_at: new Date().toISOString()
        };

        // Upsert directly into Supabase PostgreSQL whatsapp_sessions table
        if (supabase) {
          const { error } = await supabase
            .from('whatsapp_sessions')
            .upsert(recordPayload, { onConflict: 'store_id' });

          if (error) {
            // Log without crashing in-memory active socket connection
            console.warn(`[SupabaseAuthState] PostgreSQL session upsert notice: ${error.message}`);
          } else {
            entry.lastSavedAt = Date.now();
          }
        }
      } catch (err: any) {
        console.warn(`[SupabaseAuthState] Debounced persist error: ${err.message}`);
      }
    }, 1500);
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
        schedulePersistToSupabase();
      }
    }
  };

  return {
    state,
    saveCreds: async () => {
      schedulePersistToSupabase();
    },
    clearAuthState: async () => {
      await clearSupabaseAuthState(cleanStoreId);
    }
  };
}

/**
 * Flushes session authentication data from Supabase PostgreSQL table
 * strictly when a verified structural logout is triggered by Meta/WhatsApp servers.
 */
export async function clearSupabaseAuthState(storeId: string): Promise<void> {
  const cleanStoreId = storeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  sessionMemoryStore.delete(cleanStoreId);

  if (supabase) {
    try {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .delete()
        .eq('store_id', cleanStoreId);

      if (error) {
        console.warn(`[SupabaseAuthState] Session flush note for ${cleanStoreId}: ${error.message}`);
      } else {
        console.log(`[SupabaseAuthState] Purged PostgreSQL session for store: ${cleanStoreId}`);
      }
    } catch (err: any) {
      console.error(`[SupabaseAuthState] Error flushing session from Supabase:`, err);
    }
  }
}
