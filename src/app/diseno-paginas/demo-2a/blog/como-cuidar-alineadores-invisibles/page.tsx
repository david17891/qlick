import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "Cómo cuidar tus alineadores invisibles día a día · Sonrisa Plus",
  description:
    "Hábitos diarios para mantener tus alineadores invisibles transparentes, sin manchas y sin mal olor. Guía práctica de la Dra. Carolina Vega, Diamond Provider de Invisalign.",
};

const ACCENT_DARK = "#075985";

export default function AlineadoresPage() {
  return (
    <BlogArticleLayout
      brand="Sonrisa Plus"
      tagline="Odontología · Polanco"
      title="Cómo cuidar tus alineadores invisibles día a día"
      date="12 junio 2026"
      excerpt="Hábitos simples para mantener tus alineadores transparentes limpios, sin manchas y sin mal olor. Lo que aprendemos de 400+ casos tratados con Invisalign."
      image="/servicios/web/sonrisa-blog-alineadores.jpg"
      imageAlt="Alineador invisible transparente sobre superficie blanca"
      content={[
        "Los alineadores invisibles son una herramienta poderosa para alinear los dientes sin la estética de los brackets metálicos. Pero como cualquier tratamiento, su éxito depende de cuánto te comprometas con el día a día. Estos son los hábitos que mejor resultado dan en nuestros pacientes.",
        "1. Lávalos cada vez que te los quites. Apenas te los saques para comer, cepillalos con agua tibia y un jabón neutro suave. El dentífrico puede opacarlos con el tiempo. Un cepillo de dientes suave reservado solo para ellos funciona perfecto.",
        "2. Nunca los guardes secos. Si te los quitas en un restaurante o en la calle, ponlos inmediatamente en su estuche. Dejarlos sobre una servilleta es la causa #1 de alineadores perdidos. El estuche es tu mejor amigo.",
        "3. Evita bebidas calientes con ellos puestos. El calor deforma el plástico y arruina el ajuste. Si vas a tomar café, té o algo caliente, quítatelos antes. El agua fría o a temperatura ambiente sí se puede tomar con ellos.",
        "4. Haz enjuague bucal antes de ponerlos. Después de comer, si no puedes cepillarte los dientes, un enjuague de 30 segundos ayuda a evitar que restos de comida queden atrapados entre el alineador y el esmalte. Esos restos generan manchas blancas cuando se acumulan.",
        "5. Cámbialos en la fecha indicada. Cada alineador está programado para mover los dientes una cantidad específica de milímetros. Saltarte un cambio o alargar el uso de uno ya vencido alarga el tratamiento meses. Ponte alarmas si eres olvidadizo.",
        "Si tienes dudas sobre tu caso específico, escríbenos por WhatsApp y la Dra. Vega o su equipo te orientan sin compromiso. La primera consulta es gratis y puedes traer tus alineadores para revisarlos.",
      ]}
      accentColor={ACCENT_DARK}
      backHref="/diseno-paginas/demo-2a#blog"
      backLabel="Volver al blog"
      footerProps={{
        brand: "Sonrisa Plus",
        tagline: "Consultorio dental · Polanco",
        description:
          "Odontología familiar y estética dental en Polanco, CDMX. Equipo certificado, tecnología 3D, sin sorpresas en el presupuesto.",
        address: "Av. Presidente Masaryk 220, Polanco, CDMX 11550",
        phone: "+52 55 2345 6789",
        email: "hola@sonrisaplus.mx",
        schedule: "Lun-Vie 9-19 · Sáb 9-14",
        socialLinks: [
          { label: "Instagram · @sonrisa.plus", href: "#" },
          { label: "Facebook · Sonrisa Plus", href: "#" },
        ],
      }}
      relatedPosts={[
        {
          title: "5 señales de que necesitas una limpieza profesional",
          href: "/diseno-paginas/demo-2a/blog/senales-necesitas-limpieza-dental",
          image: "/servicios/web/sonrisa-blog-limpieza.jpg",
          imageAlt: "Limpieza dental profesional",
        },
        {
          title: "Implantes dentales: lo que debes saber antes de decidir",
          href: "/diseno-paginas/demo-2a/blog/implantes-dentales-guia-decision",
          image: "/servicios/web/sonrisa-blog-implantes.jpg",
          imageAlt: "Implante dental de cerca",
        },
      ]}
    />
  );
}
