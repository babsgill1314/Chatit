import fs from 'fs';
import path from 'path';

export type AuthMethod = 'QR' | 'PAIRING_CODE';
export type ConnectionStatus = 'INITIALIZING' | 'CONNECTED' | 'DISCONNECTED';
export type DisconnectCategory = 'TRANSIENT_DROPOUT' | 'HARD_LOGOUT' | 'USER_REQUESTED' | 'UNKNOWN';

export interface WhatsAppSessionRecord {
  id: string;
  user_id: string;
  phone_number: string | null;
  auth_method: AuthMethod;
  connection_status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  storage_path: string;
  last_disconnect_reason?: string | null;
  last_disconnect_category?: DisconnectCategory | null;
  reconnect_attempts: number;
  last_active_at?: string | null;
  pairing_code?: string | null;
  pairing_expires_at?: string | null;
  qr_expires_at?: string | null;
}

class SessionStore {
  private records = new Map<string, WhatsAppSessionRecord>();
  private readonly dbDir = path.resolve(process.cwd(), 'storage', 'database');
  private readonly dbFilePath = path.join(this.dbDir, 'whatsapp_sessions.json');
  private isLoaded = false;

  constructor() {
    this.ensureStorage();
    this.loadFromDisk();
  }

  private ensureStorage(): void {
    if (!fs.existsSync(this.dbDir)) {
      try {
        fs.mkdirSync(this.dbDir, { recursive: true });
      } catch (err) {
        console.error('[SessionStore] Failed to create database directory:', err);
      }
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && item.user_id) {
                this.records.set(item.user_id, item);
              }
            }
          }
        }
      }
      this.isLoaded = true;
    } catch (err) {
      console.error('[SessionStore] Error reading session database file from disk:', err);
      this.isLoaded = true;
    }
  }

  private persistToDisk(): void {
    try {
      this.ensureStorage();
      const all = Array.from(this.records.values());
      const tempPath = `${this.dbFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(all, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err) {
      console.error('[SessionStore] Error writing session database file to disk:', err);
    }
  }

  /**
   * Upsert a whatsapp_sessions record tracking user_id, auth_method, connection_status, etc.
   */
  public async upsertSession(params: {
    userId: string;
    authMethod: AuthMethod;
    phoneNumber?: string | null;
    connectionStatus?: ConnectionStatus;
    storagePath: string;
    pairingCode?: string | null;
    pairingExpiresAt?: string | null;
    qrExpiresAt?: string | null;
  }): Promise<WhatsAppSessionRecord> {
    const now = new Date().toISOString();
    const existing = this.records.get(params.userId);

    const record: WhatsAppSessionRecord = {
      id: existing?.id || `sess_${params.userId}_${Date.now().toString(36)}`,
      user_id: params.userId,
      phone_number: params.phoneNumber !== undefined ? params.phoneNumber : (existing?.phone_number ?? null),
      auth_method: params.authMethod,
      connection_status: params.connectionStatus || existing?.connection_status || 'INITIALIZING',
      created_at: existing?.created_at || now,
      updated_at: now,
      storage_path: params.storagePath,
      last_disconnect_reason: existing?.last_disconnect_reason ?? null,
      last_disconnect_category: existing?.last_disconnect_category ?? null,
      reconnect_attempts: existing?.reconnect_attempts ?? 0,
      last_active_at: existing?.last_active_at ?? null,
      pairing_code: params.pairingCode !== undefined ? params.pairingCode : (existing?.pairing_code ?? null),
      pairing_expires_at: params.pairingExpiresAt !== undefined ? params.pairingExpiresAt : (existing?.pairing_expires_at ?? null),
      qr_expires_at: params.qrExpiresAt !== undefined ? params.qrExpiresAt : (existing?.qr_expires_at ?? null)
    };

    this.records.set(params.userId, record);
    this.persistToDisk();
    return record;
  }

  /**
   * Update status of an existing session
   */
  public async updateSessionStatus(
    userId: string,
    status: ConnectionStatus,
    options?: {
      phoneNumber?: string | null;
      disconnectReason?: string | null;
      disconnectCategory?: DisconnectCategory | null;
      incrementReconnect?: boolean;
      resetReconnect?: boolean;
    }
  ): Promise<WhatsAppSessionRecord | null> {
    const existing = this.records.get(userId);
    const now = new Date().toISOString();

    if (!existing) {
      const storagePath = path.resolve(process.cwd(), 'storage', 'sessions', userId);
      return this.upsertSession({
        userId,
        authMethod: 'QR',
        phoneNumber: options?.phoneNumber,
        connectionStatus: status,
        storagePath
      });
    }

    existing.connection_status = status;
    existing.updated_at = now;

    if (options?.phoneNumber !== undefined) {
      existing.phone_number = options.phoneNumber;
    }

    if (status === 'CONNECTED') {
      existing.last_active_at = now;
      existing.reconnect_attempts = 0;
      existing.pairing_code = null;
      existing.pairing_expires_at = null;
      existing.qr_expires_at = null;
      existing.last_disconnect_reason = null;
      existing.last_disconnect_category = null;
    }

    if (options?.disconnectReason) {
      existing.last_disconnect_reason = options.disconnectReason;
    }

    if (options?.disconnectCategory) {
      existing.last_disconnect_category = options.disconnectCategory;
    }

    if (options?.incrementReconnect) {
      existing.reconnect_attempts = (existing.reconnect_attempts || 0) + 1;
    }

    if (options?.resetReconnect) {
      existing.reconnect_attempts = 0;
    }

    this.records.set(userId, existing);
    this.persistToDisk();
    return existing;
  }

  public async getSession(userId: string): Promise<WhatsAppSessionRecord | null> {
    return this.records.get(userId) || null;
  }

  public async getAllSessions(): Promise<WhatsAppSessionRecord[]> {
    return Array.from(this.records.values());
  }

  public async deleteSession(userId: string): Promise<boolean> {
    const deleted = this.records.delete(userId);
    if (deleted) {
      this.persistToDisk();
    }
    return deleted;
  }
}

export const sessionStore = new SessionStore();
