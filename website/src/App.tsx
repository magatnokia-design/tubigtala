import { useEffect, useState } from 'react';

import logoSymbol from '../../mobile/assets/brand/logo-symbol.svg';
import logoMark from '../../mobile/assets/brand/logo-mark.svg';
import {
  APK_URL, APP_VERSION, DISCLAIMER, features, installSteps, RELEASES_URL, REPO_URL, sensors, steps,
} from './content';

const Icon = ({ name }: { name: string }) => <span className="icon" aria-hidden="true">{name}</span>;

/**
 * Same as the app's launch screen (components/loading-screen.tsx): brand blue, the white logo
 * tile, a spinner. Shown once per visit, then fades into the page.
 */
function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const show = setTimeout(() => setLeaving(true), reduced ? 300 : 1100);
    const done = setTimeout(onDone, reduced ? 350 : 1600);
    return () => { clearTimeout(show); clearTimeout(done); };
  }, [onDone]);
  return (
    <div className={`splash${leaving ? ' splash-leaving' : ''}`} role="status" aria-label="Loading TubigTala">
      <img src={logoSymbol} alt="" className="splash-logo" />
      <div className="spinner" />
    </div>
  );
}

function seenSplash(): boolean {
  try { return sessionStorage.getItem('tubigtala-splash') === '1'; } catch { return false; }
}

/** Illustration of the Water tab, drawn with the app's colours - not live data. */
function PhoneMock() {
  const cards = [
    { icon: 'device_thermostat', name: 'Temperature', value: '25.3', unit: '°C', level: 'Normal', tone: 'normal' },
    { icon: 'water_ph', name: 'pH level', value: '7.2', unit: '', level: 'Normal', tone: 'normal' },
    { icon: 'air', name: 'Ammonia gas', value: '1,820', unit: 'mV', level: 'A bit high', tone: 'warning' },
  ];
  return (
    <figure className="phone" aria-label="Illustration of the TubigTala app's Water screen">
      <div className="phone-screen">
        <div className="phone-header">Water</div>
        <div className="phone-cards">
          {cards.map((c) => (
            <div key={c.name} className="mock-card">
              <div className="mock-top"><Icon name={c.icon} /><span>{c.name}</span><span className={`chip chip-${c.tone}`}>{c.level}</span></div>
              <div className="mock-value">{c.value}<small>{c.unit}</small></div>
            </div>
          ))}
        </div>
        <div className="phone-tabs"><Icon name="monitoring" /><span className="tab-centre"><Icon name="water_drop" /></span><Icon name="settings" /></div>
      </div>
      <figcaption>Illustration</figcaption>
    </figure>
  );
}

function DownloadButton({ light = false }: { light?: boolean }) {
  return (
    <a className={`button${light ? ' button-light' : ''}`} href={APK_URL}>
      <Icon name="android" /> Download for Android
    </a>
  );
}

export function App() {
  const [splash, setSplash] = useState(() => !seenSplash());
  const finishSplash = () => {
    try { sessionStorage.setItem('tubigtala-splash', '1'); } catch { /* private mode: show it again next time */ }
    setSplash(false);
  };

  return (
    <>
      {splash && <Splash onDone={finishSplash} />}
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="#top" className="brand"><img src={logoMark} alt="" /><span>TubigTala</span></a>
          <nav>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#install">Install</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap hero-inner">
            <div className="hero-text">
              <p className="eyebrow">IoT water monitoring</p>
              <h1>Know your water, minute by minute.</h1>
              <p className="lead">
                TubigTala watches your water tank - <strong>temperature</strong>, <strong>pH</strong> and <strong>ammonia gas</strong> -
                and tells you on your phone the moment something changes.
              </p>
              <div className="hero-actions">
                <DownloadButton light />
                <span className="version">Android · version {APP_VERSION} · free</span>
              </div>
            </div>
            <PhoneMock />
          </div>
        </section>

        <section id="how" className="section">
          <div className="wrap">
            <h2>How it works</h2>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className="card">
                  <span className="step-no">{i + 1}</span>
                  <Icon name={s.icon} />
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="section section-tinted">
          <div className="wrap">
            <h2>What the app does</h2>
            <div className="grid">
              {features.map((f) => (
                <article key={f.title} className="card feature">
                  <span className="feature-icon"><Icon name={f.icon} /></span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2>Three sensors, one station</h2>
            <div className="grid grid-3">
              {sensors.map((s) => (
                <article key={s.name} className="card sensor">
                  <Icon name={s.icon} />
                  <h3>{s.name}</h3>
                  <p className="muted">{s.part}</p>
                  <p className="chip chip-normal">{s.normal}</p>
                  <p>{s.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="install" className="section section-tinted">
          <div className="wrap install">
            <div>
              <h2>Install on Android</h2>
              <ol className="install-steps">
                {installSteps.map((t) => <li key={t}>{t}</li>)}
              </ol>
              <DownloadButton />
              <p className="muted small">
                Older versions and release notes: <a href={RELEASES_URL}>GitHub Releases</a>. Android only for now.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="brand brand-footer"><img src={logoMark} alt="" /><span>TubigTala</span></div>
          <p className="disclaimer">{DISCLAIMER}</p>
          <p className="muted small">
            <a href={REPO_URL}>Source code on GitHub</a> · © {new Date().getFullYear()} TubigTala
          </p>
        </div>
      </footer>
    </>
  );
}
