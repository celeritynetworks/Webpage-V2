import React from 'react';
import DatasetManagement from './DatasetManagement.jsx';
import CompetitionManagement from './CompetitionManagement.jsx';
import './AdminDashboard.css';

const STATUSES = ['submitted', 'reviewing', 'shortlisted', 'winner', 'not_selected', 'requires_revision'];

const STATUS_LABELS = {
  submitted: 'Submitted',
  reviewing: 'Under review',
  shortlisted: 'Shortlisted',
  winner: 'Winner',
  not_selected: 'Not selected',
  requires_revision: 'Revision required',
};

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

export default function AdminDashboard({ preview = false }) {
  const [admin, setAdmin] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('reviews');
  const [submissions, setSubmissions] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [stats, setStats] = React.useState({
    total: 0,
    awaiting_review: 0,
    shortlisted: 0,
    winners: 0,
    reviewed: 0
  });
  const [competitions, setCompetitions] = React.useState([]);
  const [competitionFilter, setCompetitionFilter] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const [reviews, setReviews] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [listLoading, setListLoading] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const historyRequestRef = React.useRef(0);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const [form, setForm] = React.useState({
    score: '',
    status: 'reviewing',
    feedback: '',
    reason: ''
  });

  const loadSubmissions = React.useCallback(async () => {
    setListLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (statusFilter) params.set('status', statusFilter);
      if (competitionFilter) params.set('competition_id', competitionFilter);

      const response = await fetch(`/api/admin/submissions?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        throw new Error('Administrator access is required. Please sign in through Cloudflare Access.');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not load submissions.');
      }

      setSubmissions(data.submissions || []);
      setTotal(Number(data.total ?? data.pagination?.total ?? 0));
      setStats(data.stats || {
        total: 0,
        awaiting_review: 0,
        shortlisted: 0,
        winners: 0,
        reviewed: 0
      });
      setCompetitions(data.competitions || []);
    } catch (err) {
      setError(err.message || 'Could not load submissions.');
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, competitionFilter]);

  const loadHistory = React.useCallback(async (submissionId) => {
    if (!submissionId) return;

    const requestId = ++historyRequestRef.current;
    setHistoryLoading(true);

    try {
      const response = await fetch(
        `/api/admin/reviews?submission_id=${encodeURIComponent(submissionId)}`,
        { credentials: 'same-origin', cache: 'no-store' }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not load review history.');
      }

      if (requestId === historyRequestRef.current) {
        setReviews(data.reviews || []);
      }
    } catch (err) {
      if (requestId === historyRequestRef.current) {
        setReviews([]);
        setError(err.message || 'Could not load review history.');
      }
    } finally {
      if (requestId === historyRequestRef.current) {
        setHistoryLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    if (preview) {
      setAdmin({ email: 'LOCAL PREVIEW' });
      setLoading(false);
      return () => { active = false; };
    }

    async function initialise() {
      setLoading(true);

      try {
        const response = await fetch('/api/admin/me', {
          credentials: 'same-origin',
          cache: 'no-store'
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            response.status === 401 || response.status === 403
              ? 'Administrator authentication is required. Sign in with your authorised Cloudflare Access account.'
              : data.message || 'Unable to verify administrator access.'
          );
        }

        if (active) setAdmin(data.admin || data);
      } catch (err) {
        if (active) setError(err.message || 'Unable to verify administrator access.');
      } finally {
        if (active) setLoading(false);
      }
    }

    initialise();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (admin && !preview) loadSubmissions();
  }, [admin, loadSubmissions, preview]);

  async function selectSubmission(submission) {
    setSelected(submission);
    setNotice('');
    setError('');

    setForm({
      score: submission.score ?? '',
      status: submission.status || 'reviewing',
      feedback: submission.feedback || '',
      reason: ''
    });

    setReviews([]);
    await loadHistory(submission.id);
  }

  function updateForm(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  async function saveReview(event) {
    event.preventDefault();
    if (preview) return;

    if (!selected) return;

    const score = Number(form.score);

    if (form.score === '' || !Number.isFinite(score) || score < 0 || score > 100) {
      setError('Enter a valid score between 0 and 100.');
      return;
    }

    if (form.reason.trim().length < 10 || form.reason.trim().length > 1000) {
      setError('The reason must contain between 10 and 1,000 characters.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/admin/reviews', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: selected.id,
          score,
          status: form.status,
          feedback: form.feedback,
          reason: form.reason.trim()
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'The review could not be saved.');
      }

      setNotice('Review saved successfully. The audit history has been updated.');

      setSelected(current => {
        if (!current || current.id !== selected.id) return current;

        return {
          ...current,
          score,
          status: form.status,
          feedback: form.feedback,
          review_count: (Number(current.review_count) || 0) + 1
        };
      });

      setForm(current => ({ ...current, reason: '' }));

      await loadSubmissions();
      await loadHistory(selected.id);
    } catch (err) {
      setError(err.message || 'The review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="admin-shell">
        <div className="admin-loading">Verifying administrator access...</div>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <h1>Administrator access</h1>
          <p>{error || 'You must sign in with an authorised administrator account.'}</p>
          <a href="/">Return to Celerity Networks</a>
        </section>
      </main>
    );
  }

  const adminEmail = typeof admin === 'string' ? admin : admin.email;

  const tabHeading = {
    reviews: {
      title: 'Submission Reviews',
      description: 'Review participant projects, record decisions and maintain an auditable review history.'
    },
    datasets: {
      title: 'Dataset Management',
      description: 'Upload, organise and publish datasets for the Celerity Dataset Hub.'
    },
    competitions: {
      title: 'Competition Management',
      description: 'Create challenges, upload datasets and manage competition schedules.'
    }
  }[activeTab];

  return (
    <main className="admin-shell">
      {preview && <div className="admin-alert" role="status"><strong>LOCAL PREVIEW</strong> | Read-only visual check. No administrator data or API actions are enabled.</div>}
      <header className="admin-header">
        <div>
          <a className="admin-brand" href="/">CELERITY NETWORKS</a>
          <h1>{tabHeading.title}</h1>
          <p>{tabHeading.description}</p>
        </div>

        <div className="admin-account">
          <span>Signed in as</span>
          <strong>{preview ? 'Local visual preview' : (adminEmail || 'Administrator')}</strong>
          <a href="/">Back to website</a>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Administration sections">
        <button type="button" className={activeTab === 'reviews' ? 'active' : ''} onClick={() => setActiveTab('reviews')}>
          Submission Reviews
        </button>
        <button type="button" className={activeTab === 'datasets' ? 'active' : ''} onClick={() => setActiveTab('datasets')}>
          Dataset Management
        </button>
        <button type="button" className={activeTab === 'competitions' ? 'active' : ''} onClick={() => setActiveTab('competitions')}>
          Competition Management
        </button>
      </nav>

      {activeTab === 'reviews' && (
        <>
      <section className="admin-summary">
        <div className="admin-summary-card">
          <span>Total submissions</span>
          <strong>{stats.total}</strong>
        </div>
        <div className="admin-summary-card">
          <span>Awaiting review</span>
          <strong>{stats.awaiting_review}</strong>
        </div>
        <div className="admin-summary-card">
          <span>Shortlisted</span>
          <strong>{stats.shortlisted}</strong>
        </div>
        <div className="admin-summary-card">
          <span>Winners</span>
          <strong>{stats.winners}</strong>
        </div>
        <div className="admin-summary-card">
          <span>Reviewed</span>
          <strong>{stats.reviewed}</strong>
        </div>
      </section>

      {error && <div className="admin-alert admin-alert-error" role="alert">{error}</div>}
      {notice && <div className="admin-alert admin-alert-success" role="status">{notice}</div>}

      <section className="admin-workspace">
        <div className="admin-list-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Project submissions</h2>
              <p>Select a submission to inspect and review it.</p>
            </div>
            <button type="button" onClick={loadSubmissions} disabled={preview || listLoading}>
              {listLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="admin-filter-row">
            <label className="admin-filter">
              Filter by competition
              <select
                value={competitionFilter}
                onChange={event => setCompetitionFilter(event.target.value)}
                disabled={preview}
              >
                <option value="">All competitions</option>
                {competitions.map(competition => (
                  <option value={competition.id} key={competition.id}>
                    {competition.title} ({competition.status})
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-filter">
              Filter by status
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
                disabled={preview}
              >
                <option value="">All statuses</option>
                {STATUSES.map(status => (
                  <option value={status} key={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listLoading ? (
            <p className="admin-empty">Loading submissions...</p>
          ) : submissions.length === 0 ? (
            <p className="admin-empty">{preview ? 'Preview mode: submissions will appear here when real participants submit projects.' : 'No submissions found for this filter.'}</p>
          ) : (
            <div className="admin-submission-list">
              {submissions.map(submission => (
                <button
                  type="button"
                  className={`admin-submission-item ${selected?.id === submission.id ? 'active' : ''}`}
                  key={submission.id}
                  onClick={() => selectSubmission(submission)}
                >
                  <span className="admin-submission-top">
                    <strong>{submission.participant_name}</strong>
                    <span className={`admin-status status-${submission.status}`}>
                      {STATUS_LABELS[submission.status] || submission.status}
                    </span>
                  </span>
                  <span>{submission.competition_title || 'Competition'}</span>
                  <span className="admin-submission-meta">
                    Score: {submission.score ?? 'Not scored'} Ã‚Â· Reviews: {submission.review_count ?? 0}
                  </span>
                  <span className="admin-submission-meta">
                    Submitted: {formatDate(submission.submitted_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="admin-detail-panel">
          {!selected ? (
            <div className="admin-empty admin-detail-empty">
              <h2>No submission selected</h2>
              <p>Choose a participant submission from the list to view its repository and review details.</p>
            </div>
          ) : (
            <>
              <section className="admin-detail-section">
                <div className="admin-panel-heading">
                  <div>
                    <span className="admin-eyebrow">SUBMISSION DETAILS</span>
                    <h2>{selected.participant_name}</h2>
                  </div>
                  <span className={`admin-status status-${selected.status}`}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                </div>

                <dl className="admin-detail-grid">
                  <div>
                    <dt>Email</dt>
                    <dd>{selected.participant_email}</dd>
                  </div>
                  <div>
                    <dt>Competition</dt>
                    <dd>{selected.competition_title || 'Not available'}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatDate(selected.submitted_at)}</dd>
                  </div>
                  <div>
                    <dt>Previous review count</dt>
                    <dd>{selected.review_count ?? 0}</dd>
                  </div>
                </dl>

                <a
                  className="admin-repository-link"
                  href={selected.repository_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Inspect GitHub repository Ã¢â€ â€”
                </a>

                <p className="admin-declaration-note">
                  Ownership declaration: {selected.ownership_confirmed ? 'Confirmed' : 'Not confirmed'}.
                  Public repository declaration: {selected.public_repository_confirmed ? 'Confirmed' : 'Not confirmed'}.
                </p>
              </section>

              <section className="admin-detail-section">
                <span className="admin-eyebrow">REVIEW DECISION</span>
                <h2>Record assessment</h2>

                <form className="admin-review-form" onSubmit={saveReview}>
                  <label>
                    Score (0Ã¢â‚¬â€œ100)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={form.score}
                      onChange={event => updateForm('score', event.target.value)}
                      required
                      disabled={preview || saving}
                    />
                  </label>

                  <label>
                    Review status
                    <select
                      value={form.status}
                      onChange={event => updateForm('status', event.target.value)}
                      disabled={preview || saving}
                    >
                      {STATUSES.map(status => (
                        <option value={status} key={status}>{STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Feedback for participant
                    <textarea
                      rows="5"
                      maxLength="5000"
                      value={form.feedback}
                      onChange={event => updateForm('feedback', event.target.value)}
                      placeholder="Provide clear, constructive feedback."
                      disabled={preview || saving}
                    />
                  </label>

                  <label>
                    Reason for this administrative change
                    <textarea
                      rows="3"
                      minLength="10"
                      maxLength="1000"
                      value={form.reason}
                      onChange={event => updateForm('reason', event.target.value)}
                      placeholder="Explain why this score, status or feedback is being recorded."
                      required
                      disabled={preview || saving}
                    />
                    <small>Required for the audit trail. Enter at least 10 characters.</small>
                  </label>

                  <button className="admin-save-button" type="submit" disabled={preview || saving}>
                    {saving ? 'Saving review...' : 'Save review and record history'}
                  </button>
                </form>
              </section>

              <section className="admin-detail-section">
                <div className="admin-panel-heading">
                  <div>
                    <span className="admin-eyebrow">IMMUTABLE AUDIT RECORD</span>
                    <h2>Review history</h2>
                  </div>
                  <span className="admin-history-count">{reviews.length} record(s)</span>
                </div>

                {historyLoading ? (
                  <p className="admin-empty">Loading review history...</p>
                ) : reviews.length === 0 ? (
                  <p className="admin-empty">No review history has been recorded yet.</p>
                ) : (
                  <div className="admin-history-list">
                    {reviews.map(review => (
                      <article className="admin-history-item" key={review.id}>
                        <div className="admin-history-top">
                          <strong>{review.reviewer_email}</strong>
                          <time>{formatDate(review.created_at)}</time>
                        </div>
                        <p>Score: {review.previous_score ?? 'None'} Ã¢â€ â€™ {review.new_score ?? 'None'}</p>
                        <p>
                          Status: {STATUS_LABELS[review.previous_status] || review.previous_status || 'None'}
                          {' Ã¢â€ â€™ '}
                          {STATUS_LABELS[review.new_status] || review.new_status || 'None'}
                        </p>
                        <p><b>Reason:</b> {review.reason}</p>
                        <p>
  <b>Feedback:</b>
  {' '}
  {review.previous_feedback || 'None'}
  {' to '}
  {review.new_feedback || 'None'}
</p>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
        </>
      )}

      {activeTab === 'datasets' && <DatasetManagement preview={preview} />}

      {activeTab === 'competitions' && <CompetitionManagement preview={preview} />}
    </main>
  );
}
