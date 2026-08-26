# Why the npm links had no images

Those three npm package URLs came through as rich links with no image because npmjs.com blocks server-side fetches. Requesting any `npmjs.com/package/...` page from our server returns a Cloudflare "Just a moment..." challenge page with HTTP 403 and no OpenGraph tags at all — so title, description, and image all come back empty and the card falls back to bare text.

This is not specific to npm: any site behind a bot challenge (or that renders metadata only in the browser) will produce the same imageless card today.

## Fix: layered fallbacks for link metadata

1. Retry blocked pages once with a browser-like request
   When the first fetch returns 403/429 or a challenge page, retry with a realistic browser User-Agent and `Accept-Language` header. Some sites pass on the second shape.

2. Site-specific enrichment for npm
   Verified working: `https://registry.npmjs.org/<encoded package name>` returns the package name, description, version, and links without any challenge. For npm package URLs, build the card from that instead:
   - title: package name (e.g. `@1440io/msp-types`)
   - description: package description from the registry
   - image: npm's own logo asset (verified reachable, HTTP 200)

3. Generic image fallback
   When no OpenGraph image exists after the above, use the site's high-resolution favicon/apple-touch-icon so the card still renders with a visual and the site name, rather than plain text. Only accept HTTPS image URLs that respond successfully.

4. Surface why an image is missing
   Add the metadata outcome (fetched / blocked / no image, plus HTTP status) to the existing send diagnostics panel, so a missing image is explainable instead of silent.

## Scope

Applies everywhere automatic rich-link conversion already runs: Inbox composer, raw studio, and the template wizard. No change to the conversion rules themselves (surrounding text first, then one card per URL, always automatic).

## Technical notes

- All work stays in `src/lib/link-preview.server.ts` (fetch layering, npm registry enrichment, favicon fallback, outcome reporting), with the diagnostics field threaded through the existing send-diagnostics shape.
- Keep current safety limits: 4s timeout per fetch, 512KB read cap, short-lived in-memory cache, HTTPS-only images, and never throwing — a failed lookup still sends the link.
- Favicon/icon probing uses the page's own `<link rel="apple-touch-icon">`/`icon` when present, falling back to `/favicon.ico` on the same origin; no third-party favicon proxy so no customer URLs leak to another service.
