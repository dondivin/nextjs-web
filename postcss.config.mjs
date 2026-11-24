// Tailwind CSS v4 — only the back office stylesheet (src/app/(backoffice)/backoffice.css) imports Tailwind.
// The public site's CSS has no Tailwind directives, so the plugin leaves it unchanged.
const config = { plugins: { '@tailwindcss/postcss': {} } }
export default config
