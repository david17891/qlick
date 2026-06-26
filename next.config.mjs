/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
    // Quitados por no estar en uso en el código:
    // - i.ytimg.com   (no se usa, `provider.ts` ya usa img.youtube.com)
    // - uv.mx         (no se usa en el codebase)
  }
};

export default nextConfig;
