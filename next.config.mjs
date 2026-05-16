/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizeCss: false,
    // Keep sharp as an external (loaded from node_modules at runtime) so it
    // doesn't get bundled into the /api/upload serverless function. Sharp's
    // native binaries are ~30 MB and would push us back over Vercel's 250 MB
    // function-size cap. On Vercel the runtime ships its own sharp for image
    // optimization anyway. Sits under `experimental` in Next 14.2; moved to
    // top-level `serverExternalPackages` in Next 15+.
    serverComponentsExternalPackages: ['sharp'],
  },
  // Keep large public-media folders out of every serverless function bundle.
  // The files still ship as regular static assets — they just don't get
  // traced into individual function tarballs (Vercel's hard cap is 250 MB
  // unzipped per function). Without this, the dynamic path.join in
  // /api/upload + /api/look + /api/projects causes Next's static tracer to
  // pull the whole tree into each function.
  outputFileTracingExcludes: {
    '*': [
      'public/assets/Misc/**',
      'public/assets/audio/**',
      'public/assets/home-videos/**',
      'public/assets/info-videos/**',
      'public/assets/info-profile/**',
      'public/assets/look/**',
      'public/assets/work-bg/**',
      'public/assets/TestMedia/**',
      'public/assets/Logos/**',
      'public/uploads/**',
      'Assets/**',
    ],
  },
  // Force-include legacy seed JSON. The /api/pages, /api/misc, /api/projects
  // routes read these on first run (before anything has been written to Blob)
  // via path.join(process.cwd(), '...'). Static analysis can't see that
  // dynamic path, so without this Next leaves the JSON files out of the
  // function bundle and the fallback returns `{}` — which would then get
  // saved back to Blob on the next write, wiping all the existing data.
  outputFileTracingIncludes: {
    '/api/pages': ['data/pages.json'],
    '/api/misc': ['data/misc.json'],
    '/api/projects': ['public/assets/_data/admin-projects.json'],
  },
  headers: async () => [
    {
      source: '/assets/:path*',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
      ],
    },
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
      ],
    },
  ],
};

export default nextConfig;
