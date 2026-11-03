# CRM Inteligente EYAQ · Frontend (ft-crm)

Frontend del CRM para **Sabor Mágico Grill**: Bandeja, Solicitudes, Calendario, Estadísticas, Clientes y Ajustes,
según el mockup aprobado (`docs/diseno/`). Next.js 16 (App Router) + TypeScript + Tailwind v4 + TanStack Query.

- **Backend:** `bk-crm` (NestJS). El navegador nunca habla directo con él: el servidor de Next.js hace de
  intermediario (BFF) y guarda la sesión en cookies `httpOnly`.
- **Modo simulado (mock):** backend en memoria con el mismo contrato que bk-crm, datos de ejemplo y un
  simulador de canales (cliente, Samanta y dueño). Permite probar el flujo completo sin Meta ni IA.

---

## 1. Requisitos

- Node.js **20.9 o superior** (lo exige Next.js 16) y npm.
- Para las pruebas de punta a punta: el navegador de Playwright (una sola vez):
  `npx playwright install chromium`

## 2. Arranque local en modo simulado

En **PowerShell** (Windows), dentro de la carpeta `ft-crm`:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

En Linux o Mac: `npm install && cp .env.example .env.local && npm run dev`.

Abre <http://localhost:5173>. Usuarios de ejemplo (contraseña `demo1234`, o la de `CRM_MOCK_PASSWORD`):

| Correo | Rol | Qué puede hacer |
| --- | --- | --- |
| `frank@eyaqsystems.com` | Administrador | Todo, incluida la configuración y los usuarios |
| `ricardo@sabormagico.pe` | Propietario | Ver todo; no modifica nada (así lo define el backend) |
| `camila@sabormagico.pe` | Operador | Atender la Bandeja, preparar reservas, cancelar solicitudes |
| `soporte@eyaqsystems.com` | Soporte EYAQ | Sin vistas de negocio (el backend le responde 403) |

Los datos simulados viven en memoria: al reiniciar el servidor vuelven a los datos de ejemplo.

## 3. Simulador de canales (solo modo simulado)

`/api/dev/simulador` hace de cliente, de Samanta y del dueño para recorrer el flujo central:

| Acción | Qué simula |
| --- | --- |
| `entrante` | Un mensaje de un cliente (nuevo o en una conversación existente) llega a la Bandeja |
| `samanta` | Una respuesta automática de Samanta (no escribe si la conversación está en pausa) |
| `solicitud` | Samanta confirma fecha, hora, personas y servicio, y crea la solicitud **esperando al dueño**. Solo acepta servicios activos y aprobados. Con **más de 20 personas** no crea la solicitud y pasa la conversación a una persona |
| `dueno` | El dueño responde `ACEPTAR` (la reserva entra al calendario) o `RECHAZAR` (Samanta propone otra fecha u hora) |
| `reiniciar` | Restaura los datos de ejemplo y cierra todas las sesiones |

Ejemplo completo en **PowerShell** (con `npm run dev` corriendo):

```powershell
$sim = "http://localhost:5173/api/dev/simulador"
Invoke-RestMethod $sim     # ids de conversaciones, solicitudes y servicios disponibles

# 1. Llega un mensaje por WhatsApp
$c = Invoke-RestMethod -Method Post -Uri $sim -ContentType "application/json" `
  -Body '{"accion":"entrante","texto":"Hola, quiero reservar","canal":"WHATSAPP","nombre":"Ana Prueba"}'

# 2. Samanta crea la solicitud (fecha futura con zona horaria)
$s = Invoke-RestMethod -Method Post -Uri $sim -ContentType "application/json" `
  -Body (@{ accion = "solicitud"; conversationId = $c.conversationId; fecha = "2026-10-20T20:00:00-05:00"; personas = 4 } | ConvertTo-Json)

# 3. El dueño acepta por WhatsApp: la reserva aparece en el Calendario
Invoke-RestMethod -Method Post -Uri $sim -ContentType "application/json" `
  -Body (@{ accion = "dueno"; requestId = $s.requestId; decision = "ACEPTAR" } | ConvertTo-Json)
```

Lo mismo con **curl** (Linux, Mac o Git Bash):

```bash
SIM=http://localhost:5173/api/dev/simulador
curl -s -X POST $SIM -H 'content-type: application/json' \
  -d '{"accion":"entrante","texto":"Hola, quiero reservar","canal":"WHATSAPP","nombre":"Ana Prueba"}'
curl -s -X POST $SIM -H 'content-type: application/json' \
  -d '{"accion":"solicitud","conversationId":"<id>","fecha":"2026-10-20T20:00:00-05:00","personas":4}'
