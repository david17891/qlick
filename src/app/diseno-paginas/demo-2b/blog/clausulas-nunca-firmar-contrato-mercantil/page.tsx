import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "5 cláusulas que NUNCA debes firmar en un contrato mercantil · Bufete Mendoza",
  description:
    "Las 5 cláusulas más peligrosas en contratos mercantiles mexicanos. El Lic. Jorge Ramírez explica qué buscar antes de firmar cualquier contrato comercial.",
};

const ACCENT_DARK = "#0f1f3a";
const ACCENT_GOLD = "#a98038";

export default function ClausulasPage() {
  return (
    <BlogArticleLayout
      brand="Bufete Mendoza"
      tagline="Abogados · CDMX"
      title="5 cláusulas que NUNCA debes firmar en un contrato mercantil"
      date="20 febrero 2026"
      excerpt="El top 5 de cláusulas que vemos firmar a clientes sin leer y que después cuestan miles (o cientos de miles) de pesos. Por el Lic. Jorge Ramírez, doctor en Ciencias Penales."
      image="/servicios/web/mendoza-blog-contrato.jpg"
      imageAlt="Dos personas firmando un contrato mercantil con pluma sobre escritorio"
      content={[
        "Como abogado litigante, veo cada año clientes que firmaron contratos sin entender qué aceptaban, y ahora están en juicios que les cuestan mucho más que lo que se hubieran ahorrado contratando un abogado para revisar antes de firmar. Aquí las 5 cláusulas que más problemas causan.",
        "1. Cláusula penal excesiva. Una cláusula penal es una cantidad que se paga si incumples. Es legal, pero tiene un límite: en México, los jueces pueden reducir las cláusulas penales que consideren 'excesivas' o 'usurarias'. PERO: si firmas una cláusula penal de $500,000 por incumplimiento, el proveedor va a demandarte por esa cantidad aunque lo que te prestó valga $50,000. Vas a tener que litigar para reducirla. Mejor negocía una penal proporcional desde el inicio.",
        "2. Cláusula de competencia desleal demasiado amplia. Si firmas 'no competir con la empresa X durante 5 años en territorio nacional', acabas de cerrar tu capacidad de trabajar en tu industria por 5 años. Esta cláusula es válida si es razonable, pero muchos clientes la firman creyendo que 'no va aplicar' y se sorprenden cuando les llega un requerimiento judicial. Siempre pregunta al alcance geográfico y temporal.",
        "3. Cláusula de jurisdicción en lugar lejano. 'Para todo lo derivado de este contrato, las partes se someten a los tribunales de la Ciudad de México' suena inocente. Pero si tú vives en Monterrey y te demandan, tienes que contratar abogado en CDMX, trasladarte para audiencias, etc. Esto solo es válido si ambas partes tienen negocio real en CDMX. Si eres de fuera, negocia la jurisdicción local.",
        "4. Cláusula de garantía cruzada oponible a tus socios. Si firmas como representante legal de una empresa, pero la garantía personal la cruza con tus otros negocios o tu patrimonio personal, estás poniendo en riesgo todo lo que tienes afuera de esa empresa. Esta cláusula es frecuente en arrendamientos y financiamientos. Lee la sección de 'garantías' antes de firmar.",
        "5. Cláusula de terminación unilateral sin aviso. Algunas empresas ponen cláusulas que les permiten terminar el contrato 'en cualquier momento, sin necesidad de aviso previo'. Si tú tienes estructura montada alrededor de ese contrato, una terminación de un día para otro te puede quebrar. Antes de firmar, pregunta cuánto aviso previo hay si la otra parte quiere terminar.",
        "La regla es: si un contrato tiene más de 5 páginas o mueve más de $100,000 MXN, paga una hora de revisión con un abogado. Te cobramos $1,500 MXN por revisar contratos mercantiles estándar. Lo que te ahorras en problemas después vale infinitamente más. Escríbenos por WhatsApp.",
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
          title: "Lo que cambia en derecho familiar con la nueva ley",
          href: "/diseno-paginas/demo-2b/blog/derecho-familiar-nueva-ley",
          image: "/servicios/web/mendoza-blog-familia.jpg",
          imageAlt: "Familia en consulta legal",
        },
      ]}
    />
  );
}
