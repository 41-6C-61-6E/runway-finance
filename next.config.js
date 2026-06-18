const getBuildNumber = () => {
  if (process.env.BUILD_NUMBER) {
    return process.env.BUILD_NUMBER;
  }
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const isProd = process.env.NODE_ENV === 'production';
  return `${yy}.${mm}.${isProd ? 'local' : 'dev'}`;
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  turbopack: {
    root: "./",
  },
  output: "standalone",
  serverExternalPackages: ['pg', 'pg-pool', 'pg-hstore', 'pg-types', 'pg-int8', 'pg-connection-string', 'pgpass'],
  images: {
    remotePatterns: [],
  },
  experimental: {
    webpackMemoryOptimizations: process.env.NODE_ENV !== 'production',
    workerThreads: process.env.DISABLE_WORKER_THREADS === 'true' ? false : undefined,
    cpus: process.env.DISABLE_WORKER_THREADS === 'true' ? 1 : undefined,
  },
  env: {
    NEXT_PUBLIC_BUILD_NUMBER: getBuildNumber(),
    NEXT_PUBLIC_BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self';",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com;",
              "style-src 'self' 'unsafe-inline';",
              "img-src 'self' blob: data:;",
              "font-src 'self' data:;",
              "connect-src 'self' https://cdn.plaid.com;",
              "frame-src 'self' https://cdn.plaid.com;",
              "object-src 'none';",
              "base-uri 'self';",
              "form-action 'self';",
              "frame-ancestors 'none';",
              "upgrade-insecure-requests;",
            ].join(" "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(), interest-cohort=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

module.exports = nextConfig;
