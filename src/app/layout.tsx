import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Qlick Marketing Integral · Cursos de marketing aplicado",
    template: "%s · Qlick Marketing Integral"
  },
  description:
    "Formación práctica en marketing digital, publicidad, ventas, automatización y contenido. Cursos en línea para hacer crecer tu negocio en México.",
  keywords: [
    "cursos de marketing",
    "marketing digital",
    "Facebook Ads",
    "Instagram Ads",
    "WhatsApp",
    "CRM",
    "automatización",
    "contenido",
    "México",
    "Qlick"
  ],
  authors: [{ name: "Qlick Marketing Integral" }],
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: siteUrl,
    siteName: "Qlick Marketing Integral",
    title: "Qlick Marketing Integral · Cursos de marketing aplicado",
    description:
      "Aprende marketing práctico: publicidad, ventas, automatización y contenido. Plataforma educativa hecha en México.",
    images: [
      {
        url: "/brand/original/01_qlick_full_logo_transparent_canvas_500.png",
        width: 500,
        height: 500,
        alt: "Qlick Marketing Integral"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Qlick Marketing Integral",
    description:
      "Cursos de marketing aplicado para negocios en México."
  },
  icons: {
    icon: "/brand/original/05_qlick_icon_q_mouse_square_transparent.png",
    shortcut: "/brand/original/05_qlick_icon_q_mouse_square_transparent.png",
    apple: "/brand/original/05_qlick_icon_q_mouse_square_transparent.png"
  },
  robots: { index: true, follow: true }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
