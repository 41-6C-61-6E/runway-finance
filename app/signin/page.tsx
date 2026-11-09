'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { User, Lock, Mail, Eye, EyeOff, KeyRound } from 'lucide-react';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');

    if (mode === 'register') {
      setIsLogin(false);
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
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const body: Record<string, string> = { username, password, timezone: tz };
        if (email) body.email = email;
        if (pin) body.pin = pin;

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
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary font-bold text-xl mb-3 shadow-xs">
            $
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Runway Finance</h1>
          <p className="text-xs text-muted-foreground mt-1">Personal Wealth & FIRE Intelligence</p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-7 space-y-5">
          <div className="text-center">
            {isLogin ? (
              <h2 className="text-xl font-bold text-foreground">Sign In</h2>
            ) : (
              <>
                <h2 className="text-xl font-bold text-foreground">Create account</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start managing your finances
                </p>
              </>
            )}
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-destructive text-xs">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-semibold text-muted-foreground">
                Username
              </label>
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
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder-muted-foreground"
                  placeholder="Password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 min-w-[44px] min-h-[44px] flex items-center justify-center pr-3 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Standard registration fields */}
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs font-semibold text-muted-foreground">
                    Email (optional)
                  </label>
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
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pin" className="text-xs font-semibold text-muted-foreground">
                    Registration PIN (if required)
                  </label>
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
                      placeholder="Registration PIN"
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground pl-1">
                    Enter the registration PIN provided by your administrator
                  </p>
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
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                isLogin ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          {/* Toggle login/register */}
          <div className="text-center">
            <button
              onClick={toggleForm}
              className="min-h-[44px] py-2.5 inline-flex items-center justify-center text-sm text-primary hover:text-primary/80 font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign Up"
                : 'Already have an account? Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
