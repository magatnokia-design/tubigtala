// Plausible-looking fake sensor values, shaped exactly like real readings
// (docs/data-model.md). Includes occasional nulls so the app's missing-value UI gets exercised.

export function initialState() {
  return { ph: 7.2, nh3GasMv: 420, values: null };
}

const drift = (v, step, lo, hi) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * step));
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export function nextValues(state, timeMs, { nullChance = 0.03 } = {}) {
  const ph = drift(state.ph, 0.08, 6.0, 8.6);
  const nh3GasMv = drift(state.nh3GasMv, 30, 250, 900);
  // Water temperature follows the day: coolest ~6 am, warmest ~3 pm (local time).
  const hour = new Date(timeMs).getHours() + new Date(timeMs).getMinutes() / 60;
  const temperatureC = 27.5 + 2 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (Math.random() - 0.5) * 0.2;
  const maybe = (v) => (Math.random() < nullChance ? null : v);

  return {
    ph,
    nh3GasMv,
    values: {
      ph: maybe(round(ph, 2)),
      phCalibrated: false,
      phMv: round(2500 - (ph - 7) * 180, 0),
      temperatureC: maybe(round(temperatureC, 2)),
      nh3GasMv: maybe(round(nh3GasMv, 0)),
    },
  };
}
