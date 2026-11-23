
import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Mail,
  LockKeyhole
} from 'lucide-react';
import './competition-registration.css';
import './participant-login.css';

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function ParticipantLogin() {
  const params = new URLSearchParams(window.location.search);

  const [slug, setSlug] = useState(params.get('slug') || '');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('email');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function requestCode(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const cleanSlug = slug.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanSlug || !cleanEmail) {
      setError('Please enter your competition slug and registered email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/competitions/participant/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug: cleanSlug,
          email: cleanEmail
        })
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Unable to request a sign-in code.');
      }

      setSlug(cleanSlug);
      setEmail(cleanEmail);
      setStage('code');
      setMessage(
        data.message ||
        'If your participant account exists, a sign-in code will be sent to your email.'
      );
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!/^\d{6}$/.test(code)) {
      setError('Please enter the six-digit sign-in code.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        '/api/competitions/participant/login/verify',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            slug: slug.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
            code
          })
        }
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(data.error || 'Sign-in failed. Please check your code.');
      }

      setMessage('Sign-in successful. Opening your participant dashboard...');

      window.location.assign('/participant-dashboard');
    } catch (err) {
      setError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="competition-registration-page participant-login-page">
      <header className="header">
        <div className="container nav-wrap">
          <a className="brand" href="/">
            <img
              src="/celerity-logo.png"
              alt="Celerity Networks official logo"
            />
            <span className="brand-copy">
              <strong>Celerity Networks</strong>
              <small>Technology | Training | Solutions</small>
            </span>
          </a>

          <nav className="competition-registration-nav">
            <a href="/">Home</a>
            <a href="/competitions">Competitions</a>
          </nav>
        </div>
      </header>

      <main className="participant-login-main">
        <a className="competition-registration-back" href="/competitions">
          <ArrowLeft size={16} />
          Back to competitions
        </a>

        <div className="participant-login-layout">
          <section className="participant-login-intro">
            <span className="competition-registration-eyebrow">
              CELERITY NETWORKS CHALLENGE SERIES
            </span>

            <h1>
              Welcome back.
              <br />
              <em>Your challenge continues.</em>
            </h1>

            <p>
              Sign in to access your competition profile, track your
              participation and view your submission status.
            </p>

            <div className="participant-login-benefits">
              <div>
                <CheckCircle2 size={19} />
                <span>Access your participant dashboard</span>
              </div>
              <div>
                <CheckCircle2 size={19} />
                <span>Review your competition details</span>
              </div>
              <div>
                <CheckCircle2 size={19} />
                <span>Track your submission status</span>
              </div>
            </div>
          </section>

          <section className="participant-login-card">
            {stage === 'email' ? (
              <>
                <div className="registration-card-heading">
                  <span>PARTICIPANT ACCOUNT</span>
                  <h2>Sign in</h2>
                  <p>
                    Enter the competition slug and the email address you
                    used when registering. We will send you a secure code.
                  </p>
                </div>

                {error && (
                  <div className="registration-feedback registration-error" role="alert">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={requestCode}>
                  <label htmlFor="participant-login-slug">
                    Competition slug *
                  </label>
                  <input
                    id="participant-login-slug"
                    type="text"
                    value={slug}
                    onChange={event => setSlug(event.target.value)}
                    placeholder="Enter the competition slug"
                    maxLength={120}
                    required
                  />

                  <label htmlFor="participant-login-email">
                    Registered email address *
                  </label>
                  <input
                    id="participant-login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    maxLength={254}
                    required
                  />

                  <button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        Requesting sign-in code
                        <LoaderCircle className="registration-spinner" size={18} />
                      </>
                    ) : (
                      <>
                        Send sign-in code
                        <Mail size={18} />
                      </>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="registration-card-heading">
                  <span>EMAIL SIGN-IN</span>
                  <h2>Enter your code</h2>
                  <p>
                    Enter the six-digit code sent to your registered email
                    address to access your participant account.
                  </p>
                </div>

                <div className="registration-email-display">
                  <small>Sign-in email</small>
                  <strong>{email}</strong>
                </div>

                {message && (
                  <div className="registration-feedback registration-success" role="status">
                    <Mail size={20} />
                    <span>{message}</span>
                  </div>
                )}

                {error && (
                  <div className="registration-feedback registration-error" role="alert">
                    <AlertCircle size={20} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={verifyCode}>
                  <label htmlFor="participant-login-code">
                    Six-digit sign-in code
                  </label>

                  <input
                    id="participant-login-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={event =>
                      setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    className="registration-code-input"
                    required
                  />

                  <button type="submit" disabled={loading || code.length !== 6}>
                    {loading ? (
                      <>
                        Signing in
                        <LoaderCircle className="registration-spinner" size={18} />
                      </>
                    ) : (
                      <>
                        Verify and sign in
                        <LockKeyhole size={18} />
                      </>
                    )}
                  </button>
                </form>

                <div className="participant-login-actions">
                  <button
                    type="button"
                    className="registration-text-button"
                    onClick={() => {
                      setStage('email');
                      setCode('');
                      setError('');
                      setMessage('');
                    }}
                    disabled={loading}
                  >
                    Change email or competition
                  </button>
                </div>

                <p className="registration-privacy-note">
                  Your sign-in code expires after 10 minutes. Check your
                  spam or junk folder if you cannot find the email.
                </p>
              </>
            )}

            <div className="participant-login-register">
              New to this competition?
              <a href={`/competition-register?slug=${encodeURIComponent(slug)}`}>
                Register here <ArrowUpRight size={15} />
              </a>
            </div>
          </section>
        </div>
      </main>

      <footer className="competition-registration-footer">
        © {new Date().getFullYear()} Celerity Networks Ltd. All rights reserved.
      </footer>
    </div>
  );
}
