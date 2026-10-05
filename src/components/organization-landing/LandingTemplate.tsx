import React from 'react';
import { ArrowRight, BookOpen, Check, GraduationCap, MapPin, Mail, Phone } from 'lucide-react';
import type { Config, Data } from '@puckeditor/core';
import './landing.css';

export type LandingOrganization = { id: string; name: string; slug: string; logoUrl: string | null; primaryColor: string | null; customDomain?: string | null; customDomainStatus?: string };
export type LandingCourse = { id: string; title: string; description: string; category: string; level: string; thumbnailUrl: string | null; deliveryMode: 'online' | 'offline'; price: string; location: string | null; scheduleText: string | null; bookingUrl: string | null };
type Common = { enabled: 'yes' | 'no' };
export type LandingComponents = {
  Hero: Common & { eyebrow: string; title: string; description: string; imageUrl: string; buttonLabel: string };
  About: Common & { title: string; description: string; imageUrl: string };
  Features: Common & { title: string; items: { title: string; description: string }[] };
  Courses: Common & { title: string; description: string; delivery: 'all' | 'online' | 'offline'; limit: number };
  FAQ: Common & { title: string; items: { question: string; answer: string }[] };
  Contact: Common & { title: string; description: string; email: string; phone: string; address: string };
  CTA: Common & { title: string; description: string; buttonLabel: string };
};
export type LandingRoot = { primaryColor: string; backgroundColor: string; textColor: string; radius: 'soft' | 'square' };
export type LandingData = Data<LandingComponents, LandingRoot>;

export function safeLandingUrl(url: string | null | undefined) {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}
const enabledField = { type: 'radio' as const, label: 'Show this section', options: [{ label: 'Show', value: 'yes' }, { label: 'Hide', value: 'no' }] };
const titleField = { type: 'text' as const, label: 'Heading' };
const descriptionField = { type: 'textarea' as const, label: 'Description' };
const imageField = { type: 'text' as const, label: 'Image URL (HTTP or HTTPS)' };
const disabled = (enabled: string, editing: boolean, title: string) => enabled === 'no' ? (editing ? <div className="org-landing-hidden">{title} · hidden from visitors — select to enable</div> : <></>) : null;

function foreground(primary: string) {
  const rgb = primary.replace('#', '').match(/.{2}/g)?.map((value) => parseInt(value, 16)) || [45, 106, 79];
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 160 ? '#172B23' : '#FFFFFF';
}

