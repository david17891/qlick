/**
 * Punto de entrada único para la capa de pagos.
 * El resto del sistema importa desde aquí y nunca toca un SDK concreto.
 */

import type { PaymentProvider } from "./payment-provider";
import { getActivePaymentProviderName } from "./payment-provider";
import { mockProvider } from "./mock-provider";
import { mercadopagoProvider } from "./mercadopago-provider";
import { stripeProvider } from "./stripe-provider";
import { conektaProvider } from "./conekta-provider";

export * from "./payment-provider";

const REGISTRY: Record<string, PaymentProvider> = {
  mock: mockProvider,
  mercadopago: mercadopagoProvider,
  stripe: stripeProvider,
  conekta: conektaProvider
};

export function getPaymentProvider(): PaymentProvider {
  const name = getActivePaymentProviderName();
  return REGISTRY[name] ?? mockProvider;
}

export function listPaymentProviders(): PaymentProvider[] {
  return Object.values(REGISTRY);
}
