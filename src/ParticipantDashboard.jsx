import React, { useEffect, useState } from 'react';
import {
  UserRound, Mail, Phone, Building2, ShieldCheck,
  Trophy, CalendarDays, Database, FileCheck2,
  Clock3, LogOut, RefreshCw, ArrowUpRight,
  AlertCircle, CheckCircle2, Github, ExternalLink, Send, Download
} from 'lucide-react';
import './participant-dashboard.css';

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

function formatStatus(value) {
  if (!value) return 'Pending';

  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function StatusPill({ status }) {
  const value = String(status || 'pending').toLowerCase();

  return (
    <span className={`participant-status participant-status-${value}`}>
      {formatStatus(value)}
    </span>
  );
}

export default function ParticipantDashboard() {
  const [participant, setParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [publicRepositoryConfirmed, setPublicRepositoryConfirmed] = useState(false);
  const [projectSubmitting, setProjectSubmitting] = useState(false);
  const [projectSubmissionError, setProjectSubmissionError] = useState('');
  const [projectSubmissionSuccess, setProjectSubmissionSuccess] = useState('');

  const [publicDisplayName, setPublicDisplayName] = useState('');
  const [publicBio, setPublicBio] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState('');
  const [profileSaveSuccess, setProfileSaveSuccess] = useState('');

  async function loadProfile() {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/competitions/participant/me', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setParticipant(null);
        setError('Your session has expired or you are not signed in. Please return to the competitions page.');
        return;
      }

      if (!response.ok || !data.authenticated || !data.participant) {
        throw new Error(data.error || 'We could not retrieve your participant profile.');
      }

      setParticipant(data.participant);
    } catch (err) {
      setError(err.message || 'Unable to load your dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handleLogout() {
    setSigningOut(true);
    setError('');

    try {
      const response = await fetch('/api/competitions/participant/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Logout could not be completed.');
      }

      window.location.href = '/competitions';
    } catch (err) {
      setError(err.message || 'Unable to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  const competition = participant?.competition;
  const projectSubmission = participant?.project_submission;

  useEffect(() => {
    if (!projectSubmission) return;

    setPublicDisplayName(projectSubmission.public_display_name || '');
    setPublicBio(projectSubmission.public_bio || '');
    setPortfolioUrl(projectSubmission.portfolio_url || '');
    setLinkedinUrl(projectSubmission.linkedin_url || '');
    setPublicProfileEnabled(
      projectSubmission.public_profile_enabled === true ||
      Number(projectSubmission.public_profile_enabled) === 1
    );
  }, [projectSubmission]);

  async function handleProjectSubmit(event) {
    event.preventDefault();
    setProjectSubmissionError('');
    setProjectSubmissionSuccess('');

    if (!ownershipConfirmed || !publicRepositoryConfirmed) {
      setProjectSubmissionError('Please accept both declarations before submitting.');
      return;
    }

    setProjectSubmitting(true);

    try {
      const response = await fetch('/api/competitions/participant/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repository_url: repositoryUrl.trim(),
          ownership_confirmed: ownershipConfirmed,
          public_repository_confirmed: publicRepositoryConfirmed
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok || !data.project_submission) {
        throw new Error(data.error || 'Your project could not be submitted. Please try again.');
      }

      setParticipant(current => ({
        ...current,
        project_submission: data.project_submission
      }));
      setRepositoryUrl('');
      setOwnershipConfirmed(false);
      setPublicRepositoryConfirmed(false);
      setProjectSubmissionSuccess(data.message || 'Your GitHub project has been submitted successfully.');
    } catch (err) {
      setProjectSubmissionError(err.message || 'Unable to submit your project. Please try again.');
    } finally {
      setProjectSubmitting(false);
    }
  }

  async function handlePublicProfileSave(event) {
    event.preventDefault();
    setProfileSaveError('');
    setProfileSaveSuccess('');

    if (publicProfileEnabled && !publicDisplayName.trim()) {
      setProfileSaveError('Enter a public display name before enabling your public profile.');
      return;
    }

    setProfileSaving(true);

    try {
      const response = await fetch('/api/competitions/participant/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          public_display_name: publicDisplayName.trim(),
          public_bio: publicBio.trim(),
          portfolio_url: portfolioUrl.trim(),
          linkedin_url: linkedinUrl.trim(),
          public_profile_enabled: publicProfileEnabled
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok || !data.project_submission) {
        throw new Error(data.error || 'Your public profile could not be saved.');
      }

      setParticipant(current => ({
        ...current,
        project_submission: {
          ...current.project_submission,
          ...data.project_submission
        }
      }));

      setProfileSaveSuccess(
        data.message || 'Your public profile has been saved.'
      );
    } catch (err) {
      setProfileSaveError(
        err.message || 'Unable to save your public profile. Please try again.'
      );
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="participant-dashboard-page">
      <header className="participant-dashboard-header">
        <a className="participant-dashboard-brand" href="/">
          <img src="/celerity-logo.png" alt="Celerity Networks" />
          <span>
            <strong>Celerity Networks</strong>
            <small>Participant Portal</small>
          </span>
        </a>

        <nav>
          <a href="/competitions">Competitions</a>
          <a href="/">Home</a>
        </nav>
      </header>

      <main className="participant-dashboard-main">
        {loading ? (
          <div className="participant-dashboard-loading">
            <RefreshCw size={27} className="participant-spin" />
            <h2>Loading your dashboard</h2>
            <p>Please wait while we retrieve your participant details.</p>
          </div>
        ) : error && !participant ? (
          <div className="participant-dashboard-message">
            <div className="participant-message-icon">
              <AlertCircle size={30} />
            </div>
            <h1>Dashboard unavailable</h1>
            <p>{error}</p>
            <div className="participant-dashboard-actions">
              <button type="button" onClick={loadProfile}>
                <RefreshCw size={16} /> Try again
              </button>
              <a href="/competitions">
                Return to competitions <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
        ) : participant ? (
          <>
            <section className="participant-welcome">
              <div>
                <span className="participant-eyebrow">PARTICIPANT PORTAL</span>
                <h1>Welcome, {participant.full_name?.split(' ')[0] || 'Participant'}.</h1>
                <p>Manage your competition registration and track your progress.</p>
              </div>

              <div className="participant-welcome-actions">
                <span className="participant-verified-label">
                  <ShieldCheck size={17} /> Verified participant
                </span>
                <button
                  type="button"
                  className="participant-logout-button"
                  onClick={handleLogout}
                  disabled={signingOut}
                >
                  <LogOut size={16} />
                  {signingOut ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            </section>

            {error && (
              <div className="participant-inline-error">
                <AlertCircle size={17} /> {error}
              </div>
            )}

            <section className="participant-dashboard-grid">
              <article className="participant-dashboard-card participant-profile-card">
                <div className="participant-card-heading">
                  <div className="participant-card-icon"><UserRound size={21} /></div>
                  <div>
                    <span>YOUR ACCOUNT</span>
                    <h2>Participant profile</h2>
                  </div>
                </div>

                <div className="participant-profile-name">
                  <div className="participant-avatar">
                    {String(participant.full_name || 'P')
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map(part => part[0].toUpperCase())
                      .join('')}
                  </div>
                  <div>
                    <strong>{participant.full_name}</strong>
                    <span>Competition participant</span>
                  </div>
                </div>

                <div className="participant-detail-list">
                  <div>
                    <Mail size={17} />
                    <span><small>Email address</small><strong>{participant.email}</strong></span>
                    <CheckCircle2 className="participant-detail-check" size={17} />
                  </div>
                  <div>
                    <Phone size={17} />
                    <span><small>Phone number</small><strong>{participant.phone || 'Not provided'}</strong></span>
                  </div>
                  <div>
                    <Building2 size={17} />
                    <span><small>Organisation</small><strong>{participant.organization || 'Not provided'}</strong></span>
                  </div>
                  <div>
                    <CalendarDays size={17} />
                    <span><small>Registration date</small><strong>{formatDate(participant.registered_at)}</strong></span>
                  </div>
                </div>

                <div className="participant-profile-footer">
                  <ShieldCheck size={17} />
                  Email verification completed on {formatDate(participant.verified_at)}
                </div>
              </article>

              <article className="participant-dashboard-card participant-competition-card">
                <div className="participant-card-heading">
                  <div className="participant-card-icon"><Trophy size={21} /></div>
                  <div>
                    <span>YOUR CHALLENGE</span>
                    <h2>Registered competition</h2>
                  </div>
                </div>

                {competition ? (
                  <>
                    <div className="participant-competition-title">
                      <h3>{competition.title}</h3>
                      <StatusPill status={competition.status} />
                    </div>

                    <p className="participant-competition-description">
                      {competition.description || 'Competition details will be updated here.'}
                    </p>

                    <div className="participant-competition-facts">
                      <div>
                        <CalendarDays size={18} />
                        <span><small>Start date</small><strong>{formatDate(competition.starts_at)}</strong></span>
                      </div>
                      <div>
                        <Clock3 size={18} />
                        <span><small>Submission deadline</small><strong>{formatDate(competition.ends_at)}</strong></span>
                      </div>
                      <div>
                        <Trophy size={18} />
                        <span><small>Difficulty</small><strong>{competition.difficulty || 'Not specified'}</strong></span>
                      </div>
                      <div>
                        <Database size={18} />
                        <span><small>Challenge dataset</small><strong>{competition.dataset_file_name || 'Details to be announced'}</strong></span>
                      </div>
                    </div>

                    {competition.instructions && (
                      <div className="participant-instructions">
                        <h4>Competition instructions</h4>
                        <p>{competition.instructions}</p>
                      </div>
                    )}

                    {competition.dataset_file_name ? (
                      <a
                        className="participant-dataset-download"
                        href={`/api/competitions/${encodeURIComponent(competition.slug)}/dataset`}
                      >
                        <Download size={17} /> Download challenge dataset
                      </a>
                    ) : (
                      <p className="participant-dataset-pending">
                        The challenge dataset has not been uploaded yet.
                      </p>
                    )}

                    <a
                      className="participant-text-link"
                      href={`/competitions`}
                    >
                      View competitions page <ArrowUpRight size={15} />
                    </a>
                  </>
                ) : (
                  <p>Your competition details are currently unavailable.</p>
                )}
              </article>

              <article className="participant-dashboard-card participant-submission-card">
                <div className="participant-card-heading">
                  <div className="participant-card-icon"><FileCheck2 size={21} /></div>
                  <div>
                    <span>YOUR PROGRESS</span>
                    <h2>Submission tracking</h2>
                  </div>
                </div>

                {projectSubmission ? (
                  <div className="participant-submission-file">
                    <Github size={22} />
                    <div>
                      <strong>GitHub project submitted</strong>
                      <small>
                        Submitted on {formatDate(projectSubmission.submitted_at)}
                      </small>
                      <a
                        href={projectSubmission.repository_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View repository <ExternalLink size={13} />
                      </a>
                    </div>
                    <StatusPill status={projectSubmission.status} />
                  </div>
                ) : (
                  <div className="participant-no-submission">
                    <Clock3 size={29} />
                    <h3>No submission recorded yet</h3>
                    <p>Your GitHub project submission details will appear here once your entry has been received.</p>
                  </div>
                )}
              </article>
              <article className="participant-dashboard-card participant-github-card">
                <div className="participant-card-heading">
                  <div className="participant-card-icon"><Github size={21} /></div>
                  <div>
                    <span>PROJECT ENTRY</span>
                    <h2>GitHub project submission</h2>
                  </div>
                </div>

                {projectSubmission ? (
                  <>
                    <div className="participant-github-submitted">
                      <CheckCircle2 size={20} />
                      <div>
                        <strong>Project received</strong>
                        <small>Submitted {formatDate(projectSubmission.submitted_at)}</small>
                      </div>
                      <StatusPill status={projectSubmission.status} />
                    </div>

                    <a
                      className="participant-github-repository"
                      href={projectSubmission.repository_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github size={17} />
                      View submitted repository
                      <ExternalLink size={15} />
                    </a>

                    <div className="participant-submission-details">
                      <div>
                        <small>Review score</small>
                        <strong>
                          {projectSubmission.score === null || projectSubmission.score === undefined
                            ? 'Awaiting review'
                            : Number(projectSubmission.score).toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <small>Review status</small>
                        <strong>{formatStatus(projectSubmission.status)}</strong>
                      </div>
                    </div>

                    {projectSubmission.feedback && (
                      <div className="participant-feedback">
                        <strong>Reviewer feedback</strong>
                        <p>{projectSubmission.feedback}</p>
                      </div>
                    )}

                    <section className="participant-public-profile">
                      <div className="participant-public-profile-heading">
                        <div>
                          <span>LEADERBOARD PROFILE</span>
                          <h3>Public participant profile</h3>
                        </div>
                        <StatusPill status={publicProfileEnabled ? 'active' : 'pending'} />
                      </div>

                      <p className="participant-public-profile-intro">
                        Choose the name and details that may appear on the public competition leaderboard.
                        Your legal name, email, phone number and GitHub repository URL will not be published by this profile.
                      </p>

                      <form
                        className="participant-github-form"
                        onSubmit={handlePublicProfileSave}
                      >
                        <label htmlFor="participant-public-display-name">
                          Public display name
                        </label>
                        <input
                          id="participant-public-display-name"
                          type="text"
                          value={publicDisplayName}
                          onChange={event => setPublicDisplayName(event.target.value)}
                          maxLength={80}
                          autoComplete="nickname"
                          placeholder="Name to display on the leaderboard"
                          required={publicProfileEnabled}
                          disabled={profileSaving}
                        />

                        <label htmlFor="participant-public-bio">
                          Short biography
                        </label>
                        <textarea
                          id="participant-public-bio"
                          value={publicBio}
                          onChange={event => setPublicBio(event.target.value)}
                          maxLength={500}
                          rows={4}
                          placeholder="Tell people briefly about your work or interests."
                          disabled={profileSaving}
                        />

                        <label htmlFor="participant-portfolio-url">
                          Portfolio website (optional)
                        </label>
                        <input
                          id="participant-portfolio-url"
                          type="url"
                          value={portfolioUrl}
                          onChange={event => setPortfolioUrl(event.target.value)}
                          maxLength={500}
                          placeholder="https://yourportfolio.com"
                          autoComplete="url"
                          disabled={profileSaving}
                        />

                        <label htmlFor="participant-linkedin-url">
                          LinkedIn profile (optional)
                        </label>
                        <input
                          id="participant-linkedin-url"
                          type="url"
                          value={linkedinUrl}
                          onChange={event => setLinkedinUrl(event.target.value)}
                          maxLength={500}
                          placeholder="https://www.linkedin.com/in/your-profile"
                          autoComplete="url"
                          disabled={profileSaving}
                        />

                        <label className="participant-github-checkbox">
                          <input
                            type="checkbox"
                            checked={publicProfileEnabled}
                            onChange={event => setPublicProfileEnabled(event.target.checked)}
                            disabled={profileSaving}
                          />
                          <span>
                            I consent to displaying my public display name, biography, score and the profile links above on the competition leaderboard.
                            I understand that I can withdraw this consent at any time.
                          </span>
                        </label>

                        <p className="participant-public-profile-note">
                          Your profile is only eligible to appear when your submission has been shortlisted or selected as a winner.
                          Enabling this option does not guarantee a leaderboard position.
                        </p>

                        {profileSaveError && (
                          <div className="participant-github-message participant-github-message-error" role="alert">
                            <AlertCircle size={16} />
                            <span>{profileSaveError}</span>
                          </div>
                        )}

                        {profileSaveSuccess && (
                          <div className="participant-github-message participant-github-message-success" role="status">
                            <CheckCircle2 size={16} />
                            <span>{profileSaveSuccess}</span>
                          </div>
                        )}

                        <button
                          className="participant-github-submit"
                          type="submit"
                          disabled={
                            profileSaving ||
                            (publicProfileEnabled && !publicDisplayName.trim())
                          }
                        >
                          <CheckCircle2 size={16} />
                          {profileSaving ? 'Saving profile...' : 'Save public profile'}
                        </button>
                      </form>
                    </section>

                    <p className="participant-github-locked-note">
                      Your submission has been recorded. A second submission is not permitted for this competition.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="participant-github-intro">
                      Submit a link to your public GitHub repository. Do not upload project files or share passwords or access tokens.
                    </p>

                    <form className="participant-github-form" onSubmit={handleProjectSubmit}>
                      <label htmlFor="participant-repository-url">GitHub repository URL</label>
                      <input
                        id="participant-repository-url"
                        type="url"
                        value={repositoryUrl}
                        onChange={event => setRepositoryUrl(event.target.value)}
                        placeholder="https://github.com/username/repository"
                        maxLength={300}
                        autoComplete="url"
                        required
                        disabled={projectSubmitting}
                      />

                      <label className="participant-github-checkbox">
                        <input
                          type="checkbox"
                          checked={ownershipConfirmed}
                          onChange={event => setOwnershipConfirmed(event.target.checked)}
                          required
                          disabled={projectSubmitting}
                        />
                        <span>
                          I confirm that I have permission to submit this repository and that it contains my own work or authorised team work.
                        </span>
                      </label>

                      <label className="participant-github-checkbox">
                        <input
                          type="checkbox"
                          checked={publicRepositoryConfirmed}
                          onChange={event => setPublicRepositoryConfirmed(event.target.checked)}
                          required
                          disabled={projectSubmitting}
                        />
                        <span>
                          I understand this repository must remain public and may be accessed and reviewed by Celerity Networks for this competition.
                        </span>
                      </label>

                      {projectSubmissionError && (
                        <div className="participant-github-message participant-github-message-error" role="alert">
                          <AlertCircle size={16} />
                          <span>{projectSubmissionError}</span>
                        </div>
                      )}

                      <button
                        className="participant-github-submit"
                        type="submit"
                        disabled={projectSubmitting || !repositoryUrl.trim() || !ownershipConfirmed || !publicRepositoryConfirmed}
                      >
                        <Send size={16} />
                        {projectSubmitting ? 'Verifying repository...' : 'Submit GitHub project'}
                      </button>
                    </form>

                    {projectSubmissionSuccess && (
                      <div className="participant-github-message participant-github-message-success" role="status">
                        <CheckCircle2 size={16} />
                        <span>{projectSubmissionSuccess}</span>
                      </div>
                    )}
                  </>
                )}
              </article>
            </section>

            <footer className="participant-dashboard-footer">
              <span>Helping people and businesses move forward with technology.</span>
              <span>© {new Date().getFullYear()} Celerity Networks Ltd.</span>
            </footer>
          </>
        ) : null}
      </main>
    </div>
  );
}
