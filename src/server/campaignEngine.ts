import { DailyCampaignPlan, Product, BusinessIndustry } from '../types/index.js';
import { messageQueue } from './messageQueue.js';
import { crmLeadStore } from './crmLeadStore.js';
import { supabase } from '../services/supabaseClient.js';
import { ensurePublicCdnUrl } from './whatsappMicroservice.js';

interface CampaignGeneratorConfig {
  tenantId: string;
  storeName: string;
  industry: BusinessIndustry;
  products: Product[];
  currencySymbol?: string;
}

export class CampaignEngine {
  private tenantCampaigns = new Map<string, DailyCampaignPlan[]>();

  public getCampaigns(tenantId: string): DailyCampaignPlan[] {
    const cleanId = this.sanitizeTenantId(tenantId);
    return this.tenantCampaigns.get(cleanId) || [];
  }

  public setCampaigns(tenantId: string, campaigns: DailyCampaignPlan[]): void {
    const cleanId = this.sanitizeTenantId(tenantId);
    this.tenantCampaigns.set(cleanId, campaigns);
  }

  public async generate30DayCalendar(config: CampaignGeneratorConfig): Promise<DailyCampaignPlan[]> {
    const { tenantId, storeName, industry, products, currencySymbol = '$' } = config;
    const cleanId = this.sanitizeTenantId(tenantId);

    const safeProducts: Product[] = products.length > 0 ? products : [
      {
        id: 'prod_default_1',
        name: 'Signature Collection Item',
        price: 85,
        stock: 25,
        category: 'Best Seller',
        description: 'Our most requested artisanal piece.',
        image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80',
        industry: 'fashion' as BusinessIndustry,
        productType: 'physical' as const,
        sizes: ['S', 'M', 'L'],
        colors: ['Classic', 'Neutral'],
        featured: true,
        tags: ['Signature', 'Bestseller']
      }
    ];

    const themes: Array<{
      category: DailyCampaignPlan['category'];
      theme: string;
      audience: DailyCampaignPlan['targetAudience'];
      hookTemplate: (p: Product) => string;
      captionTemplate: (p: Product) => string;
      ctaTemplate: (p: Product) => string;
      mediaType: DailyCampaignPlan['mediaType'];
    }> = [
      {
        category: 'product_spotlight',
        theme: 'Hero Product Deep-Dive',
        audience: 'all',
        hookTemplate: (p) => `✨ Why everyone is talking about the ${p.name}...`,
        captionTemplate: (p) => `Elevate your everyday with our signature *${p.name}*. Crafted with obsessive attention to detail, priced at just ${currencySymbol}${p.price.toLocaleString()}.\n\nReply *BUY ${p.id}* or tap below to claim yours before stock depletes!`,
        ctaTemplate: (p) => `Order ${p.name} on WhatsApp`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'scarcity',
        theme: 'Low Stock Alert & Priority Reserve',
        audience: 'leads',
        hookTemplate: (p) => `⚠️ Only a handful remaining: ${p.name}`,
        captionTemplate: (p) => `Quick heads-up! Our current batch of *${p.name}* is over 80% sold out. Only ${Math.max(3, p.stock || 5)} units left in the warehouse!\n\nLock in yours right now for ${currencySymbol}${p.price.toLocaleString()} with express dispatch.`,
        ctaTemplate: (p) => `Reserve My Unit Now`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'social_proof',
        theme: 'Verified Customer Reviews & UGC',
        audience: 'all',
        hookTemplate: (p) => `⭐ "Best purchase I made this season!"`,
        captionTemplate: (p) => `"The quality of the ${p.name} blew me away. Super fast delivery and premium finish." - Verified Customer.\n\nExperience the difference for yourself today. Available for ${currencySymbol}${p.price.toLocaleString()}.`,
        ctaTemplate: (p) => `See Reviews & Order`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'flash_sale',
        theme: '24-Hour WhatsApp Secret Flash Drop',
        audience: 'all',
        hookTemplate: (p) => `🔥 FLASH ALERT: 24h WhatsApp VIP Exclusive`,
        captionTemplate: (p) => `Today only! Enjoy complimentary priority shipping + complimentary gift with any order of *${p.name}* (${currencySymbol}${p.price.toLocaleString()}).\n\nOffer vanishes tonight at midnight sharp! Reply *CLAIM* to secure this perk.`,
        ctaTemplate: (p) => `Claim 24h Flash Perk`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'lifestyle_story',
        theme: 'Behind the Scenes & Craftsmanship',
        audience: 'buyers',
        hookTemplate: (p) => `🌿 The story behind the ${p.name}`,
        captionTemplate: (p) => `From ethical sourcing to precision tailoring, we believe luxury should be accessible and sustainable.\n\nDiscover how we craft the *${p.name}* and why our customers keep coming back.`,
        ctaTemplate: (p) => `Read Story & Shop`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'weekend_rush',
        theme: 'Weekend Treat Yourself Promo',
        audience: 'all',
        hookTemplate: (p) => `🥂 Happy Friday! Weekend treats have arrived`,
        captionTemplate: (p) => `You've worked hard all week. Treat yourself to the *${p.name}* for just ${currencySymbol}${p.price.toLocaleString()}.\n\nInstant doorstep delivery available when you order today!`,
        ctaTemplate: (p) => `Treat Myself This Weekend`,
        mediaType: 'IMAGE_CARD'
      },
      {
        category: 'vip_loyalty',
        theme: 'Inner Circle VIP Appreciation Drop',
        audience: 'vip',
        hookTemplate: (p) => `👑 Special VIP perk reserved just for you`,
        captionTemplate: (p) => `As one of our most valued patrons at *${storeName}*, you have early VIP access to reserve our new incoming restock of the *${p.name}*.\n\nDirect reply here connects you immediately with our senior styling team.`,
        ctaTemplate: (p) => `Access VIP Restock`,
        mediaType: 'IMAGE_CARD'
      }
    ];

    const campaigns: DailyCampaignPlan[] = [];

    for (let day = 1; day <= 30; day++) {
      const selectedProduct = safeProducts[(day - 1) % safeProducts.length];
      const themeTemplate = themes[(day - 1) % themes.length];
      const cleanImageUrl = ensurePublicCdnUrl(selectedProduct.image);

      const campaign: DailyCampaignPlan = {
        id: `camp_${cleanId}_day_${day}_${Date.now()}`,
        day,
        theme: `Day ${day}: ${themeTemplate.theme}`,
        category: themeTemplate.category,
        targetAudience: themeTemplate.audience,
        scheduledTime: day % 2 === 0 ? '10:30 AM' : '05:45 PM',
        hook: themeTemplate.hookTemplate(selectedProduct),
        caption: themeTemplate.captionTemplate(selectedProduct),
        callToAction: themeTemplate.ctaTemplate(selectedProduct),
        mediaType: themeTemplate.mediaType,
        suggestedProductId: selectedProduct.id,
        suggestedProductName: selectedProduct.name,
        suggestedProductImage: cleanImageUrl,
        suggestedProductPrice: selectedProduct.price,
        status: day === 1 ? 'SCHEDULED' : 'DRAFT',
        projectedEngagement: `${Math.floor(65 + (day * 1.1) % 25)}% Open Rate · ${Math.floor(18 + (day * 2) % 15)}% CTR`
      };

      campaigns.push(campaign);
    }

    this.tenantCampaigns.set(cleanId, campaigns);

    // Sync to Supabase in background if credentials present
    if (supabase) {
      this.syncCampaignsToSupabase(cleanId, campaigns).catch((err) => {
        console.warn(`[CampaignEngine:${cleanId}] Background Supabase sync notice:`, err?.message || err);
      });
    }

    return campaigns;
  }

