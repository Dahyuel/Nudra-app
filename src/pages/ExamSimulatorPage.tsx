import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { withErrorBoundary } from '../components/withErrorBoundary';

interface ExamQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
}

interface GradedQuestion {
  questionId: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  studentAnswer: string;
  correctOption: string;
  correctText: string;
  explanation: string | null;
  isCorrect: boolean;
}

interface ExamResult {
  score: number;
  total: number;
  percentage: number;
  timeTakenSeconds: number;
  questions: GradedQuestion[];
  weakTopics: { topicSummary: string; recommendations: string } | null;
}

const optionLabels: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];

const getOptionText = (q: { optionA: string; optionB: string; optionC: string; optionD: string }, letter: string) => {
  if (letter === 'a') return q.optionA;
  if (letter === 'b') return q.optionB;
  if (letter === 'c') return q.optionC;
  return q.optionD;
};

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const ExamSimulatorPageInner: React.FC = () => {
  const navigate = useNavigate();
  const { enrollments, isLoading: enrollmentsLoading } = useMyEnrollments();

  const [view, setView] = useState<'setup' | 'exam' | 'results'>('setup');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [questionCount, setQuestionCount] = useState<10 | 20 | 30>(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<15 | 30 | 45>(30);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [examId, setExamId] = useState('');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);

  const submittedRef = useRef(false);

  useEffect(() => {
    if (view !== 'exam') return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  useEffect(() => {
    if (view === 'exam' && remainingSeconds === 0 && questions.length > 0 && !submittedRef.current) {
      submittedRef.current = true;
      handleSubmit();
    }
  }, [remainingSeconds, view, questions.length]);

  const handleStart = async () => {
    if (!selectedCourseId) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const { data } = await api.post('/api/quizzes/exam/generate', {
        courseId: selectedCourseId,
        questionCount,
        timeLimitMinutes,
      });
      if (!data.questions?.length) {
        setStartError('This course has no quiz questions yet, so an exam cannot be generated.');
        return;
      }
      setExamId(data.examId);
      setQuestions(data.questions);
      setCourseTitle(data.courseTitle);
      setAnswers({});
      setCurrentIndex(0);
      setRemainingSeconds(timeLimitMinutes * 60);
      setResult(null);
      submittedRef.current = false;
      setView('exam');
    } catch (err: any) {
      setStartError(err?.response?.data?.message || 'Failed to start exam');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      const timeTakenSeconds = timeLimitMinutes * 60 - remainingSeconds;
      const { data } = await api.post('/api/quizzes/exam/submit', {
        examId,
        courseId: selectedCourseId,
        answers,
        timeTakenSeconds,
      });
      setResult(data);
      setView('results');
    } catch (err: any) {
      setStartError(err?.response?.data?.message || 'Failed to submit exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryAgain = () => {
    setView('setup');
    setResult(null);
    setAnswers({});
    setQuestions([]);
    submittedRef.current = false;
  };

  if (view === 'setup') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#B7E4C7]/40 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-[#2D6A4F]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">Exam Simulator</h1>
            <p className="text-xs text-gray-500">Practice with timed mock exams drawn from your course quizzes</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700">Select Course</label>
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              disabled={enrollmentsLoading}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] bg-white"
            >
              <option value="">Choose a course...</option>
              {enrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700">Number of Questions</label>
            <div className="flex gap-2">
              {([10, 20, 30] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                    questionCount === n
                      ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-[#F8FAF9]'
                  }`}
                >
                  {n} Questions
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700">Time Limit</label>
            <div className="flex gap-2">
              {([15, 30, 45] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setTimeLimitMinutes(n)}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                    timeLimitMinutes === n
                      ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-[#F8FAF9]'
                  }`}
                >
                  {n} Minutes
                </button>
              ))}
            </div>
          </div>

          {startError && <p className="text-xs text-red-500 font-semibold">{startError}</p>}

          <button
            onClick={handleStart}
            disabled={!selectedCourseId || isStarting || enrollmentsLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#23533e] transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            <span>{isStarting ? 'Starting...' : 'Start Exam'}</span>
          </button>
        </div>
      </div>
    );
  }

  if (view === 'exam') {
    const current = questions[currentIndex];
    const answeredCount = questions.filter((q) => answers[q.id]).length;
    const unanswered = questions.length - answeredCount;

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {startError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{startError}</p>}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 rounded-2xl shadow-sm px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-gray-900">Exam in Progress</h2>
            <p className="text-[11px] text-gray-500 truncate max-w-[160px]">{courseTitle}</p>
          </div>
          <div className="flex items-center gap-2 text-sm font-black text-[#2D6A4F] bg-[#B7E4C7]/30 px-3 py-1.5 rounded-xl">
            <Clock className="w-4 h-4" />
            <span className="font-mono">{formatTime(remainingSeconds)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-gray-500">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <div className="w-10 h-10 rounded-full border-4 border-gray-100 flex items-center justify-center text-[10px] font-black text-[#2D6A4F] relative">
              <span>{answeredCount}/{questions.length}</span>
            </div>
          </div>
        </div>

        {current && (
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <span className="text-sm font-bold text-gray-800">
                {currentIndex + 1}. {current.questionText}
              </span>
            </div>
            <div className="space-y-2">
              {optionLabels.map((letter) => (
                <button
                  key={letter}
                  onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: letter }))}
                  className={`w-full flex items-center gap-2 text-left text-xs px-4 py-3 rounded-xl border transition-colors ${
                    answers[current.id] === letter
                      ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F] font-semibold'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-[#F8FAF9]'
                  }`}
                >
                  <span className="font-black uppercase">{letter}</span>
                  <span className="flex-1">{getOptionText(current, letter)}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-[#F8FAF9] disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              {currentIndex < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e]"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e]"
                >
                  <span>Submit Exam</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 space-y-3">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Question Navigator</span>
          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-8 h-8 rounded-lg text-xs font-bold border transition-colors ${
                  idx === currentIndex
                    ? 'border-[#2D6A4F] text-[#2D6A4F]'
                    : answers[q.id]
                      ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F]'
                      : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>

        {showConfirm && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-amber-800">
              {unanswered > 0
                ? `${unanswered} question${unanswered > 1 ? 's' : ''} unanswered — submit anyway?`
                : 'Submit your exam now?'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] disabled:opacity-60"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'results' && result) {
    const percentage = result.percentage;
    const scoreColor =
      percentage >= 70 ? 'text-[#2D6A4F]' : percentage >= 50 ? 'text-amber-500' : 'text-red-500';
    const label = percentage >= 90 ? 'Excellent!' : percentage >= 70 ? 'Good job!' : 'Keep practicing!';
    const mins = Math.floor(result.timeTakenSeconds / 60);
    const secs = result.timeTakenSeconds % 60;

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 text-center space-y-2">
          <div className={`text-5xl font-black ${scoreColor}`}>{percentage}%</div>
          <div className="text-xs text-gray-500 font-semibold">
            {result.score} / {result.total} correct
          </div>
          <div className="text-sm font-bold text-gray-800">{label}</div>
          <div className="text-[11px] text-gray-400">Completed in {mins} min {secs} sec</div>
        </div>

        {result.weakTopics && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-black text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Areas to Review
            </h3>
            <div className="text-xs text-amber-900 whitespace-pre-line leading-relaxed">
              {result.weakTopics.topicSummary}
            </div>
            {result.weakTopics.recommendations && (
              <div className="text-xs text-amber-900 whitespace-pre-line leading-relaxed pt-1 border-t border-amber-200">
                {result.weakTopics.recommendations}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {result.questions.map((q, idx) => (
            <div key={q.questionId} className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
              <div className="flex items-start gap-2">
                {q.isCorrect ? (
                  <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                )}
                <span className="text-sm font-bold text-gray-800">
                  {idx + 1}. {q.questionText}
                </span>
              </div>
              <div className="space-y-1.5">
                {optionLabels.map((letter) => {
                  const isStudent = q.studentAnswer === letter;
                  const isCorrect = q.correctOption === letter;
                  return (
                    <div
                      key={letter}
                      className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                        isCorrect
                          ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F] font-semibold'
                          : isStudent
                            ? 'bg-red-50 border-red-300 text-red-600'
                            : 'bg-white border-gray-100 text-gray-600'
                      }`}
                    >
                      <span className="font-black uppercase">{letter}</span>
                      <span className="flex-1">{getOptionText(q, letter)}</span>
                      {isCorrect && <span className="text-[10px] font-bold">Correct</span>}
                      {isStudent && !isCorrect && <span className="text-[10px] font-bold">Your answer</span>}
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="text-[11px] italic text-gray-500 bg-gray-50 rounded-lg p-3">{q.explanation}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleTryAgain}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 px-4 py-3 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#23533e] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export const ExamSimulatorPage = withErrorBoundary(ExamSimulatorPageInner);
