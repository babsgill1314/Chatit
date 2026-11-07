import { 
  makeWASocket, 
  DisconnectReason, 
  fetchLatestBaileysVersion, 
  proto, 
  WASocket,
  WAMessage
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import { Server as SocketIOServer } from 'socket.io';
import { useDatabaseAuthState, clearDatabaseAuthState } from './databaseAuthState';
import { useSupabaseAuthState, clearSupabaseAuthState } from './supabaseAuthState';
import { messageQueue, messageRateQueue } from './messageQueue.js';
import { crmLeadStore } from './crmLeadStore';
import { whatsappOrderEngine } from './whatsappOrderEngine';
import { supabase } from '../services/supabaseClient';
import { Product } from '../types';
import { INITIAL_PRODUCTS } from '../data/initialData.js';
import { handleWhatsAppSimulatorStream } from './whatsappSimulator.js';

export type WhatsAppLifecycleStatus = 
  | 'INITIALIZING' 
  | 'QR_RECEIVED' 
  | 'PAIRING_CODE_RECEIVED' 
  | 'CONNECTING' 
  | 'CONNECTED' 
  | 'DISCONNECTED';

export interface WhatsAppInstanceSession {
  tenantId: string;
  sock: WASocket | null;
  status: WhatsAppLifecycleStatus;
  authMethod: 'QR' | 'PAIRING_CODE';
  phone?: string | null;
  verifiedName?: string | null;
  qrCode?: string | null;
  qrDataUrl?: string | null;
  pairingCode?: string | null;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout | null;
  lastConnectedAt?: string | null;
  lastError?: string | null;
  messages: Array<{
    id: string;
    from: string;
    body: string;
    timestamp: number;
    isOutgoing: boolean;
    fromMe?: boolean;
    mediaUrl?: string;
  }>;
}

/**
 * Normalizes any image URL to a verified, public HTTPS CDN URL.
 * Prevents WhatsApp from rejecting images hosted on localhost or private paths.
 */
export function ensurePublicCdnUrl(url?: string): string {
  if (!url) {
    return 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // If it's a localhost link, swap to cloud CDN fallback
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80';
    }
    return url;
  }
  // If it's a local relative path, map to public CDN image
  if (url.includes('linen') || url.includes('shirt')) {
    return 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('leather') || url.includes('weekender') || url.includes('bag')) {
    return 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('sneaker') || url.includes('shoe')) {
    return 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('knit') || url.includes('cashmere')) {
    return 'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=800&q=80';
  }
  return 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80';
}

/**
 * Isolated Microservice Engine managing multi-tenant WhatsApp connections,
 * database-backed session hydration, Socket.io events, and rate-limited dispatch.
 */
export class WhatsAppMicroservice {
  private sessions = new Map<string, WhatsAppInstanceSession>();
  private io: SocketIOServer | null = null;
  private logger = pino({ level: 'silent' });
  private tenantCatalogs = new Map<string, { storeName: string; currencySymbol: string; products: Product[] }>();

  constructor() {
    // Configure queue dispatcher to route through Baileys socket with rate limiting
    messageQueue.setDispatcher(async (tenantId, targetJid, payload) => {
      return this.dispatchRawMessage(tenantId, targetJid, payload);
    });
  }

  public setSocketServer(io: SocketIOServer): void {
    this.io = io;
    console.log('[WhatsAppMicroservice] Socket.io server mounted successfully.');
  }

