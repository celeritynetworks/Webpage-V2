import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, BarChart3, Code2, ShieldCheck, Megaphone, Palette, Users, CheckCircle2, MapPin, Mail, Phone, Menu, X, ArrowLeft, Send, LoaderCircle } from 'lucide-react';
import './styles.css';
import DatasetCatalog from './DatasetCatalog';
import Competitions from './Competitions';
import CompetitionDetail from './CompetitionDetail';
import ParticipantLogin from './ParticipantLogin';
import ParticipantDashboard from './ParticipantDashboard';
import CompetitionRegistration from './CompetitionRegistration';
import AdminDashboard from './AdminDashboard';
import SupportChatbot from './SupportChatbot';
import './celerity-design-system.css';
import { AboutPage, WhatWeDoPage } from './CorporatePages';
import HomePage from './HomePage';

const phoneDisplay = '09025476588';
const whatsappLink = '#support-chat';
const services = [
  { icon: BarChart3, title: 'Data Analysis', text: 'Turn raw data into clear insights, reports and dashboards that support better decisions.' },
  { icon: Code2, title: 'Web Development', text: 'Build responsive, practical websites for your business, brand or organisation.' },
  { icon: ShieldCheck, title: 'Cybersecurity', text: 'Develop essential security awareness and skills for a safer digital environment.' },
  { icon: Megaphone, title: 'Digital Marketing', text: 'Reach the right audience with purposeful digital campaigns and content.' },
  { icon: Palette, title: 'UI/UX & Graphic Design', text: 'Create useful digital experiences and clear, consistent visual communication.' },
  { icon: Users, title: 'Business Technology Support', text: 'Get practical guidance to use technology more effectively in your work.' },
];
const coursePricing = (course) => course === 'Data Analysis'
  ? { duration: '12 weeks', fee: '\u20A6200,000' }
  : { duration: '16 weeks', fee: '\u20A6250,000' };
const courses = [
  { n: '01', slug: 'data-analysis', title: 'Data Analysis', tools: 'Excel \u00B7 SQL \u00B7 Power BI \u00B7 Python', tag: 'Career-focused training', intro: 'Learn how to turn raw data into useful information that supports better decisions. This practical course takes learners from spreadsheet fundamentals to querying, analysis and interactive dashboards.', topics: ['Excel for cleaning and analysing data', 'SQL fundamentals and querying databases', 'Power BI reports and interactive dashboards', 'Python foundations for data analysis', 'Portfolio projects and data storytelling'], audience: 'Beginners, students, working professionals and career switchers who want to build practical data analysis skills.' },
  { n: '02', slug: 'web-development', title: 'Web Development', tools: 'Modern web fundamentals', tag: 'Build practical projects', intro: 'Build a solid foundation in creating responsive websites and understand how modern websites are structured, styled and brought to life.', topics: ['HTML page structure', 'CSS styling and responsive layouts', 'JavaScript fundamentals', 'Building and presenting a practical website'], audience: 'Beginners and business owners who want to understand website creation and develop practical web skills.' },
  { n: '03', slug: 'digital-skills', title: 'Digital Skills', tools: 'Digital marketing \u00B7 Design', tag: 'Skills for the digital economy', intro: 'Develop practical digital skills for communicating online, promoting a brand and creating clear visual content for digital platforms.', topics: ['Digital marketing foundations', 'Social media content planning', 'Graphic design principles', 'Practical campaign and design exercises'], audience: 'Entrepreneurs, creators, job seekers and professionals looking to strengthen their digital skills.' },
];

