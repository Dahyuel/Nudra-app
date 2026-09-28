import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Download, FileText, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface PastExam {
  id: string;
  subject: string;
  grade: string;
  year: number;
  session: string;
  title: string;
  pdfUrl: string;
  answerKeyUrl: string | null;
}

export const SanaweyaExamViewPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const { data: exam, isLoading } = useQuery({
    queryKey: ['past-exam', examId],
    queryFn: async () => {
      const { data } = await api.get(`/api/sanaweya/past-exams/${examId}`);
      return data.exam as PastExam;
    },
    enabled: !!examId,
  });

  useEffect(() => {
    if (examId && user) {
      api.post(`/api/sanaweya/past-exams/${examId}/start`).catch((err) => {
        console.warn('Failed to record exam attempt', err);
      });
    }
  }, [examId, user]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-white rounded-2xl border border-gray-100" />
        <div className="h-[70vh] bg-white rounded-2xl border border-gray-100" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="font-bold text-gray-900 text-base">الامتحان غير موجود</h3>
        <button
          onClick={() => navigate('/sanaweya/exams')}
          className="mt-4 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold"
        >
          رجوع
        </button>
      </div>
    );
  }

  const activeUrl = showAnswerKey && exam.answerKeyUrl ? exam.answerKeyUrl : exam.pdfUrl;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/sanaweya/exams')}
            className="p-2 rounded-xl bg-[#F8FAF9] hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h1 className="font-extrabold text-base text-[#1B1B1B]">{exam.title}</h1>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className="text-[11px] font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-2 py-0.5 rounded-full">
                {exam.subject}
              </span>
              <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {exam.year}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exam.pdfUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            تحميل الامتحان
          </a>
          {exam.answerKeyUrl && (
            <button
              onClick={() => setShowAnswerKey((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                showAnswerKey ? 'bg-[#B7E4C7]/50 text-[#2D6A4F]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {showAnswerKey ? 'عرض الامتحان' : 'عرض ورقة الإجابة'}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        <iframe
          src={activeUrl}
          title={exam.title}
          className="w-full"
          style={{ height: 'calc(100vh - 220px)' }}
        />
      </div>

      <div className="text-center">
        <a
          href={activeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D6A4F] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          فتح PDF في تبويب جديد
        </a>
      </div>
    </div>
  );
};
