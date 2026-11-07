// components/WhatsAppSimulator.js
import { DisconnectReason } from '@whiskeysockets/baileys';
import { supabase } from '../config/supabase.js';

export { DisconnectReason };

/**
 * SECTION 2: WHATSAPP SIMULATOR REFACTOR (INTERACTIVE PRODUCT CARDS)
 * Core inbound message listener engine (WhatsAppSimulator).
 * Combines context from the merchant's database layout, seeds the system's
 * sample demo training configurations naturally into the dialogue, and constructs
 * native Interactive WhatsApp Catalog/List Cards containing button objects.
 */
export async function handleWhatsAppSimulatorStream(sock, incomingMessage, storeId) {
    if (!sock || !incomingMessage) return;

    const customerJid = incomingMessage.key?.remoteJid;
    const incomingText = incomingMessage.message?.conversation || 
                         incomingMessage.message?.extendedTextMessage?.text || 
                         incomingMessage.message?.buttonsResponseMessage?.selectedButtonId ||
                         incomingMessage.message?.templateButtonReplyMessage?.selectedId ||
                         incomingMessage.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
                         "";
    
    if (!incomingText || incomingMessage.key?.fromMe) return;

    // 1. Fetch Dynamic Tenant Store Context & Sample Demo Configurations
    let currentStore = null;
    let productCatalog = [];

    try {
        if (supabase) {
            const { data: storeData, error: storeErr } = await supabase.from('store').select('*').eq('id', storeId).single();
            if (!storeErr && storeData) {
                currentStore = storeData;
            } else {
                // Progressive cache bypass: try 'stores' table or software-layer schema
                const { data: storesData } = await supabase.from('stores').select('*').eq('id', storeId).single();
                if (storesData) currentStore = storesData;
            }

            const { data: prodsData, error: prodsErr } = await supabase.from('products').select('*').eq('store_id', storeId).gt('stock_count', 0);
            if (!prodsErr && Array.isArray(prodsData) && prodsData.length > 0) {
                productCatalog = prodsData;
            }
        }
    } catch (cacheErr) {
        console.warn("⚠️ PostgREST Cache Lock Handled. Using software-layer demo seed context...", cacheErr?.message);
    }

    // Default Seeded Demo Store Context & Catalog Fallback if DB table cache is unavailable
    if (!currentStore) {
        currentStore = {
            id: storeId || 'store_demo_main',
            store_name: 'Tavola Artisan Kitchen & Delivery',
            store_slug: storeId || 'tavola_dining',
            currency_symbol: '₦'
        };
    }

    if (!productCatalog || productCatalog.length === 0) {
        productCatalog = [
            {
                id: 'prod_pizza_01',
                name: 'San Marzano Truffle Burrata Pizza',
                price: 24000,
                description: '48-hour fermented sourdough crust, San Marzano D.O.P. tomatoes, fresh Puglia burrata, and black summer truffle oil.',
                image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
                stock_count: 45
            },
            {
                id: 'prod_burger_02',
                name: 'Wagyu Smash Double Cheeseburger',
                price: 19000,
                description: 'Prime Australian Wagyu beef smashed thin on a griddle, aged cave cheddar, caramelized shallots, brioche bun.',
                image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
                stock_count: 30
            },
            {
                id: 'prod_matcha_03',
                name: 'Ceremonial Uji Matcha Cold Brew',
                price: 7500,
                description: 'Stone-ground first harvest Kyoto matcha whisked over chilled oat milk and Madagascar vanilla bean syrup.',
                image_url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=800&q=80',
                stock_count: 60
            }
        ];
    }

    const query = incomingText.toLowerCase();

    // 2. Sample Demo Injection Loop: Natural Context Seeding
    // This seeds the sample demo rules directly into the chat flow matching user queries
    let greetingPrefix = `🛍️ *Welcome to ${currentStore?.store_name || 'Our Premium'} Store Hub!* \n\n`;
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
        query === 'start'
    ) {
        if (!productCatalog || productCatalog.length === 0) {
            await sock.sendMessage(customerJid, { text: `${greetingPrefix}Our catalog is currently uploading some beautiful new items. Please check back shortly!${storeFooter}` });
            return;
        }

        // Deliver Intro Header Context Card
        await sock.sendMessage(customerJid, {
            text: `${greetingPrefix}Browse our live collection below. Select an item directly inside the chat window to view information or purchase instantly! ✨`
        });

        // Loop and stream interactive rich product card bubbles sequentially
        for (const item of productCatalog) {
            // Controlled delay pacing to guarantee rate limit stability under multi-tenant load
            await new Promise(resolve => setTimeout(resolve, 2000));

            const formattedPrice = `₦${Number(item.price || 0).toLocaleString()}`;
            const renderUrl = process.env.RENDER_APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://onrender.com';

            const highlyStylizedCardPayload = {
                text: `📦 *${item.name.toUpperCase()}*\n\n💰 *Price:* ${formattedPrice}\n📝 *Details:* ${item.description || 'Premium quality product item.'}\n🔢 *Status:* ✅ Instantly Available`,
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
                        body: `Click options below to order - ${formattedPrice}`,
                        mediaType: 1,
                        previewType: 0,
                        sourceUrl: `${renderUrl}/store/${currentStore?.store_slug || storeId}`,
                        thumbnailUrl: item.image_url || "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80"
                    }
                }
            };

            // Dispatch interactive card down the worker channel stream
            await sock.sendMessage(customerJid, highlyStylizedCardPayload);
        }
        return;
    }

    // 4. Interactive Action Hook Parser: Handles button clicks from the chat stream
    if (query.startsWith('details_') || query.startsWith('cart_') || query.startsWith('buy_') || query.startsWith('check_')) {
        const rawAction = query.startsWith('cart_') || query.startsWith('buy_') ? 'cart' : 'details';
        const productId = incomingText.replace(/^(details_|cart_|buy_|check_)/i, '').trim();
        const isCartAction = rawAction === 'cart';
        
        let selectedProduct = productCatalog.find(p => String(p.id).toLowerCase() === productId.toLowerCase());
        
        if (!selectedProduct && supabase) {
            try {
                const { data } = await supabase.from('products').select('*').eq('id', productId).single();
                if (data) selectedProduct = data;
            } catch {
                // fallback
            }
        }
        
        if (selectedProduct) {
            const formattedPrice = `₦${Number(selectedProduct.price || 0).toLocaleString()}`;
            const responseText = isCartAction 
                ? `🛒 *Item Added to Cart!* \n\nYou selected *${selectedProduct.name}* (${formattedPrice}). \n\n👉 To complete your checkout securely, please reply with your *Name* and *Delivery Address*!`
                : `🔍 *Product Specifications for ${selectedProduct.name}:*\n\n📋 *Description:* ${selectedProduct.description}\n💰 *Price:* ${formattedPrice}\n📦 *Stock Level:* ${selectedProduct.stock_count || 15} units remaining.\n\n👉 Reply *BUY ${selectedProduct.id}* to place an order now!`;
                
            await sock.sendMessage(customerJid, { text: responseText });
        }
        return;
    }
}

export default handleWhatsAppSimulatorStream;
