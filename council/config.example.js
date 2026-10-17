// Copy to config.js for a local preview (config.js is git-ignored).
// GitHub Pages writes config.js from the repo variables SUPABASE_URL and
// SUPABASE_ANON_KEY (.github/workflows/council-pages.yml).
// Only the public anon key belongs here, never the service role key.
window.LANGKAH_CONFIG = {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key',
};
