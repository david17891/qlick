import type { Instructor } from "@/types";

export const instructors: Instructor[] = [
  {
    id: "inst_sofia",
    name: "Sofía Ramírez",
    title: "Estratega Senior de Performance Marketing",
    bio: "Más de 10 años gestionando cuentas de publicidad digital para marcas de consumo, retail y educación. Especialista en Facebook/Meta Ads y embudos de conversión.",
    specialties: ["Meta Ads", "Google Ads", "Embudos", "Analítica"],
    social: {
      linkedin: "https://linkedin.com/in/example",
      instagram: "https://instagram.com/example"
    }
  },
  {
    id: "inst_andres",
    name: "Andrés Medina",
    title: "Consultor de Automatización y CRM",
    bio: "Ayuda a pymes mexicanas a automatizar ventas con WhatsApp, CRM y chatbots. Ha implementado más de 80 procesos de automatización de principio a fin.",
    specialties: ["WhatsApp Business", "CRM", "Chatbots", "Automatización"]
  },
  {
    id: "inst_luisa",
    name: "Luisa Treviño",
    title: "Directora Creativa y Content Strategist",
    bio: "Creadora de contenido y estratega para marcas de consumo. Su trabajo combina narrativa, video corto y branding para comunidades que compran.",
    specialties: ["Contenido", "Video corto", "Branding", "Reels"]
  },
  {
    id: "inst_emilio",
    name: "Emilio Castillo",
    title: "Head of Digital Marketing",
    bio: "Lidera estrategia digital integral para agencias y marcas. Profesor invitado en programas de marketing aplicado en México.",
    specialties: ["Estrategia digital", "Branding", "SEO", "Growth"]
  }
];

const byId = new Map(instructors.map((i) => [i.id, i]));

export function getAllInstructors(): Instructor[] {
  return instructors;
}

export function getInstructorById(id: string): Instructor | null {
  return byId.get(id) ?? null;
}
