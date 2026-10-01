import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Compass,
  ArrowRight,
  BookOpen,
  Users,
  BrainCircuit,
  Video,
  Award,
  ShieldCheck,
  CheckCircle,
  Play,
  TrendingUp,
  LayoutGrid
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#F8FAF9] text-[#1B1B1B] flex flex-col justify-between selection:bg-[#B7E4C7] selection:text-[#2D6A4F]">
      {/* Top Navigation Bar */}
      <header className="sticky top-4 z-30 w-3/4 mx-auto bg-white/80 backdrop-blur-md border border-gray-100 rounded-2xl shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.png" alt="Nudra" className="h-12 w-12 object-contain" />
            <img src="/nudra-text-logo.png" alt="Nudra" className="h-12 w-auto" />
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-600">
            <Link to="/browse" className="hover:text-[#2D6A4F] transition-colors">
              Explore Courses
            </Link>
            <Link to="/community" className="hover:text-[#2D6A4F] transition-colors">
              Community
            </Link>
            <Link to="/ai-tutor" className="hover:text-[#2D6A4F] transition-colors">
              AI Tutor
            </Link>
            <Link to="/teach" className="text-emerald-700 hover:text-[#2D6A4F] font-bold transition-colors">
              Teach on Nudra
            </Link>
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all"
            >
              <span>Get Started</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
          {/* Subtle announcement pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#B7E4C7]/40 text-[#2D6A4F] text-xs font-bold mb-6 border border-[#B7E4C7]/60">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Next-Gen Bilingual Learning Ecosystem • ندرة</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#1B1B1B] max-w-4xl mx-auto leading-[1.15]">
            Master In-Demand Skills with Precision & Clarity.
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-[#6B7280] max-w-2xl mx-auto leading-relaxed font-medium">
            Nudra combines structured expert curricula, instant bilingual AI tutoring, and an interactive student workspace modeled after high-productivity tools.
          </p>

          {/* CTA Buttons (Get Started / Browse Courses) */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/browse"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-[#1B1B1B] text-sm font-bold shadow-sm transition-all"
            >
              <Compass className="w-4 h-4 text-[#2D6A4F]" />
              <span>Browse Courses</span>
            </Link>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-12 pt-8 border-t border-gray-200/60 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
            <div>
              <p className="text-2xl sm:text-3xl font-black text-[#1B1B1B]">24,000+</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Active Learners</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-[#2D6A4F]">94.8%</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Completion Rate</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-[#1B1B1B]">180+</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Curated Courses</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-black text-[#52B788]">4.9 ★</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">Average Rating</p>
            </div>
          </div>

          {/* Product Preview Card (Donezo Interface Teaser) */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="rounded-3xl p-3 sm:p-5 bg-white border border-gray-200/80 shadow-xl overflow-hidden text-left">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 px-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-400"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                  <span className="ml-2 text-xs font-semibold text-gray-400">
                    Nudra Student Dashboard — Preview
                  </span>
                </div>
                <Link
                  to="/dashboard"
                  className="text-xs font-bold text-[#2D6A4F] hover:underline flex items-center gap-1"
                >
                  <span>Launch Live App</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Teaser Preview Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#F8FAF9] p-4 rounded-2xl">
                {/* Mini Stat Card 1 */}
                <div className="rounded-2xl p-5 bg-[#2D6A4F] text-white">
                  <p className="text-xs text-emerald-100 font-medium">Enrolled Courses</p>
                  <p className="text-3xl font-black mt-2">24</p>
                  <span className="inline-block mt-2 text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-emerald-200">
                    +5% from last month
                  </span>
                </div>

                {/* Mini Stat Card 2 */}
                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-2xs">
                  <p className="text-xs text-gray-500 font-medium">Current Streak</p>
                  <p className="text-3xl font-black text-gray-900 mt-2">14 Days</p>
                  <span className="inline-block mt-2 text-[10px] text-[#2D6A4F] font-bold">
                    🔥 Daily Streak Active
                  </span>
                </div>

                {/* Mini Stat Card 3 */}
                <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-2xs">
                  <p className="text-xs text-gray-500 font-medium">Weekly Study Commitment</p>
                  <p className="text-3xl font-black text-gray-900 mt-2">                  30+ hrs</p>
                  <span className="inline-block mt-2 text-[10px] text-gray-500 font-bold">
                    7 Days Tracked
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 Feature Highlights Below (as explicitly required) */}
        <section className="py-16 bg-white border-y border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-[#2D6A4F] bg-[#B7E4C7]/30 px-3 py-1 rounded-full">
                Core Advantages
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] mt-3">
                Why Ambitious Students Thrive with Nudra
              </h2>
              <p className="text-xs sm:text-sm text-[#6B7280] mt-2">
                Designed from the ground up for high-velocity learning without cognitive clutter.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="rounded-2xl p-6 bg-[#F8FAF9] border border-gray-100/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[#2D6A4F] shadow-2xs mb-5">
                    <BrainCircuit className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1B1B1B] mb-2">
                    Adaptive AI Tutor & Socratic Prompts
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Get instant bilingual concept breakdowns, automated code debugging, and tailored practice quizzes 24/7 in both Arabic and English.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200/50">
                  <Link
                    to="/ai-tutor"
                    className="text-xs font-bold text-[#2D6A4F] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Try AI Tutor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="rounded-2xl p-6 bg-[#F8FAF9] border border-gray-100/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[#2D6A4F] shadow-2xs mb-5">
                    <Video className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1B1B1B] mb-2">
                    Live Mentorship & Code Critiques
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Engage in live weekly sessions with senior industry engineers, UI design directors, and AI researchers with direct screen sharing.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200/50">
                  <Link
                    to="/dashboard"
                    className="text-xs font-bold text-[#2D6A4F] hover:underline inline-flex items-center gap-1"
                  >
                    <span>View Upcoming Sessions</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="rounded-2xl p-6 bg-[#F8FAF9] border border-gray-100/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center text-[#2D6A4F] shadow-2xs mb-5">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1B1B1B] mb-2">
                    Peer Community & Anonymous Help
                  </h3>
                  <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
                    Ask questions without anxiety using built-in anonymous mode, collaborate on open-source repositories, and earn peer endorsements.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200/50">
                  <Link
                    to="/community"
                    className="text-xs font-bold text-[#2D6A4F] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Explore Discussions</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#2D6A4F] flex items-center justify-center p-1 bg-emerald-50/50">
              <div className="w-4 h-4 rounded-full bg-[#2D6A4F]" />
            </div>
            <span className="font-bold text-base text-[#1B1B1B]">Nudra (ندرة)</span>
          </div>

          <p className="text-xs text-[#6B7280]">
            © {new Date().getFullYear()} Nudra EdTech Platform. Inspired by Donezo design aesthetics.
          </p>

          <div className="flex items-center gap-4 text-xs font-semibold text-gray-500">
            <Link to="/dashboard" className="hover:text-[#2D6A4F]">
              Dashboard
            </Link>
            <Link to="/browse" className="hover:text-[#2D6A4F]">
              Courses
            </Link>
            <Link to="/community" className="hover:text-[#2D6A4F]">
              Community
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
