import Script from "next/script";

/**
 * Meta Pixel (Facebook) para qlick.digital.
 *
 * Activación:
 *  1. Crear cuenta Facebook Business Manager → https://business.facebook.com
 *  2. Events Manager → Conectar orígenes de datos → Web → Meta Pixel
 *  3. Copiar el ID del Pixel (15-16 dígitos)
 *  4. En Vercel dashboard, agregar env var:
 *       NEXT_PUBLIC_META_PIXEL_ID = 123456789012345
 *  5. Redeploy. Listo.
 *
 * Si la env var no está configurada, este componente no inyecta nada.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export function MetaPixel() {
  if (!PIXEL_ID) return null;

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${PIXEL_ID}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
