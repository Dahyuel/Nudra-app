import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface QuizQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  position: number;
}

export interface LessonQuiz {
  id: string;
  title: string;
  lessonId: string;
  courseId: string;
  questions: QuizQuestion[];
}

export interface QuizAttemptSummary {
  score: number;
  total: number;
  percentage: number;
  completedAt: string;
  answers: Record<string, string>;
}

export interface GradedQuestion {
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

export interface QuizResult {
  score: number;
  totalQuestions: number;
  percentage: number;
  questions: GradedQuestion[];
}

export const useLessonQuiz = (lessonId: string | undefined) => {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  const query = useQuery({
    queryKey: ['lesson-quiz', lessonId],
    queryFn: async () => {
      const { data } = await api.get(`/api/quizzes/lesson/${lessonId}`);
      return data as { quiz: LessonQuiz | null; lastAttempt: QuizAttemptSummary | null };
    },
    enabled: !!lessonId,
  });

  const submitAttempt = async (answers: Record<string, string>) => {
    const quiz = query.data?.quiz;
    if (!quiz) return;

    setIsSubmitting(true);
    try {
      const { data } = await api.post(`/api/quizzes/${quiz.id}/attempt`, { answers });
      setResult(data as QuizResult);
      queryClient.invalidateQueries({ queryKey: ['lesson-quiz', lessonId] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetQuiz = () => {
    setResult(null);
  };

  return {
    quiz: query.data?.quiz ?? null,
    lastAttempt: query.data?.lastAttempt ?? null,
    isLoading: query.isLoading,
    submitAttempt,
    isSubmitting,
    result,
    resetQuiz,
  };
};
