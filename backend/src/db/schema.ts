import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  pgEnum,
  numeric,
  boolean,
  integer,
  unique,
  uniqueIndex,
  check,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// 'admin' accounts are created with `npm run admin` (never via public sign-up).
export const roleEnum = pgEnum('role', ['student', 'instructor', 'admin']);

const vector768 = customType<{ data: number[] }>({
  dataType() {
    return 'vector(768)';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: roleEnum('role').notNull().default('student'),
  avatarUrl: text('avatar_url'),
  grade: varchar('grade', { length: 255 }),
  // Instructor approval: 'pending' | 'approved' | 'rejected'. NULL = not an
  // applicant (students) or a legacy/seeded instructor, treated as approved.
  instructorStatus: varchar('instructor_status', { length: 20 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const instructorApplications = pgTable('instructor_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  subjects: text('subjects').notNull(),
  experienceYears: integer('experience_years').notNull(),
  bio: text('bio').notNull(),
  portfolioUrl: text('portfolio_url'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reviewNote: text('review_note'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  link: text('link'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  instructorId: uuid('instructor_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  titleAr: varchar('title_ar', { length: 255 }),
  subtitle: varchar('subtitle', { length: 255 }),
  description: text('description').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  category: varchar('category', { length: 255 }).notNull(),
  level: varchar('level', { length: 255 }).notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull().default('0'),
  originalPrice: numeric('original_price', { precision: 10, scale: 2 }),
  durationText: varchar('duration_text', { length: 255 }),
  isPublished: boolean('is_published').notNull().default(false),
  sanaweyaGrade: varchar('sanaweya_grade', { length: 20 }),
  sanaweyaSubject: varchar('sanaweya_subject', { length: 255 }),
  ministryAligned: boolean('ministry_aligned').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const courseSections = pgTable('course_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id')
    .notNull()
    .references(() => courseSections.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  durationText: varchar('duration_text', { length: 255 }),
  videoUrl: text('video_url'),
  isFree: boolean('is_free').notNull().default(false),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    enrolledAt: timestamp('enrolled_at').notNull().defaultNow(),
    progress: integer('progress').notNull().default(0),
    lastLessonId: uuid('last_lesson_id').references(() => lessons.id),
  },
  (table) => [unique('enrollments_student_course_unique').on(table.studentId, table.courseId)]
);

export const courseReviews = pgTable(
  'course_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('course_reviews_student_course_unique').on(table.studentId, table.courseId)]
);

export const videoJobs = pgTable(
  'video_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' })
      .unique(),
    status: varchar('status', { length: 255 }).notNull().default('pending'),
    hlsUrl: text('hls_url'),
    transcriptText: text('transcript_text'),
    transcriptSegments: text('transcript_segments'),
    errorMsg: text('error_msg'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

export const lessonProgress = pgTable(
  'lesson_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at'),
  },
  (table) => [unique('lesson_progress_student_lesson_unique').on(table.studentId, table.lessonId)]
);

export const lessonNotes = pgTable('lesson_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  timestampSeconds: integer('timestamp_seconds').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const lessonResources = pgTable('lesson_resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  filename: varchar('filename', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileFormat: varchar('file_format', { length: 255 }).notNull(),
  fileSizeText: varchar('file_size_text', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const communityPosts = pgTable('community_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  anonToken: uuid('anon_token').notNull(),
  content: text('content').notNull(),
  title: varchar('title', { length: 255 }),
  tag: varchar('tag', { length: 255 }),
  isPinned: boolean('is_pinned').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const communityReplies = pgTable('community_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => communityPosts.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  anonToken: uuid('anon_token').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const postVotes = pgTable(
  'post_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    postId: uuid('post_id').references(() => communityPosts.id, { onDelete: 'cascade' }),
    replyId: uuid('reply_id').references(() => communityReplies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('post_votes_user_post_unique')
      .on(table.userId, table.postId)
      .where(sql`${table.postId} is not null`),
    uniqueIndex('post_votes_user_reply_unique')
      .on(table.userId, table.replyId)
      .where(sql`${table.replyId} is not null`),
    check(
      'post_votes_one_target_check',
      sql`(${table.postId} is not null)::int + (${table.replyId} is not null)::int = 1`
    ),
  ]
);

export const lessonChunks = pgTable(
  'lesson_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector768('embedding').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('lesson_chunks_lesson_index_unique').on(table.lessonId, table.chunkIndex)]
);

export const aiConversations = pgTable('ai_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const aiMessages = pgTable('ai_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const flashcards = pgTable('flashcards', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const lessonSummaries = pgTable(
  'lesson_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' })
      .unique(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  }
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseSection = typeof courseSections.$inferSelect;
export type NewCourseSection = typeof courseSections.$inferInsert;
export type Lesson = typeof lessons.$inferSelect;
export type NewLesson = typeof lessons.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type CourseReview = typeof courseReviews.$inferSelect;
export type NewCourseReview = typeof courseReviews.$inferInsert;
export type VideoJob = typeof videoJobs.$inferSelect;
export type NewVideoJob = typeof videoJobs.$inferInsert;
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
export type LessonNote = typeof lessonNotes.$inferSelect;
export type NewLessonNote = typeof lessonNotes.$inferInsert;
export type LessonResource = typeof lessonResources.$inferSelect;
export type NewLessonResource = typeof lessonResources.$inferInsert;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type NewCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityReply = typeof communityReplies.$inferSelect;
export type NewCommunityReply = typeof communityReplies.$inferInsert;
export type PostVote = typeof postVotes.$inferSelect;
export type NewPostVote = typeof postVotes.$inferInsert;
export type LessonChunk = typeof lessonChunks.$inferSelect;
export type NewLessonChunk = typeof lessonChunks.$inferInsert;
export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
export type Flashcard = typeof flashcards.$inferSelect;
export type NewFlashcard = typeof flashcards.$inferInsert;
export type LessonSummary = typeof lessonSummaries.$inferSelect;
export type NewLessonSummary = typeof lessonSummaries.$inferInsert;

export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom(),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' })
    .unique(),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default('Lesson Quiz'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  questionText: text('question_text').notNull(),
  optionA: varchar('option_a', { length: 1000 }).notNull(),
  optionB: varchar('option_b', { length: 1000 }).notNull(),
  optionC: varchar('option_c', { length: 1000 }).notNull(),
  optionD: varchar('option_d', { length: 1000 }).notNull(),
  correctOption: varchar('correct_option', { length: 1 }).notNull(),
  explanation: text('explanation'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  lessonId: uuid('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id')
    .notNull()
    .references(() => courses.id, { onDelete: 'cascade' }),
  answers: text('answers').notNull(),
  score: integer('score').notNull(),
  totalQuestions: integer('total_questions').notNull(),
  percentage: integer('percentage').notNull(),
  completedAt: timestamp('completed_at').notNull().defaultNow(),
});

export const weakTopics = pgTable(
  'weak_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    topicSummary: text('topic_summary').notNull(),
    recommendations: text('recommendations').notNull(),
    generatedAt: timestamp('generated_at').notNull().defaultNow(),
  },
  (table) => [unique('weak_topics_student_course_unique').on(table.studentId, table.courseId)]
);

export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type NewQuizQuestion = typeof quizQuestions.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;
export type WeakTopic = typeof weakTopics.$inferSelect;
export type NewWeakTopic = typeof weakTopics.$inferInsert;

export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    minutesStudied: integer('minutes_studied').notNull().default(0),
  },
  (table) => [unique('study_sessions_student_date_unique').on(table.studentId, table.date)]
);

export const studentBadges = pgTable(
  'student_badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeKey: varchar('badge_key', { length: 255 }).notNull(),
    unlockedAt: timestamp('unlocked_at').notNull().defaultNow(),
  },
  (table) => [unique('student_badges_student_key_unique').on(table.studentId, table.badgeKey)]
);

export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    certCode: varchar('cert_code', { length: 255 }).notNull().unique(),
    issuedAt: timestamp('issued_at').notNull().defaultNow(),
  },
  (table) => [unique('certificates_student_course_unique').on(table.studentId, table.courseId)]
);

export const sanaweyaProfiles = pgTable('sanaweya_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  grade: varchar('grade', { length: 20 }).notNull(),
  track: varchar('track', { length: 20 }),
  schoolName: varchar('school_name', { length: 255 }),
  governorate: varchar('governorate', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pastExams = pgTable('past_exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  subject: varchar('subject', { length: 255 }).notNull(),
  grade: varchar('grade', { length: 20 }).notNull(),
  year: integer('year').notNull(),
  session: varchar('session', { length: 20 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  pdfUrl: text('pdf_url').notNull(),
  answerKeyUrl: text('answer_key_url'),
  isPublished: boolean('is_published').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const pastExamAttempts = pgTable('past_exam_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  examId: uuid('exam_id')
    .notNull()
    .references(() => pastExams.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  score: integer('score'),
});

export const subjectCommunities = pgTable(
  'subject_communities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: varchar('subject', { length: 255 }).notNull(),
    grade: varchar('grade', { length: 20 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('subject_communities_subject_grade_unique').on(table.subject, table.grade)]
);

export type SanaweyaProfile = typeof sanaweyaProfiles.$inferSelect;
export type NewSanaweyaProfile = typeof sanaweyaProfiles.$inferInsert;
export type PastExam = typeof pastExams.$inferSelect;
export type NewPastExam = typeof pastExams.$inferInsert;
export type PastExamAttempt = typeof pastExamAttempts.$inferSelect;
export type NewPastExamAttempt = typeof pastExamAttempts.$inferInsert;
export type SubjectCommunity = typeof subjectCommunities.$inferSelect;
export type NewSubjectCommunity = typeof subjectCommunities.$inferInsert;
export type StudySession = typeof studySessions.$inferSelect;
export type NewStudySession = typeof studySessions.$inferInsert;
export type StudentBadge = typeof studentBadges.$inferSelect;
export type NewStudentBadge = typeof studentBadges.$inferInsert;
export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
