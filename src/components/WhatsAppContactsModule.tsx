import React, { useState } from 'react';
import { 
  Users, RefreshCw, Plus, Search, Filter, Phone, MessageSquare, 
  CheckCircle2, AlertCircle, ExternalLink, Trash2, Edit3, Smartphone,
  Download, ShieldCheck, Tag, DollarSign, Clock, ArrowRight, UserCheck
} from 'lucide-react';
import { WhatsAppContact, StoreInfo, BusinessIndustry } from '../types';
import { whatsAppClient } from '../services/whatsappClient';
import { MultiStoreIsolationIndicator } from './MultiStoreIsolationIndicator';

interface WhatsAppContactsModuleProps {
  currentTenantId: string;
  storeName: string;
  industry: BusinessIndustry;
  stores: StoreInfo[];
  activeStoreId: string;
  onSwitchStore: (storeId: string) => void;
  contacts: WhatsAppContact[];
  setContacts: React.Dispatch<React.SetStateAction<WhatsAppContact[]>>;
  isWhatsAppConnected: boolean;
  connectedPhone?: string;
  onSelectContactForChat?: (phone: string, name: string) => void;
  onToast: (msg: string) => void;
}

export const WhatsAppContactsModule: React.FC<WhatsAppContactsModuleProps> = ({
  currentTenantId,
  storeName,
  industry,
  stores,
  activeStoreId,
  onSwitchStore,
  contacts,
  setContacts,
  isWhatsAppConnected,
  connectedPhone,
  onSelectContactForChat,
  onToast
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<'all' | 'lead' | 'qualified' | 'customer' | 'vip'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ count: number; source: string; time: string } | null>(null);

  // New Contact Form State
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStage, setNewStage] = useState<'lead' | 'qualified' | 'customer' | 'vip'>('lead');

  // Trigger Sync from WhatsApp Business API provider
  const handleSyncContacts = async () => {
    setIsSyncing(true);
    try {
      const res = await whatsAppClient.syncContacts(currentTenantId, industry);
      if (res.success && Array.isArray(res.contacts)) {
        setContacts(res.contacts);
        const count = res.syncedCount || res.contacts.length;
        setLastSyncResult({
          count,
          source: res.source || 'WhatsApp Business API Provider',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        onToast(`✅ Successfully fetched & synced ${count} WhatsApp Business contacts for ${storeName}!`);
      }
    } catch (err: any) {
      onToast(`Sync notice: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Add a manual contact to this store
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      onToast('Please enter both contact name and phone number.');
      return;
    }

    try {
      const payload = {
        name: newName.trim(),
        phone: newPhone.trim(),
        email: newEmail.trim() || undefined,
        notes: newNotes.trim() || 'Added manually to store contact book.',
        stage: newStage,
        tags: ['manual_contact', industry]
      };

      const res = await whatsAppClient.addContact(currentTenantId, payload);
      if (res.success && res.contact) {
        setContacts(prev => {
          const exists = prev.some(c => c.phone === res.contact.phone);
          if (exists) {
            return prev.map(c => c.phone === res.contact.phone ? res.contact : c);
          }
          return [res.contact, ...prev];
        });
        onToast(`Contact "${newName}" added to ${storeName}.`);
        setNewName('');
        setNewPhone('');
        setNewEmail('');
        setNewNotes('');
        setShowAddModal(false);
      }
    } catch (err: any) {
      onToast(`Error adding contact: ${err.message}`);
    }
  };

  // Delete a contact
  const handleDeleteContact = async (phone: string, name: string) => {
    if (!confirm(`Remove ${name} (${phone}) from ${storeName}'s contacts?`)) return;
    try {
      await whatsAppClient.deleteContact(currentTenantId, phone);
      setContacts(prev => prev.filter(c => c.phone !== phone));
      onToast(`Removed contact ${name}.`);
    } catch (err: any) {
      onToast(`Error deleting contact: ${err.message}`);
    }
  };

  // Filter contacts by search query & stage
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = 
      contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.phone.includes(searchQuery) ||
      (contact.notes && contact.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStage = selectedStage === 'all' || contact.stage === selectedStage;

    return matchesSearch && matchesStage;
  });

  const getStageBadgeColor = (stage: string) => {
    switch (stage) {
      case 'vip': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'customer': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'qualified': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* 1. Multi-Store Isolation Context Banner */}
      <MultiStoreIsolationIndicator
        currentTenantId={currentTenantId}
        currentStoreName={storeName}
        currentIndustry={industry}
        stores={stores}
        activeStoreId={activeStoreId}
        onSwitchStore={onSwitchStore}
        recordStats={{
          contactsCount: contacts.length,
          ordersCount: 0,
          productsCount: 0
        }}
      />

      {/* 2. Contacts Action & Provider Sync Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">
              WhatsApp Business Contacts Module
            </h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full font-mono">
              {contacts.length} Contacts Synced
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Synchronizes contact names and phone numbers directly from the linked WhatsApp Business API provider for{' '}
            <strong className="text-slate-800">{storeName}</strong>.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* WhatsApp Sync Button */}
          <button
            type="button"
            onClick={handleSyncContacts}
            disabled={isSyncing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Contacts...' : 'Sync from WhatsApp API'}</span>
          </button>

          {/* Add Contact Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* 3. Provider Connection Status & Sync Feedback */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 shadow-2xs">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
            isWhatsAppConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
              WhatsApp Account Link
            </span>
            <span className="text-xs font-bold text-slate-900">
              {isWhatsAppConnected ? `Linked: ${connectedPhone || 'WABA Active'}` : 'Not Linked Yet (Simulated Sync Active)'}
            </span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
              Store Isolated Contacts
            </span>
            <span className="text-xs font-bold text-slate-900 font-mono">
              {contacts.length} Partitioned Numbers
            </span>
          </div>
        </div>

        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center gap-3 shadow-2xs">
          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block font-mono">
              Last Provider Sync
            </span>
            <span className="text-xs font-bold text-slate-900">
              {lastSyncResult ? `${lastSyncResult.count} contacts @ ${lastSyncResult.time}` : 'Auto-Sync Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Filter & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl shadow-2xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search contacts by name, WhatsApp number (+234...), or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Stage Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'vip', 'customer', 'qualified', 'lead'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setSelectedStage(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors cursor-pointer ${
                selectedStage === st
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Contacts Table / List */}
      <div className="border border-slate-200 rounded-2xl bg-white shadow-2xs overflow-hidden">
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-slate-900">No Contacts Found in this Store Partition</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click <strong className="text-emerald-700">"Sync from WhatsApp API"</strong> above to fetch contact names and phone numbers from your WhatsApp account into {storeName}.
            </p>
            <button
              onClick={handleSyncContacts}
              disabled={isSyncing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Fetch &amp; Sync WhatsApp Contacts Now</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-[11px] uppercase font-mono">
                <tr>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">WhatsApp Phone</th>
                  <th className="py-3 px-4">Store Isolation</th>
                  <th className="py-3 px-4">Lifecycle Stage</th>
                  <th className="py-3 px-4">Total Spend</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id || contact.phone} className="hover:bg-slate-50/70 transition-colors">
                    {/* Contact Name & Initials */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 border border-emerald-200">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 block leading-tight">
                            {contact.name}
                          </span>
                          {contact.notes && (
                            <span className="text-[10px] text-slate-400 block truncate max-w-[200px]" title={contact.notes}>
                              {contact.notes}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* WhatsApp Phone */}
                    <td className="py-3 px-4">
                      <a
                        href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                        title="Click to open in WhatsApp"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{contact.phone}</span>
                      </a>
                    </td>

                    {/* Store Isolation Partition */}
                    <td className="py-3 px-4">
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-medium">
                        {currentTenantId}
                      </span>
                    </td>

                    {/* Lifecycle Stage */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase font-mono ${getStageBadgeColor(contact.stage)}`}>
                        {contact.stage}
                      </span>
                    </td>

                    {/* Total Spend */}
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                      ${contact.totalSpend || 0}
                    </td>

                    {/* Source */}
                    <td className="py-3 px-4">
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {contact.source === 'whatsapp_api' ? 'WhatsApp API' : contact.source || 'Synced'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onSelectContactForChat && (
                          <button
                            type="button"
                            onClick={() => onSelectContactForChat(contact.phone, contact.name)}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Chat in Live Phone Simulator"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(contact.phone, contact.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900">Add Contact to {storeName}</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddContact} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Elena Vance"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">WhatsApp Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +234 803 123 4567 or +1 415 890 2341"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  placeholder="client@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Lifecycle Stage</label>
                <select
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="lead">Lead (Inquired)</option>
                  <option value="qualified">Qualified Shopper</option>
                  <option value="customer">Customer (Has Purchased)</option>
                  <option value="vip">VIP Buyer</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Prefers linen shirts, inquired via WhatsApp link"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
