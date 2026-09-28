import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, GraduationCap, Briefcase, ArrowRight, BookOpen } from 'lucide-react';
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
  const [role, setRole] = useState<'student' | 'instructor'>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [grade, setGrade] = useState('سنة ثالثة ثانوي');
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await register(fullName, email, password, role, role === 'student' ? grade : undefined);

      const sanaweyaGrade = role === 'student' ? SANAWEYA_GRADE_MAP[grade] : undefined;

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
        {/* Role Toggle */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
            Register As
          </label>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F8FAF9] rounded-xl border border-gray-100">
            <button
              type="button"
              onClick={() => setRole('student')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                role === 'student'
                  ? 'bg-[#2D6A4F] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Student (طالب)</span>
            </button>
            <button
              type="button"
              onClick={() => setRole('instructor')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                role === 'instructor'
                  ? 'bg-[#2D6A4F] text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Instructor (معلم)</span>
            </button>
          </div>
        </div>

        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">
            Create Your Nudra Account
          </h1>
          <p className="text-xs text-[#6B7280]">
            Join thousands of learners and instructors across the Arab world
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

          {/* STUDENT GRADE DROPDOWN (Shown when student role is selected) */}
          {role === 'student' && (
            <div className="animate-in fade-in duration-150">
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
          )}

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
          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2"
          >
            <span>Create {role === 'student' ? 'Student' : 'Instructor'} Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Link to Login */}
        <p className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-[#2D6A4F] hover:underline">
            Sign In here
          </Link>
        </p>
      </div>
    </div>
  );
};
