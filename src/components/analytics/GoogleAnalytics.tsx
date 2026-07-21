import Script from "next/script";

/**
 * Google Analytics 4 para qlick.digital.
 *
 * Activación:
 *  1. Entrar a https://analytics.google.com con la cuenta de Google del negocio
 *  2. Crear propiedad GA4 (tipo Web)
 *  3. Copiar el Measurement ID (formato G-XXXXXXXXXX)
 *  4. En Vercel dashboard, agregar env var:
 *       NEXT_PUBLIC_GA_MEASUREMENT_ID = G-ABC123DEF4
 *  5. Redeploy. Listo.
 *
 * Si la env var no está configurada, este componente no inyecta nada.
 */

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  if (!MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${MEASUREMENT_ID}', { send_page_view: true });
          `,
        }}
      />
    </>
  );
}
