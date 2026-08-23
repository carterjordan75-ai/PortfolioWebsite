/**
 * The XOXO wordmark's address, for everything that loads it as a file
 * (the header, the info panel, the watermark).
 *
 * Everything under /assets is served immutable for a year (next.config),
 * which is right for media that never changes under its name — and
 * wrong the moment a file is replaced in place, as this one was when the
 * O's counters were dropped: the server had the solid mark, every
 * browser that had ever seen the site kept the old one. A version on the
 * query is a new cache key. BUMP IT whenever the SVG changes.
 */
export const XOXO_LOGO_URL = '/assets/Logos/xoxo_Logo_005.svg?v=2'
