import React, { useEffect, useState } from 'react';
import {
  Trophy, Medal, Award, CalendarDays, Database,
  ExternalLink, ArrowUpRight, RefreshCw
} from 'lucide-react';
import './competitions.css';

const whatsappLink = 'https://wa.me/2349025476588?text=Hello%20Celerity%20Networks%2C%20I%20want%20to%20participate%20in%20a%20data%20competition.';

function formatDate(value) {
  if (!value) return 'To be announced';
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) return 'To be announced';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function initials(name) {
  return String(name || 'Participant')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

function ProfileLinks({ person }) {
  if (!person) return null;

  return (
    <div className="competition-profile-links">
      {person.linkedin_url && (
        <a href={person.linkedin_url} target="_blank" rel="noreferrer">
          LinkedIn <ExternalLink size={14} />
        </a>
      )}
      {person.portfolio_url && (
        <a href={person.portfolio_url} target="_blank" rel="noreferrer">
          Portfolio <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}

export default function Competitions() {
  const [competitions, setCompetitions] = useState([]);
  const [selectedSlug, setSelectedSlug] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState('');
  const [boardError, setBoardError] = useState('');

  const selectedCompetition = competitions.find(
    item => item.slug === selectedSlug
  );

  useEffect(() => {
    let cancelled = false;

    async function loadCompetitions() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/competitions');

        if (!response.ok) {
          throw new Error('Could not load competitions');
        }

        const data = await response.json();
        const items = data.competitions || [];

        if (!cancelled) {
          setCompetitions(items);

          const preferred =
            items.find(item => item.status === 'active') ||
            items.find(item => item.status === 'upcoming') ||
            items.find(item => item.status === 'completed');

          setSelectedSlug(preferred?.slug || '');
        }
      } catch {
        if (!cancelled) {
          setError('We could not load competitions. Please try again later.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCompetitions();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedSlug) {
      setLeaderboard([]);
      setWinner(null);
      return;
    }

    let cancelled = false;

    async function loadLeaderboard() {
      setBoardLoading(true);
      setBoardError('');
      setLeaderboard([]);
      setWinner(null);

      try {
        const response = await fetch(
          `/api/competitions/${encodeURIComponent(selectedSlug)}/leaderboard`
        );

        if (!response.ok) {
          throw new Error('Could not load leaderboard');
        }

        const data = await response.json();

        if (!cancelled) {
          setLeaderboard(data.leaderboard || []);
          setWinner(data.winner || null);
        }
      } catch {
        if (!cancelled) {
          setBoardError('The leaderboard is currently unavailable.');
        }
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    }

    loadLeaderboard();

    return () => { cancelled = true; };
  }, [selectedSlug]);

  return (
    <div className="competitions-page">
      <header className="header">
        <div className="container nav-wrap">
          <a className="brand" href="/">
            <img src="/celerity-logo.png" alt="Celerity Networks official logo" />
            <span className="brand-copy">
              <strong>Celerity Networks</strong>
              <small>Technology · Training · Solutions</small>
            </span>
          </a>
          <nav className="competition-nav">
            <a href="/">Home</a>
            <a href="/datasets">Datasets</a>
            <a href="/competitions">Competitions</a>
            <a className="nav-cta" href={selectedCompetition ? `/competition-register?slug=${encodeURIComponent(selectedCompetition.slug)}` : "/competitions#current-challenges"}>
              Participate <ArrowUpRight size={16} />
            </a>
          </nav>
        </div>
      </header>

      <section className="competition-hero">
        <div className="competition-hero-inner">
          <span className="competition-eyebrow">CELERITY NETWORKS CHALLENGE SERIES</span>
          <h1>Put your data skills to the test.</h1>
          <p>
            Take on practical data challenges, solve real-world problems,
            showcase your skills and earn recognition for your work.
          </p>
          <a className="competition-primary-link" href="#current-challenges">
            Explore competitions <ArrowUpRight size={17} />
          </a>
        </div>
      </section>

      <main className="competition-content">
        <section id="current-challenges">
          <div className="competition-section-heading">
            <div>
              <span className="competition-eyebrow">MONTHLY CHALLENGES</span>
              <h2>Explore the competitions</h2>
              <p>Choose a challenge, study the brief and demonstrate what you can do.</p>
            </div>
            <Trophy size={34} />
          </div>

          {error && <div className="competition-message competition-error">{error}</div>}

          {loading ? (
            <div className="competition-message">Loading competitions...</div>
          ) : competitions.length === 0 ? (
            <div className="competition-empty">
              <Trophy size={42} />
              <h3>Our next challenge is coming soon</h3>
              <p>
                We are preparing practical monthly challenges across different
                industries and skill levels. Check back for updates.
              </p>
              <a href={whatsappLink} target="_blank" rel="noreferrer">
                Ask about upcoming competitions <ArrowUpRight size={15} />
              </a>
            </div>
          ) : (
            <div className="competition-layout">
              <div className="competition-list">
                {competitions.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={`competition-list-card ${selectedSlug === item.slug ? 'selected' : ''}`}
                    onClick={() => setSelectedSlug(item.slug)}
                  >
                    <span className={`competition-status status-${item.status}`}>
                      {item.status}
                    </span>
                    <strong>{item.title}</strong>
                    <span>{item.industry_name || 'General'} · {item.difficulty}</span>
                    <small>Ends: {formatDate(item.ends_at)}</small>
                  </button>
                ))}
              </div>

              {selectedCompetition && (
                <article className="competition-detail-card">
                  <span className={`competition-status status-${selectedCompetition.status}`}>
                    {selectedCompetition.status}
                  </span>
                  <h3>{selectedCompetition.title}</h3>
                  <p>{selectedCompetition.description}</p>

                  <div className="competition-facts">
                    <div>
                      <Database size={19} />
                      <span><small>Industry</small><strong>{selectedCompetition.industry_name || 'General'}</strong></span>
                    </div>
                    <div>
                      <Award size={19} />
                      <span><small>Difficulty</small><strong>{selectedCompetition.difficulty}</strong></span>
                    </div>
                    <div>
                      <CalendarDays size={19} />
                      <span><small>Starts</small><strong>{formatDate(selectedCompetition.starts_at)}</strong></span>
                    </div>
                    <div>
                      <CalendarDays size={19} />
                      <span><small>Deadline</small><strong>{formatDate(selectedCompetition.ends_at)}</strong></span>
                    </div>
                  </div>

                  {selectedCompetition.instructions && (
                    <div className="competition-instructions">
                      <h4>Challenge instructions</h4>
                      <p>{selectedCompetition.instructions}</p>
                    </div>
                  )}

                  {selectedCompetition.dataset_file_name && (
                    <p className="competition-dataset-note">
                      <Database size={17} />
                      Challenge dataset: {selectedCompetition.dataset_file_name}
                    </p>
                  )}

                  <a
                    className="competition-primary-link"
                    href={`/competition-register?slug=${encodeURIComponent(selectedCompetition.slug)}`}
                  >
                    Register to participate <ArrowUpRight size={16} />
                  </a>

                  <a
                    className="participant-signin-link"
                    href={`/participant-login?slug=${encodeURIComponent(selectedCompetition.slug)}`}
                  >
                    Already registered? Sign in
                  </a>
                </article>
              )}
            </div>
          )}
        </section>

        {selectedCompetition && (
          <section className="competition-results-section">
            <div className="competition-section-heading">
              <div>
                <span className="competition-eyebrow">COMPETITION RESULTS</span>
                <h2>Leaderboard</h2>
                <p>Recognising participants with the strongest reviewed submissions.</p>
              </div>
              <Medal size={34} />
            </div>

            {boardError && <div className="competition-message competition-error">{boardError}</div>}

            {boardLoading ? (
              <div className="competition-message"><RefreshCw size={17} /> Loading leaderboard...</div>
            ) : (
              <div className="competition-results-grid">
                <div className="leaderboard-card">
                  <div className="leaderboard-title">
                    <Trophy size={21} />
                    <div>
                      <h3>Top 10 participants</h3>
                      <p>{selectedCompetition.title}</p>
                    </div>
                  </div>

                  {leaderboard.length === 0 ? (
                    <div className="leaderboard-empty">
                      <Medal size={30} />
                      <p>Rankings will appear here after submissions have been reviewed and results are approved.</p>
                    </div>
                  ) : (
                    <div className="leaderboard-table-wrap">
                      <table className="leaderboard-table">
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Participant</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.map(person => (
                            <tr key={person.rank}>
                              <td>
                                <span className={`leaderboard-rank rank-${person.rank}`}>
                                  {person.rank <= 3 ? <Medal size={17} /> : person.rank}
                                </span>
                              </td>
                              <td>
                                <div className="leaderboard-person">
                                  <span className="leaderboard-avatar">{initials(person.name)}</span>
                                  <div>
                                    <strong>{person.name}</strong>
                                    <ProfileLinks person={person} />
                                  </div>
                                </div>
                              </td>
                              <td className="leaderboard-score">{Number(person.score).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <aside className="winner-card">
                  <div className="winner-card-heading">
                    <Trophy size={25} />
                    <span>FEATURED WINNER</span>
                  </div>

                  {winner ? (
                    <>
                      <div className="winner-avatar">{initials(winner.name)}</div>
                      <h3>{winner.name}</h3>
                      <span className="winner-label">Competition Winner</span>
                      <div className="winner-score">
                        <strong>{Number(winner.score).toLocaleString()}</strong>
                        <small>Verified score</small>
                      </div>
                      <p>{winner.bio || 'Winner profile coming soon.'}</p>
                      <ProfileLinks person={winner} />
                    </>
                  ) : (
                    <div className="winner-empty">
                      <Award size={38} />
                      <h3>Our next winner could be you</h3>
                      <p>The winner profile will be featured here once results are verified and announced.</p>
                    </div>
                  )}
                </aside>
              </div>
            )}
          </section>
        )}

        <section className="competition-hall">
          <span className="competition-eyebrow">RECOGNISING EXCELLENCE</span>
          <h2>Every challenge is an opportunity to grow.</h2>
          <p>
            Our Hall of Fame will celebrate past winners and outstanding
            participants as each monthly competition is completed.
          </p>
        </section>
      </main>

      <footer className="competition-footer">
        <div className="container">
          <img src="/celerity-logo.png" alt="Celerity Networks" width="60" style={{ width: "60px", height: "auto", maxWidth: "60px", display: "block", margin: "0 auto 14px" }} />
          <p>Helping people and businesses move forward with technology.</p>
          <span>© {new Date().getFullYear()} Celerity Networks Ltd.</span>
        </div>
      </footer>
    </div>
  );
}
