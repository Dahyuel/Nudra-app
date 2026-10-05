import { z } from 'zod';

const short = z.string().trim().max(180);
const paragraph = z.string().trim().max(4000);
const image = z.union([z.literal(''), z.string().max(2048).url().refine((url) => /^https?:\/\//i.test(url), 'Use an HTTP or HTTPS image URL.')]);
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
    root: { props: { primaryColor: org.primaryColor || '#2D6A4F', backgroundColor: '#F8FAF9', textColor: '#172B23', radius: 'soft' } },
    content: [
      { type: 'Hero', props: { id: 'hero', enabled: 'yes', eyebrow: 'Learn. Grow. Go further.', title: 'Your next chapter starts at ' + org.name, description: 'Explore expert-led courses and practical learning experiences designed to help you take your next step.', imageUrl: '', buttonLabel: 'Start learning' } },
      { type: 'About', props: { id: 'about', enabled: 'yes', title: 'A learning space built for you', description: 'At ' + org.name + ', we bring learners and instructors together through online courses and in-person experiences.', imageUrl: '' } },
      { type: 'Features', props: { id: 'features', enabled: 'yes', title: 'Make progress your way', items: [{ title: 'Expert instructors', description: 'Learn from people who know their subject and care about your progress.' }, { title: 'Flexible learning', description: 'Find online courses and in-person sessions that fit your goals.' }, { title: 'A place to grow', description: 'Build knowledge and practical skills, one course at a time.' }] } },
      { type: 'Courses', props: { id: 'courses', enabled: 'yes', title: 'Explore our courses', description: 'Discover what you can learn next.', delivery: 'all', limit: 6 } },
      { type: 'FAQ', props: { id: 'faq', enabled: 'yes', title: 'A few things you might want to know', items: [{ question: 'How do I join?', answer: 'Create a student account and request to join our organization. Our team will review your request.' }, { question: 'Can I attend in person?', answer: 'Courses marked as offline include booking information, a location, and a schedule.' }] } },
      { type: 'Contact', props: { id: 'contact', enabled: 'no', title: 'Let’s talk', description: 'Have a question? Our team is here to help.', email: '', phone: '', address: '' } },
      { type: 'CTA', props: { id: 'cta', enabled: 'yes', title: 'Ready to take the next step?', description: 'Join our learning community and discover your next course.', buttonLabel: 'Create student account' } },
    ],
  };
}
