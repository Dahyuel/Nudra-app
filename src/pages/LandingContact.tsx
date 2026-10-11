import React from 'react';
import { ArrowUpRight, Mail, MapPin, Send } from 'lucide-react';

export function LandingContact() {
  return <section className="nl-contact nl-section" id="contact" aria-labelledby="contact-title">
    <div className="nl-container">
      <div className="nl-contact-heading"><span className="nl-eyebrow">LET’S FIND YOUR NEXT STEP</span><h2 id="contact-title">A little hello.<br /><span>A world of possibilities.</span></h2><p>A question, an idea, or a new learning journey. We’d love to hear from you.</p></div>
      <div className="nl-contact-layout">
        <div className="nl-contact-map"><img className="nl-contact-map-art" src="/images/landing/editorial/contact.png" alt="A hand-drawn world map with learning journeys connecting in Egypt" loading="lazy" /><div className="nl-map-label"><MapPin size={18} aria-hidden="true" /><div><small>ROOTED IN EGYPT</small><strong>Built for your whole journey.</strong></div></div><a className="nl-contact-email" href="mailto:support@nudra.edu"><Mail size={22} aria-hidden="true" /><div><small>DROP US A LINE</small><strong>support@nudra.edu</strong></div><ArrowUpRight size={18} aria-hidden="true" /></a><span className="nl-map-note">Different places. Shared curiosity.</span></div>
        <form className="nl-contact-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); window.location.href = `mailto:support@nudra.edu?subject=${encodeURIComponent(String(data.get('subject')))}&body=${encodeURIComponent(`From: ${data.get('name')} (${data.get('email')})\n\n${data.get('message')}`)}`; }}>
          <h3>What’s on your mind?</h3><p>Tell us a little about yourself and how we can help.</p><div className="nl-contact-fields"><label>Your name<input name="name" autoComplete="name" placeholder="Your name" required /></label><label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label></div><label>What brings you here?<select name="subject"><option>My learning journey</option><option>Teaching with Nudra</option><option>Nudra for my organization</option><option>Something else</option></select></label><label>Your message<textarea name="message" rows={4} placeholder="Tell us what you’re thinking…" required /></label><button className="nl-button nl-button-dark" type="submit">Let’s talk <Send size={17} aria-hidden="true" /></button><small>Opens your email app with your message ready to send.</small>
        </form>
      </div>
    </div>
  </section>;
}
