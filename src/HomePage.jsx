import React from 'react';
import { ArrowUpRight, ArrowLeft, ArrowRight, Menu, X, Phone, Mail, MapPin, CheckCircle2, Database, Trophy, GraduationCap, Laptop, Building2, Layers, ChevronDown } from 'lucide-react';
import './home-redesign.css';
import { reviews } from './reviews';

const FACEBOOK_URL = 'https://www.facebook.com/share/1JNdN8YFRi/?mibextid=wwXIfr';

const faqs = [
  { q: 'How do I register for a course?', a: 'Open the registration page, choose your course and training mode, and submit the form. Our team will follow up with schedules, fees and next steps.' },
  { q: 'What are the course durations and fees?', a: 'Data Analysis runs for 12 weeks at \u20A6200,000. Web Development and Digital Skills run for 16 weeks at \u20A6250,000. Contact us if you would like to discuss the next cohort.' },
  { q: 'Is training onsite or online?', a: 'Both. You can learn onsite in Abuja or join virtually, and you choose your preferred mode when you register.' },
  { q: 'Do I need experience before I start?', a: 'No. Our courses are built for beginners, students, career switchers and working professionals who want practical skills.' },
  { q: 'Can my business work with Celerity?', a: 'Yes. We support organisations with web development, data analysis, cybersecurity awareness, digital marketing, design and practical business technology guidance. Use the chat to tell us what you need.' },
  { q: 'Where are you located?', a: 'Suite 90, Nandu Plaza, Ndola Crescent, Wuse Zone 5, Abuja, Nigeria.' },
];

function ReviewsCarousel() {
  const [perView, setPerView] = React.useState(3);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const touchStart = React.useRef(null);

  React.useEffect(() => {
    const small = window.matchMedia('(max-width: 700px)');
    const medium = window.matchMedia('(max-width: 1020px)');
    const calc = () => setPerView(small.matches ? 1 : medium.matches ? 2 : 3);
    calc();
    small.addEventListener('change', calc);
    medium.addEventListener('change', calc);
    return () => { small.removeEventListener('change', calc); medium.removeEventListener('change', calc); };
  }, []);

  const pages = Math.max(1, reviews.length - perView + 1);
  const safeIndex = Math.min(index, pages - 1);

  React.useEffect(() => {
    if (paused || pages <= 1) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setIndex(current => (Math.min(current, pages - 1) + 1) % pages), 6000);
    return () => window.clearInterval(timer);
  }, [paused, pages]);

  const go = (next) => setIndex(((next % pages) + pages) % pages);

  return <div className="cnh-carousel" role="region" aria-roledescription="carousel" aria-label="Learner reviews" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="cnh-carousel-viewport" onTouchStart={event => { touchStart.current = event.touches[0].clientX; }} onTouchEnd={event => { if (touchStart.current === null) return; const delta = event.changedTouches[0].clientX - touchStart.current; touchStart.current = null; if (Math.abs(delta) > 45) go(safeIndex + (delta < 0 ? 1 : -1)); }}>
      <div className="cnh-carousel-track" style={{ transform: `translateX(-${safeIndex * (100 / perView)}%)` }}>
        {reviews.map((review, i) => {
          const visible = i >= safeIndex && i < safeIndex + perView;
          return <div className="cnh-slide" style={{ flex: `0 0 ${100 / perView}%` }} key={i} aria-hidden={!visible} role="group" aria-roledescription="slide" aria-label={`Review ${i + 1} of ${reviews.length}`}>
            <figure className="cnh-review">
              {review.placeholder && <span className="cnh-review-badge">Sample review</span>}
              <blockquote>{review.quote}</blockquote>
              <figcaption><span className="cnh-avatar" aria-hidden="true">{(review.name || '?').charAt(0)}</span><span><strong>{review.name}</strong><small>{review.role}</small></span></figcaption>
            </figure>
          </div>;
        })}
      </div>
    </div>
    <div className="cnh-carousel-controls">
      <button type="button" onClick={() => go(safeIndex - 1)} aria-label="Previous reviews"><ArrowLeft size={18} /></button>
      <div className="cnh-dots">{Array.from({ length: pages }).map((_, i) => <button type="button" key={i} className={i === safeIndex ? 'active' : ''} onClick={() => go(i)} aria-label={`Go to reviews ${i + 1}`} aria-current={i === safeIndex} />)}</div>
      <button type="button" onClick={() => go(safeIndex + 1)} aria-label="Next reviews"><ArrowRight size={18} /></button>
    </div>
  </div>;
}

