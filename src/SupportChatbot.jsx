import React from 'react';
import { Bot, X, Send, MessageCircle, Mail, Phone, ArrowUpRight } from 'lucide-react';
import './support-chatbot.css';

const email = 'celeritynetworksltd@gmail.com';
const phone = '+2349025476588';
const whatsappBase = 'https://wa.me/2349025476588';

/*
  Structured conversation tree.
  Each node: label (button text), text (bot answer), next (follow-up node ids), links (page shortcuts),
  keywords (free-text routing), handoff (show contact options straight away).
*/
const NODES = {
  menu: {
    label: 'Main menu',
    text: 'What would you like help with? Choose a topic below, or type your question.',
    next: ['training', 'registration', 'datasets', 'competitions', 'services', 'location', 'team'],
    noFeedback: true,
  },
  training: {
    label: 'Training courses',
    keywords: ['course', 'courses', 'training', 'learn', 'class', 'classes', 'teach', 'study', 'programme', 'program', 'skill', 'skills', 'data analysis', 'web development', 'digital skills', 'cybersecurity', 'marketing', 'design', 'ui', 'ux'],
    text: 'Celerity offers practical training in Data Analysis, Web Development and Digital Skills, with Cybersecurity, Digital Marketing and UI/UX & Graphic Design also available. Learning is project-based and open to beginners, students, career switchers and professionals.',
    next: ['fees', 'modes', 'registration', 'menu'],
    links: [{ label: 'See learning paths', href: '/#training' }],
  },
  fees: {
    label: 'Fees and duration',
    keywords: ['fee', 'fees', 'price', 'prices', 'cost', 'tuition', 'pay', 'payment', 'duration', 'how long', 'weeks', 'naira', 'afford', 'cheap', 'discount', 'installment', 'instalment'],
    text: 'Data Analysis: 12 weeks, \u20A6200,000.\nWeb Development and Digital Skills: 16 weeks, \u20A6250,000.\n\nFor payment options, schedules or the next cohort, our team can help directly.',
    next: ['modes', 'registration', 'team', 'menu'],
  },
  modes: {
    label: 'Onsite or virtual',
    keywords: ['onsite', 'on-site', 'virtual', 'online', 'physical', 'remote', 'zoom', 'in person', 'in-person', 'mode', 'attend'],
    text: 'You can learn onsite in Abuja or virtually. You choose your preferred mode when you register. Onsite sessions are at Suite 90, Nandu Plaza, Ndola Crescent, Wuse Zone 5, Abuja.',
    next: ['fees', 'registration', 'menu'],
  },
  registration: {
    label: 'How to register',
    keywords: ['register', 'registration', 'enrol', 'enroll', 'enrolment', 'sign up', 'signup', 'apply', 'join', 'admission', 'cohort', 'start date', 'begin'],
    text: 'To register: open the registration page, pick your course and training mode, and submit the form. Our team will follow up with schedules, fees and next steps.',
    next: ['fees', 'modes', 'team', 'menu'],
    links: [{ label: 'Open registration form', href: '/register' }],
  },
  datasets: {
    label: 'Dataset Hub',
    keywords: ['dataset', 'datasets', 'data hub', 'download', 'csv', 'resource', 'resources', 'practice data'],
    text: 'The Dataset Hub has practical datasets for learning and building projects. You can browse, filter and download published datasets, and each dataset page includes its description and learning objectives.',
    next: ['competitions', 'training', 'menu'],
    links: [{ label: 'Browse datasets', href: '/datasets' }],
  },
  competitions: {
    label: 'Competitions',
    keywords: ['competition', 'competitions', 'challenge', 'challenges', 'leaderboard', 'participate', 'participant', 'contest', 'submission', 'submit', 'github', 'verify', 'verification'],
    text: 'Browse current challenges on the Competitions page. Open a challenge to read its brief and register. After registering, verify your email to unlock the participant workspace and the competition dataset.',
    next: ['datasets', 'team', 'menu'],
    links: [{ label: 'View competitions', href: '/competitions' }],
  },
  services: {
    label: 'Business services',
    keywords: ['business', 'company', 'organisation', 'organization', 'service', 'services', 'website', 'web design', 'consult', 'consultancy', 'consulting', 'support', 'solution', 'solutions', 'dashboard', 'quote', 'project', 'hire', 'it support', 'staff training', 'corporate'],
    text: 'We support organisations with web development, data analysis and dashboards, cybersecurity awareness, digital marketing, design and practical business technology guidance. Tell our team what you want to achieve and they can advise on the next step.',
    next: ['team', 'training', 'menu'],
    links: [{ label: 'See what we do', href: '/what-we-do' }],
  },
  location: {
    label: 'Location and contact details',
    keywords: ['location', 'address', 'office', 'where', 'visit', 'directions', 'map', 'abuja', 'wuse', 'phone number', 'call'],
    text: 'Our office is at Suite 90, Nandu Plaza, Ndola Crescent, Wuse Zone 5, Abuja, Nigeria. You can also call 09025476588.',
    next: ['team', 'modes', 'menu'],
  },
  team: {
    label: 'Talk to the team',
    keywords: ['human', 'person', 'agent', 'staff', 'someone', 'team', 'contact', 'talk', 'speak', 'whatsapp', 'email', 'complain', 'complaint', 'urgent', 'help me'],
    text: 'Certainly. Reach our team on WhatsApp or by email and include a short description of what you need.',
    next: ['menu'],
    handoff: true,
    noFeedback: true,
  },
};

