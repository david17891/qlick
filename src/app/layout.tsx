import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";

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
    default: "Qlick Marketing Digital · Servicios y eventos de marketing",
    template: "%s · Qlick Marketing Digital"
  },
  description:
    "Diseño web, campañas de Meta Ads, auditorías de negocio y Google Business Profile. Servicios profesionales de marketing para hacer crecer tu negocio en México.",
  keywords: [
    "servicios de marketing",
    "marketing digital",
    "diseño web",
    "Google Business Profile",
    "Meta Ads",
    "Facebook Ads",
    "Instagram Ads",
    "auditoría de marketing",
    "WhatsApp",
    "México",
    "Qlick"
  ],
  authors: [{ name: "Qlick Marketing Digital" }],
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: siteUrl,
    siteName: "Qlick Marketing Digital",
    title: "Qlick Marketing Digital · Servicios y eventos de marketing",
    description:
      "Diseño web, campañas de Meta Ads, auditorías de negocio y Google Business Profile. Pago único, entregable concreto, sin enredos.",
    images: [
      {
        url: "/brand/original/01_qlick_full_logo_transparent_canvas_500.png",
        width: 500,
        height: 500,
        alt: "Qlick Marketing Digital"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Qlick Marketing Digital",
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
      <body>
        <MetaPixel />
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