export default function HomePage({ courses, services, coursePricing, cohortTime, whatsappLink, phoneDisplay }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [activeCourse, setActiveCourse] = React.useState(0);
  const closeMenu = () => setMenuOpen(false);
  const course = courses[activeCourse];
  const pricing = coursePricing(course.title);
  const pad = (value) => String(value).padStart(2, '0');

  return <div className="cnh">
    <div className="cnh-topline"><div className="cnh-container cnh-topline-inner">
      <div className="cnh-countdown" aria-live="off"><span>Next cohort countdown resets in</span><strong>{pad(cohortTime.days)}d</strong><strong>{pad(cohortTime.hours)}h</strong><strong>{pad(cohortTime.minutes)}m</strong><strong>{pad(cohortTime.seconds)}s</strong></div>
      <a href="/register">Register your interest <ArrowUpRight size={14} /></a>
    </div></div>

    <header className="cnh-header"><div className="cnh-container cnh-nav">
      <a className="cnh-brand" href="#home" onClick={closeMenu} aria-label="Celerity Networks home"><img src="/celerity-logo.png" alt="Celerity Networks official logo" /><span><strong>Celerity Networks</strong><small>Technology | Training | Solutions</small></span></a>
      <button className="cnh-menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
      <nav className={menuOpen ? 'cnh-links open' : 'cnh-links'}>
        <a href="/" onClick={closeMenu} aria-current="page">Home</a>
        <a href="/what-we-do" onClick={closeMenu}>What We Do</a>
        <a href="/datasets" onClick={closeMenu}>Datasets</a>
        <a href="/competitions" onClick={closeMenu}>Competitions</a>
        <a href="/about" onClick={closeMenu}>About Us</a>
        <a className="cnh-btn cnh-btn-primary cnh-nav-cta" href={whatsappLink} onClick={closeMenu}>Chat with us <ArrowUpRight size={16} /></a>
      </nav>
    </div></header>

    <main>
      <section className="cnh-hero" id="home"><div className="cnh-hero-grid" aria-hidden="true"></div><div className="cnh-container cnh-hero-inner">
        <span className="cnh-pill"><span></span>250+ learners trained</span>
        <h1>Build skills. <em>Build solutions.</em> Move forward.</h1>
        <p className="cnh-lead">We help individuals gain practical technology skills and help businesses put digital tools to work, with onsite training in Abuja and virtual learning.</p>
        <div className="cnh-actions"><a className="cnh-btn cnh-btn-primary" href="#training">Explore our training <ArrowUpRight size={18} /></a><a className="cnh-btn cnh-btn-secondary" href="/register">Register as a student</a><a className="cnh-btn cnh-btn-secondary" href="/what-we-do">Our services</a></div>
        <p className="cnh-trusted">Built for ambitious learners, career switchers and growing organisations.</p>
        <div className="cnh-stats">
          <div><GraduationCap size={22} /><strong>250+</strong><span>Learners trained</span><small>From first-timers to working professionals.</small></div>
          <div><Laptop size={22} /><strong>3</strong><span>Training programmes</span><small>Data Analysis, Web Development and Digital Skills.</small></div>
          <div><Layers size={22} /><strong>6</strong><span>Service areas</span><small>Practical support for individuals and businesses.</small></div>
          <div><MapPin size={22} /><strong>2</strong><span>Ways to learn</span><small>Onsite in Abuja or fully virtual.</small></div>
        </div>
      </div></section>

      <section className="cnh-section cnh-light" id="training"><div className="cnh-container">
        <div className="cnh-heading"><span className="cnh-label">Learning paths</span><h2>Pick your path. See exactly where it <em>takes you.</em></h2><p>Select a programme to preview what you will learn, how long it takes and what it costs.</p></div>
        <div className="cnh-paths">
          <div className="cnh-tabs" role="tablist" aria-label="Training programmes">{courses.map((c, i) => <button type="button" role="tab" aria-selected={i === activeCourse} className={i === activeCourse ? 'active' : ''} key={c.slug} onClick={() => setActiveCourse(i)}><span>{c.n}</span>{c.title}</button>)}</div>
          <div className="cnh-path-panel" role="tabpanel">
            <div className="cnh-path-info">
              <span className="cnh-tag">{course.tag}</span>
              <h3>{course.title}</h3>
              <p>{course.intro}</p>
              <div className="cnh-tools">{course.tools.split(' \u00B7 ').map(tool => <span key={tool}>{tool}</span>)}</div>
              <div className="cnh-fee"><div><span>Duration</span><strong>{pricing.duration}</strong></div><div><span>Training fee</span><strong>{pricing.fee}</strong></div></div>
              <p className="cnh-audience"><b>Who it is for:</b> {course.audience}</p>
              <div className="cnh-actions left"><a className="cnh-btn cnh-btn-primary" href={`/register?course=${encodeURIComponent(course.title)}`}>Register for this course <ArrowUpRight size={17} /></a><a className="cnh-btn cnh-btn-secondary" href={`/training/${course.slug}`}>View course details</a></div>
            </div>
            <ol className="cnh-steps">{course.topics.map((topic, i) => <li key={topic}><b>{pad(i + 1)}</b><span>{topic}</span></li>)}</ol>
          </div>
        </div>
      </div></section>

      <section className="cnh-section cnh-dark" id="services"><div className="cnh-container">
        <div className="cnh-heading"><span className="cnh-label">What we do</span><h2>Everything you need to move <em>forward with technology.</em></h2><p>Practical services and training designed around clear outcomes for people and organisations.</p></div>
        <div className="cnh-service-grid">{services.map((s, i) => <article key={s.title}><span className="cnh-service-icon"><s.icon size={22} /></span><span className="cnh-service-n">{pad(i + 1)}</span><h3>{s.title}</h3><p>{s.text}</p></article>)}</div>
        <div className="cnh-center"><a className="cnh-btn cnh-btn-primary" href="/what-we-do">Explore all services <ArrowUpRight size={18} /></a></div>
      </div></section>

      <section className="cnh-section cnh-light" id="explore"><div className="cnh-container">
        <div className="cnh-heading"><span className="cnh-label">Practise with purpose</span><h2>Learn by doing, with real <em>datasets and challenges.</em></h2><p>Go beyond lessons. Build a portfolio through hands-on resources and competitions.</p></div>
        <div className="cnh-feature-grid">
          <a className="cnh-feature" href="/datasets"><span className="cnh-feature-icon"><Database size={24} /></span><span className="cnh-label">Dataset Hub</span><h3>Practical datasets to learn, practise and build projects.</h3><p>Browse, filter and download published datasets. Each one includes a description and learning objectives.</p><b>Browse datasets <ArrowUpRight size={17} /></b></a>
          <a className="cnh-feature" href="/competitions"><span className="cnh-feature-icon"><Trophy size={24} /></span><span className="cnh-label">Competitions</span><h3>Take on real-world challenges and demonstrate your skills.</h3><p>Read the brief, register, verify your email and unlock the participant workspace and competition dataset.</p><b>View competitions <ArrowUpRight size={17} /></b></a>
          <a className="cnh-feature" href="/about"><span className="cnh-feature-icon"><Building2 size={24} /></span><span className="cnh-label">About Celerity</span><h3>Technology is most powerful when it moves people forward.</h3><p>Learn about our story, mission, vision and the values that guide every engagement.</p><b>Get to know us <ArrowUpRight size={17} /></b></a>
        </div>
      </div></section>

      <section className="cnh-section cnh-ash" id="reviews"><div className="cnh-container">
        <div className="cnh-heading"><span className="cnh-label">Reviews</span><h2>Real people. <em>Real results.</em></h2><p>Hear from learners and organisations who have worked with Celerity.</p></div>
        <ReviewsCarousel />
      </div></section>

      <section className="cnh-section cnh-light" id="faq"><div className="cnh-container cnh-faq-layout">
        <div className="cnh-heading left"><span className="cnh-label">FAQ</span><h2>Got questions? <em>We have answers.</em></h2><p>Cannot find what you need? Chat with us and we will point you in the right direction.</p><a className="cnh-btn cnh-btn-primary" href={whatsappLink}>Chat with us <ArrowUpRight size={18} /></a></div>
        <div className="cnh-faq-list">{faqs.map(item => <details key={item.q}><summary>{item.q}<ChevronDown size={18} /></summary><p>{item.a}</p></details>)}</div>
      </div></section>

      <section className="cnh-cta-section" id="contact"><div className="cnh-container cnh-cta">
        <div className="cnh-cta-copy"><span className="cnh-label light">Start a conversation</span><h2>Have a goal? <em>Let's get moving.</em></h2><p>Ask us about training, digital services or a solution for your organisation.</p><div className="cnh-actions left"><a className="cnh-btn cnh-btn-white" href={whatsappLink}>Contact us now <ArrowUpRight size={18} /></a><a className="cnh-btn cnh-btn-outline-light" href="/register">Register as a student</a></div></div>
        <div className="cnh-contact-details">
          <div><span><Phone size={19} /></span><span><small>CALL US</small><a href="tel:+2349025476588">{phoneDisplay}</a></span></div>
          <div><span><Mail size={19} /></span><span><small>EMAIL</small><a href="#support-chat">Message our team</a></span></div>
          <div><span><MapPin size={19} /></span><span><small>VISIT US</small><p>Suite 90, Nandu Plaza,<br />Ndola Crescent, Wuse Zone 5,<br />Abuja, Nigeria.</p></span></div>
        </div>
      </div></section>
    </main>

    <footer className="cnh-footer"><div className="cnh-container cnh-footer-main">
      <a className="cnh-brand cnh-footer-brand" href="#home"><img src="/celerity-logo.png" alt="Celerity Networks logo" /><span><strong>Celerity Networks Ltd</strong><small>Technology | Training | Solutions</small></span></a>
      <p>Helping people and businesses move forward with technology.</p>
      <a className="cnh-back-top" href="#home">Back to top</a>
    </div>
    <div className="cnh-container cnh-socials" aria-label="Celerity Networks social media"><strong>Follow Celerity Networks</strong><div className="cnh-social-list">
      <a href={FACEBOOK_URL} target="_blank" rel="noreferrer" aria-label="Follow Celerity Networks on Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 21v-8.2h2.8l.4-3.2h-3.2V7.5c0-.9.3-1.5 1.6-1.5h1.7V3.1c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.1H7v3.2h2.7V21z" fill="currentColor" /></svg></a>
      <a href="https://www.instagram.com/celeritynetworksltd/" target="_blank" rel="noreferrer" aria-label="Follow Celerity Networks on Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.6" cy="6.7" r="1.2" fill="currentColor" /></svg></a>
      <a href="https://www.linkedin.com/company/celerity-networks-ltd/" target="_blank" rel="noreferrer" aria-label="Follow Celerity Networks on LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.2 8.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM3.7 10h3v10h-3zM9 10h2.9v1.4h.1a3.2 3.2 0 0 1 2.9-1.6c3.1 0 3.7 2 3.7 4.5V20h-3v-5.1c0-1.2 0-2.7-1.7-2.7s-2 1.3-2 2.6V20H9z" /></svg></a>
      <a href="https://www.tiktok.com/@celerity.networks" target="_blank" rel="noreferrer" aria-label="Follow Celerity Networks on TikTok" title="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.6 8.1a7.2 7.2 0 0 1-4.4-1.5v7.1a5.7 5.7 0 1 1-5-5.6v3.5a2.3 2.3 0 1 0 1.6 2.2V2.5h3.4c.2 2.1 1.5 3.8 4.4 4.1z" /></svg></a>
      <a href="https://x.com/celnetltd" target="_blank" rel="noreferrer" aria-label="Follow Celerity Networks on X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 3H22l-6.8 7.8L23.2 21h-6.3L12 14.8 6.5 21H3.3l7.3-8.4L2.8 3h6.5l4.5 5.9zm-1.1 16h1.7L8.3 4.9H6.5z" /></svg></a>
    </div></div>
    <div className="cnh-container cnh-footer-bottom"><span>&copy; {new Date().getFullYear()} Celerity Networks Ltd. All rights reserved.</span><span>Built for progress.</span></div></footer>
  </div>;
}
