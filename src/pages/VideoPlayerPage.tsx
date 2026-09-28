import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
  CheckCircle2,
  Lock,
  ChevronRight,
  ChevronLeft,
  FileText,
  Sparkles,
  Download,
  Send,
  Bot,
  Plus,
  Trash2,
  BookOpen,
  ArrowLeft,
  Layers,
  Check,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { useCourse } from '../hooks/useCourse';
import { useLessonProgress } from '../hooks/useLessonProgress';
import { useLessonNotes } from '../hooks/useLessonNotes';
import { useLessonResources } from '../hooks/useLessonResources';
import { useMyEnrollments } from '../hooks/useMyEnrollments';
import { useAuth } from '../context/AuthContext';
import { useAiChat } from '../hooks/useAiChat';
import { useFlashcards } from '../hooks/useFlashcards';
import { useLessonSummary } from '../hooks/useLessonSummary';
import { withErrorBoundary } from '../components/withErrorBoundary';

type PlayerLesson = {
  id: string;
  title: string;
  duration: string | null;
  isFree: boolean;
  position: number;
  videoUrl: string | null;
  isLocked: boolean;
  completed?: boolean;
};

function formatSeconds(sec: number) {
  const mins = Math.floor(sec / 60);
  const remainingSec = Math.floor(sec % 60);
  return `${mins.toString().padStart(2, '0')}:${remainingSec.toString().padStart(2, '0')}`;
}

