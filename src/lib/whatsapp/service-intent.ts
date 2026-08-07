export type ServiceIntentKind =
  | "kickstart_meta_ads"
  | "services_general"
  | "package_question"
  | "ambiguous"
  | "none";

export interface ServiceIntentMatch {
  kind: ServiceIntentKind;
  serviceSlug?: string;
  campaignKey?: string;
  category?: string;
  variantSlug?: string;
}

export interface ServiceIntentContext {
  activeServiceSlug?: string;
}

export function detectServiceIntent(
  text: string,
  context?: ServiceIntentContext
): ServiceIntentMatch {
  if (!text || typeof text !== "string") return { kind: "none" };

  const raw = text.trim();
  const lower = raw.toLowerCase();

  // Exclusiones absolutas: opt-out, botones de eventos o intenciones puras de eventos
  if (
    lower === "info" ||
    lower === "baja" ||
    lower === "stop" ||
    lower === "inscribirme" ||
    lower === "próximos eventos" ||
    lower === "proximos eventos" ||
    lower.startsWith("confirmar ")
  ) {
    return { kind: "none" };
  }

  // 1. Frase prellenada de Campaña Meta Ads
  if (
    lower.includes("videos y publicidad en meta") ||
    lower.includes("kickstart meta ads") ||
    lower.includes("campaña de meta") ||
    lower.includes("anuncios en meta")
  ) {
    return {
      kind: "kickstart_meta_ads",
      serviceSlug: "kickstart-meta-ads",
      campaignKey: "meta_kickstart_august",
      category: "digital",
    };
  }

  // 2. Pregunta explícita de Paquete o Precios (con contexto o con palabras de paquete)
  const isPackageKeyword =
    lower.includes("paquete") ||
    lower.includes("planes") ||
    lower.includes("básico") ||
    lower.includes("basico") ||
    lower.includes("recomendado") ||
    lower.includes("premium") ||
    lower.includes("qué incluye") ||
    lower.includes("que incluye");

  if (isPackageKeyword) {
    if (context?.activeServiceSlug || lower.includes("meta") || lower.includes("servicio") || lower.includes("anuncio")) {
      let variantSlug: string | undefined;
      if (lower.includes("básico") || lower.includes("basico")) variantSlug = "basico";
      if (lower.includes("recomendado")) variantSlug = "recomendado";
      if (lower.includes("premium")) variantSlug = "premium";

      return {
        kind: "package_question",
        serviceSlug: context?.activeServiceSlug || "kickstart-meta-ads",
        category: "digital",
        variantSlug,
      };
    }
  }

  // 3. Intención general de servicios
  if (
    lower.includes("servicios") ||
    lower.includes("agencia") ||
    lower.includes("diseño web") ||
    lower.includes("google business") ||
    lower.includes("consultoría") ||
    lower.includes("consultoria") ||
    lower.includes("videos comerciales") ||
    (lower.includes("publicidad") && !lower.includes("evento"))
  ) {
    return {
      kind: "services_general",
      serviceSlug: "kickstart-meta-ads",
      category: "digital",
    };
  }

  // 4. Frases ambiguas que mencionan información de servicios sin contexto claro
  if (
    lower === "quiero información" ||
    lower === "información por favor" ||
    lower === "me dan información?"
  ) {
    return { kind: "ambiguous" };
  }

  return { kind: "none" };
}
