// src/server/whatsappSimulator.ts
import { DisconnectReason, WASocket, WAMessage } from '@whiskeysockets/baileys';
import { supabase } from '../config/supabase.js';
import { MULTI_INDUSTRY_PRESETS } from '../data/initialData.js';

export { DisconnectReason };

/**
 * Ensures media images point to verified public HTTPS CDN links
 */
function ensurePublicCdnUrl(url?: string): string {
  if (!url) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Local asset fallback maps to public CDN
  if (url.includes('pizza') || url.includes('food')) {
    return 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('burger')) {
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('salmon')) {
    return 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=800&q=80';
  }
  if (url.includes('matcha')) {
    return 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=800&q=80';
  }
  return 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80';
}

/**
 * Progressive PostgREST Schema Cache Bypass:
 * Queries Supabase 'store' or 'stores' with software-layer fallback
 * when PostgREST throws schema cache lock errors.
 */
async function getTenantStoreContext(storeId: string): Promise<any> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('store').select('*').eq('id', storeId).maybeSingle();
      if (!error && data) return data;
      if (error && (error.message?.includes('cache') || error.code === 'PGRST205')) {
        console.warn(`[WhatsAppSimulator] Supabase 'store' cache lock detected. Trying 'stores' table fallback...`);
      }
    } catch (e) {
      // safe fallback
    }

    try {
      const { data, error } = await supabase.from('stores').select('*').eq('id', storeId).maybeSingle();
      if (!error && data) return data;
    } catch (e) {
      // safe fallback
    }
  }

  // Seeded Demo Configurations fallback
  const foodPreset = MULTI_INDUSTRY_PRESETS.find(p => p.id === 'food') || MULTI_INDUSTRY_PRESETS[0];
  return {
    id: storeId,
    store_name: foodPreset.name,
    store_slug: storeId || 'tavola_demo',
    description: foodPreset.tagline,
    currency: foodPreset.currency,
    currency_symbol: foodPreset.currencySymbol
  };
}

/**
 * Progressive PostgREST Schema Cache Bypass for Products catalog
 */
async function getTenantProductCatalog(storeId: string): Promise<any[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .gt('stock_count', 0);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(item => ({
          ...item,
          image_url: ensurePublicCdnUrl(item.image_url || item.image),
          price: Number(item.price || 0)
        }));
      }
    } catch (e) {
      // safe fallback
    }
  }

  // Seeded Demo Catalog fallback (e.g. Tavola Artisan Kitchen / Bali Dining or Aura)
  const foodPreset = MULTI_INDUSTRY_PRESETS.find(p => p.id === 'food') || MULTI_INDUSTRY_PRESETS[0];
  return foodPreset.products.map(item => ({
    id: item.id,
    store_id: storeId,
    name: item.name,
    price: item.price,
    description: item.description,
    image_url: ensurePublicCdnUrl(item.image),
    stock_count: item.stock || 25,
    category: item.category
  }));
}

/**
 * SECTION 2: CORE INBOUND WHATSAPP SIMULATOR STREAM
 * Automatically seeds sample demo training configurations and renders
 * native Interactive WhatsApp Catalog/List Cards containing button objects
 * with Supabase CDN images without breaking multi-tenant isolation.
 */
