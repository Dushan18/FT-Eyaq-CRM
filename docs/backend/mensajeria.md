# Mensajería (Bandeja): contrato HTTP para el frontend

Backend: `bk-crm` (NestJS 11 + Prisma 7 + PostgreSQL). Análisis de **solo lectura** del 14/10/2026. No se ejecutó el backend, ni migraciones, ni tests. Todo lo que dice "verificado" sale del código fuente. Lo que dice "inferido" o "no verificado" no se comprobó en ejecución.

Contrato TypeScript: `contracts/messaging.ts`. Se compiló en modo `--strict` y se probó con payloads de ejemplo.

## 0. Resumen

- Hay **7 endpoints** para el frontend, todos bajo `/conversations`. Hay 2 webhooks públicos de WhatsApp (`/webhooks/whatsapp`), pero son servidor a servidor y el frontend no los llama.
- **SUPPORT no tiene acceso a nada de la Bandeja (403).** OWNER solo puede leer. No puede marcar leído, pausar, asignar ni enviar.
- La paginación es por **offset** (`page`/`limit`) y el orden es fijo. No hay cursor, ni `since`, ni WebSocket, ni SSE. Hoy la única forma de tener "tiempo real" es **sondear** (polling).
- El ítem de la lista **no trae el último mensaje**. No hay vista previa ("Samanta:", "Tú:") ni estado de solicitud.
- El backend **no tiene IA (Samanta)**. Tampoco tiene mensajes de sistema, ni auditoría, ni flujo de aprobación del dueño por WhatsApp.
- El modo "Samanta / En pausa / Operador" **no existe como campo**. Se deriva de `isAssistantPaused` + `assignedUserId`.
- Enviar como operador **no** toma el control: no pausa ni asigna.
- Solo se puede enviar **TEXT por WhatsApp**, dentro de la ventana de 24 h. Requiere `Idempotency-Key` y responde **202** con el mensaje en cola. Los otros canales (Facebook, Instagram, Web) no tienen ingestión ni envío.
- **Riesgo en desarrollo:** el `.env` local tiene `MESSAGING_ENABLED=true` y `WHATSAPP_ENABLED=true`. De ese archivo solo se leyeron esas dos banderas. Con esa configuración, un POST de mensaje desde el frontend encola un **envío real a Meta**. Para la fase mock hay que usar una capa mock en el frontend o apagar `WHATSAPP_ENABLED`; con WhatsApp apagado, el POST responde 503.

## 1. Hechos globales verificados

| Hecho | Evidencia |
| --- | --- |
| Sin prefijo global, puerto `PORT ?? 3000`, **CORS no habilitado** | `src/main.ts` |
| ValidationPipe global `{whitelist, forbidNonWhitelisted, transform}`: cualquier propiedad extra en body o query da 400 | `src/main.ts` |
| Filtro global: HttpException devuelve `{statusCode, message, error?}` tal cual; los errores no controlados dan 500 `{statusCode, message:'Ocurrió un error interno', path, method, timestamp}` | `src/common/filters/global-exception.filter.ts` |
| Sin interceptores ni serializadores globales: el JSON es el objeto del servicio | `grep APP_INTERCEPTOR`: no hay coincidencias |
| JWT Bearer (`passport-jwt`). En cada request se recargan usuario, sesión y roles desde la BD | `src/strategies/access-token.strategy.ts` |
| `@Roles` del handler **reemplaza** al de la clase (`getAllAndOverride`) | `src/auth/guards/roles.guard.ts` |
| El throttling solo aplica a `/auth/forgot-password` y `/auth/reset-password` | `src/auth/auth.controller.ts`. El sondeo de la Bandeja no tiene límite de ritmo |
| No hay Decimal ni BigInt en este módulo. Las fechas son ISO UTC con milisegundos | `prisma/schema.prisma` (`Timestamptz(3)`) |
| Express 5.2.1 genera ETag débil por defecto | `node_modules/express/lib/application.js`. **No verificado en ejecución**: que Nest responda 304 ante `If-None-Match` |

Para llamar desde el navegador hay dos opciones. La primera es un proxy del mismo origen (rewrites o route handlers de Next.js). Así se evita el preflight CORS que provocarían `Authorization` e `Idempotency-Key`. La segunda es que el backend habilite CORS con un origen permitido.

## (a) Endpoints

Orden de evaluación en NestJS (vale para todos): **JWT (401) → RolesGuard (403) → pipes (`ParseUUIDPipe` y ValidationPipe: 400) → servicio**.

| # | Método y ruta | Roles | Éxito | Request | Response |
| --- | --- | --- | --- | --- | --- |
| 1 | `GET /conversations` | ADMIN, OWNER, OPERATOR | 200 | `ListConversationsQuery` | `Paginated<Conversation>` |
| 2 | `GET /conversations/:id` | ADMIN, OWNER, OPERATOR | 200 | — | `Conversation` |
| 3 | `GET /conversations/:id/messages` | ADMIN, OWNER, OPERATOR | 200 | `ListMessagesQuery` | `Paginated<Message>` |
| 4 | `PATCH /conversations/:id/read` | ADMIN, OPERATOR | 200 | `{ throughMessageId }` | `{ updated, throughMessageId }` |
| 5 | `PATCH /conversations/:id/assistant` | ADMIN, OPERATOR | 200 | `{ paused }` | `Conversation` |
| 6 | `PATCH /conversations/:id/assignee` | ADMIN, OPERATOR (con regla propia) | 200 | `{ assignedUserId: uuid \| null }` | `Conversation` |
| 7 | `POST /conversations/:id/messages` | ADMIN, OPERATOR | **202** | `{ type:'TEXT', content }` + `Idempotency-Key` | `OutboundMessage` |
| W1 | `GET /webhooks/whatsapp` | público (Meta) | 200 `text/plain` | `hub.mode`, `hub.verify_token`, `hub.challenge` | challenge |
| W2 | `POST /webhooks/whatsapp` | público (Meta, firma HMAC) | 200 | payload de Meta | `{ received: true }` |