function getInitials(name?: string | null) {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const VideoPlayerPageInner: React.FC = () => {
  const { id, lessonId } = useParams<{ id: string; lessonId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { course: courseData, isLoading, error } = useCourse(id);
  const { courseProgress, markProgress } = useLessonProgress(id, lessonId);
  const { notes, isLoading: notesLoading, addNote, deleteNote } = useLessonNotes(lessonId);
  const { resources, isLoading: resourcesLoading } = useLessonResources(id, lessonId);
  const { enrollments } = useMyEnrollments();

  // Video player interactive state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(765);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastProgressRef = useRef(0);

  // Bottom Tabs state ('notes' | 'ai-tutor' | 'resources')
  const [bottomTab, setBottomTab] = useState<'notes' | 'ai-tutor' | 'resources' | 'quiz'>('notes');
  const [playerToast, setPlayerToast] = useState<string | null>(null);

  const showPlayerToast = (message: string) => {
    setPlayerToast(message);
    setTimeout(() => setPlayerToast(null), 2500);
  };

  const [newNoteText, setNewNoteText] = useState('');

  // AI Tutor chat state
  const { messages: aiChatMessages, isStreaming: isAiStreaming, sendMessage, error: aiError } = useAiChat(id ?? null);
  const [aiInput, setAiInput] = useState('');

  // Flashcards state
  const {
    flashcards: fetchedFlashcards,
    isGenerating: isGeneratingFlashcards,
    generateFlashcards,
    error: flashcardsError,
  } = useFlashcards(lessonId);
  const [flashcards, setFlashcards] = useState<Array<{ id: string; question: string; answer: string; revealed: boolean }>>([]);
  const hasGeneratedFlashcards = flashcards.length > 0;

  // Lesson summary state
  const { summary, isGenerating: isGeneratingSummary, generateSummary } = useLessonSummary(lessonId);

  useEffect(() => {
    setFlashcards(fetchedFlashcards.map((fc) => ({ ...fc, revealed: false })));
  }, [fetchedFlashcards]);

  const activeLesson: PlayerLesson = (() => {
    const all: PlayerLesson[] = [];
    (courseData?.curriculum || []).forEach((sec) => {
      sec.lessons.forEach((les) => {
        all.push({
          ...les,
          completed: courseProgress[les.id]?.completed ?? false,
        });
      });
    });
    const idx = all.findIndex((l) => l.id === lessonId);
    return idx !== -1
      ? all[idx]
      : all[0] || {
          id: '',
          title: 'Welcome',
          duration: '12:45',
          isFree: true,
          position: 1,
          videoUrl: null,
          isLocked: false,
        };
  })();

  // Reset player state when the active lesson changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    lastProgressRef.current = 0;
  }, [lessonId]);

  // Anti-download / anti-leak guard
  useEffect(() => {
    if (!activeLesson?.videoUrl) return;

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('[data-video-container]')) {
        e.preventDefault();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && ['s', 'u', 'p'].includes(e.key.toLowerCase())) ||
        (e.metaKey && ['s', 'u'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        showPlayerToast('Screen capture and downloads are disabled for protected content.');
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden && videoRef.current) {
        videoRef.current.pause();
      }
    };

    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activeLesson?.videoUrl]);

  // Attach Hls.js (or native HLS on Safari) when a real video URL is available
  useEffect(() => {
    if (!activeLesson?.videoUrl || !videoRef.current) return;

    const video = videoRef.current;
    const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
    const source = activeLesson.videoUrl.startsWith('http')
      ? activeLesson.videoUrl
      : `${apiBase}${activeLesson.videoUrl}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          xhr.withCredentials = true;
        },
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      video.crossOrigin = 'use-credentials';
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [activeLesson?.videoUrl]);

  // Sync play/pause state with the real video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeLesson?.videoUrl) return;

    if (isPlaying) {
      video.play().catch(() => setIsPlaying(false));
    } else {
      video.pause();
    }
  }, [isPlaying, activeLesson?.videoUrl]);

  // Sync mute and playback speed with the real video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 rounded-full border-4 border-[#B7E4C7] border-t-[#2D6A4F] animate-spin" />
      </div>
    );
  }

  if (error || !courseData) {
    return (
      <div className="rounded-2xl p-12 bg-white border border-gray-100 text-center shadow-sm">
        <h3 className="font-bold text-[#2D6A4F] text-lg">Course not found</h3>
        <p className="text-xs text-gray-500 mt-1">
          The course you are looking for does not exist or is no longer available.
        </p>
        <Link
          to="/browse"
          className="mt-4 inline-block px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
        >
          Back to Catalog
        </Link>
      </div>
    );
  }

  const course = courseData;

  // Flatten all lessons across sections and merge completion state
  const allLessons: PlayerLesson[] = [];
  (course.curriculum || []).forEach((sec) => {
    sec.lessons.forEach((les) => {
      allLessons.push({
        ...les,
        completed: courseProgress[les.id]?.completed ?? false,
      });
    });
  });

  const enrollment = enrollments.find((e) => e.id === course.id);
  const enrollmentProgress = enrollment?.progress ?? 0;

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const seconds = Math.floor(video.currentTime);
    setCurrentTime(seconds);

    if (activeLesson.videoUrl && seconds - lastProgressRef.current >= 10) {
      markProgress(seconds, false);
      lastProgressRef.current = seconds;
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video && !isNaN(video.duration)) {
      setDuration(Math.floor(video.duration));
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    if (activeLesson.videoUrl) {
      markProgress(Math.floor(videoRef.current?.duration ?? duration), true);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    await addNote(newNoteText.trim(), Math.floor(currentTime));
    setNewNoteText('');
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNote(noteId);
  };

  const handleSendAiQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim()) return;
    sendMessage(aiInput.trim());
    setAiInput('');
  };

  const toggleFlashcard = (id: string) => {
    setFlashcards((prev) =>
      prev.map((fc) => (fc.id === id ? { ...fc, revealed: !fc.revealed } : fc))
    );
  };

  const handleSelectLesson = (lesson: PlayerLesson) => {
    if (lesson.isLocked) {
      showPlayerToast('This lesson is locked. Please complete prior modules or enroll in the full course.');
      return;
    }
    navigate(`/course/${course.id}/lesson/${lesson.id}`);
  };

  const activeIndex = allLessons.findIndex((l) => l.id === activeLesson.id);
  const nextLesson = allLessons[activeIndex + 1];
  const prevLesson = allLessons[activeIndex - 1];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Return to Course Link */}
      <div className="flex items-center justify-between">
        <Link
          to={`/course/${course.id}`}
          className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-[#2D6A4F] transition-colors bg-white px-3.5 py-2 rounded-xl border border-gray-100 shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Course Overview</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to={`/course/${course.id}/community`}
            className="text-xs font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-3 py-1.5 rounded-xl hover:bg-[#B7E4C7]/60 transition-colors"
          >
            Course Community Board
          </Link>
        </div>
      </div>

      {/* Main Grid: Video Player (Left ~ 75%) + Right Curriculum Sidebar (320px) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Video Player & Below-Player Tabbed Panel */}
        <div className="xl:col-span-8 space-y-6">
          {/* Video Player Container */}
          <div
            data-video-container
            className="rounded-2xl overflow-hidden bg-gray-950 border border-gray-900 shadow-xl relative aspect-video flex flex-col justify-between group select-none"
          >
            {/* Real HLS video (when available) */}
            {activeLesson.videoUrl && (
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                preload="metadata"
                muted={isMuted}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
              />
            )}

            {/* User watermark overlay */}
            {activeLesson.videoUrl && user && (
              <div className="absolute inset-0 pointer-events-none z-[5] flex items-center justify-center overflow-hidden opacity-20">
                <div
                  className="text-white font-bold text-lg whitespace-nowrap rotate-[-25deg] select-none"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                >
                  {user.email} • {user.id.slice(0, 8)}
                </div>
              </div>
            )}

            {/* Ambient Background Visual (Placeholder Video Content) */}
            {!activeLesson.videoUrl && (
              <div
                className="absolute inset-0 bg-cover bg-center opacity-40 transition-opacity"
                style={{
                  backgroundImage: `url('${course.thumbnail}')`,
                }}
              />
            )}

            {/* Video Overlay Top Bar */}
            <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold bg-[#2D6A4F] text-white px-2.5 py-0.5 rounded-full">
                  Lesson {activeIndex + 1} of {allLessons.length}
                </span>
                <h2 className="text-white font-bold text-sm sm:text-base line-clamp-1">
                  {activeLesson.title}
                </h2>
              </div>
              <span className="text-[11px] font-mono text-emerald-300 bg-black/40 px-2 py-0.5 rounded border border-white/10">
                1080p 60fps
              </span>
            </div>

            {/* Center Big Play Button Overlay (when paused or placeholder) */}
            {(!activeLesson.videoUrl || !isPlaying) && (
              <div className="relative z-10 flex items-center justify-center my-auto">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#2D6A4F]/90 hover:bg-[#2D6A4F] text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-8 h-8 fill-current" />
                  ) : (
                    <Play className="w-8 h-8 fill-current ml-1" />
                  )}
                </button>
              </div>
            )}

            {/* Video Controls Bar Bottom */}
            <div className="relative z-10 p-4 sm:p-5 bg-gradient-to-t from-black/90 via-black/60 to-transparent space-y-3">
              {/* Scrubber Progress Bar */}
              <div className="relative w-full">
                <input
                  type="range"
                  min="0"
                  max={duration}
                  value={currentTime}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setCurrentTime(value);
                    if (videoRef.current) videoRef.current.currentTime = value;
                  }}
                  className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#2D6A4F]"
                />
              </div>

              {/* Bottom Control Buttons */}
              <div className="flex items-center justify-between text-white text-xs">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-1.5 hover:text-emerald-300 transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 fill-current" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" />
                    )}
                  </button>

                  <button
                    onClick={() => {
                      const value = Math.max(0, currentTime - 10);
                      setCurrentTime(value);
                      if (videoRef.current) videoRef.current.currentTime = value;
                    }}
                    className="p-1.5 hover:text-emerald-300 transition-colors"
                    title="Rewind 10 seconds"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 hover:text-emerald-300 transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>

                  <span className="font-mono text-gray-300 text-xs">
                    {formatSeconds(currentTime)} / {formatSeconds(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Speed Selector */}
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="bg-black/50 border border-white/20 text-white rounded-lg px-2 py-0.5 text-xs font-semibold focus:outline-none"
                  >
                    <option value="0.75">0.75x</option>
                    <option value="1">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2.0x</option>
                  </select>

                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        videoRef.current.requestFullscreen?.();
                      }
                    }}
                    className="p-1.5 hover:text-emerald-300 transition-colors"
                    title="Fullscreen"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Previous / Next Lesson Navigation Bar */}
          <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-2xs">
            <button
              disabled={!prevLesson}
              onClick={() => prevLesson && handleSelectLesson(prevLesson)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] disabled:opacity-30 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Lesson</span>
            </button>

            <span className="text-xs text-gray-500 font-semibold hidden sm:inline-block">
              {activeLesson.title}
            </span>

            <button
              disabled={!nextLesson}
              onClick={() => nextLesson && handleSelectLesson(nextLesson)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-2xs"
            >
              <span>Next Lesson</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* TABBED PANEL BELOW VIDEO (Notes, AI Tutor, Resources) */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-6 space-y-6">
            {/* Tabs Header */}
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <button
                onClick={() => setBottomTab('notes')}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  bottomTab === 'notes'
                    ? 'bg-[#2D6A4F] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-[#F8FAF9]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Notes ({notes.length})</span>
              </button>

              <button
                onClick={() => setBottomTab('ai-tutor')}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  bottomTab === 'ai-tutor'
                    ? 'bg-[#2D6A4F] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-[#F8FAF9]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Tutor & Flashcards</span>
              </button>

              <button
                onClick={() => setBottomTab('resources')}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  bottomTab === 'resources'
                    ? 'bg-[#2D6A4F] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-[#F8FAF9]'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Resources ({resources.length})</span>
              </button>

              <button
                onClick={() => setBottomTab('quiz')}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                  bottomTab === 'quiz'
                    ? 'bg-[#2D6A4F] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-[#F8FAF9]'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                <span>Quiz</span>
              </button>
            </div>

            {/* TAB A: NOTES (Text area + timestamped notes list) */}
            {bottomTab === 'notes' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                <form onSubmit={handleAddNote} className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold">
                      Add a note at timestamp{' '}
                      <span className="text-[#2D6A4F] font-mono font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                        {formatSeconds(currentTime)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewNoteText((prev) => `${prev} [At ${formatSeconds(currentTime)}] `)
                      }
                      className="text-[#2D6A4F] font-bold hover:underline"
                    >
                      Insert Current Time
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Capture your reflection, questions, or key takeaway here..."
                    className="w-full px-4 py-3 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                  />

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!newNoteText.trim()}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-40 text-white text-xs font-bold transition-colors shadow-2xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Save Timestamped Note</span>
                    </button>
                  </div>
                </form>

                {/* Saved Notes Feed */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Your Saved Notes for this Lesson
                  </h4>

                  {notesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading notes...</span>
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No notes created yet.</p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="p-4 rounded-xl bg-[#F8FAF9] border border-gray-100 flex items-start justify-between gap-4 hover:bg-emerald-50/30 transition-colors"
                      >
                        <div className="space-y-1.5">
                          <button
                            onClick={() => setCurrentTime(note.timestampSeconds)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold font-mono text-[#2D6A4F] bg-white border border-emerald-200 px-2 py-0.5 rounded-md shadow-2xs hover:bg-[#2D6A4F] hover:text-white transition-colors"
                            title="Jump to timestamp"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{formatSeconds(note.timestampSeconds)}</span>
                          </button>
                          <p className="text-xs sm:text-sm text-gray-800 leading-relaxed">
                            {note.content}
                          </p>
                        </div>

                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB B: AI TUTOR (Chat interface + "Generate Flashcards" button + 3 flashcard divs) */}
            {bottomTab === 'ai-tutor' && (
              <div className="space-y-6 animate-in fade-in duration-150">
                {/* Header Action: Generate Flashcards button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-[#F8FAF9] border border-emerald-100">
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-gray-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#2D6A4F]" />
                      <span>Instant Lesson Knowledge Check</span>
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Generate 5 interactive flashcards based on this video lesson
                    </p>
                  </div>

                  <button
                    onClick={generateFlashcards}
                    disabled={isGeneratingFlashcards}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-60 text-white text-xs font-bold shadow-2xs transition-all self-start sm:self-auto"
                  >
                    {isGeneratingFlashcards ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}
                    <span>{isGeneratingFlashcards ? 'Generating...' : 'Generate Flashcards'}</span>
                  </button>
                </div>

                {flashcardsError && (
                  <p className="text-xs text-red-600">{flashcardsError}</p>
                )}

                {/* Flashcards Divs (Question on Front, Answer on click) */}
                {hasGeneratedFlashcards && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                        Study Flashcards (Click any card to reveal answer)
                      </h4>
                      <span className="text-[11px] text-emerald-700 font-bold">
                        {flashcards.filter((f) => f.revealed).length} / {flashcards.length} revealed
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {flashcards.map((fc, index) => (
                        <div
                          key={fc.id}
                          onClick={() => toggleFlashcard(fc.id)}
                          className={`rounded-2xl p-5 border cursor-pointer transition-all duration-300 min-h-[160px] flex flex-col justify-between shadow-2xs ${
                            fc.revealed
                              ? 'bg-emerald-900 text-white border-emerald-800 shadow-md'
                              : 'bg-white text-[#1B1B1B] border-gray-200 hover:border-[#2D6A4F] hover:shadow'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  fc.revealed ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                Flashcard #{index + 1}
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  fc.revealed ? 'text-emerald-200' : 'text-[#2D6A4F]'
                                }`}
                              >
                                {fc.revealed ? 'Answer' : 'Tap to Flip'}
                              </span>
                            </div>

                            <p
                              className={`text-xs sm:text-sm font-bold leading-snug ${
                                fc.revealed ? 'text-emerald-100' : 'text-gray-900'
                              }`}
                            >
                              {fc.revealed ? fc.answer : fc.question}
                            </p>
                          </div>

                          <div className="pt-2 text-[10px] font-medium opacity-70">
                            {fc.revealed ? '✓ Click to hide' : 'Tap to reveal solution'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lesson Summary */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs sm:text-sm text-gray-900 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
                      <span>Lesson Summary</span>
                    </h4>
                  </div>

                  {!summary && !isGeneratingSummary && (
                    <button
                      onClick={generateSummary}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] text-white text-xs font-bold shadow-2xs transition-all"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Generate Summary</span>
                    </button>
                  )}

                  {isGeneratingSummary && (
                    <button
                      disabled
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2D6A4F] disabled:opacity-60 text-white text-xs font-bold shadow-2xs transition-all"
                    >
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating...</span>
                    </button>
                  )}

                  {summary && (
                    <div className="space-y-2">
                      {summary.split('\n').map((line, idx) => (
                        <p key={idx} className="text-xs text-gray-700 leading-relaxed pl-2">
                          {line.trim()}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Chat Stream */}
                <div className="space-y-4 pt-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Lesson Discussion with Nudra AI
                  </h4>

                  <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                    {aiChatMessages.length === 0 && !isAiStreaming && (
                      <div className="text-center py-8 text-gray-400 text-xs">
                        Ask me anything about this lesson
                      </div>
                    )}

                    {aiChatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex items-start gap-2.5 ${
                          msg.role === 'user' ? 'flex-row-reverse' : ''
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="w-7 h-7 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5" />
                          </div>
                        ) : user?.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name ?? 'You'}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center shrink-0 text-[10px] font-bold">
                            {getInitials(user?.name)}
                          </div>
                        )}

                        <div
                          className={`max-w-md rounded-2xl p-3.5 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-[#2D6A4F] text-white rounded-tr-xs'
                              : 'bg-[#F8FAF9] text-gray-800 border border-gray-100 rounded-tl-xs shadow-2xs'
                          }`}
                        >
                          <div className="whitespace-pre-line">{msg.text}</div>
                        </div>
                      </div>
                    ))}

                    {isAiStreaming && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 p-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-bounce"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-bounce delay-100"></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-bounce delay-200"></div>
                        <span>Formulating answer for this video timestamp...</span>
                      </div>
                    )}
                  </div>

                  {aiError && (
                    <p className="text-xs text-red-600">{aiError}</p>
                  )}

                  {/* Chat Input */}
                  <form onSubmit={handleSendAiQuestion} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      placeholder="Ask a question about this lesson's concepts or code..."
                      className="flex-1 px-4 py-2.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                    />
                    <button
                      type="submit"
                      disabled={!aiInput.trim() || isAiStreaming}
                      className="p-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#23533e] disabled:opacity-40 text-white font-bold transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB C: RESOURCES (List of downloadable PDFs) */}
            {bottomTab === 'resources' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Downloadable Materials for this Module
                  </h4>
                  <span className="text-xs text-gray-400">{resources.length} files available</span>
                </div>

                {resourcesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500 py-6">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading resources...</span>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-[#F8FAF9]/50">
                    {resources.map((file) => (
                      <div
                        key={file.id}
                        className="p-4 flex items-center justify-between gap-4 bg-white hover:bg-emerald-50/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#2D6A4F] flex items-center justify-center font-bold text-xs border border-emerald-100 shrink-0">
                            {file.file_format}
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-bold text-gray-900 leading-snug">
                              {file.title}
                            </p>
                            <span className="text-[11px] text-gray-400">
                              {file.filename} • {file.file_size_text ?? ''}
                            </span>
                          </div>
                        </div>

                        <a
                          href={file.file_url}
                          download={file.filename}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#2D6A4F] hover:text-white hover:border-[#2D6A4F] transition-all shadow-2xs shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (320px ~ col-span-4 on XL): Course Curriculum List */}
        <aside className="xl:col-span-4 w-full xl:w-[320px] sticky top-24 space-y-4">
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-sm text-gray-900">Course Syllabus</h3>
                <p className="text-[11px] text-gray-500">
                  {allLessons.filter((l) => l.completed).length} of {allLessons.length} lessons completed
                </p>
              </div>
              <span className="text-xs font-bold text-[#2D6A4F] bg-[#B7E4C7]/40 px-2 py-0.5 rounded-md">
                {enrollmentProgress}%
              </span>
            </div>

            {/* Curriculum Sections & Lessons List */}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {(course.curriculum || []).map((section) => (
                <div key={section.id} className="space-y-1.5">
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-2">
                    {section.title}
                  </h4>

                  <div className="space-y-1">
                    {section.lessons.map((lesson) => {
                      const isCurrent = lesson.id === activeLesson.id;
                      const completed = courseProgress[lesson.id]?.completed ?? false;
                      return (
                        <button
                          key={lesson.id}
                          onClick={() => handleSelectLesson(lesson)}
                          className={`w-full text-left p-3 rounded-xl flex items-center justify-between text-xs transition-all ${
                            isCurrent
                              ? 'bg-[#2D6A4F] text-white shadow-sm font-bold'
                              : 'text-gray-700 hover:bg-[#F8FAF9]'
                          } ${lesson.isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            {lesson.isLocked ? (
                              <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            ) : completed ? (
                              <CheckCircle2
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isCurrent ? 'text-white' : 'text-[#2D6A4F]'
                                }`}
                              />
                            ) : (
                              <Play
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isCurrent ? 'fill-white text-white' : 'text-gray-400'
                                }`}
                              />
                            )}
                            <span className="truncate">{lesson.title}</span>
                          </div>

                          <span
                            className={`font-mono text-[10px] shrink-0 ${
                              isCurrent ? 'text-emerald-100' : 'text-gray-400'
                            }`}
                          >
                            {lesson.duration}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export const VideoPlayerPage = withErrorBoundary(VideoPlayerPageInner);