curl -s -X POST $SIM -H 'content-type: application/json' \
  -d '{"accion":"dueno","requestId":"<id>","decision":"ACEPTAR"}'
```

Fuera del modo simulado el simulador responde 404.

## 4. Conectar con bk-crm (modo real)

1. Levanta bk-crm según su README (por defecto en el puerto 3000).
2. **Antes de probar envíos**, revisa `WHATSAPP_ENABLED` en el `.env` de bk-crm: si está en `true` y tiene
   credenciales, enviar un mensaje desde la Bandeja **manda un WhatsApp real** a través de Meta. Para
   desarrollo de la interfaz, déjalo en `false` (el envío responderá «WhatsApp no está habilitado»).
3. En `ft-crm/.env.local`:

   ```ini
   CRM_BACKEND_MODE=live
   CRM_BACKEND_URL=http://localhost:3000
   ```

4. Reinicia `npm run dev`.
5. En bk-crm, `FRONTEND_RESET_PASSWORD_URL` debe apuntar a `<origen del frontend>/reset-password`
   (su valor por defecto, `http://localhost:5173/reset-password`, ya coincide con este proyecto).

Con el backend real, hoy **no** se generan los estados del dueño (Esperando, Aceptada, Rechazada) ni los
mensajes de Samanta, porque bk-crm aún no tiene ese flujo ni la IA (ver sección 8).

## 5. Variables de entorno

Las del frontend están en `.env.example`. Las `CRM_*` son solo del servidor y nunca llegan al navegador.

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `CRM_BACKEND_MODE` | `live` | `live` = bk-crm real; `mock` = backend simulado |
| `CRM_BACKEND_URL` | `http://localhost:3000` | URL de bk-crm, sin barra final (solo la usa el servidor) |
| `CRM_BACKEND_TIMEOUT_MS` | `15000` | Techo de tiempo por llamada al backend |
| `CRM_COOKIE_SECURE` | automático | `true` en producción; exige HTTPS |
| `CRM_MOCK_PASSWORD` | `demo1234` | Contraseña de los usuarios simulados |
| `CRM_ENABLE_SIMULATOR` | `true` | Simulador de canales (solo en modo mock) |
| `CRM_MOCK_LATENCY_MS` | `120` | Latencia artificial de las respuestas simuladas |
| `CRM_ALLOW_MOCK_IN_PRODUCTION` | `false` | El modo mock no arranca en producción salvo que esto sea `true` |
| `NEXT_PUBLIC_INBOX_POLL_MS` | `6000` | Cada cuánto se actualiza la lista de la Bandeja |
| `NEXT_PUBLIC_CHAT_POLL_MS` | `4000` | Cada cuánto se actualiza el chat abierto |

**Claves, número del dueño y tokens de Meta** van en el servidor de **bk-crm**, nunca en el frontend ni en
el repositorio: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_APP_SECRET`, `RESEND_API_KEY` (ver
`bk-crm/.env.example`). bk-crm todavía **no** tiene variable para el WhatsApp personal del dueño ni para la
clave de la IA: se agregarán cuando exista ese flujo (pendiente en el backend).

## 6. Pruebas

```powershell
npm run lint        # ESLint
npm run typecheck   # tipos (genera los tipos de rutas de Next y ejecuta tsc)
npm test            # Vitest: lógica, flujo de solicitudes, sesión del BFF, permisos
npm run test:e2e    # Playwright: flujo completo en el navegador y cada vista por rol
npm run build       # build de producción
```

- `npm test` incluye el **flujo de solicitud** contra el backend simulado (`src/lib/mock/request-flow.test.ts`):
  mensaje entrante, solicitud esperando al dueño, ACEPTAR → reserva en el calendario, RECHAZAR → sin
  reserva y nueva propuesta, grupos de más de 20 personas, toma de control del operador e idempotencia.
- `npm run test:e2e` reutiliza el servidor de `http://localhost:5173` si ya está corriendo; si no, levanta
  `npm run dev` en modo simulado. Otra URL: `E2E_BASE_URL=...`.

## 7. Despliegue en producción

1. En el servidor (Linux, Node 20.9+):

   ```bash
   git clone <repositorio> ft-crm && cd ft-crm
   npm ci
   ```

2. Define las variables en el servicio (o en `.env.production.local`, que no se versiona):

   ```ini
   CRM_BACKEND_MODE=live
   CRM_BACKEND_URL=http://<host-interno-de-bk-crm>:3000
   ```

