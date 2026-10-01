import React from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Always-visible theme toggle + log out for sidebar footers. These used to live
 * only inside the profile dropdown, which users didn't discover (and which
 * opened off-screen in the Instructor Studio).
 */
export const AccountActions: React.FC<{ onAction?: () => void }> = ({ onAction }) => {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors"
      >
        {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        <span>{isDark ? 'Light' : 'Dark'}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onAction?.();
          logout();
        }}
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Log out</span>
      </button>
    </div>
  );
};
