import { z } from 'zod';

const short = z.string().trim().max(180);
const paragraph = z.string().trim().max(4000);
const image = z.union([
  z.literal(''),
  z.string().max(2048).refine((url) => /^https?:\/\//i.test(url) || /^\/[a-zA-Z0-9_\-./]+$/i.test(url), 'Use an HTTP, HTTPS, or root-relative image URL.'),
]);
const common = { id: z.string().min(1).max(100), enabled: z.enum(['yes', 'no']) };
const section = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Hero'), props: z.object({ ...common, eyebrow: short, title: short.min(1), description: paragraph, imageUrl: image, buttonLabel: short.min(1) }).strict() }).strict(),
  z.object({ type: z.literal('About'), props: z.object({ ...common, title: short, description: paragraph, imageUrl: image }).strict() }).strict(),
  z.object({ type: z.literal('Features'), props: z.object({ ...common, title: short, items: z.array(z.object({ title: short, description: paragraph }).strict()).max(6) }).strict() }).strict(),
  z.object({ type: z.literal('Courses'), props: z.object({ ...common, title: short, description: paragraph, delivery: z.enum(['all', 'online', 'offline']), limit: z.number().int().min(1).max(12) }).strict() }).strict(),
  z.object({ type: z.literal('FAQ'), props: z.object({ ...common, title: short, items: z.array(z.object({ question: short, answer: paragraph }).strict()).max(8) }).strict() }).strict(),
  z.object({ type: z.literal('Contact'), props: z.object({ ...common, title: short, description: paragraph, email: z.union([z.literal(''), z.string().email().max(255)]), phone: z.string().max(80), address: z.string().max(500) }).strict() }).strict(),
  z.object({ type: z.literal('CTA'), props: z.object({ ...common, title: short, description: paragraph, buttonLabel: short.min(1) }).strict() }).strict(),
]);

export const landingPageSchema = z.object({
  root: z.object({ props: z.object({
    id: z.string().max(100).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    radius: z.enum(['soft', 'square']),
  }).strict() }).strict(),
  content: z.array(section).length(7),
}).strict().superRefine((data, ctx) => {
  if (new Set(data.content.map((item) => item.type)).size !== 7 || new Set(data.content.map((item) => item.props.id)).size !== 7) {
    ctx.addIssue({ code: 'custom', message: 'Keep exactly one of each template section with a unique ID.' });
  }
  if (!data.content.some((item) => item.props.enabled === 'yes')) {
    ctx.addIssue({ code: 'custom', message: 'Enable at least one landing page section.' });
  }
});

export type LandingData = z.infer<typeof landingPageSchema>;

export function defaultLandingPage(org: { name: string; primaryColor: string | null }): LandingData {
  return {
    root: { props: { primaryColor: org.primaryColor || '#0F766E', backgroundColor: '#faf9f3', textColor: '#182b25', radius: 'soft' } },
    content: [
      { type: 'Hero', props: { id: 'hero', enabled: 'yes', eyebrow: 'ACCREDITED DIPLOMAS & PROGRAMS · ENROLLING NOW', title: 'Empowering Learners to Master Practical Skills & Lead', description: 'Welcome to ' + org.name + '. Explore specialized academic tracks, industry-backed certifications, and hands-on faculty mentorship tailored for your future.', imageUrl: '/images/landing/editorial/org-brand.png', buttonLabel: 'Explore Admissions' } },
      { type: 'About', props: { id: 'about', enabled: 'yes', title: 'Our Mission: Excellence in Practical Education', description: 'At ' + org.name + ', we are dedicated to delivering premier learning experiences. Our curriculum bridges foundational academic theory with real-world industry demands, empowering students and ambitious professionals to excel.', imageUrl: '/images/landing/editorial/org-team.png' } },
      { type: 'Features', props: { id: 'features', enabled: 'yes', title: 'Why Study at ' + org.name, items: [
        { title: 'Accredited Curriculum', description: 'Coursework and practical skill tracks meticulously designed to meet academic and market standards.' },
        { title: 'Dedicated Faculty Mentors', description: 'Learn directly from certified educators and domain practitioners committed to your personal progress.' },
        { title: 'Recognized Credentials', description: 'Earn verified credentials and portfolio projects that demonstrate mastery and unlock new opportunities.' }
      ] } },
      { type: 'Courses', props: { id: 'courses', enabled: 'yes', title: 'Academic Programs & Offerings', description: 'Discover our certified courses, interactive cohorts, and specialized workshops available this term.', delivery: 'all', limit: 6 } },
      { type: 'FAQ', props: { id: 'faq', enabled: 'yes', title: 'Admissions & Program Information', items: [
        { question: 'How do I apply for a course or diploma?', answer: 'Create a student account with our academy, select your desired program, and complete enrollment. Our admissions team will guide you through next steps.' },
        { question: 'Are certificates verified upon graduation?', answer: 'Yes! Every graduate receives a verified digital certificate hosted and validated on the Nudra learning infrastructure.' },
        { question: 'Do you offer in-person workshops and campus sessions?', answer: 'Yes! Programs marked as in-person include scheduled lecture times, workshop venues, and location details shared upon enrollment.' }
      ] } },
      { type: 'Contact', props: { id: 'contact', enabled: 'no', title: 'Contact Our Admissions Office', description: 'Have questions about course registration, corporate training, or schedules? Our advisors are here to help.', email: '', phone: '', address: '' } },
      { type: 'CTA', props: { id: 'cta', enabled: 'yes', title: 'Start Your Educational Journey With ' + org.name, description: 'Take the decisive step toward achieving your goals. Join our community of motivated students and instructors today.', buttonLabel: 'Apply for Admission' } },
    ],
  };
}