3. Compila y arranca (puerto 5173):

   ```bash
   npm run build
   npm run start
   ```

4. Publica detrás de un proxy inverso con **HTTPS** (Nginx, Caddy…). Las cookies de sesión son `Secure` en
   producción: sin HTTPS no se puede iniciar sesión.
5. Comprueba:
   - `GET /api/salud` → `{"estado":"ok","modo":"live"}` (el proceso vive).
   - `GET /api/listo` → 200 si bk-crm y su base de datos responden; 503 si no.
   - Inicio de sesión con un usuario real y carga de la Bandeja.

Notas de seguridad y operación:

- El modo mock **se niega a arrancar en producción** (salvo `CRM_ALLOW_MOCK_IN_PRODUCTION=true` para una demo).
- El navegador nunca recibe la URL de bk-crm ni los tokens; el proxy bloquea las rutas de autenticación y los
  webhooks del backend.
- Usa **una sola instancia** del frontend o sesiones fijas (sticky) en el balanceador: la renovación del token
  (de un solo uso en bk-crm) se coordina dentro de cada proceso.
- bk-crm no tiene CORS habilitado; no hace falta, porque el navegador solo habla con este servidor.

## 8. Decisiones tomadas y pendientes del backend

El backend actual no tiene algunas piezas que el mockup muestra. La interfaz no inventa datos: muestra «—»
o «Pendiente en el backend». Lo pendiente:

- **Tiempo real:** no hay WebSockets; la Bandeja se actualiza por sondeo (6 s la lista, 4 s el chat).
- **Samanta (IA)** y el **flujo del dueño** por WhatsApp (enviar, ACEPTAR, RECHAZAR) no existen en bk-crm;
  solo el simulador los reproduce. Los mensajes de Samanta se representan como salientes sin autor.
- **Escribir toma el control:** el backend no lo hace solo; el frontend pausa a Samanta, envía y se asigna
  la conversación (en ese orden). Un operador no puede escribir en una conversación que atiende otra persona;
  un administrador sí, sin cambiar el responsable.
- **Eventos del chat** («Solicitud enviada al dueño», «Operador tomó la conversación»): no existen; el avance
  se ve en la línea de tiempo del panel derecho.
- **Solo WhatsApp envía.** Facebook, Instagram y Web se ven en la Bandeja, pero responder por ellos queda
  deshabilitado con una explicación.
- **«Marcar como preparada»** usa el estado `UPCOMING` del backend, que no se puede deshacer; por eso pide
  confirmación. *Pendiente de confirmar con el dueño del producto.*
- **Zona o área** de la reserva no existe en el backend: se muestra el servicio.
- **Tiempo de respuesta del dueño** y «Resueltas por Samanta» no se registran: se muestran «—».
- **Estadísticas** se calculan en el navegador con los listados (no hay endpoint de estadísticas).
- **Búsqueda** por nombre, teléfono o correo del cliente (el backend no busca en los mensajes).
- **Logotipo** por URL (no hay subida de archivos).
- **Ajustes de Samanta** (canales, reglas, WhatsApp personal, «si no responde»): pendientes en el backend.
- **Soporte EYAQ** no ve datos de negocio (el backend le responde 403).
- **Datos de ejemplo adaptados a Perú** (soles, +51, America/Lima); el mockup usaba pesos colombianos.
- No se recibieron el **cronograma** ni la **infografía del flujo**: la planificación se alineó al flujo
  central y a las vistas descritas en el pedido.

## 9. Estructura

```text
src/
  app/(auth)/            inicio de sesión y recuperación de contraseña
  app/(crm)/             una carpeta por vista (bandeja, solicitudes, calendario, estadisticas, clientes, ajustes)
  app/api/backend/       proxy autenticado hacia bk-crm (BFF)
  app/api/auth/          inicio y cierre de sesión, recuperación de contraseña
  app/api/dev/simulador  simulador de canales (solo mock)
  app/api/salud, listo   salud del proceso y del backend
  features/<vista>/      componentes y lógica de cada vista (con sus pruebas)
  components/            piezas visuales compartidas (shell, UI)
  lib/api/               contrato tipado de bk-crm y cliente HTTP
  lib/auth/              sesión y permisos por rol
  lib/domain/            estados, canales y reglas de presentación
  lib/mock/              backend simulado, datos de ejemplo y simulador
  lib/server/            sesión, cookies y proxy del BFF (solo servidor)
e2e/                     pruebas de punta a punta (Playwright)
docs/diseno/             mockup aprobado decodificado
docs/backend/            contratos y brechas de bk-crm
```
#   F T - E y a q - C R M  
 