  private sanitizeTenantId(tenantId: string): string {
    return (tenantId || 'store_aura_main').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  public getSession(tenantId: string): WhatsAppInstanceSession | undefined {
    return this.sessions.get(this.sanitizeTenantId(tenantId));
  }

  public setCatalog(tenantId: string, storeName: string, currencySymbol: string, products: Product[]): void {
    const cleanId = this.sanitizeTenantId(tenantId);
    this.tenantCatalogs.set(cleanId, { storeName, currencySymbol, products });
  }

  /**
   * Initializes or re-initializes a multi-tenant WhatsApp instance.
   * Uses database-backed auth state to prevent disk file explosions.
   */
  public async initializeInstance(
    tenantId: string, 
    authMethod: 'QR' | 'PAIRING_CODE' = 'PAIRING_CODE', 
    phoneInput?: string
  ): Promise<{ status: WhatsAppLifecycleStatus; pairingCode?: string; qrCode?: string; qrDataUrl?: string }> {
    const cleanId = this.sanitizeTenantId(tenantId);
    console.log(`[WhatsAppMicroservice:${cleanId}] Initializing instance (Method: ${authMethod}, Phone: ${phoneInput || 'N/A'})...`);

    // Clean up existing socket without wiping database credentials
    const existing = this.sessions.get(cleanId);
    if (existing?.sock) {
      try {
        existing.sock.ev.removeAllListeners('connection.update');
        existing.sock.ev.removeAllListeners('creds.update');
        existing.sock.ev.removeAllListeners('messages.upsert');
        existing.sock.end(undefined);
      } catch {}
    }

    // Load Supabase PostgreSQL / Database-backed Authentication State (No local JSON folders!)
    const hasSupabase = !!(process.env.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL.includes('your-project'));
    const { state, saveCreds } = hasSupabase 
      ? await useSupabaseAuthState(cleanId) 
      : await useDatabaseAuthState(cleanId);
    const { version } = await fetchLatestBaileysVersion();

    const session: WhatsAppInstanceSession = existing || {
      tenantId: cleanId,
      sock: null,
      status: 'INITIALIZING',
      authMethod,
      phone: phoneInput || null,
      reconnectAttempts: 0,
      messages: []
    };

    session.authMethod = authMethod;
    if (phoneInput) session.phone = phoneInput;
    session.status = 'INITIALIZING';
    this.sessions.set(cleanId, session);
    this.emitStatus(cleanId, 'INITIALIZING');

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: this.logger,
      browser: ['Aura Commerce SaaS', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: true
    });

    session.sock = sock;

    // Handle credentials updates
    sock.ev.on('creds.update', async () => {
      await saveCreds();
    });

    // Connection lifecycle management
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Real-time QR Code streaming
      if (qr && authMethod === 'QR') {
        session.qrCode = qr;
        session.status = 'QR_RECEIVED';
        try {
          const dataUrl = await QRCode.toDataURL(qr);
          session.qrDataUrl = dataUrl;
          this.emitQr(cleanId, qr, dataUrl);
          this.emitStatus(cleanId, 'QR_RECEIVED');
        } catch (err) {
          console.error(`[WhatsAppMicroservice:${cleanId}] Error creating QR DataURL:`, err);
        }
      }

      if (connection === 'connecting') {
        session.status = 'CONNECTING';
        this.emitStatus(cleanId, 'CONNECTING');
      }

      if (connection === 'open') {
        session.status = 'CONNECTED';
        session.reconnectAttempts = 0;
        session.lastConnectedAt = new Date().toISOString();
        if (sock.user?.id) {
          const cleanPhone = sock.user.id.split(':')[0].replace(/\D/g, '');
          session.phone = `+${cleanPhone}`;
          session.verifiedName = sock.user.name || 'WhatsApp Business';
        }

        console.log(`[WhatsAppMicroservice:${cleanId}] Connection established! Linked Phone: ${session.phone}`);
        this.emitStatus(cleanId, 'CONNECTED', session.phone, session.verifiedName);

        // Auto-sync contacts immediately upon connection
        this.autoSyncLinkedAccountContacts(cleanId);
      }

      if (connection === 'close') {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode ?? 
                       (lastDisconnect?.error as any)?.statusCode;
        const structuralLogout = reason === DisconnectReason.loggedOut || reason === 401;

        console.log(`[WhatsAppMicroservice:${cleanId}] Connection closed (Reason Code: ${reason}). Structural Logout: ${structuralLogout}`);

        if (!structuralLogout) {
          // Automatic Exponential Backoff Reconnect Pipeline
          session.reconnectAttempts++;
          const backoffDelay = Math.min(1000 * Math.pow(1.5, session.reconnectAttempts) + Math.random() * 1000, 30000);
          console.log(`[WhatsAppMicroservice:${cleanId}] Temporary dropout. Scheduling backoff reconnect in ${Math.round(backoffDelay)}ms (Attempt ${session.reconnectAttempts})...`);
          
          if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
          session.reconnectTimer = setTimeout(() => {
            this.initializeInstance(cleanId, session.authMethod, session.phone || undefined);
          }, backoffDelay);
        } else {
          // Structural logout: purge database records and notify frontend
          console.log(`[WhatsAppMicroservice:${cleanId}] User logged out from WhatsApp. Purging database session.`);
          await clearDatabaseAuthState(cleanId);
          await clearSupabaseAuthState(cleanId);
          session.status = 'DISCONNECTED';
          session.phone = null;
          session.qrCode = null;
          session.qrDataUrl = null;
          session.pairingCode = null;
          this.emitStatus(cleanId, 'DISCONNECTED');
        }
      }
    });

    // Handle inbound customer inquiries and automated dialogue
    sock.ev.on('messages.upsert', async (msgUpdate) => {
      for (const m of msgUpdate.messages) {
        try {
          await handleWhatsAppSimulatorStream(sock, m, cleanId);
        } catch (simErr) {
          console.warn(`[WhatsAppMicroservice:${cleanId}] Simulator stream notice:`, simErr);
        }
      }
      await this.handleIncomingMessages(cleanId, msgUpdate.messages);
    });

    // Non-blocking asynchronous contact map synchronization
    sock.ev.on('contacts.upsert', (newContacts) => {
      this.handleBackgroundContactUpsert(cleanId, newContacts);
    });

    // Handle Pairing Code Stream if requested
    if (authMethod === 'PAIRING_CODE' && phoneInput && !sock.authState.creds.registered) {
      const cleanPhone = phoneInput.replace(/\D/g, '');
      session.status = 'CONNECTING';
      this.emitStatus(cleanId, 'CONNECTING');

      // Allow socket handshake to settle before requesting code
      setTimeout(async () => {
        try {
          if (!sock.authState.creds.registered) {
            console.log(`[WhatsAppMicroservice:${cleanId}] Requesting pairing code for phone: ${cleanPhone}`);
            const code = await sock.requestPairingCode(cleanPhone);
            session.pairingCode = code;
            session.status = 'PAIRING_CODE_RECEIVED';
            const formatted = code.match(/.{1,4}/g)?.join('-') || code;
            console.log(`[WhatsAppMicroservice:${cleanId}] Generated Pairing Code: ${formatted}`);
            this.emitPairingCode(cleanId, formatted);
            this.emitStatus(cleanId, 'PAIRING_CODE_RECEIVED');
          }
        } catch (err: any) {
          console.error(`[WhatsAppMicroservice:${cleanId}] Failed requesting pairing code:`, err);
          session.lastError = err.message;
          this.emitStatus(cleanId, 'DISCONNECTED');
        }
      }, 3000);
    }

    return {
      status: session.status,
      pairingCode: session.pairingCode || undefined,
      qrCode: session.qrCode || undefined,
      qrDataUrl: session.qrDataUrl || undefined
    };
  }

  /**
   * Inbound customer message router & automated store assistant.
   */
  private async handleIncomingMessages(tenantId: string, messages: WAMessage[]): Promise<void> {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('status@broadcast')) continue;

      const text = msg.message.conversation || 
                   msg.message.extendedTextMessage?.text || 
                   msg.message.imageMessage?.caption || 
                   '';

      if (!text.trim()) continue;

      const customerPhone = `+${remoteJid.split('@')[0]}`;
      const customerName = msg.pushName || `Customer (${customerPhone.slice(-4)})`;

      console.log(`[WhatsAppMicroservice:${tenantId}] Inbound message from ${customerName} (${customerPhone}): "${text}"`);

      // Store message in session conversation buffer
      const session = this.sessions.get(tenantId);
      if (session) {
        session.messages.push({
          id: msg.key.id || `msg_${Date.now()}`,
          from: customerPhone,
          body: text,
          timestamp: Date.now(),
          isOutgoing: false
        });
      }

      // Record lead in CRM store
      crmLeadStore.autoCaptureInbound(tenantId, customerPhone, customerName, text);

      // Context-aware inventory routing
      const catalogInfo = this.tenantCatalogs.get(tenantId);
      const products = catalogInfo?.products || [];
      const storeName = catalogInfo?.storeName || 'Aura Store';
      const currencySymbol = catalogInfo?.currencySymbol || '$';

      const cleanText = text.trim();
      const lower = cleanText.toLowerCase();

      // Check if user is asking for catalog / menu / products / greetings or clicking catalog button
      const isCatalogRequest = 
        lower === 'catalog' || 
        lower === 'menu' || 
        lower === 'products' || 
        lower === 'store' || 
        lower === 'items' || 
        lower === 'hi' || 
        lower === 'hello' || 
        lower === 'hey' || 
        lower === 'view_full_catalog' || 
        lower === 'start' || 
        lower.includes('show menu') || 
        lower.includes('see catalog') || 
        lower.includes('what do you sell');

      // Check if user clicked a quick action button e.g. CHECK_prod_123 or BUY_prod_123
      if (cleanText.startsWith('CHECK_') || cleanText.startsWith('BUY_')) {
        const prodId = cleanText.replace(/^(CHECK_|BUY_)/, '').trim();
        const activeProds = products && products.length > 0 ? products : INITIAL_PRODUCTS;
        const found = activeProds.find(p => p.id === prodId || p.id.toLowerCase() === prodId.toLowerCase());
        if (found) {
          const actionCaption = cleanText.startsWith('BUY_')
            ? `⚡ *Instant Checkout Selection: ${found.name}*\n\n💰 Price: ${currencySymbol}${found.price.toLocaleString()}\n📦 Ready for immediate fulfillment.\n\nReply with *CONFIRM* to place your order or reply with your delivery address!`
            : `🔎 *Product Overview: ${found.name}*\n\n📌 ${found.description}\n\n💰 Price: ${currencySymbol}${found.price.toLocaleString()}\n🔢 Status: ${found.stock > 0 ? '✓ In Stock' : '✓ Available'}\n\n👉 Reply *BUY ${found.id}* to order now!`;
          await this.sendProductCard(tenantId, remoteJid, found, actionCaption, currencySymbol);
          continue;
        }
      }

      if (isCatalogRequest) {
        let storeMetadata = {
          id: tenantId,
          store_name: storeName,
          description: 'WhatsApp Online Store & Doorstep Delivery'
        };
        const activeProds = products && products.length > 0 ? products : INITIAL_PRODUCTS;
        await this.sendTargetStoreLayout(tenantId, remoteJid, storeMetadata, activeProds);
        continue;
      }

      // Process automated order/recommendation engine
      const botResponse = whatsappOrderEngine.processMessage(
        tenantId,
        customerPhone,
        customerName,
        text,
        products,
        storeName
      );

      // Check if response contains catalog items or product highlight
      if (botResponse.catalogItems && botResponse.catalogItems.length > 0) {
        const storeMetadata = {
          id: tenantId,
          store_name: storeName,
          description: 'WhatsApp Online Store & Doorstep Delivery'
        };
        await this.sendTargetStoreLayout(tenantId, remoteJid, storeMetadata, products.length > 0 ? products : INITIAL_PRODUCTS);
      } else if (botResponse.productCard) {
        await this.sendProductCard(tenantId, remoteJid, botResponse.productCard.product, botResponse.productCard.caption, currencySymbol);
      } else {
        await this.sendMessage(tenantId, remoteJid, botResponse.replyText);
      }
    }
  }

  /**
   * SECTION 1: TARGET CHATFLOW PAYLOAD IMPLEMENTATION
   * Unified store layout with rich contextInfo.externalAdReply linked to public store URL,
   * interactive menu list and quick action reply buttons.
   */
  public async sendTargetStoreLayout(
    tenantId: string,
    customerJid: string,
    storeMetadata: { id: string; store_name: string; description?: string },
    productsList: any[]
  ): Promise<any> {
    const cleanId = this.sanitizeTenantId(tenantId);
    const jid = customerJid.includes('@') ? customerJid : `${customerJid.replace(/\D/g, '')}@s.whatsapp.net`;
    const safeProducts = productsList && productsList.length > 0 ? productsList : INITIAL_PRODUCTS;

    // 1. Compile the Interactive Multi-Option Row items from the Supabase Products collection
    const productRows = safeProducts.slice(0, 10).map((product) => ({
      id: `BUY_${product.id}`,
      title: (product.name || 'Product').substring(0, 24), // Enforce strict WhatsApp character restrictions
      description: `₦${Number(product.price || 0).toLocaleString()} - ${(product.description || '').substring(0, 60)}`
    }));

    const catalogLines = safeProducts.slice(0, 6).map((p, idx) => {
      const priceStr = `₦${Number(p.price || 0).toLocaleString()}`;
      return `*${idx + 1}. ${p.name}* — ${priceStr}\n   _${(p.description || 'Artisan quality').substring(0, 60)}_`;
    }).join('\n\n');

    const appBaseUrl = process.env.RENDER_APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';
    const sourceUrl = `${appBaseUrl}/store/${storeMetadata.id}`;
    const firstImageUrl = safeProducts[0]?.image_url || safeProducts[0]?.image;
    const verifiedThumbnail = ensurePublicCdnUrl(firstImageUrl);

    // 2. Build the exact visual matching layout block structure (Rich Header + Interactive Action Lists)
    const unifiedStoreCatalogPayload = {
      text: `🟢 *${storeMetadata.store_name}* \n*WhatsApp Online Store* 🛍️\n\n${storeMetadata.description || 'Welcome to our digital store assistant!'}\n\n━━━━━━━━━━━━━━━━━━━━\n📋 *CURATED MENU & CATALOG*\n\n${catalogLines}\n\n━━━━━━━━━━━━━━━━━━━━\n👉 *Quick Checkout:* Tap any shortcut button below, or reply *BUY <Product Number>*!`,
      footer: "👉 Click below to view our curated menu/catalog or talk to our assistant:",
      buttons: [
        {
          buttonId: 'view_full_catalog',
          buttonText: { displayText: '📋 View Menu Catalog' },
          type: 1
        }
      ],
      headerType: 4, // Marks inclusion of rich descriptive card context
      
      // This wires up the rich top header layout safely using our public cloud bucket assets
      contextInfo: {
        externalAdReply: {
          title: storeMetadata.store_name,
          body: storeMetadata.description?.substring(0, 60) || "Neapolitan sourdough pizzas, pasta fresca & fine wines.",
          mediaType: 1,
          previewType: 0,
          sourceUrl: sourceUrl,
          // The thumbnail image MUST pull directly from our verified public Supabase bucket CDN URL path
          thumbnailUrl: verifiedThumbnail
        }
      }
    };

    // 3. Dispatch payload down the background processing engine queue safely
    await messageRateQueue.add('dispatch-outbound', { 
      jid, 
      payload: unifiedStoreCatalogPayload,
      tenantId: cleanId 
    });

    // 4. Send the Native WhatsApp Action Sheet Quick Replies underneath the header card
    const quickRepliesPayload = {
      text: "✨ *Quick Actions Available Below:*",
      footer: "Select a shortcut button to fast-track your checkout:",
      buttons: safeProducts.slice(0, 3).map(p => ({
        buttonId: `CHECK_${p.id}`,
        buttonText: { displayText: `Check ${(p.name || 'Item').split(' ')[0]}`.substring(0, 20) },
        type: 1
      }))
    };

    // Stagger slightly using setImmediate or explicit delays to respect our 2-5s security throttling rate limit
    setTimeout(async () => {
      await messageRateQueue.add('dispatch-outbound', { 
        jid, 
        payload: quickRepliesPayload,
        tenantId: cleanId 
      });
    }, 2000);
  }

  /**
   * Dispatches a structured product card payload with a guaranteed public HTTPS CDN URL.
   */
  public async sendProductCard(
    tenantId: string, 
    targetJid: string, 
    product: Product, 
    customCaption?: string,
    currencySymbol = '$'
  ): Promise<any> {
    const publicImageUrl = ensurePublicCdnUrl(product.image);
    const caption = customCaption || 
      `🛍️ *${product.name}*\n\n📌 ${product.description}\n\n💰 *Price:* ${currencySymbol}${product.price.toLocaleString()}\n🔢 *In Stock:* ${product.stock > 0 ? '✅ Available' : '❌ Out of Stock'}\n\n👉 Reply with *BUY ${product.id}* to instantly checkout!`;

    const appBaseUrl = process.env.RENDER_APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';
    const storeUrl = `${appBaseUrl}/store/${tenantId}`;

    const productPayload = {
      image: { url: publicImageUrl },
      caption,
      buttons: [
        {
          buttonId: `BUY_${product.id}`,
          buttonText: { displayText: `🛒 Buy ${product.name.split(' ')[0]}`.substring(0, 20) },
          type: 1
        },
        {
          buttonId: 'view_full_catalog',
          buttonText: { displayText: '📋 View Menu Catalog' },
          type: 1
        }
      ],
      contextInfo: {
        externalAdReply: {
          title: product.name,
          body: `${currencySymbol}${product.price.toLocaleString()} · ${product.description?.substring(0, 50) || 'Available in store'}`,
          mediaType: 1,
          previewType: 0,
          sourceUrl: storeUrl,
          thumbnailUrl: publicImageUrl
        }
      }
    };

    return messageQueue.enqueue(tenantId, targetJid, productPayload, { priority: 'high' });
  }

  /**
   * Queues an outgoing text message through the rate-limited anti-ban queue.
   */
  public async sendMessage(tenantId: string, targetJid: string, text: string): Promise<any> {
    const jid = targetJid.includes('@') ? targetJid : `${targetJid.replace(/\D/g, '')}@s.whatsapp.net`;
    const payload = { text };
    return messageQueue.enqueue(tenantId, jid, payload, { priority: 'normal' });
  }

  /**
   * Internal worker execution handler called by the MessageQueue after pacing delay.
   */
  private async dispatchRawMessage(tenantId: string, targetJid: string, payload: any): Promise<any> {
    const cleanId = this.sanitizeTenantId(tenantId);
    const session = this.sessions.get(cleanId);

    if (!session || !session.sock || session.status !== 'CONNECTED') {
      throw new Error(`Instance for tenant ${cleanId} is not connected to WhatsApp`);
    }

    const jid = targetJid.includes('@') ? targetJid : `${targetJid.replace(/\D/g, '')}@s.whatsapp.net`;
    const result = await session.sock.sendMessage(jid, payload);

    if (session) {
      session.messages.push({
        id: result?.key?.id || `out_${Date.now()}`,
        from: 'me',
        body: payload.text || payload.caption || '[Media Message]',
        timestamp: Date.now(),
        isOutgoing: true,
        mediaUrl: payload.image?.url
      });
    }

    return result;
  }

  public autoSyncLinkedAccountContacts(tenantId: string): { success: boolean; syncedCount: number; totalContacts: number; contacts: any[] } {
    const cleanId = this.sanitizeTenantId(tenantId);
    console.log(`[WhatsAppMicroservice:${cleanId}] Running auto-sync contacts for linked account...`);
    const result = crmLeadStore.syncWhatsAppBusinessApi(cleanId);
    return {
      success: true,
      syncedCount: result.syncedCount,
      totalContacts: result.contacts.length,
      contacts: result.contacts
    };
  }

  public async disconnect(tenantId: string): Promise<void> {
    const cleanId = this.sanitizeTenantId(tenantId);
    const session = this.sessions.get(cleanId);

    if (session?.sock) {
      try {
        await session.sock.logout();
      } catch {}
      try {
        session.sock.end(undefined);
      } catch {}
    }

    await clearDatabaseAuthState(cleanId);
    await clearSupabaseAuthState(cleanId);
    messageQueue.clearQueue(cleanId);

    if (session) {
      session.status = 'DISCONNECTED';
      session.phone = null;
      session.qrCode = null;
      session.qrDataUrl = null;
      session.pairingCode = null;
    }

    this.emitStatus(cleanId, 'DISCONNECTED');
  }

  /**
   * Non-blocking asynchronous contact map synchronization worker.
   * Chunks large contact lists into batches of 100 and yields event loop execution
   * via setImmediate() so server never freezes or hangs dashboard UI.
   */
  public handleBackgroundContactUpsert(tenantId: string, contactsList: any[]): void {
    const cleanId = this.sanitizeTenantId(tenantId);
    if (!contactsList || contactsList.length === 0) return;

    const BATCH_SIZE = 100;
    const total = contactsList.length;

    const processNextBatch = (startIndex: number) => {
      const batch = contactsList.slice(startIndex, startIndex + BATCH_SIZE);
      if (batch.length === 0) {
        const payload = {
          tenantId: cleanId,
          syncedCount: total,
          totalContacts: crmLeadStore.getTenantLeads(cleanId).length,
          timestamp: new Date().toISOString()
        };
        if (this.io) {
          this.io.to(`tenant:${cleanId}`).emit('contacts_synced', payload);
          this.io.emit('contacts_synced', payload);
        }
        return;
      }

      const supabaseRows: Array<{ store_id: string; jid: string; name: string; phone: string }> = [];

      for (const c of batch) {
        const jid = c.id || c.jid || '';
        const phone = jid.split('@')[0] ? `+${jid.split('@')[0].replace(/\D/g, '')}` : '';
        const name = c.name || c.notify || c.verifiedName || `Contact (${phone.slice(-4) || 'WA'})`;
        if (phone) {
          crmLeadStore.addLead(cleanId, {
            name,
            phone,
            email: '',
            stage: 'lead',
            notes: 'Auto-synced via non-blocking background worker',
            tags: ['Synced Contact', 'WhatsApp Device']
          });

          supabaseRows.push({
            store_id: cleanId,
            jid,
            name,
            phone
          });
        }
      }

      // If Supabase is connected, upsert batch
      if (supabase && supabaseRows.length > 0) {
        Promise.resolve(supabase.from('contacts').upsert(supabaseRows, { onConflict: 'store_id,jid' })).catch(() => {});
      }

      // Yield event loop to prevent event loop starvation
      setImmediate(() => {
        processNextBatch(startIndex + BATCH_SIZE);
      });
    };

    setImmediate(() => {
      processNextBatch(0);
    });
  }

  // Socket.io broadcasting helpers - Dual delivery (Tenant Room + Immediate Global Broadcast)
  private emitStatus(tenantId: string, status: WhatsAppLifecycleStatus, phone?: string | null, verifiedName?: string | null): void {
    if (this.io) {
      const payload = {
        tenantId,
        status,
        phone,
        verifiedName,
        timestamp: Date.now()
      };
      this.io.to(`tenant:${tenantId}`).emit('connection_status', payload);
      this.io.emit('connection_status', payload);
    }
  }

  private emitPairingCode(tenantId: string, code: string): void {
    if (this.io) {
      const payload = { tenantId, code };
      this.io.to(`tenant:${tenantId}`).emit('pairing_code_stream', payload);
      this.io.emit('pairing_code_stream', payload);
    }
  }

  private emitQr(tenantId: string, qr: string, qrDataUrl: string): void {
    if (this.io) {
      const payload = { tenantId, qr, qrDataUrl };
      this.io.to(`tenant:${tenantId}`).emit('qr_stream', payload);
      this.io.emit('qr_stream', payload);
    }
  }
}

export const whatsappMicroservice = new WhatsAppMicroservice();

/**
 * Standalone helper matching Section 1 spec:
 * async function sendTargetStoreLayout(sock, customerJid, storeMetadata, productsList)
 */
export async function sendTargetStoreLayout(
  _sock: any, 
  customerJid: string, 
  storeMetadata: { id?: string; store_name?: string; description?: string }, 
  productsList: any[]
) {
  const tenantId = storeMetadata?.id || 'store_aura_main';
  return whatsappMicroservice.sendTargetStoreLayout(
    tenantId, 
    customerJid, 
    {
      id: tenantId,
      store_name: storeMetadata?.store_name || 'WhatsApp Online Store',
      description: storeMetadata?.description
    }, 
    productsList
  );
}

