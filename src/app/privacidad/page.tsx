import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Aviso de Privacidad | Qlick",
  description:
    "Aviso de privacidad de Qlick Marketing Integral: cómo tratamos los datos del formulario de contacto, la gestión de leads, WhatsApp Business API y tus derechos ARCO.",
  alternates: { canonical: "/privacidad" }
};

/**
 * Aviso de Privacidad de Qlick Marketing Integral.
 *
 * Editado 2026-06-30:
 *  - Email de contacto actualizado a david17891@gmail.com (gmail personal).
 *  - Sección 5 (proveedores) ahora describe correctamente el uso de
 *    WhatsApp Business API (Meta) y DeepSeek como proveedor de IA.
 *  - Nueva sección 8 sobre Eliminación de Datos / Data Deletion Request
 *    (requerida por Meta App Review).
 */
const RESPONSABLE = "Qlick Marketing Integral";
const CONTACTO_PRIVACIDAD = "david17891@gmail.com";
const ULTIMA_ACTUALIZACION = "Última actualización: 30 de junio de 2026";

type Seccion = {
  id: string;
  titulo: string;
  parrafos: string[];
  lista?: string[];
  /** Párrafos que se renderizan DESPUÉS de la lista (si la hay). */
  parrafos_end?: string[];
};

const secciones: Seccion[] = [
  {
    id: "responsable",
    titulo: "1. Responsable del tratamiento",
    parrafos: [
      `${RESPONSABLE} es responsable del uso y protección de tus datos personales conforme a este aviso. Los datos que nos proporciones se tratarán con base en los principios de licitud, consentimiento, información, calidad, finalidad, lealtad, proporcionalidad y responsabilidad establecidos en la legislación mexicana aplicable.`,
      `Para cuestiones de privacidad y protección de datos puedes contactarnos en: ${CONTACTO_PRIVACIDAD}.`
    ]
  },
  {
    id: "datos",
    titulo: "2. Datos que recabamos",
    parrafos: [
      "A través del formulario de contacto, la solicitud de información de cursos y la conversación por WhatsApp recabamos los siguientes datos personales:"
    ],
    lista: [
      "Nombre completo",
      "Correo electrónico",
      "Número de teléfono / WhatsApp",
      "Curso, evento o tema de interés y los mensajes que nos envíes",
      "Marca de consentimiento para ser contactado",
      "Metadatos de la conversación (fecha/hora, identificador del mensaje)"
    ]
  },
  {
    id: "finalidades",
    titulo: "3. Finalidades del tratamiento",
    parrafos: [
      "Tus datos se utilizan exclusivamente para:"
    ],
    lista: [
      "Atender tu solicitud de información sobre cursos, eventos y servicios.",
      "Darte seguimiento comercial como lead (gestión de prospectos).",
      "Comunicarnos contigo por WhatsApp Business, correo electrónico o teléfono.",
      "Confirmar tu asistencia a eventos y enviarte tu pase de entrada (QR).",
      "Clasificar tu interés y mejorar la respuesta que te damos con ayuda de IA.",
      "Cumplir con obligaciones derivadas de la relación que generemos contigo."
    ]
  },
  {
    id: "consentimiento",
    titulo: "4. Consentimiento y registro",
    parrafos: [
      "Al enviar el formulario de contacto o escribirnos por WhatsApp marcando una casilla con tu consentimiento, nos autorizas a tratar tus datos con las finalidades descritas. En WhatsApp, el consentimiento se registra explícitamente cuando aceptas recibir información comercial.",
      "Guardamos registro de ese consentimiento asociado a tu solicitud en nuestra base de datos interna.",
      "Negarte a proporcionar los datos de contacto impide que podamos responder tu solicitud o darte seguimiento."
    ]
  },
  {
    id: "proveedores",
    titulo: "5. Proveedores tecnológicos y transferencias",
    parrafos: [
      "Para operar la plataforma, gestionar leads y atenderte por WhatsApp utilizamos proveedores que pueden tratar datos por cuenta nuestra:"
    ],
    lista: [
      "Supabase: base de datos principal (Postgres) y autenticación. Almacena leads, conversaciones y eventos.",
      "Vercel: hosting y despliegue de la aplicación web (https://qlick-three.vercel.app).",
      "Meta WhatsApp Business Platform (Cloud API): canal de mensajería WhatsApp. Los mensajes que nos envías se procesan a través de Meta. Ver política de privacidad de Meta en https://www.facebook.com/policy.php.",
      "DeepSeek (IA): modelo de lenguaje que utiliza el contenido de tu mensaje (sin tu nombre ni datos sensibles como PII identificable separada) para generar respuestas automáticas. El contenido se envía a los servidores de DeepSeek únicamente para producir la respuesta y no se almacena para entrenamiento."
    ],
    parrafos_end: [
      "Estos proveedores tratan los datos bajo sus propias políticas y únicamente para prestarnos el servicio. No vendemos ni rentamos tus datos."
    ]
  },
  {
    id: "derechos",
    titulo: "6. Tus derechos (ARCO)",
    parrafos: [
      "Puedes ejercer en cualquier momento tus derechos de Acceso, Rectificación, Cancelación y Oposición, así como limitar el uso o divulgación de tus datos y revocar tu consentimiento. Para ello escríbenos a:",
      `${CONTACTO_PRIVACIDAD}`,
      "Responderemos a tu solicitud en un plazo máximo de 20 días hábiles contados a partir de su recepción, y en caso de resultar procedente, se hará efectiva dentro de los 15 días hábiles siguientes a la fecha de comunicación."
    ]
  },
  {
    id: "seguridad",
    titulo: "7. Medidas de seguridad",
    parrafos: [
      "Mantendremos medidas técnicas y administrativas razonables para proteger tus datos. La información de leads y conversaciones se almacena con control de acceso basado en roles (RLS) en la base de datos, de forma que el acceso público está restringido. Las contraseñas, tokens y claves API se almacenan cifradas y nunca se exponen en el código del cliente."
    ]
  },
  {
    id: "eliminacion",
    titulo: "8. Eliminación de datos (Data Deletion Request)",
    parrafos: [
      "Conforme a las políticas de Meta (Facebook) y a la legislación aplicable, cualquier usuario puede solicitar la eliminación completa de sus datos personales de nuestros sistemas.",
      "Para ejercer este derecho, escríbenos a:",
      `${CONTACTO_PRIVACIDAD}`,
      "Incluye en tu mensaje: (1) tu nombre completo, (2) el correo electrónico o número de teléfono asociado a tus datos, y (3) una breve descripción de lo que solicitas.",
      "Procesamos tu solicitud en un plazo máximo de 30 días naturales. Una vez completada la eliminación, te enviaremos una confirmación por correo.",
      "Datos que se eliminan: tu registro como lead, todas las conversaciones de WhatsApp almacenadas, los códigos QR generados para eventos, las notas internas y cualquier referencia a tu persona en el sistema.",
      "Datos que NO podemos eliminar por obligación legal: facturas pagadas (si las hubo), registros de consentimiento (los conservamos para demostrar que diste tu consentimiento en su momento), y cualquier dato requerido por las autoridades fiscales mexicanas."
    ]
  },
  {
    id: "cambios",
    titulo: "9. Cambios a este aviso",
    parrafos: [
      "Podemos actualizar este aviso para reflejar cambios en nuestras prácticas, en la legislación aplicable o en los proveedores que utilizamos. Cualquier cambio relevante se publicará en esta misma página con la fecha de actualización correspondiente.",
      "Te recomendamos revisar periódicamente este aviso."
    ]
  }
];

