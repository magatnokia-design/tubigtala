import { useEffect, useState } from 'react';

import logoSymbol from '../../mobile/assets/brand/logo-symbol.svg';
import logoMark from '../../mobile/assets/brand/logo-mark.svg';
import { APK_URL, APP_VERSION, DISCLAIMER, features, installSteps, sensors, steps } from './content';

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

/** The app's gauge: scale colours along min..max, the normal range as a bright window. */
function Gauge({ s }: { s: (typeof sensors)[number] }) {
  const pct = (v: number) => ((v - s.min) / (s.max - s.min)) * 100;
  const colours = s.gradient.map((c) => `var(--${c})`).join(', ');
  return (
    <div className="gauge">
      <div className="gauge-track" style={{ background: `linear-gradient(90deg, ${colours})` }}>
        <div className="gauge-normal" style={{ left: `${pct(s.lo)}%`, width: `${pct(s.hi) - pct(s.lo)}%` }}>
          <span>Normal</span>
        </div>
      </div>
      <div className="gauge-ticks"><span>{s.ticks[0]}</span><span>{s.ticks[1]}</span></div>
    </div>
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
            <p className="kicker">From tank to phone</p>
            <h2>How it works</h2>
            <ol className="flow">
              {steps.map((s, i) => (
                <li key={s.title} className="flow-step">
                  <div className="flow-badge">
                    <Icon name={s.icon} />
                    <span className="flow-no">{i + 1}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="section section-tinted">
          <div className="wrap features-layout">
            <div className="features-intro">
              <p className="kicker">The app</p>
              <h2>What the app does</h2>
              <p className="muted">Everything about your tank in one place - readable at a glance, with the detail when you want it.</p>
            </div>
            <ul className="feature-list">
              {features.map((f) => (
                <li key={f.title} className="feature-row">
                  <span className="feature-icon"><Icon name={f.icon} /></span>
                  <div>
                    <h3>{f.title}</h3>
                    <p>{f.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section section-dark">
          <div className="wrap">
            <p className="kicker kicker-light">The station</p>
            <h2>Three sensors, one station</h2>
            <div className="sensor-grid">
              {sensors.map((s) => (
                <article key={s.name} className="sensor-card">
                  <div className="sensor-head">
                    <span className="sensor-icon"><Icon name={s.icon} /></span>
                    <span className="where">{s.where}</span>
                  </div>
                  <h3>{s.name}</h3>
                  <p className="sensor-part">{s.part}</p>
                  <p className="sensor-normal"><small>Normal</small>{s.normal}</p>
                  <Gauge s={s} />
                  <p className="sensor-note">{s.note}</p>
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
              <p className="muted small">Android only for now · version {APP_VERSION}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="brand brand-footer"><img src={logoMark} alt="" /><span>TubigTala</span></div>
          <p className="disclaimer">{DISCLAIMER}</p>
          <p className="muted small">© {new Date().getFullYear()} TubigTala</p>
        </div>
      </footer>
    </>
  );
}
