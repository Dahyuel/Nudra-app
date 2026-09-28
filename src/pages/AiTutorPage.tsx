import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  RotateCcw,
  ChevronDown,
  Copy,
  Check,
  Zap,
  ArrowRight,
  X,
  MessageSquare,
  Plus,
  Trash2,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useAiChat } from '../hooks/useAiChat';
import { useConversations, type Conversation } from '../hooks/useConversations';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { withErrorBoundary } from '../components/withErrorBoundary';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

const formatRelativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const AiTutorPageInner: React.FC = () => {
  const { user } = useAuth();
  const { enrollments, isLoading: enrollmentsLoading } = useMyEnrollments();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useConversations();

  const {
    messages,
    isStreaming,
    sendMessage,
    resetConversation,
    loadConversation,
    conversationId,
    error,
    setError,
  } = useAiChat(selectedCourseId);

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    'Explain the photoelectric effect',
    'Quiz me on chapter 3',
    "Summarize today's lesson",
    "How does Planck's constant relate to photon frequency?",
    'Compare classical wave theory vs photon theory',
    'Solve a numerical example on de Broglie wavelength',
  ];

  useEffect(() => {
    if (!enrollmentsLoading && enrollments.length > 0 && !selectedCourseId) {
      setSelectedCourseId(enrollments[0].id);
    }
  }, [enrollments, enrollmentsLoading, selectedCourseId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const selectedCourseTitle =
    enrollments.find((e) => e.id === selectedCourseId)?.title ?? 'General';

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;
    sendMessage(text.trim());
    setInputText('');
  };

  const handleCopyText = (content: string, id: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenConversation = async (conv: Conversation) => {
    // Q3: auto-switch course dropdown to match the conversation's course
    if (conv.courseId && conv.courseId !== selectedCourseId) {
      setSelectedCourseId(conv.courseId);
    }
    await loadConversation(conv.id);
  };

  const handleNewChat = async () => {
    await resetConversation();
    setInputText('');
  };

  const getConversationTitle = (conv: Conversation): string => {
    // Q2: show first user message as the title
    if (conv.lastMessage) {
      const cleaned = conv.lastMessage.replace(/\s+/g, ' ').trim();
      if (cleaned) {
        return cleaned.length > 60 ? `${cleaned.slice(0, 60)}…` : cleaned;
      }
    }
    return 'New conversation';
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col lg:flex-row gap-6 animate-in fade-in duration-200">
      {/* 1. LEFT SIDEBAR: Course Context + Chat History */}
      <aside className="w-full lg:w-80 flex flex-col gap-5 shrink-0">
        {/* Course Context Card */}
        <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Active Context
            </span>
            <span className="text-[10px] font-bold bg-[#B7E4C7]/40 text-[#2D6A4F] px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />
              Syllabus Synced
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">Learning Track</label>
            <div className="relative">
              {enrollmentsLoading ? (
                <div className="w-full h-10 bg-gray-100 rounded-xl animate-pulse" />
              ) : enrollments.length === 0 ? (
                <div className="w-full text-xs text-gray-500 bg-[#F8FAF9] p-3 rounded-xl border border-gray-200">
                  Enroll in a course to unlock context-aware tutoring
                </div>
              ) : (
                <>
                  <select
                    value={selectedCourseId ?? ''}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    className="w-full text-xs font-bold text-gray-800 bg-[#F8FAF9] p-3 pr-8 rounded-xl border border-gray-200 focus:outline-none focus:border-[#2D6A4F] appearance-none"
                  >
                    {enrollments.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </>
              )}
            </div>
          </div>

          <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
            The AI Tutor references your lecture notes, video timestamps, and curriculum quizzes in real-time.
          </p>
        </div>

        {/* Chat History Card (replaces Suggested Questions) */}
        <div className="rounded-2xl p-5 bg-white border border-gray-100 shadow-sm flex-1 flex flex-col space-y-3 min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#2D6A4F]" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-gray-800">
                Chat History
              </h3>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              title="Start new chat"
              className="p-1.5 rounded-lg text-[#2D6A4F] hover:bg-emerald-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 min-h-0">
            {conversationsLoading && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            )}

            {!conversationsLoading && conversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
                <MessageSquare className="w-6 h-6 mb-2" />
                <p className="text-[11px]">No conversations yet</p>
                <p className="text-[10px] mt-0.5">Start chatting to see your history</p>
              </div>
            )}

            {conversations.map((conv) => {
              const isActive = conv.id === conversationId;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleOpenConversation(conv)}
                  className={`w-full text-left p-3 rounded-xl border transition-all group ${
                    isActive
                      ? 'bg-emerald-50/70 border-[#B7E4C7]'
                      : 'bg-[#F8FAF9] hover:bg-emerald-50/50 border-gray-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold truncate ${
                          isActive ? 'text-[#2D6A4F]' : 'text-gray-700'
                        }`}
                      >
                        {getConversationTitle(conv)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTime(conv.createdAt)}</span>
                        {conv.courseTitle && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[100px]">{conv.courseTitle}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] shrink-0 mt-1.5" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Conversations are saved automatically</span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN CHAT AREA */}
      <section className="flex-1 flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden min-w-0">
        {/* Chat Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-[#F8FAF9]/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-[#1B1B1B]">Nudra AI Tutor</h2>
                <span className="text-[10px] font-bold bg-[#2D6A4F] text-white px-2 py-0.5 rounded-full">
                  24/7 Active
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280]">Context: {selectedCourseTitle}</p>
            </div>
          </div>

          <button
            onClick={handleNewChat}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Start new chat"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-red-600">{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Bot className="w-12 h-12 mb-4 text-[#2D6A4F] opacity-80" />
              <h3 className="font-bold text-sm text-[#2D6A4F]">Ask me anything</h3>
              <p className="text-[11px] text-[#6B7280] mt-1 mb-6">
                I have access to your course materials and lecture transcripts
              </p>

              {/* Suggested questions shown only when empty */}
              <div className="w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestedQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="text-left p-3 rounded-xl bg-[#F8FAF9] hover:bg-emerald-50/70 border border-gray-100 text-xs font-semibold text-gray-700 hover:text-[#2D6A4F] transition-all flex items-center justify-between group"
                  >
                    <span className="line-clamp-2 pr-2">{q}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#2D6A4F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isAi = msg.role === 'assistant';
            const isLast = idx === messages.length - 1;
            const showCursor = isLast && isStreaming && isAi;

            return (
              <div
                key={msg.id}
                className={`flex gap-3 sm:gap-4 max-w-3xl ${
                  isAi ? 'mr-auto' : 'ml-auto flex-row-reverse'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-bold ${
                    isAi
                      ? 'bg-[#2D6A4F] text-white shadow-2xs'
                      : 'bg-emerald-100 text-[#2D6A4F]'
                  }`}
                >
                  {isAi ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                <div className="space-y-1 max-w-[85%] min-w-0">
                  <div
                    className={`rounded-2xl p-4 sm:p-5 text-xs sm:text-sm leading-relaxed ${
                      isAi
                        ? 'bg-[#F8FAF9] text-[#1B1B1B] border border-gray-100'
                        : 'bg-[#2D6A4F] text-white shadow-xs'
                    }`}
                  >
                    {isAi ? (
                      <>
                        <MarkdownRenderer content={msg.text} />
                        {showCursor && (
                          <span className="inline-block w-1.5 h-4 bg-[#2D6A4F] animate-pulse ml-0.5 align-middle" />
                        )}
                      </>
                    ) : (
                      <div className="whitespace-pre-line">{msg.text}</div>
                    )}

                    {isAi && msg.text && (
                      <div className="pt-3 mt-3 border-t border-gray-200/60 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Answered based on Nudra Lecture Transcripts</span>
                        <button
                          onClick={() => handleCopyText(msg.text, msg.id)}
                          className="flex items-center gap-1 hover:text-[#2D6A4F] transition-colors"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <span
                    className={`text-[10px] text-gray-400 block px-1 ${
                      isAi ? 'text-left' : 'text-right'
                    }`}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })}

          {isStreaming && messages[messages.length - 1]?.text === '' && (
            <div className="flex gap-3 max-w-xl mr-auto">
              <div className="w-8 h-8 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-4 rounded-2xl bg-[#F8FAF9] border border-gray-100 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-[#2D6A4F] animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                />
                <span className="text-xs text-gray-500 font-semibold ml-2">
                  Nudra AI is formulating explanation...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 max-w-4xl mx-auto"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about a formula, lesson concept, or practice quiz..."
                className="w-full px-5 py-3.5 pr-12 text-xs sm:text-sm bg-[#F8FAF9] border border-gray-200 rounded-2xl focus:outline-none focus:border-[#2D6A4F] transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isStreaming}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl bg-[#2D6A4F] text-white flex items-center justify-center hover:bg-[#23533e] disabled:opacity-30 disabled:hover:bg-[#2D6A4F] transition-all shadow-2xs"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
          <p className="text-[11px] text-center text-gray-400 mt-2">
            Nudra AI may produce suggestions; verify key scientific definitions with your teacher's syllabus.
          </p>
        </div>
      </section>
    </div>
  );
};

export const AiTutorPage = withErrorBoundary(AiTutorPageInner);
