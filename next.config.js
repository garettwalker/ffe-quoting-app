/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-pdf is rendered to a PDF buffer on the server (in the
  // /quotes/[id]/print/pdf route handler via renderToBuffer), not in the
  // browser. Externalizing it keeps it out of the webpack server bundle and
  // requires it as a normal Node module at runtime (it uses Node APIs).
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"]
  }
};

module.exports = nextConfig;