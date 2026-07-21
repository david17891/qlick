import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "5 señales de que necesitas una limpieza profesional · Sonrisa Plus",
  description:
    "Sangrado de encías, mal aliento, sarro visible: cómo identificar cuándo es momento de pedir una limpieza dental profesional antes de que el problema avance.",
};

const ACCENT_DARK = "#075985";

export default function LimpiezaPage() {
  return (
    <BlogArticleLayout
      brand="Sonrisa Plus"
      tagline="Odontología · Polanco"
      title="5 señales de que necesitas una limpieza profesional"
      date="28 mayo 2026"
      excerpt="Sangrado de encías, mal aliento persistente, sarro visible: cuándo pedir cita sin pensarlo. Una limpieza a tiempo evita tratamientos caros después."
      image="/servicios/web/sonrisa-blog-limpieza.jpg"
      imageAlt="Limpieza dental profesional con ultrasonido"
      content={[
        "La limpieza dental cada 6 meses es la cita más rentable que existe. Previene caries, enfermedad de encías y mal aliento. Pero hay señales que indican que ya no deberías esperar más. Si reconoces alguna de estas, pide cita esta semana.",
        "1. Sangrado al cepillarte. Si te salen las encías con sangre al cepillar o usar hilo dental, no es normal. La causa más común es gingivitis (encías inflamadas por acumulación de placa). Una limpieza profesional elimina la placa y la gingivitis revierte en 1-2 semanas.",
        "2. Mal aliento que no se va. Si ya probaste cepillarte la lengua, hilo dental y enjuague y el mal aliento persiste, probablemente hay sarro debajo de la encía. Ese sarro no se quita con cepillado en casa. Solo con limpieza profesional con ultrasonido.",
        "3. Sarro visible. Esa línea amarilla o marrón entre los dientes y la encía es sarro solidificado. No se va con cepillo. Si lo ves en el espejo, ya pasó el tiempo de la limpieza preventiva: ahora necesitas profilaxis completa.",
        "4. Encías rojas o inflamadas. Encías sanas son rosa pálido y se ven firmes. Si se ven rojas, hinchadas o duelen al tacto, hay inflamación activa. Una limpieza + técnica correcta de cepillado lo resuelve en la mayoría de los casos sin tratamiento adicional.",
        "5. Sensibilidad al frío o calor que antes no tenías. La retracción de encías por acumulación de sarro expone la raíz del diente, que es más sensible. Si notas sensibilidad nueva, no esperes a que duela más. La limpieza + tratamiento con flúor muchas veces lo resuelve.",
        "En Sonrisa Plus la limpieza y profilaxis con ultrasonido dura 45 minutos e incluye pulido y aplicación de flúor. Cuesta $850 y la primera consulta es gratis. Si llevas más de 8 meses sin limpieza, escríbenos por WhatsApp y te agendamos esta semana.",
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
          title: "Cómo cuidar tus alineadores invisibles día a día",
          href: "/diseno-paginas/demo-2a/blog/como-cuidar-alineadores-invisibles",
          image: "/servicios/web/sonrisa-blog-alineadores.jpg",
          imageAlt: "Alineador invisible transparente",
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
