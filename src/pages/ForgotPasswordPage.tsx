import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, MailCheck } from 'lucide-react';
import api from '../lib/api';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(
        !err?.response
          ? "Can't reach the Nudra server. Make sure the backend is running, then try again."
          : err.response.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4 sm:p-6 animate-in fade-in duration-200">
      <Link to="/" className="mb-8 group flex items-center justify-center gap-3">
        <img src="/favicon.png" alt="Nudra" className="h-14 w-14 object-contain" />
        <img src="/nudra-text-logo.png" alt="Nudra" className="h-16 w-auto" />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-md space-y-6">
        {sent ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[#B7E4C7]/40 text-[#2D6A4F] flex items-center justify-center">
              <MailCheck className="w-7 h-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">Check your email</h1>
            <p className="text-xs text-[#6B7280] leading-relaxed">
              If an account exists for <span className="font-bold text-gray-700">{email}</span>, we've sent a link
              to reset your password. It expires in 30 minutes.
            </p>
            <p className="text-[11px] text-gray-400">Didn't get it? Check your spam folder or try again.</p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-xs font-bold text-[#2D6A4F] hover:underline"
            >
              Send another link
            </button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">Forgot your password?</h1>
              <p className="text-xs text-[#6B7280]">Enter your email and we'll send you a link to choose a new one.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@nudra.edu"
                    className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-xs font-semibold text-red-600 text-center">{error}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>{isSubmitting ? 'Sending...' : 'Send reset link'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        )}

        <p className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          Remembered it?{' '}
          <Link to="/login" className="font-bold text-[#2D6A4F] hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
