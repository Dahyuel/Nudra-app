import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Mail, Menu, BookOpen, Play, MessageSquare, X } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { useSearch } from '../hooks/useSearch';

interface NavbarProps {
  onToggleSidebar: () => void;
}

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const { notifications, unreadCount, markAllRead, markOneRead, isLoading } = useNotifications();
  const { results, isLoading: searchLoading, hasResults, query: activeQuery, enabled } = useSearch(searchQuery);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setShowNotifications(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearch(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (id: string, link: string | null) => {
    markOneRead(id).catch(console.warn);
    setShowNotifications(false);
    if (link) navigate(link);
  };

  const goToLesson = (courseId: string, lessonId: string) => {
    setShowSearch(false);
    setSearchQuery('');
    navigate(`/course/${courseId}?lesson=${lessonId}`);
  };

  return (
    <header className="sticky top-0 z-30 bg-[#F8FAF9]/85 dark:bg-slate-900/85 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3.5 transition-all" dir="ltr">
      <div className="flex items-center justify-between gap-4">
        <button
          id="mobile-menu-toggle-btn"
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 transition-colors lg:hidden shrink-0"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-md" ref={searchRef}>
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              id="top-navbar-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setShowSearch(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSearch(false);
              }}
              placeholder="Search courses, lessons, discussions..."
              className="w-full pr-10 pl-10 py-2 text-sm bg-white border border-gray-200/80 rounded-full focus:outline-none focus:border-[#2D6A4F] focus:ring-2 focus:ring-[#2D6A4F]/10 text-gray-800 placeholder-gray-400 shadow-2xs transition-all text-left"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {showSearch && enabled && (
              <div className="absolute right-0 mt-2 w-full sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 max-h-96 overflow-y-auto">
                {searchLoading && (
                  <div className="space-y-2 p-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-10 rounded-xl bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                )}

                {!searchLoading && results.courses.length > 0 && (
                  <div className="mb-1">
                    <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400">Courses</p>
                    {results.courses.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setShowSearch(false);
                          setSearchQuery('');
                          navigate(`/course/${c.id}`);
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAF9] text-left transition-colors"
                      >
                        {c.thumbnailUrl ? (
                          <img src={c.thumbnailUrl} alt={c.title} className="w-9 h-9 rounded-lg object-cover" />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-[#B7E4C7]/40 flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
                          </span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-gray-900 truncate">{c.title}</span>
                          <span className="block text-[11px] text-gray-500">{c.category}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && results.lessons.length > 0 && (
                  <div className="mb-1">
                    <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400">Lessons</p>
                    {results.lessons.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => goToLesson(l.courseId, l.id)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAF9] text-left transition-colors"
                      >
                        <span className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <Play className="w-4 h-4 text-emerald-600" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-gray-900 truncate">{l.title}</span>
                          <span className="block text-[11px] text-gray-500">In {l.courseTitle}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && results.posts.length > 0 && (
                  <div>
                    <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400">المجتمع</p>
                    {results.posts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setShowSearch(false);
                          setSearchQuery('');
                          navigate(p.courseId ? `/course/${p.courseId}/community` : '/community');
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-[#F8FAF9] text-left transition-colors"
                      >
                        <span className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-blue-600" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-gray-900 truncate">{p.title ?? 'Post'}</span>
                          <span className="block text-[11px] text-gray-500 truncate">
                            {p.content.length > 80 ? `${p.content.slice(0, 80)}...` : p.content}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && !hasResults && (
                  <p className="py-6 text-center text-xs text-gray-400">No results for '{activeQuery}'</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-3 shrink-0">
          <button
            id="navbar-mail-btn"
            onClick={() => navigate('/community')}
            title="Messages & Community"
            className="relative p-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-100 dark:border-slate-700 shadow-2xs transition-colors"
          >
            <Mail className="w-5 h-5" />
          </button>

          <div className="relative" ref={notifRef}>
            <button
              id="navbar-notification-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 rounded-full bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-100 dark:border-slate-700 shadow-2xs transition-colors"
              aria-label="Open notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div
                id="notifications-dropdown-menu"
                className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50"
              >
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-2">
                  <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead().catch(console.warn)}
                      className="text-xs text-[#2D6A4F] hover:underline font-semibold"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto pr-1">
                  {isLoading && (
                    <div className="space-y-2 py-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!isLoading && notifications.length === 0 && (
                    <div className="py-8 flex flex-col items-center gap-2 text-gray-400">
                      <Bell className="w-6 h-6" />
                      <p className="text-xs">No notifications</p>
                    </div>
                  )}

                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNotificationClick(item.id, item.link)}
                      className={`w-full text-left p-3 rounded-xl transition-colors flex items-start gap-3 ${
                        !item.isRead ? 'bg-[#F8FAF9] border-r-2 border-[#2D6A4F]' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{item.body}</p>
                        <span className="text-[10px] text-gray-400 mt-1 block">{timeAgo(item.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
