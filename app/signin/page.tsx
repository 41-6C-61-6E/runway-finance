'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Lock, Mail, Eye, EyeOff, KeyRound, Users2, ChevronDown } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Sharing join mode
  const [isSharingJoin, setIsSharingJoin] = useState(false);
  const [sharingEmail, setSharingEmail] = useState('');
  const [sharingPin, setSharingPin] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const join = params.get('join');
    const email = params.get('email');
    const pinVal = params.get('pin');

    if (mode === 'register' || mode === 'join' || join === 'true') {
      setIsLogin(false);
    }
    if (mode === 'join' || join === 'true') {
      setIsSharingJoin(true);
      if (email) setSharingEmail(email);
      if (pinVal) setSharingPin(pinVal);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (isLogin) {
        const result = await signIn('credentials', {
          username,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Invalid username or password');
        } else {
          router.push('/');
        }
      } else {
        const body: Record<string, string> = { username, password };
        if (email) body.email = email;
        if (pin) body.pin = pin;

        // Sharing join: pass sharingEmail + sharingPin instead of standard registration PIN
        if (isSharingJoin) {
          body.sharingEmail = sharingEmail.trim();
          body.sharingPin = sharingPin.trim();
        }

        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const result = await signIn('credentials', {
            username,
            password,
            redirect: false,
          });
          if (result?.error) {
            setError('Registration successful but login failed');
          } else {
            router.push('/');
          }
        } else {
          const errorData = await response.json();
          setError(errorData.message || 'Registration failed');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleForm = () => {
    setIsLogin(!isLogin);
    setIsSharingJoin(false);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-5">


          <div className="text-center">
            {isLogin ? (
              <h1 className="text-xl font-bold text-foreground">Sign In</h1>
            ) : (
              <>
                <h1 className="text-xl font-bold text-foreground">
                  {isSharingJoin ? 'Join a shared account' : 'Create account'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSharingJoin
                    ? 'You have been invited to share a financial account'
                    : 'Start managing your finances'}
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-destructive text-xs">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Username */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="Username"
                required
              />
            </div>

            {/* Password */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Lock className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                placeholder="Password"
                required
                minLength={6}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>

            {/* Standard registration fields */}
            {!isLogin && !isSharingJoin && (
              <>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Email (optional)"
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    id="pin"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Registration PIN (if required)"
                  />
                  <p className="mt-1 text-xs text-muted-foreground pl-10">
                    Enter the registration PIN provided by your administrator
                  </p>
                </div>
              </>
            )}

            {/* Sharing join fields */}
            {!isLogin && isSharingJoin && (
              <>
                <div className="p-3 bg-primary/8 border border-primary/20 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    Enter the <strong className="text-foreground">email address the invitation was sent to</strong> and the{' '}
                    <strong className="text-foreground">8-digit PIN</strong> shared with you by the account owner.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    type="email"
                    id="sharingEmail"
                    value={sharingEmail}
                    onChange={(e) => setSharingEmail(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="Invitation email address"
                    required={isSharingJoin}
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <KeyRound className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    id="sharingPin"
                    value={sharingPin}
                    onChange={(e) => setSharingPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full pl-10 pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                    placeholder="8-digit PIN"
                    maxLength={8}
                    required={isSharingJoin}
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground font-semibold py-2.5 px-4 rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isLogin ? 'Signing in...' : isSharingJoin ? 'Joining account...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign In' : isSharingJoin ? 'Join Shared Account' : 'Create Account'
              )}
            </button>
          </form>

          {/* Toggle login/register */}
          <div className="text-center space-y-2">
            <button
              onClick={toggleForm}
              className="text-sm text-primary hover:text-primary/80 font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </button>

            {/* Sharing join toggle (only on register mode) */}
            {!isLogin && (
              <div>
                <button
                  onClick={() => {
                    setIsSharingJoin(!isSharingJoin);
                    setError('');
                  }}
                  className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isSharingJoin ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                      Create a new account instead
                    </>
                  ) : (
                    <>
                      <Users2 className="w-3.5 h-3.5" />
                      I have a sharing invitation
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
