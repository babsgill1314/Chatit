-- ============================================================================
-- SQL DDL: Multi-Tenant WhatsApp Session Storage
-- Target Database: PostgreSQL 14+ / Cloud SQL Compatible
-- File: src/db/schema.sql
-- ============================================================================

-- 1. Create custom ENUM types for session state tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_method_enum') THEN
        CREATE TYPE auth_method_enum AS ENUM ('QR', 'PAIRING_CODE');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_status_enum') THEN
        CREATE TYPE connection_status_enum AS ENUM ('INITIALIZING', 'CONNECTED', 'DISCONNECTED');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'disconnect_category_enum') THEN
        CREATE TYPE disconnect_category_enum AS ENUM ('TRANSIENT_DROPOUT', 'HARD_LOGOUT', 'USER_REQUESTED', 'UNKNOWN');
    END IF;
END$$;

-- 2. Create the whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL UNIQUE,
    phone_number VARCHAR(64),
    auth_method auth_method_enum NOT NULL DEFAULT 'QR',
    connection_status connection_status_enum NOT NULL DEFAULT 'INITIALIZING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Production credentials and operational metadata
    storage_path VARCHAR(255) NOT NULL,
    last_disconnect_reason VARCHAR(255),
    last_disconnect_category disconnect_category_enum,
    reconnect_attempts INT NOT NULL DEFAULT 0,
    last_active_at TIMESTAMP WITH TIME ZONE,
    pairing_code VARCHAR(16),
    pairing_expires_at TIMESTAMP WITH TIME ZONE,
    qr_expires_at TIMESTAMP WITH TIME ZONE
);

-- 3. Production indexes for rapid tenant lookups and status filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_user_id ON whatsapp_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_status ON whatsapp_sessions (connection_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON whatsapp_sessions (phone_number);

-- 4. Trigger to automatically keep updated_at current on any row update
CREATE OR REPLACE FUNCTION update_whatsapp_sessions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER trg_whatsapp_sessions_updated_at
    BEFORE UPDATE ON whatsapp_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_sessions_timestamp();
