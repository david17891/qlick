# Meta WhatsApp Setup — Qlick Marketing Digital (multi-cliente)

> Audience: David (developer) configurando Meta para el bot de Qlick, dentro del
> portafolio multi-cliente **"Negocio de Paul Velasquez"** (Mexicali, BC).
> Fecha de inicio: 2026-06-30. Horizonte: conferencia 6 de julio 2026.

## TL;DR

El setup del bot de WhatsApp para Qlick vive **dentro** del portafolio comercial
de Paul ("Negocio de Paul Velasquez"), pero **aislado** en su propio WhatsApp
Business Account (WABA) dedicado, atado a la página de Facebook
**"Qlick Marketing Digital"**. NO se comparte WABA, App, ni número con otros
clientes del portafolio (Casa Geriátrica, Llantera, BAXA, etc.).

## Patron multi-cliente (por que importa)

El portafolio "Negocio de Paul Velasquez" tiene **varias paginas** registradas
(clientes distintos):

| Pagina de Facebook | Proposito | WABA actual |
|---|---|---|
| Casa Geriatrica de Mexicali | Cliente (geriatrico) | WABA propio (Ya Verificado) |
| Llantera los Compadres | Cliente (llantera) | sin WABA |
| Qlick Marketing Digital | **Nuestra pagina** | sin WABA (a crear) |
| BAXA Eventos | Cliente (eventos) | sin WABA |
| La Birria De Mi Tierra | Cliente (restaurante) | sin WABA |
| No Usar Esta Pagina | placeholder | N/A |

**Regla inquebrantable:** para Qlick creamos un **WABA dedicado, atado a la
pagina "Qlick Marketing Digital"**. NUNCA compramos numeros ni usamos tokens
de WABAs de otros clientes. Razones:
- Identidad de marca: los mensajes llegan firmados como "Qlick Marketing
  Digital", no como "Casa Geriatrica" (craso para el lead).
- Compliance LFPDPPP: cada cliente maneja su propio consentimiento, no se cruza.
- Facturacion: cada WABA tiene su propio metodo de pago, factura separada.
- Auditoria: si Meta suspende una cuenta, no cae el resto.

## Estado actual del setup (2026-06-30 12:30)

| Paso | Quien | Status |
|---|---|---|
| David agregado como Admin al Negocio de Paul Velasquez | Hecho (socio lo autorizo) | Listo |
| Empresa verificada en Meta | Verificado activo | Listo |
| Pagina "Qlick Marketing Digital" accesible | Si (sin badge de revision) | Listo |
| App de Meta for Developers creada | **En curso** (nombre tentativo "Qlick_wb" o "Qlick Bot") | Pendiente App ID |
| WABA "Qlick Marketing Digital" dedicado creado | Pendiente | Pendiente |
| Numero MX comprado (lada 686, Mexicali) | Pendiente | Pendiente |
| Metodo de pago agregado al WABA | Pendiente (ver bloqueos abajo) | Bloqueado |
| 7 plantillas de WhatsApp cargadas | Pendiente (post-numero) | Pendiente |
| Access Token permanente generado | Pendiente | Pendiente |
| Webhook configurado + verificado | Pendiente (requiere dominio production) | Pendiente |

## Bloqueos activos

### 1. Metodo de pago del WABA

El Business Manager del portafolio NO tiene tarjeta corporativa cargada para
WhatsApp. Cuando lleguemos al paso "Configuracion de pago" del WABA nuevo,
Meta va a pedir una tarjeta.

**Opciones:**
- **A. Pedirle a Paul** que cargue su tarjeta corporativa (para facturacion
  del lado de Paul).
- **B. Cargar tarjeta personal/de la empresa de Qlick** independiente del
  portafolio (David maneja).
- **C. Comprar saldo prepago** via Meta Ads Manager si Paul prefiere no
  poner tarjeta corporativa.

Sin metodo de pago, NO podemos comprar numero. Por eso bloqueamos aca hasta
resolver.

### 2. SMS de verificacion del numero

Al comprar el numero Meta manda un SMS con codigo de 6 digitos. Necesitamos
celular a mano. Candidato esperado: **+52 1 686 ...** (personal de David)
o el de Paul. Cualquiera sirve, el codigo se mete manual en el panel.

## Lo que hace David (developer) en el setup

### Paso 1: Crear App en Meta for Developers

URL: https://developers.facebook.com/apps/create/

1. Tipo: **Negocios (Business)**
2. Nombre de la app: **"Qlick_wb"** o **"Qlick Bot"** (NO incluir
   "WhatsApp"/"Facebook"/"Meta"/"Instagram" en el nombre — Meta rechaza)
3. Email de contacto: `david17891@gmail.com`
4. Business Manager Portfolio: **"Negocio de Paul Velasquez"**
5. Aceptar requisitos
6. Crear

**Output esperado:** App ID (numero largo, arriba a la izquierda).

### Paso 2: Crear WhatsApp Business Account dedicado

Desde la App creada:

1. Sidebar izquierdo → **Agregar producto** → WhatsApp → **Configurar**
2. Aceptar terminos del WABA
3. Business Manager: **Negocio de Paul Velasquez**
4. Crear nueva cuenta WhatsApp Business:
   - WABA Name: **"Qlick Marketing Digital"**
   - Pais: Mexico
   - Moneda: MXN
   - **Pagina de Facebook a vincular: "Qlick Marketing Digital"** (no Casa
     Geriatrica, no Llantera, NO compartir con otros clientes)

**Output esperado:** WABA ID (string numerico largo).

### Paso 3: Comprar numero de telefono MX

En WABA → Configuracion de API → Numeros de telefono → **Add**:

1. Pais: **Mexico**
2. Area / ciudad: **Mexicali, BC** (lada **686**, no 656)
3. Meta lista numeros disponibles que arrancan con 686
4. Elegir uno → **Comprar**
5. Ingresar metodo de pago (si pide)
6. Verificar via SMS (codigo llega al celular que pongas)

**Output esperado:** Phone Number ID (otro ID numerico) + numero en formato
internacional `+52 1 686 XXX XXX`.

### Paso 4: Generar Access Token permanente

En la App → WhatsApp → **API Setup** → **Generar token**:

1. Permisos requeridos:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
2. Copiar el token inmediatamente (Meta lo muestra UNA vez).
3. Por default es temporal (24h). Para hacerlo permanente, generar como
   **System User Token** desde Business Settings → System Users.

**Output esperado:** Access Token tipo `EAAxxxxx...` o nuevo formato `sb_...`.

### Paso 5: Cargar las 7 plantillas de WhatsApp

WhatsApp → Configuracion de API → **Plantillas de mensajes**.

Las 7 plantillas (con copy exacto, variables, idioma, categoria) estan en
`docs/WHATSAPP_FUNNEL_DESIGN.md` seccion "Plantillas a aprobar". Por cada una:

- Nombre: `conf_bienvenida`, `conf_recordatorio24h`, etc.
- Categoria: **Utility**
- Idioma: **Español (Mexico)**
- Header: texto o sin header
- Body con variables `{{1}}`, `{{2}}` literales (Meta las valida)
- Footer: opcional (recomendado "Qlick Marketing Digital")
- Submit → Meta tarda hasta 24h en aprobar.

**Output esperado:** screenshot del panel con las 7 plantillas + sus IDs.

### Paso 6: Configurar webhook

Una vez que el bot este corriendo en Vercel (rama `feat/fase-6-llm-switch` o
master):

App → WhatsApp → **Configuracion** → **Webhook**:

- **Callback URL**: `https://qlick-three.vercel.app/api/whatsapp/webhook`
- **Verify Token**: el valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN` en Vercel env vars
- Suscribirse a los campos: **messages** + **message_status** (entregado/leido).

### Paso 7: Smoke test end-to-end

1. David manda "hola" desde su WhatsApp personal al numero +52 1 686 ...
2. El bot (rama feat/fase-6-llm-switch) lo recibe via webhook
3. El bot contesta con template `conf_bienvenida` o sugerencia heuristica
4. David valida visualmente que el mensaje se ve correcto

## Variables de entorno resultantes

Una vez terminado todo, David setea en `.env.local` + Vercel:

```bash
# Nuevas (Fase 6 Hito D)
WHATSAPP_CLOUD_APP_ID=...                    # App ID de Meta for Developers
WHATSAPP_CLOUD_WABA_ID=...                   # WABA ID del paso 2
WHATSAPP_CLOUD_PHONE_NUMBER_ID=...           # Phone Number ID del paso 3
WHATSAPP_CLOUD_ACCESS_TOKEN=...              # Token permanente del paso 4
```

Las 3 que ya existian no cambian:
- `WHATSAPP_CLOUD_API_VERSION` (default v20.0)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_WEBHOOK_SECRET`

## Naming de la App: regla inquebrantable

Meta for Developers BLOQUEA nombres de App que contengan:
- "WhatsApp", "Facebook", "Meta", "Instagram", "Messenger", "Oculus", "Rift"
- Abreviaciones tipo "FB", "Face", "Book", "Insta", "Gram"
- Variantes que se "perciban o podrian percibirse como referencia" a esas marcas

Mensaje literal del rechazo: "No se permiten algunos terminos, como 'whatsapp'.
Por ejemplo, no puedes usar nuestras marcas comerciales o elementos de marca,
como FB, Face, Book, Insta, Gram y Rift..."

**Patron valido:** nombre generico sin canales. Para Qlick, nombres que funcionan:
- "Qlick Bot" (minimalista, future-proof)
- "Qlick_wb" (lo que intento David el 2026-06-30, fue aceptado por Meta)
- "Qlick Marketing Bot" / "Qlick Funnel Bot"

## Documentos relacionados

- `docs/WHATSAPP_FUNNEL_DESIGN.md` — diseno completo del bot (plantillas, regex,
  compliance LFPDPPP, edge cases).
- `docs/STATUS.md` — snapshot vivo del estado del setup + DB + LLM switch.
- `docs/DB_AUDIT_2026-06-30.md` — estado del schema de Supabase.
- `docs/FASE2_FUNNEL_AUTOMATIZADO.md` — plan de los 4 cron jobs para la
  conferencia del 6 jul.

## Que hacer si se traba

Mandame screenshot + el numero de paso por WhatsApp o en sesion Mavis. Te
destrabo en 30 segundos.