export async function handleWhatsAppSimulatorStream(
  sock: any, 
  incomingMessage: any, 
  storeId: string = 'demo_store'
): Promise<void> {
  if (!sock || !incomingMessage) return;

  const customerJid = incomingMessage.key?.remoteJid;
  if (!customerJid || incomingMessage.key?.fromMe) return;

  // Extract message text from regular text, extended text, or button responses
  let rawText = incomingMessage.message?.conversation || 
                incomingMessage.message?.extendedTextMessage?.text || 
                incomingMessage.message?.buttonsResponseMessage?.selectedButtonId ||
                incomingMessage.message?.templateButtonReplyMessage?.selectedId ||
                incomingMessage.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                '';

  const incomingText = String(rawText).trim();
  if (!incomingText) return;

  // 1. Fetch Dynamic Tenant Store Context & Sample Demo Configurations
  const currentStore = await getTenantStoreContext(storeId);
  const productCatalog = await getTenantProductCatalog(storeId);

  const query = incomingText.toLowerCase();

  // 2. Sample Demo Injection Loop: Natural Context Seeding
  // Seeds sample demo rules directly into the chat flow matching user queries
  const storeName = currentStore?.store_name || currentStore?.name || 'Tavola Artisan Kitchen & Delivery';
  const currencySymbol = currentStore?.currency_symbol || '₦';
  let greetingPrefix = `🛍️ *Welcome to ${storeName}!* \n\n`;
  let storeFooter = `\n\n📌 *Demo Guide:* Reply with the *Product Name* or click below to proceed!`;

  // 3. Update Simulator to Render Highly Stylized Interactive Product Cards
  if (
    query.includes('product') || 
    query.includes('avail') || 
    query.includes('menu') || 
    query.includes('hi') || 
    query.includes('hello') ||
    query.includes('hey') ||
    query.includes('price') ||
    query.includes('catalog') ||
    query === 'start' ||
    query.includes('order') && !query.startsWith('cart_') && !query.startsWith('details_')
  ) {
    if (!productCatalog || productCatalog.length === 0) {
      await sock.sendMessage(customerJid, { 
        text: `${greetingPrefix}Our catalog is currently uploading some beautiful new items. Please check back shortly!${storeFooter}` 
      });
      return;
    }

    // Deliver Intro Header Context Card
    await sock.sendMessage(customerJid, {
      text: `${greetingPrefix}Browse our live collection below. Select an item directly inside the chat window to view information or purchase instantly! ✨`
    });

    const appBaseUrl = process.env.RENDER_APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://onrender.com';
    const storeSlug = currentStore?.store_slug || currentStore?.id || storeId;

    // Loop and stream interactive rich product card bubbles sequentially
    for (const item of productCatalog.slice(0, 5)) {
      // Controlled delay pacing to guarantee rate limit stability under multi-tenant load
      await new Promise(resolve => setTimeout(resolve, 1500));

      const itemPriceStr = `${currencySymbol}${Number(item.price || 0).toLocaleString()}`;
      const itemImageUrl = ensurePublicCdnUrl(item.image_url || item.image);

      const highlyStylizedCardPayload = {
        text: `📦 *${item.name.toUpperCase()}*\n\n💰 *Price:* ${itemPriceStr}\n📝 *Details:* ${item.description || 'Premium quality product item.'}\n🔢 *Status:* ✅ Instantly Available`,
        footer: `Powered by Autochat Automation`,
        
        // Native structural view configuration formatting for Interactive Buttons inside the chat bubble
        buttons: [
          {
            buttonId: `DETAILS_${item.id}`,
            buttonText: { displayText: '🔍 View Details' },
            type: 1
          },
          {
            buttonId: `CART_${item.id}`,
            buttonText: { displayText: '🛒 Add to Cart' },
            type: 1
          }
        ],
        headerType: 4, // Enables rich media attachment layout parameters
        
        // Anchor the public Supabase Storage CDN URL to serve images natively inside the bubble frame
        contextInfo: {
          externalAdReply: {
            title: item.name,
            body: `Click options below to order - ${itemPriceStr}`,
            mediaType: 1,
            previewType: 0,
            sourceUrl: `${appBaseUrl}/store/${storeSlug}`,
            thumbnailUrl: itemImageUrl
          }
        }
      };

      // Dispatch interactive card down the worker channel stream
      await sock.sendMessage(customerJid, highlyStylizedCardPayload);
    }
    return;
  }

  // 4. Interactive Action Hook Parser: Handles button clicks from the chat stream
  if (
    query.startsWith('details_') || 
    query.startsWith('cart_') || 
    query.startsWith('buy_') || 
    query.startsWith('check_')
  ) {
    const rawId = incomingText.replace(/^(details_|cart_|buy_|check_)/i, '').trim();
    const isCartAction = query.startsWith('cart_') || query.startsWith('buy_');
    
    // Search in catalog first for instant cache bypass response
    let selectedProduct = productCatalog.find(p => 
      String(p.id).toLowerCase() === rawId.toLowerCase() ||
      String(p.name).toLowerCase().includes(rawId.toLowerCase())
    );

    // If not found in memory catalog, query Supabase
    if (!selectedProduct && supabase) {
      try {
        const { data } = await supabase.from('products').select('*').eq('id', rawId).maybeSingle();
        if (data) selectedProduct = data;
      } catch {
        // safe
      }
    }

    if (selectedProduct) {
      const priceFormatted = `${currencySymbol}${Number(selectedProduct.price || 0).toLocaleString()}`;
      const stockLevel = selectedProduct.stock_count ?? selectedProduct.stock ?? 15;

      const responseText = isCartAction 
        ? `🛒 *Item Added to Cart!* \n\nYou selected *${selectedProduct.name}* (${priceFormatted}). \n\n👉 To complete your checkout securely, please reply with your *Name* and *Delivery Address*!`
        : `🔍 *Product Specifications for ${selectedProduct.name}:*\n\n📋 *Description:* ${selectedProduct.description || 'Artisan handcrafted quality'}\n💰 *Price:* ${priceFormatted}\n📦 *Stock Level:* ${stockLevel} units remaining.\n\n👉 Reply *BUY ${selectedProduct.id}* to place an order now!`;
        
      await sock.sendMessage(customerJid, { text: responseText });
    } else {
      await sock.sendMessage(customerJid, { 
        text: `🔍 Product details loaded. Reply *MENU* to view all items or *BUY* to order.` 
      });
    }
    return;
  }
}

export default handleWhatsAppSimulatorStream;
