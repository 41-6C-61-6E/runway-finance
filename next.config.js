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

const getLocalIPs = () => {
  const os = require('os');
  const ips = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal && !ips.includes(info.address)) {
        ips.push(info.address);
      }
    }
  }
  return ips;
};

const getCommitHash = () => {
  if (process.env.COMMIT_HASH) return process.env.COMMIT_HASH;
  if (process.env.NEXT_PUBLIC_COMMIT_HASH) return process.env.NEXT_PUBLIC_COMMIT_HASH;
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    try {
      const fs = require('fs');
      const path = require('path');
      const infoPath = path.join(__dirname, 'public', 'version-info.json');
      if (fs.existsSync(infoPath)) {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        return info.hash || (info.history && info.history[0]?.hash) || '';
      }
    } catch {
      return '';
    }
  }
  return '';
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  turbopack: {
    root: "./",
  },
  allowedDevOrigins: getLocalIPs(),
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
    NEXT_PUBLIC_COMMIT_HASH: getCommitHash(),
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
              "connect-src 'self' https://cdn.plaid.com https://*.push.apple.com https://fcm.googleapis.com https://*.fcm.googleapis.com https://updates.push.services.mozilla.com https://*.notify.windows.com;",
              "frame-src 'self' https://cdn.plaid.com;",
              "object-src 'none';",
              "base-uri 'self';",
              "form-action 'self';",
              ...(process.env.NODE_ENV === "production" ? ["frame-ancestors 'none';"] : []),
              ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests;"] : []),
            ].join(" "),
          },
          ...(process.env.NODE_ENV === "production" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
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
  async redirects() {
    return [
      {
        source: '/net-worth',
        destination: '/flows',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