### Cabeceras requeridas

- Rutas 1 a 7: `Authorization: Bearer <accessToken>`.
- Rutas 4 a 7: además, `Content-Type: application/json`.
- Ruta 7: además, `Idempotency-Key`, que debe cumplir `/^[a-zA-Z0-9_-]{16,80}$/`. Un `crypto.randomUUID()` es válido.
- W2: `X-Hub-Signature-256: sha256=<hex64>`. La firma es un HMAC del raw body con `META_APP_SECRET`.

### Errores por endpoint

Errores comunes a las rutas 1 a 7:

- **401** si falta el token, si es inválido o expiró, si la sesión fue revocada o si el usuario está inactivo. Los cuerpos posibles son `{"message":"Unauthorized","statusCode":401}`, `"Usuario no autorizado"`, `"Sesión no válida o expirada"` y `"Token de acceso inválido"`.
- **403** si el rol no está permitido: `"No tienes permisos para realizar esta acción"`.
- **400** si `:id` no es UUID: `"Validation failed (uuid is expected)"`.
- **500** ante un error no controlado.

| Endpoint | Status | Cuándo |
| --- | --- | --- |
| 1 `GET /conversations` | 400 | Parámetro desconocido (`sort`, `status`...). `page` fuera de 1..1 000 000 o no entero. `limit` fuera de 1..100. `channel` fuera del enum o vacío. `customerId`/`assignedUserId` que no son UUID. `unreadOnly`/`isAssistantPaused` distinto de `"true"`/`"false"`. `search` vacío (también tras trim) o con más de 200 caracteres. Parámetro repetido. Los mensajes de class-validator vienen en inglés y como `string[]` |
| 2 `GET /conversations/:id` | 404 | `"Conversación no encontrada"` |
| 3 `GET .../messages` | 400 | Igual que 1, pero solo se aceptan `page`/`limit` |
| 3 `GET .../messages` | 404 | `"Conversación no encontrada"` |
| 4 `PATCH .../read` | 400 | Body sin `throughMessageId`, que no es UUID, o con campos extra |
| 4 `PATCH .../read` | 403 | OWNER o SUPPORT |
| 4 `PATCH .../read` | 404 | `"Conversación no encontrada"` o `"Mensaje no encontrado en esta conversación"` |
| 4 `PATCH .../read` | 409 | `"Conflicto de mensajería; vuelve a intentarlo"` (contención tras 5 reintentos; es raro) |
| 5 `PATCH .../assistant` | 400 | `paused` ausente o no booleano JSON (el string `"true"` da 400), o campos extra |
| 5 `PATCH .../assistant` | 403 | OWNER o SUPPORT |
| 5 `PATCH .../assistant` | 404 | `"Conversación no encontrada"` |
| 5 `PATCH .../assistant` | 409 | Contención (raro) |
| 6 `PATCH .../assignee` | 400 | `assignedUserId` ausente (omitirlo **no** desasigna), `""`, `false` o un valor que no es UUID. Campos extra. `"Responsable no elegible"` si el destino está inactivo o no tiene rol ADMIN/OPERATOR |
| 6 `PATCH .../assignee` | 403 | OWNER o SUPPORT (guard). OPERATOR que asigna a otro usuario, o que toma o suelta una conversación ajena: `"Solo puedes tomar conversaciones libres o desasignarte de las propias"`. Esta regla se evalúa **antes** de comprobar si el usuario destino existe |
| 6 `PATCH .../assignee` | 404 | `"Conversación no encontrada"` o `"Usuario no encontrado"` |
| 6 `PATCH .../assignee` | 409 | Contención (raro) |
| 7 `POST .../messages` | 503 | `"WhatsApp no está habilitado"` (`WHATSAPP_ENABLED=false`). Es la **primera** comprobación del servicio |
| 7 `POST .../messages` | 400 | Error de body: `type` distinto de `"TEXT"`, `content` no string, solo espacios o con más de 4096 caracteres, campos extra (`to`, `authorUserId`, `status`...). `Idempotency-Key` ausente o inválida. `"Conversación sin destinatario WhatsApp habilitado"` si el canal no es WHATSAPP o el cliente no tiene teléfono normalizado |
| 7 `POST .../messages` | 403 | OWNER o SUPPORT |
| 7 `POST .../messages` | 404 | `"Conversación no encontrada"` |
| 7 `POST .../messages` | 409 | `"Idempotency-Key ya utilizada con otros datos"` (misma clave con otro autor, tipo o contenido). `"Ventana de WhatsApp cerrada; se requiere una plantilla aprobada"`. Contención |
| W1 | 403 / 503 | `"Verificación inválida"` / deshabilitado |
| W2 | 403 / 503 / 409 / 500 / 413 | Firma inválida / deshabilitado / contención (Meta reintenta) / fallo de BD / body mayor a 100 KB |

