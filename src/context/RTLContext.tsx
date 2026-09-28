import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type Direction = 'ltr' | 'rtl';

interface RTLContextValue {
  direction: Direction;
  isRTL: boolean;
  toggleRTL: () => void;
  setDirection: (direction: Direction) => void;
}

const STORAGE_KEY = 'nudra-direction';

const RTLContext = createContext<RTLContextValue | undefined>(undefined);

function getInitialDirection(): Direction {
  if (typeof window === 'undefined') return 'ltr';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'ltr') return 'ltr';
  if (stored === 'rtl') return 'rtl';
  return 'ltr';
}

export const RTLProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [direction, setDirectionState] = useState<Direction>(getInitialDirection);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('dir', direction);
    root.setAttribute('lang', direction === 'rtl' ? 'ar' : 'en');
    window.localStorage.setItem(STORAGE_KEY, direction);
  }, [direction]);

  const setDirection = useCallback((next: Direction) => setDirectionState(next), []);
  const toggleRTL = useCallback(
    () => setDirectionState((prev) => (prev === 'rtl' ? 'ltr' : 'rtl')),
    []
  );

  return (
    <RTLContext.Provider
      value={{ direction, isRTL: direction === 'rtl', toggleRTL, setDirection }}
    >
      {children}
    </RTLContext.Provider>
  );
};

export const useRTL = () => {
  const ctx = useContext(RTLContext);
  if (!ctx) {
    throw new Error('useRTL must be used within an RTLProvider');
  }
  return ctx;
};
