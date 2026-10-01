import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { db } from './index';
import {
  users,
  courses,
  courseSections,
  lessons,
  enrollments,
  courseReviews,
  lessonResources,
  communityPosts,
  communityReplies,
  postVotes,
  studentBadges,
  studySessions,
  quizzes,
  quizQuestions,
  quizAttempts,
  sanaweyaProfiles,
  pastExams,
  subjectCommunities,
  lessonProgress,
  orders,
} from './schema';
import { generateAnonToken } from '../lib/anonToken';

async function seedUser(params: {
  name: string;
  email: string;
  password: string;
  role: 'student' | 'instructor';
  grade?: string;
}) {
  const { name, email, password, role, grade } = params;

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.log(`Skipped ${email} — already exists`);
    return existing[0];
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const inserted = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role,
      grade: role === 'student' ? grade ?? null : null,
    })
    .returning();

  console.log(`Inserted ${role}: ${name} <${email}>`);
  return inserted[0];
}

type SeedLesson = { title: string; duration: string; isFree: boolean };
type SeedSection = { title: string; lessons: SeedLesson[] };

async function seedCourse(params: {
  instructorId: string;
  title: string;
  titleAr?: string;
  subtitle?: string;
  description: string;
  thumbnailUrl?: string;
  category: string;
  level: string;
  price: string;
  originalPrice?: string;
  durationText?: string;
  isPublished: boolean;
  sanaweyaGrade?: string;
  sanaweyaSubject?: string;
  ministryAligned?: boolean;
  sections: SeedSection[];
}) {
  const {
    instructorId,
    title,
    titleAr,
    subtitle,
    description,
    thumbnailUrl,
    category,
    level,
    price,
    originalPrice,
    durationText,
    isPublished,
    sanaweyaGrade,
    sanaweyaSubject,
    ministryAligned,
    sections,
  } = params;

  const existing = await db.select().from(courses).where(eq(courses.title, title)).limit(1);
  if (existing.length > 0) {
    console.log(`Skipped course "${title}" — already exists`);
    return existing[0];
  }

  const insertedCourse = await db
    .insert(courses)
    .values({
      instructorId,
      title,
      titleAr: titleAr ?? null,
      subtitle: subtitle ?? null,
      description,
      thumbnailUrl: thumbnailUrl ?? null,
      category,
      level,
      price,
      originalPrice: originalPrice ?? null,
      durationText: durationText ?? null,
      isPublished,
      // These were destructured above but never written, so no seeded course
      // appeared on the Sanaweya pages.
      sanaweyaGrade: sanaweyaGrade ?? null,
      sanaweyaSubject: sanaweyaSubject ?? null,
      ministryAligned: ministryAligned ?? false,
    })
    .returning();

  const course = insertedCourse[0];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];
    const insertedSection = await db
      .insert(courseSections)
      .values({
        courseId: course.id,
        title: section.title,
        position: sIdx + 1,
      })
      .returning();

    const sec = insertedSection[0];

    for (let lIdx = 0; lIdx < section.lessons.length; lIdx++) {
      const lesson = section.lessons[lIdx];
      await db.insert(lessons).values({
        sectionId: sec.id,
        courseId: course.id,
        title: lesson.title,
        durationText: lesson.duration,
        isFree: lesson.isFree,
        position: lIdx + 1,
      });
    }
  }

  console.log(`Inserted course: ${title}`);
  return course;
}

/**
 * Enrol a student with progress that is backed by real lesson_progress rows.
 * The app recalculates enrollments.progress from completed lessons, so a bare
 * percentage (what this seed used to insert) dropped to 0% the first time the
 * student touched a lesson, and the lesson list showed nothing completed.
 * Also repairs an existing enrollment that has a percentage but no lesson rows.
 */
/**
 * Seeded enrollments in paid courses get a matching 'paid' order (provider 'demo')
 * so revenue dashboards have data. Real purchases go through /api/payments.
 */