Orden exacto dentro del servicio del POST, según `outbound-messages.service.ts`:

1. `assertEnabled`: 503.
2. Regex de la clave: 400.
3. Transacción Serializable. Si la clave ya existe en la conversación con los mismos autor, tipo y contenido, devuelve el **mismo mensaje con su estado actual** (202). Si los datos difieren: 409.
4. Conversación inexistente: 404.
5. Canal distinto de WHATSAPP o sin teléfono: 400.
6. Ventana de 24 h cerrada: 409.
7. Si todo pasa, crea el mensaje `QUEUED` y su outbox `PENDING`, e incrementa `lastSequence` y `lastMessageAt = now`: 202.

## (b) Paginación, orden y filtros (tal como están implementados)

### Sobre de respuesta

```json
{ "data": [...], "pagination": { "page": 1, "limit": 50, "total": 3, "totalPages": 1 } }
```

- `totalPages = Math.ceil(total / limit)`, así que vale 0 cuando `total` es 0.
- Una página mayor que `totalPages` devuelve `data: []` con 200.
- Las filas y el `count` se leen en la misma transacción `RepeatableRead`, así que son coherentes entre sí.
- `page` es un entero entre 1 y 1 000 000; por defecto 1. `limit` es un entero entre 1 y 100; por defecto 50, también en el historial.
- La paginación es solo por offset: `skip = (page - 1) * limit`. No hay cursor, ni `before/afterSequence`, ni `updatedAfter`.

### Orden fijo (no hay parámetro de orden; enviar `sort` da 400)

- Conversaciones: `lastMessageAt DESC NULLS LAST`, luego `id DESC`.
- Mensajes: `sequence DESC`. La página 1 es la más reciente; hay que invertirla para mostrar en orden cronológico.

### Filtros de `GET /conversations`

Todos son opcionales y se combinan con AND.

| Parámetro | Tipo en la URL | Semántica |
| --- | --- | --- |
| `channel` | enum `ContactChannel` | Igualdad exacta. Un solo valor. Omitirlo equivale a "Todos" |
| `customerId` | UUID | Conversaciones de ese cliente |
| `assignedUserId` | UUID | Conversaciones de ese responsable. **No existe un filtro "sin asignar"** |
| `unreadOnly` | `"true"` / `"false"` | `true`: al menos un INBOUND con `readAt` null. `false`: no filtra |
| `isAssistantPaused` | `"true"` / `"false"` | Igualdad sobre la bandera |
| `search` | string de 1 a 200 caracteres tras trim | Subcadena en **un** campo del cliente: `firstName`, `lastName` y `email` (sin distinguir mayúsculas; **sí distingue tildes**: "Perez" no encuentra "Pérez"), `phone` (literal) y, si el texto tiene dígitos, `normalizedPhone` con solo esos dígitos |

Límites de `search`:

- **No busca en el texto de los mensajes.**
- **No une nombre y apellido.** "Ana Torres" no encuentra a `firstName:"Ana"` + `lastName:"Torres"`.
- Un texto con dígitos coincide con cualquier teléfono que contenga esos dígitos. Por ejemplo, "Mesa 4" encuentra todos los teléfonos que tienen un 4.

Reglas de transporte del query:

- Omitir los parámetros vacíos o undefined. `param=` vacío da 400.
- Los booleanos van exactamente como `true`/`false`; `1` o `yes` dan 400.
- No repetir parámetros. La función `toConversationsSearchParams` del contrato aplica estas reglas.

## (c) Reglas de negocio y máquinas de estado

### c.1 Identidad y creación de conversaciones

- Hay **una conversación por (cliente, canal)** (`@@unique([customerId, channel])`). Se crea sola con el primer mensaje entrante de ese cliente por ese canal (`messages.service.ts`).
- No existe endpoint para crear, cerrar, reabrir ni borrar conversaciones, y no hay estado de conversación.
- La ingestión entrante es interna: no hay endpoint HTTP para inyectar mensajes. Hoy solo la usan el webhook de WhatsApp y el script de demo.
- El cliente se resuelve por teléfono o email normalizado (`CustomersService.findOrCreateByContact`):
  - Si el cliente es nuevo, se crea con `status NEW`, `sourceChannel` igual al canal y **sin nombre si viene de WhatsApp**.
  - Si ya existe, solo se actualiza `lastContactAt`.
- Un webhook duplicado (mismo `externalMessageId`) no crea otro mensaje ni sube los no leídos.

### c.2 `lastMessageAt` y `updatedAt`

- `lastMessageAt` es null hasta el primer mensaje.
- En un entrante toma la **hora de recepción del servidor** y nunca retrocede. En un saliente toma `now` al encolar.
- No cambia con estados de entrega, lecturas, pausa ni asignación.
- `updatedAt` cambia con cada mensaje nuevo, con la pausa y con la asignación. No cambia con lecturas ni con recibos de entrega.

### c.3 No leídos y lectura compartida

