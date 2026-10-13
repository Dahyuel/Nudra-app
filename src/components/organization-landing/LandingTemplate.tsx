import React from 'react';
import { ArrowUpRight, BookOpen, Check, GraduationCap, MapPin, Mail, Phone, Sparkles } from 'lucide-react';
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
  return url && (/^https?:\/\//i.test(url) || /^\/[a-zA-Z0-9_\-./]+$/i.test(url)) ? url : undefined;
}
const enabledField = { type: 'radio' as const, label: 'Show this section', options: [{ label: 'Show', value: 'yes' }, { label: 'Hide', value: 'no' }] };
const titleField = { type: 'text' as const, label: 'Heading' };
const descriptionField = { type: 'textarea' as const, label: 'Description' };
const imageField = { type: 'text' as const, label: 'Image URL (HTTP, HTTPS, or /images/...)' };
const disabled = (enabled: string, editing: boolean, title: string) => enabled === 'no' ? (editing ? <div className="org-landing-hidden">{title} · hidden from visitors — select to enable</div> : <></>) : null;

function foreground(primary: string) {
  const rgb = primary.replace('#', '').match(/.{2}/g)?.map((value) => parseInt(value, 16)) || [6, 62, 51];
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 160 ? '#182B25' : '#FFFFFF';
}

const DEFAULT_EDITORIAL_IMAGES = {
  hero: '/images/landing/editorial/organizations-dark.png',
  about: '/images/landing/editorial/org-team.png',
  courseFallback: '/images/landing/editorial/org-classes.png',
  contact: '/images/landing/editorial/contact.png',
  closing: '/images/landing/editorial/closing-dark.png',
  steps: [
    '/images/landing/editorial/road-preparatory.png',
    '/images/landing/editorial/road-secondary.png',
    '/images/landing/editorial/road-skills.png',
  ],
};

