import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Shown when any of a page's data requests failed. Without it the dashboards
 * rendered zeros and "no data yet", which looked like real (empty) data.
 */
export const PageErrorBanner: React.FC<{ errors: unknown[] }> = ({ errors }) => {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const failed = errors.filter(Boolean);
  if (failed.length === 0) return null;

  const offline = failed.some((e: any) => !e?.response);
  const status = (failed.find((e: any) => e?.response) as any)?.response?.status;

  const retry = async () => {
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-2 flex-1">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
        <p className="text-xs font-semibold text-red-600 leading-relaxed">
          {offline
            ? "Can't reach the Nudra server, so some information on this page is missing. Check that the backend is running."
            : `Some information on this page couldn't be loaded${status ? ` (error ${status})` : ''}. Numbers shown may be incomplete.`}
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        disabled={retrying}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-60 shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Retrying...' : 'Try again'}
      </button>
    </div>
  );
};