- `unreadCount` cuenta los INBOUND con `readAt` null. Es una lectura **del equipo**, no por usuario, y no es el READ de WhatsApp. Los OUTBOUND nunca cuentan.
- `GET` **no** marca nada como leído.
- `PATCH /read {throughMessageId}` toma el `sequence` de ese mensaje (puede ser de cualquier dirección). Marca los INBOUND no leídos con `sequence <= corte`. Un mensaje que llegue después no queda leído; la operación usa `FOR UPDATE`. Es idempotente: repetirla devuelve `updated: 0`.
- OWNER recibe 403. Si el usuario es OWNER, no hay que llamar a `/read`.
- Uso recomendado en la UI: al mostrar el chat, llamar a `/read` con el id del mensaje de **mayor sequence visible**, solo si `unreadCount > 0`, y con un debounce de unos 500 ms. Después, poner `unreadCount = 0` en el estado local o volver a pedir `GET /conversations/:id`.

### c.4 Pausa del asistente

- `isAssistantPaused` es una bandera booleana, por defecto `false`, y es idempotente.
- **No tiene efecto funcional hoy**: no existe IA, y la doc lo confirma: "estado preparado para la futura integración de IA". Los mensajes siguen persistiéndose y procesándose igual.
- La pausa no cambia el responsable, y ni el envío ni la asignación la cambian.
- Cualquier ADMIN u OPERATOR puede pausar o reanudar cualquier conversación, aunque tenga otro responsable.
- No hay auditoría: el código tiene un `TODO`. Tampoco queda registrado "quién pausó".

### c.5 Asignación (`PATCH /assignee`)

| Actor | Conversación libre | Asignada al actor | Asignada a otro |
| --- | --- | --- | --- |
| ADMIN | Asignar a cualquier elegible / null | Igual | Reemplazar / null |
| OPERATOR | Solo `{assignedUserId: miId}` o `null` (no hace nada) | `miId` (reafirmar) o `null` (soltar) | **403** siempre |
| OWNER / SUPPORT | 403 | 403 | 403 |

- Es elegible un usuario **activo** con rol ADMIN u OPERATOR.
- Si después se desactiva al responsable, la relación se conserva y aparece `assignedUser.isEligible = false`.
- Con dos tomas simultáneas gana la primera (`FOR UPDATE`). La segunda recibe 403, y la UI debe volver a pedir los datos.
- El selector de responsables para ADMIN necesita `GET /users`, que es **solo ADMIN** (otro módulo). Hay que filtrar los activos con rol ADMIN u OPERATOR.
- El OPERATOR obtiene su propio id de `GET /auth/me`, que devuelve `{id, sessionId, firstName, lastName, email, roles}`.

### c.6 Envío saliente: idempotencia y efectos

- Solo TEXT y solo WHATSAPP. El POST **solo encola**: crea el mensaje `QUEUED` y su outbox `PENDING`, en la misma transacción.
- Un dispatcher revisa la cola cada 2 s y la publica en BullMQ. Un worker hace el POST a Graph API.
- **La clave de idempotencia es por conversación.** Hay que generar una por cada mensaje que el usuario decide enviar, y reutilizarla en los reintentos: error de red, timeout, 5xx, o 401 seguido de refresh. Con la misma clave y los mismos datos se recibe el mismo `id` y no se envía dos veces. Diez POST concurrentes con la misma clave crean un solo mensaje (lo verifican los tests). Si se reutiliza la clave con otro contenido o autor: 409.
- **El envío no pausa a Samanta ni asigna la conversación.** Tampoco comprueba que quien envía sea el responsable: cualquier ADMIN u OPERATOR puede enviar en cualquier conversación de WhatsApp.
- No existen endpoints para reintentar, reenviar, cancelar ni borrar mensajes.

### c.7 Máquina de estados OUTBOUND (`outbound-messages.service.ts`, `message-status.service.ts`)

```text
QUEUED ──worker──► SENDING ──Meta 2xx con wamid──► SENT ──recibo──► DELIVERED ──recibo──► READ
  ▲                   │
  └─429 (backoff)─────┤  (errorCode WHATSAPP_RATE_LIMITED; máx. 5 POST, luego FAILED)
                      ├─4xx definitivo────────────► FAILED (WHATSAPP_SEND_REJECTED)
                      ├─408/5xx/red/timeout/sin wamid► UNKNOWN (WHATSAPP_SEND_UNKNOWN)  ← no se reenvía
QUEUED ──ventana cerrada al procesar────────────────► FAILED (WHATSAPP_WINDOW_CLOSED)
QUEUED ──datos incoherentes / intentos agotados─────► FAILED (WHATSAPP_SEND_INVALID)
SENDING con lease vencido (worker caído) ───────────► UNKNOWN (no repite el POST)
```

Conciliación de recibos (`nextDeliveryStatus`):

- READ nunca baja de estado.
- DELIVERED solo puede pasar a READ.
- Un recibo DELIVERED o READ puede sacar de FAILED.
- Un SENT tardío no saca de FAILED.
- UNKNOWN pasa a SENT, DELIVERED, READ o FAILED si llega un recibo con `wamid`.
- Un recibo "failed" después de SENT da FAILED con `WHATSAPP_DELIVERY_FAILED`, y `sentAt` se conserva.
- Los recibos que llegan antes de tiempo se reintentan cada 60 s.

Sugerencia de mapeo a la UI. Es una sugerencia: el backend no lo define.

