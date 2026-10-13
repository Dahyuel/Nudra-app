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
    <header
      id="dashboard-navbar"
      className="sticky top-0 z-30 bg-[#faf9f3]/90 dark:bg-[#101c22]/90 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3 transition-colors duration-200 border-b border-[#063e33]/10 dark:border-white/10"
      dir="ltr"
    >
      <div className="flex items-center justify-between gap-4">
        <button
          id="mobile-menu-toggle-btn"
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-[#063e33] dark:text-slate-200 hover:bg-[#e8edda]/60 dark:hover:bg-white/5 border border-[#063e33]/10 dark:border-white/10 transition-colors lg:hidden shrink-0 cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-md" ref={searchRef}>
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#66736b] dark:text-slate-400 pointer-events-none" />
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
              className="w-full pr-10 pl-10 py-2.5 text-sm bg-white dark:bg-[#0b141a] border border-[#063e33]/15 dark:border-white/10 rounded-full focus:outline-none focus:border-[#063e33] dark:focus:border-[#e0f36b] focus:ring-2 focus:ring-[#063e33]/10 dark:focus:ring-[#e0f36b]/20 text-[#063e33] dark:text-white placeholder-[#66736b] dark:placeholder-slate-400 transition-all text-left shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#66736b] dark:text-slate-400 hover:text-[#063e33] dark:hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {showSearch && enabled && (
              <div className="absolute right-0 mt-2 w-full sm:w-96 bg-white dark:bg-[#132026] rounded-2xl shadow-xl border border-[#063e33]/10 dark:border-white/10 p-2 z-50 max-h-96 overflow-y-auto">
                {searchLoading && (
                  <div className="space-y-2 p-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 rounded-xl bg-[#faf9f3] dark:bg-white/5 animate-pulse" />
                    ))}
                  </div>
                )}

                {!searchLoading && results.courses.length > 0 && (
                  <div className="p-2">
                    <p className="text-[10px] font-bold text-[#49644f] dark:text-emerald-400 uppercase tracking-wider mb-1.5 px-2">Courses</p>
                    {results.courses.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setShowSearch(false);
                          setSearchQuery('');
                          navigate(`/course/${c.id}`);
                        }}
                        className="w-full text-left p-2 rounded-xl hover:bg-[#e8edda]/50 dark:hover:bg-white/5 transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <span className="p-1.5 rounded-lg bg-[#063e33]/8 dark:bg-white/10 text-[#063e33] dark:text-white">
                          <BookOpen className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-[#063e33] dark:text-white truncate">{c.title}</span>
                          <span className="block text-[11px] text-[#66736b] dark:text-slate-400 truncate">{c.category ?? 'Course'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && results.lessons.length > 0 && (
                  <div className="p-2 border-t border-[#063e33]/8 dark:border-white/10">
                    <p className="text-[10px] font-bold text-[#49644f] dark:text-emerald-400 uppercase tracking-wider mb-1.5 px-2">Lessons</p>
                    {results.lessons.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => goToLesson(l.courseId, l.id)}
                        className="w-full text-left p-2 rounded-xl hover:bg-[#e8edda]/50 dark:hover:bg-white/5 transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <span className="p-1.5 rounded-lg bg-[#e0f36b]/40 dark:bg-[#e0f36b]/20 text-[#063e33] dark:text-[#e0f36b]">
                          <Play className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-[#063e33] dark:text-white truncate">{l.title}</span>
                          <span className="block text-[11px] text-[#66736b] dark:text-slate-400 truncate">{l.courseTitle ?? 'Lesson'}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && results.posts.length > 0 && (
                  <div className="p-2 border-t border-[#063e33]/8 dark:border-white/10">
                    <p className="text-[10px] font-bold text-[#49644f] dark:text-emerald-400 uppercase tracking-wider mb-1.5 px-2">Community</p>
                    {results.posts.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setShowSearch(false);
                          setSearchQuery('');
                          navigate(`/community?post=${p.id}`);
                        }}
                        className="w-full text-left p-2 rounded-xl hover:bg-[#e8edda]/50 dark:hover:bg-white/5 transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <span className="p-1.5 rounded-lg bg-[#e8edda] dark:bg-white/10 text-[#063e33] dark:text-white">
                          <MessageSquare className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-[#063e33] dark:text-white truncate">{p.title ?? 'Post'}</span>
                          <span className="block text-[11px] text-[#66736b] dark:text-slate-400 truncate">
                            {p.content.length > 80 ? `${p.content.slice(0, 80)}...` : p.content}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!searchLoading && !hasResults && (
                  <p className="py-6 text-center text-xs text-[#66736b] dark:text-slate-400">No results for '{activeQuery}'</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0">
          <button
            id="navbar-mail-btn"
            onClick={() => navigate('/community')}
            title="Messages & Community"
            className="relative p-2.5 rounded-full bg-white dark:bg-[#132026] hover:bg-[#e8edda]/60 dark:hover:bg-white/5 text-[#063e33] dark:text-slate-200 border border-[#063e33]/12 dark:border-white/10 transition-colors cursor-pointer shadow-xs"
          >
            <Mail className="w-[18px] h-[18px]" />
          </button>

          <div className="relative" ref={notifRef}>
            <button
              id="navbar-notification-btn"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2.5 rounded-full bg-white dark:bg-[#132026] hover:bg-[#e8edda]/60 dark:hover:bg-white/5 text-[#063e33] dark:text-slate-200 border border-[#063e33]/12 dark:border-white/10 transition-colors cursor-pointer shadow-xs"
              aria-label="Open notifications"
            >
              <Bell className="w-[18px] h-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-[#063e33] dark:bg-[#e0f36b] text-[#e0f36b] dark:text-[#063e33] text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white dark:ring-[#132026]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div
                id="notifications-dropdown-menu"
                className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-[#132026] rounded-2xl shadow-xl border border-[#063e33]/10 dark:border-white/10 p-4 z-50"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#063e33]/8 dark:border-white/10 mb-2">
                  <h3 className="font-bold text-[#063e33] dark:text-white text-sm">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead().catch(console.warn)}
                      className="text-xs text-[#63815c] dark:text-[#e0f36b] hover:underline font-semibold cursor-pointer"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="divide-y divide-[#063e33]/8 dark:divide-white/10 max-h-80 overflow-y-auto pr-1">
                  {isLoading && (
                    <div className="space-y-2 py-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-14 rounded-xl bg-[#faf9f3] dark:bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  )}

                  {!isLoading && notifications.length === 0 && (
                    <div className="py-8 flex flex-col items-center gap-2 text-[#66736b] dark:text-slate-400">
                      <Bell className="w-6 h-6" />
                      <p className="text-xs">No notifications</p>
                    </div>
                  )}

                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleNotificationClick(item.id, item.link)}
                      className={`w-full text-left p-3 rounded-xl transition-colors flex items-start gap-3 cursor-pointer ${
                        !item.isRead ? 'bg-[#e8edda]/50 dark:bg-emerald-950/40' : 'hover:bg-[#faf9f3] dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#063e33] dark:text-white">{item.title}</p>
                        <p className="text-xs text-[#66736b] dark:text-slate-300 line-clamp-2 mt-0.5">{item.body}</p>
                        <span className="text-[10px] text-[#66736b]/70 dark:text-slate-500 mt-1 block">{timeAgo(item.createdAt)}</span>
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