export default function PrivacidadPage() {
  return (
    <>
      <Navbar />

      <section className="bg-brand-50/40 border-b border-brand-100">
        <Container className="py-16">
          <Badge tone="brand" className="mb-4">
            Legal
          </Badge>
          <h1 className="display-1 text-ink">Aviso de Privacidad</h1>
          <p className="mt-5 text-lg text-ink-soft max-w-2xl">
            Cómo tratamos los datos que nos compartes al contactarnos,
            solicitar información de cursos o escribirnos por WhatsApp.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container size="narrow">
          <div className="space-y-10">
            {secciones.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <SectionHeading title={s.titulo} />
                <div className="mt-4 space-y-3 text-ink-soft leading-relaxed">
                  {s.parrafos.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {s.lista && (
                    <ul className="list-disc pl-6 space-y-1.5">
                      {s.lista.map((li, i) => (
                        <li key={i}>{li}</li>
                      ))}
                    </ul>
                  )}
                  {s.parrafos_end?.map((p, i) => (
                    <p key={`end-${i}`}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Resumen de contacto */}
          <Card className="mt-12 p-8 bg-brand-50/50">
            <h3 className="text-lg font-bold text-ink mb-2">
              Contacto para privacidad y eliminación de datos
            </h3>
            <p className="text-ink-muted text-sm">
              Para ejercer tus derechos ARCO, revocar el consentimiento o
              solicitar la eliminación de tus datos personales:
            </p>
            <p className="mt-3 font-semibold text-brand-700">
              <a href={`mailto:${CONTACTO_PRIVACIDAD}`} className="underline">
                {CONTACTO_PRIVACIDAD}
              </a>
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              {ULTIMA_ACTUALIZACION}
            </p>
          </Card>
        </Container>
      </section>

      <Footer />
    </>
  );
}
