export interface Lesson {
  id: string;
  title: string;
  duration: string;
  isLocked: boolean;
  completed?: boolean;
}

export interface CurriculumSection {
  id: string;
  title: string;
  duration: string;
  lessons: Lesson[];
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  comment: string;
  helpfulCount: number;
}

export interface Course {
  id: string;
  title: string;
  subtitle?: string;
  titleAr?: string;
  description: string;
  instructor: {
    name: string;
    title: string;
    avatar: string;
    bio?: string;
  };
  thumbnail: string;
  category: 'Computer Science' | 'AI & Data' | 'UI/UX Design' | 'Business' | 'Languages';
  rating: number;
  ratingCount: number;
  price: number; // 0 = Free
  originalPrice?: number;
  studentsCount: number;
  duration: string;
  lessonsCount: number;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
  progress?: number;
  currentLesson?: string;
  enrolled?: boolean;
  lastUpdated?: string;
  whatYouWillLearn?: string[];
  curriculum?: CurriculumSection[];
  reviews?: Review[];
  ratingBreakdown?: { [stars: number]: number };
}

export interface LiveSession {
  id: string;
  title: string;
  instructor: string;
  instructorRole: string;
  avatar: string;
  timeRange: string;
  date: string;
  attendeesCount: number;
  attendeeAvatars: string[];
  status: 'upcoming' | 'live' | 'completed';
  meetingLink?: string;
}

export interface CommunityPost {
  id: string;
  author: {
    name: string;
    avatar: string;
    isAnonymous: boolean;
    role?: string;
  };
  title: string;
  content: string;
  tag: string;
  timestamp: string;
  likes: number;
  replies: number;
  hasLiked?: boolean;
}

export interface CourseCommunityReply {
  id: string;
  author: {
    name: string;
    avatar: string;
    isAnonymous: boolean;
    isInstructor?: boolean;
    role?: string;
  };
  content: string;
  timestamp: string;
  upvotes: number;
  hasUpvoted?: boolean;
}

export interface CourseCommunityPost {
  id: string;
  courseId: string;
  author: {
    name: string;
    avatar: string;
    isAnonymous: boolean;
    isInstructor?: boolean;
    role?: string;
  };
  content: string;
  timestamp: string;
  upvotes: number;
  hasUpvoted?: boolean;
  isPinned?: boolean;
  replies: CourseCommunityReply[];
}

export interface LessonNote {
  id: string;
  lessonId: string;
  timeFormatted: string;
  seconds: number;
  content: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

export interface ResourceFile {
  id: string;
  title: string;
  filename: string;
  size: string;
  format: 'PDF' | 'ZIP' | 'CODE';
}

export interface FilterState {
  subject: string;
  price: 'all' | 'free' | 'paid';
  rating: number;
  searchQuery: string;
  level: string;
}