| Estado | Indicador | Texto sugerido |
| --- | --- | --- |
| QUEUED / SENDING | reloj | "Enviando…" (si `errorCode=WHATSAPP_RATE_LIMITED`: "Reintentando…") |
| SENT | ✓ | `sentAt` |
| DELIVERED | ✓✓ | `deliveredAt` |
| READ | ✓✓ resaltado | `providerReadAt` ("Leído por el cliente") |
| FAILED | rojo | Según `errorCode`: ventana cerrada, rechazado por WhatsApp, no entregado, inválido |
| UNKNOWN | ámbar | "Estado incierto: verifica antes de reenviar". **No** reenviar con otra clave de forma automática |

Que nunca llegue READ no es un fallo: el cliente puede tener desactivados los recibos de lectura.

### c.8 Estados INBOUND (procesamiento interno)

- Flujo: `RECEIVED → PROCESSING → PROCESSED`.
- `FAILED` aparece con `MESSAGE_INVALID` o `MESSAGE_ATTEMPTS_EXHAUSTED` (5 intentos).
- Un fallo temporal devuelve el mensaje a `RECEIVED` con `MESSAGE_PROCESSING_TEMPORARY`.
- Con `MESSAGING_ENABLED=false`, el mensaje se queda en `RECEIVED`.
- El procesamiento de hoy solo valida el mensaje: no hay IA, ni respuesta, ni reservas. No es información para el cliente final. Como mucho, puede mostrarse un indicador técnico para ADMIN.

### c.9 Ventana de 24 h de WhatsApp

- El backend busca el último INBOUND de WhatsApp de esa conversación con `occurredAt` entre `now - 24h` y `now`. Además exige que ese mensaje corresponda al teléfono normalizado **actual** del cliente y al número de WhatsApp configurado.
- Se comprueba al hacer el POST (409) y otra vez en el worker (FAILED `WHATSAPP_WINDOW_CLOSED`).
- **No se expone ningún campo con la ventana.** El frontend solo puede estimarla con `estimateWhatsAppWindowClosesAt(messages)`, a partir del `occurredAt` del último INBOUND cargado. La decisión final es la respuesta del POST.
- Los mensajes sin `occurredAt` (por ejemplo, los del seed) nunca abren la ventana.
- Fuera de la ventana harían falta plantillas aprobadas, y no están implementadas.

### c.10 Cómo distinguir la autoría

| Burbuja del mockup | Regla con los datos actuales | Estado |
| --- | --- | --- |
| Cliente (izquierda) | `direction === 'INBOUND'`. Un CHECK SQL garantiza `authorUserId = null` | Soportado |
| Operador (derecha, azul, "Operador") | `direction === 'OUTBOUND' && authorUserId !== null` | Soportado, pero solo trae el **id**: no hay `author` embebido con nombre |
| "Tú" | OUTBOUND con `authorUserId === me.id` (de `/auth/me`) | Soportado |
| Samanta (derecha, clara) | Ningún flujo crea OUTBOUND con `authorUserId = null`. Sería el hueco natural, pero no está confirmado | **No existe** |
| Eventos de sistema (centrados) | No hay modelo, tipo de mensaje ni dirección para eventos. La auditoría está solo como `TODO` | **No existe** |

Para mostrar el nombre del operador, hoy se puede usar `me` o `conversation.assignedUser` cuando coincide el id. Si no, se usa la etiqueta genérica "Operador". `GET /users` es solo para ADMIN.

### c.11 Comportamiento de WhatsApp que afecta a la UI (`whatsapp.adapter.ts`)

- **`text`** se guarda como TEXT, con el body recortado.
- **`image`** se guarda como IMAGE. El pie de foto va en `content` (puede ser null). El adjunto trae `{type:'IMAGE', externalMediaId, mimeType?}`, con `fileName`, `sizeBytes` y `url` en null.
- **`document`** se guarda como FILE. Igual que la imagen, pero con `fileName`.
- **Audio, video, sticker, ubicación y otros** se guardan como OTHER, con `content` igual a `"[Mensaje de WhatsApp no compatible todavía]"` y sin adjuntos.
- **No se puede ver ni descargar ningún adjunto**: no hay proxy hacia Graph API.
- **El cliente se identifica solo por teléfono** (`+<from>`). El nombre de perfil de WhatsApp no se guarda, así que `firstName` y `lastName` quedan en null. Hay que usar `customerDisplayName()`, que cae al teléfono.
- Se ignoran los eventos de otra WABA u otro número. Los eventos con fecha futura (más de 60 s) quedan en cuarentena.

### c.12 Fechas y zonas horarias

- Todo viene en UTC ISO con milisegundos.
- `occurredAt` es la hora del proveedor, con precisión de segundos. `receivedAt` es la hora del servidor.
- Hora sugerida para mostrar cada burbuja:
  - INBOUND: `occurredAt ?? receivedAt`.
  - OUTBOUND: `sentAt ?? createdAt`.
- **Ordenar siempre por `sequence`.** En la práctica es contiguo (1..N), pero no está garantizado como contrato.
- La zona horaria de visualización sale de `RestaurantConfig.timeZone` (por defecto `America/Lima`, otro módulo).
- En los tiempos relativos, si el reloj del navegador va atrasado y la fecha queda en el futuro, mostrar "ahora".

### c.13 Tiempo real: no existe

No hay WebSocket, SSE, long-poll ni parámetro `since`. Estrategia de sondeo más barata con la API actual:

1. **Lista:** pedir `GET /conversations?page=1&limit=30` con los filtros activos.
   - Cada 5 s con la pestaña visible y cada 30 s con la pestaña oculta.
   - Como el orden es por `lastMessageAt DESC`, toda actividad nueva sube a la página 1, así que basta con sondear esa página.
   - Detectar cambios por `(id, lastMessageAt, updatedAt, unreadCount, isAssistantPaused, assignedUserId)`.
