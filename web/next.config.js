/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const configuredTarget = process.env.API_URL;
    const devTarget = "http://localhost:8000";
    const targetRoot = (configuredTarget || (process.env.NODE_ENV === "development" ? devTarget : ""))
      .replace(/\/+$/, "");
    if (!targetRoot) return [];
    const targetApi = targetRoot.endsWith("/api") ? targetRoot : `${targetRoot}/api`;

    return [
      {
        source: "/api/:path*",
        destination: `${targetApi}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
