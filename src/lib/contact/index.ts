/** Punto de entrada único para la capa de contacto. */

import type { ContactProvider } from "./contact-provider";
import { getActiveContactProviderName } from "./contact-provider";
import { mockContactProvider } from "./mock-contact-provider";
import { resendContactProvider } from "./resend-contact-provider";
import { crmContactProvider } from "./crm-contact-provider";

export * from "./contact-provider";

const REGISTRY: Record<string, ContactProvider> = {
  mock: mockContactProvider,
  resend: resendContactProvider,
  crm: crmContactProvider
};

export function getContactProvider(): ContactProvider {
  const name = getActiveContactProviderName();
  return REGISTRY[name] ?? mockContactProvider;
}
