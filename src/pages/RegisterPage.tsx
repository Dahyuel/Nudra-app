import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, GraduationCap, ArrowRight, BookOpen, Phone } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

const SANAWEYA_GRADE_MAP: Record<string, 'year1' | 'year2' | 'year3'> = {
  'سنة أولى ثانوي': 'year1',
  'سنة ثانية ثانوي': 'year2',
  'سنة ثالثة ثانوي': 'year3',
};

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [grade, setGrade] = useState('سنة ثالثة ثانوي');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await register(fullName, email, password, phone, grade);

      const sanaweyaGrade = SANAWEYA_GRADE_MAP[grade];

      if (sanaweyaGrade) {
        api.post('/api/sanaweya/profile', { grade: sanaweyaGrade }).catch((err) => {
          console.warn('Failed to create Sanaweya profile', err);
        });
        navigate('/sanaweya');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Brand Header */}
      <Link to="/" className="mb-8 group flex items-center justify-center gap-3">
        <img src="/favicon.png" alt="Nudra" className="h-14 w-14 object-contain" />
        <img src="/nudra-text-logo.png" alt="Nudra" className="h-16 w-auto" />
      </Link>

      {/* Main Centered Registration Card */}
      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-md space-y-6">
        <div className="text-center space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-3 py-1 rounded-full">
            <GraduationCap className="w-3.5 h-3.5" />
            Student account (حساب طالب)
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">
            Create Your Nudra Account
          </h1>
          <p className="text-xs text-[#6B7280]">
            Join thousands of learners across the Arab world
          </p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Youssef Nabil"
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="youssef@example.com"
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+20 100 123 4567"
                pattern="[+()\-\s0-9]{7,20}"
                title="Digits, +, -, spaces (7–20 characters)"
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>
          </div>

          {/* Student grade */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Grade / Academic Level</span>
              <span className="text-[11px] font-semibold text-[#2D6A4F]">المرحلة الدراسية</span>
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors bg-white font-medium"
              >
                <option value="سنة أولى ثانوي">سنة أولى ثانوي (1st Secondary)</option>
                <option value="سنة ثانية ثانوي">سنة ثانية ثانوي (2nd Secondary)</option>
                <option value="سنة ثالثة ثانوي">سنة ثالثة ثانوي (3rd Secondary / Thanaweya)</option>
                <option value="University">University / جامعي</option>
                <option value="General">General / عام</option>
              </select>
            </div>
          </div>

          {/* Agree Terms Checkbox */}
          <div className="flex items-start gap-2 pt-1 text-xs text-gray-600">
            <input
              type="checkbox"
              required
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="accent-[#2D6A4F] w-4 h-4 mt-0.5 rounded shrink-0"
            />
            <span className="leading-snug">
              I agree to the{' '}
              <a href="#terms" className="font-bold text-[#2D6A4F] hover:underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#privacy" className="font-bold text-[#2D6A4F] hover:underline">
                Privacy Policy
              </a>
            </span>
          </div>

          {/* Submit Button */}
          {error && <p className="text-xs font-semibold text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span>{isSubmitting ? 'Creating account...' : 'Create Student Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Link to Login */}
        <p className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-[#2D6A4F] hover:underline">
            Sign In here
          </Link>
          <span className="block mt-2">
            Are you a teacher?{' '}
            <Link to="/teach" className="font-bold text-[#2D6A4F] hover:underline">
              Apply to teach on Nudra
            </Link>
          </span>
        </p>
      </div>
    </div>
  );
};
