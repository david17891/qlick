import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "Cómo constituir una SAS en México en 2026 · Bufete Mendoza",
  description:
    "Guía paso a paso con costos reales, tiempos y los errores más comunes al constituir una Sociedad por Acciones Simplificada en México en 2026.",
};

const ACCENT_DARK = "#0f1f3a";
const ACCENT_GOLD = "#a98038";

export default function SasPage() {
  return (
    <BlogArticleLayout
      brand="Bufete Mendoza"
      tagline="Abogados · CDMX"
      title="Cómo constituir una SAS en México en 2026"
      date="15 junio 2026"
      excerpt="Guía paso a paso con costos reales, tiempos y los errores que más vemos en clientes primerizos. Por el Lic. Rodrigo Mendoza, especialista en mercantil."
      image="/servicios/web/mendoza-blog-sas.jpg"
      imageAlt="Documentos corporativos y laptop en escritorio de abogado"
      content={[
        "La Sociedad por Acciones Simplificada (SAS) es, desde 2016, la forma más rápida y barata de constituir una empresa en México. En 2026 sigue siendo la opción #1 para emprendedores, freelancers que facturan alto y proyectos pequeños-medianos. Esta es la guía que les doy a mis clientes antes de empezar.",
        "Paso 1 — Define el objeto social. ¿A qué se va a dedicar la empresa? Este paso es crítico: si después quieres hacer algo que no está en el objeto social, hay que modificar los estatutos. Mejor pecar de amplio desde el inicio que quedarse corto. Una línea tipo 'realización de toda clase de actos de comercio lícitos' es suficiente para la mayoría de casos.",
        "Paso 2 — Autorización de uso de nombre ante la Secretaría de Economía. Se hace en línea en el portal tuempresa.gob.mx. Cuesta alrededor de $400 MXN y tarda 1-2 días hábiles. Necesitas 3 opciones de nombre en orden de preferencia. Si tu primera opción ya está tomada, usan la segunda.",
        "Paso 3 — Constitución ante fedatario. Aquí tienes dos caminos: notario público ($8,000-$15,000 MXN + impuestos) o corredor público ($5,000-$10,000). Para SAS con capital menor a $500,000, el corredor público es suficiente y más barato. Si tu SAS va a tener socios extranjeros o capital mayor, ve con notario.",
        "Paso 4 — Inscripción en el RFC. Una vez que tienes el acta constitutiva, el fedatario o tu contador dan de alta la empresa en el SAT. Tarda 1-2 días. Desde ese momento ya puedes facturar a nombre de la SAS.",
        "Paso 5 — Alta patronal en IMSS (si vas a tener empleados). Esto se hace en línea en el portal del IMSS. Necesitas el acta constitutiva, RFC y el domicilio fiscal. Tarda 1 día.",
        "Costo total realista en 2026: entre $7,000 y $18,000 MXN dependiendo del camino que tomes. Tiempo total: 2-3 semanas si todo sale bien. Errores comunes: dejar el objeto social demasiado estrecho, no prever el régimen fiscal desde el inicio (RESICO vs general), y olvidar actas de asamblea para temas relevantes.",
        "Si vas a constituir una SAS y tienes dudas, una consulta inicial de 30 minutos con nosotros es gratis. Te decimos si la SAS es lo correcto para tu caso o si conviene otra figura (SC, SA de CV, persona física con actividad empresarial). Escríbenos por WhatsApp.",
      ]}
      accentColor={ACCENT_GOLD}
      backHref="/diseno-paginas/demo-2b#blog"
      backLabel="Volver al blog"
      footerProps={{
        brand: "Bufete Mendoza",
        tagline: "Abogados · CDMX",
        description:
          "Despacho boutique con 25 años de experiencia en derecho mercantil, civil, familiar, penal y corporativo. Atención directa del abogado responsable.",
        address: "Paseo de la Reforma 222, Piso 14, CDMX 06600",
        phone: "+52 55 8765 1234",
        email: "contacto@bufetemendoza.mx",
        schedule: "Lun-Vie 9-18",
        socialLinks: [
          { label: "LinkedIn · Bufete Mendoza", href: "#" },
          { label: "Instagram · @bufetemendoza", href: "#" },
        ],
      }}
      relatedPosts={[
        {
          title: "Lo que cambia en derecho familiar con la nueva ley",
          href: "/diseno-paginas/demo-2b/blog/derecho-familiar-nueva-ley",
          image: "/servicios/web/mendoza-blog-familia.jpg",
          imageAlt: "Familia en consulta con abogada",
        },
        {
          title: "5 cláusulas que NUNCA debes firmar en un contrato mercantil",
          href: "/diseno-paginas/demo-2b/blog/clausulas-nunca-firmar-contrato-mercantil",
          image: "/servicios/web/mendoza-blog-contrato.jpg",
          imageAlt: "Firma de contrato mercantil",
        },
      ]}
    />
  );
}
