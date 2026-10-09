import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Route, Sparkles } from 'lucide-react';

export const LearningPathPage: React.FC = () => (
  <main className="student-learning-path mx-auto max-w-5xl space-y-8 pb-12">
    <header>
      <p className="text-sm font-semibold text-[#2D6A4F]">Make learning your own</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-[#19372A] sm:text-4xl">Learning Path</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#718078]">A place to bring your goals, courses, and next steps together.</p>
    </header>
    <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#173D2C] px-6 py-12 text-center text-white sm:px-12 sm:py-16">
      <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-72 w-72 rounded-full border-[36px] border-white/[0.05]" />
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white/10 text-[#B7E4C7]"><Route size={30} strokeWidth={1.6} /></span>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#B7E4C7]">Coming soon</p>
      <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Your path is taking shape</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/70">Personalized learning paths will help you connect courses to a goal and see what to learn next. This space is ready for your future plan.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link to="/academic" className="inline-flex items-center gap-2 rounded-xl bg-[#B7E4C7] px-4 py-2.5 text-sm font-semibold text-[#173D2C] transition hover:bg-white"><Sparkles size={16} /> Explore academic tracks</Link>
        <Link to="/browse" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"><Compass size={16} /> Browse courses <ArrowRight size={15} /></Link>
      </div>
    </section>
  </main>
);
