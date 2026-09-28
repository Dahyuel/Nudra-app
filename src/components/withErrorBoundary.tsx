import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => {
    const navigate = useNavigate();
    return (
      <ErrorBoundary fallback={fallback} onGoHome={() => navigate('/dashboard')}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };

  Wrapped.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return Wrapped;
}
