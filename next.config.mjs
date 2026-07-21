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
  },
  async redirects() {
    return [
      // FASE 8 + fix 2026-07-21: la landing legacy /diseno-paginas sigue
      // accesible por URL directa (demos, blog posts, /gracias post-pago),
      // pero la landing principal ahora redirige al catálogo nuevo con
      // checkout real. 301 estricto preserva SEO + bookmarks.
      {
        source: "/diseno-paginas",
        destination: "/servicios",
        permanent: true
      }
    ];
  }
};

export default nextConfig;
