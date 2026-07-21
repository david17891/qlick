import { BlogArticleLayout } from "@/components/web-templates/BlogArticleLayout";

export const metadata = {
  title: "Implantes dentales: lo que debes saber antes de decidir · Sonrisa Plus",
  description:
    "Tiempos, costos y cuidados post-operatorios de los implantes dentales. Lo que el Dr. Roberto Salinas explica a sus pacientes antes de cualquier cirugía.",
};

const ACCENT_DARK = "#075985";

export default function ImplantesPage() {
  return (
    <BlogArticleLayout
      brand="Sonrisa Plus"
      tagline="Odontología · Polanco"
      title="Implantes dentales: lo que debes saber antes de decidir"
      date="8 abril 2026"
      excerpt="Tiempos, costos, cuidados post-operatorios. Respondemos las preguntas más frecuentes sobre implantes dentales con la experiencia del Dr. Roberto Salinas (800+ implantes)."
      image="/servicios/web/sonrisa-blog-implantes.jpg"
      imageAlt="Implante dental de titanio con corona de zirconia"
      content={[
        "Un implante dental es la mejor opción para reemplazar un diente perdido: se ve, se siente y funciona como uno natural. Pero no es un trámite: es un proceso que lleva meses y requiere compromiso. Aquí lo que necesitas saber antes de decidir.",
        "¿Cuánto cuesta? Un implante unitario con corona de zirconia en nuestro consultorio arranca en $18,000 MXN. Si necesitas injerto óseo (porque el hueso se reabsorbió tras la pérdida del diente), suma entre $4,000 y $12,000 dependiendo del caso. El presupuesto real se confirma con tomografía.",
        "¿Cuánto dura el proceso completo? El protocolo convencional son 4-8 meses: 1) cirugía de colocación del implante, 2) espera de 3-6 meses para que el hueso integre el implante (oseointegración), 3) segunda cirugía menor para descubrir el implante, 4) toma de impresión y colocación de corona. Hay casos de carga inmediata donde se sale con diente provisional el mismo día, pero no aplica para todos.",
        "¿Duele? La cirugía de colocación se hace con anestesia local. La mayoría de pacientes reporta que es más incómoda que dolorosa. El post-operatorio (2-5 días) se controla con ibuprofeno y dieta blanda. Si tienes pánico al dentista, ofrecemos sedación consciente con costo adicional.",
        "¿Quién es buen candidato? Necesitas hueso suficiente en la zona (o disposición a injerto), encías sanas, y buena higiene. Diabetes controlada o tabaquismo no son contraindicaciones absolutas, pero aumentan el riesgo de rechazo. La valoración con tomografía cone beam es indispensable antes de cualquier plan.",
        "¿Cuánto dura un implante? Con cuidado apropiado, un implante de titanio bien colocado dura 20+ años. La corona de zirconia puede requerir reemplazo cada 10-15 años por desgaste. La clave del éxito a largo plazo: higiene impecable y limpiezas profesionales cada 6 meses.",
        "Si estás considerando un implante, pide una cita de valoración con el Dr. Salinas. Incluye tomografía, plan de tratamiento por escrito y cotización sin compromiso. Escríbenos por WhatsApp y te agendamos en menos de 4 horas.",
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
          title: "5 señales de que necesitas una limpieza profesional",
          href: "/diseno-paginas/demo-2a/blog/senales-necesitas-limpieza-dental",
          image: "/servicios/web/sonrisa-blog-limpieza.jpg",
          imageAlt: "Limpieza dental profesional",
        },
      ]}
    />
  );
}