async function seedDemoOrder(studentId: string, course: { id: string; price: string }, label: string) {
  if (Number(course.price) <= 0) return;
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.studentId, studentId), eq(orders.courseId, course.id), eq(orders.status, 'paid')))
    .limit(1);
  if (existing.length > 0) {
    console.log(`Skipped demo order ${label} — already exists`);
    return;
  }
  const [enrollment] = await db
    .select({ enrolledAt: enrollments.enrolledAt })
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, course.id)))
    .limit(1);
  const paidAt = enrollment?.enrolledAt ?? new Date();
  await db.insert(orders).values({
    studentId,
    courseId: course.id,
    amount: course.price,
    status: 'paid',
    provider: 'demo',
    providerRef: 'seed',
    createdAt: paidAt,
    paidAt,
  });
  console.log(`Inserted demo order ${label}: ${course.price} EGP`);
}

async function enrollWithProgress(studentId: string, courseId: string, targetPercent: number, label: string) {
  const ordered = await db
    .select({ id: lessons.id, durationText: lessons.durationText })
    .from(lessons)
    .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
    .where(eq(lessons.courseId, courseId))
    .orderBy(courseSections.position, lessons.position);
  if (ordered.length === 0) return;

  const completedCount = Math.min(ordered.length, Math.round((targetPercent / 100) * ordered.length));
  // Same formula as recalcCourseProgress in routes/progress.ts.
  const progress = Math.round((completedCount / ordered.length) * 100);
  const resumeLesson = ordered[Math.min(completedCount, ordered.length - 1)];

  const existing = await db
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, courseId)))
    .limit(1);
  const existingRows = await db
    .select({ id: lessonProgress.id })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.studentId, studentId), eq(lessonProgress.courseId, courseId)))
    .limit(1);
  if (existing.length > 0 && existingRows.length > 0) {
    console.log(`Skipped enrollment ${label} — already exists with lesson progress`);
    return;
  }

  const toSeconds = (d: string | null) => {
    const [m, s] = (d ?? '').split(':').map(Number);
    return Number.isFinite(m) ? m * 60 + (Number.isFinite(s) ? s : 0) : 600;
  };
  const day = 24 * 60 * 60 * 1000;

  await db.transaction(async (tx) => {
    for (let i = 0; i < completedCount; i++) {
      await tx
        .insert(lessonProgress)
        .values({
          studentId,
          lessonId: ordered[i].id,
          courseId,
          watchedSeconds: toSeconds(ordered[i].durationText),
          completed: true,
          completedAt: new Date(Date.now() - (completedCount - i) * day),
        })
        .onConflictDoNothing();
    }
    if (existing.length > 0) {
      await tx
        .update(enrollments)
        .set({ progress, lastLessonId: resumeLesson.id })
        .where(eq(enrollments.id, existing[0].id));
    } else {
      await tx.insert(enrollments).values({ studentId, courseId, progress, lastLessonId: resumeLesson.id });
    }
  });
  console.log(
    `${existing.length > 0 ? 'Repaired' : 'Inserted'} enrollment ${label}: ${completedCount}/${ordered.length} lessons (${progress}%)`
  );
}