function CourseDetail({ course }) {
  return <div className="detail-page"><header className="header"><div className="container nav-wrap"><a className="brand" href="/"><img src="/celerity-logo.png" alt="Celerity Networks official logo"/><span className="brand-copy"><strong>Celerity Networks</strong><small>Technology | Training | Solutions</small></span></a><a className="nav-cta" href={whatsappLink}>Enquire now <ArrowUpRight size={16}/></a></div></header><main><section className="detail-hero"><div className="container"><a className="detail-back" href="/#training">{'\u2190'} Back to all training</a><div className="eyebrow"><span></span> CELERITY NETWORKS TRAINING</div><h1>{course.title}</h1><p>{course.intro}</p><div className="detail-tools">{course.tools.split(' \u00B7 ').map(tool => <span key={tool}>{tool}</span>)}</div><div className="course-pricing" aria-label="Course duration and fee"><div><span>Duration</span><strong>{coursePricing(course.title).duration}</strong></div><div><span>Training fee</span><strong>{coursePricing(course.title).fee}</strong></div></div><a className="btn btn-primary" href={`/register?course=${encodeURIComponent(course.title)}`}>Register for this course <ArrowUpRight size={18}/></a></div></section><section className="detail-content"><div className="container detail-columns"><article><div className="eyebrow dark"><span></span> COURSE OVERVIEW</div><h2>What you will learn</h2><p className="detail-intro">The course focuses on practical learning, guided exercises and skills you can apply to real tasks.</p><ul className="topic-list">{course.topics.map(topic => <li key={topic}><CheckCircle2 size={19}/>{topic}</li>)}</ul></article><aside className="detail-aside"><div className="eyebrow"><span></span> WHO IT IS FOR</div><h3>Designed for your next step.</h3><p>{course.audience}</p><div className="detail-aside-rule"></div><p>Training options are available onsite in Abuja and virtually. Contact our team to discuss schedules, fees and the next cohort.</p><a className="btn btn-primary" href={`/register?course=${encodeURIComponent(course.title)}`}>Register for this course <ArrowUpRight size={17}/></a></aside></div></section></main><footer className="footer"><div className="container footer-bottom"><span>&copy; {new Date().getFullYear()} Celerity Networks Ltd. All rights reserved.</span><a href="#support-chat">Contact us</a></div></footer></div>;
}

function StudentRegistration() {
  const params = new URLSearchParams(window.location.search);
  const courseOptions = ['Data Analysis', 'Web Development', 'Digital Skills', 'Cybersecurity', 'Digital Marketing', 'UI/UX & Graphic Design'];
  const requestedCourse = params.get('course');
  const [form, setForm] = React.useState({ fullName: '', email: '', phone: '', course: courseOptions.includes(requestedCourse) ? requestedCourse : 'Data Analysis', mode: 'Virtual', education: '', website: '' });
  const [status, setStatus] = React.useState({ type: 'idle', message: '' });
  const update = (event) => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Submitting your registration...' });
    try {
      const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'We could not submit your registration. Please try again.');
      setStatus({ type: 'success', message: data.message || 'Registration received. A confirmation email will be sent to the email address you provided. Our team may contact you about the next steps.' });
      setForm({ fullName: '', email: '', phone: '', course: 'Data Analysis', mode: 'Virtual', education: '', website: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Something went wrong. Please try again later.' });
    }
  }
  return <div className="registration-page">
    <header className="header"><div className="container nav-wrap"><a className="brand" href="/" aria-label="Celerity Networks home"><img src="/celerity-logo.png" alt="Celerity Networks official logo"/><span className="brand-copy"><strong>Celerity Networks</strong><small>Technology | Training | Solutions</small></span></a><a className="nav-cta" href={whatsappLink}>Need help? Enquire <ArrowUpRight size={16}/></a></div></header>
    <main className="registration-main"><div className="container registration-layout"><section className="registration-intro"><a className="registration-back" href="/#training"><ArrowLeft size={16}/> Back to training</a><div className="eyebrow dark"><span></span> STUDENT ENROLMENT</div><h1>Take the next step in your <em>learning journey.</em></h1><p>Complete this form to register your interest in a Celerity Networks training programme. Our team will follow up with information about schedules, fees and the next steps.</p><div className="registration-points"><div><CheckCircle2 size={19}/><span><b>Practical learning</b><small>Build skills through guided exercises and projects.</small></span></div><div><CheckCircle2 size={19}/><span><b>Flexible learning</b><small>Choose virtual or onsite training where available.</small></span></div><div><CheckCircle2 size={19}/><span><b>Support from our team</b><small>We will contact you about your application.</small></span></div></div></section>
      <section className="registration-card"><div className="registration-card-heading"><span className="registration-card-icon"><Send size={19}/></span><div><h2>Student registration</h2><p>Fields marked with * are required.</p></div></div>
      <form onSubmit={submit} className="registration-form">
        <div className="form-field"><label htmlFor="fullName">Full name *</label><input id="fullName" name="fullName" autoComplete="name" maxLength="100" value={form.fullName} onChange={update} placeholder="Enter your full name" required /></div>
        <div className="form-field"><label htmlFor="email">Email address *</label><input id="email" name="email" type="email" autoComplete="email" maxLength="254" value={form.email} onChange={update} placeholder="you@example.com" required /></div>
        <div className="form-field"><label htmlFor="phone">Phone / WhatsApp number *</label><input id="phone" name="phone" type="tel" autoComplete="tel" maxLength="30" value={form.phone} onChange={update} placeholder="e.g. +234 902 547 6588" required /></div>
        <div className="form-field"><label htmlFor="course">Course *</label><select id="course" name="course" value={form.course} onChange={update} required>{courseOptions.map(option => <option key={option} value={option}>{option}</option>)}</select><div className="registration-course-summary" aria-live="polite"><div><span>Course duration</span><strong>{coursePricing(form.course).duration}</strong></div><div><span>Training fee</span><strong>{coursePricing(form.course).fee}</strong></div></div></div>
        <fieldset className="form-field form-mode"><legend>Preferred training mode *</legend><label><input type="radio" name="mode" value="Virtual" checked={form.mode === 'Virtual'} onChange={update}/> <span>Virtual, online</span></label><label><input type="radio" name="mode" value="Onsite" checked={form.mode === 'Onsite'} onChange={update}/> <span>Onsite, Abuja</span></label></fieldset>
        <div className="form-field"><label htmlFor="education">Educational background <span>(optional)</span></label><input id="education" name="education" maxLength="160" value={form.education} onChange={update} placeholder="e.g. Student, graduate, working professional" /></div>
        <div className="form-honeypot" aria-hidden="true"><label htmlFor="website">Leave this field empty</label><input id="website" name="website" tabIndex="-1" autoComplete="off" value={form.website} onChange={update}/></div>
        <label className="form-consent"><input type="checkbox" name="consent" required /> <span>I agree that Celerity Networks may use these details to process my registration and contact me about this course. *</span></label><p className="form-privacy">Please do not enter passwords, payment card details or other sensitive personal information.</p>
        <button className="btn btn-primary registration-submit" type="submit" disabled={status.type === 'loading'}>{status.type === 'loading' ? <><LoaderCircle size={18} className="spin-icon"/> Submitting...</> : <>Submit registration <ArrowUpRight size={18}/></>}</button>
        {status.message && <div className={`form-status ${status.type}`} role="status" aria-live="polite">{status.message}</div>}
      </form></section></div></main>
    <footer className="footer"><div className="container footer-bottom"><span>&copy; {new Date().getFullYear()} Celerity Networks Ltd. All rights reserved.</span><a href="#support-chat">Contact us</a></div></footer>
  </div>;
}

