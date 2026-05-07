/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  turbopack: {
    root: "./",
  },
  output: "standalone",
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
