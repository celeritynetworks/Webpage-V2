import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, ArrowUpRight, Award, CalendarDays,
  Database, LockKeyhole, ExternalLink, Medal, RefreshCw, Trophy
} from 'lucide-react';
import './competition-detail.css';

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

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="competition-detail-profile-links">
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

function StatusPill({ status }) {
  const label = status === 'active' ? 'Live' : status === 'upcoming' ? 'Upcoming' : status === 'completed' ? 'Completed' : 'Draft';
  return <span className={`competition-detail-status status-${status || 'upcoming'}`}>{label}</span>;
}

export default function CompetitionDetail({ slug: rawSlug }) {
  let slug = rawSlug || '';
  try { slug = decodeURIComponent(slug); } catch { /* Keep the original route segment. */ }

  const [competition, setCompetition] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [winner, setWinner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [error, setError] = useState('');
  const [boardError, setBoardError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadCompetition() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/competitions');
        if (!response.ok) throw new Error('Could not load competitions.');
        const data = await response.json();
        const match = (data.competitions || []).find(item => item.slug === slug);
        if (!cancelled) {
          if (!match) setError('This competition could not be found. It may have ended or is no longer available.');
          setCompetition(match || null);
        }
      } catch {
        if (!cancelled) setError('We could not load this competition. Please try again later.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCompetition();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!competition?.slug) {
      setLeaderboard([]);
      setWinner(null);
      return;
    }

    let cancelled = false;
    async function loadLeaderboard() {
      setBoardLoading(true);
      setBoardError('');
      try {
        const response = await fetch(
          `/api/competitions/${encodeURIComponent(competition.slug)}/leaderboard`
        );
        if (!response.ok) throw new Error('Could not load leaderboard.');
        const data = await response.json();
        if (!cancelled) {
          setLeaderboard(data.leaderboard || []);
          setWinner(data.winner || null);
        }
      } catch {
        if (!cancelled) setBoardError('The leaderboard is currently unavailable.');
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    }

    loadLeaderboard();
    return () => { cancelled = true; };
  }, [competition?.slug]);

  const canRegister = competition && ['upcoming', 'active'].includes(competition.status);
  const datasetMeta = [
    competition?.dataset_file_format,
    formatBytes(competition?.dataset_file_size_bytes),
    competition?.record_count ? `${Number(competition.record_count).toLocaleString()} records` : ''
  ].filter(Boolean);

  return (
    <div className="competition-detail-page">
      <header className="competition-detail-header">
        <a className="competition-detail-brand" href="/">
          <img src="/celerity-logo.png" alt="Celerity Networks" />
          <span><strong>Celerity Networks</strong><small>Technology · Training · Solutions</small></span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/#services">What We Do</a>
          <a href="/datasets">Datasets</a>
          <a href="/competitions">Competitions</a>
          <a href="/#about">About Us</a>
          {canRegister && (
            <a className="competition-detail-nav-cta" href={`/competition-register?slug=${encodeURIComponent(competition.slug)}`}>
              Participate <ArrowUpRight size={16} />
            </a>
          )}
        </nav>
      </header>

      {loading ? (
        <main className="competition-detail-state">
          <RefreshCw size={24} />
          <p>Loading competition...</p>
        </main>
      ) : error ? (
        <main className="competition-detail-state">
          <Trophy size={34} />
          <h1>Competition unavailable</h1>
          <p>{error}</p>
          <a className="competition-detail-button" href="/competitions"><ArrowLeft size={16} /> Browse competitions</a>
        </main>
      ) : competition ? (
        <>
          <section className="competition-detail-hero">
            <div className="competition-detail-hero-inner">
              <a className="competition-detail-back" href="/competitions"><ArrowLeft size={16} /> All competitions</a>
              <div className="competition-detail-hero-top">
                <span className="competition-detail-kicker">CELERITY NETWORKS CHALLENGE SERIES</span>
                <StatusPill status={competition.status} />
              </div>
              {competition.thumbnail_url && <img className="competition-detail-thumbnail" src={competition.thumbnail_url} alt={`${competition.title} competition thumbnail`} />}
              <h1>{competition.title}</h1>
              <p>{competition.description || 'Explore the challenge brief and demonstrate your practical data skills.'}</p>
              <div className="competition-detail-tags">
                <span>{competition.industry_name || 'General'}</span>
                <span>{competition.difficulty || 'Difficulty to be announced'}</span>
              </div>
              <div className="competition-detail-hero-meta">
                <div><CalendarDays size={18} /><span><small>Challenge starts</small><strong>{formatDate(competition.starts_at)}</strong></span></div>
                <div><CalendarDays size={18} /><span><small>Submission deadline</small><strong>{formatDate(competition.ends_at)}</strong></span></div>
                <div><Database size={18} /><span><small>Dataset</small><strong>{competition.dataset_file_name || 'Details to be announced'}</strong></span></div>
              </div>
              <div className="competition-detail-actions">
                {canRegister ? (
                  <a className="competition-detail-button" href={`/competition-register?slug=${encodeURIComponent(competition.slug)}`}>
                    Register for this challenge <ArrowUpRight size={17} />
                  </a>
                ) : (
                  <span className="competition-detail-completed-note">Registration is not currently available for this challenge.</span>
                )}
                <a className="competition-detail-login" href={`/participant-login?slug=${encodeURIComponent(competition.slug)}`}>
                  Already registered? Sign in
                </a>
              </div>
            </div>
          </section>

          <main className="competition-detail-main">
            <div className="competition-detail-columns">
              <article className="competition-detail-brief">
                <span className="competition-detail-section-label">THE CHALLENGE</span>
                <h2>Challenge overview</h2>
                <p>{competition.description || 'Challenge overview will be published soon.'}</p>

                <div className="competition-detail-instructions">
                  <h3>Challenge instructions</h3>
                  {competition.instructions ? (
                    <p className="competition-detail-preserve-lines">{competition.instructions}</p>
                  ) : (
                    <p>Detailed instructions will be made available when the challenge brief is published.</p>
                  )}
                </div>

                <div className="competition-detail-dataset">
                  <div className="competition-detail-dataset-icon"><Database size={22} /></div>
                  <div>
                    <h3>Challenge dataset</h3>
                    <p>{competition.dataset_file_name || 'Dataset information will be announced.'}</p>
                    {datasetMeta.length > 0 && <small>{datasetMeta.join(' · ')}</small>}
                    <p className="competition-detail-access-note">
                      The dataset is provided to participants after successful registration and email verification for this specific competition. Sign-in alone does not grant access unless your registration is verified.
                    </p>
                  </div>
                  <LockKeyhole size={20} aria-hidden="true" />
                </div>

                <div className="competition-detail-register-callout">
                  <div>
                    <span className="competition-detail-section-label">TAKE PART</span>
                    <h3>Ready to work on the challenge?</h3>
                    <p>Register for this competition, verify your email and follow the participant instructions.</p>
                  </div>
                  {canRegister && (
                    <a className="competition-detail-button" href={`/competition-register?slug=${encodeURIComponent(competition.slug)}`}>
                      Get started <ArrowUpRight size={16} />
                    </a>
                  )}
                </div>
              </article>

              <aside className="competition-detail-sidebar">
                <div className="competition-detail-info-card">
                  <span className="competition-detail-section-label">AT A GLANCE</span>
                  <h3>Competition details</h3>
                  <dl>
                    <div><dt>Industry</dt><dd>{competition.industry_name || 'General'}</dd></div>
                    <div><dt>Difficulty</dt><dd>{competition.difficulty || 'To be announced'}</dd></div>
                    <div><dt>Registration opens</dt><dd>{formatDate(competition.registration_opens_at)}</dd></div>
                    <div><dt>Registration closes</dt><dd>{formatDate(competition.registration_closes_at)}</dd></div>
                    <div><dt>Challenge starts</dt><dd>{formatDate(competition.starts_at)}</dd></div>
                    <div><dt>Deadline</dt><dd>{formatDate(competition.ends_at)}</dd></div>
                  </dl>
                  {canRegister && <a className="competition-detail-button competition-detail-button-full" href={`/competition-register?slug=${encodeURIComponent(competition.slug)}`}>Register now <ArrowUpRight size={16} /></a>}
                  <a className="competition-detail-sidebar-login" href={`/participant-login?slug=${encodeURIComponent(competition.slug)}`}>Participant sign in</a>
                </div>
                <div className="competition-detail-support-card">
                  <h3>Need assistance?</h3>
                  <p>Contact Celerity Networks if you have questions about participating in this challenge.</p>
                  <a href="https://wa.me/2349025476588?text=Hello%20Celerity%20Networks%2C%20I%20have%20a%20question%20about%20a%20competition." target="_blank" rel="noreferrer">Contact the team <ArrowUpRight size={15} /></a>
                </div>
              </aside>
            </div>

            <section className="competition-detail-results">
              <div className="competition-detail-results-heading">
                <div><span className="competition-detail-section-label">COMPETITION RESULTS</span><h2>Leaderboard</h2><p>Recognising participants with the strongest reviewed submissions.</p></div>
                <Medal size={30} />
              </div>
              {boardError && <p className="competition-detail-error">{boardError}</p>}
              {boardLoading ? (
                <div className="competition-detail-board-state"><RefreshCw size={18} /> Loading leaderboard...</div>
              ) : (
                <div className="competition-detail-results-grid">
                  <div className="competition-detail-board-card">
                    <div className="competition-detail-board-title"><Trophy size={20} /><div><h3>Top 10 participants</h3><p>{competition.title}</p></div></div>
                    {leaderboard.length === 0 ? (
                      <div className="competition-detail-board-empty"><Medal size={28} /><p>Rankings will appear after submissions have been reviewed and results are approved.</p></div>
                    ) : (
                      <div className="competition-detail-table-wrap">
                        <table>
                          <thead><tr><th>Rank</th><th>Participant</th><th>Score</th></tr></thead>
                          <tbody>{leaderboard.map(person => (
                            <tr key={person.rank}>
                              <td><span className={`competition-detail-rank rank-${person.rank}`}>{person.rank <= 3 ? <Medal size={16} /> : person.rank}</span></td>
                              <td><div className="competition-detail-person"><span className="competition-detail-avatar">{initials(person.name)}</span><div><strong>{person.name}</strong><ProfileLinks person={person} /></div></div></td>
                              <td className="competition-detail-score">{Number(person.score).toLocaleString()}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <aside className="competition-detail-winner">
                    <div className="competition-detail-winner-heading"><Trophy size={22} /><span>FEATURED WINNER</span></div>
                    {winner ? (
                      <>
                        <div className="competition-detail-winner-avatar">{initials(winner.name)}</div>
                        <h3>{winner.name}</h3>
                        <span className="competition-detail-winner-label">Competition Winner</span>
                        <strong className="competition-detail-winner-score">{Number(winner.score).toLocaleString()}</strong>
                        <small>Verified score</small>
                        <p>{winner.bio || 'Winner profile coming soon.'}</p>
                        <ProfileLinks person={winner} />
                      </>
                    ) : (
                      <div className="competition-detail-winner-empty"><Award size={34} /><h3>Our next winner could be you</h3><p>The winner profile will appear here after results are verified and announced.</p></div>
                    )}
                  </aside>
                </div>
              )}
            </section>
          </main>
        </>
      ) : null}

      <footer className="competition-detail-footer">
        <img src="/celerity-logo.png" alt="Celerity Networks" />
        <p>Helping people and businesses move forward with technology.</p>
        <span>© {new Date().getFullYear()} Celerity Networks Ltd.</span>
      </footer>
    </div>
  );
}