2. **Chat abierto:** pedir `GET /conversations/:id/messages?page=1&limit=30` cada 3 s.
   - Fusionar por `id`, reemplazando el objeto completo para recoger los cambios de estado, y ordenar por `sequence`.
   - Si hay OUTBOUND en `QUEUED` o `SENDING`, sondear cada 1–2 s durante unos 30 s. El dispatcher trabaja cada 2 s.
   - Los cambios de estado de entrega **no** tocan la conversación: solo se ven sondeando los mensajes.
3. **Cargar anteriores:** pedir `page=n`. Como hay desplazamiento cuando llegan mensajes nuevos, hay que deduplicar por `id`.
4. **Insignia "N sin leer":** pedir `GET /conversations?unreadOnly=true&limit=1` cada 15 s. `pagination.total` da el número de **conversaciones** con no leídos. El total de mensajes solo se obtiene sumando `unreadCount` de todas las páginas.
5. **Si el sondeo falla, conservar los datos** y mostrar "Sin conexión con el servidor". No vaciar la bandeja: no es lo mismo "no hay mensajes" que "no se pudo cargar".

### c.14 RBAC resumido

| Acción | ADMIN | OWNER | OPERATOR | SUPPORT |
| --- | --- | --- | --- | --- |
| Ver lista, detalle e historial | Sí | Sí | Sí | **No (403)** |
| Marcar leído, pausar o reanudar | Sí | No | Sí | No |
| Asignar | Sí (libre) | No | Solo la regla propia | No |
| Enviar mensaje | Sí | No | Sí | No |

## (d) Gap analysis vs mockup

