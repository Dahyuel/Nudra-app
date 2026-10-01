import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useLessonQuiz, GradedQuestion } from '../hooks/useLessonQuiz';
import api from '../lib/api';

interface LessonQuizPanelProps {
  lessonId: string | undefined;
  courseId: string | undefined;
}

const optionLabels: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];

const getOptionText = (question: GradedQuestion, letter: string) => {
  if (letter === 'a') return question.optionA;
  if (letter === 'b') return question.optionB;
  if (letter === 'c') return question.optionC;
  return question.optionD;
};

export const LessonQuizPanel: React.FC<LessonQuizPanelProps> = ({ lessonId }) => {
  const { quiz, lastAttempt, isLoading, submitAttempt, isSubmitting, result, resetQuiz } =
    useLessonQuiz(lessonId);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Record<string, string>>({});
  // Without this, an existing lastAttempt keeps the summary screen showing forever,
  // so "Retake" / "Try Again" could never reach the questions again.
  const [retaking, setRetaking] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Every past attempt (newest first), so students can see how they've improved.
  const { data: attempts = [] } = useQuery({
    queryKey: ['quiz-attempts', quiz?.id],
    queryFn: async () =>
      ((await api.get(`/api/quizzes/${quiz!.id}/attempts`)).data.attempts ?? []) as {
        id: string;
        score: number;
        totalQuestions: number;
        percentage: number;
        completedAt: string;
      }[],
    enabled: !!quiz?.id,
  });

  const attemptHistory =
    attempts.length > 1 ? (
      <div className="rounded-xl border border-gray-100 p-4 space-y-2">
        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Your attempts</h4>
        <ul className="space-y-1.5">
          {attempts.map((a, i) => (
            <li key={a.id} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                {new Date(a.completedAt).toLocaleDateString()} {i === 0 && <span className="font-bold text-[#2D6A4F]">· latest</span>}
              </span>
              <span className="font-bold text-gray-800 tabular-nums">
                {a.score}/{a.totalQuestions} · {a.percentage}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  const startRetake = () => {
    resetQuiz();
    setSelected({});
    setSubmitError(null);
    setRetaking(true);
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      await submitAttempt(selected);
      setRetaking(false);
      queryClient.invalidateQueries({ queryKey: ['quiz-attempts', quiz?.id] });
    } catch (err: any) {
      setSubmitError(err?.response?.data?.message || 'Failed to submit quiz. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-[#2D6A4F]" />
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-[#F8FAF9] flex items-center justify-center">
          <HelpCircle className="w-7 h-7 text-gray-300" />
        </div>
        <h3 className="text-sm font-bold text-gray-800">No Quiz Available</h3>
        <p className="text-xs text-gray-500 max-w-xs">
          The instructor hasn't added a quiz for this lesson yet.
        </p>
      </div>
    );
  }

  if (result) {
    const percentage = result.percentage;
    const scoreColor =
      percentage >= 70 ? 'text-[#2D6A4F]' : percentage >= 50 ? 'text-amber-500' : 'text-red-500';
    const label = percentage >= 90 ? 'Excellent!' : percentage >= 70 ? 'Good job!' : 'Keep practicing!';
    const improved = lastAttempt && percentage > lastAttempt.percentage;

    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F8FAF9] border border-gray-100 p-6 text-center">
          <div className={`text-4xl font-black ${scoreColor}`}>{percentage}%</div>
          <div className="text-xs text-gray-500 font-semibold mt-1">
            {result.score} / {result.totalQuestions} correct
          </div>
          <div className="text-sm font-bold text-gray-800 mt-2">{label}</div>
          {improved && (
            <span className="inline-block mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#B7E4C7] text-[#2D6A4F]">
              ↑ Improved from {lastAttempt!.percentage}%
            </span>
          )}
        </div>

        <div className="space-y-4">
          {result.questions.map((q, idx) => (
            <div key={q.questionId} className="rounded-xl border border-gray-100 p-4 space-y-3">
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
                <p className="text-[11px] italic text-gray-500 bg-gray-50 rounded-lg p-3">
                  {q.explanation}
                </p>
              )}
            </div>
          ))}
        </div>

        {attemptHistory}

        <button
          onClick={startRetake}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (lastAttempt && !retaking) {
    const percentage = lastAttempt.percentage;
    const scoreColor =
      percentage >= 70 ? 'text-[#2D6A4F]' : percentage >= 50 ? 'text-amber-500' : 'text-red-500';

    return (
      <div className="space-y-5">
        <div className="rounded-2xl bg-[#F8FAF9] border border-gray-100 p-6 text-center">
          <div className={`text-4xl font-black ${scoreColor}`}>{percentage}%</div>
          <div className="text-xs text-gray-500 font-semibold mt-1">
            {lastAttempt.score} / {lastAttempt.total} correct
          </div>
        </div>
        {attemptHistory}
        <button
          onClick={startRetake}
          className="w-full px-4 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#23533e] transition-colors"
        >
          Retake Quiz
        </button>
      </div>
    );
  }

  const allAnswered = quiz.questions.length > 0 && quiz.questions.every((q) => selected[q.id]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-gray-900">{quiz.title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {quiz.questions.length} questions • Test your understanding
        </p>
      </div>

      <div className="space-y-5">
        {quiz.questions.map((q, idx) => (
          <div key={q.id} className="space-y-3">
            <div className="bg-gray-50 rounded-xl p-4">
              <span className="text-sm font-bold text-gray-800">
                {idx + 1}. {q.questionText}
              </span>
            </div>
            <div className="space-y-1.5">
              {optionLabels.map((letter) => {
                const text =
                  letter === 'a'
                    ? q.optionA
                    : letter === 'b'
                      ? q.optionB
                      : letter === 'c'
                        ? q.optionC
                        : q.optionD;
                const isSelected = selected[q.id] === letter;
                return (
                  <button
                    key={letter}
                    disabled={isSubmitting}
                    onClick={() => setSelected((prev) => ({ ...prev, [q.id]: letter }))}
                    className={`w-full flex items-center gap-2 text-left text-xs px-3 py-2.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-[#B7E4C7] border-[#2D6A4F] text-[#2D6A4F] font-semibold'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-[#F8FAF9]'
                    } disabled:opacity-60`}
                  >
                    <span className="font-black uppercase">{letter}</span>
                    <span className="flex-1">{text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {submitError && <p className="text-xs text-red-500 font-semibold">{submitError}</p>}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || isSubmitting}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold hover:bg-[#23533e] transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Submitting...</span>
          </>
        ) : (
          <span>Submit Quiz</span>
        )}
      </button>
    </div>
  );
};