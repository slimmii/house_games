import { defineConfig } from 'vite';
import { houseBasisTranscoder } from './vite-plugin';

// Dev server for the house itself: scripts/visibility-bake.html (npm run bake:visibility starts it
// programmatically) and quick looks at the assets in public/.
export default defineConfig({
  plugins: [houseBasisTranscoder()],
});
