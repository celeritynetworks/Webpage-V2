import React, { useEffect, useState } from 'react';
import { Search, Database, Download, ChevronLeft, ChevronRight, Filter, CheckCircle2, ArrowLeft } from 'lucide-react';
import './dataset-hub.css';

const difficulties = ['All Levels', 'Beginner', 'Intermediate', 'Professional'];

export default function DatasetCatalog() {
  const [industries, setIndustries] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [industry, setIndustry] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, limit: 12, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/industries')
      .then(response => {
        if (!response.ok) throw new Error('Could not load industries');
        return response.json();
      })
      .then(data => setIndustries(data.industries || []))
      .catch(() => setError('Unable to load industry categories.'));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDatasets() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '12'
        });

        if (industry) params.set('industry', industry);
        if (difficulty) params.set('difficulty', difficulty);
        if (search.trim()) params.set('q', search.trim());

        const response = await fetch(`/api/datasets?${params.toString()}`);
        if (!response.ok) throw new Error('Could not load datasets');

        const data = await response.json();

        if (!cancelled) {
          setDatasets(data.datasets || []);
          setPagination(data.pagination || { total: 0, limit: 12, totalPages: 1 });
        }
      } catch {
        if (!cancelled) setError('We could not load the datasets. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDatasets();
    return () => { cancelled = true; };
  }, [industry, difficulty, search, page]);

  const formatSize = value => {
    if (value === null || value === undefined || value === '') return 'Size not specified';

    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Size not specified';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatRecords = value => {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toLocaleString()} records` : 'Record count not specified';
  };

  return (
    <main className="dataset-page">
      <header className="dataset-hub-header">
        <a href="/" className="dataset-hub-brand"><img src="/celerity-logo.png" alt="Celerity Networks" /><span><strong>Celerity Networks Ltd</strong><small>TECHNOLOGY · TRAINING · SOLUTIONS</small></span></a>
        <nav className="celerity-page-nav" aria-label="Main navigation">
          <a href="/">Home</a>
          <a href="/what-we-do">What We Do</a>
          <a href="/datasets" aria-current="page">Datasets</a>
          <a href="/competitions">Competitions</a>
          <a href="/about">About Us</a>
        </nav>
      </header>
      <section className="dataset-hero">
        <div className="dataset-hero-inner">
          <span className="dataset-eyebrow">CELERITY NETWORKS RESOURCE HUB</span>
          <h1>Explore datasets. Build real-world skills.</h1>
          <p>
            Access practical datasets across different industries.
            Learn, practise, and develop the confidence to work with real-world data.
          </p>
          <div className="dataset-search">
            <Search size={20} />
            <input
              type="search"
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search datasets by name or keyword..."
              aria-label="Search datasets"
            />
          </div>
        </div>
      </section>

      <section className="dataset-content">
        <div className="dataset-heading">
          <div>
            <span className="dataset-eyebrow">DATASET LIBRARY</span>
            <h2>Find your next practice dataset</h2>
            <p>Choose an industry and a difficulty level that matches your learning goals.</p>
          </div>
          <div className="dataset-total">
            <Database size={20} />
            <span>{Number(pagination.total || 0).toLocaleString()} datasets</span>
          </div>
        </div>

        <div className="dataset-filters">
          <div className="dataset-filter-label"><Filter size={17} /> Filter datasets</div>

          <label>
            <span>Industry</span>
            <select value={industry} onChange={event => { setIndustry(event.target.value); setPage(1); }}>
              <option value="">All industries</option>
              {industries.map(item => (
                <option key={item.id || item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Difficulty</span>
            <select value={difficulty} onChange={event => { setDifficulty(event.target.value); setPage(1); }}>
              <option value="">All levels</option>
              {difficulties.slice(1).map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>

          {(industry || difficulty || search) && (
            <button
              className="dataset-clear"
              onClick={() => { setIndustry(''); setDifficulty(''); setSearch(''); setPage(1); }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && <div className="dataset-message dataset-error">{error}</div>}

        {loading ? (
          <div className="dataset-message">Loading datasets...</div>
        ) : datasets.length === 0 ? (
          <div className="dataset-empty">
            <Database size={38} />
            <h3>No datasets available yet</h3>
            <p>
              {search || industry || difficulty
                ? 'Try changing your search or filters.'
                : 'New datasets will appear here as they are published.'}
            </p>
          </div>
        ) : (
          <>
            <div className="dataset-grid">
              {datasets.map(item => (
                <article className="dataset-card" key={item.id || item.slug}>
                  <div className="dataset-card-image">
                    {item.thumbnail_url ? <img src={item.thumbnail_url} alt={`${item.title} dataset thumbnail`} loading="lazy" /> : <div className="dataset-card-image-placeholder"><Database size={38} /><span>CELERITY DATASET</span></div>}
                    <span className="dataset-image-level">{item.difficulty || 'Beginner'}</span>
                  </div>
                  <div className="dataset-card-body">
                  <div className="dataset-card-top">
                    <span className="dataset-industry">{item.industry_name || item.industry || 'General'}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="dataset-description">
                    {item.description || 'A practical dataset for developing data analysis skills.'}
                  </p>
                  {Array.isArray(item.learning_objectives) && item.learning_objectives.length > 0 && <div className="dataset-objectives"><strong>What you will practise</strong><ul>{item.learning_objectives.slice(0, 3).map((objective, index) => <li key={`${item.id}-objective-${index}`}><CheckCircle2 size={15} />{objective}</li>)}</ul></div>}
                  <div className="dataset-meta">
                    <span>{formatRecords(item.record_count)}</span>
                    <span>{item.file_format || item.format || 'Dataset'}</span>
                    <span>{formatSize(item.file_size_bytes)}</span>
                  </div>
                  <div className="dataset-card-footer">
                    <span>{item.download_count || 0} downloads</span>
                    <a
                      className="dataset-download-soon"
                      href={`/api/datasets/${encodeURIComponent(item.slug)}/download`}
                      aria-label={`Download ${item.title}`}
                    >
                      <Download size={16} /> Download
                    </a>
                  </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="dataset-pagination">
              <button
                onClick={() => setPage(current => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft size={17} /> Previous
              </button>
              <span>Page {page} of {pagination.totalPages || 1}</span>
              <button
                onClick={() => setPage(current => current + 1)}
                disabled={page >= (pagination.totalPages || 1)}
              >
                Next <ChevronRight size={17} />
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