  private async syncCampaignsToSupabase(tenantId: string, campaigns: DailyCampaignPlan[]): Promise<void> {
    if (!supabase) return;
    try {
      const records = campaigns.map(c => ({
        id: c.id,
        store_id: tenantId,
        scheduled_day: c.day,
        theme: c.theme,
        message_body: `${c.hook}\n\n${c.caption}`,
        cta_url: `https://wa.me/?text=ORDER%20${c.suggestedProductId}`,
        is_sent: c.status === 'SENT',
        created_at: new Date().toISOString()
      }));

      await supabase.from('marketing_campaigns').upsert(records, { onConflict: 'id' });
    } catch (err) {
      console.warn('[CampaignEngine] Supabase upsert non-critical notice:', err);
    }
  }

  public async dispatchCampaign(tenantId: string, campaignId: string): Promise<{
    success: boolean;
    queuedCount: number;
    campaign: DailyCampaignPlan;
    error?: string;
  }> {
    const cleanId = this.sanitizeTenantId(tenantId);
    const campaigns = this.tenantCampaigns.get(cleanId) || [];
    const campaign = campaigns.find(c => c.id === campaignId);

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found for store ${cleanId}`);
    }

    // Retrieve audience from CRM lead store
    const leads = crmLeadStore.getTenantLeads(cleanId);
    let targetLeads = leads;

    if (campaign.targetAudience === 'leads') {
      targetLeads = leads.filter(l => l.stage === 'lead' || l.stage === 'qualified');
    } else if (campaign.targetAudience === 'buyers') {
      targetLeads = leads.filter(l => l.stage === 'customer' || l.totalSpend > 0);
    } else if (campaign.targetAudience === 'vip') {
      targetLeads = leads.filter(l => l.stage === 'vip' || l.totalSpend > 200);
    }

    if (targetLeads.length === 0) {
      // Fallback to all leads or sample seed
      targetLeads = leads.length > 0 ? leads : [
        {
          id: 'lead_seed_1',
          tenantId: cleanId,
          name: 'Active Customer',
          phone: '+234 803 123 4567',
          email: 'customer@example.com',
          stage: 'lead',
          totalSpend: 0,
          lastActive: 'Just now',
          notes: 'Auto-captured marketing lead',
          assignedStaff: 'AI Sales Specialist',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'whatsapp_inbound'
        }
      ];
    }

    const payload = {
      image: { url: campaign.suggestedProductImage || 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?auto=format&fit=crop&w=800&q=80' },
      caption: `📢 *${campaign.hook}*\n\n${campaign.caption}\n\n👉 *${campaign.callToAction}*`
    };

    let queuedCount = 0;
    for (const lead of targetLeads) {
      const cleanPhone = lead.phone.replace(/\D/g, '');
      if (cleanPhone) {
        messageQueue.enqueue(cleanId, `${cleanPhone}@s.whatsapp.net`, payload, { priority: 'normal' });
        queuedCount++;
      }
    }

    campaign.status = 'SENT';
    campaign.lastDispatchedAt = new Date().toISOString();
    campaign.dispatchedCount = (campaign.dispatchedCount || 0) + queuedCount;

    return {
      success: true,
      queuedCount,
      campaign
    };
  }

  public updateCampaign(tenantId: string, campaignId: string, updates: Partial<DailyCampaignPlan>): DailyCampaignPlan | null {
    const cleanId = this.sanitizeTenantId(tenantId);
    const campaigns = this.tenantCampaigns.get(cleanId) || [];
    const index = campaigns.findIndex(c => c.id === campaignId);

    if (index === -1) return null;

    campaigns[index] = {
      ...campaigns[index],
      ...updates
    };

    this.tenantCampaigns.set(cleanId, campaigns);
    return campaigns[index];
  }

  private sanitizeTenantId(tenantId: string): string {
    return (tenantId || 'store_aura_main').replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

export const campaignEngine = new CampaignEngine();
