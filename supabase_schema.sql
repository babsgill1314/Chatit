-- =========================================================================
-- PRINCIPAL ARCHITECTURE: SUPABASE POSTGRESQL SCHEMA FOR WHATSAPP STORE SAAS
-- =========================================================================

-- 1. WHATSAPP SESSIONS TABLE (PostgreSQL Auth State Persistence - No Local JSON)
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
    store_id TEXT PRIMARY KEY,
    phone_number TEXT,
    verified_name TEXT,
    auth_method TEXT DEFAULT 'PAIRING_CODE' CHECK (auth_method IN ('QR', 'PAIRING_CODE')),
    connection_status TEXT DEFAULT 'DISCONNECTED' CHECK (connection_status IN ('INITIALIZING', 'QR_RECEIVED', 'PAIRING_CODE_RECEIVED', 'CONNECTING', 'CONNECTED', 'DISCONNECTED')),
    creds_serialized TEXT,
    keys_serialized TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_phone ON public.whatsapp_sessions(phone_number);

-- 2. STORES TABLE (Multi-Tenant Relational Isolation)
CREATE TABLE IF NOT EXISTS public.stores (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT DEFAULT 'fashion',
    owner_id TEXT,
    currency TEXT DEFAULT 'USD',
    currency_symbol TEXT DEFAULT '$',
    whatsapp_phone TEXT,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PRODUCTS TABLE (Direct Supabase CDN Image Storage)
CREATE TABLE IF NOT EXISTS public.products (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    original_price NUMERIC,
    stock INTEGER DEFAULT 10,
    image_url TEXT NOT NULL,
    images JSONB DEFAULT '[]'::jsonb,
    category TEXT,
    featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);

-- 4. ORDERS TABLE (Automated Inbound Dialogue Fulfillment)
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    total NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    items JSONB DEFAULT '[]'::jsonb,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'unpaid',
    delivery_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(customer_phone);

-- 5. SUPABASE CLOUD STORAGE BUCKET SETUP (Render Ephemeral Storage Bypass)
-- Execute within Supabase SQL Editor:
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-catalog-media', 'product-catalog-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public Storage Policy: Read access for all shoppers & WhatsApp clients
CREATE POLICY "Public Catalog Media Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'product-catalog-media');

-- Authenticated Storage Policy: Store owners can upload product graphics
CREATE POLICY "Store Owners Media Upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'product-catalog-media');

-- 6. CONTACTS TABLE (Non-Blocking Background Batch Ingestion)
CREATE TABLE IF NOT EXISTS public.contacts (
    store_id TEXT NOT NULL,
    jid TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Unknown Contact',
    phone TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (store_id, jid)
);

CREATE INDEX IF NOT EXISTS idx_contacts_store_id ON public.contacts(store_id);

-- 7. 30-DAY MARKETING CAMPAIGNS TABLE (Viral Acquisition Growth Engine)
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id TEXT PRIMARY KEY,
    store_id TEXT NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    scheduled_day INTEGER NOT NULL,
    theme TEXT,
    message_body TEXT NOT NULL,
    cta_url TEXT,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_store ON public.marketing_campaigns(store_id, scheduled_day);

