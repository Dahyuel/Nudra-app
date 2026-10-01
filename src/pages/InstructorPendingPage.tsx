import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, XCircle, RefreshCw, LogOut } from 'lucide-react';
import api from '../lib/api';
import { useAuth, homePathFor, isApprovedInstructor } from '../context/AuthContext';

interface InstructorApplication {
  status: 'pending' | 'approved' | 'rejected';
  subjects: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const InstructorPendingPage: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const { data: application, isLoading, refetch } = useQuery({
    queryKey: ['instructor-application', user?.id],
    queryFn: async () => {
      const { data } = await api.get('/api/auth/instructor-application');
      return (data.application ?? null) as InstructorApplication | null;
    },
    enabled: !!user,
  });

  // Students and approved instructors don't belong here.
  if (user && (user.role !== 'instructor' || isApprovedInstructor(user))) {
    return <Navigate to={homePathFor(user)} replace />;
  }

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setCheckMessage(null);
    try {
      const fresh = await refreshUser();
      await refetch();
      if (fresh && isApprovedInstructor(fresh)) {
        navigate('/instructor/dashboard');
      } else {
        setCheckMessage('No change yet. We will notify you as soon as it is reviewed.');
      }
    } finally {
      setIsChecking(false);
    }
  };

  const isRejected = (application?.status ?? user?.instructorStatus) === 'rejected';

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4 sm:p-6 animate-in fade-in duration-200">
      <Link to="/" className="mb-8 group flex items-center justify-center gap-3">
        <img src="/favicon.png" alt="Nudra" className="h-14 w-14 object-contain" />
        <img src="/nudra-text-logo.png" alt="Nudra" className="h-16 w-auto" />
      </Link>

      <div className="w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-md space-y-6 text-center">
        <div
          className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center ${
            isRejected ? 'bg-red-50 text-red-500' : 'bg-[#B7E4C7]/40 text-[#2D6A4F]'
          }`}
        >
          {isRejected ? <XCircle className="w-7 h-7" /> : <Clock className="w-7 h-7" />}
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black text-[#1B1B1B]">
            {isRejected ? 'Application not approved' : 'Your application is under review'}
          </h1>
          <p className="text-xs text-[#6B7280] leading-relaxed">
            {isRejected
              ? 'Thank you for your interest in teaching on Nudra. Unfortunately we could not approve your application.'
              : `Thanks${user ? `, ${user.name}` : ''}! Our team reviews every instructor before they can publish courses. You'll get a notification and an email once it's reviewed.`}
          </p>
        </div>

        {isLoading ? (
          <div className="h-16 rounded-xl bg-gray-50 animate-pulse" />
        ) : (
          application && (
            <div className="rounded-xl bg-[#F8FAF9] border border-gray-100 p-4 text-left text-xs space-y-1.5">
              <p>
                <span className="font-bold text-gray-700">Subjects:</span>{' '}
                <span className="text-gray-600">{application.subjects}</span>
              </p>
              <p>
                <span className="font-bold text-gray-700">Submitted:</span>{' '}
                <span className="text-gray-600">{new Date(application.createdAt).toLocaleDateString()}</span>
              </p>
              {isRejected && application.reviewNote && (
                <p>
                  <span className="font-bold text-gray-700">Reviewer note:</span>{' '}
                  <span className="text-gray-600">{application.reviewNote}</span>
                </p>
              )}
            </div>
          )
        )}

        <div className="space-y-2">
          {!isRejected && (
            <button
              onClick={handleCheckStatus}
              disabled={isChecking}
              className="w-full py-3 px-4 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking...' : 'Check status'}</span>
            </button>
          )}
          {checkMessage && <p className="text-[11px] text-gray-500">{checkMessage}</p>}
          <button
            onClick={() => logout()}
            className="w-full py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 text-xs sm:text-sm font-bold hover:bg-[#F8FAF9] transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>

        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          Meanwhile, you can{' '}
          <Link to="/browse" className="font-bold text-[#2D6A4F] hover:underline">
            browse courses
          </Link>
          .
        </p>
      </div>
    </div>
  );
};
