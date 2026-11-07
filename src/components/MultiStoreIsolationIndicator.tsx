import React from 'react';
import { ShieldCheck, Database, Building2, Store, Lock, CheckCircle2, ChevronDown, Layers } from 'lucide-react';
import { StoreInfo, BusinessIndustry } from '../types';

interface MultiStoreIsolationIndicatorProps {
  currentTenantId: string;
  currentStoreName: string;
  currentIndustry?: BusinessIndustry | string;
  stores: StoreInfo[];
  activeStoreId: string;
  onSwitchStore: (storeId: string) => void;
  recordStats?: {
    contactsCount: number;
    ordersCount: number;
    productsCount: number;
  };
  variant?: 'banner' | 'compact' | 'header';
}

export const MultiStoreIsolationIndicator: React.FC<MultiStoreIsolationIndicatorProps> = ({
  currentTenantId,
  currentStoreName,
  currentIndustry = 'fashion',
  stores,
  activeStoreId,
  onSwitchStore,
  recordStats,
  variant = 'banner'
}) => {
  const activeStore = stores.find(s => s.id === activeStoreId) || {
    id: currentTenantId,
    name: currentStoreName,
    industry: currentIndustry,
    role: 'Primary Store'
  };

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-900 text-white rounded-xl text-xs border border-slate-700 shadow-2xs font-sans">
        <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px] tracking-wide">ISOLATION ACTIVE</span>
        </div>
        <div className="h-3 w-px bg-slate-700" />
        <span className="text-slate-300 font-medium truncate max-w-[120px]">
          {activeStore.name}
        </span>
        <span className="font-mono text-[10px] bg-slate-800 text-emerald-300 px-1.5 py-0.5 rounded border border-slate-700">
          {currentTenantId}
        </span>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 text-white border border-emerald-500/30 rounded-2xl p-3.5 sm:p-4 shadow-sm">
      {/* Background ambient badge glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        {/* Left: Security Isolation Confirmation */}
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-inner">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Multi-Store Isolation Enforced</span>
              </span>
              <span className="text-[11px] text-emerald-400/90 font-mono flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Zero Cross-Tenant Leakage</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                Active Tenant Context: <span className="text-emerald-300">{activeStore.name}</span>
              </h3>
              <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/80">
                Key: {currentTenantId}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 mt-0.5">
              All contacts, CRM leads, and customer chat histories below are strictly partitioned and accessible solely to this store profile.
            </p>
          </div>
        </div>

        {/* Right: Quick Store Switcher & Partition Stats */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
          {recordStats && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-[11px] font-mono text-slate-300">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                <strong className="text-white">{recordStats.contactsCount}</strong> Contacts •{' '}
                <strong className="text-white">{recordStats.ordersCount}</strong> Orders
              </span>
            </div>
          )}

          {/* Store Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1.5 shadow-inner">
            <Store className="w-3.5 h-3.5 text-emerald-400" />
            <select
              value={activeStoreId}
              onChange={(e) => onSwitchStore(e.target.value)}
              className="bg-transparent text-white text-xs font-semibold focus:outline-none cursor-pointer pr-1"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                  {s.name} ({s.id === currentTenantId ? 'Active Partition' : s.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
