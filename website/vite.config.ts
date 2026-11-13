import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site imports the app's design tokens and logos from ../mobile (one design source), so the
// dev server may read one level up. Vercel: Root Directory = website, and keep "Include files
// outside the root directory in the Build Step" on (the default).
export default defineConfig({
  plugins: [react()],
  // Use THIS tsconfig for every file, including ../mobile/src/constants/tokens.ts. Otherwise Vite
  // reads mobile/tsconfig.json for that file, which extends "expo/tsconfig.base" - only installed
  // when mobile/node_modules exists. On Vercel it does not, and the build failed with
  // "Tsconfig not found expo/tsconfig.base" (first deploy, 13 Nov 2026).
  tsconfig: './tsconfig.json',
  server: { fs: { allow: ['..'] } },
});
