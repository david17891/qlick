import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "Lo que cambia en derecho familiar con la nueva ley · Bufete Mendoza",
  description:
    "Análisis de las reformas recientes en pensiones alimenticias y custodia. Lo que la Lic. Patricia Aguilar, especialista en mediación familiar, recomienda a sus clientes.",
};

const ACCENT_DARK = "#0f1f3a";
const ACCENT_GOLD = "#a98038";

export default function FamiliarPage() {
  return (
    <BlogArticleLayout
      brand="Bufete Mendoza"
      tagline="Abogados · CDMX"
      title="Lo que cambia en derecho familiar con la nueva ley"
      date="3 abril 2026"
      excerpt="Análisis de las reformas recientes en materia de pensiones alimenticias y custodia. Por la Lic. Patricia Aguilar, especialista en mediación familiar."
      image="/servicios/web/mendoza-blog-familia.jpg"
      imageAlt="Madre e hijo en consulta con abogada especialista en derecho familiar"
      content={[
        "Las reformas al Código Civil en materia familiar que entraron en vigor en 2025-2026 cambiaron varios puntos importantes. Si estás pasando por un divorcio, custodia o pensión alimenticia, esto es lo que necesitas saber. La Lic. Patricia Aguilar, nuestra socia especialista en mediación familiar, resume los cambios más relevantes.",
        "1. Pensión alimenticia ahora considera nivel de vida previo. Antes se calculaba con base en un porcentaje del ingreso del deudor (típicamente 15-25% por hijo). Ahora el juez debe considerar el nivel de vida que el menor tenía antes de la separación. En la práctica, esto puede aumentar la pensión en casos donde el estándar era alto.",
        "2. Custodia compartida ya no es excepcional. La nueva legislación elimina la presunción de que la madre debe tener la custodia principal. Los jueces ahora deben evaluar caso por caso y la custodia compartida es perfectamente viable cuando ambos padres son aptos. Esto no significa que se quite a la madre automáticamente: significa que se evalúa objetivamente.",
        "3. Deudores alimentarios ya no pueden ocultar patrimonio. La nueva ley permite a los jueces ordenar bloqueo de cuentas bancarias, restricción de vehículos e incluso suspensión de licencias de conducir a deudores morosos por más de 3 meses. Si debes pensión y no pagas, las consecuencias hoy son mucho más serias.",
        "4. Mediación previa al juicio es ahora obligatoria en CDMX. Antes era opcional; ahora, en la mayoría de los juzgados familiares, debes acreditar que intentaste mediar antes de abrir un juicio. La mediación es más rápida, más barata y permite acuerdos que el juez nunca podría imponer. En nuestro despacho mediamos 80% de los casos sin necesidad de juicio.",
        "5. Violencia familiar como causal específica de pérdida de custodia. Si hay antecedentes de violencia (no solo física, también psicológica o económica), la custodia se otorga al progenitor no agresor casi automáticamente. La ley amplió la definición de violencia familiar para incluir patrones de control.",
        "Si estás pasando por una situación familiar compleja, no tomes decisiones solo. La consulta inicial con nosotros es gratis y confidencial. Te decimos qué esperar del proceso, qué te conviene aceptar y qué no, y cuánto va a costar en tiempo y dinero. Escríbenos por WhatsApp.",
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
          title: "Cómo constituir una SAS en México en 2026",
          href: "/diseno-paginas/demo-2b/blog/como-constituir-sas-mexico-2026",
          image: "/servicios/web/mendoza-blog-sas.jpg",
          imageAlt: "Documentos corporativos",
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
