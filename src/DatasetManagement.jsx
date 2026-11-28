import React from 'react';
import './DatasetManagement.css';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['csv', 'xlsx', 'xls', 'zip', 'json', 'parquet'];

function makeSlug(value) {
  return value
    .toLowerCase()
    .trim()
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
  if (!value) return 'Not available';
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

export default function DatasetManagement({ preview = false }) {
  const [industries, setIndustries] = React.useState([]);
  const [datasets, setDatasets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState('');
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [editingId, setEditingId] = React.useState('');

  const [form, setForm] = React.useState({
    industry_id: '',
    title: '',
    slug: '',
    description: '',
    difficulty: 'Beginner',
    record_count: '',
    column_count: '',
    learning_objectives: '',
    tags: '',
    status: 'draft',
    file: null,
    thumbnail: null
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
      const [industryResponse, datasetResponse] = await Promise.all([
        fetch('/api/industries', {
          credentials: 'same-origin',
          cache: 'no-store'
        }),
        fetch('/api/admin/datasets', {
          credentials: 'same-origin',
          cache: 'no-store'
        })
      ]);

      const industryData = await industryResponse.json();
      const datasetData = await datasetResponse.json();

      if (!industryResponse.ok || !industryData.ok) {
        throw new Error(industryData.message || 'Unable to load industries.');
      }

      if (!datasetResponse.ok || !datasetData.success) {
        throw new Error(datasetData.message || 'Unable to load datasets.');
      }

      setIndustries(industryData.industries || []);
      setDatasets(datasetData.datasets || []);

      if (industryData.industries?.length) {
        setForm(current => ({
          ...current,
          industry_id: current.industry_id || industryData.industries[0].id
        }));
      }
    } catch (err) {
      setError(err.message || 'Unable to load Dataset Management.');
    } finally {
      setLoading(false);
    }
  }, [preview]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async dataset => {
    if (preview || deletingId) return;

    const confirmed = window.confirm(
      `Permanently delete the dataset "${dataset.title}" and its stored file? This cannot be undone.`
    );
    if (!confirmed) return;

    const reason = window.prompt(
      'Enter the reason for deleting this dataset (at least 10 characters):'
    );
    if (reason === null) return;
    if (reason.trim().length < 10 || reason.trim().length > 1000) {
      setError('The audit reason must contain between 10 and 1,000 characters.');
      return;
    }

    setDeletingId(dataset.id);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/admin/datasets', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: dataset.id,
          confirmName: dataset.title,
          reason: reason.trim()
        })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Dataset deletion failed.');
      }
      setMessage(result.message || 'Dataset deleted successfully.');
      await loadData();
    } catch (err) {
      setError(err.message || 'Dataset deletion failed. Please refresh and try again.');
    } finally {
      setDeletingId('');
    }
  };

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
      setError('Unsupported file format. Use CSV, XLSX, XLS, ZIP, JSON or Parquet.');
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
    if (preview) return;
    event.preventDefault();
    setError('');
    setMessage('');

    const objectives = form.learning_objectives
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);

    const tags = form.tags
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    if (objectives.length < 4) {
      setError('Please provide at least four learning objectives, one per line.');
      return;
    }

    if (!form.file && !editingId) {
      setError('Please select a dataset file to upload.');
      return;
    }

    const payload = new FormData();
    payload.append('industry_id', form.industry_id);
    payload.append('title', form.title);
    payload.append('slug', form.slug);
    payload.append('description', form.description);
    payload.append('difficulty', form.difficulty);
    payload.append('record_count', form.record_count);
    payload.append('column_count', form.column_count);
    payload.append('learning_objectives', JSON.stringify(objectives));
    payload.append('tags', JSON.stringify(tags));
    payload.append('status', form.status);
    if (editingId) payload.append('id', editingId);
    if (form.file) payload.append('file', form.file);
    if (form.thumbnail) payload.append('thumbnail', form.thumbnail);

    setUploading(true);

    try {
      const response = await fetch('/api/admin/datasets', {
        method: editingId ? 'PUT' : 'POST',
        credentials: 'same-origin',
        body: payload
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Dataset upload failed.');
      }

      setMessage(result.message || 'Dataset saved successfully.');
      setSlugTouched(false);
      setEditingId('');
      setForm({
        industry_id: form.industry_id,
        title: '',
        slug: '',
        description: '',
        difficulty: 'Beginner',
        record_count: '',
        column_count: '',
        learning_objectives: '',
        tags: '',
        status: 'draft',
        file: null,
        thumbnail: null
      });

      const fileInput = document.getElementById('dataset-upload-file');
      const imageInput = document.getElementById('dataset-thumbnail-file');
      if (fileInput) fileInput.value = '';
      if (imageInput) imageInput.value = '';

      await loadData();
    } catch (err) {
      setError(err.message || 'Dataset upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const editDataset = dataset => {
    setEditingId(dataset.id);
    setSlugTouched(true);
    setError('');
    setMessage(`Editing: ${dataset.title}`);
    setForm({
      industry_id: dataset.industry_id || '', title: dataset.title || '', slug: dataset.slug || '',
      description: dataset.description || '', difficulty: dataset.difficulty || 'Beginner',
      record_count: String(dataset.record_count ?? ''), column_count: String(dataset.column_count ?? ''),
      learning_objectives: Array.isArray(dataset.learning_objectives) ? dataset.learning_objectives.join('\n') : '',
      tags: Array.isArray(dataset.tags) ? dataset.tags.join(', ') : '', status: dataset.status === 'published' ? 'published' : 'draft',
      file: null, thumbnail: null
    });
    document.getElementById('dataset-upload-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelEdit = () => {
    setEditingId('');
    setSlugTouched(false);
    setForm(current => ({ ...current, title: '', slug: '', description: '', difficulty: 'Beginner', record_count: '', column_count: '', learning_objectives: '', tags: '', status: 'draft', file: null, thumbnail: null }));
    const fileInput = document.getElementById('dataset-upload-file');
    const imageInput = document.getElementById('dataset-thumbnail-file');
    if (fileInput) fileInput.value = '';
    if (imageInput) imageInput.value = '';
  };

  return (
    <section className="dataset-admin">
      {preview && <div className="dataset-alert dataset-alert-success" role="status"><strong>LOCAL PREVIEW</strong> | Read-only visual check. No dataset API, database or file storage requests will be made.</div>}
      <div className="dataset-admin-heading">

        <button type="button" className="dataset-refresh-button" onClick={loadData} disabled={preview || loading}>
          {loading ? 'Loading...' : 'Refresh records'}
        </button>
      </div>

      {error && <div className="dataset-alert dataset-alert-error" role="alert">{error}</div>}
      {message && <div className="dataset-alert dataset-alert-success" role="status">{message}</div>}

      <div className="dataset-admin-grid">
        <form id="dataset-upload-panel" className="dataset-upload-panel" onSubmit={handleSubmit}>
          <fieldset disabled={preview || uploading} className="dataset-form-fieldset">
          <h3>{editingId ? 'Edit dataset' : 'Upload a new dataset'}</h3>
          <p className="dataset-form-intro">
            Complete the dataset details and select the file package to upload.
          </p>

          <label htmlFor="dataset-industry">Industry</label>
          <select
            id="dataset-industry"
            value={form.industry_id}
            onChange={event => updateForm('industry_id', event.target.value)}
            required
          >
            <option value="">Select an industry</option>
            {industries.map(industry => (
              <option key={industry.id} value={industry.id}>{industry.name}</option>
            ))}
          </select>

          <label htmlFor="dataset-title">Dataset title</label>
          <input
            id="dataset-title"
            value={form.title}
            onChange={event => handleTitleChange(event.target.value)}
            maxLength={150}
            required
          />

          <label htmlFor="dataset-slug">URL slug</label>
          <input
            id="dataset-slug"
            value={form.slug}
            onChange={event => {
              setSlugTouched(true);
              updateForm('slug', makeSlug(event.target.value));
            }}
            maxLength={140}
            required
          />
          <small>Used in the dataset URL. Use lowercase letters, numbers and hyphens.</small>

          <label htmlFor="dataset-description">Description</label>
          <textarea
            id="dataset-description"
            value={form.description}
            onChange={event => updateForm('description', event.target.value)}
            rows={4}
            maxLength={3000}
            required
          />

          <div className="dataset-form-row">
            <div>
              <label htmlFor="dataset-difficulty">Difficulty</label>
              <select
                id="dataset-difficulty"
                value={form.difficulty}
                onChange={event => updateForm('difficulty', event.target.value)}
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Professional</option>
              </select>
            </div>
            <div>
              <label htmlFor="dataset-status">Publication status</label>
              <select
                id="dataset-status"
                value={form.status}
                onChange={event => updateForm('status', event.target.value)}
              >
                <option value="draft">Save as draft</option>
                <option value="published">Publish immediately</option>
              </select>
            </div>
          </div>

          <div className="dataset-form-row">
            <div>
              <label htmlFor="dataset-records">Number of records</label>
              <input
                id="dataset-records"
                type="number"
                min="0"
                step="1"
                value={form.record_count}
                onChange={event => updateForm('record_count', event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="dataset-columns">Number of columns</label>
              <input
                id="dataset-columns"
                type="number"
                min="0"
                step="1"
                value={form.column_count}
                onChange={event => updateForm('column_count', event.target.value)}
                required
              />
            </div>
          </div>

          <label htmlFor="dataset-objectives">Learning objectives</label>
          <textarea
            id="dataset-objectives"
            value={form.learning_objectives}
            onChange={event => updateForm('learning_objectives', event.target.value)}
            rows={6}
            placeholder={'One objective per line\nClean and prepare the data\nIdentify trends and patterns\nBuild meaningful visualisations\nPresent actionable insights'}
            required
          />
          <small>Enter at least four objectives, one per line.</small>

          <label htmlFor="dataset-tags">Tags</label>
          <input
            id="dataset-tags"
            value={form.tags}
            onChange={event => updateForm('tags', event.target.value)}
            placeholder="Excel, SQL, Power BI, Sales"
          />
          <small>Separate tags with commas.</small>

          <label htmlFor="dataset-thumbnail-file">Dataset thumbnail image</label>
          <input id="dataset-thumbnail-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => updateForm('thumbnail', event.target.files?.[0] || null)} />
          <small>Optional. PNG, JPG or WEBP, maximum 5 MB. A thumbnail makes the dataset easier to recognise.</small>

          <label htmlFor="dataset-upload-file">Dataset file package</label>
          <input
            id="dataset-upload-file"
            type="file"
            accept=".csv,.xlsx,.xls,.zip,.json,.parquet"
            onChange={handleFileChange}
            required={!editingId}
          />
          <small>
            Maximum size: 50 MB. ZIP is recommended when including a data dictionary,
            README or supporting files.
          </small>

          {form.file && (
            <div className="dataset-selected-file">
              <strong>{form.file.name}</strong>
              <span>{formatBytes(form.file.size)}</span>
            </div>
          )}

          <button
            className="dataset-submit-button"
            type="submit"
            disabled={uploading || !industries.length}
          >
            {uploading ? 'Saving dataset...' : editingId ? (form.status === 'published' ? 'Update and publish dataset' : 'Update draft') : form.status === 'published' ? 'Upload and publish dataset' : 'Upload and save draft'}
          </button>
          {editingId && <button type="button" className="dataset-refresh-button" onClick={cancelEdit}>Cancel editing</button>}
          </fieldset>
        </form>

        <div className="dataset-records-panel">
          <div className="dataset-records-heading">
            <div>
              <h3>Uploaded datasets</h3>
              <p>{datasets.length} dataset record(s)</p>
            </div>
          </div>

          {loading ? (
            <p className="dataset-empty-state">Loading dataset records...</p>
          ) : preview ? (
            <p className="dataset-empty-state">Dataset records will appear here when the authenticated admin API is connected.</p>
          ) : datasets.length === 0 ? (
            <p className="dataset-empty-state">No datasets have been uploaded yet.</p>
          ) : (
            <div className="dataset-record-list">
              {datasets.map(dataset => (
                <article className="dataset-record-card" key={dataset.id}>
                  <div className="dataset-record-top">
                    <div className="dataset-record-title">
                      <h4>{dataset.title}</h4>
                      <span className={`dataset-status dataset-status-${dataset.status}`}>
                        {dataset.status}
                      </span>
                    </div>
                    <button type="button" className="dataset-refresh-button" onClick={() => editDataset(dataset)} disabled={preview || Boolean(deletingId)}>Edit</button>
                    <button
                      type="button"
                      className="dataset-delete-button"
                      onClick={() => handleDelete(dataset)}
                      disabled={preview || Boolean(deletingId)}
                    >
                      {deletingId === dataset.id ? 'Deleting...' : 'Delete dataset'}
                    </button>
                  </div>
                  <p className="dataset-record-description">{dataset.description}</p>
                  {dataset.thumbnail_key && <small>Thumbnail image uploaded</small>}
                  <div className="dataset-record-meta">
                    <span><strong>Industry:</strong> {dataset.industry_name}</span>
                    <span><strong>Level:</strong> {dataset.difficulty}</span>
                    <span><strong>Records:</strong> {Number(dataset.record_count || 0).toLocaleString()}</span>
                    <span><strong>Columns:</strong> {Number(dataset.column_count || 0).toLocaleString()}</span>
                    <span><strong>File:</strong> {dataset.file_name}</span>
                    <span><strong>Size:</strong> {formatBytes(dataset.file_size_bytes)}</span>
                    <span><strong>Downloads:</strong> {Number(dataset.download_count || 0).toLocaleString()}</span>
                    <span><strong>Created:</strong> {formatDate(dataset.created_at)}</span>
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
