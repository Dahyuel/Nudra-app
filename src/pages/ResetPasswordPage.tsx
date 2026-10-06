import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ArrowRight, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const isSetup = searchParams.get('setup') === '1';
  const organizationSlug = searchParams.get('org');
  const organizationQuery = organizationSlug ? `?org=${encodeURIComponent(organizationSlug)}` : '';
  const requestLink = `/forgot-password${organizationQuery}`;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      const loginParams = new URLSearchParams({ reset: '1' });
      if (organizationSlug) loginParams.set('org', organizationSlug);
      if (isSetup) loginParams.set('setup', '1');
      navigate(`/login?${loginParams.toString()}`, { replace: true });
    } catch (err: any) {
      setError(
        !err?.response
          ? "Can't reach the Nudra server. Make sure the backend is running, then try again."
          : err.response.data?.message || 'Could not reset your password. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors';

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4 sm:p-6 animate-in fade-in duration-200">
      <Link to="/" className="mb-8 group flex items-center justify-center gap-3">
        <img src="/favicon.png" alt="Nudra" className="h-14 w-14 object-contain" />
        <img src="/nudra-text-logo.png" alt="Nudra" className="h-16 w-auto" />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-md space-y-6">
        {!token ? (
          <div className="text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
            <h1 className="text-xl font-black text-[#1B1B1B]">Reset link is missing</h1>
            <p className="text-xs text-[#6B7280]">Open the link from your email again, or request a new one.</p>
            <Link to={requestLink} className="inline-block text-xs font-bold text-[#2D6A4F] hover:underline">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">{isSetup ? 'Create your instructor password' : 'Choose a new password'}</h1>
              <p className="text-xs text-[#6B7280]">
                At least 8 characters with upper and lower case letters and a number. {isSetup ? 'After setting this password, sign in once; Nudra will require one final password change before opening your instructor account.' : "You'll be signed out on other devices."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { label: 'New Password', value: password, set: setPassword },
                { label: 'Confirm New Password', value: confirm, set: setConfirm },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    {f.label}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}

              {error && (
                <div className="text-center space-y-1">
                  <p className="text-xs font-semibold text-red-600">{error}</p>
                  {/expired|invalid/i.test(error) && (
                    <Link to={requestLink} className="text-xs font-bold text-[#2D6A4F] hover:underline">
                      Request a new link
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{isSubmitting ? 'Saving...' : isSetup ? 'Create password' : 'Set new password'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
