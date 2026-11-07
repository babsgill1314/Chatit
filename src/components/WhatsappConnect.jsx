import React, { useState, useEffect } from 'react';
import { 
  Smartphone, QrCode, ShieldCheck, CheckCheck, 
  RotateCw, RefreshCw, Send, AlertCircle, Copy, Check 
} from 'lucide-react';
import { io } from 'socket.io-client';

/**
 * SECTION 2: FRONTEND DESIGN POLISH (WhatsappConnect.jsx)
 * Ensures that the frontend panel tracking the whatsapp_status table / socket values 
 * matches the rounded card system, rendering pill selectors dynamically based on the 
 * real-time socket message pipeline.
 */
export const getStatusBadgeClass = (currentStatus) => {
  switch(currentStatus) {
    case 'CONNECTED': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'INITIALIZING': 
    case 'CONNECTING':
    case 'PAIRING_CODE_RECEIVED':
    case 'QR_RECEIVED':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    default: return 'bg-rose-100 text-rose-800 border-rose-300';
  }
};

export const WhatsappConnect = ({
  tenantId = 'store_aura_main',
  initialStatus = 'DISCONNECTED',
  connectedPhone = '',
  onStatusChange,
  onToast
}) => {
  const [status, setStatus] = useState(initialStatus);
  const [phoneInput, setPhoneInput] = useState(connectedPhone || '');
  const [pairingCode, setPairingCode] = useState(null);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [authMethod, setAuthMethod] = useState('PAIRING_CODE');

  // Sync with prop
  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus);
    }
  }, [initialStatus]);

  // Connect to live Socket.io room for real-time reactive sync without page refresh
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10
    });

    socket.emit('join_tenant', tenantId);

    socket.on('connection_status', (data) => {
      if (!data || (data.tenantId && data.tenantId !== tenantId)) return;
      console.log(`[WhatsappConnect] Status update received:`, data.status);
      setStatus(data.status);
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.qrCode) setQrCodeData(data.qrCode);
      if (data.status === 'CONNECTED' && data.phone) {
        setPhoneInput(data.phone);
      }
      if (onStatusChange) onStatusChange(data.status, data.phone);
    });

    socket.on('pairing_code', (data) => {
      if (!data || (data.tenantId && data.tenantId !== tenantId)) return;
      setPairingCode(data.code);
      setStatus('PAIRING_CODE_RECEIVED');
      setIsLoading(false);
    });

    socket.on('qr_code', (data) => {
      if (!data || (data.tenantId && data.tenantId !== tenantId)) return;
      setQrCodeData(data.qrDataUrl || data.qr);
      setStatus('QR_RECEIVED');
      setIsLoading(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, onStatusChange]);

  const handleRequestPairingCode = async (e) => {
    if (e) e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      if (onToast) onToast('Please enter a valid phone number with country code (e.g. +234...)');
      return;
    }

    setIsLoading(true);
    setPairingCode(null);
    try {
      const resp = await fetch('/api/whatsapp/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          authMethod: 'PAIRING_CODE',
          phoneNumber: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`
        })
      });
      const res = await resp.json();
      if (res.pairingCode) {
        setPairingCode(res.pairingCode);
        setStatus('PAIRING_CODE_RECEIVED');
        if (onToast) onToast('Official WhatsApp pairing code generated! Enter it in your WhatsApp app.');
      }
    } catch (err) {
      console.error('Pairing error:', err);
      if (onToast) onToast('Failed to generate pairing code. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode.replace(/-/g, ''));
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    if (onToast) onToast('Pairing code copied to clipboard!');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
      {/* SECTION 2 REQUIRED TARGET STATUS INDICATOR */}
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${getStatusBadgeClass(status)}`}>
        <span className="h-2.5 w-2.5 rounded-full bg-current animate-pulse"></span>
        <p className="text-sm font-semibold">
          WhatsApp Profile Status: {status === 'CONNECTED' ? 'Online & Synchronized' : 'Offline - Device Unlinked'}
        </p>
      </div>

      {status === 'CONNECTED' ? (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm">WhatsApp Device Linked &amp; Operational</h4>
              <p className="text-xs text-slate-600">
                Connected Phone: <span className="font-mono font-bold text-emerald-800">{phoneInput || 'Synchronized'}</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your store is streaming catalog cards, processing interactive orders, and synchronizing contacts in real-time.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Link WhatsApp Account</h3>
              <p className="text-xs text-slate-500">
                Generate an official 8-digit Pairing Code or scan QR code directly from your WhatsApp mobile app.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAuthMethod('PAIRING_CODE')}
                className={`px-3 py-1.5 rounded-lg transition-all ${authMethod === 'PAIRING_CODE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Pairing Code
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('QR')}
                className={`px-3 py-1.5 rounded-lg transition-all ${authMethod === 'QR' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                QR Code
              </button>
            </div>
          </div>

          {authMethod === 'PAIRING_CODE' ? (
            <form onSubmit={handleRequestPairingCode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phone Number (with Country Code):
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    required
                    placeholder="+2348012345678"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !phoneInput.trim()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    {isLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                    <span>Get Pairing Code</span>
                  </button>
                </div>
              </div>

              {pairingCode && (
                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                      Enter this code in WhatsApp:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 py-2 bg-white rounded-xl border border-emerald-200">
                    {pairingCode.split('').map((char, i) => (
                      <span
                        key={i}
                        className={`font-mono text-xl font-extrabold ${char === '-' ? 'text-slate-400 px-1' : 'w-8 h-10 flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg text-slate-900 shadow-xs'}`}
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                  <ol className="text-[11px] text-slate-600 list-decimal pl-4 space-y-1">
                    <li>Open <strong>WhatsApp</strong> on your phone.</li>
                    <li>Tap <strong>Settings / Three Dots → Linked Devices</strong>.</li>
                    <li>Tap <strong>Link a Device</strong>, then tap <strong>Link with phone number instead</strong>.</li>
                    <li>Type the 8-character code displayed above.</li>
                  </ol>
                </div>
              )}
            </form>
          ) : (
            <div className="text-center py-4 space-y-3">
              {qrCodeData ? (
                <div className="inline-block p-3 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <img src={qrCodeData} alt="WhatsApp QR Code" className="w-52 h-52 mx-auto rounded-lg" />
                </div>
              ) : (
                <div className="w-52 h-52 mx-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 p-4">
                  <QrCode className="w-10 h-10 mb-2 stroke-[1.5]" />
                  <span className="text-xs font-medium">Click below to generate WhatsApp Web QR</span>
                </div>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => handleRequestPairingCode()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{qrCodeData ? 'Refresh QR Code' : 'Generate Real QR Code'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsappConnect;