function getCohortCountdown() {
  const week = 7 * 24 * 60 * 60 * 1000;
  const storageKey = 'celerity-next-cohort-deadline-v2';
  let deadline = Number(window.localStorage.getItem(storageKey));
  if (!Number.isFinite(deadline) || deadline <= Date.now()) {
    deadline = Date.now() + week;
    window.localStorage.setItem(storageKey, String(deadline));
  }
  const remaining = Math.max(0, deadline - Date.now());
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return { days, hours, minutes, seconds };
}

function App() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [cohortTime, setCohortTime] = React.useState(() => getCohortCountdown());
  React.useEffect(() => {
    const timer = window.setInterval(() => setCohortTime(getCohortCountdown()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (window.location.pathname.replace(/\/$/, '') === '/admin') return <AdminDashboard/>;
  if (import.meta.env.DEV && window.location.pathname.replace(/\/$/, '') === '/admin-preview') return <AdminDashboard preview/>;
  if (window.location.pathname.replace(/\/$/, '') === '/about') return <AboutPage/>;
  if (window.location.pathname.replace(/\/$/, '') === '/what-we-do') return <WhatWeDoPage/>;
  if (window.location.pathname.replace(/\/$/, '') === '/datasets') return <DatasetCatalog/>;
  const competitionDetailMatch = window.location.pathname.match(/^\/competitions\/([^/]+)\/?$/);
  if (competitionDetailMatch) return <CompetitionDetail slug={competitionDetailMatch[1]}/>;
  if (window.location.pathname.replace(/\/$/, '') === '/competitions') return <Competitions/>;
  if (window.location.pathname.replace(/\/$/, '') === '/participant-login') return <ParticipantLogin/>;
  if (window.location.pathname.replace(/\/$/, '') === '/participant-dashboard') return <ParticipantDashboard/>;
  if (window.location.pathname.replace(/\/$/, '') === '/register') return <StudentRegistration/>;
  if (window.location.pathname.replace(/\/$/, '') === '/competition-register') return <CompetitionRegistration/>;
  const courseSlug = window.location.pathname.match(/^\/training\/([^/]+)\/?$/)?.[1];
  const selectedCourse = courses.find(course => course.slug === courseSlug);
  if (selectedCourse) return <CourseDetail course={selectedCourse}/>;
  return <HomePage courses={courses} services={services} coursePricing={coursePricing} cohortTime={cohortTime} whatsappLink={whatsappLink} phoneDisplay={phoneDisplay}/>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><><App/><SupportChatbot/></></React.StrictMode>);
