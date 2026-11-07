import React, { useState, useEffect } from 'react';
import { 
  X, Store, ArrowRight, Lock, Mail, Building, Check, 
  AlertCircle, Eye, EyeOff, Loader2, KeyRound, Globe, Phone
} from 'lucide-react';
import { AuthUser, BusinessIndustry, StoredUserAccount, AuthProvidersConfig, PlanTier } from '../types';
import { INITIAL_STORED_ACCOUNTS, INITIAL_AUTH_PROVIDERS } from '../data/initialData';
import { 
  syncUserProfile,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  isSuperAdminEmail
} from '../services/supabaseService';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register' | 'google';
  authProviders?: AuthProvidersConfig;
  onClose: () => void;
  onAuthenticate: (user: AuthUser) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ 
  isOpen, 
  initialMode = 'login',
  authProviders = INITIAL_AUTH_PROVIDERS,
  onClose, 
  onAuthenticate 
}) => {
  const [view, setView] = useState<'login' | 'signup'>(initialMode === 'register' ? 'signup' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  // Sign In Form States
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Sign Up Form States
  const [companyEmail, setCompanyEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [signupPassword, setSignupPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [subscribeNewsletter, setSubscribeNewsletter] = useState(true);

  // Fast Email Code Verification State
  const [signupStyle, setSignupStyle] = useState<'simple' | 'detailed'>('simple');
  const [simpleSignupStep, setSimpleSignupStep] = useState<'email' | 'code'>('email');
  const [simpleEmail, setSimpleEmail] = useState('');
  const [simplePassword, setSimplePassword] = useState('');
  const [simpleCodeInput, setSimpleCodeInput] = useState('');
  const [generatedSimpleCode, setGeneratedSimpleCode] = useState<string | null>(null);
  const [simpleCountdown, setSimpleCountdown] = useState(60);

  // Feedback Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Countdown timer for email verification code
  useEffect(() => {
    let timer: any;
    if (simpleSignupStep === 'code' && simpleCountdown > 0) {
      timer = setInterval(() => {
        setSimpleCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [simpleSignupStep, simpleCountdown]);

  useEffect(() => {
    if (initialMode === 'register') {
      setView('signup');
    } else {
      setView('login');
    }
  }, [initialMode]);

  if (!isOpen) return null;

  // Retrieve stored accounts from localStorage or initialData
  const getStoredAccounts = (): StoredUserAccount[] => {
    try {
      const saved = localStorage.getItem('omnichat_accounts');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_STORED_ACCOUNTS;
  };

  const saveStoredAccounts = (accounts: StoredUserAccount[]) => {
    try {
      localStorage.setItem('omnichat_accounts', JSON.stringify(accounts));
    } catch {
      // ignore
    }
  };

  const persistSessionAndAuthenticate = (user: AuthUser) => {
    try {
      localStorage.setItem('omnichat_session', JSON.stringify(user));
    } catch {
      // ignore
    }
    onAuthenticate(user);
    onClose();
  };

  // Real Firebase Google Auth with Cloud Firestore Persistence
  const handleGoogleAuth = async () => {
    setErrorMessage(null);
    setGoogleLoading(true);

    try {
      await loginWithGoogle();
      setSuccessMessage('Redirecting to Google Authentication via Supabase...');
    } catch (popupErr: any) {
      console.warn('Google authentication note:', popupErr);
      if (popupErr.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Google Sign-In was cancelled.');
      } else {
        setErrorMessage(popupErr.message || 'Failed to authenticate with Google. You can sign in using your email and password.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Real Email Login (Firebase Auth + Fullstack Backend Account Fallback)
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const email = loginIdentifier.trim();
    if (!email || !loginPassword) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const { user, profile } = await loginWithEmail(email, loginPassword);
      const isSuperAdmin = isSuperAdminEmail(user.email || profile?.email);
      const authUser: AuthUser = {
        id: user.uid,
        name: user.displayName || profile?.name || email.split('@')[0],
        email: user.email || profile?.email || email,
        role: isSuperAdmin ? 'superadmin' : 'merchant',
        businessName: (profile as any)?.storeName || (profile as any)?.businessName || `${profile?.name || 'My'} Store`,
        industry: ((profile as any)?.industry as BusinessIndustry) || 'fashion',
        planTier: ((profile as any)?.planTier as PlanTier) || 'starter'
      };
      setSuccessMessage('Signed in successfully! Loading your store...');
      setTimeout(() => {
        persistSessionAndAuthenticate(authUser);
      }, 350);
    } catch (err: any) {
      console.warn('Login error:', err);
      const msg = err?.message || '';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || msg.includes('not found') || msg.includes('Invalid password')) {
        setErrorMessage('Invalid email or password. If you do not have an account, click "Create an account" below.');
      } else if (err.code === 'auth/invalid-email' || msg.includes('valid email')) {
        setErrorMessage('Please enter a valid email address.');
      } else {
        setErrorMessage(msg || 'Login failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Real Sign Up Submit (Firebase Auth + Fullstack Backend Store Account Fallback)
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const email = companyEmail.trim();
    if (!email || !firstName.trim() || !signupPassword) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (signupPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    if (!agreeTerms) {
      setErrorMessage('Please accept the Terms and Conditions to proceed.');
      return;
    }

    setIsLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const storeName = companyName.trim() || `${fullName}'s Store`;
      const result = await registerWithEmail(email, signupPassword, fullName, storeName, 'fashion', country);
      const isSuperAdmin = isSuperAdminEmail(result.profile?.email || email);
      const authUser: AuthUser = {
        id: result.profile?.id || result.user.uid,
        name: result.profile?.name || fullName,
        email: result.profile?.email || email,
        role: isSuperAdmin ? 'superadmin' : 'merchant',
        businessName: result.profile?.businessName || storeName,
        industry: result.profile?.industry || 'fashion',
        planTier: result.profile?.planTier || 'starter'
      };

      setSuccessMessage('Account registered successfully! Launching your private store...');
      setTimeout(() => {
        persistSessionAndAuthenticate(authUser);
      }, 400);
    } catch (err: any) {
      console.warn('Registration error:', err);
      const msg = err?.message || '';
      if (err.code === 'auth/email-already-in-use' || msg.includes('already exists')) {
        setErrorMessage('An account with this email already exists. Please log in.');
      } else if (err.code === 'auth/weak-password' || msg.includes('at least 6 characters')) {
        setErrorMessage('Password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email' || msg.includes('valid email')) {
        setErrorMessage('Please enter a valid email address.');
      } else if (err.code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        setErrorMessage('Email/Password provider is disabled in Firebase console. Please sign up with Google or enable Email/Password in Firebase Console.');
      } else {
        setErrorMessage(msg || 'Registration failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Real Fast Registration
  const handleSimpleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = simpleEmail.trim();
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!simplePassword || simplePassword.length < 6) {
      setErrorMessage('Please enter a password with at least 6 characters.');
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);

    const defaultName = email.split('@')[0];
    try {
      const result = await registerWithEmail(email, simplePassword, defaultName, `${defaultName}'s Store`, 'fashion');
      const isSuperAdmin = isSuperAdminEmail(result.profile?.email || email);
      const authUser: AuthUser = {
        id: result.profile?.id || result.user.uid,
        name: result.profile?.name || defaultName,
        email: result.profile?.email || email,
        role: isSuperAdmin ? 'superadmin' : 'merchant',
        businessName: result.profile?.businessName || `${defaultName}'s Store`,
        industry: result.profile?.industry || 'fashion',
        planTier: result.profile?.planTier || 'starter'
      };
      setSuccessMessage('Welcome! Your private store has been created.');
      setTimeout(() => {
        persistSessionAndAuthenticate(authUser);
      }, 400);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use' || err?.message?.includes('already exists')) {
        // Try logging in with the provided password
        try {
          const { user, profile } = await loginWithEmail(email, simplePassword);
          const isSuperAdmin = isSuperAdminEmail(user.email || profile?.email);
          const authUser: AuthUser = {
            id: user.uid,
            name: user.displayName || defaultName,
            email: user.email || profile?.email || email,
            role: isSuperAdmin ? 'superadmin' : 'merchant',
            businessName: (profile as any)?.storeName || (profile as any)?.businessName || `${user.displayName || 'My'} Store`,
            industry: ((profile as any)?.industry as BusinessIndustry) || 'fashion',
            planTier: ((profile as any)?.planTier as PlanTier) || 'starter'
          };
          persistSessionAndAuthenticate(authUser);
          return;
        } catch {
          setErrorMessage('An account with this email already exists. Please enter your existing password or click "Sign in".');
        }
      } else if (err.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
        setErrorMessage('Email/Password provider is disabled in Firebase console. Please sign up with Google or enable Email/Password in Firebase Console.');
      } else {
        setErrorMessage(err.message || 'Registration failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200 flex flex-col relative max-h-[94vh]">
        {/* Close Button */}
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8 overflow-y-auto chat-scrollbar space-y-5">
          {/* Brand Wordmark (Infobip style) */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-xs">
              <Store className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 text-sm tracking-tight">
              OmniChat Commerce
            </span>
          </div>

          {/* Alert Messages */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-700 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="flex-1 leading-relaxed">{successMessage}</span>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 1: LOG IN TO YOUR ACCOUNT (Infobip Style Sample 1)  */}
          {/* ========================================================= */}
          {view === 'login' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                  Log in to your account
                </h2>
                <p className="text-xs text-slate-500 mt-1.5">
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setView('signup');
                      setErrorMessage(null);
                    }}
                    className="font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                  >
                    Create an account
                  </button>
                </p>
              </div>

              {/* Login Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Email or username
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter email or username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                  />
                  <div className="text-right mt-1">
                    <button
                      type="button"
                      onClick={() => setErrorMessage('Please enter your registered email address.')}
                      className="text-[11px] text-slate-500 hover:text-orange-600 font-medium underline cursor-pointer"
                    >
                      Forgot username
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter your password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Big Orange Continue Button (Infobip style) */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <span>CONTINUE</span>
                  )}
                </button>
              </form>

              {/* OR Divider (Infobip style) */}
              <div className="relative flex items-center justify-center py-2">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] text-slate-400 font-bold uppercase tracking-wider absolute">
                  OR
                </span>
              </div>

              {/* Social Login Buttons (Infobip style Stacked) */}
              <div className="space-y-2.5">
                {/* 1. Login with Google */}
                <button
                  type="button"
                  disabled={googleLoading}
                  onClick={handleGoogleAuth}
                  className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  )}
                  <span>{googleLoading ? 'Connecting to Google...' : 'Login with Google'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ========================================================= */}
          {/* VIEW 2: SIGN UP FOR FREE                                  */}
          {/* ========================================================= */}
          {view === 'signup' && (
            <div className="space-y-4">
              {signupStyle === 'simple' ? (
                /* 1-CLICK VERIFICATION SIGNUP */
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                      Sign up for free
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Create your private WhatsApp store account powered by Supabase Authentication
                    </p>
                  </div>

                  <form onSubmit={handleSimpleRegister} className="space-y-4 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1.5">
                        Email address
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={simpleEmail}
                        onChange={(e) => setSimpleEmail(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-medium"
                      />
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1.5">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="At least 6 characters"
                        value={simplePassword}
                        onChange={(e) => setSimplePassword(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-medium"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !simpleEmail.trim() || !simplePassword.trim()}
                      className="w-full py-3 bg-[#0F7A66] hover:bg-[#0c6353] text-white rounded-full text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-sm"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto text-white" />
                      ) : (
                        <span>Create Free Store Account</span>
                      )}
                    </button>

                    {/* Clean Divider */}
                    <div className="relative flex items-center justify-center py-1">
                      <div className="border-t border-slate-200 w-full" />
                      <span className="bg-white px-3 text-xs text-slate-400 font-normal absolute">
                        or
                      </span>
                    </div>

                    {/* Continue with Google */}
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={handleGoogleAuth}
                      className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-full text-xs font-semibold text-slate-800 flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {googleLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      ) : (
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                      )}
                      <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
                    </button>

                    {/* Footer Switch */}
                    <div className="pt-2 text-center space-y-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            setView('login');
                            setErrorMessage(null);
                          }}
                          className="text-xs text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
                        >
                          Already have an account? Sign in
                        </button>
                      </div>

                      <div>
                        <button
                          type="button"
                          onClick={() => setSignupStyle('detailed')}
                          className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
                        >
                          Need corporate profile setup? Full registration form →
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              ) : (
                /* DETAILED BUSINESS SIGNUP */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-950 tracking-tight">
                        Sign up for free
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Your clients, your communication, our platform.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSignupStyle('simple')}
                      className="text-xs font-bold text-emerald-700 underline cursor-pointer"
                    >
                      ← Simple Sign up
                    </button>
                  </div>

                  <form onSubmit={handleSignupSubmit} className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Company / Store email</label>
                      <input
                        type="email"
                        required
                        placeholder="name@business.com"
                        value={companyEmail}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">First name</label>
                        <input
                          type="text"
                          required
                          placeholder="First name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Last name</label>
                        <input
                          type="text"
                          placeholder="Last name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Country</label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-semibold cursor-pointer"
                      >
                        <option value="Nigeria">Nigeria 🇳🇬 (+234)</option>
                        <option value="Ghana">Ghana 🇬🇭 (+233)</option>
                        <option value="Kenya">Kenya 🇰🇪 (+254)</option>
                        <option value="South Africa">South Africa 🇿🇦 (+27)</option>
                        <option value="United Kingdom">United Kingdom 🇬🇧 (+44)</option>
                        <option value="United States">United States 🇺🇸 (+1)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Password</label>
                      <input
                        type="password"
                        required
                        placeholder="At least 6 characters"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3 bg-[#0F7A66] hover:bg-[#0c6353] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs mt-2"
                    >
                      {isLoading ? 'Creating Account...' : 'START FREE TRIAL'}
                    </button>

                    {/* Divider */}
                    <div className="relative flex items-center justify-center py-1">
                      <div className="border-t border-slate-200 w-full" />
                      <span className="bg-white px-3 text-xs text-slate-400 font-normal absolute">
                        or
                      </span>
                    </div>

                    {/* Continue with Google */}
                    <button
                      type="button"
                      disabled={googleLoading}
                      onClick={handleGoogleAuth}
                      className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      {googleLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                      ) : (
                        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                      )}
                      <span>{googleLoading ? 'Connecting...' : 'Sign up with Google'}</span>
                    </button>

                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setView('login');
                          setErrorMessage(null);
                        }}
                        className="text-xs text-slate-700 hover:text-slate-900 font-semibold cursor-pointer underline"
                      >
                        Already have an account? Sign in
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
