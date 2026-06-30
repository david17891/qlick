# Partner Meta Setup — Manual para el socio

> Audiencia: tu socio que opera Meta Business. NO necesita saber programar. Necesita hacer
> clicks y mandarte lo que le pedís. Tiempo total: 3 minutos (si ya verificó) o 45-90 min
> (incluyendo verificación).

## Resumen ejecutivo

El socio necesita hacer **una sola cosa**: agregarte como Admin en su Meta Business para
que vos configures el WhatsApp Business + los ads + el bot. Después de eso, él sigue
manejando las campañas como siempre desde su cuenta.

## Lo que el socio tiene que hacer (3 minutos)

```
1. Abrí https://business.facebook.com/settings/people
2. Click "Agregar persona"
3. Poné mi correo: david17891@gmail.com
4. Rol: Administrador (o "Desarrollador" si quiere limitarte)
5. Tildá: Páginas de Facebook + Cuentas publicitarias
6. Aprobar
```

Si la cuenta publicitaria le pregunta nivel de acceso, elegí **"Ver insights"** (el más
simple — solo lectura de métricas, no creación de campañas, no facturación).

## Cómo lo convences si se resiste

### Si dice "es muy complicado, te doy la clave"

NO aceptar. Razones concretas:

- Meta penaliza cuentas con clave de admin compartida. Si suspenden, perdés el número de
  WhatsApp Y la cuenta de anuncios.
- Sin roles no hay audit log de quién hizo qué.
- Si te vas del proyecto, el socio tiene que cambiar TODAS las contraseñas; con roles,
  te remueve en 30 segundos.

Pitch concreto:

> "Mirá, todo el setup técnico lo hago yo. Lo único que necesito es que me agregues
> como 'Developer' en tu Meta Business para tener acceso yo. Es 3 minutos: entrás a
> business.facebook.com, configuración, personas, agregar, mi email, y listo. Así vos
> quedás como dueño de la cuenta publicitaria y yo solo opero. Si algo sale mal, Meta
> tiene el log de quién hizo qué."

### Si dice "no veo el link directo"

Meta no da link mágico por seguridad. Pero tenés 3 opciones de menor a mayor control:

| Opción | Esfuerzo del socio | Resultado |
|---|---|---|
| **A. Link + screenshots** | 5 min | Él solo con tu ayuda visual |
| **B. Video de 30 seg** | 0 min | Vos grabás un screencast y se lo mandás |
| **C. Llamada 5 min con compartir pantalla** | 0 min | Vos operás, él mira y dice "sí, siguiente" |

Recomendado: opción C. Pitch:

> "Dame 5 minutos, te llamo por Meet/Zoom/WhatsApp video, compartís pantalla y yo te
> hago los clicks. Vos solo decís 'sí, siguiente'. Después manejo todo yo, no te molesto más."

## Qué pasa DESPUÉS de que el socio te agrega

Vos hacés todo el setup técnico solo:

1. **Verificar empresa** (subir RFC, acta constitutiva) — 15 min, Meta tarda 24-48h
2. **Crear App en Meta for Developers** — 10 min
3. **Crear WABA + comprar número MX** — 15 min
4. **Cargar las 7 plantillas de WhatsApp** — 30 min, Meta tarda 24h en aprobar
5. **Generar Access Token** — 2 min

Si la cuenta del socio ya está verificada, todo lo anterior se hace en su Business Manager.
Si NO está verificada, Meta rechaza la creación del App.

## Qué necesitás mandarme vos (socio) cuando termine

```
✅ PASO 1: Business Account ID (Settings → Info → ID)
✅ PASO 2: Empresa verificada (screenshot del estado)
✅ PASO 3: App ID (Settings → Básica → ID de la app)
✅ PASO 4: WABA ID + Phone Number ID + número internacional (+52...)
✅ PASO 5: Access Token (EAAxxxxx...)
✅ PASO 6: Templates aprobados (screenshot del panel con IDs)
```

## Si se traba

Mandame screenshot + número de paso por WhatsApp. Te destrabo en 30 segundos.

Email: david17891@gmail.com
Tel: el que ya tenés.

---

## Anexo A: Estructura del Meta Business (para entender qué hace cada cosa)

```
Meta Business Manager
├── Página de Facebook (identidad de la marca)
├── Cuenta publicitaria (ad account) — donde corren los ads
├── Catálogo (solo si venden productos online)
├── Cuentas de Instagram (opcional)
└── WhatsApp Business Account (WABA)
    ├── Número de teléfono (donde llegan los mensajes)
    ├── Plantillas de mensaje (Meta aprueba cada una, ~24h)
    └── API access (token + webhook)
```

## Anexo B: Setup técnico que YO hago cuando tengo los tokens del socio

### 1. Verificar empresa

- Settings → Seguridad de la marca → Iniciar verificación
- Subir: RFC, acta constitutiva o constancia de situación fiscal del SAT
- Meta tarda minutos a 48h hábiles

### 2. Crear App en Meta for Developers

URL: `https://developers.facebook.com/apps/create/`

Tipo: **Negocios (Business)**
Nombre: "Qlick WhatsApp Bot" (o como prefieras)
Email: `david17891@gmail.com`

Una vez creada:
- Configuración → Básica → completar URL de política de privacidad (`https://qlick.mx/privacidad`)
- Agregar producto "WhatsApp" → "Configurar"

### 3. Crear WABA + comprar número MX

En el App: WhatsApp → Configuración de la API:

- Crear cuenta de WhatsApp Business
- Seleccionar Business Manager (el del socio)
- Nombre: "Qlick Marketing"
- Moneda: MXN
- País/área: México / CDMX (o Monterrey/Guadalajara)
- Comprar número (~$12-15 USD one-time + $3-6 USD/mes según país)
- Verificar con código SMS

### 4. Cargar las 7 plantillas

URL: WhatsApp → Configuración de la API → Plantillas de mensajes

Por cada una, llenar:
- Nombre (ej: `conf_bienvenida`)
- Categoría: **Utility** (todas)
- Idioma: Español (México)
- Header: texto o sin header
- Body: ver `docs/WHATSAPP_FUNNEL_DESIGN.md` (con variables `{{1}}`, `{{2}}` literales)
- Footer: opcional

Submit. Meta tarda hasta 24h en aprobar.

### 5. Generar Access Token permanente

URL: WhatsApp → Configuración de la API → Token de acceso

- Generar token
- Permisos: `whatsapp_business_management`, `whatsapp_business_messaging`
- ⚠️ COPIAR INMEDIATAMENTE — Meta solo lo muestra una vez
- Guardar en lugar seguro (1Password, Bitwarden, etc.) — NO email, NO Slack

### 6. Configurar webhook

URL del webhook: `https://qlick.mx/api/whatsapp/webhook`
Verify token: (lo defines vos — un string random; lo guardás en Vercel env `WHATSAPP_WEBHOOK_VERIFY_TOKEN`)

Campos a suscribir: `messages`, `message_status` (entregado/leído).

## Anexo C: Lo que el socio sigue manejando después del setup

- Crear campañas en Meta Ads Manager (vos no tocas)
- Pagar la cuenta publicitaria (vos no ves tarjeta)
- Crear/borrar la cuenta del Business (admin only)
- Ver reportes de ads (vos también ves)
- Manejar el número de WhatsApp (vos también manejás)
- Configurar el bot en Qlick (vos hacés — él no necesita)
- Generar tokens técnicos (vos hacés — él no necesita)
- **Removerte del Business** en 30 segundos si cambia la relación