| # | Necesidad del mockup | Soporte | Qué usar hoy | Propuesta concreta |
| --- | --- | --- | --- | --- |
| 1 | "Bandeja" + "N sin leer" | Parcial | `GET /conversations?unreadOnly=true&limit=1` → `pagination.total` (conversaciones) | `GET /conversations/summary` → `{unreadConversations, unreadMessages, byChannel}` |
| 2 | Buscar "cliente o mensaje" | Parcial | `search`: subcadena en nombre, apellido, email o teléfono del cliente | Agregar `OR messages.some.content ILIKE` con índice trigram, y nombre completo concatenado. Evaluar `unaccent` |
| 3 | Chips Todos / WhatsApp / Facebook / Instagram / Web | Completo (filtro) | `channel` = omitido / `WHATSAPP` / `FACEBOOK` / `INSTAGRAM` / `WEBSITE` | Solo WhatsApp recibe datos. Los demás estarán vacíos hasta que existan sus adaptadores |
| 4 | Avatar con iniciales e insignia de canal | Completo | `customer.firstName/lastName` (pueden ser null), `channel` | Usar el teléfono como respaldo |
| 5 | Nombre en negrita si no leído | Completo | `unreadCount > 0` | — |
| 6 | Vista previa del último mensaje con "Samanta:" o "Tú:" | **No** | Solo con N+1: `GET .../messages?limit=1` por fila | Embeber `lastMessage {id, direction, type, content (recortado), authorUserId, status, sequence, createdAt}` en `conversationSelect` |
| 7 | Etiqueta de estado de la solicitud en la fila | **No** (fuera de mensajería) | N+1: `GET /reservation-requests?customerId=<id>&limit=1` (orden `createdAt desc`; otro módulo) | Embeber `latestReservationRequest {id, code, status}`, o agregar `conversationId` a `ReservationRequest`. La relación hoy es solo por cliente |
| 8 | Tiempo relativo ("2 min", "1 h", "1 d") | Completo | `lastMessageAt` (puede ser null) | — |
| 9 | Insignia con el número de no leídos | Completo | `unreadCount` | — |
| 10 | Cabecera del chat: nombre y canal | Completo | `customer`, `channel` | — |
| 11 | "Activo <hora>" | Parcial | `occurredAt`/`receivedAt` del último INBOUND cargado, o `customer.lastContactAt` vía `GET /customers/:id` | Agregar `lastInboundAt` a la conversación |
| 12 | Píldora con 3 modos (Samanta / En pausa / Operador) | Parcial (derivado) | `deriveConversationMode()`: no pausado = Samanta; pausado sin responsable = En pausa; pausado con responsable = Operador | Campo `mode` en el backend, o transiciones atómicas (ver 14) |
| 13 | Pausar / Reanudar | Completo | `PATCH /assistant {paused}` (ADMIN, OPERATOR) | Auditoría y evento visible |
| 14 | "Pasar a humano" / "Devolver a Samanta" | Parcial | Pasar: `PATCH /assignee {me.id}` + `PATCH /assistant {true}`. Devolver: `{false}` + `{null}`. Son dos llamadas no atómicas y el OPERATOR no puede tocar las ajenas | `POST /conversations/:id/takeover` y `/release` atómicos, con auditoría y evento de sistema |
| 15 | Burbujas del cliente | Completo | `direction INBOUND` | — |
| 16 | Burbujas de Samanta | **No** | — | Campo `authorType: CUSTOMER\|ASSISTANT\|OPERATOR\|SYSTEM` (lo pide el modelo de datos del usuario) y el productor de IA |
| 17 | Burbuja del operador con etiqueta "Operador" y nombre | Parcial | OUTBOUND con `authorUserId`. No trae nombre | Agregar `author {id, firstName, lastName}` a `messageSelect` |
| 18 | Eventos de sistema centrados (7 textos del mockup) | **No** | — | Modelo `ConversationEvent` (o mensajes `authorType SYSTEM`) intercalado por `sequence`, emitido por pausa, asignación y transiciones de solicitud y reserva |
| 19 | Aviso en el composer: "Samanta está respondiendo…" | Completo (condición) | `isAssistantPaused === false` | — |
| 20 | Escribir toma el control automáticamente | **No** en el backend | Orquestar en el frontend: pausar (si no lo está), luego POST, luego autoasignarse si está libre. Puede quedar a medias | Que `queueOutboundMessage` pause y asigne al autor (si está libre) dentro de la misma transacción |
| 21 | Enviar texto (WhatsApp) | Completo | `POST .../messages` + `Idempotency-Key` → 202 `QUEUED` | — |
| 22 | Enviar por Facebook, Instagram o Web | **No** | — (400) | Adaptadores de salida por canal (fase de integraciones) |
| 23 | Adjuntar archivos en el composer | **No** | Solo `type:'TEXT'` | — (no está en el cronograma; no inventar) |
| 24 | Estados de entrega (QUEUED…READ, FAILED, UNKNOWN) | Completo | `status` + `sentAt/deliveredAt/providerReadAt/failedAt` + `errorCode` | — |
| 25 | Errores: ventana de 24 h, mensajería deshabilitada | Completo (respuesta) / Parcial (aviso previo) | 409 ventana, 503 deshabilitado, 400 sin teléfono. Estimar con `estimateWhatsAppWindowClosesAt` | Exponer `replyWindowExpiresAt` y `canReply` en la conversación |
| 26 | Ver medios entrantes (imágenes, documentos) | Parcial | Solo metadatos de `attachments[]` | Endpoint proxy `GET .../attachments/:id/content` hacia Graph API |
| 27 | Filtros responsable, pausa y no leídos | Completo | `assignedUserId`, `isAssistantPaused`, `unreadOnly` | Agregar un filtro "sin asignar" si la UI lo pide |
| 28 | Paginación de la lista | Completo (offset) | `page`, `limit` (máx. 100) | — |
| 29 | Historial con "cargar anteriores" | Completo (offset) | `page`, `limit`, `sequence DESC` | `beforeSequence` y `afterSequence` para evitar desplazamientos |
| 30 | Marcar leído (lectura compartida) | Completo | `PATCH /read {throughMessageId}` (OWNER no puede) | — |
| 31 | Asignación (ADMIN a cualquiera; OPERATOR a sí mismo) | Completo | `PATCH /assignee` + `GET /users` (ADMIN) | — |
| 32 | Acceso de "Soporte EYAQ" a la Bandeja | **No** (403) | — | Confirmar los permisos por vista |
| 33 | Tiempo real (WebSocket en el stack pedido) | **No** | Sondeo (c.13) | Gateway WS con JWT: `message.created`, `message.updated`, `conversation.updated` |
| 34 | Canales mock (fase inicial) | **No** | Solo el script de seed (WhatsApp) o un webhook firmado | Endpoint solo para desarrollo `POST /dev/messaging/inbound`, o capa mock del frontend con estos mismos tipos |
| 35 | Grupos de más de 20 personas pasan a un humano | **No** | — | Regla del asistente (fase IA) + `takeover` + evento |
| 36 | Solicitud al WhatsApp del dueño con ACEPTAR / RECHAZAR | **No** (en mensajería) | — | Flujo dedicado. Hoy, si el dueño escribe al número del negocio, se crea como **Cliente** con su propia conversación |
| 37 | Panel del cliente con línea de tiempo e historial | Parcial (otros módulos) | `customerId` → `GET /customers/:id`, `GET /reservation-requests?customerId=` y `GET /conversations?customerId=` | — |

## (e) Qué crea `scripts/seed-messaging-demo.ts` y datos mock recomendados

### El seed

Es solo para desarrollo: exige `ALLOW_MESSAGING_DEMO=true` y una base de datos local, y fuerza `MESSAGING_ENABLED=false` mientras corre. Crea lo siguiente:

- **Un cliente:**
  - `firstName "Cliente"`, `lastName "Demo mensajería"`, `email "messaging.demo@example.com"`.
  - Sin teléfono, `sourceChannel WHATSAPP`, `status NEW`.
- **Una conversación `WHATSAPP`:**
  - Sin pausa y sin responsable.
  - `lastMessageAt` igual a la recepción del segundo mensaje.
- **Dos INBOUND TEXT:**
  - `seq 1`: "Hola, quiero información" (`externalMessageId local-messaging-demo-1`).
  - `seq 2`: "¿Qué platos tienen disponibles?" (`local-messaging-demo-2`).
  - Ambos con `status RECEIVED`. Pasan a `PROCESSED` cuando la app corre con mensajería y Redis.
  - Ambos con `occurredAt` null, sin adjuntos, `unreadCount 2`, y outbox `PENDING`.

Detalles del seed:

- Imprime solo `{conversationId, messageId, duplicate}`.
- Repetirlo no duplica nada ni vuelve a marcar como no leído (`duplicate: true`).
- **Responder a esa conversación falla**: con WhatsApp habilitado da 400 "sin destinatario" porque no hay teléfono, y con WhatsApp deshabilitado da 503.

