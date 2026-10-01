import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Mail, Lock, ArrowRight, BookOpen, Briefcase, Link2, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BIO_MIN = 30;

const inputClass =
  'w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors';
const labelClass = 'block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5';

export const InstructorApplyPage: React.FC = () => {
  const { applyToTeach } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [subjects, setSubjects] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [bio, setBio] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bio.trim().length < BIO_MIN) {
      setError(`Please tell us a bit more about yourself (at least ${BIO_MIN} characters).`);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await applyToTeach({
        name: fullName,
        email,
        password,
        subjects,
        experienceYears: Number(experienceYears),
        bio,
        portfolioUrl: portfolioUrl.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Application failed');
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

      <div className="w-full max-w-lg bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-md space-y-6">
        <div className="text-center space-y-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-3 py-1 rounded-full">
            <Briefcase className="w-3.5 h-3.5" />
            Instructor application (طلب انضمام كمعلم)
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">Apply to Teach on Nudra</h1>
          <p className="text-xs text-[#6B7280]">
            Every instructor is reviewed before they can publish courses. We'll notify you once your
            application has been reviewed.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Mona Hassan"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="mona@example.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters, upper & lower case, a number"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className={labelClass}>Subjects You Teach</label>
              <div className="relative">
                <BookOpen className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={500}
                  value={subjects}
                  onChange={(e) => setSubjects(e.target.value)}
                  placeholder="e.g. Mathematics, Physics"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Years Teaching</label>
              <input
                type="number"
                required
                min={0}
                max={60}
                step={1}
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                placeholder="e.g. 5"
                className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className={`${labelClass} flex items-center justify-between`}>
              <span>About You & Your Teaching</span>
              <span className={`text-[11px] font-semibold ${bio.trim().length >= BIO_MIN ? 'text-[#2D6A4F]' : 'text-gray-400'}`}>
                {bio.trim().length}/{BIO_MIN}+
              </span>
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <textarea
                required
                rows={4}
                maxLength={3000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Your qualifications, where you've taught, and what you'd like to teach on Nudra."
                className={`${inputClass} resize-y`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Portfolio / CV Link <span className="normal-case font-semibold text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <Link2 className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                value={portfolioUrl}
                onChange={(e) => setPortfolioUrl(e.target.value)}
                placeholder="https://linkedin.com/in/your-profile"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 pt-1 text-xs text-gray-600">
            <input
              type="checkbox"
              required
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="accent-[#2D6A4F] w-4 h-4 mt-0.5 rounded shrink-0"
            />
            <span className="leading-snug">
              I confirm the information above is accurate and agree to the{' '}
              <a href="#terms" className="font-bold text-[#2D6A4F] hover:underline">
                Instructor Terms
              </a>
            </span>
          </div>

          {error && <p className="text-xs font-semibold text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span>{isSubmitting ? 'Submitting...' : 'Submit Application'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          Already applied or approved?{' '}
          <Link to="/login" className="font-bold text-[#2D6A4F] hover:underline">
            Sign In
          </Link>
          <span className="block mt-2">
            Want to learn instead?{' '}
            <Link to="/register" className="font-bold text-[#2D6A4F] hover:underline">
              Create a Student Account
            </Link>
          </span>
        </p>
      </div>
    </div>
  );
};
