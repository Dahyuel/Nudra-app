import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function LandingOrganizations() {
  return <section className="nl-org nl-section" id="organizations" aria-labelledby="organizations-title"><div className="nl-container">
    <div className="nl-org-layout"><div className="nl-org-copy"><span className="nl-eyebrow">NUDRA FOR ORGANIZATIONS</span><h2 id="organizations-title">Your organization.<br /><span>Ready to grow.</span></h2><p>A home for your academy, learning center, or training community. Bring your brand, instructors, courses, and learners together with Nudra.</p><div className="nl-org-actions"><Link to="/for-organizations" className="nl-button nl-button-lime">Discover Nudra for organizations <ArrowUpRight size={18} aria-hidden="true" /></Link></div></div>
    <div className="nl-org-visual"><img src="/images/landing/editorial/organizations-dark.png" alt="An academy manager and instructor organizing courses, learners and class schedules" width="1536" height="1024" loading="lazy" /></div></div>
  </div></section>;
}