const MARQUEE_PILLARS = [
  'Interactive Learning',
  'Certified Mentors',
  'Arabic & English',
  'Practical Projects',
  'Lifelong Sanctuary',
  'Flexible Schedules',
];

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
      render: ({ children, primaryColor, backgroundColor, textColor, radius }) => (
        <div
          className="org-landing"
          dir="ltr"
          lang="en"
          style={{
            '--landing-primary': primaryColor || '#063e33',
            '--landing-bg': backgroundColor || '#faf9f3',
            '--landing-text': textColor || '#182b25',
            '--landing-radius': radius === 'soft' ? '28px' : '4px',
            '--landing-on-primary': foreground(primaryColor || '#063e33'),
          } as React.CSSProperties}
        >
          {/* Header */}
          <header className="org-landing-header">
            <div className="org-landing-container org-landing-nav">
              <a href={'/' + query} onClick={stopPreview} className="org-landing-brand">
                {logo ? (
                  <img src={logo} alt="" className="org-landing-brand-logo" />
                ) : (
                  <span className="org-landing-brand-icon">
                    <GraduationCap size={22} />
                  </span>
                )}
                <span className="org-landing-brand-text">
                  {org.name}
                  <span className="org-landing-brand-dot">.</span>
                </span>
              </a>
              <nav aria-label="Organization website" className="org-landing-nav-links">
                <a href="#about" onClick={stopPreview} className="org-landing-nav-link">About</a>
                <a href="#features" onClick={stopPreview} className="org-landing-nav-link">Why us</a>
                <a href="#courses" onClick={stopPreview} className="org-landing-nav-link">Courses</a>
                <a href="#faq" onClick={stopPreview} className="org-landing-nav-link">FAQ</a>
                <a href={login} onClick={stopPreview} className="org-landing-nav-login">Sign in</a>
                <a className="org-landing-button org-landing-button-lime" href={register} onClick={stopPreview}>
                  <span>Join us</span>
                  <ArrowUpRight size={15} />
                </a>
              </nav>
            </div>
          </header>

          <main id="main-content">{children}</main>

          {/* Deep Forest Editorial Footer */}
          <footer className="org-landing-footer-wrapper">
            <div className="org-landing-container org-landing-footer-top-grid">
              <div className="org-landing-footer-brand-col">
                <a href={'/' + query} onClick={stopPreview} className="org-landing-brand org-landing-brand-white">
                  {logo ? (
                    <img src={logo} alt="" className="org-landing-brand-logo" />
                  ) : (
                    <span className="org-landing-brand-icon org-landing-brand-icon-dark">
                      <GraduationCap size={22} />
                    </span>
                  )}
                  <span className="org-landing-brand-text">
                    {org.name}
                    <span className="org-landing-brand-dot">.</span>
                  </span>
                </a>
                <p className="org-landing-footer-sub">
                  For every stage. For everything you can become. A dedicated learning space powered by Nudra.
                </p>
                <div className="org-landing-powered-badge">
                  <span className="org-landing-powered-dot">✦</span>
                  <span>Verified organization sanctuary</span>
                </div>
              </div>
              <div className="org-landing-footer-col">
                <h4>Navigation</h4>
                <a href="#about" onClick={stopPreview}>About our community</a>
                <a href="#features" onClick={stopPreview}>Why learn with us</a>
                <a href="#courses" onClick={stopPreview}>Course catalog</a>
                <a href="#faq" onClick={stopPreview}>Good to know</a>
              </div>
              <div className="org-landing-footer-col">
                <h4>Student Access</h4>
                <a href={login} onClick={stopPreview}>Sign in to student sanctuary</a>
                <a href={register} onClick={stopPreview}>Request membership</a>
                <a href="/help" onClick={stopPreview}>Student help & support</a>
              </div>
              <div className="org-landing-footer-col">
                <h4>Powered by Nudra</h4>
                <a href="https://nudra.org" target="_blank" rel="noopener noreferrer">
                  <span>Explore Nudra platform</span>
                  <ArrowUpRight size={13} />
                </a>
                <a href="/browse" onClick={stopPreview}>Academic catalog</a>
                <a href="/teach" onClick={stopPreview}>Become an instructor</a>
              </div>
            </div>
            <div className="org-landing-container org-landing-footer-bottom">
              <span>© {new Date().getFullYear()} {org.name}. All rights reserved.</span>
              <span className="org-landing-footer-motto">
                <span>Made for your next chapter.</span>
                <Sparkles size={14} className="text-[#a6ba49]" />
              </span>
            </div>
          </footer>
        </div>
      ),
    },
    components: {
      Hero: {
        label: 'Welcome / hero', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, eyebrow: { type: 'text', label: 'Small introduction' }, title: titleField, description: descriptionField, imageUrl: imageField, buttonLabel: { type: 'text', label: 'Signup button label' } },
        render: (props) => disabled(props.enabled, preview, 'Welcome') || (
          <>
            <section className="org-landing-hero-shell">
              <div className="org-landing-container org-landing-hero">
                <div className="org-landing-hero-copy">
                  <div className="org-landing-eyebrow-pill">
                    <span className="org-landing-sparkle">✦</span>
                    <span>{props.eyebrow || 'LEARN. GROW. GO FURTHER.'}</span>
                  </div>
                  <h1 className="org-landing-hero-title">
                    <span className="org-landing-title-main">{props.title}</span>
                    <span className="org-landing-dot">.</span>
                  </h1>
                  <p className="org-landing-copy">{props.description}</p>
                  <div className="org-landing-actions">
                    <a className="org-landing-button org-landing-button-lime" href={register} onClick={stopPreview}>
                      <span>{props.buttonLabel || 'Start learning'}</span>
                      <ArrowUpRight size={18} />
                    </a>
                    <a className="org-landing-button org-landing-button-ghost" href="#courses" onClick={stopPreview}>
                      <span>Explore courses</span>
                      <ArrowUpRight size={16} />
                    </a>
                  </div>
                  <div className="org-landing-trust-bar">
                    <div className="org-landing-trust-pill">
                      <span className="org-landing-trust-dot">✦</span>
                      <span>{courses.length ? `${courses.length} active courses & workshops` : 'A dedicated learning sanctuary'}</span>
                    </div>
                    <div className="org-landing-trust-sub">
                      <span>Arabic & English instruction</span>
                      <span className="org-landing-trust-sep">·</span>
                      <span>Verified certificates</span>
                    </div>
                  </div>
                </div>

                <div className="org-landing-hero-visual-frame">
                  <div className="org-landing-hero-backdrop-disc" />
                  <div className="org-landing-orbit" />
                  <div className="org-landing-hero-art-card">
                    <img
                      src={safeLandingUrl(props.imageUrl) || DEFAULT_EDITORIAL_IMAGES.hero}
                      alt={props.title}
                      className="org-landing-hero-art-img"
                    />
                    <div className="org-landing-floating-note">
                      <div className="org-landing-note-avatar">
                        <GraduationCap size={20} />
                      </div>
                      <div className="org-landing-note-text">
                        <strong>{org.name}</strong>
                        <span>Your pace. Your space ✦</span>
                      </div>
                    </div>
                    <div className="org-landing-floating-badge">
                      <span>✦ Practical learning</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Editorial Ticker / Marquee */}
            <div className="org-landing-ticker-strip" aria-label="Learning pillars">
              <div className="org-landing-ticker-track">
                {[0, 1].map((copyIndex) => (
                  <div className="org-landing-ticker-group" key={copyIndex} aria-hidden={copyIndex === 1}>
                    {MARQUEE_PILLARS.map((pillar, pIdx) => (
                      <span key={pIdx} className="org-landing-ticker-item">
                        <span className="org-landing-ticker-sparkle">✦</span>
                        <span>{pillar}</span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </>
        ),
      },
      About: {
        label: 'About the organization', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, imageUrl: imageField },
        render: (props) => disabled(props.enabled, preview, 'About') || (
          <section id="about" className="org-landing-container org-landing-section org-landing-about">
            <div className="org-landing-about-image-card">
              <div className="org-landing-about-halo" />
              <img
                src={safeLandingUrl(props.imageUrl) || DEFAULT_EDITORIAL_IMAGES.about}
                alt={props.title}
                className="org-landing-about-img"
              />
              <div className="org-landing-study-caption">
                <span className="org-landing-caption-sparkle">
                  <Sparkles size={18} />
                </span>
                <div>
                  <strong>A little support goes a long way.</strong>
                  <p>Learn together. Grow together in {org.name}.</p>
                </div>
              </div>
            </div>
            <div className="org-landing-about-copy">
              <div className="org-landing-eyebrow-pill">
                <span className="org-landing-sparkle">✦</span>
                <span>ABOUT OUR SANCTUARY</span>
              </div>
              <h2 className="org-landing-heading-editorial">{props.title}</h2>
              <p className="org-landing-copy">{props.description}</p>
              <div className="org-landing-about-pillars">
                <div className="org-landing-pillar">
                  <span className="org-landing-pillar-dot">✦</span>
                  <span>Dedicated educators</span>
                </div>
                <div className="org-landing-pillar">
                  <span className="org-landing-pillar-dot">✦</span>
                  <span>Curated curriculum</span>
                </div>
                <div className="org-landing-pillar">
                  <span className="org-landing-pillar-dot">✦</span>
                  <span>Collaborative space</span>
                </div>
                <div className="org-landing-pillar">
                  <span className="org-landing-pillar-dot">✦</span>
                  <span>Real practical progress</span>
                </div>
              </div>
              <div className="org-landing-about-action">
                <a href={register} onClick={stopPreview} className="org-landing-text-link">
                  <span>Join our community</span>
                  <ArrowUpRight size={17} />
                </a>
              </div>
            </div>
          </section>
        ),
      },
      Features: {
        label: 'Learning benefits', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, items: { type: 'array', label: 'Benefits (up to 6)', max: 6, arrayFields: { title: titleField, description: descriptionField }, defaultItemProps: { title: 'A reason to learn with us', description: 'Tell learners what makes your organization special.' }, getItemSummary: (item) => item.title || 'Benefit' } },
        render: (props) => disabled(props.enabled, preview, 'Benefits') || (
          <section id="features" className="org-landing-container org-landing-section org-landing-features-section">
            <div className="org-landing-section-heading">
              <div className="org-landing-eyebrow-pill">
                <span className="org-landing-sparkle">✦</span>
                <span>SMALL STEPS. REAL PROGRESS.</span>
              </div>
              <h2 className="org-landing-heading-editorial">{props.title}</h2>
              <p className="org-landing-section-sub">
                Designed to give every learner the space, focus, and mentorship needed to excel.
              </p>
            </div>
            <div className="org-landing-steps-grid">
              {props.items.map((item, i) => {
                const stepTones = ['mint', 'peach', 'lavender', 'yellow', 'mint', 'peach'];
                const tone = stepTones[i % stepTones.length];
                const stepImg = DEFAULT_EDITORIAL_IMAGES.steps[i % DEFAULT_EDITORIAL_IMAGES.steps.length];
                return (
                  <article className={`org-landing-step-card org-landing-tone-${tone}`} key={i}>
                    <div className="org-landing-step-art">
                      <img src={stepImg} alt="" className="org-landing-step-img" loading="lazy" />
                      <span className="org-landing-step-token">
                        <Sparkles size={16} />
                      </span>
                    </div>
                    <div className="org-landing-step-connector">
                      <span className="org-landing-step-badge">0{i + 1}</span>
                      <div className="org-landing-step-dash" />
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ),
      },
      Courses: {
        label: 'Live course catalog', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, delivery: { type: 'select', label: 'Courses to display', options: [{ label: 'Online and offline', value: 'all' }, { label: 'Online only', value: 'online' }, { label: 'Offline bookings only', value: 'offline' }] }, limit: { type: 'number', label: 'Maximum courses', min: 1, max: 12 } },
        render: (props) => {
          const hidden = disabled(props.enabled, preview, 'Courses');
          if (hidden) return hidden;
          const visible = courses.filter((course) => props.delivery === 'all' || course.deliveryMode === props.delivery).slice(0, props.limit);
          return (
            <section id="courses" className="org-landing-container org-landing-section org-landing-catalog-section">
              <div className="org-landing-section-heading org-landing-catalog-heading">
                <div>
                  <div className="org-landing-eyebrow-pill">
                    <span className="org-landing-sparkle">✦</span>
                    <span>CURATED CURRICULUM</span>
                  </div>
                  <h2 className="org-landing-heading-editorial">{props.title}</h2>
                  <p className="org-landing-copy">{props.description}</p>
                </div>
                {visible.length > 0 && (
                  <div className="org-landing-catalog-count-pill">
                    <span>{visible.length} offerings available</span>
                  </div>
                )}
              </div>
              {visible.length ? (
                <div className="org-landing-courses-grid">
                  {visible.map((course) => (
                    <article key={course.id} className="org-landing-course-card">
                      <div className="org-landing-course-image">
                        <img
                          src={safeLandingUrl(course.thumbnailUrl) || DEFAULT_EDITORIAL_IMAGES.courseFallback}
                          alt={course.title}
                          loading="lazy"
                        />
                        <span className="org-landing-delivery-tag">
                          {course.deliveryMode === 'offline' ? 'In Person · Booking' : 'Online Course'}
                        </span>
                      </div>
                      <div className="org-landing-course-body">
                        <p className="org-landing-course-meta">
                          <span>{course.category}</span>
                          <span className="org-landing-meta-sep">·</span>
                          <span>{course.level}</span>
                        </p>
                        <h3>{course.title}</h3>
                        <p className="org-landing-course-description">{course.description}</p>
                        {course.deliveryMode === 'offline' && (
                          <p className="org-landing-course-location">
                            <MapPin size={14} className="shrink-0 text-[#2D6A4F]" />
                            <span>{course.location || 'Location details shared upon registration'}{course.scheduleText ? ' · ' + course.scheduleText : ''}</span>
                          </p>
                        )}
                        <div className="org-landing-course-bottom">
                          <div className="org-landing-course-price">
                            {course.deliveryMode === 'offline'
                              ? 'Book your place'
                              : Number(course.price) > 0
                              ? `${Number(course.price).toLocaleString('en')} EGP`
                              : 'Free Access'}
                          </div>
                          <a
                            onClick={stopPreview}
                            href={course.deliveryMode === 'offline' ? safeLandingUrl(course.bookingUrl) || register : '/course/' + course.id + query}
                            {...(course.deliveryMode === 'offline' && safeLandingUrl(course.bookingUrl) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className="org-landing-course-link"
                          >
                            <span>{course.deliveryMode === 'offline' ? 'Book now' : 'View course'}</span>
                            <ArrowUpRight size={15} />
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="org-landing-showcase-card">
                  <div className="org-landing-showcase-art">
                    <img
                      src={DEFAULT_EDITORIAL_IMAGES.courseFallback}
                      alt="Learners collaborating"
                      className="org-landing-showcase-img"
                    />
                  </div>
                  <div className="org-landing-showcase-content">
                    <div className="org-landing-eyebrow-pill">
                      <span className="org-landing-sparkle">✦</span>
                      <span>NEW CHAPTER LAUNCHING SOON</span>
                    </div>
                    <h3>Curated courses are in preparation</h3>
                    <p>
                      Our educators are finalizing new courses and hands-on workshops for {org.name}.
                      Create your student account today to be among the first invited when admissions open.
                    </p>
                    <div className="org-landing-showcase-actions">
                      <a href={register} onClick={stopPreview} className="org-landing-button org-landing-button-lime">
                        <span>Join {org.name} to get notified</span>
                        <ArrowUpRight size={17} />
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </section>
          );
        },
      },
      FAQ: {
        label: 'Frequently asked questions', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, items: { type: 'array', label: 'Questions (up to 8)', max: 8, arrayFields: { question: { type: 'text', label: 'Question' }, answer: { type: 'textarea', label: 'Answer' } }, defaultItemProps: { question: 'Your question', answer: 'Your answer' }, getItemSummary: (item) => item.question || 'Question' } },
        render: (props) => disabled(props.enabled, preview, 'FAQ') || (
          <section id="faq" className="org-landing-container org-landing-section org-landing-faq">
            <div className="org-landing-faq-intro">
              <div className="org-landing-eyebrow-pill">
                <span className="org-landing-sparkle">✦</span>
                <span>GOOD TO KNOW</span>
              </div>
              <h2 className="org-landing-heading-editorial">{props.title}</h2>
              <p className="org-landing-copy">Everything you need to know about joining and learning with our organization.</p>
              <div className="org-landing-faq-help-box">
                <Sparkles size={20} className="text-[#a6ba49]" />
                <div>
                  <strong>Have a different question?</strong>
                  <p>Reach out directly through our contact details below or message support.</p>
                </div>
              </div>
            </div>
            <div className="org-landing-faq-list">
              {props.items.map((item, i) => (
                <details key={i} className="org-landing-faq-item">
                  <summary className="org-landing-faq-question">
                    <span>{item.question}</span>
                    <span className="org-landing-faq-icon">+</span>
                  </summary>
                  <p className="org-landing-faq-answer">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ),
      },
      Contact: {
        label: 'Contact information', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, email: { type: 'text', label: 'Email address' }, phone: { type: 'text', label: 'Phone number' }, address: { type: 'textarea', label: 'Address' } },
        render: (props) => disabled(props.enabled, preview, 'Contact') || (
          <section id="contact" className="org-landing-container org-landing-section org-landing-contact">
            <div className="org-landing-contact-intro">
              <div className="org-landing-eyebrow-pill">
                <span className="org-landing-sparkle">✦</span>
                <span>GET IN TOUCH</span>
              </div>
              <h2 className="org-landing-heading-editorial">{props.title}</h2>
              <p className="org-landing-copy">{props.description}</p>
              <div className="org-landing-contact-art-wrap">
                <img src={DEFAULT_EDITORIAL_IMAGES.contact} alt="Reach out" className="org-landing-contact-art" />
              </div>
            </div>
            <address className="org-landing-contact-cards">
              {props.email && (
                <a href={'mailto:' + props.email} onClick={stopPreview} className="org-landing-contact-card">
                  <div className="org-landing-contact-icon"><Mail size={20} /></div>
                  <div className="org-landing-contact-info">
                    <span className="org-landing-contact-label">Email us directly</span>
                    <strong>{props.email}</strong>
                  </div>
                  <ArrowUpRight size={17} className="org-landing-contact-arrow" />
                </a>
              )}
              {props.phone && (
                <a href={'tel:' + props.phone} onClick={stopPreview} className="org-landing-contact-card">
                  <div className="org-landing-contact-icon"><Phone size={20} /></div>
                  <div className="org-landing-contact-info">
                    <span className="org-landing-contact-label">Call or WhatsApp</span>
                    <strong>{props.phone}</strong>
                  </div>
                  <ArrowUpRight size={17} className="org-landing-contact-arrow" />
                </a>
              )}
              {props.address && (
                <div className="org-landing-contact-card">
                  <div className="org-landing-contact-icon"><MapPin size={20} /></div>
                  <div className="org-landing-contact-info">
                    <span className="org-landing-contact-label">Visit our location</span>
                    <strong>{props.address}</strong>
                  </div>
                </div>
              )}
            </address>
          </section>
        ),
      },
      CTA: {
        label: 'Final signup prompt', permissions: { delete: false, duplicate: false, insert: false },
        fields: { enabled: enabledField, title: titleField, description: descriptionField, buttonLabel: { type: 'text', label: 'Signup button label' } },
        render: (props) => disabled(props.enabled, preview, 'Signup prompt') || (
          <section className="org-landing-container org-landing-section org-landing-cta-section">
            <div className="org-landing-cta-editorial">
              <div className="org-landing-cta-sparkle-top">✦</div>
              <div className="org-landing-cta-content">
                <div className="org-landing-cta-badge">
                  <GraduationCap size={18} />
                  <span>Your next chapter starts here</span>
                </div>
                <h2 className="org-landing-cta-title">
                  {props.title || 'Keep learning. Keep becoming you.'}
                </h2>
                <p className="org-landing-cta-copy">
                  {props.description || 'From your first foundations to your next ambition. Take the next step with ' + org.name + '.'}
                </p>
                <div className="org-landing-cta-actions">
                  <a className="org-landing-button org-landing-button-lime" href={register} onClick={stopPreview}>
                    <span>{props.buttonLabel || 'Let’s start learning'}</span>
                    <ArrowUpRight size={18} />
                  </a>
                </div>
              </div>
              <div className="org-landing-cta-visual">
                <img
                  src={DEFAULT_EDITORIAL_IMAGES.closing}
                  alt="An illustrated learner on an open book"
                  className="org-landing-cta-img"
                  loading="lazy"
                />
                <Sparkles className="org-landing-cta-star" size={36} strokeWidth={1.3} />
              </div>
            </div>
          </section>
        ),
      },
    },
  };
}

