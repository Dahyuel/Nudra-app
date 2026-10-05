import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, HelpCircle, Moon, Sun, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const getInitials = (name?: string) => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
};

interface ProfileMenuProps {
  align?: 'left' | 'right';
  showName?: boolean;
  openUp?: boolean;
  onNavigate?: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({ align = 'left', showName = true, openUp = false, onNavigate }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    onNavigate?.();
    navigate(path);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        id="profile-menu-btn"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 p-1 sm:pr-3 rounded-full sm:rounded-2xl hover:bg-white dark:hover:bg-gray-800 transition-colors text-left"
      >
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-xs"
          />
        ) : (
          <span className="w-9 h-9 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-700 shadow-xs">
            {getInitials(user?.name)}
          </span>
        )}
        {showName && (
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
              {user?.name}
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-tight">
              {user?.email}
            </span>
          </div>
        )}
      </button>

      {open && (
        <div
          id="profile-menu-dropdown"
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'} w-60 bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-2 z-50`}
        >
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 mb-1">
            <p className="text-left text-xs font-bold text-gray-900 dark:text-gray-100">{user?.name}</p>
            <p dir="ltr" className="text-left text-[11px] text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
          </div>

          {user?.role === 'instructor' && (
            <>
              <button
                onClick={() => go('/student-portal')}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-bold text-[#2D6A4F] dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Student Portal</span>
              </button>
            </>
          )}

          <button
            onClick={() => go('/settings')}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-[#F8FAF9] dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>

          <button
            onClick={() => go('/help')}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-[#F8FAF9] dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help</span>
          </button>

          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between text-left px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-[#F8FAF9] dark:hover:bg-gray-800 rounded-xl transition-colors"
          >
            <span className="flex items-center gap-2">
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>Dark mode</span>
            </span>
            <span
              className={`w-9 h-5 rounded-full transition-colors relative ${
                theme === 'dark' ? 'bg-[#2D6A4F]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  theme === 'dark' ? 'left-4' : 'left-0.5'
                }`}
              />
            </span>
          </button>

          <div className="pt-1 mt-1 border-t border-gray-100 dark:border-gray-800 px-1 py-1">
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