export function createLandingConfig(org: LandingOrganization, courses: LandingCourse[], preview = false): Config<LandingComponents, LandingRoot> {
  const query = '?org=' + encodeURIComponent(org.slug);
  const stopPreview = (event: React.MouseEvent) => { if (preview) event.preventDefault(); };
  const register = '/register' + query;
  const login = '/login' + query;
  const logo = safeLandingUrl(org.logoUrl);
  return {
    root: {
      fields: {
        primaryColor: { type: 'custom', label: 'Accent color', render: ({ value, onChange }) => <input aria-label="Accent color" type="color" value={value} onChange={(e) => onChange(e.target.value)} /> },
        backgroundColor: { type: 'custom', label: 'Page background', render: ({ value, onChange }) => <input aria-label="Page background" type="color" value={value} onChange={(e) => onChange(e.target.value)} /> },
        textColor: { type: 'custom', label: 'Text color', render: ({ value, onChange }) => <input aria-label="Text color" type="color" value={value} onChange={(e) => onChange(e.target.value)} /> },
        radius: { type: 'radio', label: 'Corners', options: [{ label: 'Rounded', value: 'soft' }, { label: 'Square', value: 'square' }] },
      },
      render: ({ children, primaryColor, backgroundColor, textColor, radius }) => <div className="org-landing" dir="ltr" lang="en" style={{ '--landing-primary': primaryColor, '--landing-bg': backgroundColor, '--landing-text': textColor, '--landing-radius': radius === 'soft' ? '24px' : '4px', '--landing-on-primary': foreground(primaryColor) } as React.CSSProperties}>
        <header className="org-landing-header"><div className="org-landing-container org-landing-nav">
          <a href={'/' + query} onClick={stopPreview} className="org-landing-brand">{logo ? <img src={logo} alt="" /> : <span className="org-landing-brand-icon"><GraduationCap size={24} /></span>}<span>{org.name}</span></a>
          <nav aria-label="Organization website"><a href="#courses" onClick={stopPreview}>Courses</a><a href={login} onClick={stopPreview}>Sign in</a><a className="org-landing-button" href={register} onClick={stopPreview}>Join us <ArrowRight size={16} /></a></nav>
        </div></header>
        <main>{children}</main>
        <footer className="org-landing-container org-landing-footer"><span>© {new Date().getFullYear()} {org.name}</span><span>Learning powered by Nudra</span><a href={login} onClick={stopPreview}>Sign in to your learning space</a></footer>
      </div>,
    },
    components: {
      Hero: {
        label: 'Welcome / hero', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, eyebrow: { type: 'text', label: 'Small introduction' }, title: titleField, description: descriptionField, imageUrl: imageField, buttonLabel: { type: 'text', label: 'Signup button label' } },
        render: (props) => disabled(props.enabled, preview, 'Welcome') || <section className="org-landing-container org-landing-hero"><div>
          <p className="org-landing-eyebrow"><span />{props.eyebrow}</p><h1>{props.title}</h1><p className="org-landing-copy">{props.description}</p>
          <div className="org-landing-actions"><a className="org-landing-button" href={register} onClick={stopPreview}>{props.buttonLabel}<ArrowRight size={18} /></a><a className="org-landing-text-link" href="#courses" onClick={stopPreview}>Explore courses</a></div>
          <p className="org-landing-small"><Check size={16} /> {courses.length ? courses.length + ' courses to explore' : 'Your learning journey starts here'}</p>
        </div><div className="org-landing-hero-art">{safeLandingUrl(props.imageUrl) ? <img src={props.imageUrl} alt={props.title} /> : <div className="org-landing-artwork"><div className="org-landing-orbit" /><BookOpen size={100} strokeWidth={1.2} /><div className="org-landing-art-label"><GraduationCap size={20} /><div><strong>Keep moving forward</strong><span>One lesson. One new possibility.</span></div></div></div>}</div></section>,
      },
      About: {
        label: 'About the organization', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, imageUrl: imageField },
        render: (props) => disabled(props.enabled, preview, 'About') || <section className="org-landing-container org-landing-section org-landing-about"><div className="org-landing-about-image">{safeLandingUrl(props.imageUrl) ? <img src={props.imageUrl} alt={props.title} /> : <><GraduationCap size={64} strokeWidth={1.3} /><span>{org.name}</span></>}</div><div><p className="org-landing-eyebrow">ABOUT US</p><h2>{props.title}</h2><p className="org-landing-copy">{props.description}</p></div></section>,
      },
      Features: {
        label: 'Learning benefits', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, items: { type: 'array', label: 'Benefits (up to 6)', max: 6, arrayFields: { title: titleField, description: descriptionField }, defaultItemProps: { title: 'A reason to learn with us', description: 'Tell learners what makes your organization special.' }, getItemSummary: (item) => item.title || 'Benefit' } },
        render: (props) => disabled(props.enabled, preview, 'Benefits') || <section className="org-landing-container org-landing-section"><div className="org-landing-section-heading"><p className="org-landing-eyebrow">WHY LEARN WITH US</p><h2>{props.title}</h2></div><div className="org-landing-features">{props.items.map((item, i) => <article className="org-landing-card" key={i}><span className="org-landing-feature-icon"><Check size={24} /></span><h3>{item.title}</h3><p>{item.description}</p></article>)}</div></section>,
      },
      Courses: {
        label: 'Live course catalog', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, delivery: { type: 'select', label: 'Courses to display', options: [{ label: 'Online and offline', value: 'all' }, { label: 'Online only', value: 'online' }, { label: 'Offline bookings only', value: 'offline' }] }, limit: { type: 'number', label: 'Maximum courses', min: 1, max: 12 } },
        render: (props) => {
          const hidden = disabled(props.enabled, preview, 'Courses');
          if (hidden) return hidden;
          const visible = courses.filter((course) => props.delivery === 'all' || course.deliveryMode === props.delivery).slice(0, props.limit);
          return <section id="courses" className="org-landing-container org-landing-section"><div className="org-landing-section-heading"><p className="org-landing-eyebrow">FIND YOUR NEXT STEP</p><h2>{props.title}</h2><p className="org-landing-copy">{props.description}</p></div>{visible.length ? <div className="org-landing-courses">{visible.map((course) => <article key={course.id} className="org-landing-course-card">
            <div className="org-landing-course-image">{safeLandingUrl(course.thumbnailUrl) ? <img src={course.thumbnailUrl!} alt="" loading="lazy" /> : <BookOpen size={42} />}<span>{course.deliveryMode === 'offline' ? 'In-person · booking' : 'Online course'}</span></div>
            <div className="org-landing-course-body"><p className="org-landing-eyebrow">{course.category} · {course.level}</p><h3>{course.title}</h3><p className="org-landing-course-description">{course.description}</p>
              {course.deliveryMode === 'offline' && <p className="org-landing-course-location"><MapPin size={14} />{course.location}{course.scheduleText ? ' · ' + course.scheduleText : ''}</p>}
              <div className="org-landing-course-bottom"><strong>{course.deliveryMode === 'offline' ? 'Book your place' : Number(course.price) > 0 ? Number(course.price).toLocaleString('en') + ' EGP' : 'Free'}</strong><a onClick={stopPreview} href={course.deliveryMode === 'offline' ? safeLandingUrl(course.bookingUrl) || register : '/course/' + course.id + query} {...(course.deliveryMode === 'offline' && safeLandingUrl(course.bookingUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{course.deliveryMode === 'offline' ? 'Book now' : 'View course'}<ArrowRight size={15} /></a></div>
            </div>
          </article>)}</div> : <div className="org-landing-empty"><BookOpen size={32} /><h3>New courses are on their way</h3><p>Check back soon to discover your next learning experience.</p></div>}</section>;
        },
      },
      FAQ: {
        label: 'Frequently asked questions', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, items: { type: 'array', label: 'Questions (up to 8)', max: 8, arrayFields: { question: { type: 'text', label: 'Question' }, answer: { type: 'textarea', label: 'Answer' } }, defaultItemProps: { question: 'Your question', answer: 'Your answer' }, getItemSummary: (item) => item.question || 'Question' } },
        render: (props) => disabled(props.enabled, preview, 'FAQ') || <section className="org-landing-container org-landing-section org-landing-faq"><div><p className="org-landing-eyebrow">GOOD TO KNOW</p><h2>{props.title}</h2></div><div>{props.items.map((item, i) => <details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></section>,
      },
      Contact: {
        label: 'Contact information', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, email: { type: 'text', label: 'Email address' }, phone: { type: 'text', label: 'Phone number' }, address: { type: 'textarea', label: 'Address' } },
        render: (props) => disabled(props.enabled, preview, 'Contact') || <section className="org-landing-container org-landing-section org-landing-contact"><div><p className="org-landing-eyebrow">GET IN TOUCH</p><h2>{props.title}</h2><p className="org-landing-copy">{props.description}</p></div><address>{props.email && <a href={'mailto:' + props.email} onClick={stopPreview}><Mail size={20} />{props.email}</a>}{props.phone && <p><Phone size={20} />{props.phone}</p>}{props.address && <p><MapPin size={20} />{props.address}</p>}</address></section>,
      },
      CTA: {
        label: 'Final signup prompt', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, buttonLabel: { type: 'text', label: 'Signup button label' } },
        render: (props) => disabled(props.enabled, preview, 'Signup prompt') || <section className="org-landing-container org-landing-section"><div className="org-landing-cta"><GraduationCap size={36} /><h2>{props.title}</h2><p>{props.description}</p><a className="org-landing-button org-landing-button-inverse" href={register} onClick={stopPreview}>{props.buttonLabel}<ArrowRight size={18} /></a></div></section>,
      },
    },
  };
}
