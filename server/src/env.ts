/**
 * Loads server/.env for local runs. Imported first so every other module
 * sees the values when it initialises. On Render the variables come from
 * the dashboard and there is no file, which is fine.
 */

import path from 'node:path';

try {
  process.loadEnvFile(path.resolve(__dirname, '../.env'));
} catch {
  /* no .env file — rely on the real environment */
}
