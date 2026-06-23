# Estrategia de Pagos en México — Qlick Marketing Integral

> Estado actual: **MVP** usa `mock-provider` (pagos simulados).
> La arquitectura ya soporta Mercado Pago, Stripe y Conekta mediante la interfaz
> `PaymentProvider`. La integración real se activa en la **Fase 2**.

## ⚠️ Estado actual

No se procesan pagos reales. Todas las transacciones son simuladas por
`src/lib/payments/mock-provider.ts`. Esto permite recorrer toda la UI de compra
(estados: aprobado, pendiente, rechazado) sin tocar APIs externas.

El proveedor activo se elige con `NEXT_PUBLIC_PAYMENT_PROVIDER`. Por defecto es
`mock`. Para cambiarlo:

```env
# .env.local
NEXT_PUBLIC_PAYMENT_PROVIDER=mercadopago   # o stripe, conekta
```

## Proveedores evaluados

### 1. Mercado Pago (opción práctica para México)

**Por qué considerarlo**
- Plataforma más adoptada en México: tarjeta, OXXO, SPEI y billetera Mercado Pago.
- Conversión alta por confianza del usuario con la marca.
- Checkout Pro reduce fricción (no captura tarjeta en el sitio).
- Webhooks y notificaciones IPN estables.

**Consideraciones**
- Comisiones competitivas para métodos locales.
- Panel en español, soporte local.
- Documentación amplia.

**Cuándo elegirlo**
- Si la prioridad es maximizar conversión en México con métodos locales.
- Para validar el modelo rápido con la menor fricción posible.

**Archivo:** `src/lib/payments/mercadopago-provider.ts` (stub, Fase 2).

### 2. Stripe (opción flexible, internacional)

**Por qué considerarlo**
- Tarjeta, OXXO y SPEI disponibles en México.
- Webhooks robustos, 3DS, y panel de primera calidad.
- Mejor experiencia de developer y documentación técnica.
- Escala bien si se planea vender a otros países.

**Consideraciones**
- Conversión local puede ser menor que Mercado Pago para métodos mexicanos.
- Comisiones competitivas en tarjeta, un poco más altas en efectivo.
- Excelente para suscripciones y MSI en el futuro.

**Cuándo elegirlo**
- Si se proyecta expansión internacional o se quiere la mejor tooling.
- Para suscripciones recurrentes y modelos SaaS.

**Archivo:** `src/lib/payments/stripe-provider.ts` (stub, Fase 2).

### 3. Conekta (opción fuerte para métodos locales)

**Por qué considerarlo**
- Especializado en México: tarjeta, OXXO, SPEI, wallets.
- Soporte nativo para facturación CFDI (útil para B2B).
- Buen manejo de MSI (meses sin intereses).

**Consideraciones**
- Marca menos conocida que Mercado Pago para el consumidor final.
- Comisiones competitivas.
- Documentación técnica correcta pero más árida que Stripe.

**Cuándo elegirlo**
- Si la facturación electrónica y los MSI son prioritarios.
- Para B2B o clientes que exigen CFDI automático.

**Archivo:** `src/lib/payments/conekta-provider.ts` (stub, Fase 2).

## Comparativa rápida

| Criterio              | Mercado Pago    | Stripe          | Conekta         |
| --------------------- | --------------- | --------------- | --------------- |
| Conversión MX         | 🟢 Alta         | 🟡 Media        | 🟡 Media        |
| Tarjeta               | ✅              | ✅              | ✅              |
| OXXO                  | ✅              | ✅              | ✅              |
| SPEI                  | ✅              | ✅              | ✅              |
| Wallet                | ✅              | ⚠️ Limitada     | ✅              |
| MSI                   | ✅              | ✅              | ✅              |
| Facturación CFDI      | ⚠️ Manual       | ⚠️ Manual       | ✅ Nativa       |
| Webhooks              | ✅              | ✅              | ✅              |
| Expansión internacional| 🟡 LATAM       | 🟢 Global       | 🟡 MX foco      |
| Experiencia dev       | 🟡              | 🟢 Excelente    | 🟡              |

## Arquitectura

```
src/lib/payments/
├── payment-provider.ts       # Interfaz PaymentProvider + factory
├── mock-provider.ts          # ✅ Activo en MVP (simulado)
├── mercadopago-provider.ts   # 🔜 Stub (Fase 2)
├── stripe-provider.ts        # 🔜 Stub (Fase 2)
├── conekta-provider.ts       # 🔜 Stub (Fase 2)
└── index.ts                  # Punto de entrada único
```

El resto del sistema importa exclusivamente desde `@/lib/payments` y nunca
toca un SDK concreto. Para activar un proveedor real:

1. Instalar el SDK: `npm i <sdk>`.
2. Configurar las variables de entorno (ver `.env.example`).
3. Implementar `createCheckout`, `getStatus` y `parseWebhook` en el provider.
4. Cambiar `NEXT_PUBLIC_PAYMENT_PROVIDER` al proveedor elegido.

## Flujo de pago contemplado

El sistema contempla los siguientes escenarios:

- **Compra de curso individual** (caso principal).
- **Acceso gratuito** (curso gratis o `amount = 0`).
- **Cupón de descuento** (porcentaje o monto fijo, ver `Coupon`).
- **Pago pendiente** (OXXO, SPEI esperando confirmación).
- **Pago aprobado** (acceso automático al curso).
- **Pago rechazado** (reintentar o cambiar método).
- **Pago vencido** (referencia expirada).
- **Webhooks** (recibir actualización del proveedor, Fase 2).
- **Historial de pagos** (visible en dashboard y admin).
- **Facturación** (CFDI, pendiente — Fase 2).

## Recomendación para la Fase 2

Arrancar con **Mercado Pago** para validar conversión con el menor costo de
integración. Una vez validado el modelo, evaluar Stripe para escalar o Conekta
si la facturación CFDI se vuelve crítica.

## Seguridad

- **Nunca** procesar tarjetas directamente en el frontend.
- Usar siempre el Checkout hosted / embed del proveedor (PCI compliance cubierta).
- Validar la firma de cada webhook antes de aprobar el acceso.
- El acceso a cursos se concede **solo** tras webhook verificado, no tras redirect.
- Guardar `externalReference` para conciliar con el panel del proveedor.
