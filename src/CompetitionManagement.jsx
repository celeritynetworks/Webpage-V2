import React from 'react';
import './CompetitionManagement.css';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'zip', 'json', 'parquet'];

function makeSlug(value) {
  return value.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

export default function CompetitionManagement({ preview = false }) {
  const [industries, setIndustries] = React.useState([]);
  const [competitions, setCompetitions] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);

  const [form, setForm] = React.useState({
    title: '',
    slug: '',
    description: '',
    industry_id: '',
    difficulty: 'Beginner',
    instructions: '',
    record_count: '',
    registration_opens_at: '',
    registration_closes_at: '',
    starts_at: '',
    ends_at: '',
    status: 'draft',
    file: null
  });

  const updateForm = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const loadData = React.useCallback(async () => {
    if (preview) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [industryResponse, competitionResponse] = await Promise.all([
        fetch('/api/industries', {
          credentials: 'same-origin',
          cache: 'no-store'
        }),
        fetch('/api/admin/competitions', {
          credentials: 'same-origin',
          cache: 'no-store'
        })
      ]);

      const industryData = await industryResponse.json();
      const competitionData = await competitionResponse.json();

      if (!industryResponse.ok || !industryData.ok) {
        throw new Error(industryData.message || 'Unable to load industries.');
      }

      if (!competitionResponse.ok || !competitionData.success) {
        throw new Error(competitionData.message || 'Unable to load competitions.');
      }

      setIndustries(industryData.industries || []);
      setCompetitions(competitionData.competitions || []);

      if (!form.industry_id && industryData.industries?.length) {
        setForm(current => ({
          ...current,
          industry_id: industryData.industries[0].id
        }));
      }
    } catch (err) {
      setError(err.message || 'Unable to load Competition Management.');
    } finally {
      setLoading(false);
    }
  }, [preview]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTitleChange = value => {
    setForm(current => ({
      ...current,
      title: value,
      slug: slugTouched ? current.slug : makeSlug(value)
    }));
  };

  const handleFileChange = event => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      updateForm('file', null);
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError('Unsupported format. Use CSV, XLSX, XLS, ZIP, JSON or Parquet.');
      event.target.value = '';
      updateForm('file', null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError('The maximum upload size is 50 MB.');
      event.target.value = '';
      updateForm('file', null);
      return;
    }

    setError('');
    updateForm('file', file);
  };

  const handleSubmit = async event => {
    event.preventDefault();

    if (preview || uploading) return;

    setError('');
    setMessage('');

    if (!form.file) {
      setError('Please select a competition dataset or challenge package.');
      return;
    }

    if (!form.starts_at || !form.ends_at) {
      setError('Enter the competition start and end dates.');
      return;
    }

    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      setError('Competition end date must be after its start date.');
      return;
    }

    if (
      form.registration_opens_at &&
      form.registration_closes_at &&
      new Date(form.registration_closes_at) <= new Date(form.registration_opens_at)
    ) {
      setError('Registration closing must be after registration opening.');
      return;
    }

    const payload = new FormData();

    payload.append('title', form.title);
    payload.append('slug', form.slug);
    payload.append('description', form.description);
    payload.append('industry_id', form.industry_id);
    payload.append('difficulty', form.difficulty);
    payload.append('instructions', form.instructions);
    payload.append('record_count', form.record_count);
    payload.append(
      'registration_opens_at',
      form.registration_opens_at ? new Date(form.registration_opens_at).toISOString() : ''
    );
    payload.append(
      'registration_closes_at',
      form.registration_closes_at ? new Date(form.registration_closes_at).toISOString() : ''
    );
    payload.append('starts_at', new Date(form.starts_at).toISOString());
    payload.append('ends_at', new Date(form.ends_at).toISOString());
    payload.append('status', form.status);
    payload.append('file', form.file);

    setUploading(true);

    try {
      const response = await fetch('/api/admin/competitions', {
        method: 'POST',
        credentials: 'same-origin',
        body: payload
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Competition upload failed.');
      }

      setMessage(result.message || 'Competition saved successfully.');
      setSlugTouched(false);

      setForm({
        title: '',
        slug: '',
        description: '',
        industry_id: form.industry_id,
        difficulty: 'Beginner',
        instructions: '',
        record_count: '',
        registration_opens_at: '',
        registration_closes_at: '',
        starts_at: '',
        ends_at: '',
        status: 'draft',
        file: null
      });

      const fileInput = document.getElementById('competition-upload-file');
      if (fileInput) fileInput.value = '';

      await loadData();
    } catch (err) {
      setError(err.message || 'Competition upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="competition-admin">
      {preview && (
        <div className="competition-alert competition-alert-success" role="status">
          <strong>LOCAL PREVIEW</strong> | Read-only visual check. No competition API, database or file storage requests will be made.
        </div>
      )}

      <div className="competition-admin-heading">

        <button
          type="button"
          className="competition-refresh-button"
          onClick={loadData}
          disabled={preview || loading}
        >
          {loading ? 'Loading...' : 'Refresh records'}
        </button>
      </div>

      {error && <div className="competition-alert competition-alert-error" role="alert">{error}</div>}
      {message && <div className="competition-alert competition-alert-success" role="status">{message}</div>}

      <div className="competition-admin-grid">
        <form className="competition-upload-panel" onSubmit={handleSubmit}>
          <fieldset disabled={preview || uploading} className="competition-form-fieldset">
            <h3>Create a competition</h3>
            <p className="competition-form-intro">
              Add the challenge information, schedule and dataset package.
            </p>

            <label htmlFor="competition-title">Competition title</label>
            <input
              id="competition-title"
              value={form.title}
              onChange={event => handleTitleChange(event.target.value)}
              maxLength={150}
              required
            />

            <label htmlFor="competition-slug">URL slug</label>
            <input
              id="competition-slug"
              value={form.slug}
              onChange={event => {
                setSlugTouched(true);
                updateForm('slug', makeSlug(event.target.value));
              }}
              maxLength={140}
              required
            />
            <small>Used in the competition URL. Use lowercase letters, numbers and hyphens.</small>

            <label htmlFor="competition-description">Competition description</label>
            <textarea
              id="competition-description"
              value={form.description}
              onChange={event => updateForm('description', event.target.value)}
              rows={4}
              maxLength={3000}
              required
            />

            <label htmlFor="competition-industry">Industry</label>
            <select
              id="competition-industry"
              value={form.industry_id}
              onChange={event => updateForm('industry_id', event.target.value)}
            >
              <option value="">General / cross-industry</option>
              {industries.map(industry => (
                <option key={industry.id} value={industry.id}>{industry.name}</option>
              ))}
            </select>

            <label htmlFor="competition-difficulty">Difficulty level</label>
            <select
              id="competition-difficulty"
              value={form.difficulty}
              onChange={event => updateForm('difficulty', event.target.value)}
            >
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Professional</option>
            </select>

            <label htmlFor="competition-instructions">Challenge instructions</label>
            <textarea
              id="competition-instructions"
              value={form.instructions}
              onChange={event => updateForm('instructions', event.target.value)}
              rows={8}
              maxLength={10000}
              placeholder="Explain the business scenario, tasks, deliverables, submission requirements and evaluation criteria."
              required
            />

            <label htmlFor="competition-records">Approximate number of records (optional)</label>
            <input
              id="competition-records"
              type="number"
              min="0"
              step="1"
              value={form.record_count}
              onChange={event => updateForm('record_count', event.target.value)}
            />

            <h4 className="competition-form-section-title">Competition schedule</h4>

            <label htmlFor="competition-registration-opens">Registration opens</label>
            <input
              id="competition-registration-opens"
              type="datetime-local"
              value={form.registration_opens_at}
              onChange={event => updateForm('registration_opens_at', event.target.value)}
            />

            <label htmlFor="competition-registration-closes">Registration closes</label>
            <input
              id="competition-registration-closes"
              type="datetime-local"
              value={form.registration_closes_at}
              onChange={event => updateForm('registration_closes_at', event.target.value)}
            />

            <div className="competition-form-row">
              <div>
                <label htmlFor="competition-starts">Competition starts</label>
                <input
                  id="competition-starts"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={event => updateForm('starts_at', event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="competition-ends">Competition ends</label>
                <input
                  id="competition-ends"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={event => updateForm('ends_at', event.target.value)}
                  required
                />
              </div>
            </div>

            <label htmlFor="competition-status">Publication status</label>
            <select
              id="competition-status"
              value={form.status}
              onChange={event => updateForm('status', event.target.value)}
            >
              <option value="draft">Save as draft</option>
              <option value="upcoming">Publish as upcoming</option>
            </select>

            <label htmlFor="competition-upload-file">Challenge dataset / package</label>
            <input
              id="competition-upload-file"
              type="file"
              accept=".csv,.xlsx,.xls,.zip,.json,.parquet"
              onChange={handleFileChange}
              required
            />
            <small>
              Maximum size: 50 MB. ZIP is recommended for a dataset with a data dictionary, README or supporting files.
            </small>

            {form.file && (
              <div className="competition-selected-file">
                <strong>{form.file.name}</strong>
                <span>{formatBytes(form.file.size)}</span>
              </div>
            )}

            <button
              className="competition-submit-button"
              type="submit"
              disabled={uploading}
            >
              {uploading
                ? 'Uploading competition...'
                : form.status === 'upcoming'
                  ? 'Upload and publish competition'
                  : 'Upload and save draft'}
            </button>
          </fieldset>
        </form>

        <div className="competition-records-panel">
          <div className="competition-records-heading">
            <div>
              <h3>Existing competitions</h3>
              <p>{competitions.length} competition record(s)</p>
            </div>
          </div>

          {loading ? (
            <p className="competition-empty-state">Loading competition records...</p>
          ) : preview ? (
            <p className="competition-empty-state">
              Existing competitions will appear here when the authenticated admin API is connected.
            </p>
          ) : competitions.length === 0 ? (
            <p className="competition-empty-state">No competitions have been created yet.</p>
          ) : (
            <div className="competition-record-list">
              {competitions.map(competition => (
                <article className="competition-record-card" key={competition.id}>
                  <div className="competition-record-top">
                    <h4>{competition.title}</h4>
                    <span className={`competition-status competition-status-${competition.status}`}>
                      {competition.status}
                    </span>
                  </div>

                  <p className="competition-record-description">{competition.description}</p>

                  <div className="competition-record-meta">
                    <span><strong>Industry:</strong> {competition.industry_name || 'General'}</span>
                    <span><strong>Level:</strong> {competition.difficulty}</span>
                    <span><strong>Records:</strong> {competition.record_count == null ? 'Not specified' : Number(competition.record_count).toLocaleString()}</span>
                    <span><strong>Dataset:</strong> {competition.dataset_file_name}</span>
                    <span><strong>Size:</strong> {formatBytes(competition.dataset_file_size_bytes)}</span>
                    <span><strong>Participants:</strong> {Number(competition.participant_count || 0).toLocaleString()}</span>
                    <span><strong>Submissions:</strong> {Number(competition.submission_count || 0).toLocaleString()}</span>
                    <span><strong>Registration opens:</strong> {formatDate(competition.registration_opens_at)}</span>
                    <span><strong>Registration closes:</strong> {formatDate(competition.registration_closes_at)}</span>
                    <span><strong>Starts:</strong> {formatDate(competition.starts_at)}</span>
                    <span><strong>Ends:</strong> {formatDate(competition.ends_at)}</span>
                    <span><strong>Created:</strong> {formatDate(competition.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
