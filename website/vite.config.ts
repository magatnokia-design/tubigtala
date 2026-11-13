import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site imports the app's design tokens and logos from ../mobile (one design source), so the
// dev server may read one level up. Vercel: Root Directory = website, and keep "Include files
// outside the root directory in the Build Step" on (the default).
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