async function main() {
  const student = await seedUser({
    name: 'Kamal Manocha',
    email: 'student@nudra.com',
    password: 'password123',
    role: 'student',
    grade: 'سنة ثالثة ثانوي',
  });

  const instructor = await seedUser({
    name: 'Dr. Tariq Al-Mansoor',
    email: 'instructor@nudra.com',
    password: 'password123',
    role: 'instructor',
  });

  const course1 = await seedCourse({
    instructorId: instructor.id,
    title: 'Modern Full-Stack Development with TypeScript & Next.js',
    titleAr: 'تطوير الويب الشامل بالتايب سكريبت وNext.js',
    subtitle:
      'Master production-grade React architecture, server actions, PostgreSQL schemas, and containerized deployment.',
    description:
      'Build enterprise-grade full-stack web applications with modern architecture, automated testing, and scalable backend services. From core TypeScript design patterns to state management and cloud deployments, you will gain hands-on production experience.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80',
    category: 'Computer Science',
    level: 'Intermediate',
    price: '49.99',
    originalPrice: '89.99',
    durationText: '28 hours',
    isPublished: true,
    sections: [
      {
        title: 'Section 1: Architectural Foundations & Setup',
        lessons: [
          { title: '1. Welcome & High-Level System Architecture', duration: '12:45', isFree: true },
          { title: '2. Setting up Strict TypeScript & ESLint Rules', duration: '24:10', isFree: false },
          { title: '3. Next.js App Router & Layout Boundaries', duration: '35:20', isFree: false },
          { title: '4. Tailwind CSS Logical Properties for RTL Support', duration: '18:50', isFree: false },
        ],
      },
      {
        title: 'Section 2: State Management & Data Fetching',
        lessons: [
          { title: '5. Server Components vs Client Components Deep-Dive', duration: '28:15', isFree: false },
          { title: '6. Server Actions & Mutations with Optimistic Updates', duration: '32:40', isFree: false },
          { title: '7. Streaming Suspense & Skeleton Fallbacks', duration: '21:30', isFree: false },
          { title: '8. Global State with Zustand & React Context', duration: '19:45', isFree: false },
          { title: '9. Error Boundaries & Graceful Degradation', duration: '25:10', isFree: false },
        ],
      },
      {
        title: 'Section 3: Database & Security Hardening',
        lessons: [
          { title: '10. PostgreSQL Connection Pooling & Drizzle ORM', duration: '44:20', isFree: false },
          { title: '11. Role-Based Access Control (RBAC) & Middleware', duration: '38:50', isFree: false },
          { title: '12. API Rate Limiting & CSRF Protection', duration: '27:15', isFree: false },
          { title: '13. Secure Token Cookies vs LocalStorage Storage', duration: '31:40', isFree: false },
          { title: '14. Automated E2E Testing with Playwright', duration: '36:10', isFree: false },
        ],
      },
      {
        title: 'Section 4: Cloud Deployment & Performance Optimization',
        lessons: [
          { title: '15. Multi-stage Docker Builds for Production', duration: '29:40', isFree: false },
          { title: '16. CDN Caching Strategies & Edge Revalidation', duration: '34:10', isFree: false },
          { title: '17. Web Vitals & Lighthouse 100/100 Tuning', duration: '26:50', isFree: false },
          { title: '18. Capstone Project Submission & Peer Review', duration: '42:00', isFree: false },
        ],
      },
    ],
  });

  const course2 = await seedCourse({
    instructorId: instructor.id,
    title: 'Foundations of Arabic NLP & Transformers',
    titleAr: 'أسس معالجة اللغة الطبيعية للغة العربية ونماذج المحولات',
    subtitle:
      'Hands-on training in tokenization, embeddings, fine-tuning modern bilingual LLMs, and building semantic search engines.',
    description:
      'Hands-on training in tokenization, embeddings, fine-tuning modern bilingual LLMs, and building semantic search engines. Learn how to train and deploy transformer architectures specifically optimized for high-resource and dialectal Arabic contexts.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&auto=format&fit=crop&q=80',
    category: 'AI & Data',
    level: 'Advanced',
    price: '59.99',
    originalPrice: '99.99',
    durationText: '35 hours',
    isPublished: true,
    sections: [
      {
        title: 'Section 1: Tokenization & Word Embeddings',
        lessons: [
          { title: '1. Challenges of Arabic Script & Diacritics', duration: '22:15', isFree: true },
          { title: '2. Byte-Pair Encoding vs WordPiece in Multilingual Tokenizers', duration: '34:40', isFree: false },
        ],
      },
      {
        title: 'Section 2: Transformers & Fine-Tuning',
        lessons: [
          { title: '3. Vector Spaces and Cosine Similarity in Practice', duration: '41:10', isFree: false },
          { title: '4. Fine-Tuning Bilingual LLMs with LoRA', duration: '38:25', isFree: false },
        ],
      },
    ],
  });

  const course3 = await seedCourse({
    instructorId: instructor.id,
    title: 'UI/UX Design for Arab Audiences',
    titleAr: 'تصميم تجربة وواجهة المستخدم للجمهور العربي',
    subtitle:
      'Master bidirectional UI design, RTL layout strategies, typographic hierarchies, and micro-interactions with Figma.',
    description:
      'Master bidirectional UI design, RTL layout strategies, typographic hierarchies, and micro-interactions with Figma. Learn how leading companies construct accessible design tokens that seamlessly flip between English and Arabic layouts.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=600&auto=format&fit=crop&q=80',
    category: 'UI/UX Design',
    level: 'Beginner',
    price: '0',
    durationText: '12 hours',
    isPublished: true,
    sections: [
      {
        title: 'Section 1: Foundations of Bidirectional Design',
        lessons: [
          { title: '1. Cultural & Cognitive Aspects of RTL Reading Patterns', duration: '18:20', isFree: true },
          { title: '2. Optical Baseline vs Latin X-Heights', duration: '24:15', isFree: false },
        ],
      },
      {
        title: 'Section 2: Designing Dashboard Interfaces',
        lessons: [
          { title: '3. Token Hierarchies & Primitive Variables', duration: '32:10', isFree: false },
          { title: '4. Soft Shadows, Rounded Radii, and Border Balance', duration: '26:40', isFree: false },
        ],
      },
    ],
  });

  const course4 = await seedCourse({
    instructorId: instructor.id,
    title: 'High-Performance PostgreSQL & Drizzle ORM',
    titleAr: 'قواعد بيانات PostgreSQL عالية الأداء مع Drizzle ORM',
    subtitle:
      'Design, optimize, and scale relational schemas with advanced indexing, query planning, and type-safe ORM patterns.',
    description:
      'Design, optimize, and scale relational schemas with advanced indexing, query planning, and type-safe ORM patterns. Learn to diagnose slow queries, manage connection pooling, and ship resilient production database systems.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=600&auto=format&fit=crop&q=80',
    category: 'Computer Science',
    level: 'Advanced',
    price: '39.99',
    originalPrice: '69.99',
    durationText: '18 hours',
    isPublished: true,
    sections: [
      {
        title: 'Section 1: Schema Design & Indexing',
        lessons: [
          { title: '1. Relational Modeling & Normalization Trade-offs', duration: '26:30', isFree: true },
          { title: '2. B-Tree, GIN, and Partial Index Strategies', duration: '31:15', isFree: false },
        ],
      },
      {
        title: 'Section 2: Query Performance & ORM Patterns',
        lessons: [
          { title: '3. Reading EXPLAIN ANALYZE Plans', duration: '29:45', isFree: false },
          { title: '4. Type-Safe Queries with Drizzle ORM', duration: '33:20', isFree: false },
        ],
      },
    ],
  });

  const course5 = await seedCourse({
    instructorId: instructor.id,
    title: 'رياضيات ثانوية عامة - سنة ثالثة',
    titleAr: 'رياضيات ثانوية عامة - سنة ثالثة',
    subtitle: 'شرح شامل لمنهج الرياضيات للصف الثالث الثانوي مع نماذج امتحانات',
    description:
      'شرح شامل لمنهج الرياضيات للصف الثالث الثانوي مع نماذج امتحانات. تغطي الدروس التفاضل والتكامل والجبر والهندسة الفراغية والمتتابعات، مع حل أسئلة امتحانات الثانوية العامة السابقة خطوة بخطوة.',
    thumbnailUrl:
      'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
    category: 'Mathematics',
    level: 'Advanced',
    price: '199',
    originalPrice: '349',
    durationText: '45 hours',
    isPublished: true,
    sanaweyaGrade: 'year3',
    sanaweyaSubject: 'الرياضيات',
    ministryAligned: true,
    sections: [
      {
        title: 'القسم الأول: التفاضل',
        lessons: [
          { title: '1. النهايات والاتصال', duration: '35:00', isFree: true },
          { title: '2. الاشتقاق وقواعد الاشتقاق', duration: '42:30', isFree: false },
        ],
      },
      {
        title: 'القسم الثاني: التكامل',
        lessons: [
          { title: '3. التكامل غير المحدود', duration: '38:15', isFree: false },
          { title: '4. التكامل المحدود وتطبيقاته', duration: '45:20', isFree: false },
        ],
      },
      {
        title: 'القسم الثالث: الجبر والهندسة الفراغية',
        lessons: [
          { title: '5. المتتابعات والمتسلسلات', duration: '40:10', isFree: false },
          { title: '6. حل نماذج امتحانات الثانوية العامة', duration: '55:00', isFree: false },
        ],
      },
    ],
  });

  await enrollWithProgress(student.id, course1.id, 68, 'student -> Course 1');
  await seedDemoOrder(student.id, course1, 'student -> Course 1');

  await enrollWithProgress(student.id, course3.id, 30, 'student -> Course 3');
  await seedDemoOrder(student.id, course3, 'student -> Course 3');

  const existingReview = await db
    .select()
    .from(courseReviews)
    .where(and(eq(courseReviews.studentId, student.id), eq(courseReviews.courseId, course1.id)))
    .limit(1);
  if (existingReview.length === 0) {
    await db.insert(courseReviews).values({
      studentId: student.id,
      courseId: course1.id,
      rating: 5,
      comment:
        'The explanation of Server Actions and how they handle optimistic UI updates is the best I have ever seen. Completely demystified Next.js for me!',
    });
    console.log('Inserted review: student -> Course 1 (5 stars)');
  } else {
    console.log('Skipped review student -> Course 1 — already exists');
  }

  const firstLessonRows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course1.id))
    .orderBy(lessons.position)
    .limit(1);

  if (firstLessonRows.length > 0) {
    const firstLessonId = firstLessonRows[0].id;
    const existingResources = await db
      .select()
      .from(lessonResources)
      .where(eq(lessonResources.lessonId, firstLessonId))
      .limit(1);

    if (existingResources.length === 0) {
      await db.insert(lessonResources).values([
        {
          lessonId: firstLessonId,
          title: 'Lecture Slides: Modern Server Actions & Streaming Hydration',
          filename: 'Lecture-06-ServerActions-Hydration.pdf',
          fileUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
          fileFormat: 'PDF',
          fileSizeText: '4.8 MB',
        },
        {
          lessonId: firstLessonId,
          title: 'Module 3 Starter Code & Config Files',
          filename: 'module-03-starter-template.zip',
          fileUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
          fileFormat: 'ZIP',
          fileSizeText: '14.2 MB',
        },
      ]);
      console.log('Inserted lesson resources for Course 1 first lesson');
    } else {
      console.log('Skipped lesson resources — already exist');
    }
  }

  const existingSanaweyaProfile = await db
    .select()
    .from(sanaweyaProfiles)
    .where(eq(sanaweyaProfiles.userId, student.id))
    .limit(1);
  if (existingSanaweyaProfile.length === 0) {
    await db.insert(sanaweyaProfiles).values({
      userId: student.id,
      grade: 'year3',
      track: 'science',
      schoolName: 'مدرسة القاهرة الثانوية',
      governorate: 'القاهرة',
    });
    console.log('Inserted sanaweya profile for student');
  } else {
    console.log('Skipped sanaweya profile — already exists');
  }

  await enrollWithProgress(student.id, course5.id, 45, 'student -> Course 5 Sanaweya');
  await seedDemoOrder(student.id, course5, 'student -> Course 5 Sanaweya');

  const existingPastExams = await db.select({ id: pastExams.id }).from(pastExams).limit(1);
  if (existingPastExams.length === 0) {
    await db.insert(pastExams).values([
      {
        subject: 'الرياضيات',
        grade: 'year3',
        year: 2023,
        session: 'first',
        title: 'الرياضيات - الدور الأول 2023',
        pdfUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
        answerKeyUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
      },
      {
        subject: 'الفيزياء',
        grade: 'year3',
        year: 2023,
        session: 'first',
        title: 'الفيزياء - الدور الأول 2023',
        pdfUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
      },
      {
        subject: 'الكيمياء',
        grade: 'year3',
        year: 2022,
        session: 'second',
        title: 'الكيمياء - الدور الثاني 2022',
        pdfUrl: 'http://localhost:9000/nudra-thumbnails/sample.pdf',
      },
    ]);
    console.log('Inserted 3 past exams');
  } else {
    console.log('Skipped past exams — already exist');
  }

  const existingSubjectCommunities = await db
    .select({ id: subjectCommunities.id })
    .from(subjectCommunities)
    .limit(1);
  if (existingSubjectCommunities.length === 0) {
    const coreSubjects = [
      'الرياضيات',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'الفيزياء',
      'الكيمياء',
      'الأحياء',
      'التاريخ',
      'الجغرافيا',
    ];
    await db.insert(subjectCommunities).values(
      coreSubjects.map((subject) => ({
        subject,
        grade: 'year3',
        description: `مجتمع مادة ${subject} لطلاب الصف الثالث الثانوي`,
      }))
    );
    console.log('Inserted 8 subject communities');
  } else {
    console.log('Skipped subject communities — already exist');
  }

  // --- Community seeding ---
  const existingCommunityPosts = await db.select({ id: communityPosts.id }).from(communityPosts).limit(1);
  if (existingCommunityPosts.length > 0) {
    console.log('Skipped community seeding — already exists');
  } else {
    // Create a small pool of seed voters so we can match the described upvote counts.
    // The instructor account is always the first voter for simplicity.
    const seedVoterNames = ['Seed Voter 1', 'Seed Voter 2', 'Seed Voter 3', 'Seed Voter 4', 'Seed Voter 5'];
    const seedVoters: (typeof users.$inferSelect)[] = [instructor, student];
    for (let i = 0; i < seedVoterNames.length; i++) {
      const email = `voter${i + 1}@nudra.com`;
      const existingVoter = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingVoter.length > 0) {
        seedVoters.push(existingVoter[0]);
      } else {
        const passwordHash = await bcrypt.hash('NudraDemo2025!', 12);
        const inserted = await db
          .insert(users)
          .values({
            name: seedVoterNames[i],
            email,
            passwordHash,
            role: 'student',
          })
          .returning();
        seedVoters.push(inserted[0]);
      }
    }

    const generalScope = 'general';

    const generalPost1 = await db
      .insert(communityPosts)
      .values({
        authorId: student.id,
        isAnonymous: false,
        anonToken: generateAnonToken(student.id, generalScope),
        title: 'Best practices for Arabic RTL typography scaling?',
        content:
          'I keep running into layout shifts when mixing Arabic and English text in the same component. What are your go-to strategies for handling logical properties, font fallback stacks, and dynamic scaling in RTL CSS?',
        tag: 'Web Dev & RTL',
      })
      .returning();

    const generalPost2 = await db
      .insert(communityPosts)
      .values({
        authorId: instructor.id,
        isAnonymous: false,
        anonToken: generateAnonToken(instructor.id, generalScope),
        title: 'Introduction to Arabic NLP resources',
        content:
          'Here is a curated list of Arabic NLP datasets, pretrained embeddings, and modern transformer checkpoints that I recommend for anyone getting started with bilingual language models.',
        tag: 'AI & Machine Learning',
      })
      .returning();

    const generalPost3 = await db
      .insert(communityPosts)
      .values({
        authorId: student.id,
        isAnonymous: true,
        anonToken: generateAnonToken(student.id, generalScope),
        title: 'How do I stay motivated during exam season?',
        content:
          'Between practice tests, revision notes, and coursework deadlines, I am burning out. What study routines or focus techniques have worked for you during heavy exam weeks?',
        tag: 'General',
      })
      .returning();

    for (let i = 0; i < 3; i++) {
      await db.insert(postVotes).values({ postId: generalPost1[0].id, userId: seedVoters[i].id });
    }
    for (let i = 0; i < 7; i++) {
      await db.insert(postVotes).values({ postId: generalPost2[0].id, userId: seedVoters[i].id });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(postVotes).values({ postId: generalPost3[0].id, userId: seedVoters[i].id });
    }

    const courseScope = course1.id;

    const coursePost1 = await db
      .insert(communityPosts)
      .values({
        courseId: course1.id,
        authorId: student.id,
        isAnonymous: true,
        anonToken: generateAnonToken(student.id, courseScope),
        content:
          'Can someone explain the practical difference between server actions and traditional API routes in Next.js? When should I prefer one over the other?',
      })
      .returning();

    const coursePost2 = await db
      .insert(communityPosts)
      .values({
        courseId: course1.id,
        authorId: instructor.id,
        isAnonymous: false,
        anonToken: generateAnonToken(instructor.id, courseScope),
        content:
          'A quick reminder: turning on strict mode in TypeScript catches an entire class of silent bugs. I have pinned this post so every student sees it before the mid-course project.',
        isPinned: true,
      })
      .returning();

    const coursePost3 = await db
      .insert(communityPosts)
      .values({
        courseId: course1.id,
        authorId: student.id,
        isAnonymous: false,
        anonToken: generateAnonToken(student.id, courseScope),
        content:
          'Pro tip: when using Drizzle ORM with relational queries, make sure your select shape only asks for the columns you actually render. It makes a noticeable difference on large joins.',
      })
      .returning();

    for (let i = 0; i < 4; i++) {
      await db.insert(postVotes).values({ postId: coursePost1[0].id, userId: seedVoters[i].id });
    }
    for (let i = 0; i < 6; i++) {
      await db.insert(postVotes).values({ postId: coursePost2[0].id, userId: seedVoters[i].id });
    }
    for (let i = 0; i < 2; i++) {
      await db.insert(postVotes).values({ postId: coursePost3[0].id, userId: seedVoters[i].id });
    }

    await db.insert(communityReplies).values([
      {
        postId: coursePost2[0].id,
        authorId: student.id,
        isAnonymous: false,
        anonToken: generateAnonToken(student.id, courseScope),
        content: 'Thank you! This cleared things up completely.',
      },
      {
        postId: coursePost2[0].id,
        authorId: instructor.id,
        isAnonymous: false,
        anonToken: generateAnonToken(instructor.id, courseScope),
        content: 'Glad it helped! Feel free to ask more in this thread.',
      },
    ]);

    console.log('Inserted community posts, votes, and replies');
  }

  const existingBadges = await db
    .select()
    .from(studentBadges)
    .where(eq(studentBadges.studentId, student.id));

  if (existingBadges.length === 0) {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    await db.insert(studentBadges).values([
      { studentId: student.id, badgeKey: 'first_lesson', unlockedAt: twoMonthsAgo },
      { studentId: student.id, badgeKey: 'streak_7', unlockedAt: oneMonthAgo },
    ]);

    console.log('Inserted demo badges');
  }

  const existingSessions = await db
    .select()
    .from(studySessions)
    .where(eq(studySessions.studentId, student.id))
    .limit(1);

  if (existingSessions.length === 0) {
    const sessionValues: { studentId: string; date: string; minutesStudied: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      sessionValues.push({
        studentId: student.id,
        date: `${year}-${month}-${day}`,
        minutesStudied: 45,
      });
    }
    await db.insert(studySessions).values(sessionValues);
    console.log('Inserted 14 days of study sessions');
  }

  const course1Lessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course1.id))
    .orderBy(lessons.position);

  if (course1Lessons.length >= 2) {
    const existingQuiz = await db
      .select()
      .from(quizzes)
      .where(eq(quizzes.lessonId, course1Lessons[0].id))
      .limit(1);

    if (existingQuiz.length === 0) {
      const quiz1 = await db
        .insert(quizzes)
        .values({
          lessonId: course1Lessons[0].id,
          courseId: course1.id,
          title: 'TypeScript & Next.js Fundamentals Quiz',
          createdBy: instructor.id,
        })
        .returning();

      const q1 = await db
        .insert(quizQuestions)
        .values([
          {
            quizId: quiz1[0].id,
            questionText: 'What is the primary purpose of TypeScript interfaces?',
            optionA: 'To define the shape and contract of objects at compile time',
            optionB: 'To execute code at runtime faster than plain JavaScript',
            optionC: 'To automatically generate database tables',
            optionD: 'To replace all JavaScript functions with classes',
            correctOption: 'a',
            explanation:
              'Interfaces describe the structure an object must follow and are checked at compile time, catching type errors before runtime.',
            position: 1,
          },
          {
            quizId: quiz1[0].id,
            questionText: 'In Next.js App Router, what is a Server Action?',
            optionA: 'A client-side event handler that runs in the browser',
            optionB: 'An async function that runs on the server and can be called from components',
            optionC: 'A CSS animation triggered on the server',
            optionD: 'A database migration script',
            correctOption: 'b',
            explanation:
              'Server Actions are async server functions invoked directly from components or forms, enabling mutations without hand-written API routes.',
            position: 2,
          },
          {
            quizId: quiz1[0].id,
            questionText: 'Which React hook is used to memoize an expensive computed value?',
            optionA: 'useEffect',
            optionB: 'useState',
            optionC: 'useMemo',
            optionD: 'useRef',
            correctOption: 'c',
            explanation:
              'useMemo caches the result of a computation between renders and only recomputes when its dependencies change.',
            position: 3,
          },
          {
            quizId: quiz1[0].id,
            questionText: 'What does the SQL JOIN clause primarily do?',
            optionA: 'Deletes duplicate rows from a single table',
            optionB: 'Combines rows from two or more tables based on a related column',
            optionC: 'Creates a new database index automatically',
            optionD: 'Encrypts sensitive columns',
            correctOption: 'b',
            explanation:
              'JOIN links rows across tables using a related key, letting you query normalized relational data together.',
            position: 4,
          },
        ])
        .returning();

      console.log('Inserted quiz + questions for Course 1 first lesson');

      await db.insert(quizzes).values({
        lessonId: course1Lessons[1].id,
        courseId: course1.id,
        title: 'React State & Effects Quiz',
        createdBy: instructor.id,
      });

      const quiz2Rows = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.lessonId, course1Lessons[1].id))
        .limit(1);

      await db.insert(quizQuestions).values([
        {
          quizId: quiz2Rows[0].id,
          questionText: 'What is the correct way to update state based on the previous value in React?',
          optionA: 'setCount(count + 1) always',
          optionB: 'setCount((prev) => prev + 1)',
          optionC: 'count = count + 1',
          optionD: 'count++',
          correctOption: 'b',
          explanation:
            'The functional updater form avoids stale closures by receiving the latest previous state.',
          position: 1,
        },
        {
          quizId: quiz2Rows[0].id,
          questionText: 'When does a useEffect cleanup function run?',
          optionA: 'Only on the first render',
          optionB: 'Before the component unmounts and before the next effect run',
          optionC: 'Never in React 18',
          optionD: 'Only when state changes',
          correctOption: 'b',
          explanation:
            'React runs cleanup before re-running the effect and when the component unmounts, preventing leaks.',
          position: 2,
        },
        {
          quizId: quiz2Rows[0].id,
          questionText: 'Why should the key prop be stable and unique in a list?',
          optionA: 'It controls CSS specificity',
          optionB: 'It helps React identify which items changed, were added, or removed',
          optionC: 'It sets the DOM id attribute',
          optionD: 'It is required for TypeScript compilation',
          correctOption: 'b',
          explanation:
            'Stable keys let React reconcile the list efficiently and preserve component state correctly.',
          position: 3,
        },
      ]);

      console.log('Inserted quiz + questions for Course 1 second lesson');

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

      const answers1: Record<string, string> = {
        [q1[0].id]: 'a',
        [q1[1].id]: 'b',
        [q1[2].id]: 'a',
        [q1[3].id]: 'a',
      };
      const answers2: Record<string, string> = {
        [q1[0].id]: 'a',
        [q1[1].id]: 'b',
        [q1[2].id]: 'c',
        [q1[3].id]: 'a',
      };

      await db.insert(quizAttempts).values([
        {
          quizId: quiz1[0].id,
          studentId: student.id,
          lessonId: course1Lessons[0].id,
          courseId: course1.id,
          answers: JSON.stringify(answers1),
          score: 2,
          totalQuestions: 4,
          percentage: 50,
          completedAt: threeDaysAgo,
        },
        {
          quizId: quiz1[0].id,
          studentId: student.id,
          lessonId: course1Lessons[0].id,
          courseId: course1.id,
          answers: JSON.stringify(answers2),
          score: 3,
          totalQuestions: 4,
          percentage: 75,
          completedAt: oneDayAgo,
        },
      ]);

      console.log('Inserted 2 quiz attempts for student');
    } else {
      console.log('Skipped quiz seeding — already exists');
    }
  }

  console.log('Seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});