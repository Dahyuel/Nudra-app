import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Upload,
  Plus,
  Trash2,
  Video,
  DollarSign,
  BookOpen,
  Sparkles,
  FileCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

interface UploadLesson {
  id: string;
  title: string;
  duration: string;
  videoFileName: string;
  isFree?: boolean;
}

// Client-side placeholder ids ("sec-1", "l-1700000000") mark items not saved yet.
const isSavedId = (id: string) => !id.startsWith('l-') && !id.startsWith('sec-');

interface EditCourseResponse {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string | number;
  originalPrice: string | number | null;
  thumbnailUrl: string | null;
  isPublished: boolean;
  curriculum: {
    id: string;
    title: string;
    lessons: { id: string; title: string; durationText: string | null; isFree: boolean; hasVideo: boolean }[];
  }[];
}

interface UploadSection {
  id: string;
  title: string;
  lessons: UploadLesson[];
}

interface VideoUploadStatus {
  status: string;
  errorMsg?: string;
  uploading: boolean;
  progress?: number;
}

interface QuizQuestionDraft {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}

const emptyQuestion = (): QuizQuestionDraft => ({
  questionText: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'a',
  explanation: '',
});

export const UploadCoursePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const organizationQuery = user?.organizationContext ? `?org=${encodeURIComponent(user.organizationContext.slug)}` : '';
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Edit mode: /instructor/upload?edit=<courseId> (from "Edit" on My Courses)
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [loadingCourse, setLoadingCourse] = useState(!!editId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alreadyPublished, setAlreadyPublished] = useState(false);

  // Step 1: Basic Info
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Physics');

  // Step 2: Curriculum
  const [sections, setSections] = useState<UploadSection[]>([
    {
      id: 'sec-1',
      title: 'Introduction & Core Fundamentals',
      lessons: [
        {
          id: 'l-1',
          title: 'Welcome & Overview of syllabus',
          duration: '10:30',
          videoFileName: 'intro_lecture.mp4',
        },
      ],
    },
  ]);

  // Step 3: Pricing
  const [isFree, setIsFree] = useState(false);
  const [priceEgp, setPriceEgp] = useState<number>(450);
  const [discountPercent, setDiscountPercent] = useState<number>(20);

  // Publish Status
  const [isPublished, setIsPublished] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'online' | 'offline'>('online');
  const [location, setLocation] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [scheduleText, setScheduleText] = useState('');
  // Default seats per session for an offline course. Stored on the course so
  // the instructor only sets it once; each session can still be overridden
  // in the Offline course sessions panel.
  const [maxSeats, setMaxSeats] = useState('');

  // API state
  const [courseId, setCourseId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Per-lesson video upload status (keyed by real lesson id)
  const [videoUploads, setVideoUploads] = useState<Record<string, VideoUploadStatus>>({});
  // Pending video files selected before the curriculum has been saved (keyed by current lesson id)
  const [pendingVideoFiles, setPendingVideoFiles] = useState<Record<string, File>>({});
  const fetchedStatusRef = useRef<Set<string>>(new Set());

  const [openQuizLessonId, setOpenQuizLessonId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionDraft[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [quizSaving, setQuizSaving] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizSavedLessonId, setQuizSavedLessonId] = useState<string | null>(null);

  // Load an existing course into the form when editing.
  useEffect(() => {
    if (!editId) return;
    let active = true;
    setLoadingCourse(true);
    setLoadError(null);
    api
      .get(`/api/instructor/courses/${editId}`)
      .then(({ data }) => {
        if (!active) return;
        const c = data.course as EditCourseResponse;
        setCourseId(c.id);
        setTitle(c.title);
        setDescription(c.description);
        setSubject(c.category);
        setThumbnailUrl(c.thumbnailUrl);
        setAlreadyPublished(c.isPublished);
        setDeliveryMode((c as any).deliveryMode || 'online');
        setLocation((c as any).location || '');
        setBookingUrl((c as any).bookingUrl || '');
        setScheduleText((c as any).scheduleText || '');
        setMaxSeats((c as any).capacity != null ? String((c as any).capacity) : '');

        // Stored as price = what students pay, originalPrice = struck-through full price.
        const price = Number(c.price) || 0;
        const original = c.originalPrice != null ? Number(c.originalPrice) : null;
        setIsFree(price === 0);
        if (original && original > price) {
          setPriceEgp(original);
          setDiscountPercent(Math.round((1 - price / original) * 100));
        } else {
          setPriceEgp(price || 450);
          setDiscountPercent(0);
        }

        if (c.curriculum.length > 0) {
          setSections(
            c.curriculum.map((sec) => ({
              id: sec.id,
              title: sec.title,
              lessons: sec.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                duration: l.durationText ?? '',
                // Non-empty name makes the builder fetch this lesson's video status.
                videoFileName: l.hasVideo ? 'Uploaded video' : '',
                isFree: l.isFree,
              })),
            }))
          );
        }
      })
      .catch((err) => {
        if (active) setLoadError(err?.response?.data?.message || 'Could not load this course for editing.');
      })
      .finally(() => {
        if (active) setLoadingCourse(false);
      });
    return () => {
      active = false;
    };
  }, [editId]);

  const handleThumbnailChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailFile(file);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('thumbnail', file);
      const { data } = await api.post('/api/instructor/upload/thumbnail', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setThumbnailUrl(data.url);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Thumbnail upload failed');
    }
  };

  const fetchVideoStatus = async (lessonId: string) => {
    if (!lessonId) return;
    try {
      const { data } = await api.get(`/api/instructor/lessons/${lessonId}/video-status`);
      setVideoUploads((prev) => ({
        ...prev,
        [lessonId]: {
          status: data.status,
          errorMsg: data.error_msg,
          uploading: false,
        },
      }));
    } catch (err: any) {
      setVideoUploads((prev) => ({
        ...prev,
        [lessonId]: {
          status: 'error',
          errorMsg: err?.response?.data?.message || 'Failed to fetch status',
          uploading: false,
        },
      }));
    }
  };

  const uploadVideoFile = async (lessonId: string, file: File) => {
    if (!lessonId || lessonId.startsWith('l-')) return;

    setVideoUploads((prev) => ({
      ...prev,
      [lessonId]: { status: 'uploading', uploading: true },
    }));

    let uploadId: string | undefined;
    try {
      const { data: upload } = await api.post(`/api/instructor/lessons/${lessonId}/video-uploads`, {
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type || 'application/octet-stream',
      });
      uploadId = upload.uploadId as string;
      const uploadedBytes = new Array<number>(upload.totalParts).fill(0);
      let nextPart = 0;
      let uploadFailed = false;
      const updateProgress = () => {
        const progress = Math.min(99, Math.round(uploadedBytes.reduce((sum, value) => sum + value, 0) / file.size * 100));
        setVideoUploads((prev) => ({ ...prev, [lessonId]: { status: 'uploading', uploading: true, progress } }));
      };
      const uploadWorker = async () => {
        while (!uploadFailed && nextPart < upload.totalParts) {
          const partIndex = nextPart++;
          const start = partIndex * upload.partSize;
          const blob = file.slice(start, Math.min(start + upload.partSize, file.size));
          let saved = false;
          for (let attempt = 0; attempt < 3 && !saved; attempt++) {
            uploadedBytes[partIndex] = 0;
            updateProgress();
            try {
              await api.put(`/api/instructor/lessons/${lessonId}/video-uploads/${uploadId}/parts/${partIndex + 1}`, blob, {
                headers: { 'Content-Type': 'application/octet-stream' },
                onUploadProgress: (event) => {
                  uploadedBytes[partIndex] = Math.min(blob.size, event.loaded);
                  updateProgress();
                },
              });
              uploadedBytes[partIndex] = blob.size;
              updateProgress();
              saved = true;
            } catch (err) {
              if (attempt === 2) {
                uploadFailed = true;
                throw err;
              }
            }
          }
        }
      };
      const workers = await Promise.allSettled(Array.from({ length: Math.min(3, upload.totalParts) }, uploadWorker));
      const failedWorker = workers.find((worker) => worker.status === 'rejected');
      if (failedWorker?.status === 'rejected') throw failedWorker.reason;
      await api.post(`/api/instructor/lessons/${lessonId}/video-uploads/${uploadId}/complete`);
      setVideoUploads((prev) => ({
        ...prev,
        [lessonId]: { status: 'pending', uploading: false },
      }));
      // Fetch status immediately so the label switches from "Transcoding..." quickly
      await fetchVideoStatus(lessonId);
    } catch (err: any) {
      if (uploadId) await api.delete(`/api/instructor/lessons/${lessonId}/video-uploads/${uploadId}`).catch(() => {});
      setVideoUploads((prev) => ({
        ...prev,
        [lessonId]: {
          status: 'error',
          errorMsg: err?.response?.data?.message || 'Upload failed',
          uploading: false,
        },
      }));
    }
  };

  const handleVideoFileSelect = (sectionId: string, lessonId: string, file: File | undefined) => {
    if (!file) return;

    setSections((prev) =>
      prev.map((sec) =>
        sec.id === sectionId
          ? {
              ...sec,
              lessons: sec.lessons.map((l) =>
                l.id === lessonId ? { ...l, videoFileName: file.name } : l
              ),
            }
          : sec
      )
    );

    if (lessonId.startsWith('l-')) {
      setPendingVideoFiles((prev) => ({ ...prev, [lessonId]: file }));
      return;
    }

    uploadVideoFile(lessonId, file);
  };

  const openQuizBuilder = async (lessonId: string) => {
    if (openQuizLessonId === lessonId) {
      setOpenQuizLessonId(null);
      return;
    }
    setOpenQuizLessonId(lessonId);
    setQuizQuestions([]);
    setQuizError(null);
    setQuizSavedLessonId(null);
    if (lessonId.startsWith('l-')) return;
    setQuizLoading(true);
    try {
      const { data } = await api.get(`/api/instructor/lessons/${lessonId}/quiz`);
      if (data?.quiz?.questions?.length) {
        setQuizQuestions(
          data.quiz.questions.map((q: any) => ({
            questionText: q.questionText,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctOption: q.correctOption,
            explanation: q.explanation ?? '',
          }))
        );
      }
    } catch {
      setQuizError('Failed to load existing quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  const generateQuizWithAI = async (lessonId: string) => {
    setQuizGenerating(true);
    setQuizError(null);
    try {
      const { data } = await api.post(`/api/instructor/lessons/${lessonId}/quiz/generate`);
      setQuizQuestions(
        (data.questions ?? []).map((q: any) => ({
          questionText: q.questionText,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctOption: q.correctOption,
          explanation: q.explanation ?? '',
        }))
      );
    } catch (err: any) {
      setQuizError(
        err?.response?.status === 422
          ? 'Video must be transcribed before AI generation'
          : err?.response?.data?.message || 'Failed to generate quiz'
      );
    } finally {
      setQuizGenerating(false);
    }
  };

  const saveQuiz = async (lessonId: string) => {
    if (quizQuestions.length < 2) {
      setQuizError('At least 2 questions are required');
      return;
    }
    const hasEmptyFields = quizQuestions.some(q => !q.questionText.trim() || !q.optionA.trim() || !q.optionB.trim() || !q.optionC.trim() || !q.optionD.trim());
    if (hasEmptyFields) {
      setQuizError('Please fill out all question texts and options before saving.');
      return;
    }
    setQuizSaving(true);
    setQuizError(null);
    try {
      await api.post(`/api/instructor/lessons/${lessonId}/quiz`, {
        questions: quizQuestions.map((q, idx) => ({
          questionText: q.questionText,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          correctOption: q.correctOption,
          explanation: q.explanation ? q.explanation : undefined,
          position: idx + 1,
        })),
      });
      setQuizSavedLessonId(lessonId);
      setOpenQuizLessonId(null);
      setQuizQuestions([]);
    } catch (err: any) {
      setQuizError(err?.response?.data?.message || 'Failed to save quiz');
    } finally {
      setQuizSaving(false);
    }
  };

  const updateQuizQuestion = (index: number, field: keyof QuizQuestionDraft, value: string) => {
    setQuizQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  };

  const retryTranscript = async (lessonId: string) => {
    setVideoUploads((prev) => ({ ...prev, [lessonId]: { status: 'transcribed', uploading: false } }));
    try {
      await api.post(`/api/instructor/lessons/${lessonId}/retry-transcript`);
    } catch (err: any) {
      setVideoUploads((prev) => ({
        ...prev,
        [lessonId]: {
          status: 'transcript_failed',
          errorMsg: err?.response?.data?.message || 'Retry failed',
          uploading: false,
        },
      }));
    }
  };

  const getVideoStatusLabel = (lessonId: string) => {
    const status = videoUploads[lessonId];
    if (!status) return null;

    if (status.uploading) {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Uploading {status.progress ?? 0}%...
        </span>
      );
    }

    switch (status.status) {
      case 'pending':
      case 'transcoding':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Transcoding...
          </span>
        );
      case 'transcribed':
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Processing transcript...
          </span>
        );
      case 'done':
        return <span className="text-[11px] font-bold text-emerald-600">✓ Ready</span>;
      case 'transcript_failed':
        // The video plays; only the transcript (needed for AI summary/flashcards/quiz) failed.
        return (
          <span className="inline-flex items-center gap-2 text-[11px] font-bold">
            <span className="text-amber-600" title={status.errorMsg || 'Transcript failed'}>
              ⚠ Video ready, transcript failed
            </span>
            <button
              type="button"
              onClick={() => retryTranscript(lessonId)}
              className="px-2 py-0.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              Retry transcript
            </button>
          </span>
        );
      case 'error':
        return (
          <span
            className="text-[11px] font-bold text-red-600"
            title={status.errorMsg || 'Upload failed'}
          >
            ✗ Failed
          </span>
        );
      default:
        return null;
    }
  };

  // Poll video transcoding status for any in-progress uploads
  useEffect(() => {
    const pollingIds = Object.entries(videoUploads)
      .filter(
        ([, s]) =>
          !s.uploading &&
          s.status !== 'done' &&
          s.status !== 'error' &&
          s.status !== 'transcript_failed' &&
          s.status !== 'not_uploaded'
      )
      .map(([lessonId]) => lessonId);

    if (pollingIds.length === 0) return;

    const interval = setInterval(() => {
      pollingIds.forEach((lessonId) => fetchVideoStatus(lessonId));
    }, 5000);

    return () => clearInterval(interval);
  }, [videoUploads, fetchVideoStatus]);

  // Fetch initial video status when the curriculum builder shows real lesson ids
  useEffect(() => {
    if (currentStep !== 2 || !courseId) return;

    sections.forEach((sec) => {
      sec.lessons.forEach((les) => {
        if (
          !les.id.startsWith('l-') &&
          les.videoFileName &&
          !videoUploads[les.id] &&
          !fetchedStatusRef.current.has(les.id)
        ) {
          fetchedStatusRef.current.add(les.id);
          fetchVideoStatus(les.id);
        }
      });
    });
  }, [currentStep, courseId, sections, videoUploads, fetchVideoStatus]);

  const handleNext = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      if (currentStep === 1) {
        const seats = Number(maxSeats);
        const basicInfo = {
          title: title || 'Untitled Masterclass',
          description: description || 'Comprehensive curriculum with video lessons.',
          category: subject,
          thumbnail_url: thumbnailUrl,
          delivery_mode: deliveryMode,
          location: location || undefined,
          booking_url: bookingUrl || undefined,
          schedule_text: scheduleText || undefined,
          // Only offline courses have a default seat count; the backend
          // ignores it for online courses (there's no in-person capacity).
          capacity: deliveryMode === 'offline' && Number.isInteger(seats) && seats > 0 ? seats : undefined,
        };
        if (courseId) {
          // Editing, or came Back to step 1: update instead of creating a duplicate course.
          await api.put(`/api/instructor/courses/${courseId}`, basicInfo);
        } else {
          const { data } = await api.post('/api/instructor/courses', { ...basicInfo, level: 'Beginner' });
          setCourseId(data.course.id);
        }
      } else if (currentStep === 2 && courseId) {
        const oldSections = sections;
        // Saved sections/lessons carry their id so the server updates them in place
        // (keeping videos, quizzes and student progress) instead of re-creating them.
        const payloadSections = oldSections.map((s, sIdx) => ({
          ...(isSavedId(s.id) ? { id: s.id } : {}),
          title: s.title,
          position: sIdx + 1,
          lessons: s.lessons.map((l, lIdx) => ({
            ...(isSavedId(l.id) ? { id: l.id } : {}),
            title: l.title,
            duration_text: l.duration,
            position: lIdx + 1,
            is_free: !!l.isFree,
          })),
        }));
        const { data } = await api.put(`/api/instructor/courses/${courseId}`, { sections: payloadSections });

        const returnedCurriculum = data.course.curriculum || [];
        const newSections: UploadSection[] = returnedCurriculum.map((sec: any, sIdx: number) => ({
          id: sec.id,
          title: oldSections[sIdx]?.title || sec.title,
          lessons: (sec.lessons || []).map((les: any, lIdx: number) => {
            const oldLesson = oldSections[sIdx]?.lessons[lIdx];
            return {
              id: les.id,
              title: oldLesson?.title || les.title,
              duration: les.durationText || oldLesson?.duration || '12:00',
              videoFileName: oldLesson?.videoFileName || '',
              isFree: les.isFree ?? oldLesson?.isFree ?? false,
            };
          }),
        }));
        setSections(newSections);

        // Upload any videos selected before the curriculum was saved
        for (let sIdx = 0; sIdx < oldSections.length; sIdx++) {
          for (let lIdx = 0; lIdx < oldSections[sIdx].lessons.length; lIdx++) {
            const oldId = oldSections[sIdx].lessons[lIdx].id;
            const newId = newSections[sIdx]?.lessons[lIdx]?.id;
            const file = pendingVideoFiles[oldId];
            if (file && newId) {
              uploadVideoFile(newId, file);
            }
          }
        }
        setPendingVideoFiles({});
      } else if (currentStep === 3 && courseId) {
        // Students pay the discounted price; the full price is the struck-through
        // "original" price (these used to be saved the other way round).
        const hasDiscount = !isFree && discountPercent > 0;
        await api.put(`/api/instructor/courses/${courseId}`, {
          delivery_mode: deliveryMode,
          location: location || undefined,
          booking_url: bookingUrl || undefined,
          schedule_text: scheduleText || undefined,
          price: isFree ? 0 : hasDiscount ? Math.round(priceEgp * (1 - discountPercent / 100)) : priceEgp,
          original_price: hasDiscount ? priceEgp : null,
        });
      }
      setCurrentStep((prev) => (prev + 1) as any);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async () => {
    if (!courseId) return;
    // Every step already saved its changes; a published course just goes back to the list.
    if (alreadyPublished) {
      navigate('/instructor/courses');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (user?.organizationContext) {
        await api.put(`/api/instructor/courses/${courseId}`, { delivery_mode: deliveryMode, location: location || undefined, booking_url: bookingUrl || undefined, schedule_text: scheduleText || undefined });
        setIsPublished(false);
      } else {
        await api.post(`/api/instructor/courses/${courseId}/publish`);
        setIsPublished(true);
      }
      navigate('/instructor/courses');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to publish course');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions for curriculum
  const handleAddSection = () => {
    const newSec: UploadSection = {
      id: `sec-${Date.now()}`,
      title: `Section ${sections.length + 1}: New Topic`,
      lessons: [
        {
          id: `l-${Date.now()}`,
          title: 'Lesson 1: Key Principles',
          duration: '15:00',
          videoFileName: '',
        },
      ],
    };
    setSections([...sections, newSec]);
  };

  const handleRemoveSection = (sectionId: string) => {
    if (sections.length <= 1) return;
    setSections(sections.filter((s) => s.id !== sectionId));
  };

  const handleAddLesson = (sectionId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === sectionId) {
          const newLesson: UploadLesson = {
            id: `l-${Date.now()}`,
            title: `Lesson ${sec.lessons.length + 1}: Next Concept`,
            duration: '12:00',
            videoFileName: '',
          };
          return { ...sec, lessons: [...sec.lessons, newLesson] };
        }
        return sec;
      })
    );
  };

  const handleRemoveLesson = (sectionId: string, lessonId: string) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === sectionId) {
          return { ...sec, lessons: sec.lessons.filter((l) => l.id !== lessonId) };
        }
        return sec;
      })
    );
  };

  const handleLessonChange = (
    sectionId: string,
    lessonId: string,
    field: 'title' | 'duration' | 'videoFileName',
    val: string
  ) => {
    setSections((prev) =>
      prev.map((sec) => {
        if (sec.id === sectionId) {
          return {
            ...sec,
            lessons: sec.lessons.map((l) => (l.id === lessonId ? { ...l, [field]: val } : l)),
          };
        }
        return sec;
      })
    );
  };

  const subjectsList = [
    'Math',
    'Arabic',
    'English',
    'Physics',
    'Chemistry',
    'Biology',
    'History',
    'Geography',
    'General',
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          {editId ? 'Edit Course' : 'Upload & Publish Masterclass'}
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          {editId
            ? 'Each step saves when you continue. Lessons keep their videos, quizzes and student progress.'
            : 'Complete the 4-step curriculum builder to publish your course to the Nudra catalog'}
        </p>
      </div>

      {loadingCourse && (
        <div className="p-6 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin text-[#2D6A4F]" />
          Loading course...
        </div>
      )}
      {loadError && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <Link to={`/instructor/courses${organizationQuery}`} className="text-xs font-bold underline">
            Back to my courses
          </Link>
        </div>
      )}

      {/* 4-Step Progress Indicator */}
      <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { step: 1, label: 'Basic Info' },
            { step: 2, label: 'Curriculum' },
            { step: 3, label: 'Pricing' },
            { step: 4, label: 'Review & Publish' },
          ].map((s) => {
            const isDone = currentStep > s.step;
            const isCurrent = currentStep === s.step;

            return (
              <div
                key={s.step}
                // Jumping ahead before the course exists would skip saving it.
                onClick={() => {
                  if (courseId || s.step <= currentStep) setCurrentStep(s.step as any);
                }}
                className={`group space-y-1.5 ${courseId || s.step <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
              >
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isDone || isCurrent ? 'bg-[#2D6A4F]' : 'bg-gray-200'
                  }`}
                />
                <span
                  className={`text-xs font-bold block truncate ${
                    isCurrent
                      ? 'text-[#2D6A4F]'
                      : isDone
                      ? 'text-gray-900'
                      : 'text-gray-400 group-hover:text-gray-600'
                  }`}
                >
                  Step {s.step}: {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUCCESS BANNER WHEN PUBLISHED */}
      {isPublished ? (
        <div className="rounded-2xl p-8 bg-white border border-emerald-200 shadow-md text-center space-y-4 animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-[#2D6A4F] flex items-center justify-center mx-auto">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-gray-900">
            Course Successfully Published! 🎉
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            "{title || 'Applied Advanced Masterclass'}" is now live on the Nudra marketplace.
            Students can now enroll and begin streaming lessons.
          </p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <Link
              to={`/instructor/dashboard${organizationQuery}`}
              className="px-6 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9]"
            >
              Return to Studio Dashboard
            </Link>
            <Link
              to={user?.organizationContext ? `/organization?org=${encodeURIComponent(user.organizationContext.slug)}` : '/browse'}
              className="px-6 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] shadow-sm"
            >
              {user?.organizationContext ? 'View organization courses' : 'View in Course Catalog'}
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl p-6 sm:p-8 bg-white border border-gray-100 shadow-sm space-y-6">
          {/* STEP 1: BASIC INFO */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#2D6A4F]" />
                <span>Step 1: Course Title, Description & Academic Subject</span>
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Course format</label>
                  <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as 'online' | 'offline')} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm">
                    <option value="online">Online course</option><option value="offline">Offline course · booking only</option>
                  </select>
                  {user?.organizationContext && <p className="mt-1 text-xs text-amber-700">Your organization manager must approve this submission before students can see it.</p>}
                </div>
                {deliveryMode === 'offline' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-gray-700">Location<input required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Address or venue" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-normal" /></label><label className="text-xs font-bold text-gray-700">Schedule<input required value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} placeholder="Days and times" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-normal" /></label><label className="text-xs font-bold text-gray-700 sm:col-span-2">Max seats per session <span className="font-normal text-gray-500">(the default capacity for every session you add to this course — you can still change it per session)</span><input required type="number" min={1} max={10000} step={1} value={maxSeats} onChange={(e) => setMaxSeats(e.target.value)} placeholder="e.g. 20" className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-normal" /></label><label className="text-xs font-bold text-gray-700 sm:col-span-2">External booking link <span className="font-normal text-gray-500">(optional — only if you want students sent to an outside form instead of booking through Nudra)</span><input type="url" value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-normal" /></label></div>}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Course Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Modern Physics & Quantum Mechanics for High School"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Academic Subject
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] bg-white font-semibold"
                  >
                    {/* Keep an edited course's existing category even if it isn't in the default list */}
                    {(subjectsList.includes(subject) ? subjectsList : [subject, ...subjectsList]).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Course Description & Learning Outcomes
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe what students will master, prerequisites, and practical projects..."
                    className="w-full px-4 py-3 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Course Thumbnail
                  </label>
                  <div className="flex items-center gap-4">
                    {thumbnailUrl && (
                      <img
                        src={thumbnailUrl}
                        alt="Course thumbnail preview"
                        className="w-32 h-20 rounded-xl object-cover border border-gray-200"
                      />
                    )}
                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F8FAF9] border border-dashed border-gray-300 text-xs font-bold text-[#2D6A4F] hover:bg-emerald-50 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span>{thumbnailFile ? 'Change Image' : 'Upload Image (jpg, png, webp <5MB)'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleThumbnailChange}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && user?.organizationContext && <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-900">Your course details are saved. Submitting sends it to your organization manager for approval. It will appear to students after approval and publication.</div>}

          {/* STEP 2: CURRICULUM (Add Sections, Add Lessons, Upload Video) */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#2D6A4F]" />
                  <span>Step 2: {deliveryMode === 'offline' ? 'Session Plan & Topics' : 'Course Syllabus & Video Lessons'}</span>
                </h3>
                <button
                  type="button"
                  onClick={handleAddSection}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-[#2D6A4F] hover:bg-emerald-100 text-xs font-bold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Section</span>
                </button>
              </div>

              <div className="space-y-6">
                {sections.map((section, sIdx) => (
                  <div
                    key={section.id}
                    className="p-5 rounded-2xl bg-[#F8FAF9] border border-gray-200/80 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((s) => (s.id === section.id ? { ...s, title: e.target.value } : s))
                          )
                        }
                        className="font-bold text-sm text-gray-900 bg-white px-3 py-1.5 rounded-xl border border-gray-200 flex-1 focus:outline-none focus:border-[#2D6A4F]"
                      />
                      {sections.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSection(section.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"
                          title="Delete section"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Lessons list inside section */}
                    <div className="space-y-3 pl-2 sm:pl-4 border-l-2 border-emerald-200">
                      {section.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="p-3.5 rounded-xl bg-white border border-gray-100 shadow-2xs space-y-2.5"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <input
                              type="text"
                              value={lesson.title}
                              onChange={(e) =>
                                handleLessonChange(section.id, lesson.id, 'title', e.target.value)
                              }
                              placeholder="Lesson Title (e.g. Photoelectric Effect)"
                              className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D6A4F]"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={lesson.duration}
                                onChange={(e) =>
                                  handleLessonChange(section.id, lesson.id, 'duration', e.target.value)
                                }
                                placeholder="Duration (12:45)"
                                className="w-24 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveLesson(section.id, lesson.id)}
                                className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Video Upload input (online only; offline sessions have no videos) */}
                          {deliveryMode === 'online' && (
                            <div className="flex items-center gap-3 text-xs text-gray-500 bg-[#F8FAF9] p-2.5 rounded-lg border border-dashed border-gray-200">
                              <Upload className="w-4 h-4 text-[#2D6A4F]" />
                              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate font-semibold">
                                    {lesson.videoFileName || 'No video selected (MP4, MOV, MKV, WebM, AVI up to 2GB)'}
                                  </span>
                                  {getVideoStatusLabel(lesson.id)}
                                </div>
                                <label className="cursor-pointer text-[11px] font-bold text-[#2D6A4F] bg-white px-2.5 py-1 rounded-md border border-emerald-200 hover:bg-emerald-50 shrink-0">
                                  Upload Video
                                  <input
                                    type="file"
                                    accept="video/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      handleVideoFileSelect(section.id, lesson.id, e.target.files?.[0]);
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )}

                          {/* Quiz builder toggle */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <button
                              type="button"
                              onClick={() => openQuizBuilder(lesson.id)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#2D6A4F] bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 hover:bg-emerald-100"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>{openQuizLessonId === lesson.id ? 'Close Quiz Builder' : 'Add Quiz'}</span>
                            </button>
                            {quizSavedLessonId === lesson.id && (
                              <span className="text-[11px] font-bold text-[#2D6A4F]">✓ Quiz saved</span>
                            )}
                          </div>

                          {openQuizLessonId === lesson.id && (
                            <div className="mt-1 p-3 rounded-xl bg-[#F8FAF9] border border-gray-100 space-y-3">
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => generateQuizWithAI(lesson.id)}
                                  disabled={quizGenerating || lesson.id.startsWith('l-')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2D6A4F] text-white text-[11px] font-bold hover:bg-[#23533e] disabled:opacity-50"
                                >
                                  {quizGenerating ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                  <span>{quizGenerating ? 'Generating...' : 'Generate with AI'}</span>
                                </button>
                                {quizLoading && <Loader2 className="w-4 h-4 animate-spin text-[#2D6A4F]" />}
                              </div>

                              {quizError && (
                                <p className="text-[11px] font-semibold text-red-500">{quizError}</p>
                              )}

                              {lesson.id.startsWith('l-') && (
                                <p className="text-[10px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                  ⚠ Publish the course first — quiz saving and AI generation are available after the course is saved.
                                </p>
                              )}

                              {quizQuestions.map((q, qIndex) => (
                                <div key={qIndex} className="p-3 rounded-xl bg-white border border-gray-100 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-gray-500">Question {qIndex + 1}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setQuizQuestions((prev) => prev.filter((_, i) => i !== qIndex))
                                      }
                                      className="p-1 text-gray-400 hover:text-red-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={q.questionText}
                                    onChange={(e) => updateQuizQuestion(qIndex, 'questionText', e.target.value)}
                                    placeholder="Question text"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D6A4F]"
                                  />
                                  {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((field) => (
                                    <div key={field} className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name={`correct-${lesson.id}-${qIndex}`}
                                        checked={q.correctOption === field.slice(-1).toLowerCase()}
                                        onChange={() =>
                                          updateQuizQuestion(qIndex, 'correctOption', field.slice(-1).toLowerCase())
                                        }
                                        className="accent-[#2D6A4F]"
                                      />
                                      <span className="text-[11px] font-black uppercase text-gray-500 w-3">
                                        {field.slice(-1)}
                                      </span>
                                      <input
                                        type="text"
                                        value={q[field]}
                                        onChange={(e) => updateQuizQuestion(qIndex, field, e.target.value)}
                                        placeholder={`Option ${field.slice(-1).toUpperCase()}`}
                                        className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D6A4F]"
                                      />
                                    </div>
                                  ))}
                                  <input
                                    type="text"
                                    value={q.explanation}
                                    onChange={(e) => updateQuizQuestion(qIndex, 'explanation', e.target.value)}
                                    placeholder="Explanation (optional)"
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#2D6A4F]"
                                  />
                                </div>
                              ))}

                              <button
                                type="button"
                                onClick={() => setQuizQuestions((prev) => [...prev, emptyQuestion()])}
                                className="text-[11px] font-bold text-[#2D6A4F] flex items-center gap-1 hover:underline"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add Question</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => saveQuiz(lesson.id)}
                                disabled={quizSaving || lesson.id.startsWith('l-')}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] disabled:opacity-60"
                              >
                                {quizSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>{quizSaving ? 'Saving...' : 'Save Quiz'}</span>
                              </button>
                              {lesson.id.startsWith('l-') && (
                                <p className="text-[10px] text-center text-gray-400 font-medium">Publish the course to enable saving.</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddLesson(section.id)}
                        className="text-xs font-bold text-[#2D6A4F] flex items-center gap-1 hover:underline pt-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Lesson to {section.title}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PRICING (Free/Paid toggle, Price in EGP, Discount %) */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[#2D6A4F]" />
                <span>Step 3: Course Pricing & Discount Structure</span>
              </h3>

              <div className="space-y-6">
                {/* Free / Paid Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#F8FAF9] border border-gray-100">
                  <div>
                    <h4 className="font-bold text-sm text-gray-900">Course Access Model</h4>
                    <p className="text-xs text-gray-500">
                      {isFree
                        ? 'Students can enroll and stream all lessons completely free'
                        : 'Students pay a one-time enrollment fee in Egyptian Pounds (EGP)'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setIsFree(false)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        !isFree ? 'bg-[#2D6A4F] text-white' : 'text-gray-600'
                      }`}
                    >
                      Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFree(true)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isFree ? 'bg-[#2D6A4F] text-white' : 'text-gray-600'
                      }`}
                    >
                      Free
                    </button>
                  </div>
                </div>

                {!isFree && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        Price in Egyptian Pounds (EGP)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="50"
                          step="50"
                          value={priceEgp}
                          onChange={(e) => setPriceEgp(Number(e.target.value))}
                          className="w-full pl-4 pr-16 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F] font-bold"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                          EGP
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        Optional Early-Bird Discount (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="80"
                          value={discountPercent}
                          onChange={(e) => setDiscountPercent(Number(e.target.value))}
                          className="w-full pl-4 pr-10 py-2.5 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2D6A4F]"
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                          %
                        </span>
                      </div>
                      {discountPercent > 0 && (
                        <p className="text-[11px] text-[#2D6A4F] font-semibold mt-1">
                          Discounted student price:{' '}
                          <strong>{Math.round(priceEgp * (1 - discountPercent / 100))} EGP</strong>{' '}
                          (Saved {Math.round(priceEgp * (discountPercent / 100))} EGP)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & PUBLISH */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <h3 className="font-bold text-base text-[#1B1B1B] pb-3 border-b border-gray-100 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#2D6A4F]" />
                <span>Step 4: Review Curriculum & Final Verification</span>
              </h3>

              {/* Summary Card */}
              <div className="p-6 rounded-2xl bg-[#F8FAF9] border border-gray-200 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#2D6A4F] bg-[#B7E4C7]/40 px-2.5 py-0.5 rounded-full">
                      {subject}
                    </span>
                    <h4 className="text-lg font-black text-gray-900 mt-1">
                      {title || 'Untitled Masterclass'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {description || 'Comprehensive curriculum with video lessons and practice quizzes.'}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xl font-black text-[#2D6A4F]">
                      {isFree ? 'Free' : `${priceEgp} EGP`}
                    </span>
                    {deliveryMode === 'offline' && !isFree && (
                      <span className="block text-[11px] text-gray-500 font-semibold">
                        Pay at venue or online
                      </span>
                    )}
                    {deliveryMode !== 'offline' && !isFree && discountPercent > 0 && (
                      <span className="block text-[11px] text-amber-600 font-bold">
                        {discountPercent}% Promo Applied
                      </span>
                    )}
                  </div>
                </div>

                {/* Curriculum breakdown summary */}
                <div className="pt-3 border-t border-gray-200/80 flex items-center gap-6 text-xs text-gray-600">
                  <span>
                    <strong>{sections.length}</strong> Sections
                  </span>
                  <span>
                    <strong>
                      {sections.reduce((acc, s) => acc + s.lessons.length, 0)}
                    </strong>{' '}
                    Lessons
                  </span>
                  <span>
                    Instructor: <strong>{user?.name ?? 'Instructor'}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-xs text-[#2D6A4F] font-semibold">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  Our AI Tutor will automatically index your video lecture transcripts to answer student questions 24/7!
                </span>
              </div>
            </div>
          )}

          {/* Inline error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Navigation Controls between Steps */}
          <div className="flex items-center justify-between pt-6 border-t border-gray-100">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-[#F8FAF9] transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Step</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#23533e] transition-colors shadow-sm disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <>
                    <span>Continue to Step {currentStep + 1}</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isSubmitting || !courseId}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-[#2D6A4F] text-white text-xs sm:text-sm font-black hover:bg-[#23533e] transition-all shadow-md hover:shadow-lg disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{user?.organizationContext ? 'Submit for manager approval' : alreadyPublished ? 'Save & finish' : 'Publish Course to Marketplace'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
