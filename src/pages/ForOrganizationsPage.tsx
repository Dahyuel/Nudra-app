import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Layers, Users, BookOpen, CalendarDays } from 'lucide-react';
import { LandingContact } from './LandingContact';
import './landing-page.css';
import './landing-roadmap.css';
import './landing-organizations.css';
import './landing-editorial.css';
import './for-organizations.css';

const chapters = [
  { id: 'your-brand', label: 'YOUR IDENTITY', title: 'A learning space that feels like yours.', text: 'Give your community a familiar home. Your organization’s name, logo, colors, and landing page introduce your courses your way.', image: 'org-brand', alt: 'An academy founder shaping her own branded learning page', items: ['Customize your name, logo, and brand color.', 'Create and edit your organization’s landing page.', 'Share your Nudra organization subdomain.', 'Connect a custom domain with ownership verification.'] },
  { id: 'your-people', label: 'YOUR COMMUNITY', title: 'Bring the right people together.', text: 'Keep learners and educators connected through one organization. A manager reviews membership requests and invites the instructors who will guide your community.', image: 'org-team', alt: 'An instructor welcoming learners into a shared learning community', items: ['Review and approve student membership requests.', 'Invite instructors into your organization.', 'Give members a dedicated organization learning portal.', 'Manage active members and their roles.'] },
  { id: 'your-learning', label: 'YOUR WAY OF TEACHING', title: 'Online lessons. Real-world learning.', text: 'Build a course collection for your community, with online learning and in-person options in the same familiar place.', image: 'org-classes', alt: 'An instructor planning online lessons and classroom sessions', items: ['Create courses and assign active instructors.', 'Review instructor submissions before publication.', 'Publish approved courses when they are ready.', 'Share in-person course locations, schedules, and booking options.'] },
];

export function ForOrganizationsPage() {
  useEffect(() => { const previous = document.title; document.title = 'Nudra for Organizations | Your learning community'; window.scrollTo(0, 0); return () => { document.title = previous; }; }, []);
  return <div className="nudra-landing nudra-organizations-page">
    <a className="nl-skip" href="#org-main">Skip to content</a>
    <header className="nl-header nl-container">
      <Link to="/" className="nl-brand" aria-label="Nudra home"><img src="/favicon.png" alt="" width="36" height="36" /><span>nudra<span className="nl-brand-dot">.</span></span></Link>
      <nav className="no-nav" aria-label="Organization page navigation"><a href="#your-brand">Your space</a><a href="#your-people">Your people</a><a href="#your-learning">Your courses</a></nav>
      <a href="#contact" className="nl-button nl-header-cta">Let’s talk <ArrowUpRight size={16} aria-hidden="true" /></a>
    </header>
    <main id="org-main">
      <section className="no-hero nl-container"><div><span className="nl-eyebrow">NUDRA FOR ORGANIZATIONS</span><h1>Your community.<br />Your identity.<br /><span>Your next chapter.</span></h1><p>A home for the people you teach. Bring your academy, learning center, or training community together with your own branded learning space.</p><a href="#your-brand" className="nl-button nl-button-dark">See what’s possible <ArrowUpRight size={18} aria-hidden="true" /></a></div><img src="/images/landing/editorial/organizations.png" alt="Educators and learners building a shared learning community" width="1536" height="1024" fetchPriority="high" /></section>
      <section className="no-intro"><div className="nl-container"><span className="nl-eyebrow">A PLACE FOR YOUR WHOLE COMMUNITY</span><h2>Less scattered.<br /><span>More connected.</span></h2><p>From your first course to your next intake, give your organization one place to bring its people and learning together.</p><div className="no-overview">{[{icon:Layers,title:'Your brand'},{icon:Users,title:'Your people'},{icon:BookOpen,title:'Your courses'},{icon:CalendarDays,title:'Your sessions'}].map(item=><div key={item.title}><item.icon size={27} strokeWidth={1.4} aria-hidden="true" /><span>{item.title}</span></div>)}</div></div></section>
      {chapters.map((chapter,index)=><section className={`no-chapter nl-container no-chapter-${index}`} id={chapter.id} key={chapter.id}><img src={`/images/landing/editorial/${chapter.image}.png`} alt={chapter.alt} width="1024" height="1024" loading="lazy" /><div><span className="nl-eyebrow">{chapter.label}</span><h2>{chapter.title}</h2><p>{chapter.text}</p><ul>{chapter.items.map(item=><li key={item}><Check size={17} aria-hidden="true" /><span>{item}</span></li>)}</ul></div></section>)}
      <section className="no-workflow"><div className="nl-container"><span className="nl-eyebrow">FROM AN IDEA TO A LEARNING COMMUNITY</span><h2>A familiar rhythm.<br /><span>Your own way forward.</span></h2><div className="no-process">{[{title:'Shape your space',text:'Set up your organization’s identity and landing page.'},{title:'Bring your team',text:'Invite instructors and review learner membership requests.'},{title:'Share your learning',text:'Prepare, approve, and publish your courses.'},{title:'Keep moving',text:'Welcome your community into its portal and organize the next learning chapter.'}].map((step,i)=><article key={step.title}><span>0{i+1}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div></div></section>
      <section className="no-faq nl-container"><div><span className="nl-eyebrow">A FEW THINGS YOU MIGHT BE WONDERING</span><h2>Let’s make it clear.</h2></div><div>{[{q:'Who is Nudra for Organizations for?',a:'Academies, learning centers, training teams, and educational communities that want their own branded place for courses and members.'},{q:'Can we use our own branding and domain?',a:'Yes. Your organization can set its name, logo, brand color, and landing page. A Nudra subdomain identifies your space, and a custom domain can be connected after verifying ownership.'},{q:'Can we offer both online and in-person learning?',a:'Yes. Organization courses can be online or in person. In-person courses can include a location, schedule, and booking information.'},{q:'Who decides what learners can access?',a:'Organization managers review student membership requests and course submissions. Approved, published courses become available in the organization’s learning space.'},{q:'How do we get started, and what does it cost?',a:'Contact us with your organization’s learning needs. We’ll discuss setup, the right scope for your team, and pricing with you.'}].map(item=><details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
      <LandingContact />
    </main>
    <footer className="nl-footer"><div className="nl-container no-footer"><Link to="/" className="nl-brand">nudra.</Link><p>Your people. Your learning. Your next chapter.</p><Link to="/">Back to Nudra <ArrowUpRight size={16} aria-hidden="true" /></Link></div></footer>
  </div>;
}
