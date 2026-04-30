/**
 * loadEnv.js — single source of truth for `dotenv.config()`.
 *
 * Every entrypoint that needs env vars (server bootstrap, scripts,
 * tests) requires this module FIRST. Centralizing the path-resolution
 * logic prevents drift like:
 *   require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
 *   require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
 * which are equivalent for one nesting level but break in scripts that
 * live deeper in the tree (`scripts/migrations/foo/bar.js`).
 *
 * Idempotent: dotenv.config() is a no-op on repeat calls (it does not
 * overwrite existing env vars by design, see DOTENV_OVERRIDE in the
 * docs). So requiring this file from many places is safe.
 *
 * Convention: require with no destructuring — the side effect IS the
 * API. Just `require('./lib/loadEnv')`.
 */
const path = require('node:path')

// `__dirname` here is `backend/src/lib`. The .env lives at `backend/.env`,
// two levels up regardless of who required us.
const envPath = path.resolve(__dirname, '..', '..', '.env')

require('dotenv').config({ path: envPath })

module.exports = { envPath }