const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening)|greetings|howdy|start|menu|help)\b/i;

function route(message) {
  const text = String(message || '').toLowerCase().trim();
  if (!text) return null;
  if (GREETING.test(text) && text.split(/\s+/).length <= 3) return 'menu';
  let best = null;
  let bestScore = 0;
  Object.entries(NODES).forEach(([id, node]) => {
    if (!node.keywords) return;
    const score = node.keywords.reduce((total, keyword) => {
      const pattern = new RegExp(`(^|[^a-z])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      return total + (pattern.test(text) ? (keyword.includes(' ') ? 2 : 1) : 0);
    }, 0);
    if (score > bestScore) { best = id; bestScore = score; }
  });
  return best;
}

function HandoffCard({ question }) {
  const note = question ? `Hello Celerity Networks, I need assistance with: ${question}` : 'Hello Celerity Networks, I need assistance.';
  const subject = 'Enquiry from the Celerity Networks website';
  return <div className="celerity-chat-contact" role="group" aria-label="Contact the Celerity team">
    <a href={`${whatsappBase}?text=${encodeURIComponent(note)}`} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Chat on WhatsApp</a>
    <a href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(note + '\n\nName:\nPhone:\n')}`}><Mail size={15} /> Send an email</a>
    <a href={`tel:${phone}`}><Phone size={15} /> Call 09025476588</a>
  </div>;
}

export default function SupportChatbot() {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState('');
  const [messages, setMessages] = React.useState([
    { role: 'bot', text: 'Hello. Welcome to Celerity Networks. I can answer common questions about training, datasets, competitions and services. If I cannot help, I will connect you with our team.' },
    { role: 'bot', text: NODES.menu.text },
  ]);
  const [options, setOptions] = React.useState(NODES.menu.next);
  const [awaitingFeedback, setAwaitingFeedback] = React.useState(false);
  const lastQuestion = React.useRef('');
  const misses = React.useRef(0);
  const endRef = React.useRef(null);

  React.useEffect(() => {
    if (window.location.pathname.replace(/\/$/, '') === '/admin') return undefined;
    const openFromHash = () => { if (window.location.hash === '#support-chat') setOpen(true); };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    const handleContactClick = event => {
      if (event.target.closest('a[href="#support-chat"]')) setOpen(true);
    };
    document.addEventListener('click', handleContactClick);
    return () => { window.removeEventListener('hashchange', openFromHash); document.removeEventListener('click', handleContactClick); };
  }, []);

  React.useEffect(() => {
    if (open && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages, options, awaitingFeedback, open]);

  if (window.location.pathname.replace(/\/$/, '') === '/admin') return null;

  const push = (...items) => setMessages(current => [...current, ...items]);

  const showNode = (id, userText) => {
    const node = NODES[id];
    misses.current = 0;
    push(...(userText ? [{ role: 'user', text: userText }] : []), { role: 'bot', text: node.text, links: node.links, handoff: node.handoff, question: lastQuestion.current });
    setOptions(node.next);
    setAwaitingFeedback(!node.noFeedback);
  };

  const handleOption = id => showNode(id, NODES[id].label);

  const sendText = value => {
    const text = String(value ?? input).trim();
    if (!text) return;
    setInput('');
    lastQuestion.current = text;
    const target = route(text);
    if (target) { showNode(target, text); return; }
    misses.current += 1;
    push({ role: 'user', text }, {
      role: 'bot',
      text: misses.current > 1
        ? 'I am still not able to answer that well. Our team can help you directly:'
        : 'I do not have a good answer for that yet. You can pick a topic below, or contact our team and they will help you directly:',
      handoff: true,
      question: text,
    });
    setOptions(['menu']);
    setAwaitingFeedback(false);
  };

  const rate = helpful => {
    setAwaitingFeedback(false);
    if (helpful) {
      push({ role: 'user', text: 'Yes, that helped' }, { role: 'bot', text: 'Glad to help. Is there anything else you would like to know?' });
      setOptions(NODES.menu.next);
    } else {
      push({ role: 'user', text: 'Not really' }, { role: 'bot', text: 'Sorry about that. Our team can answer this properly. Choose how you would like to reach them:', handoff: true, question: lastQuestion.current });
      setOptions(['menu']);
    }
  };

  return <div className="celerity-chat-root">
    {open && <section className="celerity-chat-panel" aria-label="Celerity support chat" aria-live="polite">
      <header className="celerity-chat-header"><span className="celerity-chat-avatar"><Bot size={20} /></span><span><strong>Celerity Assistant</strong><small>Answers fast. Team on hand if needed.</small></span><button type="button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={19} /></button></header>
      <div className="celerity-chat-messages">
        {messages.map((message, index) => <React.Fragment key={index}>
          <div className={`celerity-chat-message ${message.role}`}>{message.text}</div>
          {message.links && <div className="celerity-chat-links">{message.links.map(link => <a key={link.href} href={link.href}>{link.label} <ArrowUpRight size={13} /></a>)}</div>}
          {message.handoff && <HandoffCard question={message.question} />}
        </React.Fragment>)}
        {awaitingFeedback && <div className="celerity-chat-feedback"><span>Did this answer your question?</span><button type="button" onClick={() => rate(true)}>Yes</button><button type="button" onClick={() => rate(false)}>No, talk to the team</button></div>}
        <div className="celerity-chat-quick-replies">{options.map(id => <button type="button" key={id} onClick={() => handleOption(id)}>{NODES[id].label}</button>)}</div>
        <div ref={endRef} />
      </div>
      <form className="celerity-chat-compose" onSubmit={event => { event.preventDefault(); sendText(); }}><input value={input} onChange={event => setInput(event.target.value)} placeholder="Type your question..." aria-label="Type your question" maxLength={300} /><button type="submit" aria-label="Send message" disabled={!input.trim()}><Send size={17} /></button></form>
      <div className="celerity-chat-footnote">Automated guidance. For anything else, reach our team on WhatsApp or email.</div>
    </section>}
    <button className={`celerity-chat-launcher${open ? ' is-open' : ''}`} type="button" onClick={() => setOpen(value => !value)} aria-label={open ? 'Close support chat' : 'Open support chat'}><MessageCircle size={21} /><span>{open ? 'Close' : 'Chat with us'}</span></button>
  </div>;
}