### Datos mock recomendados

Todos inventados, sin personas reales, con la forma exacta del contrato.

- **8 a 10 conversaciones** repartidas en `WHATSAPP`, `FACEBOOK`, `INSTAGRAM` y `WEBSITE`.
  - Los clientes de WhatsApp van con `firstName/lastName: null` y teléfono `+51 9XX…` inventado, que es la forma real.
  - Los de otros canales van con nombre y email `@example.com`.
  - Incluir una con `lastMessageAt: null`.
- **Variedad de estados de conversación:** una pausada sin responsable (En pausa), una pausada con `assignedUser` (Operador), una con un responsable inactivo (`isEligible:false`) y varias con `unreadCount` entre 0 y 5.
- **Mensajes con `sequence` contiguos:**
  - INBOUND con `occurredAt` (en segundos, `.000Z`) y `receivedAt` posterior.
  - OUTBOUND en cada estado: `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED + WHATSAPP_WINDOW_CLOSED` y `UNKNOWN + WHATSAPP_SEND_UNKNOWN`.
  - Un IMAGE con `externalMediaId` y `url:null`, un FILE con `fileName "carta.pdf"`, y un OTHER con el texto fijo de "no compatible".
  - Los mensajes de "Samanta" y de sistema **no existen en el backend**. Si se simulan, deben quedar aislados en la capa mock con un campo propuesto (`authorType`), sin mezclarlos con el contrato real.

## (f) Discrepancias entre documentación y código

1. `docs/messaging-postman.md` (Fase 1) dice "No hay DELETE físico, envío, webhook público ni endpoint de IA" y que "OUTBOUND está modelado, no hay envío". Está **desactualizado**: la Fase 2 agregó `POST /conversations/:id/messages` y `/webhooks/whatsapp`. Su matriz RBAC no incluye el POST, que es ADMIN/OPERATOR según el código y `docs/whatsapp-postman.md`.
2. `docs/messaging-core-design.md` lista `MessageStatus` con 7 valores. El schema actual tiene 10 (`DELIVERED`, `READ` y `UNKNOWN` llegaron con la migración `20260927000100`).
3. `.env.example` trae `WHATSAPP_ENABLED=true` con credenciales vacías, pero la doc la describe como opt-in y en el código el valor por defecto es `false`. Con ese ejemplo tal cual, `WhatsAppConfig` lanzaría `WHATSAPP_ACCESS_TOKEN requerida` al arrancar. Esto se dedujo del código; no se ejecutó.
4. La doc dice que `search` consulta "nombres/teléfono/email". El código lo confirma, pero campo por campo: no une nombre y apellido.
5. Los tests coinciden con el código:
   - El detalle no trae `messages` ni `lastSequence` y no expone `normalizedEmail` ni `processingToken`.
   - El 202 no trae `recipientPhone`.
   - La matriz RBAC real es: SUPPORT 403 en todo; OWNER 403 en los PATCH y el POST.
   - El POST concurrente con la misma clave devuelve un solo `id`.

## (g) Preguntas abiertas

1. **Modo de la píldora:** ¿"Operador" significa asignado, pausado o ambas cosas? ¿El backend debe exponer un `mode` o endpoints atómicos `takeover`/`release`?
2. **Escribir toma el control:** la regla 7 del flujo no está en el backend. ¿Se implementa en el backend (atómico) o en el frontend con dos o tres llamadas? ¿Qué pasa si la conversación está asignada a **otro** operador: se permite enviar sin tomarla (hoy sí) o se bloquea?
3. **Representación de Samanta y de los eventos de sistema:** ¿`authorType` en `Message`, OUTBOUND con `authorUserId` null, o un modelo `ConversationEvent` aparte? ¿Quién emite "Solicitud enviada al dueño", "El dueño aceptó" y los demás eventos?
4. **"N sin leer":** ¿cuenta conversaciones o mensajes?
5. **Búsqueda "o mensaje":** ¿se amplía el backend para buscar en `content`, o se acepta la búsqueda solo por cliente?
6. **Tiempo real:** el stack pide WebSockets. ¿Se agrega el gateway en el backend antes de la Bandeja, o se acepta el sondeo (c.13) de forma provisional?
7. **Fase mock:** ¿el backend agregará una ingestión solo de desarrollo y salidas mock para Facebook, Instagram y Web? ¿O el frontend tendrá su propia capa mock? Hoy el `.env` local tiene WhatsApp **habilitado**: ¿se apaga durante el desarrollo de la UI para no enviar mensajes reales?
8. **Número del dueño:** si el dueño escribe al número del negocio, se crea como Cliente y su chat aparece en la Bandeja. ¿Cómo se excluye o identifica?
9. **OWNER en la Bandeja:** ¿solo lectura, sin marcar leído ni responder? ¿Y SUPPORT sin acceso? Hay que confirmarlo con la matriz de permisos por vista del cronograma.
10. **Medios:** ¿se necesita previsualizar imágenes y documentos entrantes? Eso requiere un proxy hacia Graph API.
11. **Ventana de 24 h:** ¿se expone `replyWindowExpiresAt` o `canReply` para deshabilitar el composer antes de enviar?
12. **CORS:** ¿proxy de Next.js (recomendado) o habilitar CORS en el backend con un origen permitido?
