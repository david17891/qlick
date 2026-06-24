import type { Metadata } from "next";
import { Navbar, Footer } from "@/components/layout";
import { Container, Card, Badge, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Aviso de Privacidad | Qlick",
  description:
    "Aviso de privacidad inicial de Qlick Marketing Integral: cómo tratamos los datos del formulario de contacto, la gestión de leads y tus derechos ARCO.",
  alternates: { canonical: "/privacidad" }
};

/**
 * ⚠️ AVISO LEGAL — versión inicial, no es asesoría legal definitiva.
 *
 * Este texto es una base para que el responsable lo revise con asesor legal
 * antes de operación formal. Mientras no se valide, los placeholders marcados
 * con TODO deben tratarse como NO confirmados:
 *   - Correo del responsable: privacidad@qlick.mx (placeholder).
 *   - Domicilio físico: omitido a propósito hasta confirmarlo.
 *   - Fecha de entrada en vigor: se actualiza al validar.
 *
 * No inventar datos de contacto ni domicilios: si falta información, se
 * documenta como pendiente en lugar de rellenar con datos falsos.
 */
const RESPONSABLE = "Qlick Marketing Integral";
const CONTACTO_PRIVACIDAD = "privacidad@qlick.mx"; // TODO: confirmar correo oficial
const ULTIMA_ACTUALIZACION = "Versión inicial — pendiente de validación legal";

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
      "A través del formulario de contacto y la solicitud de información de cursos recabamos los siguientes datos personales:"
    ],
    lista: [
      "Nombre completo",
      "Correo electrónico",
      "Número de teléfono / WhatsApp (opcional)",
      "Curso o tema de interés y el mensaje que nos envíes",
      "Marca de consentimiento para ser contactado"
    ]
  },
  {
    id: "finalidades",
    titulo: "3. Finalidades del tratamiento",
    parrafos: [
      "Tus datos se utilizan exclusivamente para:"
    ],
    lista: [
      "Atender tu solicitud de información sobre cursos y servicios.",
      "Darte seguimiento comercial como lead (gestión de prospectos).",
      "Comunicarnos contigo por WhatsApp, correo electrónico o teléfono.",
      "Clasificar tu interés y mejorar la respuesta que te damos.",
      "Cumplir con obligaciones derivadas de la relación que generemos contigo."
    ]
  },
  {
    id: "consentimiento",
    titulo: "4. Consentimiento y registro",
    parrafos: [
      "Al enviar el formulario de contacto marcas una casilla con la que das tu consentimiento para que tratemos tus datos con las finalidades descritas. Guardamos registro de ese consentimiento asociado a tu solicitud.",
      "Negarte a proporcionar los datos de contacto impide que podamos responder tu solicitud o darte seguimiento."
    ]
  },
  {
    id: "proveedores",
    titulo: "5. Proveedores tecnológicos y transferencias",
    parrafos: [
      "Para operar la plataforma y almacenar la información de leads utilizamos proveedores que pueden tratar datos por cuenta nuestra:"
    ],
    lista: [
      "Supabase: base de datos y almacenamiento de la información de leads.",
      "Vercel: hosting y despliegue de la aplicación web.",
      "WhatsApp (click-to-chat): comunicación contigo; no usamos la WhatsApp Business API para mensajería outbound automatizada en esta fase."
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
      `${CONTACTO_PRIVACIDAD}`
    ]
  },
  {
    id: "seguridad",
    titulo: "7. Medidas de seguridad",
    parrafos: [
      "Mantendremos medidas técnicas y administrativas razonables para proteger tus datos. La información de leads se almacena con control de acceso basado en roles (RLS) en la base de datos, de forma que el acceso público está restringido."
    ]
  },
  {
    id: "cambios",
    titulo: "8. Cambios a este aviso",
    parrafos: [
      "Podemos actualizar este aviso. Cualquier cambio relevante se publicará en esta misma página con la fecha de actualización correspondiente."
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
            Cómo tratamos los datos que nos compartes al contactarnos o
            solicitar información de cursos.
          </p>
        </Container>
      </section>

      <section className="py-16">
        <Container size="narrow">
          {/* Nota legal destacada */}
          <Card className="p-6 mb-10 border-amber-200 bg-amber-50/60">
            <h2 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
              ⚠️ Documento inicial — pendiente de validación legal
            </h2>
            <p className="text-sm text-amber-900/90 leading-relaxed">
              Este aviso es una versión inicial para Qlick Marketing Integral y{" "}
              <strong>no constituye asesoría legal definitiva</strong>. Debe ser
              revisado por asesor legal antes de la operación formal. El correo
              de contacto de privacidad y otros datos marcados como pendientes
              deben confirmarse antes de su uso oficial.
            </p>
          </Card>

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
              Contacto para privacidad
            </h3>
            <p className="text-ink-muted text-sm">
              Para ejercer tus derechos ARCO, revocar el consentimiento o
              cualquier duda sobre el tratamiento de datos:
            </p>
            <p className="mt-3 font-semibold text-brand-700">
              {CONTACTO_PRIVACIDAD}
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
