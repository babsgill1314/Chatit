import React, { useState, useEffect } from 'react';
import { 
  Sparkles, Calendar, Send, CheckCircle2, Clock, 
  Flame, Star, ShieldAlert, HeartHandshake, Eye, ArrowRight,
  TrendingUp, Users, RefreshCw, Layers, Check, Copy, AlertCircle
} from 'lucide-react';
import { DailyCampaignPlan, Product, BusinessIndustry } from '../types';

interface MarketingCampaignEngineProps {
  tenantId: string;
  storeName: string;
  industry: BusinessIndustry;
  products: Product[];
  currencySymbol?: string;
  onToast: (msg: string) => void;
}

export const MarketingCampaignEngine: React.FC<MarketingCampaignEngineProps> = ({
  tenantId,
  storeName,
  industry,
  products,
  currencySymbol = '$',
  onToast
}) => {
  const [campaigns, setCampaigns] = useState<DailyCampaignPlan[]>([]);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [copiedDay, setCopiedDay] = useState<number | null>(null);

  // Fetch or initialize campaigns
  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/v1/campaigns', {
        headers: { 'x-tenant-id': tenantId }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        setCampaigns(data.campaigns);
      } else {
        // Auto-generate initial 30 days
        generateCampaigns();
      }
    } catch {
      generateCampaigns();
    }
  };

  const generateCampaigns = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/v1/campaigns/generate-30day', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        },
        body: JSON.stringify({
          storeName,
          industry,
          products,
          currencySymbol
        })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.campaigns)) {
        setCampaigns(data.campaigns);
        onToast(`🚀 Generated 30-Day Viral AI Marketing Campaign Calendar!`);
      } else {
        throw new Error(data.error || 'Failed generating campaigns');
      }
    } catch (err: any) {
      onToast(`Error generating campaigns: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [tenantId]);

  const activeCampaign = campaigns.find(c => c.day === selectedDay) || campaigns[0];

  const handleDispatch = async (campaignId: string) => {
    setIsDispatching(true);
    try {
      const res = await fetch(`/api/v1/campaigns/${campaignId}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId
        }
      });
      const data = await res.json();
      if (data.success) {
        setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'SENT', lastDispatchedAt: 'Just now', dispatchedCount: data.queuedCount } : c));
        onToast(`✓ Dispatched Day ${activeCampaign?.day} campaign to ${data.queuedCount} targeted customer leads via anti-ban queue!`);
      } else {
        throw new Error(data.error || 'Failed to dispatch');
      }
    } catch (err: any) {
      onToast(`Failed to dispatch: ${err.message}`);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCopyText = (text: string, day: number) => {
    navigator.clipboard.writeText(text);
    setCopiedDay(day);
    setTimeout(() => setCopiedDay(null), 2000);
    onToast('Copied WhatsApp campaign message to clipboard!');
  };

  const filteredCampaigns = filterCategory === 'all' 
    ? campaigns 
    : campaigns.filter(c => c.category === filterCategory);

  const sentCount = campaigns.filter(c => c.status === 'SENT').length;
  const progressPct = Math.round((sentCount / Math.max(1, campaigns.length)) * 100);

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'flash_sale':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200"><Flame className="w-3 h-3 text-rose-500" /> Flash Drop</span>;
      case 'scarcity':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200"><ShieldAlert className="w-3 h-3 text-amber-600" /> Scarcity Alert</span>;
      case 'social_proof':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200"><Star className="w-3 h-3 text-purple-500" /> Social Proof</span>;
      case 'vip_loyalty':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200"><HeartHandshake className="w-3 h-3 text-emerald-600" /> VIP Loyalty</span>;
      case 'weekend_rush':
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200"><TrendingUp className="w-3 h-3 text-indigo-600" /> Weekend Rush</span>;
      default:
        return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200"><Sparkles className="w-3 h-3 text-sky-500" /> Spotlight</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Metric Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-indigo-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 tracking-wide uppercase">
                Growth & Acquisition Engine
              </span>
              <span className="text-xs text-indigo-300">· 30-Day Viral WhatsApp Roadmap</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-400" />
              Automated 30-Day AI Marketing Agent
            </h2>
            <p className="text-xs sm:text-sm text-indigo-200/80 mt-1 max-w-2xl">
              Turn your WhatsApp store into an automated revenue-generating machine. Pre-built psychological hooks, high-converting product cards, and 2-5s anti-ban rate-limited broadcasting.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateCampaigns}
              disabled={isGenerating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>{isGenerating ? 'Regenerating 30 Days...' : 'Regenerate Plan'}</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5 pt-4 border-t border-indigo-900/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <span className="text-[11px] text-indigo-300 block">Total Roadmap</span>
            <span className="text-lg font-bold text-white">{campaigns.length} Days</span>
          </div>
          <div>
            <span className="text-[11px] text-indigo-300 block">Dispatched Campaigns</span>
            <span className="text-lg font-bold text-emerald-400">{sentCount} Sent</span>
          </div>
          <div>
            <span className="text-[11px] text-indigo-300 block">Projected Open Rate</span>
            <span className="text-lg font-bold text-indigo-200">84.2%</span>
          </div>
          <div>
            <span className="text-[11px] text-indigo-300 block">Execution Progress</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-indigo-950/80 rounded-full h-2 overflow-hidden border border-indigo-800/40">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-xs font-mono font-bold text-indigo-200">{progressPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dual Pane: Calendar Grid & Active Campaign Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 30-Day Grid (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                30-Day Campaign Timeline
              </h3>
              <p className="text-xs text-slate-500">Select any day to review copy, featured product, and dispatch to WhatsApp.</p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {['all', 'flash_sale', 'scarcity', 'social_proof', 'vip_loyalty'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                    filterCategory === cat 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All Days' : cat.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* 30-Day Calendar Tiles */}
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredCampaigns.map((camp) => {
              const isSelected = camp.day === selectedDay;
              const isSent = camp.status === 'SENT';

              return (
                <button
                  key={camp.id}
                  onClick={() => setSelectedDay(camp.day)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                    isSelected 
                      ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500/20' 
                      : isSent
                      ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-mono font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-500'}`}>
                      DAY {camp.day}
                    </span>
                    {isSent ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Clock className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 line-clamp-1 leading-tight">
                    {camp.hook.replace(/^[^\w]+/, '').slice(0, 20)}
                  </div>
                  <div className="mt-1 text-[9px] text-slate-400 truncate">
                    {camp.scheduledTime}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Campaign Detail & WhatsApp Bubble Preview (5 cols) */}
        {activeCampaign && (
          <div className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-mono font-bold text-xs flex items-center justify-center">
                  D{activeCampaign.day}
                </span>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm leading-tight">{activeCampaign.theme}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    {getCategoryBadge(activeCampaign.category)}
                    <span className="text-[11px] text-slate-400">Target: <strong className="text-slate-700 capitalize">{activeCampaign.targetAudience}</strong></span>
                  </div>
                </div>
              </div>

              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                activeCampaign.status === 'SENT' 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {activeCampaign.status}
              </span>
            </div>

            {/* Realistic WhatsApp Chat Bubble Mockup */}
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>WhatsApp Message Preview</span>
                <span className="text-[10px] text-emerald-600 font-mono">Rate-Limited Anti-Ban Safe</span>
              </div>

              <div className="bg-[#efeae2] p-3 sm:p-4 rounded-xl border border-slate-200 relative overflow-hidden">
                <div className="max-w-[340px] bg-white rounded-xl shadow-xs overflow-hidden border border-slate-200/80">
                  {/* Media Graphic Card */}
                  {activeCampaign.suggestedProductImage && (
                    <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
                      <img 
                        src={activeCampaign.suggestedProductImage} 
                        alt={activeCampaign.suggestedProductName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs text-white text-[11px] px-2 py-0.5 rounded-md font-bold">
                        {currencySymbol}{activeCampaign.suggestedProductPrice}
                      </div>
                    </div>
                  )}

                  {/* Body Text */}
                  <div className="p-3 text-xs text-slate-800 space-y-2">
                    <p className="font-bold text-slate-900">{activeCampaign.hook}</p>
                    <p className="whitespace-pre-line text-[11px] text-slate-600 leading-relaxed">
                      {activeCampaign.caption}
                    </p>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-700 font-bold">👉 {activeCampaign.callToAction}</span>
                      <span className="text-[10px] text-slate-400">{activeCampaign.scheduledTime}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Projected Metrics */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span className="text-slate-600 font-medium">Projected Engagement:</span>
              </div>
              <span className="font-bold text-slate-900">{activeCampaign.projectedEngagement}</span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => handleDispatch(activeCampaign.id)}
                disabled={isDispatching}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isDispatching ? 'Queueing Messages...' : `Dispatch Day ${activeCampaign.day} Campaign`}</span>
              </button>

              <button
                onClick={() => handleCopyText(`${activeCampaign.hook}\n\n${activeCampaign.caption}`, activeCampaign.day)}
                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Copy Campaign Copy"
              >
                {copiedDay === activeCampaign.day ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
