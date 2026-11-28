import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, CalendarDays, Database, Search, SlidersHorizontal,
  Trophy, RefreshCw, Layers3, Medal, Award, ExternalLink
} from 'lucide-react';
import './competitions.css';

const whatsappLink = '#support-chat';

function formatDate(value) {
  if (!value) return 'To be announced';
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) return 'To be announced';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function initials(name) {
  return String(name || 'Participant')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(part => part[0].toUpperCase()).join('');
}

function ProfileLinks({ person }) {
  if (!person) return null;
  return (
    <div className="competition-gallery-profile-links">
      {person.linkedin_url && (
        <a href={person.linkedin_url} target="_blank" rel="noreferrer">
          LinkedIn <ExternalLink size={13} />
        </a>
      )}
      {person.portfolio_url && (
        <a href={person.portfolio_url} target="_blank" rel="noreferrer">
          Portfolio <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const label = status === 'active' ? 'Live' : status === 'upcoming' ? 'Upcoming' : status === 'completed' ? 'Completed' : 'Draft';
  return <span className={`competition-status status-${status || 'upcoming'}`}>{label}</span>;
}

function ChallengeCard({ competition, featured = false }) {
  return (
    <article className={`challenge-card${featured ? ' challenge-card-featured' : ''}`}>
      <div className="challenge-card-art">
        {competition.thumbnail_url ? <img className="challenge-thumbnail" src={competition.thumbnail_url} alt={`${competition.title} competition thumbnail`} loading="lazy" /> : <><div className="challenge-art-orbit challenge-art-orbit-one" /><div className="challenge-art-orbit challenge-art-orbit-two" /><div className="challenge-art-icon"><Database size={featured ? 34 : 29} /></div></>}
        <span className="challenge-art-index">{featured ? 'FEATURED CHALLENGE' : 'CELERITY CHALLENGE'}</span>
        <StatusPill status={competition.status} />
      </div>
      <div className="challenge-card-content">
        <div className="challenge-card-meta">
          <span>{competition.industry_name || 'General'}</span>
          <span>{competition.difficulty || 'Level to be announced'}</span>
        </div>
        <h3>{competition.title}</h3>
        <p>{competition.description || 'Explore the challenge brief and demonstrate your practical data skills.'}</p>
        <div className="challenge-card-deadline">
          <CalendarDays size={16} />
          <span>Deadline: <strong>{formatDate(competition.ends_at)}</strong></span>
        </div>
        <a href={`/competitions/${encodeURIComponent(competition.slug)}`} className="challenge-card-link">
          View challenge <ArrowUpRight size={17} />
        </a>
      </div>
    </article>
  );
}

function LeaderboardSection({ competitions }) {
  const [selectedSlug, setSelectedSlug] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedCompetition = competitions.find(
    item => item.slug === selectedSlug
  );

  useEffect(() => {
    if (!competitions.length) {
      setSelectedSlug('');
      setLeaderboard([]);
      setWinner(null);
      setError('');
      return;
    }

    setSelectedSlug(current => {
      if (current && competitions.some(item => item.slug === current)) {
        return current;
      }

      const preferred =
        competitions.find(item => item.status === 'active') ||
        competitions.find(item => item.status === 'completed') ||
        competitions.find(item => item.status === 'upcoming');

      return preferred?.slug || competitions[0].slug;
    });
  }, [competitions]);

  useEffect(() => {
    if (!selectedSlug) {
      setLeaderboard([]);
      setWinner(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);
      setError('');
      setLeaderboard([]);
      setWinner(null);

      try {
        const response = await fetch(
          `/api/competitions/${encodeURIComponent(selectedSlug)}/leaderboard`
        );

        if (!response.ok) {
          throw new Error('Could not load leaderboard.');
        }

        const data = await response.json();

        if (!cancelled) {
          setLeaderboard(
            Array.isArray(data.leaderboard)
              ? data.leaderboard.slice(0, 10)
              : []
          );
          setWinner(data.winner || null);
        }
      } catch {
        if (!cancelled) {
          setError(
            'The leaderboard is currently unavailable. Please try again later.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  const hasCompetition = competitions.length > 0;

  return (
    <section
      className="competition-gallery-results"
      aria-labelledby="competition-gallery-leaderboard-title"
    >
      <div className="competition-gallery-section-heading competition-gallery-results-heading">
        <div>
          <span className="competition-gallery-eyebrow">
            <span /> COMPETITION RESULTS
          </span>
          <h2 id="competition-gallery-leaderboard-title">Leaderboard</h2>
          <p>
            Follow the strongest reviewed submissions and celebrate
            outstanding work.
          </p>
        </div>

        <div className="competition-gallery-leaderboard-select">
          <label htmlFor="gallery-leaderboard-competition">
            Choose competition
          </label>
          <select
            id="gallery-leaderboard-competition"
            value={selectedSlug}
            onChange={event => setSelectedSlug(event.target.value)}
            disabled={!hasCompetition}
          >
            {!hasCompetition ? (
              <option value="">No competitions available yet</option>
            ) : (
              competitions.map(item => (
                <option value={item.slug} key={item.id}>
                  {item.title}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {error && (
        <div
          className="competition-gallery-message competition-gallery-error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="competition-gallery-results-grid">
        <div className="competition-gallery-board-card">
          <div className="competition-gallery-board-title">
            <Trophy size={21} />
            <div>
              <h3>Top 10 participants</h3>
              <p>
                {selectedCompetition?.title || 'Competition rankings'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="competition-gallery-board-state" role="status">
              <RefreshCw size={19} />
              Loading rankings...
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="competition-gallery-board-empty">
              <Medal size={30} />
              <p>
                {!hasCompetition
                  ? 'The Top 10 leaderboard will appear here when Celerity publishes its first competition and participant submissions are reviewed.'
                  : 'Rankings will appear here once submissions have been reviewed and results approved.'}
              </p>
            </div>
          ) : (
            <div className="competition-gallery-table-wrap">
              <table className="competition-gallery-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Participant</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((person, index) => (
                    <tr
                      key={`${person.rank ?? index}-${person.name || 'participant'}`}
                    >
                      <td>
                        <span
                          className={`competition-gallery-rank rank-${person.rank || index + 1}`}
                        >
                          {(person.rank || index + 1) <= 3 ? (
                            <Medal size={16} />
                          ) : (
                            person.rank || index + 1
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="competition-gallery-person">
                          <span className="competition-gallery-avatar">
                            {initials(person.name)}
                          </span>
                          <div>
                            <strong>{person.name || 'Participant'}</strong>
                            <ProfileLinks person={person} />
                          </div>
                        </div>
                      </td>
                      <td className="competition-gallery-score">
                        {Number(person.score).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="competition-gallery-winner-card">
          <div className="competition-gallery-winner-heading">
            <Trophy size={23} />
            <span>FEATURED WINNER</span>
          </div>

          {loading ? (
            <div className="competition-gallery-winner-empty" role="status">
              <RefreshCw size={27} />
              <h3>Checking competition results...</h3>
              <p>
                The featured winner will appear here when results are available.
              </p>
            </div>
          ) : winner ? (
            <>
              <div className="competition-gallery-winner-avatar">
                {initials(winner.name)}
              </div>
              <h3>{winner.name || 'Competition winner'}</h3>
              <span className="competition-gallery-winner-label">
                Competition Winner
              </span>
              <strong className="competition-gallery-winner-score">
                {Number(winner.score).toLocaleString()}
              </strong>
              <small>Verified score</small>
              <p>{winner.bio || 'Winner profile coming soon.'}</p>
              <ProfileLinks person={winner} />
            </>
          ) : (
            <div className="competition-gallery-winner-empty">
              <Award size={36} />
              <h3>
                {hasCompetition
                  ? 'Our next winner could be you'
                  : 'Your achievement could be featured here'}
              </h3>
              <p>
                {hasCompetition
                  ? 'The winner will be featured here after submissions are reviewed and results are announced.'
                  : 'Celerity competition winners will be celebrated here once competitions are completed and results approved.'}
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
function HallOfFame({ competitions }) {
  const [winners, setWinners] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const completed = competitions
      .filter(item => item.status === 'completed')
      .sort((a, b) => Number(b.ends_at || 0) - Number(a.ends_at || 0))
      .slice(0, 10);

    if (!completed.length) {
      setWinners([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    async function loadPastWinners() {
      setLoading(true);
      const results = await Promise.allSettled(completed.map(async competition => {
        const response = await fetch(`/api/competitions/${encodeURIComponent(competition.slug)}/leaderboard`);
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const data = await response.json();
        return data.winner ? { competition, winner: data.winner } : null;
      }));
      if (!cancelled) {
        setWinners(results
          .filter(result => result.status === 'fulfilled' && result.value)
          .map(result => result.value));
        setLoading(false);
      }
    }
    loadPastWinners();
    return () => { cancelled = true; };
  }, [competitions]);

  return (
    <section className="competition-gallery-hall" aria-labelledby="competition-gallery-hall-title">
      <div className="competition-gallery-section-heading">
        <div>
          <span className="competition-gallery-eyebrow"><span /> RECOGNISING EXCELLENCE</span>
          <h2 id="competition-gallery-hall-title">Hall of Fame</h2>
          <p>Celebrating winners of completed Celerity challenges.</p>
        </div>
        <Award size={31} />
      </div>
      {loading ? (
        <div className="competition-gallery-board-state"><RefreshCw size={18} /> Loading past winners...</div>
      ) : winners.length ? (
        <div className="competition-gallery-hall-grid">
          {winners.map(({ competition, winner }) => (
            <article className="competition-gallery-hall-card" key={competition.id}>
              <span className="competition-gallery-hall-trophy"><Trophy size={20} /></span>
              <span className="competition-gallery-hall-date">{formatDate(competition.ends_at)}</span>
              <h3>{winner.name || 'Competition winner'}</h3>
              <p className="competition-gallery-hall-challenge">{competition.title}</p>
              <strong>{Number(winner.score).toLocaleString()} <small>verified score</small></strong>
              {winner.bio && <p>{winner.bio}</p>}
              <ProfileLinks person={winner} />
              <a href={`/competitions/${encodeURIComponent(competition.slug)}`} className="competition-gallery-hall-link">View challenge results <ArrowUpRight size={15} /></a>
            </article>
          ))}
        </div>
      ) : (
        <div className="competition-gallery-hall-empty">
          <Trophy size={31} />
          <h3>Every challenge is an opportunity to grow.</h3>
          <p>Past winners will be celebrated here once completed competitions have approved results.</p>
        </div>
      )}
    </section>
  );
}

export default function Competitions() {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function loadCompetitions() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/competitions');
        if (!response.ok) throw new Error('Could not load competitions.');
        const data = await response.json();
        if (!cancelled) setCompetitions(Array.isArray(data.competitions) ? data.competitions : []);
      } catch {
        if (!cancelled) setError('We could not load competitions. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCompetitions();
    return () => { cancelled = true; };
  }, []);

  const industries = useMemo(() => {
    const values = competitions.map(item => item.industry_name).filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [competitions]);

  const filteredCompetitions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return competitions.filter(item => {
      const matchesSearch = !term || [item.title, item.description, item.industry_name, item.difficulty]
        .some(value => String(value || '').toLowerCase().includes(term));
      const matchesIndustry = industry === 'all' || item.industry_name === industry;
      const matchesDifficulty = difficulty === 'all' || item.difficulty === difficulty;
      const matchesStatus = status === 'all' || item.status === status;
      return matchesSearch && matchesIndustry && matchesDifficulty && matchesStatus;
    });
  }, [competitions, search, industry, difficulty, status]);

  const featured = filteredCompetitions.find(item => item.status === 'active')
    || filteredCompetitions.find(item => item.status === 'upcoming')
    || filteredCompetitions[0];

  const clearFilters = () => {
    setSearch(''); setIndustry('all'); setDifficulty('all'); setStatus('all');
  };

  return (
    <div className="competitions-page">
      <header className="competition-site-header">
        <a className="competition-site-brand" href="/">
          <img src="/celerity-logo.png" alt="Celerity Networks official logo" />
          <span><strong>Celerity Networks</strong><small>Technology &middot; Training &middot; Solutions</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/what-we-do">What We Do</a>
          <a href="/datasets">Datasets</a>
          <a href="/competitions" aria-current="page">Competitions</a>
          <a href="/about">About Us</a>
          <a className="competition-site-nav-cta" href="#challenge-list">Explore challenges <ArrowUpRight size={16} /></a>
        </nav>
      </header>

      <section className="competition-gallery-hero">
        <div className="competition-gallery-hero-inner">
          <span className="competition-gallery-eyebrow"><span /> CELERITY NETWORKS CHALLENGE SERIES</span>
          <h1>Real challenges.<br /><em>Practical skills.</em> Recognised work.</h1>
          <p>Take on industry-inspired data challenges, work with practical datasets and showcase what you can do.</p>
          <a className="competition-gallery-primary" href="#challenge-list">Explore competitions <ArrowUpRight size={17} /></a>
          <div className="competition-gallery-hero-note"><Trophy size={18} /><span>Learn by doing. Build your portfolio. Earn recognition.</span></div>
        </div>
        <div className="competition-gallery-visual" aria-hidden="true">
          <div className="gallery-visual-grid" />
          <div className="gallery-visual-card gallery-visual-card-main"><Database size={31} /><span>DATA CHALLENGE</span><strong>Analyse. Discover. Present.</strong></div>
          <div className="gallery-visual-card gallery-visual-card-small"><Trophy size={22} /><span>SHOWCASE YOUR WORK</span></div>
          <div className="gallery-visual-orb" />
        </div>
      </section>

      <main className="competition-gallery-main">
        <section className="competition-gallery-intro">
          <div><span className="competition-gallery-eyebrow"><span /> PUT YOUR SKILLS INTO PRACTICE</span><h2>Find your next challenge.</h2><p>Browse the available challenges and choose one that matches your interests and experience.</p></div>
          <div className="competition-gallery-count"><strong>{competitions.length}</strong><span>{competitions.length === 1 ? 'challenge listed' : 'challenges listed'}</span></div>
        </section>

        <section className="competition-gallery-controls" id="challenge-list" aria-label="Competition search and filters">
          <label className="competition-search"><Search size={19} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by challenge, industry or keyword" aria-label="Search competitions" /></label>
          <div className="competition-filter-row">
            <label><span><SlidersHorizontal size={15} /> Industry</span><select value={industry} onChange={event => setIndustry(event.target.value)}><option value="all">All industries</option>{industries.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
            <label><span>Difficulty</span><select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">All levels</option><option>Beginner</option><option>Intermediate</option><option>Professional</option></select></label>
            <label><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option></select></label>
            <button type="button" className="competition-filter-clear" onClick={clearFilters}>Clear filters</button>
          </div>
        </section>

        {error && <div className="competition-gallery-message competition-gallery-error" role="alert">{error}</div>}
        {loading ? (
          <div className="competition-gallery-loading"><RefreshCw size={21} /> Loading competitions...</div>
        ) : competitions.length === 0 ? (
          <div className="competition-gallery-empty">
            <div className="competition-gallery-empty-icon"><Layers3 size={30} /></div>
            <span className="competition-gallery-eyebrow"><span /> NEW CHALLENGES ARE IN DEVELOPMENT</span>
            <h3>Our next challenge is coming soon.</h3>
            <p>We are preparing practical challenges across different industries and skill levels. Check back for updates or contact our team to learn more.</p>
            <a href={whatsappLink}>Ask about upcoming competitions <ArrowUpRight size={16} /></a>
          </div>
        ) : filteredCompetitions.length === 0 ? (
          <div className="competition-gallery-empty competition-gallery-no-results">
            <Search size={29} /><h3>No matching challenges found.</h3><p>Try changing your search term or filters.</p>
            <button type="button" onClick={clearFilters}>Reset search and filters</button>
          </div>
        ) : (
          <>
            {featured && (
              <section className="competition-featured-section">
                <div className="competition-gallery-section-heading"><div><span className="competition-gallery-eyebrow"><span /> START HERE</span><h2>Featured challenge</h2></div></div>
                <ChallengeCard competition={featured} featured />
              </section>
            )}
            <section className="competition-all-section">
              <div className="competition-gallery-section-heading"><div><span className="competition-gallery-eyebrow"><span /> THE CHALLENGE BOARD</span><h2>All competitions</h2></div><span>{filteredCompetitions.length} {filteredCompetitions.length === 1 ? 'result' : 'results'}</span></div>
              <div className="competition-card-grid">
                {filteredCompetitions.filter(item => item.id !== featured?.id).map(item => (
                  <ChallengeCard competition={item} key={item.id} />
                ))}
                {filteredCompetitions.length === 1 && <p className="competition-only-featured">This is the only challenge matching your current filters.</p>}
              </div>
            </section>
          </>
        )}

        <LeaderboardSection competitions={competitions} />
        {!loading && <HallOfFame competitions={competitions} />}
      </main>

      <section className="competition-gallery-bottom">
        <div><span className="competition-gallery-eyebrow"><span /> YOUR NEXT STEP STARTS HERE</span><h2>Ready to put your skills to work?</h2><p>Choose a challenge, follow the brief and show what you can achieve.</p></div>
        <a href={whatsappLink}>Talk to our team <ArrowUpRight size={17} /></a>
      </section>

      <footer className="competition-gallery-footer">
        <img src="/celerity-logo.png" alt="Celerity Networks" />
        <p>Helping people and businesses move forward with technology.</p>
        <span>&copy; {new Date().getFullYear()} Celerity Networks Ltd.</span>
      </footer>
    </div>
  );
}
