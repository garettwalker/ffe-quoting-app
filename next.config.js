/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-pdf ships ESM and must be transpiled by Next/webpack so it bundles
  // correctly for the client-side PDFDownloadLink used on the print pages.
  transpilePackages: ["@react-pdf/renderer"],
};

module.exports = nextConfig;