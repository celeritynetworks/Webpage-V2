import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Mail
} from 'lucide-react';
import './competition-registration.css';

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

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function CompetitionRegistration() {
  const slug = new URLSearchParams(window.location.search).get('slug') || '';

  const [competition, setCompetition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const [stage, setStage] = useState('register');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [resendMessage, setResendMessage] = useState('');

  const [verificationCode, setVerificationCode] = useState('');
  const [participant, setParticipant] = useState(null);

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    organization: '',
    website: ''
  });

  useEffect(() => {
    let cancelled = false;

    async function loadCompetition() {
      if (!slug) {
        setPageError(
          'No competition was selected. Please return to the competitions page.'
        );
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/competitions');

        if (!response.ok) {
          throw new Error('Unable to load competitions.');
        }

        const data = await response.json();

        const selected = (data.competitions || []).find(
          item => item.slug === slug
        );

        if (!selected) {
          throw new Error('This competition could not be found.');
        }

        if (!cancelled) {
          setCompetition(selected);
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err.message || 'Unable to load this competition.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCompetition();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm(previous => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');
    setSuccess('');
    setResendMessage('');

    if (!competition || !['upcoming', 'active'].includes(competition.status)) {
      setError('This competition is not currently accepting registrations.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/competitions/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug,
          full_name: form.full_name,
          email: form.email.trim().toLowerCase(),
          phone: form.phone,
          organization: form.organization,
          website: form.website
        })
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error || 'Registration could not be completed.'
        );
      }

      if (data.verification_required || response.status === 202) {
        setStage('verify');
        setVerificationCode('');
        setSuccess(
          data.message ||
          'A verification code has been sent to your email address.'
        );
      } else {
        setStage('complete');
        setSuccess(data.message || 'Your registration was successful.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();

    setError('');
    setResendMessage('');

    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Please enter the six-digit verification code.');
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch('/api/competitions/verification/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug,
          email: form.email.trim().toLowerCase(),
          code: verificationCode
        })
      });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error || 'Verification failed. Please check your code.'
        );
      }

      setSuccess(
        data.message || 'Your email has been verified successfully.'
      );

      setStage('complete');

      // The verification endpoint sets the HttpOnly session cookie.
      // The browser sends it automatically with this same-origin request.
      try {
        const profileResponse = await fetch(
          '/api/competitions/participant/me',
          {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store'
          }
        );

        const profileData = await readResponse(profileResponse);

        if (profileResponse.ok && profileData.authenticated) {
          setParticipant(profileData.participant || null);
        }
      } catch (profileError) {
        console.error('Unable to load participant profile:', profileError);
      }
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError('');
    setResendMessage('');
    setResending(true);

    try {
      const response = await fetch(
        '/api/competitions/verification/resend',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            slug,
            email: form.email.trim().toLowerCase()
          })
        }
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to process your request. Please try again.'
        );
      }

      setResendMessage(
        data.message ||
        'If your registration is eligible, a new code will be sent.'
      );
    } catch (err) {
      setError(err.message || 'Unable to request another code.');
    } finally {
      setResending(false);
    }
  }

  const registrationOpen = competition &&
    ['upcoming', 'active'].includes(competition.status);

  return (
    <div className="competition-registration-page">
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

      <main className="competition-registration-main">
        <a className="competition-registration-back" href="/competitions">
          <ArrowLeft size={16} />
          Back to competitions
        </a>

        {loading ? (
          <div className="competition-registration-message">
            <LoaderCircle
              className="registration-spinner"
              size={22}
            />
            Loading competition details...
          </div>
        ) : pageError ? (
          <div className="competition-registration-message registration-error">
            <AlertCircle size={20} />
            {pageError}
          </div>
        ) : (
          <div className="competition-registration-layout">
            <section className="competition-registration-intro">
              <span className="competition-registration-eyebrow">
                CELERITY NETWORKS CHALLENGE SERIES
              </span>

              <h1>
                Take the challenge.
                <br />
                <em>Show what you can do.</em>
              </h1>

              <p>
                Complete your registration to participate in this Celerity
                Networks competition. We look forward to seeing your work.
              </p>

              <div className="registration-selected-competition">
                <span>SELECTED COMPETITION</span>
                <h2>{competition.title}</h2>
                <p>{competition.description}</p>

                <div className="registration-competition-facts">
                  <div>
                    <small>Industry</small>
                    <strong>
                      {competition.industry_name || 'General'}
                    </strong>
                  </div>

                  <div>
                    <small>Difficulty</small>
                    <strong>
                      {competition.difficulty || 'To be announced'}
                    </strong>
                  </div>

                  <div>
                    <small>Competition starts</small>
                    <strong>{formatDate(competition.starts_at)}</strong>
                  </div>

                  <div>
                    <small>Registration closes</small>
                    <strong>
                      {formatDate(competition.registration_closes_at)}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="competition-registration-card">
              {stage === 'register' && (
                <>
                  <div className="registration-card-heading">
                    <span>PARTICIPANT DETAILS</span>
                    <h2>Competition registration</h2>
                    <p>
                      Enter your details below to secure your place.
                    </p>
                  </div>

                  {error && (
                    <div
                      className="registration-feedback registration-error"
                      role="alert"
                    >
                      <AlertCircle size={20} />
                      <span>{error}</span>
                    </div>
                  )}

                  {!registrationOpen ? (
                    <div className="registration-closed">
                      Registration is not currently open for this competition.
                      <a href="/competitions">View other competitions</a>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit}>
                      <label htmlFor="competition-full-name">
                        Full name *
                      </label>

                      <input
                        id="competition-full-name"
                        name="full_name"
                        type="text"
                        autoComplete="name"
                        value={form.full_name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        maxLength={120}
                        required
                      />

                      <label htmlFor="competition-email">
                        Email address *
                      </label>

                      <input
                        id="competition-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        maxLength={254}
                        required
                      />

                      <label htmlFor="competition-phone">
                        Phone number *
                      </label>

                      <input
                        id="competition-phone"
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="Enter your phone number"
                        maxLength={30}
                        required
                      />

                      <label htmlFor="competition-organization">
                        Organisation <span>(optional)</span>
                      </label>

                      <input
                        id="competition-organization"
                        name="organization"
                        type="text"
                        autoComplete="organization"
                        value={form.organization}
                        onChange={handleChange}
                        placeholder="Company, school or organisation"
                        maxLength={160}
                      />

                      <div
                        className="registration-honeypot"
                        aria-hidden="true"
                      >
                        <label htmlFor="competition-website">
                          Website
                        </label>

                        <input
                          id="competition-website"
                          name="website"
                          type="text"
                          tabIndex="-1"
                          autoComplete="off"
                          value={form.website}
                          onChange={handleChange}
                        />
                      </div>

                      <button type="submit" disabled={submitting}>
                        {submitting ? (
                          <>
                            Submitting registration
                            <LoaderCircle
                              className="registration-spinner"
                              size={18}
                            />
                          </>
                        ) : (
                          <>
                            Complete registration
                            <ArrowUpRight size={18} />
                          </>
                        )}
                      </button>

                      <p className="registration-privacy-note">
                        Your details will be used to manage your participation
                        in this competition.
                      </p>
                    </form>
                  )}
                </>
              )}

              {stage === 'verify' && (
                <>
                  <div className="registration-card-heading">
                    <span>EMAIL VERIFICATION</span>
                    <h2>Verify your email</h2>
                    <p>
                      We have requested a six-digit verification code for
                      your registration. Enter the code below to confirm
                      your email address.
                    </p>
                  </div>

                  {success && (
                    <div
                      className="registration-feedback registration-success"
                      role="status"
                    >
                      <Mail size={20} />
                      <span>{success}</span>
                    </div>
                  )}

                  {error && (
                    <div
                      className="registration-feedback registration-error"
                      role="alert"
                    >
                      <AlertCircle size={20} />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="registration-email-display">
                    <small>Verification email</small>
                    <strong>{form.email}</strong>
                  </div>

                  <form onSubmit={handleVerify}>
                    <label htmlFor="competition-verification-code">
                      Six-digit verification code
                    </label>

                    <input
                      id="competition-verification-code"
                      name="verification_code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={verificationCode}
                      onChange={event => {
                        setVerificationCode(
                          event.target.value.replace(/\D/g, '').slice(0, 6)
                        );
                      }}
                      placeholder="000000"
                      className="registration-code-input"
                      required
                    />

                    <button
                      type="submit"
                      disabled={verifying || verificationCode.length !== 6}
                    >
                      {verifying ? (
                        <>
                          Verifying email
                          <LoaderCircle
                            className="registration-spinner"
                            size={18}
                          />
                        </>
                      ) : (
                        <>
                          Verify email
                          <CheckCircle2 size={18} />
                        </>
                      )}
                    </button>
                  </form>

                  {resendMessage && (
                    <div
                      className="registration-feedback registration-success"
                      role="status"
                    >
                      <Mail size={20} />
                      <span>{resendMessage}</span>
                    </div>
                  )}

                  <div className="registration-verification-actions">
                    <button
                      type="button"
                      className="registration-text-button"
                      onClick={handleResend}
                      disabled={resending || verifying}
                    >
                      {resending ? (
                        <>
                          Requesting code
                          <LoaderCircle
                            className="registration-spinner"
                            size={16}
                          />
                        </>
                      ) : (
                        'Resend verification code'
                      )}
                    </button>

                    <button
                      type="button"
                      className="registration-text-button"
                      onClick={() => {
                        setStage('register');
                        setError('');
                        setSuccess('');
                        setResendMessage('');
                        setVerificationCode('');
                      }}
                      disabled={verifying || resending}
                    >
                      Change registration details
                    </button>
                  </div>

                  <p className="registration-privacy-note">
                    The verification code expires after 10 minutes. If you
                    cannot find the email, check your spam or junk folder.
                  </p>
                </>
              )}

              {stage === 'complete' && (
                <div className="registration-completion">
                  <div className="registration-completion-icon">
                    <CheckCircle2 size={38} />
                  </div>

                  <span className="registration-completion-eyebrow">
                    REGISTRATION CONFIRMED
                  </span>

                  <h2>Email verified successfully</h2>

                  <p>
                    Your email verification is complete. Your registration
                    for this competition has been confirmed.
                  </p>

                  <div className="registration-completion-details">
                    <div>
                      <small>Participant</small>
                      <strong>
                        {participant?.full_name || form.full_name}
                      </strong>
                    </div>

                    <div>
                      <small>Email address</small>
                      <strong>
                        {participant?.email || form.email}
                      </strong>
                    </div>

                    <div>
                      <small>Competition</small>
                      <strong>
                        {participant?.competition?.title || competition.title}
                      </strong>
                    </div>

                    <div>
                      <small>Registration status</small>
                      <strong className="registration-confirmed-status">
                        Verified
                      </strong>
                    </div>
                  </div>

                  <div className="registration-feedback registration-success">
                    <CheckCircle2 size={20} />
                    <span>
                      You can now participate in this competition using your
                      verified registration.
                    </span>
                  </div>

                  <a
                    className="registration-completion-link"
                    href="/participant-dashboard"
                  >
                    Go to participant dashboard
                    <ArrowUpRight size={17} />
                  </a>

                  <a
                    className="registration-completion-link"
                    href="/competitions"
                  >
                    Return to competitions
                    <ArrowUpRight size={17} />
                  </a>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="competition-registration-footer">
        © {new Date().getFullYear()} Celerity Networks Ltd. All rights reserved.
      </footer>
    </div>
  );
}
