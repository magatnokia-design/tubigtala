import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { palette, Radius, Spacing } from '../../mobile/src/constants/tokens';
import { App } from './App';
import './styles.css';

// One design: the app's own tokens become CSS variables (--text, --tint, --space-3, --radius-card...).
const root = document.documentElement.style;
for (const [name, value] of Object.entries(palette)) root.setProperty(`--${name}`, value);
Object.values(Spacing).forEach((px, i) => root.setProperty(`--space-${i}`, `${px}px`)); // half, one, two...
root.setProperty('--radius-small', `${Radius.small}px`);
root.setProperty('--radius-card', `${Radius.card}px`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
