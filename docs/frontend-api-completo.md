# API de bk-crm para el frontend: documento completo

> Un solo archivo con toda la documentación de `bk-crm/docs/frontend-api/` (README y partes 01 a 05), generado el 3 de noviembre de 2026. El contenido es el mismo que el de esos archivos: solo cambian los títulos, que bajan un nivel, y los enlaces, que apuntan dentro de este archivo. Si la carpeta se actualiza, hay que volver a generarlo.

## Partes de este documento

- [README: API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend)
- [Parte 01: Autenticación, sesión, usuarios y salud](#parte-01-autenticación-sesión-usuarios-y-salud)
- [Parte 02: Configuración del restaurante y catálogo comercial](#parte-02-configuración-del-restaurante-y-catálogo-comercial)
- [Parte 03: Clientes, solicitudes de reserva y reservas (calendario)](#parte-03-clientes-solicitudes-de-reserva-y-reservas-calendario)
- [Parte 04: Bandeja: conversaciones, mensajes (WhatsApp y Messenger) y borradores de Samanta](#parte-04-bandeja-conversaciones-mensajes-whatsapp-y-messenger-y-borradores-de-samanta)
- [Parte 05: Implementación en ft-crm: de mock a live](#parte-05-implementación-en-ft-crm-de-mock-a-live)

## README: API de bk-crm para el frontend

> **Estado:** 3 de noviembre de 2026.
> - bk-crm: rama `main`, commit `9538556` («Messenger»), más los cambios del 3/11 que aún no tienen commit (ver [Cambios recientes del backend](#cambios-recientes-del-backend-3112026)).
> - ft-crm: rama `main`, commit `aaeb85e`, más los ajustes del BFF que aún no tienen commit (ver [Ya ajustado en ft-crm](#ya-ajustado-en-ft-crm-pendiente-de-commit)).
>
> Esta referencia se generó a partir del código fuente del backend y se verificó ruta por ruta contra ese código: roles, validaciones, mensajes de error y forma de las respuestas. Lo que dice de ft-crm se verificó contra su código actual. El plan para pasar ft-crm a modo live está en [Parte 05](#parte-05-implementación-en-ft-crm-de-mock-a-live).
>
> Reemplaza los contratos de `ft-crm/docs/backend/` (14/10/2026). Si hay diferencias entre ambos, prevalece este documento. Si este documento no coincide con el backend en ejecución, avisa al equipo de backend.
>
> Si ya empezaste a implementar con la versión anterior de esta documentación, revisa primero [Correcciones respecto de la versión anterior](#correcciones-respecto-de-la-versión-anterior).

### Contenido

| Parte | Qué cubre |
|---|---|
| [README](#readme-api-de-bk-crm-para-el-frontend) | Prompt para el asistente de IA, arquitectura (navegador → BFF → bk-crm), convenciones, mapa de rutas con la función de ft-crm, flujos, diferencias con ft-crm, cambios recientes, correcciones respecto de la versión anterior y preguntas abiertas de todos los módulos |
| [Parte 01](#parte-01-autenticación-sesión-usuarios-y-salud) | Login, refresh, logout, `/auth/me`, recuperación de contraseña, salud del servicio y usuarios |
| [Parte 02](#parte-02-configuración-del-restaurante-y-catálogo-comercial) | Configuración del restaurante, categorías y elementos comerciales |
| [Parte 03](#parte-03-clientes-solicitudes-de-reserva-y-reservas-calendario) | Clientes e intereses, solicitudes de reserva y reservas (calendario) |
| [Parte 04](#parte-04-bandeja-conversaciones-mensajes-whatsapp-y-messenger-y-borradores-de-samanta) | Conversaciones y mensajes de WhatsApp y Messenger, borradores de Samanta y webhooks de Meta |
| [Parte 05](#parte-05-implementación-en-ft-crm-de-mock-a-live) | Plan para pasar ft-crm a modo live: orden de trabajo, `endpoints.ts`, `types.ts` y `query-keys.ts` propuestos, guía por pantalla, manejo de errores, reglas transversales, diferencias del mock y cómo probar contra el backend real |

Cada ruta de los módulos 01 a 04 documenta:
- roles y código de éxito;
- la fila **ft-crm**: la función de `src/lib/api/endpoints.ts` con su firma, y si existe, es nueva o la resuelve el BFF;
- la fila **Caché**: la clave de `qk` y qué invalidar tras un cambio;
- cabeceras, body y query, con un ejemplo de petición cuando la ruta los tiene;
- un ejemplo de respuesta;
- la tabla de errores con el mensaje exacto;
- efectos y notas de uso.

Al final de cada parte de módulo están sus modelos, sus estados y transiciones, sus preguntas abiertas y sus tipos TypeScript.

### Prompt para el asistente de IA del frontend

Copia este archivo (`bk-crm/docs/frontend-api-completo.md`) en `ft-crm/docs/frontend-api-completo.md` y pega este texto al asistente:

```text
Eres el asistente del equipo de frontend de ft-crm (Next.js con App Router, React Query y zod). Vamos a conectar la app al backend real bk-crm (CRM_BACKEND_MODE=live).

Fuente de verdad: docs/frontend-api-completo.md, un solo archivo con seis partes: README (visión general y convenciones), Parte 01 a Parte 04 (una por módulo) y Parte 05 (plan de implementación).
- Antes de cambiar código, lee completas las partes README y 05 de ese archivo. El 05 es el plan de trabajo: orden de los pasos, código propuesto para src/lib/api/ (endpoints.ts, types.ts, query-keys.ts y el nuevo errors.ts), guía por pantalla, manejo de errores y diferencias del mock.
- En cada tarea, lee también la parte del módulo que corresponda: 01 (autenticación y usuarios), 02 (configuración y catálogo), 03 (clientes, solicitudes y reservas) o 04 (bandeja y Samanta).
- Cada ruta de los módulos tiene una fila "ft-crm" (función de endpoints.ts, su firma y si existe, es nueva o la resuelve el BFF) y una fila "Caché" (clave de qk y qué invalidar). Usa exactamente esas funciones y claves; si una función es nueva, cópiala de la sección 2 del 05.
- Este archivo reemplaza docs/backend/*.md. Si se contradicen, sigue docs/frontend-api-completo.md.

Reglas:
1. No inventes endpoints, campos, parámetros de query ni valores de enum. Si algo no está en la referencia, dilo y redacta la pregunta para el equipo de backend; no lo supongas.
2. El navegador nunca llama directo a bk-crm. Las rutas de la API se piden con apiFetch a /api/backend/<ruta> (src/lib/api/client.ts → src/app/api/backend/[...path]/route.ts). Login, logout y recuperación de contraseña van por /api/auth/*, y el refresh lo hace el BFF. No toques cookies ni tokens salvo que te lo pida.
3. bk-crm responde 400 ante cualquier campo de body o parámetro de query no declarado. Envía solo los campos documentados, omite los opcionales vacíos (no los mandes como "") y nunca envíes campos de solo lectura (id, createdAt, updatedAt ni objetos anidados de la respuesta). En un PATCH, omitir un campo lo conserva y null lo borra, pero solo si el campo admite null: cada módulo dice cuáles no (p. ej. PATCH /users/:id responde 400 a cualquier null).
4. Errores: message es string[] en la validación y string en los demás casos (apiFetch ya lo normaliza en ApiError.messages). Muestra tal cual los mensajes de negocio, que vienen en español. Los de validación vienen en inglés, salvo los de validadores propios de bk-crm, que vienen en español: conviértelos en errores de campo con fieldErrors (05, sección 4). Un 503 sin code es una función apagada en el servidor, no una falta de conexión.
5. Fechas: la API devuelve ISO 8601 en UTC. Muéstralas en el timeZone de GET /restaurant-config, no en la zona del navegador. Para enviarlas usa ISO con segundos y zona; toISOString() sirve.
6. Importes: son strings con 2 decimales ("38.50"). No los conviertas a number para enviarlos.
7. Enviar mensajes y generar borradores de Samanta exige la cabecera Idempotency-Key (16 a 80 caracteres [A-Za-z0-9_-]). Genera una por cada acción del usuario y reutilízala solo para reintentar esa misma acción. No uses el prefijo "samanta-". Los demás POST no llevan clave: tras un 504, refresca antes de reintentar (la tabla de reintentos por ruta está en el 05, sección 5).
8. No hay WebSockets ni SSE: usa polling con React Query, como ya hace la Bandeja.
9. Roles: ADMIN, OWNER, OPERATOR y SUPPORT (lista fija; un usuario puede tener varios). Léelos de GET /auth/me y respeta la matriz de permisos del README y la tabla de permisos de cada pantalla del 05, incluidas las reglas de OPERATOR sobre asignaciones.
10. Mantén el modo mock funcionando. Si cambias un contrato en src/lib/api/, actualiza también src/lib/mock/ para que se comporte como el backend real (lista de diferencias en el 05, sección 6).

Prioridades: sigue el "Orden de trabajo recomendado" del 05 (sección 1). Si hay que recortar:
1. Capa de API y manejo de errores (05, secciones 2 y 4).
2. Messenger (canal FACEBOOK) en la Bandeja: envío, límite de 2000 caracteres, ventana de 24 h y códigos MESSENGER_*.
3. Samanta con borradores (/conversations/:id/assistant-drafts): generar, consultar, editar, aprobar y rechazar. Deja de suponer que un OUTBOUND sin autor es de Samanta.
4. Clientes sin nombre (WhatsApp, y Messenger cuando Meta no da el nombre) y sin teléfono (Messenger): textos de respaldo en todas las vistas.
5. Solicitudes y reservas: el flujo del dueño aún no existe en el backend. Oculta lo que depende de él o márcalo como "próximamente", y añade las altas y ediciones que faltan.

En cada cambio:
- explica qué archivos tocas;
- actualiza tipos, endpoints y query keys (src/lib/api/);
- ejecuta npm run typecheck y npm test, y añade o ajusta las pruebas si existen.
```

### Arquitectura: navegador → BFF → bk-crm

```text
Navegador ── /api/backend/<ruta> ──▶ BFF Next.js (ft-crm, :5173) ── <ruta> + Bearer ──▶ bk-crm (:3000)
Navegador ── /api/auth/*         ──▶ BFF (login, logout, recuperación de contraseña)
```

#### Cómo se llama a una ruta

- El navegador nunca llama a bk-crm ni ve los tokens. Para usar una ruta de esta referencia, pide `/api/backend` + la ruta con `apiFetch` (`src/lib/api/client.ts`). Ejemplo: `GET /conversations?limit=50` se pide como `/api/backend/conversations?limit=50`.
- El BFF (`src/app/api/backend/[...path]/route.ts`) reenvía la petición a `CRM_BACKEND_URL` (por defecto `http://localhost:3000`) y añade `Authorization: Bearer` con la cookie httpOnly `crm_at`.
- Solo reenvía las cabeceras `content-type`, `idempotency-key` y `accept-language`. Si una ruta necesita otra cabecera, hay que añadirla al BFF.
- El BFF responde 404 `Ruta no disponible.` a estas rutas:
  - `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`;
  - `/auth/test-admin`;
  - `/webhooks/*`.

  Login, logout y recuperación de contraseña tienen sus propios handlers en `/api/auth/*`, y el refresh lo hace el BFF.
- Query string: el helper `toSearch` omite `undefined`, `null` y los textos vacíos o de solo espacios, y envía los booleanos como `'true'`/`'false'`. Úsalo siempre: bk-crm responde 400 a parámetros vacíos o no declarados.
- Modo (`CRM_BACKEND_MODE`): con `live` (por defecto) se llama a bk-crm; con `mock` se usa `src/lib/mock/server.ts` con el mismo contrato. En modo live, `/api/listo` consulta `GET /health`.
- En bk-crm, `FRONTEND_RESET_PASSWORD_URL` debe apuntar a `<origen del frontend>/reset-password`. Esa página lee `?token=`. En producción tiene que ser una URL `https` pública: si no, bk-crm no arranca.

#### Sesión (`src/lib/server/session.ts`)

- Si `crm_at` falta o vence en 30 s o menos, el BFF renueva la sesión antes de llamar.
- Si bk-crm responde 401, el BFF renueva una vez y repite la llamada.
- El BFF responde 401 con `code: 'SESSION_EXPIRED'` y borra las cookies cuando no puede renovar (falta la cookie `crm_rt` o el refresh responde 400/401) o cuando bk-crm sigue respondiendo 401 con un token recién renovado.
- Si no hay cookies, responde 401 con `code: 'NO_SESSION'`.
- Ante cualquier 401, el cliente emite `crm:session-expired` y redirige a `/login?motivo=sesion&next=…`.
- Cualquier otro fallo del refresh responde 503 `BACKEND_UNAVAILABLE` y no cierra la sesión.
- La deduplicación de refresh vive en la memoria del proceso. En producción hace falta una sola instancia del frontend o sesiones *sticky*.

#### Errores que añade el BFF

| Caso | Respuesta del BFF |
|---|---|
| bk-crm no responde a tiempo (`CRM_BACKEND_TIMEOUT_MS`, 15 000 ms por defecto; 65 000 ms al generar un borrador de Samanta) | 504 `{ statusCode, message, code: 'BACKEND_UNAVAILABLE' }` |
| Error de red hacia bk-crm | 503 `{ statusCode, message, code: 'BACKEND_UNAVAILABLE' }` |
| Sesión inexistente o vencida | 401 `{ code: 'NO_SESSION' }` o `{ code: 'SESSION_EXPIRED' }` |

El campo `code` lo pone el BFF; bk-crm nunca lo envía. `apiFetch` lanza `ApiError(status, messages[], code, body)`, donde `messages` ya es siempre un array.

#### Consecuencias para el despliegue

- **CORS no aplica.** El navegador solo habla con el BFF. bk-crm no tiene CORS habilitado y no lo necesita mientras se use el BFF.
- **Límites de intentos por cuenta.** bk-crm cuenta los intentos de login y recuperación de contraseña por IP y por cuenta (email o enlace). Aunque todas las peticiones lleguen con la IP del BFF, un usuario no agota el cupo de los demás. `TRUST_PROXY` (`src/main.ts`) hace que bk-crm tome la IP de `X-Forwarded-For` cuando delante hay un proxy inverso de confianza, pero con el BFF esa IP sigue siendo la del servidor de Next.js: sus handlers de `/api/auth/*` no reenvían la IP del navegador. En la práctica, el límite es por cuenta.
- **Timeout de Samanta.** Generar un borrador espera a la IA hasta `SAMANTA_TIMEOUT_MS`: 20 s por defecto y 60 s como máximo. Por eso el BFF usa para esa ruta un techo de al menos 65 s (`src/lib/server/backend.ts`); el resto sigue con `CRM_BACKEND_TIMEOUT_MS`. Ante un 504, repite el POST con la misma `Idempotency-Key`: así se recupera el borrador sin generar otro.

### Convenciones generales

Reglas comunes a todas las rutas del backend, tomadas de `src/main.ts`, `src/common/filters/global-exception.filter.ts` y los guards de `src/auth`.

#### URL base y rutas

- Desde el navegador no se usa esta URL: todo pasa por el BFF (`/api/backend/<ruta>`; ver [Arquitectura](#arquitectura-navegador--bff--bk-crm)).
- URL base en desarrollo: `http://localhost:3000`. El puerto sale de la variable `PORT` y, si no está definida, es `3000`. URL de los demás entornos: (por confirmar).
- No hay prefijo global (`/api`, `/v1`) ni versionado. Las rutas cuelgan de la raíz, p. ej. `POST http://localhost:3000/auth/login`.
- Una ruta inexistente responde 404 con `"message": "Cannot GET /ruta-inexistente"`.
- Los IDs son UUID en texto. Los parámetros `:id` se validan con `ParseUUIDPipe` (acepta cualquier versión). Si no son UUID, la respuesta es 400 `Validation failed (uuid is expected)`.
- Los UUID del body y de la query (`categoryId`, `customerId`, `assignedUserId`…) se validan con `@IsUUID()`, que exige además versión 1 a 8 y variante RFC (también acepta el UUID nulo y el máximo). Si no cumplen, la respuesta es 400 `<campo> must be a UUID`. Los ids que genera bk-crm son v4 y siempre cumplen; un id inventado a mano para un mock o una prueba puede no hacerlo.
- Las fechas se devuelven en ISO 8601 UTC (`"2026-11-03T02:32:11.984Z"`). Los campos sin valor llegan como `null`.

#### Peticiones, respuestas y validación

- El body se envía en JSON con `Content-Type: application/json`. Sin esa cabecera el body no se interpreta y la validación responde 400 como si faltaran todos los campos. Si el JSON está mal formado, la respuesta es 400 con el texto del parser en `message` (string).
- El tamaño máximo del body es el de Express por defecto (100 kb). Si se supera, la respuesta es 413 `El cuerpo de la petición supera el tamaño máximo permitido`. Los demás errores del parser conservan su código; por ejemplo, un `charset` que no empieza por `utf-` (`latin1`, o `utf8` sin guion) responde 415 `unsupported charset "LATIN1"`.
- No hay un envoltorio común: la respuesta es el recurso, un array o `{ "message": "..." }`. Los listados paginados devuelven `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }` (ver [Paginación y orden](#paginación-y-orden)). Excepciones: `GET /` responde texto, los `GET` de verificación de los webhooks responden `text/plain` y las rutas con 204 (p. ej. `DELETE /customers/:id/interests/:commercialItemId`) no tienen body.
- Hay un `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`. Esto implica:
  - Un campo que no está declarado en el DTO no se descarta en silencio: la respuesta es 400 `property <campo> should not exist`, y este mensaje aparece primero en el array. No hay que enviar campos que solo existen en la UI (`confirmPassword`) ni campos de solo lectura (`id`, `createdAt`, `isActive` o `roles` en `PATCH /users/:id`).
  - `transform` convierte el body a la clase del DTO, pero no hay conversión implícita de tipos: `"true"` no cuenta como booleano ni `"5"` como número. Solo convierten los DTO que lo declaran con `@Type` o `@Transform` (p. ej. `page` y `limit` en los query params de los listados).
  - Un campo opcional se omite. Enviar `null` no es lo mismo que omitirlo: `null` pasa `@IsOptional()` y llega al servicio.
  - El pipe no recorta espacios. En usuarios y login normalizan los servicios: el email se pasa a minúsculas y los nombres se guardan con `trim`. El servicio también aplica `trim` al email, pero no tiene efecto práctico: `@IsEmail()` rechaza con 400 un email con espacios alrededor, así que hay que recortarlo en el cliente. Los demás módulos recortan en el DTO con `@Transform` (el detalle está en cada módulo).
  - Los mensajes de class-validator están en inglés; los mensajes personalizados, en español.
- El orden de comprobación es: guards (rate limit, access token, rol), luego validación (UUID y body) y al final las reglas del servicio. Por eso, sin token se recibe 401 aunque el body sea inválido, y con token pero sin el rol necesario, 403. La excepción es el parser de Express, que actúa antes que los guards: un JSON mal formado responde 400 (un body de más de 100 kb, 413, y un `charset` que no empieza por `utf-`, 415) aunque falte el token.

#### Formato de errores

Todos los errores pasan por el filtro global `GlobalExceptionFilter`. `message` es un **array** solo en el 400 de validación de DTO; en los demás casos es un **string** (el 503 de `GET /health` no trae `message`). Conviene normalizarlo en el cliente: `Array.isArray(message) ? message : [message]`.

| Código | `message` | `error` | Cuándo |
|---|---|---|---|
| 400 | array de strings | `"Bad Request"` | Validación de DTO, incluidos los campos no permitidos |
| 400 | string | `"Bad Request"` | Reglas del servicio, UUID inválido en la ruta o JSON mal formado |
| 401 | `"Unauthorized"` | no viene | Falta `Authorization`, el token está mal formado, la firma es inválida o el token expiró |
| 401 | string | `"Unauthorized"` | Credenciales incorrectas, usuario inactivo, sesión revocada o vencida, refresh token inválido |
| 403 | string | `"Forbidden"` | El usuario no tiene ninguno de los roles exigidos, o una regla del servicio lo impide (el detalle está en cada módulo) |
| 404 | string | `"Not Found"` | El recurso o la ruta no existe |
| 409 | string | `"Conflict"` | Duplicados, protección del último ADMIN o conflicto entre transacciones |
| 413 | `"El cuerpo de la petición supera el tamaño máximo permitido"` | `"Payload Too Large"` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` (p. ej. `"LATIN1"`) | `"Unsupported Media Type"` | El `Content-Type` trae un `charset` que no empieza por `utf-` |
| 429 | `"ThrottlerException: Too Many Requests"` | no viene | Se superó el límite de intentos de login o de recuperación de contraseña. Otros módulos pueden devolver 429 con su propio mensaje, también sin `error` (p. ej. `Límite de generación de Samanta alcanzado`) |
| 500 | `"Ocurrió un error interno"` | no viene (en su lugar trae `path`, `method` y `timestamp`) | Error no controlado; no expone detalles internos |
| 503 | no viene en `GET /health`; string en otros módulos | no viene en `GET /health`; `"Service Unavailable"` en otros módulos | En `GET /health` el body es el objeto de salud con `"status": "error"`. Otros módulos responden 503 cuando una integración está desactivada o mal configurada (p. ej. `Samanta está desactivada`) |

Esta tabla describe lo que responde bk-crm. Lo que ve el navegador:
- En las rutas de `/api/backend`, los 401 de bk-crm nunca llegan tal cual: el BFF responde su propio 401 (`Tu sesión terminó. Vuelve a iniciar sesión.` con `code: "SESSION_EXPIRED"`, o `Inicia sesión para continuar.` con `code: "NO_SESSION"`; ver [Sesión](#sesión-srclibserversessionts)). Los demás códigos llegan con el body de bk-crm sin cambios.
- Los handlers de `/api/auth/*` traducen los errores de bk-crm, también el 429, a sus propios textos (ver cada ruta en [01](#parte-01-autenticación-sesión-usuarios-y-salud)).

400 de validación de DTO (array):

```json
{
  "message": [
    "property confirmPassword should not exist",
    "email must be an email",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

400 de regla de negocio o UUID inválido (string):

```json
{
  "message": "Validation failed (uuid is expected)",
  "error": "Bad Request",
  "statusCode": 400
}
```

401 genérico del guard (sin token, token mal formado, firma inválida o token expirado):

```json
{
  "message": "Unauthorized",
  "statusCode": 401
}
```

401 con motivo:

```json
{
  "message": "Sesión no válida o expirada",
  "error": "Unauthorized",
  "statusCode": 401
}
```

403:

```json
{
  "message": "No tienes permisos para realizar esta acción",
  "error": "Forbidden",
  "statusCode": 403
}
```

404:

```json
{
  "message": "Usuario no encontrado",
  "error": "Not Found",
  "statusCode": 404
}
```

409:

```json
{
  "message": "Ya existe un usuario registrado con este correo",
  "error": "Conflict",
  "statusCode": 409
}
```

429:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

500:

```json
{
  "statusCode": 500,
  "message": "Ocurrió un error interno",
  "path": "/users/7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "method": "PATCH",
  "timestamp": "2026-11-03T02:32:11.984Z"
}
```

#### Autenticación y sesión

- Las rutas protegidas exigen la cabecera `Authorization: Bearer <accessToken>`.
- **Access token**: JWT HS256 firmado con `JWT_SECRET`. Dura lo que indique `JWT_EXPIRES_IN`: en `.env.example` es `15m`; el valor real de cada entorno está (por confirmar). Sus claims son:

```json
{
  "sub": "3f6c1a52-8d0e-4b7a-9c61-2f4e8b9d0a17",
  "sessionId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "email": "rosa.mamani@example.com",
  "roles": ["ADMIN"],
  "iat": 1793673131,
  "exp": 1793674031
}
```

- El BFF usa `exp` para renovar a tiempo y para fijar el `maxAge` de las cookies; la UI no lo necesita. Los `roles` y el `email` del token reflejan el momento en que se emitió y pueden quedar desactualizados. Para la UI hay que usar `GET /auth/me` o `user.roles` del login.
- En cada petición protegida el backend comprueba:
  - la firma y la expiración del token;
  - que el usuario exista y esté activo;
  - que la sesión no esté revocada ni vencida.
- Además, los roles se leen de la base de datos en cada petición. Por eso desactivar a un usuario o cambiarle los roles surte efecto de inmediato.
- **Refresh token**: JWT firmado con otro secreto (`JWT_REFRESH_SECRET`). Dura lo que indique `JWT_REFRESH_EXPIRES_IN` (`7d` en `.env.example`). Solo se usa en `POST /auth/refresh`, y el backend guarda únicamente su hash SHA-256.
- **Sesión**: cada login crea una sesión independiente, así que un usuario puede tener varias a la vez (p. ej. en varios dispositivos).
  - La sesión vence 7 días después del login. Ese plazo está fijo en el código y el refresh no lo alarga.
  - Cuando vence la sesión o el refresh token, lo que ocurra antes, hay que volver a iniciar sesión.
- **Rotación**: cada refresh exitoso devuelve un par de tokens nuevo, y el refresh token usado deja de servir (es de un solo uso).
  - Si se reutiliza un refresh token que ya rotó, la respuesta es 401 `Refresh token inválido`. La sesión no se revoca: el último refresh token emitido sigue funcionando.
  - Si llegan dos refresh simultáneos con el mismo token, solo uno tiene éxito. El otro recibe 401 `Refresh token ya utilizado o sesión no válida` o `Refresh token inválido`. Por eso el BFF mantiene un único refresh en curso por token y reutiliza su resultado durante 60 s; el navegador no tiene que hacer nada.
  - Los access tokens anteriores de la misma sesión siguen siendo válidos hasta su `exp`.
- **Logout** (`POST /auth/logout`): revoca solo la sesión del access token enviado. Desde ese momento, el access token y el refresh token de esa sesión responden 401. Las demás sesiones del usuario siguen activas.
- **Revocación de todas las sesiones**: ocurre al desactivar al usuario (`PATCH /users/:id/status` con `isActive: false`) y al restablecer la contraseña (`POST /auth/reset-password`). No hay endpoint para listar sesiones ni para cerrar sesión en todos los dispositivos.
- **`GET /auth/me`** devuelve `{ id, sessionId, firstName, lastName, email, roles }` con los datos actuales de la base de datos.
- El BFF ya implementa este ciclo: guarda los tokens en cookies httpOnly, renueva una sola vez ante un 401 y, si no puede, responde `SESSION_EXPIRED` (ver [Sesión](#sesión-srclibserversessionts)).
- No hay registro público: los usuarios los crea un ADMIN. Tampoco hay endpoint para cambiar la contraseña estando autenticado; solo existe el flujo de recuperación.

#### Roles

Los valores de `RoleCode` son `ADMIN`, `OWNER`, `OPERATOR` y `SUPPORT`. En el seed se llaman Administrador, Propietario, Operador y Soporte EYAQ. No hay endpoint para listar roles, así que el frontend debe usar esta lista fija.

Un usuario puede tener varios roles, y una ruta lo admite si tiene al menos uno de los permitidos. Si no tiene ninguno, la respuesta es 403 `No tienes permisos para realizar esta acción`. El guard también define el 403 `Usuario no disponible en la solicitud`, pero no se produce en las rutas actuales porque siempre se ejecuta después del guard de token.

Resumen de los `@Roles` de todos los controladores de `src`. Un `@Roles` declarado en una ruta sustituye al del controlador (no se suman):

| Área (rutas) | ADMIN | OWNER | OPERATOR | SUPPORT |
|---|---|---|---|---|
| Sesión propia (`GET /auth/me`, `POST /auth/logout`) | Sí | Sí | Sí | Sí |
| Usuarios (`/users/**`) y `GET /auth/test-admin` | Sí | No | No | No |
| Configuración del restaurante: ver (`GET /restaurant-config`) | Sí | Sí | Sí | No |
| Configuración del restaurante: guardar (`PUT /restaurant-config`) | Sí | No | No | No |
| Catálogo: ver (`GET /commercial-categories`, `GET /commercial-items` y sus detalles) | Sí | Sí | Sí | No |
| Catálogo: crear, editar, cambiar estado y aprobar ítems | Sí | No | No | No |
| Clientes: ver (`GET /customers`, `GET /customers/:id`) | Sí | Sí | Sí | No |
| Clientes: crear, editar, cambiar estado y gestionar intereses | Sí | No | Sí | No |
| Solicitudes de reserva: ver | Sí | Sí | Sí | No |
| Solicitudes de reserva: crear, editar y cambiar estado | Sí | No | Sí | No |
| Reservas: ver (`GET /reservations`, `GET /reservations/:id`) | Sí | Sí | Sí | No |
| Reservas: crear (`POST /reservations`) | Sí | No | No | No |
| Reservas: editar, cambiar estado, asignar responsable, añadir notas y reprogramar | Sí | No | Sí | No |
| Conversaciones: ver (lista, detalle y mensajes) | Sí | Sí | Sí | No |
| Conversaciones: enviar mensajes, marcar como leídas, pausar el asistente y asignar | Sí | No | Sí | No |
| Borradores de Samanta: ver (`GET /conversations/:id/assistant-drafts` y `/:draftId`) | Sí | Sí | Sí | No |
| Borradores de Samanta: generar, editar, aprobar y rechazar | Sí | No | Sí | No |

- **ADMIN**: acceso completo. Es el único que gestiona usuarios, guarda la configuración del restaurante, administra el catálogo y crea reservas manuales.
- **OWNER**: solo lectura en todos los módulos de negocio.
- **OPERATOR**: lectura y operación diaria (clientes, solicitudes, reservas existentes, conversaciones y Samanta).
- **SUPPORT**: no figura en ningún `@Roles`. Solo puede usar las rutas públicas, `GET /auth/me` y `POST /auth/logout`; el resto responde 403.
- Algunos servicios añaden reglas propias por rol (el detalle está en cada módulo):
  - Un OPERATOR solo puede tomar o liberar su propia asignación en reservas y conversaciones.
  - Un OPERATOR no puede operar borradores de Samanta de una conversación asignada a otro usuario.
- `GET/POST /webhooks/whatsapp` y `GET/POST /webhooks/messenger` son públicos y están pensados para Meta. El frontend no los usa.

#### Rate limiting

- Tres rutas tienen límite de intentos (`ThrottlerGuard`), contado por ruta, por IP y por cuenta: el email en login y `forgot-password`, y el enlace (`token`) en `reset-password`:
  - `POST /auth/login`: 5 intentos cada 60 s.
  - `POST /auth/forgot-password`: 3 peticiones cada 60 s.
  - `POST /auth/reset-password`: 5 peticiones cada 60 s.
- Al superar el límite, la respuesta es 429 `{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }` con la cabecera `Retry-After` (en segundos), y esa combinación de IP y cuenta queda bloqueada 60 s. Las demás cuentas siguen funcionando.
- Las respuestas dentro del límite incluyen las cabeceras `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset` (segundos hasta que se reinicia la ventana).
- El navegador no ve ni ese body ni esas cabeceras: los handlers de `/api/auth/*` responden su propio 429 `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.`, sin `Retry-After` ni `X-RateLimit-*`. Espera un minuto antes de reactivar el botón.
- El límite se evalúa antes de validar el body, así que las peticiones que no pasan la validación del DTO también consumen cupo. Un JSON mal formado no lo consume, porque el parser lo rechaza antes.
- Los contadores viven en la memoria del proceso y se reinician cuando se reinicia el servidor.
- La IP contada es `req.ip`: la de la conexión o, con `TRUST_PROXY` (número de saltos o direcciones del proxy de confianza), la que un proxy inverso de confianza pone en `X-Forwarded-For`. En las peticiones del navegador es siempre la del servidor del BFF, porque sus handlers de `/api/auth/*` no reenvían la IP del navegador. Por eso también se cuenta por cuenta, y en la práctica el límite es por cuenta (ver [Consecuencias para el despliegue](#consecuencias-para-el-despliegue)).
- `POST /auth/refresh` y las demás rutas no tienen límite: el `ThrottlerGuard` no es global y solo se aplica en las tres rutas anteriores. El límite de generación de Samanta es una regla aparte de su servicio (el detalle está en ese módulo).

#### CORS

CORS no está habilitado en bk-crm (`main.ts` no llama a `app.enableCors()`). No hace falta mientras el navegador solo hable con el BFF de Next.js. Solo habría que habilitarlo si algún cliente web llamara directamente a bk-crm.

#### Paginación y orden

Los listados paginados devuelven `{ data, pagination: { page, limit, total, totalPages } }`:
- `page`: entero de 1 a 1 000 000. Por defecto vale 1.
- `limit`: de 1 a 100. Por defecto vale 20; en conversaciones y mensajes, 50.
- `totalPages`: `Math.ceil(total / limit)`. Vale 0 si no hay resultados.

`GET /users` y `GET /commercial-categories` devuelven un array plano. `GET /conversations/:id/assistant-drafts` devuelve `{ data }` con los 50 borradores más recientes, sin paginación.

El orden es fijo; solo en los elementos comerciales se puede elegir:

| Listado | Orden |
|---|---|
| `GET /customers` | `lastContactAt` desc, luego `id` asc |
| `GET /customers/:id` → `interests` | `lastInterestedAt` desc, luego `id` asc |
| `GET /reservation-requests` | `createdAt` desc, luego `id` asc |
| `GET /reservations` | `reservationAt` asc, luego `id` asc |
| `GET /conversations` | `lastMessageAt` desc (los nulos al final), luego `id` desc |
| `GET /conversations/:id/messages` | `sequence` desc: la página 1 trae lo más reciente |
| `GET /conversations/:id/assistant-drafts` | `createdAt` desc, luego `id` desc |
| `GET /commercial-items` | `sort` (`category`, `name` o `createdAt`; por defecto `createdAt`) y `order` (`asc` o `desc`; por defecto `desc`) |
| `GET /commercial-categories` | `displayOrder` asc, luego `nameEs` y `nameEn` |
| `GET /users` | `createdAt` desc |

#### Fechas, zona horaria e importes

- **Lectura:** la API devuelve instantes ISO 8601 en UTC (`"2026-11-08T01:00:00.000Z"`). Muéstralos en el `timeZone` de `GET /restaurant-config` (`America/Lima` por defecto), no en la zona del navegador.
- **Envío** (body o query): ISO 8601 con segundos y zona explícita (`Z` o `±HH:mm`), con hasta 3 decimales. `Date.prototype.toISOString()` cumple el formato.
  - Una fecha sin zona o sin segundos responde 400.
  - En la URL, `+` debe ir como `%2B`; `URLSearchParams` ya lo hace.
- **Rangos del calendario:** `dateFrom` es inclusivo y `dateTo` exclusivo. Calcula la medianoche en la zona del restaurante y conviértela a UTC.
- **Importes:** son strings de `"0"` a `"99999999.99"`, con hasta 2 decimales. La API los devuelve siempre con 2 decimales (`"38.50"`).

#### Idempotencia

- `POST /conversations/:id/messages` y `POST /conversations/:id/assistant-drafts` exigen la cabecera `Idempotency-Key`: de 16 a 80 caracteres `[A-Za-z0-9_-]`. Un `crypto.randomUUID()` sirve.
- Genera una clave nueva por cada acción del usuario. Reutilízala solo para reintentar esa misma acción, por ejemplo tras un timeout, un error de red o un doble clic.
- Si repites la clave con los mismos datos, el backend devuelve el resultado original sin repetir la acción. Si la repites con otros datos, responde 409.
- No uses el prefijo `samanta-`: el backend lo reserva para la aprobación de borradores.

#### Tiempo real

- No hay WebSockets ni SSE: todo se actualiza por polling. Hoy la Bandeja consulta la lista cada 6 s y el chat cada 4 s (cada 1,5 s mientras hay salientes en `QUEUED` o `SENDING`). Los intervalos de todas las pantallas están en [Polling](#polling).
- Un worker de bk-crm procesa la cola de envío cada 2 s. Los recibos de Meta (entregado o leído) llegan cuando Meta los envía.

### Mapa de rutas

Columnas:
- **Vía**: cómo se llama la ruta desde el navegador. Puede ser `/api/backend` + la ruta, un handler propio del BFF (`/api/auth/*`, `/api/listo`), *BFF (automático)* (el refresh), *Bloqueada* (el BFF responde 404) o *No se usa* (`GET /`: el proxy exige al menos un segmento).
- **Roles**: *Público* significa que la ruta no exige token.
- **ft-crm**: función de `src/lib/api/endpoints.ts` que llama a la ruta. *(nueva)* indica que aún no existe; la propuesta completa está en [05-implementacion-ft-crm.md](#21-endpointsts). *—* indica que el navegador no usa la ruta.

#### Autenticación y usuarios — [Parte 01](#parte-01-autenticación-sesión-usuarios-y-salud)

| Método | Ruta | Roles | Éxito | Vía | ft-crm | Detalle |
|---|---|---|---|---|---|---|
| GET | `/` | Público | 200 | No se usa | — | [Ver la respuesta raíz de la API](#ver-la-respuesta-raíz-de-la-api) |
| POST | `/auth/login` | Público (5 intentos cada 60 s por IP y cuenta) | 201 | `/api/auth/login` | `sessionApi.login` | [Iniciar sesión](#iniciar-sesión) |
| POST | `/auth/refresh` | Público (requiere refreshToken en el body) | 201 | BFF (automático) | `refreshSession` (BFF) | [Renovar tokens](#renovar-tokens) |
| POST | `/auth/logout` | Cualquier usuario autenticado | 201 | `/api/auth/logout` | `sessionApi.logout` | [Cerrar sesión](#cerrar-sesión) |
| GET | `/auth/me` | Cualquier usuario autenticado | 200 | `/api/backend` | `sessionApi.me` | [Obtener el usuario autenticado](#obtener-el-usuario-autenticado) |
| GET | `/auth/test-admin` | ADMIN | 200 | Bloqueada por el BFF | — | [Comprobar acceso de administrador (endpoint de prueba)](#comprobar-acceso-de-administrador-endpoint-de-prueba) |
| POST | `/auth/forgot-password` | Público (3 cada 60 s por IP y cuenta) | 200 | `/api/auth/forgot-password` | `sessionApi.forgotPassword` | [Solicitar recuperación de contraseña](#solicitar-recuperación-de-contraseña) |
| POST | `/auth/reset-password` | Público (5 cada 60 s por IP y enlace) | 200 | `/api/auth/reset-password` | `sessionApi.resetPassword` | [Restablecer contraseña](#restablecer-contraseña) |
| GET | `/health` | Público | 200 (503 si la base de datos no responde) | `/api/listo` | Handler `/api/listo` (BFF) | [Comprobar el estado del servicio](#comprobar-el-estado-del-servicio) |
| POST | `/users` | ADMIN | 201 | `/api/backend` | `usersApi.create` | [Crear usuario](#crear-usuario) |
| GET | `/users` | ADMIN | 200 | `/api/backend` | `usersApi.list` | [Listar usuarios](#listar-usuarios) |
| GET | `/users/:id` | ADMIN | 200 | `/api/backend` | `usersApi.get` (nueva) | [Ver el detalle de un usuario](#ver-el-detalle-de-un-usuario) |
| PATCH | `/users/:id` | ADMIN | 200 | `/api/backend` | `usersApi.update` (nueva) | [Editar los datos de un usuario](#editar-los-datos-de-un-usuario) |
| PATCH | `/users/:id/status` | ADMIN | 200 | `/api/backend` | `usersApi.setActive` | [Activar o desactivar un usuario](#activar-o-desactivar-un-usuario) |
| PATCH | `/users/:id/roles` | ADMIN | 200 | `/api/backend` | `usersApi.setRoles` | [Reemplazar los roles de un usuario](#reemplazar-los-roles-de-un-usuario) |

#### Configuración y catálogo — [Parte 02](#parte-02-configuración-del-restaurante-y-catálogo-comercial)

| Método | Ruta | Roles | Éxito | Vía | ft-crm | Detalle |
|---|---|---|---|---|---|---|
| GET | `/restaurant-config` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `configApi.get` | [Obtener la configuración del restaurante](#obtener-la-configuración-del-restaurante) |
| PUT | `/restaurant-config` | ADMIN | 200 | `/api/backend` | `configApi.put` | [Guardar la configuración del restaurante (crear o reemplazar)](#guardar-la-configuración-del-restaurante-crear-o-reemplazar) |
| POST | `/commercial-categories` | ADMIN | 201 | `/api/backend` | `catalogApi.createCategory` (nueva) | [Crear categoría comercial](#crear-categoría-comercial) |
| GET | `/commercial-categories` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `catalogApi.categories` | [Listar categorías comerciales](#listar-categorías-comerciales) |
| GET | `/commercial-categories/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `catalogApi.category` (nueva) | [Ver detalle de una categoría comercial](#ver-detalle-de-una-categoría-comercial) |
| PATCH | `/commercial-categories/:id` | ADMIN | 200 | `/api/backend` | `catalogApi.updateCategory` (nueva) | [Editar categoría comercial](#editar-categoría-comercial) |
| PATCH | `/commercial-categories/:id/status` | ADMIN | 200 | `/api/backend` | `catalogApi.setCategoryActive` (nueva) | [Activar o desactivar una categoría comercial](#activar-o-desactivar-una-categoría-comercial) |
| POST | `/commercial-items` | ADMIN | 201 | `/api/backend` | `catalogApi.create` (cambia el tipo del body) | [Crear elemento comercial](#crear-elemento-comercial) |
| GET | `/commercial-items` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `catalogApi.items` | [Listar elementos comerciales](#listar-elementos-comerciales) |
| GET | `/commercial-items/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `catalogApi.item` (nueva) | [Ver detalle de un elemento comercial](#ver-detalle-de-un-elemento-comercial) |
| PATCH | `/commercial-items/:id` | ADMIN | 200 | `/api/backend` | `catalogApi.update` (nueva) | [Editar elemento comercial](#editar-elemento-comercial) |
| PATCH | `/commercial-items/:id/status` | ADMIN | 200 | `/api/backend` | `catalogApi.setActive` | [Activar o desactivar un elemento comercial](#activar-o-desactivar-un-elemento-comercial) |
| PATCH | `/commercial-items/:id/approval` | ADMIN | 200 | `/api/backend` | `catalogApi.setApproval` | [Cambiar la aprobación de un elemento comercial](#cambiar-la-aprobación-de-un-elemento-comercial) |

#### Clientes, solicitudes y reservas — [Parte 03](#parte-03-clientes-solicitudes-de-reserva-y-reservas-calendario)

| Método | Ruta | Roles | Éxito | Vía | ft-crm | Detalle |
|---|---|---|---|---|---|---|
| POST | `/customers` | ADMIN, OPERATOR | 201 | `/api/backend` | `customersApi.create` (nueva) | [Crear cliente](#crear-cliente) |
| GET | `/customers` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `customersApi.list` | [Listar clientes](#listar-clientes) |
| GET | `/customers/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `customersApi.get` | [Ver detalle de cliente](#ver-detalle-de-cliente) |
| PATCH | `/customers/:id` | ADMIN, OPERATOR | 200 | `/api/backend` | `customersApi.update` (nueva) | [Editar cliente](#editar-cliente) |
| PATCH | `/customers/:id/status` | ADMIN, OPERATOR | 200 | `/api/backend` | `customersApi.setStatus` | [Cambiar estado del cliente](#cambiar-estado-del-cliente) |
| POST | `/customers/:id/interests` | ADMIN, OPERATOR | 200 | `/api/backend` | `customersApi.addInterest` (nueva) | [Registrar interés del cliente](#registrar-interés-del-cliente) |
| DELETE | `/customers/:id/interests/:commercialItemId` | ADMIN, OPERATOR | 204 | `/api/backend` | `customersApi.removeInterest` (nueva) | [Quitar interés del cliente](#quitar-interés-del-cliente) |
| POST | `/reservation-requests` | ADMIN, OPERATOR | 201 | `/api/backend` | `requestsApi.create` (nueva) | [Crear solicitud de reserva](#crear-solicitud-de-reserva) |
| GET | `/reservation-requests` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `requestsApi.list` | [Listar solicitudes de reserva](#listar-solicitudes-de-reserva) |
| GET | `/reservation-requests/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `requestsApi.get` | [Ver detalle de solicitud de reserva](#ver-detalle-de-solicitud-de-reserva) |
| PATCH | `/reservation-requests/:id` | ADMIN, OPERATOR | 200 | `/api/backend` | `requestsApi.update` (nueva) | [Editar solicitud de reserva](#editar-solicitud-de-reserva) |
| PATCH | `/reservation-requests/:id/status` | ADMIN, OPERATOR | 200 | `/api/backend` | `requestsApi.cancel` | [Cancelar solicitud de reserva](#cancelar-solicitud-de-reserva) |
| POST | `/reservations` | ADMIN | 201 | `/api/backend` | `reservationsApi.create` (nueva) | [Crear reserva manual](#crear-reserva-manual) |
| GET | `/reservations` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `reservationsApi.list` | [Listar reservas (calendario)](#listar-reservas-calendario) |
| GET | `/reservations/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `reservationsApi.get` | [Ver detalle de reserva](#ver-detalle-de-reserva) |
| PATCH | `/reservations/:id` | ADMIN, OPERATOR | 200 | `/api/backend` | `reservationsApi.update` (nueva) | [Editar reserva](#editar-reserva) |
| PATCH | `/reservations/:id/status` | ADMIN, OPERATOR | 200 | `/api/backend` | `reservationsApi.setStatus` | [Cambiar estado de reserva](#cambiar-estado-de-reserva) |
| PATCH | `/reservations/:id/assignee` | ADMIN, OPERATOR | 200 | `/api/backend` | `reservationsApi.assign` (nueva) | [Asignar o liberar responsable](#asignar-o-liberar-responsable) |
| POST | `/reservations/:id/notes` | ADMIN, OPERATOR | 201 | `/api/backend` | `reservationsApi.addNote` (nueva) | [Agregar observación a la reserva](#agregar-observación-a-la-reserva) |
| PATCH | `/reservations/:id/reschedule` | ADMIN, OPERATOR | 200 | `/api/backend` | `reservationsApi.reschedule` (nueva) | [Reprogramar reserva](#reprogramar-reserva) |

#### Bandeja y Samanta — [Parte 04](#parte-04-bandeja-conversaciones-mensajes-whatsapp-y-messenger-y-borradores-de-samanta)

| Método | Ruta | Roles | Éxito | Vía | ft-crm | Detalle |
|---|---|---|---|---|---|---|
| GET | `/conversations` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `conversationsApi.list` | [Listar conversaciones (bandeja)](#listar-conversaciones-bandeja) |
| GET | `/conversations/:id` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `conversationsApi.get` | [Ver detalle de una conversación](#ver-detalle-de-una-conversación) |
| GET | `/conversations/:id/messages` | ADMIN, OWNER, OPERATOR | 200 | `/api/backend` | `conversationsApi.messages` | [Ver historial de mensajes](#ver-historial-de-mensajes) |
| POST | `/conversations/:id/messages` | ADMIN, OPERATOR | 202 | `/api/backend` | `conversationsApi.send` | [Enviar un mensaje de texto](#enviar-un-mensaje-de-texto) |
| PATCH | `/conversations/:id/read` | ADMIN, OPERATOR | 200 | `/api/backend` | `conversationsApi.markRead` | [Marcar como leído hasta un mensaje](#marcar-como-leído-hasta-un-mensaje) |
| PATCH | `/conversations/:id/assistant` | ADMIN, OPERATOR | 200 | `/api/backend` | `conversationsApi.setAssistantPaused` | [Pausar o reanudar a Samanta en la conversación](#pausar-o-reanudar-a-samanta-en-la-conversación) |
| PATCH | `/conversations/:id/assignee` | ADMIN, OPERATOR (un OPERATOR solo toma conversaciones libres o se desasigna de las propias) | 200 | `/api/backend` | `conversationsApi.assign` | [Asignar, tomar o liberar una conversación](#asignar-tomar-o-liberar-una-conversación) |
| POST | `/conversations/:id/assistant-drafts` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | 201 | `/api/backend` | `assistantDraftsApi.generate` (nueva) | [Generar un borrador con Samanta](#generar-un-borrador-con-samanta) |
| GET | `/conversations/:id/assistant-drafts` | ADMIN, OPERATOR, OWNER | 200 | `/api/backend` | `assistantDraftsApi.list` (nueva) | [Listar borradores de Samanta](#listar-borradores-de-samanta) |
| GET | `/conversations/:id/assistant-drafts/:draftId` | ADMIN, OPERATOR, OWNER | 200 | `/api/backend` | `assistantDraftsApi.get` (nueva) | [Ver un borrador de Samanta](#ver-un-borrador-de-samanta) |
| PATCH | `/conversations/:id/assistant-drafts/:draftId` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | 200 | `/api/backend` | `assistantDraftsApi.edit` (nueva) | [Editar un borrador](#editar-un-borrador) |
| POST | `/conversations/:id/assistant-drafts/:draftId/approve` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | 202 | `/api/backend` | `assistantDraftsApi.approve` (nueva) | [Aprobar un borrador y encolar el envío](#aprobar-un-borrador-y-encolar-el-envío) |
| POST | `/conversations/:id/assistant-drafts/:draftId/reject` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | 200 | `/api/backend` | `assistantDraftsApi.reject` (nueva) | [Rechazar un borrador](#rechazar-un-borrador) |
| GET | `/webhooks/whatsapp` | Público (solo Meta; no usar desde el frontend) | 200 | Bloqueada (solo Meta) | — | [Verificar el webhook de WhatsApp](#verificar-el-webhook-de-whatsapp) |
| POST | `/webhooks/whatsapp` | Público (solo Meta, firma X-Hub-Signature-256; no usar desde el frontend) | 200 | Bloqueada (solo Meta) | — | [Recibir eventos de WhatsApp](#recibir-eventos-de-whatsapp) |
| GET | `/webhooks/messenger` | Público (solo Meta; no usar desde el frontend) | 200 | Bloqueada (solo Meta) | — | [Verificar el webhook de Messenger](#verificar-el-webhook-de-messenger) |
| POST | `/webhooks/messenger` | Público (solo Meta, firma X-Hub-Signature-256; no usar desde el frontend) | 200 | Bloqueada (solo Meta) | — | [Recibir eventos de Messenger](#recibir-eventos-de-messenger) |

### Flujos principales

#### Sesión

1. El login va por `/api/auth/login`. El BFF guarda los tokens en cookies y devuelve `{ user }` con `roles`.
2. `GET /auth/me` devuelve `{ id, sessionId, firstName, lastName, email, roles }` con datos actuales. Úsalo para permisos y menús: los roles del token pueden estar desactualizados.
3. Desactivar a un usuario o restablecer su contraseña revoca todas sus sesiones. El siguiente request de ese usuario termina en `SESSION_EXPIRED`.

#### Bandeja y envío de mensajes

1. **Lista:** `GET /conversations`, con polling.
   - `unreadCount` es por conversación.
   - Para el total de conversaciones con mensajes sin leer, pide `unreadOnly=true&limit=1` y lee `pagination.total`.
2. **Chat:** `GET /conversations/:id/messages?page=1&limit=50`.
   - Llega en orden `sequence` desc: inviértelo para pintar.
   - Para "cargar anteriores", pide `page + 1` y deduplica por `id`.
   - No ordenes por fechas.
3. **Leído:** `PATCH /conversations/:id/read` con `{ throughMessageId }`, el mensaje más reciente cargado. Solo ADMIN y OPERATOR.
4. **Enviar:** `POST /conversations/:id/messages` con `Idempotency-Key` y `{ type: 'TEXT', content }`.
   - Responde 202 con el mensaje en `QUEUED`. Su estado se sigue por polling: `QUEUED → SENDING → SENT → DELIVERED → READ`.
   - `READ` solo existe en WhatsApp.
   - `FAILED` trae `errorCode`.
   - `UNKNOWN` indica un envío incierto: no lo reenvíes sin verificar.
5. **Canales con respuesta:** `WHATSAPP` (hasta 4096 caracteres) y `FACEBOOK`/Messenger (hasta 2000).
   - En ambos hay una ventana de 24 h desde el último `INBOUND` del cliente. Fuera de ella, el POST responde 409.
   - Cuenta la longitud con `content.length`.
6. **Asignación y pausa:** `PATCH /conversations/:id/assignee` y `PATCH /conversations/:id/assistant` (`{ paused }`).
   - Un OPERATOR solo puede tomar conversaciones libres o liberar las suyas.
   - Son llamadas independientes. Si la UI encadena varias (pausar → enviar → asignar), maneja el fallo de cada paso.

#### Samanta: borradores con revisión humana

Samanta v1 no responde sola: genera un borrador cuando una persona lo pide, y una persona lo revisa antes de enviarlo. Solo funciona en conversaciones `WHATSAPP` sin pausar.

1. **Generar:** `POST /conversations/:id/assistant-drafts` con `Idempotency-Key` y `{ sourceMessageId }`.
   - `sourceMessageId` es el `id` del último mensaje de la conversación, que debe ser `INBOUND` de tipo `TEXT`.
   - Responde 201 con el borrador. Revisa `status`: puede venir `READY`, `GENERATING`, `STALE` o `FAILED`.
2. **Esperar:** si sigue en `GENERATING`, consulta `GET /conversations/:id/assistant-drafts/:draftId` cada 2–3 s.
3. **Editar:** `PATCH …/assistant-drafts/:draftId` con `{ revision, content }`. Cada edición suma 1 a `revision`.
4. **Aprobar o rechazar:**
   - `POST …/approve` con `{ revision }` responde 202 y encola un `OUTBOUND` cuyo `authorUserId` es quien aprueba. El borrador guarda ese mensaje en `outboundMessageId`.
   - `POST …/reject` con `{ revision }` responde 200.
5. **Caducidad:** el borrador caduca a los 15 min (`expiresAt`) y pasa a `STALE` si llega otro mensaje. En ambos casos, genera otro con una clave nueva.

Límites por defecto: 100 generaciones al día (global, por día UTC) y 2 simultáneas. Al superarlos, la respuesta es 429. Un OPERATOR no puede operar borradores de una conversación asignada a otra persona.

#### Calendario y reservas

- **Consulta:** `GET /reservations?dateFrom=…&dateTo=…&excludeCancelled=true&limit=100`, recorriendo `page` hasta `totalPages`.
- **Cambios de estado:** siguen `RESERVATION_STATUS_TRANSITIONS` (tipos de [03-clientes-reservas.md](#tipos-typescript-2)).
  - `IN_SERVICE` y `NO_SHOW` exigen que haya llegado la hora de la reserva.
  - `RESCHEDULED` lo pone el backend al reprogramar.
  - Los estados finales son `COMPLETED`, `CANCELLED` y `NO_SHOW`.
- **Creación:** solo un ADMIN puede crear una reserva manual (`POST /reservations`). No existe el paso "solicitud aceptada → reserva": `reservationRequestId` siempre es `null`.

#### Clientes y canales

- **Alta:** los clientes se crean solos con su primer mensaje (WhatsApp por teléfono, Messenger por el identificador del usuario en la página). También se pueden crear a mano con `POST /customers` (ADMIN y OPERATOR).
- **Sin nombre:**
  - Los clientes de WhatsApp llegan sin nombre, con teléfono.
  - Los de Messenger llegan sin teléfono ni email. Al recibir un mensaje de un cliente sin `firstName` ni `lastName`, el backend pide a Meta el nombre visible y lo guarda completo en `firstName` (`lastName` queda en `null`). Nunca pisa un nombre puesto en el CRM. Si Meta no lo da, sigue en `null` y se reintenta con el siguiente mensaje.
  - Muestra un texto de respaldo: el teléfono, o «Cliente de Messenger» (ver [Bandeja](#bandeja) en el 05).
- **Identidad de Messenger:** la respuesta no indica si un cliente `FACEBOOK` es una identidad de Messenger. Si se intenta cambiar el canal de uno de ellos, la respuesta es 400 `No se puede cambiar el canal de una identidad de Messenger`.

### Diferencias con ft-crm (de mock a live)

Comparación con el código actual de ft-crm (`src/lib/api`, `src/lib/server`, `src/app`, `src/features` y `src/lib/mock`), hecha el 3/11/2026, solo por lectura. El plan detallado, pantalla por pantalla, está en [Parte 05](#parte-05-implementación-en-ft-crm-de-mock-a-live); esta sección es el resumen.

#### Lo que ya coincide

- Las 34 llamadas que define hoy ft-crm existen en bk-crm con la misma ruta, método y forma: las 32 funciones de `src/lib/api/endpoints.ts`, el refresh del BFF y `/api/listo`. Treinta ya se usan; las otras cuatro están definidas pero sin pantalla (ver más abajo).
- Ninguna envía parámetros que bk-crm rechace: todos los `limit` son ≤ 100, los booleanos van como texto y las fechas salen de `toISOString()`. La única excepción es Solicitudes, que pasa la `pagina` de la URL sin tope ni redondeo: una página mayor que 1 000 000 o con decimales da 400 (usa `parsePage`, ver [Solicitudes](#solicitudes)).
- `apiFetch`, `toSearch`, `collectPages` y `newIdempotencyKey` (`src/lib/api/client.ts`) ya hacen lo que pide bk-crm: no hace falta cambiarlos.
- El orden que asume la UI es el real en todos los listados que usa:
  - solicitudes por `createdAt` desc;
  - reservas por `reservationAt` asc;
  - conversaciones por `lastMessageAt` desc;
  - mensajes por `sequence` desc;
  - intereses por `lastInterestedAt` desc.
- `PUT /restaurant-config` recibe exactamente los campos que envía `toPutRequest`. El `SetupForm` ya maneja el 404 inicial (restaurante sin configurar).
- La matriz de `permissions.ts` coincide con los `@Roles` del backend en las acciones que existen. Para las funciones nuevas faltan acciones (`draft.review`, `reservation.create`…): ver [Guía por pantalla](#3-guía-por-pantalla).
- «Marcar como preparada» (`UPCOMING`, desde `CONFIRMED` o `RESCHEDULED`) es una transición válida. No se puede volver directamente a `CONFIRMED` (409), pero al reprogramar la reserva pasa a `RESCHEDULED`, y desde ahí sí. Por eso el «No se puede deshacer» de la confirmación y el comentario de `PREPARED_STATUS` (`src/lib/domain/statuses.ts`) no son exactos. Falta confirmar el texto con producto.

#### Ya ajustado en ft-crm (pendiente de commit)

- `src/lib/server/backend.ts`: techo de 65 s para `POST /conversations/:id/assistant-drafts`, con su prueba en `backend.test.ts` (archivo nuevo).
- `src/app/api/auth/login/route.ts`: el 429 del login se muestra como «Hiciste demasiados intentos…» en lugar de un error del servidor.
- `.env.example` y el comentario de `src/app/api/auth/forgot-password/route.ts` describen los límites y techos actuales.

#### Cambios necesarios, por prioridad

El orden de trabajo completo, con criterios de «listo», está en [Orden de trabajo recomendado](#orden-de-trabajo-recomendado).

1. **Capa de API y errores.** Faltan 25 funciones en `endpoints.ts`, sus tipos y 7 claves de caché ([Capa de API](#2-capa-de-api)). Además, `ApiError.isUnavailable` trata cualquier 503 como falta de conexión, también el de una función apagada en el servidor. Hoy solo el envío responde así, y `sendErrorText` ya lo separa; las acciones nuevas (Samanta y altas de solicitudes y reservas) deben usar `isConnectionError` e `isDisabledInServer` ([Manejo de errores](#4-manejo-de-errores-en-la-ui)).
2. **Messenger en la Bandeja.** Hoy `SENDABLE_CHANNELS = ['WHATSAPP']` (`src/lib/domain/channels.ts`), el Composer exige `customer.phone`, el límite es 4096 y `FAILED_TEXT` solo cubre `WHATSAPP_*`. Para modo live hay que:
   - permitir responder en `FACEBOOK` sin exigir teléfono (el destinatario lo resuelve el backend);
   - limitar a 2000 caracteres en `FACEBOOK`;
   - aplicar la ventana de 24 h también en Messenger (409 `Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje`);
   - añadir textos para los `errorCode` `MESSENGER_*` y elegir según el canal los textos de `sendErrorText` para la ventana cerrada y el destinatario, que hoy siempre hablan de WhatsApp (el 503 `Messenger no está habilitado` ya se muestra con el texto del backend);
   - tener en cuenta que Messenger no informa lecturas: su último estado posible es `DELIVERED`;
   - ajustar el mock, que responde `Conversación sin destinatario WhatsApp habilitado`; el mensaje real es `Conversación sin destinatario habilitado`.
3. **Samanta con borradores.** ft-crm no tiene tipos ni hooks para `/conversations/:id/assistant-drafts`, y el mock simula a Samanta con mensajes `OUTBOUND` sin autor y `DELIVERED`. En ft-crm hay que:
   - implementar el flujo de la sección [Samanta](#samanta-borradores-con-revisión-humana) (hooks de ejemplo en la [Bandeja](#bandeja) del 05);
   - eliminar la regla «`OUTBOUND` sin autor = Samanta», que con datos reales nunca se cumple;
   - para marcar un mensaje como de Samanta, cruzarlo con `outboundMessageId` de los borradores `APPROVED`. La lista trae solo los 50 borradores más recientes: un mensaje aprobado desde uno más antiguo se verá como de quien lo aprobó ([Listar borradores](#listar-borradores-de-samanta));
   - tener en cuenta que el "modo" de la conversación (Samanta o humano) es un concepto de la UI: en el backend, `isAssistantPaused` solo impide generar y usar borradores;
   - decidir con producto si enviar debe seguir pausando a Samanta: con la conversación en pausa, generar responde 409.
4. **Clientes sin nombre ni teléfono.** En el mock, casi todos los clientes tienen nombre y todos tienen teléfono, también los de Facebook. En bk-crm, los clientes de WhatsApp llegan con `firstName` y `lastName` en `null`; los de Messenger reciben `firstName` de Meta cuando está disponible y no tienen `phone` ni `email`. Bandeja, Clientes, Solicitudes y Calendario necesitan un texto de respaldo.
5. **Solicitudes y flujo del dueño.** Hoy no hay forma de usar el flujo del dueño con datos reales:
   - `PATCH /reservation-requests/:id/status` solo acepta `CANCELLED`.
   - Ningún endpoint lleva a `SENT_TO_OWNER`, `WAITING_RESPONSE`, `ACCEPTED`, `REJECTED`, `MODIFICATION_REQUESTED` ni `RENEGOTIATING`. Por eso los KPI y las pestañas Esperando, Aceptadas y Rechazadas quedarán en 0.
   - Las solicitudes solo se crean con `POST /reservation-requests` (ADMIN y OPERATOR), que no tiene pantalla.
   - Textos que no se cumplen: el subtítulo de Solicitudes («Samanta envía cada solicitud al WhatsApp del dueño…») y el panel de la Bandeja («Samanta la crea cuando el cliente confirma…»).
   - Opciones: añadir el formulario "Nueva solicitud", o mostrar estas secciones como "próximamente".
6. **Reservas.** Solo se crean con `POST /reservations` (ADMIN), que no tiene pantalla, así que el calendario estará vacío en modo live.
   - La etiqueta será siempre «Registrada en el CRM», porque `reservationRequestId` es `null`; el subtítulo «Solo reservas aceptadas por el dueño.» tampoco se cumple.
   - Tampoco tienen pantalla editar, asignar responsable, agregar observaciones ni reprogramar.
7. **Autor de los mensajes.** `GET /users` es solo para ADMIN, así que OWNER y OPERATOR no pueden traducir `authorUserId` a un nombre. Mantén lo que ya hace `outboundAuthorLabel`: «Tú» (comparando con `GET /auth/me`), el nombre del responsable si fue él quien escribió, o un texto genérico (hoy «Operador»).
8. **Adjuntos.** Solo llega la metadata (`externalMediaId`, `mimeType`, `fileName`) y no hay endpoint para descargar el archivo.
9. **Datos iniciales reales.** El seed crea:
   - un único usuario ADMIN (`ADMIN_EMAIL` / `ADMIN_PASSWORD` del backend);
   - ninguna configuración del restaurante (404 hasta el primer PUT);
   - 16 categorías y 86 elementos en `DRAFT`, 9 de ellos sin `nameEs` (no se pueden aprobar hasta editarlos). Samanta solo usa elementos `APPROVED` y activos de categorías activas (como máximo 30), así que un ADMIN tiene que aprobarlos.
10. **Errores que el mock nunca devuelve** (lista completa en [Qué hace distinto el mock](#61-qué-hace-distinto-el-mock)):
    - 429 del rate limiting;
    - 503 `WhatsApp no está habilitado`, `Messenger no está habilitado` y `Samanta está desactivada` (en desarrollo se suelen apagar);
    - 409 de concurrencia (`Conflicto de mensajería; vuelve a intentarlo`);
    - 413 por un body de más de 100 kb;
    - validaciones completas de email, enums y URLs.

#### Rutas de bk-crm que ft-crm aún no usa

Definidas en `src/lib/api/endpoints.ts`, pero sin pantalla que las use: `PATCH /users/:id/roles`, `PATCH /customers/:id/status`, `GET /reservation-requests/:id`, `PATCH /reservation-requests/:id/status`.

Sin cliente en ft-crm (25 rutas; el mock responde 404 `Cannot METHOD path`). La función propuesta para cada una está en [`endpoints.ts`](#21-endpointsts):

| Método | Ruta | Roles | Función propuesta | Detalle |
|---|---|---|---|---|
| GET | `/users/:id` | ADMIN | `usersApi.get` | [Ver el detalle de un usuario](#ver-el-detalle-de-un-usuario) |
| PATCH | `/users/:id` | ADMIN | `usersApi.update` | [Editar los datos de un usuario](#editar-los-datos-de-un-usuario) |
| POST | `/commercial-categories` | ADMIN | `catalogApi.createCategory` | [Crear categoría comercial](#crear-categoría-comercial) |
| GET | `/commercial-categories/:id` | ADMIN, OWNER, OPERATOR | `catalogApi.category` | [Ver detalle de una categoría comercial](#ver-detalle-de-una-categoría-comercial) |
| PATCH | `/commercial-categories/:id` | ADMIN | `catalogApi.updateCategory` | [Editar categoría comercial](#editar-categoría-comercial) |
| PATCH | `/commercial-categories/:id/status` | ADMIN | `catalogApi.setCategoryActive` | [Activar o desactivar una categoría comercial](#activar-o-desactivar-una-categoría-comercial) |
| GET | `/commercial-items/:id` | ADMIN, OWNER, OPERATOR | `catalogApi.item` | [Ver detalle de un elemento comercial](#ver-detalle-de-un-elemento-comercial) |
| PATCH | `/commercial-items/:id` | ADMIN | `catalogApi.update` | [Editar elemento comercial](#editar-elemento-comercial) |
| POST | `/customers` | ADMIN, OPERATOR | `customersApi.create` | [Crear cliente](#crear-cliente) |
| PATCH | `/customers/:id` | ADMIN, OPERATOR | `customersApi.update` | [Editar cliente](#editar-cliente) |
| POST | `/customers/:id/interests` | ADMIN, OPERATOR | `customersApi.addInterest` | [Registrar interés del cliente](#registrar-interés-del-cliente) |
| DELETE | `/customers/:id/interests/:commercialItemId` | ADMIN, OPERATOR | `customersApi.removeInterest` | [Quitar interés del cliente](#quitar-interés-del-cliente) |
| POST | `/reservation-requests` | ADMIN, OPERATOR | `requestsApi.create` | [Crear solicitud de reserva](#crear-solicitud-de-reserva) |
| PATCH | `/reservation-requests/:id` | ADMIN, OPERATOR | `requestsApi.update` | [Editar solicitud de reserva](#editar-solicitud-de-reserva) |
| POST | `/reservations` | ADMIN | `reservationsApi.create` | [Crear reserva manual](#crear-reserva-manual) |
| PATCH | `/reservations/:id` | ADMIN, OPERATOR | `reservationsApi.update` | [Editar reserva](#editar-reserva) |
| PATCH | `/reservations/:id/assignee` | ADMIN, OPERATOR | `reservationsApi.assign` | [Asignar o liberar responsable](#asignar-o-liberar-responsable) |
| POST | `/reservations/:id/notes` | ADMIN, OPERATOR | `reservationsApi.addNote` | [Agregar observación a la reserva](#agregar-observación-a-la-reserva) |
| PATCH | `/reservations/:id/reschedule` | ADMIN, OPERATOR | `reservationsApi.reschedule` | [Reprogramar reserva](#reprogramar-reserva) |
| POST | `/conversations/:id/assistant-drafts` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | `assistantDraftsApi.generate` | [Generar un borrador con Samanta](#generar-un-borrador-con-samanta) |
| GET | `/conversations/:id/assistant-drafts` | ADMIN, OPERATOR, OWNER | `assistantDraftsApi.list` | [Listar borradores de Samanta](#listar-borradores-de-samanta) |
| GET | `/conversations/:id/assistant-drafts/:draftId` | ADMIN, OPERATOR, OWNER | `assistantDraftsApi.get` | [Ver un borrador de Samanta](#ver-un-borrador-de-samanta) |
| PATCH | `/conversations/:id/assistant-drafts/:draftId` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | `assistantDraftsApi.edit` | [Editar un borrador](#editar-un-borrador) |
| POST | `/conversations/:id/assistant-drafts/:draftId/approve` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | `assistantDraftsApi.approve` | [Aprobar un borrador y encolar el envío](#aprobar-un-borrador-y-encolar-el-envío) |
| POST | `/conversations/:id/assistant-drafts/:draftId/reject` | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otro) | `assistantDraftsApi.reject` | [Rechazar un borrador](#rechazar-un-borrador) |

#### Solo en el mock

Resumen; la tabla completa, con lo que hace bk-crm en cada caso, está en [Qué hace distinto el mock](#61-qué-hace-distinto-el-mock).

- `/api/dev/simulador` (inyecta mensajes entrantes, respuestas de Samanta, solicitudes y respuestas del dueño). En modo live responde 404, así que las pruebas e2e de `e2e/*.spec.ts` solo corren en modo mock.
- Usuarios de demostración con la contraseña común `demo1234`, configuración del restaurante ya creada y catálogo con elementos `APPROVED`.
- Clientes de Facebook con teléfono y casi todos los clientes con nombre.
- Solicitudes que pasan a `WAITING_RESPONSE`, `ACCEPTED` o `REJECTED`, y reservas creadas al aceptar una solicitud (`reservationRequestId ≠ null`).
- Regla de "más de 20 personas": el simulador responde con un mensaje de transferencia y pausa a Samanta, sin crear la solicitud ni asignar a nadie.
- Worker de envío simulado: `QUEUED → SENT` (1,2 s) `→ DELIVERED` (2,6 s), sin depender de WhatsApp, Redis ni la ventana de 24 h real.
- Tokens sin firma (`alg: none`), sin rate limiting. `reset-password` acepta cualquier token de 64 caracteres hexadecimales.
- Validaciones simplificadas: el estado del cliente sin enum; en `POST /users`, sin validar el email ni los valores de los roles (y `roles: []` responde 400 con un string); en `PUT /restaurant-config`, `logoUrl` y `website` con una regex simple y sin validar email, zona horaria ni decimales de las coordenadas.

#### Llamadas que la UI resuelve en el cliente (candidatas a endpoints del backend)

Hoy funcionan, pero hacen varias llamadas por fila o calculan en el navegador. Son candidatas a un endpoint o a un campo embebido en el backend:
- vista previa del último mensaje de cada conversación (una llamada por fila);
- última solicitud de cada cliente (las 100 más recientes y, si falta, una llamada por fila);
- columnas RESERVAS y CONSULTÓ de Clientes (una llamada por fila para cada columna);
- historial del panel derecho de la Bandeja (dos listados);
- Estadísticas (hasta 20 páginas de 100 por fuente);
- pestaña Esperando (una lectura por estado, de hasta 5 páginas cada una, porque `status` acepta un solo valor);
- etiqueta «Samanta» de los mensajes salientes (cruzar con los borradores aprobados, porque el mensaje no dice que salió de un borrador).

### Cambios recientes del backend (3/11/2026)

Respecto de los contratos anteriores (`ft-crm/docs/backend/`), el backend ya incluye:

1. **Nombre automático en Messenger.**
   - Cuando llega un mensaje de un cliente de Messenger sin `firstName` ni `lastName`, el backend pide a Meta el nombre del remitente y lo guarda completo en `firstName` (hasta 100 caracteres); `lastName` queda en `null`.
   - Nunca sobrescribe un nombre puesto en el CRM. Los clientes que ya existían lo reciben con su siguiente mensaje.
   - Ignora los nombres genéricos («Facebook User», «Usuario de Facebook») y consulta como máximo 3 nombres por webhook. Si Meta no da el nombre o la consulta falla, sigue en `null` y se reintenta con el siguiente mensaje: mantén el texto de respaldo.
   - Si alguien borra los dos nombres en el CRM, el siguiente mensaje del cliente puede volver a llenarlos.
2. **Envío unificado por canal.**
   - Messenger (canal `FACEBOOK`) también envía: tope de 2000 caracteres, ventana de 24 h y códigos de error `MESSENGER_*`.
   - Con el canal apagado, el envío responde 503 `WhatsApp no está habilitado` o `Messenger no está habilitado`. Se comprueba antes que la longitud: con Messenger apagado, un texto de 2001 caracteres da 503.
   - Una conversación de un canal sin envío (`INSTAGRAM`, `WEBSITE`…) responde 400 `Conversación sin destinatario habilitado`. Es el mismo mensaje que cuando el cliente no tiene un destinatario válido.
   - Los dos canales miden su límite con `content.length`: 400 `WhatsApp admite hasta 4096 caracteres por respuesta` o `Messenger admite hasta 2000 caracteres por respuesta`.
   - Cuando Meta responde con un error HTTP (4xx, 429 o 5xx), bk-crm deja en sus logs un diagnóstico (`WHATSAPP_SEND_HTTP_ERROR` o `MESSENGER_SEND_HTTP_ERROR`) con el código HTTP y el de Meta. Un timeout o un error de red no lo dejan. La API no cambia: el mensaje sigue llegando con su `errorCode`.
3. **Fechas en UTC dentro de la base de datos.** Es una corrección interna: la API ya devolvía los instantes correctos y su formato no cambia. bk-crm no arranca si falta la migración `20261103000000_utc_timestamps` o si la sesión de PostgreSQL no queda en UTC.
4. **Errores corregidos:**
   - un PATCH vacío en el catálogo responde 400 `Debes proporcionar al menos un campo para actualizar`, antes de comprobar si el recurso existe;
   - `null` en `PATCH /users/:id` responde 400;
   - un body de más de 100 kb responde 413 `El cuerpo de la petición supera el tamaño máximo permitido`, y un `charset` que no empieza por `utf-`, 415 (antes, los dos respondían 500);
   - el orden del catálogo es estable entre páginas;
   - las fechas de promociones y eventos (`validFrom`, `validUntil`, `startAt` y `endAt`) exigen segundos y zona horaria.
5. **Límites de intentos por IP y cuenta** en login (nuevo: 5 cada 60 s), `forgot-password` (3 cada 60 s) y `reset-password` (5 cada 60 s). La variable nueva `TRUST_PROXY` hace que bk-crm tome la IP de `X-Forwarded-For` detrás de un proxy inverso de confianza; con el BFF, la IP contada sigue siendo la del servidor de Next.js (ver [Rate limiting](#rate-limiting)).
6. **Validación de la configuración de producción.** Con `NODE_ENV=production`, bk-crm no arranca si:
   - `JWT_SECRET` o `JWT_REFRESH_SECRET` tienen menos de 32 caracteres, empiezan por `reemplazar` (el valor del ejemplo) o son iguales;
   - `FRONTEND_RESET_PASSWORD_URL` no es una URL `https` o apunta a `localhost`, `127.0.0.1` o `[::1]`;
   - `RESEND_FROM_EMAIL` falta o usa un remitente `@resend.dev`.

En ft-crm, los ajustes del BFF que acompañan estos cambios (techo de 65 s para generar borradores y texto del 429 del login) están en [Ya ajustado en ft-crm](#ya-ajustado-en-ft-crm-pendiente-de-commit).

### Correcciones respecto de la versión anterior

Para quien ya empezó a implementar con la versión anterior de esta documentación. Solo se listan las correcciones que cambian lo que tiene que hacer el frontend. No están las de redacción ni lo que es contenido nuevo (el [05](#parte-05-implementación-en-ft-crm-de-mock-a-live), las filas **ft-crm** y **Caché**, los ejemplos de petición). Cada fila se comprobó en el código actual de bk-crm y ft-crm.

**Sesión, BFF y errores**

| Dónde | Antes decía | Lo correcto |
|---|---|---|
| Errores 401 de todas las rutas autenticadas ([Sesión](#sesión-srclibserversessionts)) | Los 401 de bk-crm (`Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado`, `Sesión no válida o expirada`), como si los recibiera el frontend. | El navegador nunca los recibe. El BFF renueva la sesión y repite la llamada una vez. Si no puede, responde 401 `Tu sesión terminó. Vuelve a iniciar sesión.` (`code: "SESSION_EXPIRED"`) y borra las cookies, o 401 `Inicia sesión para continuar.` (`code: "NO_SESSION"`) si no hay cookies. No muestres el texto: `apiFetch` emite `crm:session-expired` y `SessionProvider` lleva a `/login`. |
| Cómo se llama cada ruta de [01](#parte-01-autenticación-sesión-usuarios-y-salud) | «Desde el navegador, cada ruta se pide como `/api/backend<ruta>`». | Solo `GET /auth/me` y `/users/**` van por `/api/backend`. Login, logout y recuperación de contraseña van por `/api/auth/*` con `sessionApi`; el refresh lo hace el BFF; la salud se consulta con `/api/listo`; `GET /` y `GET /auth/test-admin` no se usan. |
| [Iniciar sesión](#iniciar-sesión) | Respuesta 201 con `accessToken` y `refreshToken`: «Hay que guardar» los dos. Errores de bk-crm (400 en array, 401 y 429 con `Retry-After`). | `sessionApi.login` recibe 200 `{ user }`. Los tokens quedan en las cookies httpOnly `crm_at` y `crm_rt`: el navegador nunca los ve. Los errores son los del BFF, ya en español: 400 `Ingresa un correo válido y una contraseña de al menos 8 caracteres.`, 401 `Correo o contraseña incorrectos.` y 429 `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.`, sin `Retry-After`. |
| [Renovar tokens](#renovar-tokens) | «Hay que reemplazar ambos tokens guardados» y mantener un solo refresh en curso. | El navegador no llama a esta ruta: `/api/backend/auth/refresh` responde 404 `Ruta no disponible.`. El BFF renueva solo, antes de que venza `crm_at` o tras un 401, y deduplica los refresh simultáneos. |
| [Cerrar sesión](#cerrar-sesión) | «Hay que borrar ambos [tokens] en el cliente». | Llama a `sessionApi.logout()`. El BFF intenta revocar la sesión en bk-crm, borra las cookies y responde siempre 200 `{ ok: true }`, aunque bk-crm falle. |
| [Solicitar recuperación de contraseña](#solicitar-recuperación-de-contraseña) y [Restablecer contraseña](#restablecer-contraseña) | Mostrar «tal cual» el mensaje de bk-crm; solo errores de bk-crm. | El navegador recibe los textos del BFF, con punto final: `Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.` y `Contraseña restablecida correctamente.`. Sus errores: 400 `Ingresa un correo válido.`, 400 `El enlace no es válido o la contraseña no cumple el largo (8 a 72 caracteres).`, 400 `El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.`, 429 `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` y 502. |
| [Comprobar el estado del servicio](#comprobar-el-estado-del-servicio) | `GET /health` «sirve para un indicador de conexión». | Desde el navegador, consulta `/api/listo` con `fetch` (no con `apiFetch`, que antepone `/api/backend`): 200 `{ estado: "ok", backend }` o 503. `/api/backend/health` exige sesión. |
| Mensajes de validación ([Errores de validación por campo](#42-errores-de-validación-por-campo)) | «Los de validación vienen en inglés: conviértelos en errores de campo». | Vienen en inglés, salvo los de validadores propios de bk-crm, que llegan en español (p. ej. `whatsappNumber debe usar formato internacional E.164`). No todos empiezan por el campo: `each value in …`, `All …'s elements must be unique` y `property … should not exist` lo nombran dentro. |
| Tipos TypeScript de [01](#tipos-typescript) a [04](#tipos-typescript-3) | Nombres propios: `IsoDateString`, `IsoDateTimeUtc`, `PaginatedResponse`, `CustomerPage`, `ApiHttpError`, `ApiErrorResponse`, `AuthenticatedUser`, `RefreshTokenRequest`, `TimeHHmm`, `ConversationListQuery`, `SendMessageBody`… | Los de `ft-crm/src/lib/api/types.ts`: `IsoDateTime`, `Paginated<T>`, `ApiErrorBody`, `MeResponse`, `RefreshRequest`, `HhMm`, `ListConversationsQuery`, `SendMessageRequest`… `ApiErrorBody` es igual en todos los módulos: `code?: BffErrorCode`, más `path`, `method` y `timestamp` del 500. Copia los tipos de [`types.ts`](#22-typests) en el 05. |

**Usuarios**

| Dónde | Antes decía | Lo correcto |
|---|---|---|
| [Editar los datos de un usuario](#editar-los-datos-de-un-usuario) | Refrescar el detalle, el listado y, si es el propio usuario, `GET /auth/me`. | Además, invalida `qk.conversationsAll` y `qk.reservationsAll` si cambió el nombre (va embebido en `assignedUser`, `author` y `changedBy`), y `qk.config` si cambió el nombre o el email (`approvalResponsible`). |
| [Activar o desactivar un usuario](#activar-o-desactivar-un-usuario) y [Reemplazar los roles de un usuario](#reemplazar-los-roles-de-un-usuario) | Refrescar solo el listado y el detalle. | Desactivar a un usuario, o quitarle ADMIN y OPERATOR, no libera sus conversaciones ni sus reservas: su `assignedUser.isEligible` pasa a `false`. Invalida `qk.conversationsAll` y `qk.reservationsAll`. Si es el responsable de aprobación, después `PUT /restaurant-config` responde 400 `El responsable de aprobación debe estar activo` o `El responsable de aprobación debe tener el rol OWNER`: avísalo antes de confirmar. |

**Configuración y catálogo**

| Dónde | Antes decía | Lo correcto |
|---|---|---|
| [Guardar la configuración del restaurante](#guardar-la-configuración-del-restaurante-crear-o-reemplazar) · `email` | «Email válido. Máx. 320». | `@IsEmail()` rechaza más de 254 caracteres, o más de 64 antes de la `@`, con `email must be an email`. Limita el campo a 254 en el formulario. |
| [Guardar la configuración del restaurante](#guardar-la-configuración-del-restaurante-crear-o-reemplazar) · `latitude` y `longitude` | Ningún 500. | Una coordenada distinta de 0 que JavaScript escribe en notación exponencial sin punto (`1e-7`) responde 500 `Ocurrió un error interno`. Redondea a 7 decimales y deja en 0 los valores menores que 0,000001, como hace `normalizeCoordinate` de ft-crm. |
| [Crear categoría comercial](#crear-categoría-comercial), [Editar categoría comercial](#editar-categoría-comercial), [Crear elemento comercial](#crear-elemento-comercial) y [Editar elemento comercial](#editar-elemento-comercial) | 400 `Los datos de la categoría son inválidos` o `La operación contiene referencias o valores comerciales inválidos` cuando la base de datos rechaza una restricción (Prisma `P2004`). | Prisma 7 no emite `P2004`: esos 400 no llegan por ese motivo. Una restricción `CHECK` rechazada responde 500 `Ocurrió un error interno`, por ejemplo con un nombre formado solo por signos diacríticos sueltos (`^`, `´`). Exige en el formulario al menos una letra o un número. |

**Clientes, reservas y Bandeja**

| Dónde | Antes decía | Lo correcto |
|---|---|---|
| Clientes de Messenger: [Listar conversaciones](#listar-conversaciones-bandeja) y [Listar solicitudes de reserva](#listar-solicitudes-de-reserva) | «Los de Messenger no traen nombre, teléfono ni email… `search` no los encuentra hasta que alguien los edite en Clientes»; «pueden aparecer con `customer` todo en `null` salvo `id`». | Con cada mensaje nuevo de un cliente de Messenger sin `firstName` ni `lastName`, bk-crm pide a Meta su nombre y lo guarda completo en `firstName` (`lastName` queda en `null`), así que `search` lo encuentra. Nunca pisa un nombre puesto en el CRM. Si Meta no lo da, sigue en `null` y se reintenta con el siguiente mensaje: mantén el respaldo «Cliente de Messenger». `phone` y `email` llegan en `null` salvo que se agreguen en Clientes. |
| [Reprogramar reserva](#reprogramar-reserva) y [Lo que ya coincide](#lo-que-ya-coincide) | «Marcar como preparada» (`UPCOMING`) «no tiene vuelta atrás». | No hay transición directa `UPCOMING → CONFIRMED` (409), pero cambiar la fecha de una reserva `UPCOMING` (reprogramarla, o `PATCH` con otro `reservationAt`) la deja en `RESCHEDULED`, y desde ahí puede volver a `CONFIRMED`. Ajusta el «No se puede deshacer» de la confirmación. |
| [`SamantaDraft`](#samantadraft) | `originalContent` en `null` si el borrador «quedó STALE durante la generación»; `intent`, `requiresHuman` y `missingFields` «pueden venir también en STALE/FAILED si la IA respondió tarde». | Si al terminar la generación cambió la información comercial, el borrador queda `STALE` con el texto y los datos de la IA guardados. Si quedó `STALE` por un mensaje nuevo, una pausa o el vencimiento, o `FAILED`, solo guarda los tokens: `originalContent` y `content` en `null`, `intent` en `null`, `requiresHuman` en `true` y `missingFields` vacío. |
| [Mensajes salientes](#mensajes-salientes-direction-outbound) | `*_RATE_LIMITED` solo en `QUEUED` («Reintentando…»). | También llega en `SENDING`: el worker no borra `errorCode` al reintentar, y `SENT` lo borra. Muestra «Reintentando…» en los dos estados. `outboundStatusView` ya lo hace, pero solo con `WHATSAPP_RATE_LIMITED`: añade `MESSENGER_RATE_LIMITED`. |

**Plan de cambios en ft-crm**

| Dónde | Antes decía | Lo correcto |
|---|---|---|
| [Cambios necesarios](#cambios-necesarios-por-prioridad) · Messenger | Añadir un texto para el 503 `Messenger no está habilitado`. | `sendErrorText` ya muestra ese 503, y el 400 de longitud, con el texto del backend. Lo que hay que cambiar son los textos de ventana cerrada y de destinatario, que siempre hablan de WhatsApp: elígelos según `conversation.channel`. |
| [Cambios necesarios](#cambios-necesarios-por-prioridad) · Samanta | Cruzar `outboundMessageId` con los borradores `APPROVED` para marcar los mensajes de Samanta. | Sigue valiendo, pero la lista trae solo los 50 borradores más recientes: un mensaje aprobado desde uno más antiguo se verá como de quien lo aprobó. |
| [Cambios necesarios](#cambios-necesarios-por-prioridad) · Autor de los mensajes | Mostrar «Tú» o «Equipo». | Conserva `outboundAuthorLabel`: «Tú» si el autor es el usuario de `GET /auth/me`, el nombre del responsable si él escribió el mensaje y, si no, un texto genérico (hoy «Operador»). Quita solo la regla «`OUTBOUND` sin autor = Samanta». |
| [Lo que ya coincide](#lo-que-ya-coincide) | Ninguna llamada de ft-crm envía parámetros que bk-crm rechace. | Solicitudes pasa la `pagina` de la URL sin tope ni redondeo: una página mayor que 1 000 000 o con decimales responde 400. Usa `parsePage` de `clientes-utils.ts` ([Solicitudes](#solicitudes)). |

### Preguntas abiertas

Consolidadas de los cuatro módulos, sin repetir y ordenadas por cuánto afectan al frontend. Cada una enlaza a la pregunta completa, con su contexto: [01](#preguntas-abiertas-1), [02](#preguntas-abiertas-2), [03](#preguntas-abiertas-3) y [04](#preguntas-abiertas-4).

**Bloquean pantallas o textos del modo live**

1. **Flujo del dueño.** ¿Cuándo llegan los endpoints para enviar, aceptar o rechazar solicitudes y convertirlas en reservas? Hoy `reservationRequestId` siempre es `null`, seis estados de solicitud son inalcanzables y Samanta no crea solicitudes. ¿Deben aparecer ya en filtros y KPI? ([03](#preguntas-abiertas-3), pregunta 3)
2. **Capacidades del servidor.** El frontend solo se entera de que WhatsApp, Messenger o Samanta están apagados por el 503 al usarlos, y no puede consultar cuántas generaciones de Samanta quedan. ¿Habrá un endpoint de capacidades y de cuota? ([04](#preguntas-abiertas-4), preguntas 11 y 12)
3. **Nombres de los autores.** `GET /users` es solo para ADMIN, así que OWNER y OPERATOR no pueden convertir en un nombre el `authorUserId` de los mensajes ni el `createdById`, `reviewedById` y `editedById` de los borradores de Samanta. Las notas y reprogramaciones de reservas ya traen el nombre (`author` y `changedBy`). ¿Se añadirá el nombre a la respuesta o un endpoint ligero de usuarios? ([01](#preguntas-abiertas-1), pregunta 12; [04](#preguntas-abiertas-4), pregunta 2)
4. **Samanta en Messenger.** En v1 responde 400 `Samanta v1 admite WhatsApp`. ¿Se habilitará para `FACEBOOK`? ([04](#preguntas-abiertas-4), pregunta 8)
5. **Identidad de Messenger en el cliente.** La respuesta no dice si un cliente `FACEBOOK` es una identidad de Messenger, y cambiarle el canal responde 400. ¿Se añadirá un indicador (p. ej. `hasProviderIdentity`)? ([03](#preguntas-abiertas-3), pregunta 1)
6. **Imágenes, logo y adjuntos.** No hay endpoint de subida (solo URLs `http(s)` ya alojadas) ni para descargar o previsualizar los adjuntos de los mensajes. ¿Dónde se alojarán las imágenes? ¿Habrá un proxy de medios? ([02](#preguntas-abiertas-2), pregunta 1; [04](#preguntas-abiertas-4), pregunta 1)

**Mejoras de la API que simplificarían la UI**

7. **Bandeja.** Vista previa del último mensaje en `GET /conversations`, vencimiento de la ventana de 24 h, filtro de conversaciones sin asignar y `GET /conversations/:id/messages/:messageId`. ([04](#preguntas-abiertas-4), preguntas 3, 4, 5 y 7)
8. **Clientes y calendario.** Número de reservas y último interés en `GET /customers`; consulta del calendario sin paginar y filtro de reservas sin responsable. ([03](#preguntas-abiertas-3), preguntas 4 y 10)
9. **Tiempo real.** ¿Son aceptables los intervalos de polling actuales (6 s la lista, 4 s el chat, 1,5 s con envíos pendientes, 2–3 s para un borrador en `GENERATING`)? ¿Habrá WebSockets o SSE? ([04](#preguntas-abiertas-4), pregunta 6)
10. **Mensajes de validación.** Llegan en inglés y en un array. ¿Los personalizará el backend, o los traduce siempre el frontend? ([03](#preguntas-abiertas-3), pregunta 5)
11. **Idempotencia.** `POST /reservation-requests`, `POST /reservations` y `POST /reservations/:id/notes` duplican si se reintentan tras un 504. ¿Se añadirá `Idempotency-Key`? ([03](#preguntas-abiertas-3), pregunta 8)
12. **Búsqueda.** No admite el nombre completo; en solicitudes y reservas no busca por email; cualquier dígito del texto se busca en los teléfonos («Mesa 4»); en el catálogo distingue tildes. ¿Se mejorará? ([03](#preguntas-abiertas-3), pregunta 9; [04](#preguntas-abiertas-4), pregunta 14; [02](#preguntas-abiertas-2), pregunta 3)
13. **Estados de los mensajes.** Los mensajes `UNKNOWN` no se pueden resolver ni reintentar, y Messenger ignora los eventos de lectura (nunca pasa de `DELIVERED`). ([04](#preguntas-abiertas-4), preguntas 9 y 10)
14. **Nombre en WhatsApp.** ¿Se tomará el nombre del perfil de WhatsApp para los clientes nuevos, como en Messenger? ([04](#preguntas-abiertas-4), pregunta 13)
15. **Estadísticas.** `GET /reservation-requests` solo filtra por `reservationAt`, así que Estadísticas cuenta las solicitudes por fecha de reserva y omite las que no tienen fecha. ¿Hace falta un filtro por `createdAt`, o endpoints de agregados? ([03](#preguntas-abiertas-3), pregunta 12)

**Reglas de negocio por definir**

16. **Usuarios desactivados o sin roles operativos.** No liberan sus conversaciones ni reservas (`isEligible: false`). ¿Quién las reasigna? Y si el desactivado es el responsable de aprobación, `PUT /restaurant-config` responde 400: ¿la UI debe advertirlo o impedirlo? ([01](#preguntas-abiertas-1), preguntas 10 y 11)
17. **Estado comercial del cliente.** El backend acepta cualquier transición y nunca lo cambia solo. ¿Qué flujo debe imponer la UI? ([03](#preguntas-abiertas-3), pregunta 2)
18. **Clientes duplicados y cambio de teléfono.** No hay fusión de clientes, y cambiar el teléfono de un cliente de WhatsApp cambia el destinatario de las respuestas. ¿Se impedirá o se avisará? ([03](#preguntas-abiertas-3), preguntas 6 y 7)
19. **Catálogo.**
    - Las categorías inactivas ocultan sus elementos a Samanta, pero solicitudes y reservas los siguen aceptando.
    - Samanta recibe como máximo 30 elementos sin indicar cuáles.
    - Varios campos de la configuración se guardan sin que ningún proceso los use.
    - No hay auditoría de aprobaciones, control de versión ni `DELETE`.
    - Una coordenada distinta de 0, menor que 0,000001 en valor absoluto y que JavaScript escribe sin punto decimal (`1e-7`), da 500.
    - Un nombre formado solo por signos diacríticos sueltos (`^`, `´`) pasa la validación y da 500.

    ([02](#preguntas-abiertas-2), preguntas 2 y 4 a 10)
20. **Rol SUPPORT.** Solo puede usar `/auth/me` y el logout, y en ft-crm no tiene ninguna vista. ¿Es intencional? ([01](#preguntas-abiertas-1), pregunta 9)
21. **Cuentas y sesiones.**
    - `GET /users` no tiene paginación ni búsqueda.
    - No hay endpoint de roles, cambio de contraseña con la sesión abierta, restablecimiento por un ADMIN, gestión de sesiones ni invitaciones por correo.
    - Reutilizar un refresh token ya rotado no revoca la sesión.
    - Las contraseñas admiten 72 caracteres, pero bcrypt solo usa los primeros 72 bytes en UTF-8: con tildes, `ñ` o emojis, el final de una contraseña larga se ignora. ¿Límite en bytes o aviso en la UI?

    ([01](#preguntas-abiertas-1), preguntas 5 a 8 y 13)

**Despliegue**

22. URL de bk-crm en cada entorno (y si un proxy añadirá un prefijo como `/api`), valor de `FRONTEND_RESET_PASSWORD_URL` y de `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (en `.env.example`, 15 min y 7 días; la sesión vence a los 7 días del login aunque se renueve). ¿Se quitará `GET /auth/test-admin` antes de desplegar? ([01](#preguntas-abiertas-1), preguntas 1 a 4)
23. Textos de 404 distintos para el mismo caso (`Cliente o interés no encontrado` en `PATCH /customers/:id/status` y `Cliente no encontrado` en el resto). ¿Se unificarán? ([03](#preguntas-abiertas-3), pregunta 11)

## Parte 01: Autenticación, sesión, usuarios y salud

> Parte de la [referencia de la API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend). Estado: 3 de noviembre de 2026.
>
> En este módulo hay tres formas de llegar a bk-crm desde el navegador:
> - `GET /auth/me` y las rutas `/users` se piden con `apiFetch` a `/api/backend<ruta>`, y el BFF añade el token.
> - Login, logout y recuperación de contraseña tienen handlers propios en `/api/auth/*`. El refresh lo hace el BFF por su cuenta.
> - `GET /health` se consulta con el handler `/api/listo`.
>
> Las convenciones comunes (errores, sesión, roles, rate limiting, fechas) están en el [README](#convenciones-generales). El funcionamiento del BFF está en [Arquitectura](#arquitectura-navegador--bff--bk-crm).

Este módulo cubre el inicio y cierre de sesión, la renovación de tokens, la recuperación de contraseña, el perfil del usuario autenticado, la administración de usuarios (solo ADMIN) y el estado del servicio.

Dónde se usa en ft-crm:

| Pieza de ft-crm | Archivo | Rutas de bk-crm |
|---|---|---|
| Login | `src/app/(auth)/login/login-form.tsx` | `POST /auth/login`, vía `/api/auth/login` |
| Recuperar contraseña | `src/app/(auth)/olvide-contrasena/page.tsx` | `POST /auth/forgot-password`, vía `/api/auth/forgot-password` |
| Nueva contraseña (enlace del correo) | `src/app/(auth)/reset-password/reset-form.tsx` | `POST /auth/reset-password`, vía `/api/auth/reset-password` |
| Sesión, permisos y cierre de sesión | `src/lib/auth/session.tsx` | `GET /auth/me`; `POST /auth/logout`, vía `/api/auth/logout` |
| Renovación de tokens (BFF) | `src/lib/server/session.ts` | `POST /auth/refresh` |
| Ajustes > Usuarios | `src/features/ajustes/usuarios/` | `GET /users`, `POST /users`, `PATCH /users/:id/status` |
| Ajustes > Samanta (responsable de aprobación) | `src/features/ajustes/config/samanta-view.tsx` | `GET /users` |
| Disponibilidad del backend (balanceador, Docker) | `src/app/api/listo/route.ts` | `GET /health` |

Sin pantalla todavía: `GET /users/:id` y `PATCH /users/:id` no tienen función en `endpoints.ts`. `usersApi.setRoles` existe, pero ninguna pantalla llama a `PATCH /users/:id/roles`.

Así se ven los errores de las rutas autenticadas desde el navegador (detalle en [Sesión](#sesión-srclibserversessionts)):
- Un 401 de bk-crm nunca llega tal cual. El BFF renueva la sesión una vez y repite la llamada. Si vuelve a recibir 401, responde `{ "statusCode": 401, "message": "Tu sesión terminó. Vuelve a iniciar sesión.", "code": "SESSION_EXPIRED" }` y borra las cookies. Sin cookies responde 401 `{ "statusCode": 401, "message": "Inicia sesión para continuar.", "code": "NO_SESSION" }`.
- Los 400, 403, 404 y 409 llegan con el body de bk-crm sin cambios. `apiFetch` los lanza como `ApiError`, con `messages` siempre en array.
- Si bk-crm no responde, el BFF devuelve 503 o 504 con `code: "BACKEND_UNAVAILABLE"` (ver [Errores que añade el BFF](#errores-que-añade-el-bff)).

Los mensajes de las tablas de errores son los de bk-crm, salvo el 401 de las rutas que pasan por `/api/backend` (`GET /auth/me` y `/users`): ese muestra lo que responde el BFF, como en los demás módulos. Las rutas que pasan por `/api/auth/*` traducen los errores de bk-crm; cada ruta lo explica en sus notas.

### Índice

- [Ver la respuesta raíz de la API](#ver-la-respuesta-raíz-de-la-api) — `GET /`
- [Iniciar sesión](#iniciar-sesión) — `POST /auth/login`
- [Renovar tokens](#renovar-tokens) — `POST /auth/refresh`
- [Cerrar sesión](#cerrar-sesión) — `POST /auth/logout`
- [Obtener el usuario autenticado](#obtener-el-usuario-autenticado) — `GET /auth/me`
- [Comprobar acceso de administrador (endpoint de prueba)](#comprobar-acceso-de-administrador-endpoint-de-prueba) — `GET /auth/test-admin`
- [Solicitar recuperación de contraseña](#solicitar-recuperación-de-contraseña) — `POST /auth/forgot-password`
- [Restablecer contraseña](#restablecer-contraseña) — `POST /auth/reset-password`
- [Comprobar el estado del servicio](#comprobar-el-estado-del-servicio) — `GET /health`
- [Crear usuario](#crear-usuario) — `POST /users`
- [Listar usuarios](#listar-usuarios) — `GET /users`
- [Ver el detalle de un usuario](#ver-el-detalle-de-un-usuario) — `GET /users/:id`
- [Editar los datos de un usuario](#editar-los-datos-de-un-usuario) — `PATCH /users/:id`
- [Activar o desactivar un usuario](#activar-o-desactivar-un-usuario) — `PATCH /users/:id/status`
- [Reemplazar los roles de un usuario](#reemplazar-los-roles-de-un-usuario) — `PATCH /users/:id/roles`

Secciones del módulo: [Modelos](#modelos) · [Estados y transiciones](#estados-y-transiciones) · [Preguntas abiertas](#preguntas-abiertas-1) · [Tipos TypeScript](#tipos-typescript)

### Ver la respuesta raíz de la API
`GET /`

| | |
|---|---|
| Roles | Pública |
| Respuesta | 200 · `AppRootResponse` (texto, no JSON) |
| ft-crm | No se usa desde el navegador. El proxy `/api/backend/[...path]` exige al menos un segmento, así que `/api/backend` no llega a esta ruta. |
| Caché | No aplica |

**Respuesta**: texto, no JSON (`Content-Type: text/html; charset=utf-8`):

```text
Hello World!
```

**Errores**: no tiene errores propios. Solo aplica el 500 genérico de [Formato de errores](#formato-de-errores).

**Efectos**: ninguno (solo lectura). No consulta la base de datos.

**Notas para el frontend**:
- Es la ruta de plantilla de NestJS (`AppService.getHello()`). Responder 200 aquí no garantiza que la base de datos funcione.
- Para saber si el backend está operativo usa `GET /health`; en ft-crm, el handler `/api/listo`.

### Iniciar sesión
`POST /auth/login`

| | |
|---|---|
| Roles | Pública |
| Respuesta | 201 · `LoginResponse` (de bk-crm al BFF). El navegador recibe 200 · `BffLoginResponse` (`{ user: LoginUser }`) |
| ft-crm | `sessionApi.login(email: string, password: string): Promise<{ user: LoginUser }>` (existe), que llama al handler del BFF `POST /api/auth/login`. El proxy bloquea `/api/backend/auth/login` con 404 `Ruta no disponible.` |
| Caché | Sin clave propia. Tras el éxito, limpia la caché (`queryClient.clear()`) antes de navegar; hoy `login-form.tsx` no lo hace (solo llama a `router.replace`). `qk.me` se carga después en el shell. |
| Cabeceras y límites | `Content-Type: application/json`, sin `Authorization`. Máximo 5 peticiones cada 60 s por IP y cuenta: la sexta responde 429. Techo del BFF: `CRM_BACKEND_TIMEOUT_MS` (15 s por defecto), luego 504. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `email` | string | Sí | `@IsEmail()`: como máximo 254 caracteres (y 64 antes de la `@`), con dominio y TLD, y sin espacios alrededor. Un email con espacios responde 400. Admite mayúsculas: el servicio aplica `trim` y minúsculas antes de buscar, así que el login no distingue mayúsculas. Este DTO no tiene `@MaxLength`. No admite `null`. |
| `password` | string | Sí | `@IsString()` y `@MinLength(8)`. El DTO no fija máximo; el BFF limita a 200. No se recorta: los espacios cuentan. bcrypt solo compara los primeros 72 bytes en UTF-8. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
const { user } = await sessionApi.login("rosa.mamani@example.com", "Cusco-Mesa-2026");
```

El navegador envía a `/api/auth/login`, y el BFF reenvía a bk-crm, este JSON:

```json
{
  "email": "rosa.mamani@example.com",
  "password": "Cusco-Mesa-2026"
}
```

El BFF valida antes con zod: `email` con `trim`, minúsculas, formato de email y máximo 320; `password` de 8 a 200 caracteres. Reenvía los datos ya normalizados y descarta cualquier otro campo, así que desde el navegador nunca llega `property <campo> should not exist`.

**Respuesta**

201 de bk-crm al BFF:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1YjBlN2MzYS0yZjQxLTRkOGUtOWE2Yi0xYzNkNWU3ZjlhMjAiLCJzZXNzaW9uSWQiOiIwYzZlOWYyYS03ZDRiLTRlMWMtOGEzNS1iMmY3ZDllMWM0NjQiLCJlbWFpbCI6InJvc2EubWFtYW5pQGV4YW1wbGUuY29tIiwicm9sZXMiOlsiQURNSU4iXSwiaWF0IjoxNzkzNzE5MjQxLCJleHAiOjE3OTM3MjAxNDF9.9kTaqoMyWA8WYKAdwcC1YxvfxsTMTZyPiV0BUZEX63s",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1YjBlN2MzYS0yZjQxLTRkOGUtOWE2Yi0xYzNkNWU3ZjlhMjAiLCJzZXNzaW9uSWQiOiIwYzZlOWYyYS03ZDRiLTRlMWMtOGEzNS1iMmY3ZDllMWM0NjQiLCJqdGkiOiIzZThhMWM1Zi05YjJkLTRmNjAtYTdjNC1kMWUzZjViN2E5NzUiLCJpYXQiOjE3OTM3MTkyNDEsImV4cCI6MTc5NDMyNDA0MX0.soA4pg45RmBrSGwh81eKKDiO5fEjErLD8wM-WKR4FLQ",
  "user": {
    "id": "5b0e7c3a-2f41-4d8e-9a6b-1c3d5e7f9a20",
    "firstName": "Rosa",
    "lastName": "Mamani",
    "email": "rosa.mamani@example.com",
    "roles": ["ADMIN"]
  }
}
```

Los tokens del ejemplo están firmados con un secreto ficticio. Los claims del access token son `{ sub, sessionId, email, roles, iat, exp }`; los del refresh token, `{ sub, sessionId, jti, iat, exp }` (ver [Modelos](#modelos)).

200 del BFF al navegador, con las cookies httpOnly `crm_at` y `crm_rt`:

```json
{
  "user": {
    "id": "5b0e7c3a-2f41-4d8e-9a6b-1c3d5e7f9a20",
    "firstName": "Rosa",
    "lastName": "Mamani",
    "email": "rosa.mamani@example.com",
    "roles": ["ADMIN"]
  }
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` (array) | El body trae campos que no son `email` ni `password` |
| 400 | `email must be an email` (array) | `email` falta, no es string, está mal formado, tiene espacios alrededor, supera 254 caracteres o tiene más de 64 antes de la `@` |
| 400 | `password must be longer than or equal to 8 characters`; `password must be a string` (array) | `password` falta o no es string (llegan los dos mensajes), o tiene menos de 8 caracteres (solo el primero) |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 401 | `Correo o contraseña incorrectos` | El correo no existe, el usuario está inactivo o la contraseña no coincide. El mensaje es el mismo en los tres casos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |
| 429 | `ThrottlerException: Too Many Requests` (sin `error`; con cabecera `Retry-After` en segundos) | Sexta petición en 60 s con la misma IP y el mismo email. La pareja queda bloqueada 60 s. |

Ejemplo de 400 con un campo extra y una contraseña corta:

```json
{
  "message": [
    "property remember should not exist",
    "password must be longer than or equal to 8 characters"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

**Efectos**

- Crea una sesión nueva: su `id` es el `sessionId` del token, guarda el hash SHA-256 del refresh token y vence 7 días después del login. Las sesiones anteriores del usuario siguen activas.
- Actualiza `lastLoginAt` del usuario y, con él, su `updatedAt`.
- Suma una petición al contador de la IP y la cuenta. Cuentan también los logins exitosos y los que fallan la validación. El email se cuenta con `trim` y en minúsculas.

**Notas para el frontend**

- Usa siempre `sessionApi.login`. El navegador nunca recibe los tokens: el BFF los guarda en las cookies httpOnly `crm_at` y `crm_rt` (`SameSite=Lax`, con `maxAge` según el `exp` de cada token) y devuelve solo `{ user }`.
- Lo que recibe el navegador de `/api/auth/login`:

  | Caso | Estado | `message` |
  |---|---|---|
  | El body no pasa la validación del BFF | 400 | `Ingresa un correo válido y una contraseña de al menos 8 caracteres.` |
  | bk-crm responde 401 | 401 | `Correo o contraseña incorrectos.` |
  | bk-crm responde 429 | 429 | `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` (sin `Retry-After`) |
  | bk-crm responde 400 | 400 | El `message` de bk-crm si es string; si es array, `No se pudo iniciar sesión.` |
  | Cualquier otro error de bk-crm | 502 | El `message` de bk-crm si es string; si no, `No se pudo iniciar sesión.` |
  | bk-crm no responde | 503 o 504 | Mensaje del BFF con `code: "BACKEND_UNAVAILABLE"` |
  | Éxito | 200 | `{ user }` |

  `sessionApi.login` lanza `Error(message)` con ese texto: muéstralo tal cual.
- `login-form.tsx` elige el destino así: `safeNextPath(next) ?? homePathFor(user.roles) ?? "/bandeja"`. Para eso basta `user.roles`; para permisos, usa después `GET /auth/me`. SUPPORT no tiene ninguna vista, así que termina en `/bandeja` sin acceso (ver [Preguntas abiertas](#preguntas-abiertas-1)).
- Limpia la caché de TanStack Query tras un login exitoso. El `QueryClient` del navegador es único y vive mientras no se recargue la página. Si se llega a `/login` sin cerrar sesión y sin recargar, la caché conserva los datos del usuario anterior, y el BFF reemplaza las cookies sin revocar la sesión anterior en bk-crm. `qk.me` podría mostrar al usuario anterior mientras siga fresco (`staleTime` de 60 s).
- Un usuario inactivo recibe el mismo 401: la UI no puede distinguirlo de una contraseña errónea.
- El cupo es por IP y cuenta. Detrás del BFF todos los usuarios comparten IP, pero cada email tiene su propio cupo (ver [Rate limiting](#rate-limiting)).

### Renovar tokens
`POST /auth/refresh`

| | |
|---|---|
| Roles | Pública: no requiere `Authorization`; se autentica con el refresh token del body |
| Respuesta | 201 · `RefreshResponse` |
| ft-crm | No se usa desde el navegador. La llama el BFF con `refreshSession(refreshToken: string): Promise<RefreshOutcome>` (`src/lib/server/session.ts`). El proxy bloquea `/api/backend/auth/refresh` con 404 `Ruta no disponible.` |
| Caché | No aplica. Cuando el BFF renueva, actualiza las cookies en la misma respuesta que devuelve al navegador, salvo si la llamada posterior a bk-crm falla por red o timeout (ver las notas). |
| Cabeceras y límites | `Content-Type: application/json`. Sin rate limiting. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `refreshToken` | string | Sí | `@IsString()`. Debe ser el último refresh token emitido para la sesión. Un string vacío pasa la validación y responde 401. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
// BFF (src/lib/server/session.ts): una sola renovación por refresh token
const outcome = await refreshSession(refreshToken);
```

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1YjBlN2MzYS0yZjQxLTRkOGUtOWE2Yi0xYzNkNWU3ZjlhMjAiLCJzZXNzaW9uSWQiOiIwYzZlOWYyYS03ZDRiLTRlMWMtOGEzNS1iMmY3ZDllMWM0NjQiLCJqdGkiOiIzZThhMWM1Zi05YjJkLTRmNjAtYTdjNC1kMWUzZjViN2E5NzUiLCJpYXQiOjE3OTM3MTkyNDEsImV4cCI6MTc5NDMyNDA0MX0.soA4pg45RmBrSGwh81eKKDiO5fEjErLD8wM-WKR4FLQ"
}
```

**Respuesta**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1YjBlN2MzYS0yZjQxLTRkOGUtOWE2Yi0xYzNkNWU3ZjlhMjAiLCJzZXNzaW9uSWQiOiIwYzZlOWYyYS03ZDRiLTRlMWMtOGEzNS1iMmY3ZDllMWM0NjQiLCJlbWFpbCI6InJvc2EubWFtYW5pQGV4YW1wbGUuY29tIiwicm9sZXMiOlsiQURNSU4iXSwiaWF0IjoxNzkzNzIwMTE2LCJleHAiOjE3OTM3MjEwMTZ9.nFrgM4j99B-f1lbz5N6GmopyKG0EKuyUusuA9-2GgVk",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1YjBlN2MzYS0yZjQxLTRkOGUtOWE2Yi0xYzNkNWU3ZjlhMjAiLCJzZXNzaW9uSWQiOiIwYzZlOWYyYS03ZDRiLTRlMWMtOGEzNS1iMmY3ZDllMWM0NjQiLCJqdGkiOiI3ZjJjNGU2YS0xYjNkLTRhNTgtOWM3MC1lMmY0YTZiOGMwODYiLCJpYXQiOjE3OTM3MjAxMTYsImV4cCI6MTc5NDMyNDkxNn0.J7Vg5hg6lUbitTfn4D0QFPjjpsnswf8xsr8CMoisKGQ"
}
```

**Errores**

Tras la validación del body, los 401 se comprueban en este orden: firma y vencimiento del token, sesión, revocación, vencimiento de la sesión, hash del token, usuario y rotación.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `refreshToken must be a string` (array) | El campo falta, es `null` o no es string |
| 400 | `property <campo> should not exist` (array) | El body trae otros campos |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 401 | `Refresh token inválido o expirado` | El token está mal formado, vacío o expirado, o tiene una firma inválida (p. ej. si se envía un access token) |
| 401 | `Sesión no válida` | La sesión no existe o no pertenece al usuario del token |
| 401 | `Sesión revocada` | La sesión se cerró por logout, por desactivación del usuario o por restablecimiento de contraseña |
| 401 | `Sesión expirada` | Pasaron 7 días desde el login |
| 401 | `Refresh token inválido` | El token ya rotó: se está reutilizando un refresh token anterior |
| 401 | `Usuario no autorizado` | El usuario ya no existe o está inactivo. Es una comprobación defensiva: al desactivar a un usuario se revocan sus sesiones, así que antes llega `Sesión revocada`. |
| 401 | `Refresh token ya utilizado o sesión no válida` | Otra petición rotó el mismo token a la vez, o la sesión dejó de ser válida durante la operación |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |

**Efectos**

- Rota el refresh token: la sesión guarda el hash del nuevo y registra `lastUsedAt`. El refresh token usado deja de servir.
- No alarga la sesión: sigue venciendo 7 días después del login, aunque el nuevo refresh token tenga su propio `exp` (`JWT_REFRESH_EXPIRES_IN` contado desde la renovación).
- El nuevo access token lleva el email y los roles que hay en ese momento en la base de datos.
- Los access tokens anteriores de la misma sesión siguen valiendo hasta su `exp`.

**Notas para el frontend**

- El navegador no llama a esta ruta. El BFF renueva en dos casos: antes de llamar, si `crm_at` falta o vence en 30 s o menos; y una sola vez, tras un 401 de bk-crm.
- Si varias peticiones necesitan renovar a la vez, el BFF hace una sola renovación por refresh token. Además, recuerda el resultado 60 s para las peticiones que llegan tarde con el token anterior. Ese registro vive en la memoria del proceso: en producción hace falta una sola instancia del frontend o sesiones *sticky*.
- Un 400 o 401 de esta ruta termina la sesión: el BFF responde 401 `SESSION_EXPIRED` y borra las cookies. Cualquier otro fallo, o la falta de respuesta, da 503 `BACKEND_UNAVAILABLE` sin cerrar la sesión.
- Si la renovación funciona pero la llamada que viene después no llega a bk-crm (red o timeout), `proxyWithSession` responde 503 o 504 sin las cookies nuevas. El navegador conserva el refresh token anterior, que bk-crm ya rotó. Durante 60 s el BFF lo resuelve con el resultado recordado; después, el siguiente refresh responde 401 `Refresh token inválido` y la sesión termina con `SESSION_EXPIRED`.
- La respuesta no incluye `user`. Los datos actuales salen de `GET /auth/me`.
- Al vencer la sesión (7 días después del login), esta ruta responde 401 `Sesión expirada` aunque la cookie `crm_rt` siga viva, y hay que volver a iniciar sesión.

### Cerrar sesión
`POST /auth/logout`

| | |
|---|---|
| Roles | Cualquier usuario autenticado (ADMIN, OWNER, OPERATOR o SUPPORT) |
| Respuesta | 201 · `LogoutResponse`. El navegador recibe 200 · `BffLogoutResponse` (`{ ok: true }`) |
| ft-crm | `sessionApi.logout(): Promise<{ ok: true }>` (existe), que llama al handler del BFF `POST /api/auth/logout`. Lo usa `useSession().logout()` (`src/lib/auth/session.tsx`). El proxy bloquea `/api/backend/auth/logout` con 404 `Ruta no disponible.` |
| Caché | `queryClient.clear()` y navegar a `/login`. `SessionProvider.logout` ya lo hace, aunque el logout falle. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` vigente, de un usuario activo y con la sesión activa. Lo pone el BFF a partir de la cookie `crm_at`. |

**Body**: no lleva. La ruta no tiene DTO, así que un JSON válido se ignora. Un JSON mal formado con `Content-Type: application/json` responde 400 del parser, antes de comprobar el token.

**Ejemplo de petición**

```ts
await sessionApi.logout(); // POST /api/auth/logout con body {}
```

El BFF llama a bk-crm sin body: `POST /auth/logout` con `Authorization: Bearer <crm_at>`.

**Respuesta**

201 de bk-crm al BFF:

```json
{
  "message": "Sesión cerrada correctamente"
}
```

200 del BFF al navegador, que además borra las cookies `crm_at` y `crm_rt`:

```json
{
  "ok": true
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Unauthorized` (sin campo `error`) | Falta la cabecera, el token está mal formado, la firma es inválida o el token expiró |
| 401 | `Token de acceso inválido` | El token no trae `sub` o `sessionId` |
| 401 | `Usuario no autorizado` | El usuario ya no existe o está inactivo (es lo que recibe un usuario desactivado) |
| 401 | `Sesión no válida o expirada` | La sesión ya estaba revocada (p. ej. un segundo logout con el mismo token) o venció |

No hay 403: cualquier rol puede cerrar su sesión.

**Efectos**

- Revoca solo la sesión del access token: guarda `revokedAt`. Desde ese momento, el access token y el refresh token de esa sesión responden 401.
- Las demás sesiones del usuario (otros navegadores o dispositivos) siguen activas.

**Notas para el frontend**

- El handler del BFF primero renueva con `crm_rt` si `crm_at` falta o vence en 5 s o menos, porque bk-crm exige un access token vigente para revocar la sesión. Luego llama a bk-crm e ignora su respuesta.
- `/api/auth/logout` siempre responde 200 `{ ok: true }` y borra las cookies, aunque bk-crm no responda. En ese caso la sesión sigue vigente en el servidor hasta que venza (como máximo, 7 días después del login).
- En bk-crm no es idempotente: repetir el logout con el mismo token da 401. El BFF lo absorbe.
- No hay endpoint para cerrar todas las sesiones de un usuario.

### Obtener el usuario autenticado
`GET /auth/me`

| | |
|---|---|
| Roles | Cualquier usuario autenticado (ADMIN, OWNER, OPERATOR o SUPPORT) |
| Respuesta | 200 · `MeResponse` |
| ft-crm | `sessionApi.me(signal?: AbortSignal): Promise<MeResponse>` (existe), que pide `/api/backend/auth/me` |
| Caché | `qk.me` (`["me"]`). En `SessionProvider`: `staleTime` de 60 s y `refetchInterval` de 5 min. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` vigente, de un usuario activo y con la sesión activa. Lo pone el BFF. |

**Respuesta**

```json
{
  "id": "5b0e7c3a-2f41-4d8e-9a6b-1c3d5e7f9a20",
  "sessionId": "0c6e9f2a-7d4b-4e1c-8a35-b2f7d9e1c464",
  "firstName": "Rosa",
  "lastName": "Mamani",
  "email": "rosa.mamani@example.com",
  "roles": ["ADMIN"]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: `NO_SESSION` si no hay cookies; `SESSION_EXPIRED` si hacía falta renovar y no hay `crm_rt`, si el refresh responde 400 o 401, o si bk-crm sigue respondiendo 401 con el token renovado. Si el refresh falla por red, responde 503 `BACKEND_UNAVAILABLE` y no cierra la sesión. |

Motivos del 401 de bk-crm, que el BFF convierte en el anterior (no llegan al navegador):

| Mensaje de bk-crm | Cuándo |
|---|---|
| `Unauthorized` (sin campo `error`) | Falta la cabecera, el token está mal formado, la firma es inválida o el token expiró |
| `Token de acceso inválido` | El token no trae `sub` o `sessionId` |
| `Usuario no autorizado` | El usuario ya no existe o está inactivo (es lo que recibe un usuario desactivado) |
| `Sesión no válida o expirada` | La sesión fue revocada (por logout, por restablecimiento de contraseña o por una desactivación anterior, si el usuario ya se reactivó) o venció |

No hay 403: cualquier rol puede consultar su perfil, incluido SUPPORT.

**Efectos**: ninguno (solo lectura).

**Notas para el frontend**

- Los datos y los roles se leen de la base de datos en cada llamada, no del JWT. Es la fuente de verdad para `can()` y `canView()` (`src/lib/auth/permissions.ts`).
- Refresca `qk.me` después de editar los datos o los roles del propio usuario.
- El orden de `roles` no está garantizado. Para mostrar un solo rol usa `primaryRole()`, que aplica la precedencia ADMIN > OWNER > OPERATOR > SUPPORT.
- `sessionId` identifica la sesión actual; ninguna otra ruta lo usa.
- No incluye `isActive`, `lastLoginAt`, `createdAt` ni `updatedAt`. Para esos datos, un ADMIN puede usar `GET /users/:id`.
- En el navegador, un 401 llega como `SESSION_EXPIRED` o `NO_SESSION`. `apiFetch` emite `crm:session-expired` y `SessionProvider` lleva a `/login?motivo=sesion&next=…`.
- Un 503 o 504 no cierra la sesión. Si todavía no hay datos de `qk.me`, `useSession()` queda en `status: "error"` y ofrece `retry()`; si ya los había, conserva los anteriores.

### Comprobar acceso de administrador (endpoint de prueba)
`GET /auth/test-admin`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `TestAdminResponse` |
| ft-crm | No se usa desde el navegador: el BFF la bloquea y `/api/backend/auth/test-admin` responde 404 `Ruta no disponible.` |
| Caché | No aplica |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` vigente de un ADMIN |

**Respuesta**

```json
{
  "message": "Acceso autorizado para administrador"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Unauthorized` (sin `error`); `Token de acceso inválido`; `Usuario no autorizado`; `Sesión no válida o expirada` | El token falta, es inválido o expiró; el usuario está inactivo; o la sesión fue revocada o venció |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |

**Efectos**: ninguno (solo lectura).

**Notas para el frontend**

- Es un endpoint de prueba. El README de bk-crm pide eliminar los endpoints temporales de prueba antes de desplegar, así que no construyas pantallas sobre él. Falta confirmar si se mantendrá (ver [Preguntas abiertas](#preguntas-abiertas-1)).
- Para saber si el usuario es ADMIN usa `GET /auth/me` (`roles.includes("ADMIN")`).

### Solicitar recuperación de contraseña
`POST /auth/forgot-password`

| | |
|---|---|
| Roles | Pública |
| Respuesta | 200 · `ForgotPasswordResponse` (siempre la misma). El navegador recibe 200 · `BffForgotPasswordResponse` |
| ft-crm | `sessionApi.forgotPassword(email: string): Promise<{ message: string }>` (existe), que llama al handler del BFF `POST /api/auth/forgot-password`. El proxy bloquea `/api/backend/auth/forgot-password` con 404 `Ruta no disponible.` |
| Caché | No aplica (pantalla pública, sin consultas) |
| Cabeceras y límites | `Content-Type: application/json`, sin `Authorization`. Máximo 3 peticiones cada 60 s por IP y cuenta: la cuarta responde 429. Techo del BFF: `CRM_BACKEND_TIMEOUT_MS` (15 s por defecto), luego 504. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `email` | string | Sí | `@IsEmail()` y `@MaxLength(320)`. En la práctica `@IsEmail()` ya limita el email a 254 caracteres y rechaza los espacios alrededor. El servicio aplica `trim` y minúsculas antes de buscar. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
const { message } = await sessionApi.forgotPassword("carlos.huaman@example.com");
```

El navegador envía a `/api/auth/forgot-password`, y el BFF reenvía a bk-crm (con `trim`, en minúsculas y sin otros campos), este JSON:

```json
{
  "email": "carlos.huaman@example.com"
}
```

**Respuesta**

200 de bk-crm al BFF:

```json
{
  "message": "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña"
}
```

200 del BFF al navegador (su propio texto, con punto final):

```json
{
  "message": "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña."
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `email must be shorter than or equal to 320 characters`; `email must be an email` (array) | `email` falta, es `null` o no es string (llegan los dos mensajes), o supera 320 caracteres |
| 400 | `email must be an email` (array) | El email está mal formado, tiene espacios alrededor o supera 254 caracteres |
| 400 | `property <campo> should not exist` (array) | El body trae otros campos |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |
| 429 | `ThrottlerException: Too Many Requests` (sin `error`; con cabecera `Retry-After` en segundos) | Cuarta petición en 60 s con la misma IP y el mismo email (con `trim` y en minúsculas). La pareja queda bloqueada 60 s. |

No hay 404: un correo desconocido responde igual que uno registrado.

**Efectos**

- Si el correo pertenece a un usuario activo:
  1. Borra todos sus enlaces de recuperación anteriores, usados o no.
  2. Crea un enlace de un solo uso que vence a los `PASSWORD_RESET_TOKEN_TTL_MINUTES` minutos (15 por defecto; entero de 1 a 1440). Solo guarda el hash SHA-256 del token.
  3. Envía con Resend el correo «Restablece tu contraseña de EYAQ Systems». El correo incluye el enlace `FRONTEND_RESET_PASSWORD_URL?token=<64 caracteres hexadecimales en minúsculas>` y avisa en cuántos minutos vence.
- Si falla el envío, borra el enlace nuevo. Como los anteriores ya se borraron, el usuario se queda sin enlace válido y tiene que pedir otro.
- Si el correo no existe, el usuario está inactivo o no se pudo crear el enlace, no hace nada más.
- En todos los casos suma una petición al contador de la IP y la cuenta, también si no pasa la validación.

**Notas para el frontend**

- La respuesta de bk-crm es siempre la misma 200: exista o no el correo, esté inactivo el usuario o falle el envío. Así no se revela si la cuenta existe. Muestra el mensaje tal cual y no prometas que el correo llegó.
- Lo que recibe el navegador de `/api/auth/forgot-password`:

  | Caso | Estado | `message` |
  |---|---|---|
  | El body no pasa la validación del BFF (zod: email con `trim`, minúsculas y máximo 320) | 400 | `Ingresa un correo válido.` |
  | bk-crm responde 429 | 429 | `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` (sin `Retry-After`) |
  | Cualquier otro error de bk-crm | 502 | `No se pudo enviar el enlace. Inténtalo de nuevo.` |
  | bk-crm no responde | 503 o 504 | Mensaje del BFF con `code: "BACKEND_UNAVAILABLE"` |
  | Éxito | 200 | `Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.` |

- El enlace del correo abre `/reset-password?token=…` en ft-crm (`src/app/(auth)/reset-password/`), que es una ruta pública en `src/proxy.ts`. `FRONTEND_RESET_PASSWORD_URL` vale por defecto `http://localhost:5173/reset-password`. Con `NODE_ENV=production`, bk-crm no arranca si no es una URL `https` pública. La URL de cada entorno está por confirmar.
- Sin `RESEND_FROM_EMAIL` (o con un remitente de `resend.dev`), Resend solo entrega al dueño de la cuenta de Resend; con `NODE_ENV=production`, bk-crm no arranca así. En desarrollo, el correo puede no llegar aunque la respuesta sea 200.

### Restablecer contraseña
`POST /auth/reset-password`

| | |
|---|---|
| Roles | Pública |
| Respuesta | 200 · `ResetPasswordResponse`. El navegador recibe 200 · `BffResetPasswordResponse` |
| ft-crm | `sessionApi.resetPassword(token: string, newPassword: string): Promise<{ message: string }>` (existe), que llama al handler del BFF `POST /api/auth/reset-password`. El proxy bloquea `/api/backend/auth/reset-password` con 404 `Ruta no disponible.` |
| Caché | No aplica (pantalla pública, sin consultas) |
| Cabeceras y límites | `Content-Type: application/json`, sin `Authorization`. Máximo 5 peticiones cada 60 s por IP y enlace (`token`): la sexta responde 429. Techo del BFF: `CRM_BACKEND_TIMEOUT_MS` (15 s por defecto), luego 504. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `token` | string | Sí | `@IsString()` y `@Matches(/^[a-f0-9]{64}$/i)`; si no cumple, el mensaje es `El token de recuperación no tiene un formato válido`. Envía exactamente el valor que llegó en el enlace: el patrón admite mayúsculas, pero el token se busca por su hash y solo coincide tal como se emitió (en minúsculas). No admite `null`. |
| `newPassword` | string | Sí | `@IsString()`, `@MinLength(8)` y `@MaxLength(72)`, en caracteres. No se recorta y no hay reglas de complejidad. bcrypt solo usa los primeros 72 bytes en UTF-8: con tildes, `ñ` o emojis, el resto se ignora al comparar. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`; por ejemplo, `confirmPassword`.

**Ejemplo de petición**

```ts
// reset-form.tsx lee el token de ?token= y comprueba que las dos contraseñas coincidan
await sessionApi.resetPassword(token, "Nueva-Clave-2026");
```

El navegador envía a `/api/auth/reset-password`, y el BFF reenvía a bk-crm (sin otros campos), este JSON:

```json
{
  "token": "34e9f720f76dcdf209c3e0cfdcaf31cfdba932f8e0416cbbb0cc2f75531ba935",
  "newPassword": "Nueva-Clave-2026"
}
```

**Respuesta**

200 de bk-crm al BFF:

```json
{
  "message": "Contraseña restablecida correctamente"
}
```

200 del BFF al navegador (su propio texto, con punto final):

```json
{
  "message": "Contraseña restablecida correctamente."
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `El token de recuperación no tiene un formato válido` (array) | `token` no tiene 64 caracteres hexadecimales. Si falta o no es string, llega junto con `token must be a string`. |
| 400 | `newPassword must be shorter than or equal to 72 characters`; `newPassword must be longer than or equal to 8 characters`; `newPassword must be a string` (array) | `newPassword` tiene menos de 8 o más de 72 caracteres (solo el mensaje de esa longitud). Si falta o no es string, llegan los tres, en este orden. Con el body vacío llegan cinco: los dos de `token` y después los tres de `newPassword`. |
| 400 | `property <campo> should not exist` (array) | El body trae otros campos |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 400 | `El enlace de recuperación es inválido o ha expirado` (string) | El token no existe (o se envió en mayúsculas), ya se usó, venció o se borró al pedir otro enlace; el usuario está inactivo; o hubo un conflicto con otra petición simultánea |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |
| 429 | `ThrottlerException: Too Many Requests` (sin `error`; con cabecera `Retry-After` en segundos) | Sexta petición en 60 s con la misma IP y el mismo `token`. La pareja queda bloqueada 60 s. |

**Efectos**

En una sola transacción:
- marca el enlace como usado (`usedAt`);
- guarda la nueva contraseña (bcrypt, 12 rondas), lo que también cambia el `updatedAt` del usuario;
- revoca todas las sesiones activas del usuario;
- borra sus demás enlaces de recuperación.

No inicia sesión ni cambia `lastLoginAt`. Suma una petición al contador de la IP y el enlace.

**Notas para el frontend**

- El token es de un solo uso: un segundo intento con el mismo token devuelve 400.
- El usuario tendrá que iniciar sesión de nuevo en todos sus dispositivos. ft-crm redirige a `/login?motivo=restablecida`.
- Lo que recibe el navegador de `/api/auth/reset-password`:

  | Caso | Estado | `message` |
  |---|---|---|
  | El body no pasa la validación del BFF (zod: `token` con el mismo patrón y `newPassword` de 8 a 72) | 400 | `El enlace no es válido o la contraseña no cumple el largo (8 a 72 caracteres).` |
  | bk-crm responde 400 | 400 | `El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.` |
  | bk-crm responde 429 | 429 | `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` (sin `Retry-After`) |
  | Cualquier otro error de bk-crm | 502 | `No se pudo cambiar la contraseña. Inténtalo de nuevo.` |
  | bk-crm no responde | 503 o 504 | Mensaje del BFF con `code: "BACKEND_UNAVAILABLE"` |
  | Éxito | 200 | `Contraseña restablecida correctamente.` |

- `reset-form.tsx` muestra «Enlace no válido» si `token` no cumple `/^[a-f0-9]{64}$/i`, y valida en el cliente el largo y que las dos contraseñas coincidan. No envíes la confirmación al backend.
- Si quien restablece tenía la sesión abierta en el mismo navegador, sus cookies siguen ahí, pero la sesión ya está revocada. Su siguiente llamada termina en `SESSION_EXPIRED`.

### Comprobar el estado del servicio
`GET /health`

| | |
|---|---|
| Roles | Pública |
| Respuesta | 200 · `HealthResponse` con `status: "ok"`; 503 · `HealthResponse` con `status: "error"` si la base de datos no responde |
| ft-crm | Handler del BFF `GET /api/listo` (existe; sin función en `endpoints.ts`). Responde 200 `ReadyResponse` si bk-crm responde 2xx, y 503 si no. |
| Caché | No aplica: hoy ninguna pantalla lo consulta |
| Cabeceras y límites | Sin token. bk-crm responde siempre con `Cache-Control: no-store`, también en el 503. La consulta a la base de datos tiene un límite de 3 s. |

**Respuesta**

200:

```json
{
  "status": "ok",
  "services": {
    "api": "up",
    "database": "up"
  },
  "timestamp": "2026-11-03T15:20:41.512Z",
  "uptimeSeconds": 6215
}
```

503: el body tiene la misma forma, sin `message` ni `error`.

```json
{
  "status": "error",
  "services": {
    "api": "up",
    "database": "down"
  },
  "timestamp": "2026-11-03T15:21:02.087Z",
  "uptimeSeconds": 6236
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 503 | Sin `message`: el body es el `HealthResponse` anterior, con `"status": "error"` y `"database": "down"` | La consulta `SELECT 1` a PostgreSQL falla o tarda más de 3 s |

**Efectos**: ninguno (solo lectura). Ejecuta una única consulta `SELECT 1 AS "result"`. No consulta Redis ni tablas de negocio.

**Notas para el frontend**

- `/api/listo` (`src/app/api/listo/route.ts`) devuelve, siempre con `cache-control: no-store`:
  - en modo mock, 200 `{ "estado": "ok", "backend": "simulado" }`;
  - en modo live, si bk-crm responde 2xx, 200 `{ "estado": "ok", "backend": "disponible" }`;
  - si bk-crm responde otro código, 503 `{ "estado": "error", "backend": "respondió 503" }`;
  - si bk-crm no responde, 503 `{ "estado": "error", "backend": "no disponible", "motivo": "timeout" }` (`motivo` puede ser `timeout`, `network` o `error`).
- `/api/salud` informa solo del proceso de Next.js (`{ estado, modo }`) y no consulta bk-crm.
- No uses `/api/backend/health`: el proxy exige sesión y responde 401 `NO_SESSION` sin cookies.
- Si una pantalla necesita un indicador de conexión, consulta `/api/listo` con `fetch` y una clave propia (p. ej. `["ready"]`). `apiFetch` no sirve, porque antepone `/api/backend`.
- `uptimeSeconds` son los segundos enteros desde que arrancó el proceso de bk-crm. `timestamp` es el instante de la comprobación, en UTC.

### Crear usuario
`POST /users`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 201 · `User` |
| ft-crm | `usersApi.create(body: CreateUserRequest): Promise<User>` (existe). Lo usa `InvitarUsuarioForm` (`src/features/ajustes/usuarios/invitar-usuario-form.tsx`). |
| Caché | Invalida `qk.users` (ya lo hace `InvitarUsuarioForm`). Si usas la clave nueva `qk.user(id)`, guarda ahí la respuesta con `setQueryData`. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) y `Content-Type: application/json` (lo pone `apiFetch`) |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `firstName` | string | Sí | `@IsString()`, `@IsNotEmpty()`, al menos un carácter no blanco (`firstName no puede contener solo espacios`) y `@MaxLength(100)`. El máximo se mide antes del `trim`, con los espacios. Se guarda con `trim`. No admite `null`. |
| `lastName` | string | Sí | Las mismas reglas que `firstName`, con el mensaje `lastName no puede contener solo espacios`. Se guarda con `trim`. No admite `null`. |
| `email` | string | Sí | `@IsEmail()` y `@MaxLength(320)`. En la práctica `@IsEmail()` ya limita el email a 254 caracteres y rechaza los espacios alrededor. Se guarda en minúsculas y debe ser único; la comparación se hace ya en minúsculas. No admite `null`. |
| `password` | string | Sí | `@IsString()`, `@MinLength(8)` y `@MaxLength(72)`, en caracteres. No se recorta y no hay reglas de complejidad. Se guarda con bcrypt (12 rondas) y nunca se devuelve. bcrypt solo usa los primeros 72 bytes en UTF-8: con tildes, `ñ` o emojis, 72 caracteres pueden superar ese tamaño y el resto se ignora al comparar. No admite `null`. |
| `roles` | `RoleCode[]` | Sí | `@IsArray()`, `@ArrayMinSize(1)`, `@ArrayUnique()` y cada valor debe ser `ADMIN`, `OWNER`, `OPERATOR` o `SUPPORT`, en mayúsculas. Admite varios roles. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`; por ejemplo, `isActive` o `confirmPassword`.

**Ejemplo de petición**

```ts
const user = await usersApi.create({
  firstName: "Lucía",
  lastName: "Quispe",
  email: "lucia.quispe@example.com",
  password: "Temporal-Lima-26",
  roles: ["OPERATOR"],
});
```

```json
{
  "firstName": "Lucía",
  "lastName": "Quispe",
  "email": "lucia.quispe@example.com",
  "password": "Temporal-Lima-26",
  "roles": ["OPERATOR"]
}
```

**Respuesta**

```json
{
  "id": "e8c5a1f3-4d2b-4c79-a0e6-9b1d3f5a7c53",
  "firstName": "Lucía",
  "lastName": "Quispe",
  "email": "lucia.quispe@example.com",
  "isActive": true,
  "lastLoginAt": null,
  "createdAt": "2026-11-03T15:42:08.517Z",
  "updatedAt": "2026-11-03T15:42:08.517Z",
  "roles": ["OPERATOR"]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` (array) | El body trae campos que no están en la tabla anterior |
| 400 | `firstName must be shorter than or equal to 100 characters`; `firstName no puede contener solo espacios`; `firstName should not be empty`; `firstName must be a string` (array, en este orden; lo mismo para `lastName`) | Falta o es `null`: llegan los cuatro. Otro tipo (número, booleano, array…): los mismos sin `should not be empty`. `""`: `no puede contener solo espacios` y `should not be empty`. Solo espacios: `no puede contener solo espacios`. Más de 100 caracteres: solo `must be shorter…` |
| 400 | `email must be shorter than or equal to 320 characters`; `email must be an email` (array, en este orden) | `email` falta, es `null`, no es string o supera 320 caracteres: llegan los dos. Mal formado, con espacios alrededor, con más de 254 caracteres o con más de 64 antes de la `@`: solo `email must be an email` |
| 400 | `password must be shorter than or equal to 72 characters`; `password must be longer than or equal to 8 characters`; `password must be a string` (array, en este orden) | `password` falta, es `null` o no es string: llegan los tres. Menos de 8 o más de 72 caracteres: solo el mensaje de esa longitud |
| 400 | `each value in roles must be one of the following values: ADMIN, OWNER, OPERATOR, SUPPORT`; `All roles's elements must be unique`; `roles must contain at least 1 elements`; `roles must be an array` (array, en este orden) | `roles` falta, es `null` o no es array (p. ej. `"admin"`, `5` o `{}`): llegan los cuatro; si es un string con un rol válido (`"ADMIN"`), los tres últimos. `[]`: solo `at least 1 elements`. Rol repetido: solo `must be unique`. Un valor fuera del enum dentro del array (p. ej. `["admin"]`): solo `each value in roles…` |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 400 | `Uno o más roles no están disponibles` (string) | Algún rol del enum no existe en la tabla `roles` (no se ejecutó el seed) |
| 400 | `Debes asignar al menos un rol` (string) | Comprobación defensiva del servicio. No llega por HTTP: antes responde la validación `roles must contain at least 1 elements`. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |
| 409 | `Ya existe un usuario registrado con este correo` | El email ya está registrado, comparado en minúsculas. También si otra petición lo registra a la vez. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |

Ejemplo de 400 para `{ "firstName": "   ", "lastName": "", "email": "x", "password": "corta", "roles": [] }`:

```json
{
  "message": [
    "firstName no puede contener solo espacios",
    "lastName no puede contener solo espacios",
    "lastName should not be empty",
    "email must be an email",
    "password must be longer than or equal to 8 characters",
    "roles must contain at least 1 elements"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

**Efectos**

- Crea el usuario activo (`isActive: true`, `lastLoginAt: null`) y le asigna los roles indicados.
- No envía correo de invitación ni crea sesiones.

**Notas para el frontend**

- El servicio comprueba primero el correo y después los roles: si el correo ya existe, responde 409 aunque falten roles en la base de datos.
- Los mensajes de validación están en inglés y casi todos empiezan por el nombre del campo (`firstName`, `lastName`, `email`, `password`, `roles`). Úsalo para mostrarlos como errores de campo. Excepciones: `each value in roles …` y `All roles's elements must be unique` (son de `roles`) y `property <campo> should not exist`. Hoy `createUserErrorTarget` lleva al campo Correo el 409 y los 400 cuyos mensajes son todos de `email`; el resto va a un aviso del formulario.
- `buildCreateUserBody` ya recorta los nombres y el email, y pasa el email a minúsculas. La contraseña se envía tal cual.
- El formulario actual envía un solo rol (`roles: [values.role]`), aunque el backend admite varios.
- No hay invitación por correo: el ADMIN comparte la contraseña temporal, y el usuario puede cambiarla con «¿Olvidaste tu contraseña?».
- La respuesta devuelve el email normalizado y nunca incluye `password` ni `passwordHash`. El orden de `roles` no está garantizado.

### Listar usuarios
`GET /users`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `User[]` (`UserListResponse`) |
| ft-crm | `usersApi.list(): Promise<User[]>` (existe). La usan `UsuariosView` (Ajustes > Usuarios) y `OwnerValidationCard` (Ajustes > Samanta, con `enabled: canEdit`). |
| Caché | `qk.users` (`["users"]`) |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) |

**Query**: no tiene. No hay búsqueda, filtros ni paginación. Los parámetros que se envíen se ignoran: esta ruta no declara DTO de query, así que no responde 400.

**Respuesta**: array plano, sin envoltorio ni paginación, ordenado por `createdAt` descendente.

```json
[
  {
    "id": "e8c5a1f3-4d2b-4c79-a0e6-9b1d3f5a7c53",
    "firstName": "Lucía",
    "lastName": "Quispe",
    "email": "lucia.quispe@example.com",
    "isActive": true,
    "lastLoginAt": null,
    "createdAt": "2026-11-03T15:42:08.517Z",
    "updatedAt": "2026-11-03T15:42:08.517Z",
    "roles": ["OPERATOR"]
  },
  {
    "id": "a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31",
    "firstName": "Carlos",
    "lastName": "Huamán",
    "email": "carlos.huaman@example.com",
    "isActive": true,
    "lastLoginAt": "2026-11-03T13:12:09.441Z",
    "createdAt": "2026-10-21T14:05:33.208Z",
    "updatedAt": "2026-11-03T13:12:09.442Z",
    "roles": ["OPERATOR"]
  },
  {
    "id": "d47b2e19-8c3f-4a61-b5d0-7e9f1a2c3b42",
    "firstName": "Jorge",
    "lastName": "Condori",
    "email": "jorge.condori@example.com",
    "isActive": true,
    "lastLoginAt": "2026-11-02T22:31:17.060Z",
    "createdAt": "2026-09-02T16:47:51.902Z",
    "updatedAt": "2026-11-02T22:31:17.061Z",
    "roles": ["OWNER"]
  },
  {
    "id": "5b0e7c3a-2f41-4d8e-9a6b-1c3d5e7f9a20",
    "firstName": "Rosa",
    "lastName": "Mamani",
    "email": "rosa.mamani@example.com",
    "isActive": true,
    "lastLoginAt": "2026-11-03T15:20:41.233Z",
    "createdAt": "2026-07-30T05:20:11.000Z",
    "updatedAt": "2026-11-03T15:20:41.234Z",
    "roles": ["ADMIN"]
  }
]
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |

**Efectos**: ninguno (solo lectura).

**Notas para el frontend**

- Devuelve todos los usuarios, incluidos los inactivos. Si dos usuarios tienen el mismo `createdAt`, el orden entre ellos no está garantizado; `sortUsers` vuelve a ordenar en el cliente por `createdAt`, sin desempate.
- Filtra y pagina en el cliente. Por ejemplo, `OwnerValidationCard` usa `approvalCandidates` para quedarse con los usuarios activos con rol OWNER al elegir el responsable de aprobación.
- `updatedAt` también cambia en cada login, porque se actualiza `lastLoginAt`.
- `lastLoginAt` es `null` si el usuario nunca inició sesión (en la UI, «Nunca»). Muestra las fechas en el `timeZone` del restaurante (`formatDayTime`, `lastAccessText`).
- OWNER y OPERATOR reciben 403, así que con esta ruta no pueden convertir en un nombre el `authorUserId` de un mensaje ni los `createdById`, `reviewedById` o `editedById` de un borrador de Samanta (ver [Preguntas abiertas](#preguntas-abiertas-1)). No lo necesitan para las asignaciones, las observaciones ni las reprogramaciones: `assignedUser`, `author` y `changedBy` ya traen el nombre.

### Ver el detalle de un usuario
`GET /users/:id`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `User` |
| ft-crm | Nueva: `usersApi.get(id: Uuid, signal?: AbortSignal): Promise<User>`, implementada como ``apiFetch<User>(`/users/${id}`, { signal })`` |
| Caché | Nueva: `qk.user(id)` = `["users", "detail", id]`. Cuelga de `qk.users`, así que invalidar `qk.users` también la invalida. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | `ParseUUIDPipe`: acepta cualquier versión de UUID, en minúsculas o mayúsculas. El `id` se guarda como texto en minúsculas: usa el valor tal como lo devuelve la API, porque un UUID en mayúsculas pasa la validación pero responde 404. |

**Ejemplo de petición**

```ts
const user = await usersApi.get("a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31"); // GET /api/backend/users/a3f1c9e2-…
```

**Respuesta**

```json
{
  "id": "a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31",
  "firstName": "Carlos",
  "lastName": "Huamán",
  "email": "carlos.huaman@example.com",
  "isActive": true,
  "lastLoginAt": "2026-11-03T13:12:09.441Z",
  "createdAt": "2026-10-21T14:05:33.208Z",
  "updatedAt": "2026-11-03T13:12:09.442Z",
  "roles": ["OPERATOR"]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` (string) | `:id` no es un UUID |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT). Los guards actúan antes que la validación del `:id`. |
| 404 | `Usuario no encontrado` | No existe un usuario con ese `id` |

**Efectos**: ninguno (solo lectura).

**Notas para el frontend**

- Devuelve lo mismo que una fila de `GET /users`. También devuelve usuarios inactivos (`isActive: false`).
- Sirve para una pantalla de detalle o edición. Para la lista ya basta `GET /users`.
- Al añadir `usersApi.get`, añade también su handler en `src/lib/mock/server.ts`. Hoy el mock no tiene esta ruta y responde 404 `Cannot GET /users/<id>`.
- Propuesta para `src/lib/api/endpoints.ts` y `src/lib/api/query-keys.ts`, con el mismo estilo que las funciones existentes (`get` y `update` son nuevas; compila con los tipos de [Tipos TypeScript](#tipos-typescript)):

  ```ts
  // endpoints.ts: añade Uuid y UpdateUserRequest (este último, nuevo en types.ts) al import de "./types".
  export const usersApi = {
    list: () => apiFetch<User[]>("/users"),
    /** Nueva: GET /users/:id */
    get: (id: Uuid, signal?: AbortSignal) => apiFetch<User>(`/users/${id}`, { signal }),
    create: (body: CreateUserRequest) => apiFetch<User>("/users", { method: "POST", body }),
    /** Nueva: PATCH /users/:id. Envía solo los campos que cambian. */
    update: (id: Uuid, body: UpdateUserRequest) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body }),
    setActive: (id: string, isActive: boolean) =>
      apiFetch<User>(`/users/${id}/status`, { method: "PATCH", body: { isActive } }),
    setRoles: (id: string, roles: RoleCode[]) => apiFetch<User>(`/users/${id}/roles`, { method: "PATCH", body: { roles } }),
  };

  // query-keys.ts, junto a `users`:
  // user: (id: string) => ["users", "detail", id] as const,
  ```

### Editar los datos de un usuario
`PATCH /users/:id`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `User` |
| ft-crm | Nueva: `usersApi.update(id: Uuid, body: UpdateUserRequest): Promise<User>`, implementada como ``apiFetch<User>(`/users/${id}`, { method: "PATCH", body })`` |
| Caché | Guarda la respuesta en `qk.user(id)` (nueva) y en la fila de `qk.users`, o invalida `qk.users`. Si `id` es el del usuario autenticado, invalida `qk.me`. Si cambió el nombre, invalida también `qk.conversationsAll` y `qk.reservationsAll`, que muestran el nombre embebido. Si cambió el nombre o el email, invalida `qk.config`: `approvalResponsible` trae nombre, apellido y email. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) y `Content-Type: application/json` (lo pone `apiFetch`) |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | `ParseUUIDPipe` (cualquier versión). Usa el `id` tal como lo devuelve la API: en mayúsculas responde 404. |

**Body**: envía al menos uno de estos campos, solo los que cambian.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `firstName` | string | No | `@IsString()`, al menos un carácter no blanco (`firstName no puede contener solo espacios`) y `@MaxLength(100)`, medido antes del `trim`. Se guarda con `trim`. No admite `null` ni `""`. |
| `lastName` | string | No | Las mismas reglas que `firstName`, con el mensaje `lastName no puede contener solo espacios`. Se guarda con `trim`. No admite `null` ni `""`. |
| `email` | string | No | `@IsEmail()` y `@MaxLength(320)`. En la práctica `@IsEmail()` ya limita el email a 254 caracteres y rechaza los espacios alrededor. Se guarda en minúsculas y debe ser único; se puede reenviar el email actual del propio usuario. No admite `null`. |

Los campos opcionales se validan solo si están presentes (`@ValidateIf(value !== undefined)`): omitirlos no es lo mismo que enviarlos en `null`, que responde 400. Cualquier otro campo (`password`, `roles`, `isActive`, `id`, `createdAt`…) responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
const user = await usersApi.update("a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31", { firstName: "Carlos Alberto" });
```

```json
{
  "firstName": "Carlos Alberto"
}
```

**Respuesta**

```json
{
  "id": "a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31",
  "firstName": "Carlos Alberto",
  "lastName": "Huamán",
  "email": "carlos.huaman@example.com",
  "isActive": true,
  "lastLoginAt": "2026-11-03T13:12:09.441Z",
  "createdAt": "2026-10-21T14:05:33.208Z",
  "updatedAt": "2026-11-03T15:46:27.905Z",
  "roles": ["OPERATOR"]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` (array) | El body trae campos no editables (`password`, `roles`, `isActive`, etc.) |
| 400 | `firstName must be shorter than or equal to 100 characters`; `firstName no puede contener solo espacios`; `firstName must be a string` (array, en este orden; lo mismo para `lastName`) | El campo llega en `null` o no es string: llegan los tres. `""` o solo espacios: solo `no puede contener solo espacios`. Más de 100 caracteres: solo `must be shorter…` |
| 400 | `email must be shorter than or equal to 320 characters`; `email must be an email` (array, en este orden) | `email` llega en `null`, no es string o supera 320 caracteres: llegan los dos. Mal formado (también `""`), con espacios alrededor, con más de 254 caracteres o con más de 64 antes de la `@`: solo `email must be an email` |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 400 | `Validation failed (uuid is expected)` (string) | `:id` no es un UUID |
| 400 | `Debes proporcionar al menos un campo para actualizar` (string) | El body está vacío (`{}`) y el usuario existe |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |
| 404 | `Usuario no encontrado` | No existe un usuario con ese `id`. Se comprueba antes que el body vacío y que el email duplicado. |
| 409 | `Ya existe un usuario registrado con este correo` | El email pertenece a otro usuario, comparado en minúsculas. También si otro usuario lo toma a la vez. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |

**Efectos**

- Actualiza solo los campos enviados y cambia `updatedAt`, aunque el valor sea el mismo.
- Los nombres del usuario aparecen embebidos en otros recursos, que se leen en cada consulta:
  - `assignedUser` de conversaciones y reservas;
  - el autor de las observaciones (`author`) y de las reprogramaciones (`changedBy`) de una reserva;
  - `approvalResponsible` de `GET /restaurant-config`, que además trae el email.

  La siguiente lectura de esos recursos ya trae los datos nuevos.
- Cambiar el email no cierra sesiones: el usuario seguirá conectado y usará el email nuevo en su próximo login.

**Notas para el frontend**

- Es una actualización parcial: envía solo los campos que cambiaron, ya recortados y con el email en minúsculas. Nunca envíes `null` ni `""` para "no cambiar": omite el campo.
- No cambia la contraseña, el estado ni los roles; para eso están las rutas específicas. No hay endpoint para que un ADMIN cambie la contraseña de otro usuario.
- Funciona también con usuarios inactivos.
- Mapea los mensajes de validación por su primera palabra (`firstName`, `lastName`, `email`) y el 409 al campo email.
- Al añadir `usersApi.update`, añade también su handler en `src/lib/mock/server.ts`. Hoy el mock responde 404 `Cannot PATCH /users/<id>`. El `usersApi` propuesto completo está en [Ver el detalle de un usuario](#ver-el-detalle-de-un-usuario).

### Activar o desactivar un usuario
`PATCH /users/:id/status`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `User` |
| ft-crm | `usersApi.setActive(id: string, isActive: boolean): Promise<User>` (existe). La usa el interruptor «Activo» de `UsuariosView`. |
| Caché | `UsuariosView` ya actualiza `qk.users` de forma optimista, la revierte si hay error y la invalida al terminar. Actualiza también `qk.user(id)` (nueva) e invalida `qk.conversationsAll` y `qk.reservationsAll`, que muestran `assignedUser.isActive` e `isEligible`. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) y `Content-Type: application/json` (lo pone `apiFetch`) |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | `ParseUUIDPipe` (cualquier versión). Usa el `id` tal como lo devuelve la API: en mayúsculas responde 404. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `isActive` | boolean | Sí | `@IsBoolean()`. Tiene que ser un booleano JSON real: `"true"`, `1` o `null` responden 400. |

Cualquier otro campo responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
const user = await usersApi.setActive("a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31", false);
```

```json
{
  "isActive": false
}
```

**Respuesta**

```json
{
  "id": "a3f1c9e2-6b7d-4e58-8c19-0d2e4f6a8b31",
  "firstName": "Carlos",
  "lastName": "Huamán",
  "email": "carlos.huaman@example.com",
  "isActive": false,
  "lastLoginAt": "2026-11-03T13:12:09.441Z",
  "createdAt": "2026-10-21T14:05:33.208Z",
  "updatedAt": "2026-11-03T15:48:52.336Z",
  "roles": ["OPERATOR"]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `isActive must be a boolean value` (array) | El campo falta, es `null` o no es booleano |
| 400 | `property <campo> should not exist` (array) | El body trae otros campos |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 400 | `Validation failed (uuid is expected)` (string) | `:id` no es un UUID |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |
| 404 | `Usuario no encontrado` | No existe un usuario con ese `id` |
| 409 | `No se puede desactivar al último administrador activo` | Se intenta desactivar a un ADMIN activo y no hay otro ADMIN activo |
| 409 | `La operación entró en conflicto con otro cambio; inténtalo nuevamente` | Otra transacción simultánea entró en conflicto (transacción `Serializable`). Se puede reintentar. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |

**Efectos**

- Cambia `isActive` y `updatedAt`, también si el estado no cambia.
- Con `isActive: false` revoca en la misma transacción todas las sesiones activas del usuario: sus tokens responden 401 de inmediato. Mientras siga inactivo:
  - no puede iniciar sesión (401 `Correo o contraseña incorrectos`);
  - `forgot-password` no le envía correo;
  - sus enlaces de recuperación pendientes responden 400.
- Con `isActive: true` no recupera las sesiones anteriores: el usuario tiene que iniciar sesión de nuevo.
- No libera sus asignaciones. Las conversaciones y reservas que tenía asignadas siguen con `assignedUser`, ahora con `isActive: false` e `isEligible: false`.
- No comprueba si es el responsable de aprobación del restaurante. Si lo es, `GET /restaurant-config` lo sigue mostrando, pero `PUT /restaurant-config` responde 400 `El responsable de aprobación debe estar activo` hasta que se elija otro.

**Notas para el frontend**

- Enviar el mismo estado que ya tiene el usuario es válido y responde 200.
- Un ADMIN puede desactivarse a sí mismo si hay otro ADMIN activo. Su propia sesión se revoca y la siguiente petición termina en `SESSION_EXPIRED`, que lleva al login. `UsuariosView` ya pide confirmación antes.
- Muestra el mensaje de los 409 tal cual. El de conflicto admite reintento; el del último ADMIN, no.
- Si el usuario es el responsable de aprobación (`approvalResponsibleId` de la configuración), avisa antes de desactivarlo: Ajustes > Samanta lo marcará como «ya no es válido».

### Reemplazar los roles de un usuario
`PATCH /users/:id/roles`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `User` |
| ft-crm | `usersApi.setRoles(id: string, roles: RoleCode[]): Promise<User>` (existe; ninguna pantalla la usa todavía) |
| Caché | Guarda la respuesta en la fila de `qk.users` (o invalídala) y en `qk.user(id)` (nueva). Si `id` es el del usuario autenticado, invalida `qk.me`. Invalida `qk.conversationsAll` y `qk.reservationsAll` si cambió ADMIN u OPERATOR, porque cambia `assignedUser.isEligible`. |
| Cabeceras y límites | `Authorization: Bearer <accessToken>` de un ADMIN (lo pone el BFF) y `Content-Type: application/json` (lo pone `apiFetch`) |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | `ParseUUIDPipe` (cualquier versión). Usa el `id` tal como lo devuelve la API: en mayúsculas responde 404. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `roles` | `RoleCode[]` | Sí | `@IsArray()`, `@ArrayMinSize(1)`, `@ArrayUnique()` y cada valor debe ser `ADMIN`, `OWNER`, `OPERATOR` o `SUPPORT`, en mayúsculas. Es la lista final completa. No admite `null`. |

Cualquier otro campo responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
const user = await usersApi.setRoles("d47b2e19-8c3f-4a61-b5d0-7e9f1a2c3b42", ["OWNER", "OPERATOR"]);
```

```json
{
  "roles": ["OWNER", "OPERATOR"]
}
```

**Respuesta**

```json
{
  "id": "d47b2e19-8c3f-4a61-b5d0-7e9f1a2c3b42",
  "firstName": "Jorge",
  "lastName": "Condori",
  "email": "jorge.condori@example.com",
  "isActive": true,
  "lastLoginAt": "2026-11-02T22:31:17.060Z",
  "createdAt": "2026-09-02T16:47:51.902Z",
  "updatedAt": "2026-11-02T22:31:17.061Z",
  "roles": ["OWNER", "OPERATOR"]
}
```

`updatedAt` no cambia: los roles se guardan en otra tabla.

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `each value in roles must be one of the following values: ADMIN, OWNER, OPERATOR, SUPPORT`; `All roles's elements must be unique`; `roles must contain at least 1 elements`; `roles must be an array` (array, en este orden) | `roles` falta, es `null` o no es array (p. ej. `"admin"`, `5` o `{}`): llegan los cuatro; si es un string con un rol válido (`"ADMIN"`), los tres últimos. `[]`: solo `at least 1 elements`. Rol repetido: solo `must be unique`. Un valor fuera del enum dentro del array (p. ej. `["admin"]`): solo `each value in roles…` |
| 400 | `property <campo> should not exist` (array) | El body trae otros campos |
| 400 | Texto del parser JSON (string) | JSON mal formado |
| 400 | `Validation failed (uuid is expected)` (string) | `:id` no es un UUID |
| 400 | `Uno o más roles no están disponibles` (string) | Algún rol no existe en la tabla `roles` (no se ejecutó el seed). Se comprueba antes de buscar al usuario. |
| 400 | `Debes asignar al menos un rol` (string) | Comprobación defensiva del servicio. No llega por HTTP: antes responde la validación `roles must contain at least 1 elements`. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. bk-crm le responde `Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado` o `Sesión no válida o expirada` (token ausente, inválido o vencido; usuario inactivo; sesión revocada o vencida), pero esos textos no llegan al navegador. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario autenticado no tiene el rol ADMIN (OWNER, OPERATOR o SUPPORT) |
| 404 | `Usuario no encontrado` | No existe un usuario con ese `id` |
| 409 | `No se puede retirar el rol al último administrador activo` | El usuario está activo, tiene ADMIN, la lista nueva no incluye `ADMIN` y no hay otro ADMIN activo |
| 409 | `La operación entró en conflicto con otro cambio; inténtalo nuevamente` | Otra transacción simultánea entró en conflicto (transacción `Serializable`). Se puede reintentar. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb |
| 415 | `unsupported charset "<CHARSET>"` | El `Content-Type` declara un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) |

**Efectos**

- Borra los roles del usuario y crea los nuevos en la misma transacción. No cambia `updatedAt`.
- No revoca sesiones. El cambio surte efecto en la siguiente petición del usuario, porque los roles se leen de la base de datos en cada petición. El claim `roles` del JWT queda desactualizado hasta la próxima renovación.
- `assignedUser.isEligible` de sus conversaciones y reservas se recalcula al leerlas: es `true` solo si el usuario está activo y tiene ADMIN u OPERATOR. Las asignaciones existentes no se liberan.
- No comprueba si es el responsable de aprobación del restaurante. Si se le quita OWNER, `PUT /restaurant-config` responde 400 `El responsable de aprobación debe tener el rol OWNER` hasta que se elija otro.

**Notas para el frontend**

- Reemplaza la lista completa, no agrega: para sumar un rol, envía los actuales más el nuevo.
- Un ADMIN puede quitarse su propio rol ADMIN si hay otro ADMIN activo. Desde su siguiente petición, `/users` le responde 403: refresca `qk.me` y la navegación.
- Los roles se validan contra la base de datos antes de buscar al usuario, así que el 400 `Uno o más roles no están disponibles` puede llegar antes que un 404.
- El orden de `roles` en la respuesta no está garantizado.

### Modelos

Las fechas son instantes ISO 8601 en UTC con milisegundos (`IsoDateTime`). Muéstralas en el `timeZone` del restaurante (ver [Fechas](#fechas-zona-horaria-e-importes)).

#### `User`

Lo devuelven todas las rutas `/users`. Sale de `publicUserSelect` y `serializeUser` (`src/users/users.service.ts`).

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Identificador. Prisma lo genera en minúsculas. |
| `firstName` | string | No | Nombre, guardado con `trim`. De 1 a 100 caracteres. |
| `lastName` | string | No | Apellido, guardado con `trim`. De 1 a 100 caracteres. |
| `email` | string | No | Email único, en minúsculas. Es el usuario del login. |
| `isActive` | boolean | No | Si es `false`, no puede iniciar sesión y sus sesiones están revocadas. Los usuarios nuevos empiezan en `true`. |
| `lastLoginAt` | `IsoDateTime` | Sí | Último login exitoso; `null` si nunca inició sesión. El refresh no lo cambia. |
| `createdAt` | `IsoDateTime` | No | Fecha de alta. |
| `updatedAt` | `IsoDateTime` | No | Última modificación de la fila. Cambia con cada login, con `PATCH /users/:id` y `/status` y al restablecer la contraseña (`POST /auth/reset-password`); no cambia con `PATCH /users/:id/roles`. |
| `roles` | `RoleCode[]` | No | Al menos uno, sin repetidos. Orden no garantizado. |

Nunca incluye `password` ni `passwordHash`.

#### `LoginUser`

Va dentro de `LoginResponse` y de la respuesta `{ user }` del BFF.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del usuario |
| `firstName` | string | No | Nombre |
| `lastName` | string | No | Apellido |
| `email` | string | No | Email en minúsculas |
| `roles` | `RoleCode[]` | No | Roles en el momento del login. Orden no garantizado. |

#### `LoginResponse`

201 de `POST /auth/login`. Solo la ve el BFF.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `accessToken` | string | No | JWT HS256 firmado con `JWT_SECRET`. Dura `JWT_EXPIRES_IN` (`15m` en `.env.example`). |
| `refreshToken` | string | No | JWT HS256 firmado con `JWT_REFRESH_SECRET`. Dura `JWT_REFRESH_EXPIRES_IN` (`7d` en `.env.example`). Es de un solo uso. |
| `user` | `LoginUser` | No | Datos del usuario |

#### `RefreshResponse`

201 de `POST /auth/refresh`. Solo la ve el BFF.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `accessToken` | string | No | Access token nuevo, con el email y los roles actuales |
| `refreshToken` | string | No | Refresh token nuevo. El anterior deja de servir. |

#### Claims de los tokens (`AccessTokenClaims`, `RefreshTokenClaims`)

Solo el BFF los lee: decodifica `exp` sin verificar la firma para renovar a tiempo (`src/lib/server/tokens.ts`).

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `sub` | `Uuid` | No | Id del usuario (ambos tokens) |
| `sessionId` | `Uuid` | No | Id de la sesión (ambos tokens) |
| `email` | string | No | Solo en el access token. Email al emitirlo: puede quedar desactualizado. |
| `roles` | `RoleCode[]` | No | Solo en el access token. Roles al emitirlo: pueden quedar desactualizados. |
| `jti` | `Uuid` | No | Solo en el refresh token. Identificador único de cada refresh token. |
| `iat` | number | No | Emisión, en segundos Unix |
| `exp` | number | No | Expiración, en segundos Unix |

#### `MeResponse`

200 de `GET /auth/me`. Sale de `AccessTokenStrategy.validate` (`src/strategies/access-token.strategy.ts`).

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del usuario |
| `sessionId` | `Uuid` | No | Sesión del access token usado |
| `firstName` | string | No | Nombre actual |
| `lastName` | string | No | Apellido actual |
| `email` | string | No | Email actual, en minúsculas |
| `roles` | `RoleCode[]` | No | Roles actuales, leídos de la base de datos. Orden no garantizado. |

#### Respuestas con `message` (`MessageResponse`)

| Ruta | Tipo | `message` |
|---|---|---|
| `POST /auth/logout` | `LogoutResponse` | `Sesión cerrada correctamente` |
| `GET /auth/test-admin` | `TestAdminResponse` | `Acceso autorizado para administrador` |
| `POST /auth/forgot-password` | `ForgotPasswordResponse` | `Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña` |
| `POST /auth/reset-password` | `ResetPasswordResponse` | `Contraseña restablecida correctamente` |

#### `HealthResponse`

200 o 503 de `GET /health`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `status` | `"ok"` o `"error"` | No | `ok` con respuesta 200; `error` con respuesta 503 |
| `services.api` | `"up"` | No | Siempre `up`: si la ruta responde, la API está arriba |
| `services.database` | `"up"` o `"down"` | No | Resultado de `SELECT 1`, con un límite de 3 s |
| `timestamp` | `IsoDateTime` | No | Instante de la comprobación |
| `uptimeSeconds` | number | No | Segundos enteros desde que arrancó el proceso |

#### Respuestas de los handlers del BFF

| Handler | Éxito | Tipo |
|---|---|---|
| `POST /api/auth/login` | 200 `{ user }` y cookies `crm_at` y `crm_rt` | `BffLoginResponse` |
| `POST /api/auth/logout` | Siempre 200 `{ ok: true }`; borra las cookies | `BffLogoutResponse` |
| `POST /api/auth/forgot-password` | 200 `{ message }`, con punto final | `BffForgotPasswordResponse` |
| `POST /api/auth/reset-password` | 200 `{ message }`, con punto final | `BffResetPasswordResponse` |
| `GET /api/listo` | 200 `{ estado: "ok", backend }`; 503 `{ estado: "error", backend, motivo? }` | `ReadyResponse` |

Los errores de los handlers `/api/auth/*` tienen la forma `{ statusCode, message, code? }` (`ApiErrorBody`), con `message` siempre string. El 503 de `/api/listo` no: su body es el propio `ReadyResponse`.

### Estados y transiciones

#### Estado del usuario (`isActive`)

| Valor | Significado |
|---|---|
| `true` | Activo. Puede iniciar sesión, renovar tokens y recuperar su contraseña. Si además tiene ADMIN u OPERATOR, se le pueden asignar conversaciones y reservas. |
| `false` | Inactivo. El login responde 401 `Correo o contraseña incorrectos`, sus tokens 401 `Usuario no autorizado` y `forgot-password` no le envía correo; sus enlaces pendientes responden 400. Sigue apareciendo en `GET /users`. |

| Transición | Ruta | Roles | Reglas y error |
|---|---|---|---|
| Alta → `true` | `POST /users` | ADMIN | Todo usuario nuevo empieza activo |
| `true` → `false` | `PATCH /users/:id/status` con `{ "isActive": false }` | ADMIN | 409 `No se puede desactivar al último administrador activo` si es el único ADMIN activo. Revoca todas sus sesiones. |
| `false` → `true` | `PATCH /users/:id/status` con `{ "isActive": true }` | ADMIN | Siempre permitida. No recupera las sesiones anteriores. |
| Mismo valor | `PATCH /users/:id/status` | ADMIN | Responde 200 y solo cambia `updatedAt` |

- Con otro rol, la respuesta es 403 `No tienes permisos para realizar esta acción`.
- Un conflicto entre transacciones simultáneas responde 409 `La operación entró en conflicto con otro cambio; inténtalo nuevamente`.
- Transiciones automáticas: ninguna. El sistema nunca desactiva usuarios por su cuenta.

#### Roles (`RoleCode`)

| Valor | Nombre en el seed | Descripción en el seed | Acceso (detalle en [Roles](#roles)) |
|---|---|---|---|
| `ADMIN` | Administrador | Acceso completo al CRM | Todo. Es el único rol que gestiona usuarios. |
| `OWNER` | Propietario | Responsable de validación y configuración | Solo lectura en los módulos de negocio. Puede ser el responsable de aprobación del restaurante. |
| `OPERATOR` | Operador | Gestiona calendario, clientes y reservas | Lectura y operación diaria |
| `SUPPORT` | Soporte EYAQ | Acceso técnico, soporte y revisión de errores | Solo `GET /auth/me`, `POST /auth/logout` y las rutas públicas |

- La lista inicial se fija en `POST /users`, y `PATCH /users/:id/roles` la reemplaza entera. Las dos rutas son solo para ADMIN.
- La lista no puede quedar vacía ni repetir roles.
- Si el usuario está activo y es el único ADMIN activo, quitarle ADMIN responde 409 `No se puede retirar el rol al último administrador activo`.
- Transiciones automáticas: ninguna.

#### Sesión (interna)

No se expone como recurso: solo `GET /auth/me` devuelve su `sessionId`.

| Estado | Cómo se llega | Qué responde |
|---|---|---|
| Activa | `POST /auth/login` | Las rutas protegidas aceptan su access token, y `POST /auth/refresh` rota sus tokens |
| Revocada | `POST /auth/logout` (solo esa sesión), `PATCH /users/:id/status` con `false` o `POST /auth/reset-password` (todas las del usuario) | El access token recibe 401 `Sesión no válida o expirada`, o `Usuario no autorizado` si el usuario está inactivo. El refresh recibe 401 `Sesión revocada`. |
| Vencida | Automático, 7 días después del login (el refresh no lo alarga) | El access token recibe 401 `Sesión no válida o expirada` (o `Unauthorized` si el token ya expiró). El refresh recibe 401 `Sesión expirada`, o `Refresh token inválido o expirado` si el propio refresh token también venció (con `JWT_REFRESH_EXPIRES_IN=7d`, el emitido en el login vence casi a la vez que la sesión). |

Una sesión revocada o vencida no vuelve a activarse: hay que iniciar sesión de nuevo.

#### Enlace de recuperación (interno)

| Estado | Cómo se llega | Qué responde `POST /auth/reset-password` |
|---|---|---|
| Pendiente | `POST /auth/forgot-password` de un usuario activo | 200 si el usuario sigue activo; si no, 400 `El enlace de recuperación es inválido o ha expirado` |
| Usado | `POST /auth/reset-password` con éxito | 400 `El enlace de recuperación es inválido o ha expirado` |
| Vencido | Automático, a los `PASSWORD_RESET_TOKEN_TTL_MINUTES` minutos (15 por defecto) | 400, mismo mensaje |
| Borrado | Otro `forgot-password` del mismo usuario, un reset exitoso con otro enlace o un fallo al enviar el correo | 400, mismo mensaje |

#### Salud del servicio (`HealthResponse.status`)

| Valor | `services.database` | Código |
|---|---|---|
| `ok` | `up` | 200 |
| `error` | `down` | 503 |

No hay transiciones por ruta: cada `GET /health` comprueba la base de datos en el momento.

### Preguntas abiertas

1. ¿Qué valores de `JWT_EXPIRES_IN` y `JWT_REFRESH_EXPIRES_IN` usa cada entorno? El README de bk-crm recomienda `15m` y `7d` para producción, igual que `.env.example`. La UI no los necesita, porque el BFF lee `exp` de cada token, pero fijan cada cuánto renueva el BFF y cuánto dura la cookie `crm_rt`.
2. ¿Cuál es la URL base de bk-crm en cada entorno (dev, staging, producción)? ¿Algún proxy añadirá un prefijo como `/api`? En el código no hay prefijo global.
3. ¿Qué valor tendrá `FRONTEND_RESET_PASSWORD_URL` en cada entorno? En producción debe ser `https://<dominio del frontend>/reset-password`, y bk-crm no arranca si no es una URL `https` pública.
4. `GET /auth/test-admin` es un endpoint de prueba. ¿Se mantendrá o se eliminará antes de desplegar, como pide el README de bk-crm para los endpoints temporales?
5. No hay endpoint para listar roles (`RolesModule` está vacío). ¿El frontend debe mantener fija la lista `ADMIN`/`OWNER`/`OPERATOR`/`SUPPORT` con las etiquetas del seed, como hace hoy `ROLE_LABELS`?
6. `GET /users` no tiene paginación, filtros ni búsqueda; el README de bk-crm lo marca como pendiente. ¿Cambiará la respuesta a un `Paginated<User>`?
7. Reutilizar un refresh token que ya rotó devuelve 401 `Refresh token inválido`, pero no revoca la sesión. ¿Es intencional, o se planea revocarla al detectar la reutilización?
8. No hay endpoints para: cambiar la contraseña estando autenticado, que un ADMIN restablezca la contraseña de otro usuario, listar las sesiones o cerrarlas todas, ni enviar invitaciones por correo. ¿Están planificados?
9. El rol SUPPORT no figura en ningún `@Roles`: solo puede usar `/auth/me`, `/auth/logout` y las rutas públicas. En ft-crm no tiene ninguna vista. ¿Es intencional o faltan permisos de soporte?
10. bk-crm permite desactivar al responsable de aprobación o quitarle OWNER sin avisar. Después, `PUT /restaurant-config` responde 400 hasta que se elija otro. El README de bk-crm tiene pendiente definir esta política. ¿La UI debe advertirlo o impedirlo?
11. Desactivar a un usuario, o quitarle ADMIN y OPERATOR, no libera sus conversaciones ni reservas asignadas: quedan con `isEligible: false`. ¿Se deben reasignar? ¿Lo hará el backend o la UI?
12. `GET /users` es solo para ADMIN, así que OWNER y OPERATOR no pueden mostrar el nombre detrás del `authorUserId` de un mensaje ni de los `createdById`, `reviewedById` y `editedById` de un borrador de Samanta. ¿Se añadirá el nombre a la respuesta o un endpoint ligero de usuarios?
13. `password` y `newPassword` admiten hasta 72 caracteres, pero bcrypt solo usa los primeros 72 bytes en UTF-8. Con tildes, `ñ` o emojis, el final de una contraseña larga se ignora sin aviso. ¿El límite debería medirse en bytes, o la UI debería advertirlo?

### Tipos TypeScript

Bloque autocontenido: compila con `tsc --strict` y se puede copiar solo. Usa los nombres de `ft-crm/src/lib/api/types.ts` cuando el concepto ya existe allí. Los tipos compartidos (`Uuid`, `IsoDateTime`, `RoleCode`, `Pagination`, `Paginated<T>`, `ApiErrorBody`, `MessageResponse`) se repiten con la misma definición que ft-crm: en el frontend decláralos una sola vez. La única diferencia está en `ApiErrorBody`: añade los campos opcionales `path`, `method` y `timestamp` del 500, y acota `code` a los tres valores que pone el BFF (`BffErrorCode`).

Tipos nuevos respecto de ft-crm: `RefreshRequest`, `UpdateUserRequest`, `HealthResponse`, `ReadyResponse`, las respuestas con mensaje literal (`LogoutResponse`, `ForgotPasswordResponse`…), los claims de los tokens, los tipos `Bff*` y las uniones de mensajes de error.

```ts
/* =====================================================================
 * bk-crm · Autenticación, sesión, usuarios y salud (01-auth-usuarios.md)
 * Tipos derivados de los DTO, selects y servicios de bk-crm.
 * Los nombres coinciden con ft-crm/src/lib/api/types.ts cuando el concepto
 * ya existe allí. Bloque autocontenido: compila con --strict.
 * ===================================================================== */

/* ------------------------- Compartidos (iguales a ft-crm) ------------------------- */

export type Uuid = string;
/** Instante ISO 8601 en UTC con milisegundos, p. ej. "2026-11-03T15:20:41.233Z". */
export type IsoDateTime = string;

/**
 * Enum `RoleCode` de Prisma. Nombres del seed: ADMIN «Administrador», OWNER «Propietario»,
 * OPERATOR «Operador», SUPPORT «Soporte EYAQ». No hay endpoint para listarlos.
 */
export type RoleCode = "ADMIN" | "OWNER" | "OPERATOR" | "SUPPORT";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  /** 0 cuando total = 0 */
  totalPages: number;
}

/** Envoltorio de los listados paginados de otros módulos. Las rutas de este módulo no paginan. */
export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * Cuerpo de error (filtro global de bk-crm y handlers del BFF).
 * `message` es string[] solo en el 400 de validación de DTO; en el resto, string.
 */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** "Bad Request", "Unauthorized", "Forbidden", "Not Found", "Conflict", "Payload Too Large"…
   * No viene en el 401 genérico ("Unauthorized"), en el 429 ni en el 500. */
  error?: string;
  /** Solo lo añade el BFF de ft-crm. */
  code?: BffErrorCode;
  /** Solo en el 500 de bk-crm: ruta sin query string. */
  path?: string;
  /** Solo en el 500 de bk-crm. */
  method?: string;
  /** Solo en el 500 de bk-crm. */
  timestamp?: IsoDateTime;
}

export interface MessageResponse {
  message: string;
}

/* ------------------------------ Mensajes de error ------------------------------ */

/** 401 posibles en cualquier ruta protegida con access token. */
export type AccessTokenErrorMessage =
  | "Unauthorized"
  | "Token de acceso inválido"
  | "Usuario no autorizado"
  | "Sesión no válida o expirada";

/** 403 del RolesGuard: el usuario no tiene ninguno de los roles exigidos. */
export type ForbiddenMessage = "No tienes permisos para realizar esta acción";

/** 429 de login, forgot-password y reset-password (sin `error`; cabecera Retry-After). */
export type ThrottleErrorMessage = "ThrottlerException: Too Many Requests";

/** 413 del parser: body de más de 100 kb. */
export type PayloadTooLargeMessage = "El cuerpo de la petición supera el tamaño máximo permitido";

/** 400 de ParseUUIDPipe en las rutas /users/:id. */
export type InvalidUuidMessage = "Validation failed (uuid is expected)";

/** 500 del filtro global. */
export type InternalErrorMessage = "Ocurrió un error interno";

/* ----------------------------------- Raíz ----------------------------------- */

/** GET / responde texto (`text/html; charset=utf-8`), no JSON. */
export type AppRootResponse = "Hello World!";

/* ------------------------------ Autenticación ------------------------------ */

/** Body de POST /auth/login. */
export interface LoginRequest {
  /** Email válido, sin espacios alrededor; bk-crm lo pasa a minúsculas para buscar. */
  email: string;
  /** Mínimo 8 caracteres; el DTO no fija máximo (el BFF de ft-crm limita a 200). */
  password: string;
}

/** Usuario dentro de la respuesta del login. */
export interface LoginUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  /** En minúsculas. */
  email: string;
  /** Orden no garantizado. */
  roles: RoleCode[];
}

/** 201 de POST /auth/login (bk-crm → BFF). El navegador nunca la ve completa. */
export interface LoginResponse {
  /** JWT HS256 firmado con JWT_SECRET; dura JWT_EXPIRES_IN. */
  accessToken: string;
  /** JWT firmado con JWT_REFRESH_SECRET; dura JWT_REFRESH_EXPIRES_IN; un solo uso. */
  refreshToken: string;
  user: LoginUser;
}

export type LoginErrorMessage = "Correo o contraseña incorrectos";

/** Body de POST /auth/refresh (solo lo envía el BFF). */
export interface RefreshRequest {
  /** Último refresh token emitido para la sesión. */
  refreshToken: string;
}

/** 201 de POST /auth/refresh: reemplaza ambos tokens. */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** 401 posibles en POST /auth/refresh. */
export type RefreshErrorMessage =
  | "Refresh token inválido o expirado"
  | "Sesión no válida"
  | "Sesión revocada"
  | "Sesión expirada"
  | "Refresh token inválido"
  | "Usuario no autorizado"
  | "Refresh token ya utilizado o sesión no válida";

/** 201 de POST /auth/logout. */
export interface LogoutResponse extends MessageResponse {
  message: "Sesión cerrada correctamente";
}

/** 200 de GET /auth/me: datos y roles actuales, leídos de la base de datos en cada petición. */
export interface MeResponse {
  id: Uuid;
  /** Sesión del access token usado. */
  sessionId: Uuid;
  firstName: string;
  lastName: string;
  /** En minúsculas. */
  email: string;
  /** Orden no garantizado. */
  roles: RoleCode[];
}

/** 200 de GET /auth/test-admin (endpoint de prueba, bloqueado por el BFF). */
export interface TestAdminResponse extends MessageResponse {
  message: "Acceso autorizado para administrador";
}

/** Claims del access token. Solo el BFF lee `exp` (sin verificar la firma) para renovar a tiempo. */
export interface AccessTokenClaims {
  /** Id del usuario. */
  sub: Uuid;
  sessionId: Uuid;
  /** Email al emitir el token: puede quedar desactualizado. */
  email: string;
  /** Roles al emitir el token: pueden quedar desactualizados. Usa GET /auth/me. */
  roles: RoleCode[];
  /** Emisión, en segundos Unix. */
  iat: number;
  /** Expiración, en segundos Unix. */
  exp: number;
}

/** Claims del refresh token. */
export interface RefreshTokenClaims {
  sub: Uuid;
  sessionId: Uuid;
  /** Identificador único de cada refresh token emitido. */
  jti: Uuid;
  iat: number;
  exp: number;
}

/** Body de POST /auth/forgot-password. */
export interface ForgotPasswordRequest {
  /** Email válido, sin espacios alrededor. El DTO declara máximo 320, pero @IsEmail() ya limita a 254. */
  email: string;
}

/** 200 de POST /auth/forgot-password: siempre la misma, exista o no el correo. */
export interface ForgotPasswordResponse extends MessageResponse {
  message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña";
}

/** Body de POST /auth/reset-password. */
export interface ResetPasswordRequest {
  /** Parámetro `token` del enlace, sin modificar: 64 caracteres hexadecimales en minúsculas. */
  token: string;
  /** 8 a 72 caracteres. */
  newPassword: string;
}

/** 200 de POST /auth/reset-password. */
export interface ResetPasswordResponse extends MessageResponse {
  message: "Contraseña restablecida correctamente";
}

/** 400 en POST /auth/reset-password. */
export type ResetPasswordErrorMessage =
  | "El token de recuperación no tiene un formato válido"
  | "El enlace de recuperación es inválido o ha expirado";

/* ---------------------------------- Salud ---------------------------------- */

export type HealthStatus = "ok" | "error";
export type HealthServiceStatus = "up" | "down";

/** GET /health: 200 con status "ok" o 503 con status "error" (el 503 no trae `message`). */
export interface HealthResponse {
  status: HealthStatus;
  services: {
    api: "up";
    database: HealthServiceStatus;
  };
  timestamp: IsoDateTime;
  /** Segundos enteros desde que arrancó el proceso. */
  uptimeSeconds: number;
}

/* --------------------------------- Usuarios --------------------------------- */

/** Usuario de todas las rutas /users. Nunca incluye la contraseña ni su hash. */
export interface User {
  id: Uuid;
  firstName: string;
  lastName: string;
  /** Siempre en minúsculas. */
  email: string;
  isActive: boolean;
  /** null hasta el primer inicio de sesión. */
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  /** Cambia con cada login (lastLoginAt), con cada PATCH /users/:id o /status y al restablecer la contraseña; no al reemplazar roles. */
  updatedAt: IsoDateTime;
  /** Al menos uno; orden no garantizado. */
  roles: RoleCode[];
}

/** 200 de GET /users: todos los usuarios, sin paginar, por createdAt desc. */
export type UserListResponse = User[];

/** Body de POST /users (201 · User). */
export interface CreateUserRequest {
  /** 1 a 100 caracteres (antes del trim), al menos uno no blanco; se guarda con trim. */
  firstName: string;
  /** 1 a 100 caracteres (antes del trim), al menos uno no blanco; se guarda con trim. */
  lastName: string;
  /** Email válido sin espacios alrededor (máximo 254 en la práctica); único; se guarda en minúsculas. */
  email: string;
  /** 8 a 72 caracteres; no se recorta. */
  password: string;
  /** Al menos uno, sin repetidos. */
  roles: RoleCode[];
}

/**
 * Body de PATCH /users/:id (200 · User). Envía al menos un campo.
 * Los que no cambian se omiten: nunca `null` ni "".
 */
export interface UpdateUserRequest {
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  firstName?: string;
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  lastName?: string;
  /** Email válido sin espacios alrededor; único; se guarda en minúsculas. */
  email?: string;
}

/** Body de PATCH /users/:id/status (200 · User). */
export interface UpdateUserStatusRequest {
  /** Booleano JSON real. `false` revoca todas las sesiones del usuario. */
  isActive: boolean;
}

/** Body de PATCH /users/:id/roles (200 · User). Reemplaza la lista completa. */
export interface UpdateUserRolesRequest {
  /** Al menos uno, sin repetidos. */
  roles: RoleCode[];
}

export type UserNotFoundMessage = "Usuario no encontrado";

/** 400 de negocio en las rutas /users (además de los de validación). */
export type UserBadRequestMessage =
  | "Debes proporcionar al menos un campo para actualizar"
  | "Uno o más roles no están disponibles"
  | "Debes asignar al menos un rol";

/** 409 posibles en las rutas /users. */
export type UserConflictMessage =
  | "Ya existe un usuario registrado con este correo"
  | "No se puede desactivar al último administrador activo"
  | "No se puede retirar el rol al último administrador activo"
  | "La operación entró en conflicto con otro cambio; inténtalo nuevamente";

/* ------------------------- Handlers del BFF de ft-crm ------------------------- */

/** `code` que añade el BFF; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/** 200 de POST /api/auth/login (además fija las cookies httpOnly crm_at y crm_rt). */
export interface BffLoginResponse {
  user: LoginUser;
}

/** 200 de POST /api/auth/logout (siempre; borra las cookies). */
export interface BffLogoutResponse {
  ok: true;
}

/** 200 de POST /api/auth/forgot-password: texto del BFF, con punto final. */
export interface BffForgotPasswordResponse extends MessageResponse {
  message: "Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.";
}

/** 200 de POST /api/auth/reset-password: texto del BFF, con punto final. */
export interface BffResetPasswordResponse extends MessageResponse {
  message: "Contraseña restablecida correctamente.";
}

/** GET /api/listo: 200 si bk-crm responde GET /health con 2xx (o en modo mock); 503 si no. */
export type ReadyResponse =
  | { estado: "ok"; backend: "disponible" | "simulado" }
  | { estado: "error"; backend: string; motivo?: "timeout" | "network" | "error" };
```

Las funciones y la clave de caché propuestas para `src/lib/api/` están en [Ver el detalle de un usuario](#ver-el-detalle-de-un-usuario).

## Parte 02: Configuración del restaurante y catálogo comercial

> Parte de la [referencia de la API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend). Estado: 3 de noviembre de 2026.
>
> Desde el navegador, cada ruta se pide con `apiFetch` como `/api/backend<ruta>` y el BFF añade el token (ver [Arquitectura](#arquitectura-navegador--bff--bk-crm)). Las convenciones comunes (formato de errores, sesión, roles, paginación, fechas e importes) están en el [README](#convenciones-generales) y aquí no se repiten.

Este módulo gestiona la ficha global del restaurante (contacto, políticas, idiomas y horario semanal) y el catálogo comercial: categorías y elementos (platos, bebidas, servicios, promociones y eventos) con variantes, imágenes, FAQs, horarios y detalles de promoción o evento.

En ft-crm lo usan las pestañas de Ajustes (Empresa, Horarios, Políticas, Samanta y Servicios) y `useRestaurant()`, que da la zona horaria y la moneda a toda la app. El catálogo también alimenta a Samanta y a los elementos que se eligen en solicitudes, reservas e intereses de clientes.

**Reglas comunes a las 13 rutas**

- Todas exigen sesión. Leer: ADMIN, OWNER y OPERATOR. Escribir: solo ADMIN. SUPPORT recibe 403 en todas (ver [Roles](#roles)).
- No usan cabeceras propias. El BFF añade `Authorization: Bearer` y `apiFetch` añade `Content-Type: application/json` cuando hay body. Sin ese `Content-Type`, el body no se interpreta y la respuesta es 400 como si faltaran todos los campos.
- No tienen límite de intentos (nunca responden 429) ni piden `Idempotency-Key`.
- El body admite hasta 100 kb; si se supera, 413. Solo un elemento comercial con muchas variantes, FAQs o textos largos puede acercarse a ese tamaño.
- Un `Content-Type` con un `charset` que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) responde 415 (con `charset=latin1`: `unsupported charset "LATIN1"`). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre.
- Los 401 de bk-crm (`Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado`, `Sesión no válida o expirada`) no llegan al navegador. El BFF renueva la sesión y repite la llamada; si no puede, responde 401 `Tu sesión terminó. Vuelve a iniciar sesión.` (`code: "SESSION_EXPIRED"`). Sin cookies responde 401 `Inicia sesión para continuar.` (`code: "NO_SESSION"`). Ver [Sesión](#sesión-srclibserversessionts).
- Si bk-crm no responde en 15 s (`CRM_BACKEND_TIMEOUT_MS`, valor por defecto), el BFF responde 504 `BACKEND_UNAVAILABLE`; si no hay conexión, 503 con el mismo `code` (ver [Errores que añade el BFF](#errores-que-añade-el-bff)).
- Si la base de datos rechaza una restricción `CHECK`, Prisma 7 lo informa como `P2039`, ningún servicio lo traduce y la respuesta es 500 `Ocurrió un error interno`. Las validaciones previas lo evitan, salvo en los casos que indica cada ruta. Prisma 7 ya no emite `P2004`: los mensajes que los servicios reservan para ese código no llegan nunca.
- Los máximos de texto los cuenta class-validator, que toma un emoji con selector de variante (`❤️`) como 1 carácter; PostgreSQL lo cuenta como 2. Un texto al límite con esos emojis en una columna de largo fijo (nombres, `address`, `altTextEs`, `questionEs`…) no cabe y responde 500 (Prisma `P2000`, sin traducir). El `maxLength` del navegador y el `.max()` de zod cuentan unidades UTF-16 y lo evitan.
- Los textos se recortan (trim) antes de validar. Un texto opcional vacío o con solo espacios da 400: para borrarlo, envía `null`.
- Los UUID del body y de la query (`categoryId`, `approvalResponsibleId`) deben tener versión 1 a 8 y variante RFC (también pasan el nulo y el máximo); si no, `<campo> must be a UUID`. Los `:id` de la ruta aceptan cualquier 8-4-4-4-12 hexadecimal. Los ids que genera el backend (v4) cumplen ambas reglas.
- Importes: strings con hasta 2 decimales. La respuesta siempre trae 2 (`"25"` → `"25.00"`).
- Ninguna escritura guarda auditoría (quién cambió qué): está pendiente (`TODO`) en los servicios. Solo queda el `updatedAt` del recurso.
- Los ejemplos usan datos ficticios.

### Índice

- [Integración con ft-crm](#integración-con-ft-crm)
- [Obtener la configuración del restaurante](#obtener-la-configuración-del-restaurante) — `GET /restaurant-config`
- [Guardar la configuración del restaurante (crear o reemplazar)](#guardar-la-configuración-del-restaurante-crear-o-reemplazar) — `PUT /restaurant-config`
- [Crear categoría comercial](#crear-categoría-comercial) — `POST /commercial-categories`
- [Listar categorías comerciales](#listar-categorías-comerciales) — `GET /commercial-categories`
- [Ver detalle de una categoría comercial](#ver-detalle-de-una-categoría-comercial) — `GET /commercial-categories/:id`
- [Editar categoría comercial](#editar-categoría-comercial) — `PATCH /commercial-categories/:id`
- [Activar o desactivar una categoría comercial](#activar-o-desactivar-una-categoría-comercial) — `PATCH /commercial-categories/:id/status`
- [Crear elemento comercial](#crear-elemento-comercial) — `POST /commercial-items`
- [Listar elementos comerciales](#listar-elementos-comerciales) — `GET /commercial-items`
- [Ver detalle de un elemento comercial](#ver-detalle-de-un-elemento-comercial) — `GET /commercial-items/:id`
- [Editar elemento comercial](#editar-elemento-comercial) — `PATCH /commercial-items/:id`
- [Activar o desactivar un elemento comercial](#activar-o-desactivar-un-elemento-comercial) — `PATCH /commercial-items/:id/status`
- [Cambiar la aprobación de un elemento comercial](#cambiar-la-aprobación-de-un-elemento-comercial) — `PATCH /commercial-items/:id/approval`
- [Modelos](#modelos-1)
- [Estados y transiciones](#estados-y-transiciones-1)
- [Preguntas abiertas](#preguntas-abiertas-2)
- [Tipos TypeScript](#tipos-typescript-1)

### Integración con ft-crm

Funciones de `src/lib/api/endpoints.ts` y claves de `src/lib/api/query-keys.ts` para cada ruta:

| Ruta | Función | Estado | Caché |
|---|---|---|---|
| `GET /restaurant-config` | `configApi.get()` | existe | `qk.config` |
| `PUT /restaurant-config` | `configApi.put(body)` | existe | `setQueryData(qk.config, respuesta)` |
| `POST /commercial-categories` | `catalogApi.createCategory(body)` | nueva | invalida `qk.categories` |
| `GET /commercial-categories` | `catalogApi.categories()` | existe | `qk.categories` |
| `GET /commercial-categories/:id` | `catalogApi.category(id)` | nueva | `qk.category(id)` (nueva) |
| `PATCH /commercial-categories/:id` | `catalogApi.updateCategory(id, body)` | nueva | invalida `qk.categories` y `qk.itemsAll` |
| `PATCH /commercial-categories/:id/status` | `catalogApi.setCategoryActive(id, isActive)` | nueva | invalida `qk.categories` y `qk.itemsAll` |
| `POST /commercial-items` | `catalogApi.create(body)` | existe (ampliar su tipo de body) | invalida `qk.itemsAll` |
| `GET /commercial-items` | `catalogApi.items(query)` | existe | `qk.items(query)` |
| `GET /commercial-items/:id` | `catalogApi.item(id)` | nueva | `qk.item(id)` (nueva) |
| `PATCH /commercial-items/:id` | `catalogApi.update(id, body)` | nueva | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll` |
| `PATCH /commercial-items/:id/status` | `catalogApi.setActive(id, isActive)` | existe | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll` |
| `PATCH /commercial-items/:id/approval` | `catalogApi.setApproval(id, approvalStatus)` | existe | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll` |

Propuesta para las funciones y claves que faltan, con el mismo estilo que el resto de `endpoints.ts` (los tipos están en [Tipos TypeScript](#tipos-typescript-1)):

```ts
// src/lib/api/endpoints.ts: se añaden a catalogApi
export const catalogApi = {
  // …funciones actuales: categories, items, create, setActive, setApproval
  category: (id: string) => apiFetch<CommercialCategory>(`/commercial-categories/${id}`),
  createCategory: (body: CreateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>("/commercial-categories", { method: "POST", body }),
  updateCategory: (id: string, body: UpdateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}`, { method: "PATCH", body }),
  setCategoryActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}/status`, {
      method: "PATCH",
      body: { isActive } satisfies UpdateCommercialCategoryStatusRequest,
    }),
  item: (id: string) => apiFetch<CommercialItem>(`/commercial-items/${id}`),
  update: (id: string, body: UpdateCommercialItemRequest) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}`, { method: "PATCH", body }),
};

// src/lib/api/query-keys.ts: claves nuevas
export const qk = {
  // …claves actuales
  category: (id: string) => ["commercial-categories", "detail", id] as const,
  item: (id: string) => ["commercial-items", "detail", id] as const,
};
```

- Las claves de detalle cuelgan de `qk.categories` y `qk.itemsAll`: invalidar esos prefijos también refresca los detalles.
- `qk.items(query)` no lleva el segmento `"list"`. El detalle usa `"detail"` para no confundirse con el objeto de query.
- El detalle de cliente (en `interests`), las solicitudes y las reservas traen un resumen `commercialItem` (`id`, `nameEs`, `nameEn`, `type`, `isActive`, `approvalStatus`). Si una pantalla lo muestra, después de editar, activar o aprobar un elemento invalida también `qk.customersAll`, `qk.requestsAll` y `qk.reservationsAll`.

### Obtener la configuración del restaurante
`GET /restaurant-config`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `RestaurantConfig` |
| ft-crm | `configApi.get(): Promise<RestaurantConfig>` — existe. La consulta vive en `useRestaurant()` (`src/lib/restaurant.tsx`) y la comparten todas las pestañas de Ajustes. |
| Caché | `qk.config` (`["restaurant-config"]`). |

No tiene parámetros de ruta, query ni body. Si se envía query, se ignora.

**Respuesta**

```json
{
  "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e",
  "businessName": "Fogón Andino",
  "logoUrl": "https://cdn.example.com/fogon-andino/logo.png",
  "description": "Cocina peruana y parrillas al carbón.",
  "address": "Calle Las Begonias 120, San Isidro, Lima",
  "latitude": -12.0951234,
  "longitude": -77.0345678,
  "whatsappNumber": "+51987654321",
  "email": "reservas@example.com",
  "website": "https://www.example.com",
  "currency": "PEN",
  "timeZone": "America/Lima",
  "reservationPolicy": "Las reservas están sujetas a disponibilidad.",
  "cancellationPolicy": "Las cancelaciones deben solicitarse con 2 horas de anticipación.",
  "responseTimeoutMinutes": 15,
  "approvalResponsibleId": "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f",
  "approvalResponsible": {
    "id": "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f",
    "firstName": "Rosa",
    "lastName": "Huamán",
    "email": "rosa.huaman@example.com"
  },
  "languages": ["ES", "EN"],
  "schedules": [
    { "dayOfWeek": "MONDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "TUESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "WEDNESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "THURSDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "FRIDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SATURDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SUNDAY", "isOpen": false, "openTime": null, "closeTime": null }
  ],
  "createdAt": "2026-09-02T15:10:42.117Z",
  "updatedAt": "2026-10-28T21:04:37.502Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR (p. ej. solo SUPPORT). |
| 404 | `Configuración del restaurante no encontrada` | Aún no se guardó ninguna configuración con `PUT /restaurant-config`. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**
- Es un recurso único: no tiene `:id`, `POST` ni `DELETE`. Existe (200) o no existe (404).
- Un 404 significa «restaurante sin configurar», no un fallo. A ADMIN muéstrale el formulario inicial y a OWNER u OPERATOR un aviso. No reintentes un 404: `useRestaurant()` ya lo excluye del `retry`, y `ConfigGate` (`src/features/ajustes/config/config-ui.tsx`) distingue cargando, 404 y error.
- `timeZone` y `currency` sirven a toda la app. Muestra las fechas en esa zona, no en la del navegador (ver [Fechas](#fechas-zona-horaria-e-importes)). Sin configuración, ft-crm usa `America/Lima` (`DEFAULT_TIME_ZONE`) y `PEN`.
- `languages` llega ordenado `ES`, `EN`, `PT`, y `schedules` de `MONDAY` a `SUNDAY`. Una configuración guardada por la API siempre tiene los 7 días.
- `latitude` y `longitude` son `number` o `null`, nunca strings.
- `approvalResponsible` solo trae `id`, `firstName`, `lastName` y `email`, y es `null` si no hay responsable. OWNER y OPERATOR solo pueden ver su nombre aquí, porque `GET /users` es solo para ADMIN.
- Sin configuración fallan otras rutas: crear solicitudes o reservas responde 409 `Configura el restaurante antes de crear solicitudes o reservas`, y generar un borrador de Samanta responde 409 `Configura el restaurante antes de usar Samanta`.
- Hoy ningún proceso del backend usa `logoUrl`, `website`, `latitude`, `longitude`, `whatsappNumber`, `email`, `responseTimeoutMinutes` ni `approvalResponsibleId`: se guardan y se devuelven solo para la UI.

### Guardar la configuración del restaurante (crear o reemplazar)
`PUT /restaurant-config`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `RestaurantConfig`, también la primera vez (nunca 201) |
| ft-crm | `configApi.put(body: PutRestaurantConfigRequest): Promise<RestaurantConfig>` — existe. La llama `useConfigSave()` (`src/features/ajustes/config/use-config-save.ts`): relee la configuración y arma el body con `toPutRequest()`. |
| Caché | `setQueryData(qk.config, respuesta)`: actualiza la zona horaria y la moneda de toda la app sin otro GET. |

**Body**

Es un reemplazo completo: cada PUT envía la configuración entera.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `businessName` | string | Sí | Se recorta. De 1 a 150 caracteres. No admite `null`. |
| `logoUrl` | string \| null | No | Se recorta. URL con protocolo `http://` o `https://` obligatorio y un host con dominio de nivel superior (`https://cdn.example.com/logo.png`) o una IP. `localhost`, `ftp://` o sin protocolo dan 400. Máx. 2048. Omitido o `null` → se guarda `null`. `""` → 400. |
| `description` | string \| null | No | Se recorta. De 1 a 2000. Omitido o `null` → `null`. `""` o solo espacios → 400. |
| `address` | string | Sí | Se recorta. De 1 a 300. |
| `latitude` | number \| null | Junto con `longitude` | Número JSON (un string da 400), finito, con hasta 7 decimales, de −90 a 90. Si envías una coordenada, la otra es obligatoria. Las dos omitidas o `null` → sin coordenadas. |
| `longitude` | number \| null | Junto con `latitude` | Número JSON, finito, con hasta 7 decimales, de −180 a 180. |
| `whatsappNumber` | string | Sí | Se recorta. Formato E.164: `+`, un primer dígito de 1 a 9 y de 8 a 15 dígitos en total, sin espacios ni guiones (`^\+[1-9]\d{7,14}$`, p. ej. `+51987654321`). Máx. 16. |
| `email` | string | Sí | Se recorta y pasa a minúsculas antes de validar. Email válido. El DTO declara un máximo de 320, pero el validador rechaza más de 254 caracteres (o más de 64 antes de la `@`). |
| `website` | string \| null | No | Mismas reglas que `logoUrl`. |
| `currency` | `CurrencyCode` | Sí | `PEN` o `USD`, en mayúsculas. |
| `timeZone` | string | Sí | Se recorta. Zona IANA que acepte `Intl` (p. ej. `America/Lima` o `UTC`). Máx. 64. Se guarda tal como llega: `america/lima` también pasa y se guarda en minúsculas. |
| `reservationPolicy` | string | Sí | Se recorta. De 1 a 5000. |
| `cancellationPolicy` | string | Sí | Se recorta. De 1 a 5000. |
| `responseTimeoutMinutes` | integer | Sí | Entero de 1 a 1440 (minutos). Se convierte con `Number()`: `"15"` → 15; `""` y `null` dan 400. |
| `approvalResponsibleId` | `Uuid` \| null | No | UUID de un usuario existente, activo y con rol OWNER. Omitido o `null` → sin responsable. `""` → 400. |
| `languages` | `LanguageCode[]` | Sí | Array de 1 a 3 valores distintos: `ES`, `EN`, `PT` (en mayúsculas). El orden no importa: se devuelven como `ES`, `EN`, `PT`. |
| `schedules` | `RestaurantScheduleInput[]` | Sí | Exactamente 7 objetos, uno por día (`dayOfWeek` sin repetir). El orden no importa. |
| `schedules[].dayOfWeek` | `DayOfWeek` | Sí | `MONDAY` … `SUNDAY`. |
| `schedules[].isOpen` | boolean | Sí | Booleano JSON (`"true"` → 400). |
| `schedules[].openTime` | `HhMm` \| null | Si `isOpen` es `true` | `HH:mm` de 24 h (`00:00` a `23:59`), anterior a `closeTime`. No se recorta: `" 09:00"` da 400. Con `isOpen: false`, omítelo o envía `null`. |
| `schedules[].closeTime` | `HhMm` \| null | Si `isOpen` es `true` | `HH:mm`, posterior a `openTime`. No puede cruzar la medianoche y `24:00` no existe: el cierre más tardío es `23:59`. Con `isOpen: false`, omítelo o envía `null`. |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist` (p. ej. `id`, `approvalResponsible`, `createdAt`, `updatedAt`). Dentro de un horario: `schedules.<i>.property <campo> should not exist`. |

**Ejemplo de petición**

La pestaña Políticas cambia solo la política de cancelación. `useConfigSave()` relee la configuración, aplica el cambio y envía el objeto completo:

```ts
const current = await configApi.get();
const body: PutRestaurantConfigRequest = {
  ...toPutRequest(current),
  cancellationPolicy: "Las cancelaciones deben solicitarse con 3 horas de anticipación.",
};
const saved = await configApi.put(body);
queryClient.setQueryData(qk.config, saved);
```

`PUT /api/backend/restaurant-config`:

```json
{
  "businessName": "Fogón Andino",
  "logoUrl": "https://cdn.example.com/fogon-andino/logo.png",
  "description": "Cocina peruana y parrillas al carbón.",
  "address": "Calle Las Begonias 120, San Isidro, Lima",
  "latitude": -12.0951234,
  "longitude": -77.0345678,
  "whatsappNumber": "+51987654321",
  "email": "reservas@example.com",
  "website": "https://www.example.com",
  "currency": "PEN",
  "timeZone": "America/Lima",
  "reservationPolicy": "Las reservas están sujetas a disponibilidad.",
  "cancellationPolicy": "Las cancelaciones deben solicitarse con 3 horas de anticipación.",
  "responseTimeoutMinutes": 15,
  "approvalResponsibleId": "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f",
  "languages": ["ES", "EN"],
  "schedules": [
    { "dayOfWeek": "MONDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "TUESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "WEDNESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "THURSDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "FRIDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SATURDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SUNDAY", "isOpen": false, "openTime": null, "closeTime": null }
  ]
}
```

La primera configuración (formulario inicial, `mode: "create"`) también es un PUT completo. ft-crm la envía con los 7 días cerrados, sin coordenadas y sin responsable. Un body mínimo válido puede omitir los opcionales:

```json
{
  "businessName": "Fogón Andino",
  "address": "Calle Las Begonias 120, San Isidro, Lima",
  "whatsappNumber": "+51987654321",
  "email": " Reservas@Example.com ",
  "currency": "PEN",
  "timeZone": "America/Lima",
  "reservationPolicy": "Las reservas están sujetas a disponibilidad.",
  "cancellationPolicy": "Las cancelaciones deben solicitarse con 2 horas de anticipación.",
  "responseTimeoutMinutes": "30",
  "languages": ["PT", "ES"],
  "schedules": [
    { "dayOfWeek": "SUNDAY", "isOpen": false },
    { "dayOfWeek": "MONDAY", "isOpen": false },
    { "dayOfWeek": "TUESDAY", "isOpen": false },
    { "dayOfWeek": "WEDNESDAY", "isOpen": false },
    { "dayOfWeek": "THURSDAY", "isOpen": false },
    { "dayOfWeek": "FRIDAY", "isOpen": false },
    { "dayOfWeek": "SATURDAY", "isOpen": false }
  ]
}
```

Con ese body se guarda `email: "reservas@example.com"`, `responseTimeoutMinutes: 30`, `languages: ["ES", "PT"]`, los días de lunes a domingo y `logoUrl`, `description`, `website`, las coordenadas y `approvalResponsibleId` en `null`.

**Respuesta**

La respuesta al ejemplo de la pestaña Políticas: lo guardado, con los textos recortados, el email en minúsculas y los idiomas y días ordenados.

```json
{
  "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e",
  "businessName": "Fogón Andino",
  "logoUrl": "https://cdn.example.com/fogon-andino/logo.png",
  "description": "Cocina peruana y parrillas al carbón.",
  "address": "Calle Las Begonias 120, San Isidro, Lima",
  "latitude": -12.0951234,
  "longitude": -77.0345678,
  "whatsappNumber": "+51987654321",
  "email": "reservas@example.com",
  "website": "https://www.example.com",
  "currency": "PEN",
  "timeZone": "America/Lima",
  "reservationPolicy": "Las reservas están sujetas a disponibilidad.",
  "cancellationPolicy": "Las cancelaciones deben solicitarse con 3 horas de anticipación.",
  "responseTimeoutMinutes": 15,
  "approvalResponsibleId": "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f",
  "approvalResponsible": {
    "id": "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f",
    "firstName": "Rosa",
    "lastName": "Huamán",
    "email": "rosa.huaman@example.com"
  },
  "languages": ["ES", "EN"],
  "schedules": [
    { "dayOfWeek": "MONDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "TUESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "WEDNESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "THURSDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "FRIDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SATURDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:30" },
    { "dayOfWeek": "SUNDAY", "isOpen": false, "openTime": null, "closeTime": null }
  ],
  "createdAt": "2026-09-02T15:10:42.117Z",
  "updatedAt": "2026-11-03T16:42:08.215Z"
}
```

**Errores**

Los errores de validación llegan juntos en el array `message`; casi todos empiezan por el campo (`schedules.<i>.` en los horarios, donde `<i>` es la posición en el array). Las excepciones nombran el campo dentro del texto: `each value in languages …`, `All languages's elements must be unique` y `All schedules's elements must be unique`.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Campo no declarado, p. ej. al reenviar el GET tal cual (`id`, `approvalResponsible`, `createdAt`, `updatedAt`). En un horario: `schedules.<i>.property <campo> should not exist`. |
| 400 | `businessName must be a string` · `businessName should not be empty` · `businessName must be shorter than or equal to 150 characters` | `businessName` falta, no es string, queda vacío al recortarlo o pasa de 150. |
| 400 | `logoUrl must be a URL address` · `logoUrl must be shorter than or equal to 2048 characters` | `logoUrl` es `""`, no usa `http(s)://`, no tiene dominio con extensión ni IP (p. ej. `localhost`) o pasa de 2048. |
| 400 | `website must be a URL address` · `website must be shorter than or equal to 2048 characters` | Lo mismo con `website`. |
| 400 | `description must be a string` · `description should not be empty` · `description must be shorter than or equal to 2000 characters` | `description` no es string, es `""` o solo espacios, o pasa de 2000. |
| 400 | `address must be a string` · `address should not be empty` · `address must be shorter than or equal to 300 characters` | `address` falta, no es string, queda vacío o pasa de 300. |
| 400 | `latitude must be a number conforming to the specified constraints` · `latitude must not be less than -90` · `latitude must not be greater than 90` | Se envió `longitude` sin `latitude` (salen los tres), o `latitude` es un string, tiene más de 7 decimales o está fuera de rango. |
| 400 | `longitude must be a number conforming to the specified constraints` · `longitude must not be less than -180` · `longitude must not be greater than 180` | Lo mismo con `longitude`. |
| 400 | `whatsappNumber must be a string` · `whatsappNumber debe usar formato internacional E.164` · `whatsappNumber must be shorter than or equal to 16 characters` | No es string o no cumple E.164 (espacios, guiones, sin `+`, longitud). |
| 400 | `email must be an email` · `email must be shorter than or equal to 320 characters` | Email inválido, también si pasa de 254 caracteres o de 64 antes de la `@`. |
| 400 | `currency must be one of the following values: PEN, USD` | Falta o tiene otro valor. |
| 400 | `timeZone must be a string` · `timeZone should not be empty` · `timeZone must be a valid IANA time-zone` · `timeZone must be shorter than or equal to 64 characters` | Falta, está vacía, `Intl` no la reconoce o pasa de 64. |
| 400 | `reservationPolicy must be a string` · `reservationPolicy should not be empty` · `reservationPolicy must be shorter than or equal to 5000 characters` | Falta, no es string, queda vacía o pasa de 5000. |
| 400 | `cancellationPolicy must be a string` · `cancellationPolicy should not be empty` · `cancellationPolicy must be shorter than or equal to 5000 characters` | Lo mismo con `cancellationPolicy`. |
| 400 | `responseTimeoutMinutes must be an integer number` · `responseTimeoutMinutes must not be less than 1` · `responseTimeoutMinutes must not be greater than 1440` | Falta, es `null` o `""`, no es entero o está fuera de 1 a 1440. |
| 400 | `approvalResponsibleId must be a UUID` | No es un UUID (también con `""`). |
| 400 | `languages must be an array` · `languages must contain at least 1 elements` · `languages must contain no more than 3 elements` · `All languages's elements must be unique` · `each value in languages must be one of the following values: ES, EN, PT` | Falta, no es un array, está vacío, tiene más de 3, repite un idioma o trae un valor distinto (también en minúsculas). |
| 400 | `schedules must be an array` · `schedules must contain at least 7 elements` · `schedules must contain no more than 7 elements` · `All schedules's elements must be unique` | Falta, no es un array, no tiene exactamente 7 elementos o repite un día. |
| 400 | `each value in nested property schedules must be either object or array` · `schedules.each value in nested property schedules must be either object or array` | `schedules` no es un array de objetos. El segundo mensaje sale cuando un elemento es `null` o un valor simple. |
| 400 | `schedules.<i>.dayOfWeek must be one of the following values: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY` | Día inválido. |
| 400 | `schedules.<i>.isOpen must be a boolean value` | `isOpen` falta o no es un booleano JSON. |
| 400 | `schedules.<i>.Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas` | Día abierto sin horas, con horas iguales o con el cierre antes de la apertura (cruzar la medianoche), o día cerrado con horas. |
| 400 | `schedules.<i>.openTime must be a string` · `schedules.<i>.openTime debe tener el formato HH:mm` · `schedules.<i>.closeTime must be a string` · `schedules.<i>.closeTime debe tener el formato HH:mm` | Hora que no es string o no cumple `HH:mm` (p. ej. `9:00`, `24:00` o con espacios). Llega junto con el mensaje anterior. |
| 400 | `latitude y longitude deben proporcionarse juntas` · `schedules debe contener exactamente una entrada para cada día de la semana` · `Los horarios son incoherentes o cruzan la medianoche` | Comprobaciones de respaldo del servicio. Por HTTP no se ven: el DTO rechaza antes esos casos. |
| 400 | `El responsable de aprobación no existe` | `approvalResponsibleId` no corresponde a ningún usuario. |
| 400 | `El responsable de aprobación debe estar activo` | El usuario está desactivado. |
| 400 | `El responsable de aprobación debe tener el rol OWNER` | El usuario no tiene OWNER (tener solo ADMIN no basta). |
| 400 | `La configuración contiene referencias o valores inválidos` | Defensivo: solo con una clave foránea rota (Prisma P2003). El servicio comprueba antes el responsable en la misma transacción, y una restricción `CHECK` llega como 500, no aquí. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 409 | `La configuración entró en conflicto con otro cambio; inténtalo nuevamente` | Otra escritura simultánea; el conflicto siguió tras 3 intentos. |
| 409 | `Ya existe una configuración global en conflicto` | Dos primeras creaciones simultáneas. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. Una configuración válida ocupa mucho menos. |
| 500 | `Ocurrió un error interno` | `latitude` o `longitude` distinta de 0, con valor absoluto menor que 0,000001, que JavaScript escribe en notación exponencial sin punto decimal (`1e-7`, `-5e-8`): el validador de decimales falla. Con punto (`1.5e-7`) no falla: pasa la validación aunque tenga más de 7 decimales y se guarda en una columna `DECIMAL(10,7)`. |

**Efectos**
- La primera llamada crea la configuración. Las siguientes actualizan la misma fila: mismo `id` y mismo `createdAt`. `updatedAt` cambia en cada llamada, aunque el body sea idéntico.
- Borra y vuelve a crear los idiomas y los 7 horarios en la misma transacción serializable. Si algo falla, no se guarda nada.
- Desde la primera configuración se pueden crear solicitudes y reservas y usar Samanta; antes responden 409.
- `currency` es la moneda que el backend asigna cuando una solicitud recibe precio cotizado sin que se envíe `currency`: al crearla, o al editarla si aún no tenía moneda. `timeZone` fija el año de los códigos nuevos (`RES-2026-000042`, `R-2026-000007`). Los registros existentes no cambian.
- Samanta recibe `businessName`, `description`, `address`, `currency`, `timeZone`, las dos políticas, `languages` y `schedules`. Si cambias alguno de esos datos, los borradores pendientes quedan desactualizados: pasan a `STALE` al terminar de generarse, al editarlos o al aprobarlos (ver [Generar un borrador con Samanta](#generar-un-borrador-con-samanta)).

**Notas para el frontend**
- **Reemplazo total:** lo omitido o en `null` se guarda como `null`, y `languages` y `schedules` sustituyen a los anteriores. Para cambiar un dato, lee la configuración vigente, aplica el cambio y envía el objeto completo. `useConfigSave()` ya relee con `configApi.get()` justo antes del PUT para no pisar lo que otra pestaña guardó.
- No hay control de concurrencia (ni versión ni `If-Match`): si dos ADMIN guardan a la vez, gana el último.
- Nunca reenvíes el GET tal cual. `toPutRequest()` deja solo los 17 campos del body.
- Para borrar un opcional, envía `null` u omítelo. `""` da 400; el esquema zod de ft-crm ya convierte `""` en `null`.
- Un día abierto exige `openTime < closeTime` el mismo día: sin cruzar la medianoche, sin varias franjas y sin `24:00`. Para cerrar a medianoche usa `23:59`.
- Cada mensaje de validación nombra el campo, casi siempre al inicio (`each value in languages …`, `All languages's elements must be unique` y `All schedules's elements must be unique` lo nombran dentro). Como el PUT reenvía todo, el error puede venir de otra pestaña (p. ej. un responsable que dejó de ser OWNER). `backendMessageTabs()` (`config-schema.ts`) busca el nombre del campo en cualquier parte del mensaje y ya señala la pestaña.
- Selector de responsable: ofrece solo usuarios activos con OWNER, de `GET /users` (solo ADMIN; ver [Listar usuarios](#listar-usuarios)). Si el responsable guardado deja de ser válido, cada PUT falla con 400 hasta que elijas otro o envíes `null`.
- `whatsappNumber`: quita espacios y guiones antes de enviar (`compactPhone()`).
- `timeZone`: envía el nombre canónico (`America/Lima`). El backend guarda lo que recibe y ft-crm compara con sus opciones exactas.
- Coordenadas: ft-crm no las edita. `toPutRequest()` las conserva y las redondea con `normalizeCoordinate()`, que también evita el 500 de los valores menores que 0,000001.
- La respuesta trae lo guardado. Úsala con `setQueryData` en lugar de otro GET.
- Mantén breves los textos que lee Samanta: si la información comercial (configuración y catálogo) supera 32 000 bytes, generar borradores responde 409 `Contexto comercial demasiado extenso; requiere revisión manual`.

### Crear categoría comercial
`POST /commercial-categories`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 201 · `CommercialCategory` |
| ft-crm | `catalogApi.createCategory(body: CreateCommercialCategoryRequest): Promise<CommercialCategory>` — nueva. Hoy no hay pantalla que cree categorías. |
| Caché | Invalida `qk.categories`. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nameEs` | string \| null | `nameEs` o `nameEn` | Se recorta. De 1 a 150 caracteres (`""` o solo espacios → 400). Hay que enviar al menos uno de los dos nombres con texto. Único entre todas las categorías (ver Notas). |
| `nameEn` | string \| null | `nameEs` o `nameEn` | Mismas reglas que `nameEs`. |
| `descriptionEs` | string \| null | No | Se recorta. De 1 a 2000. Omitido o `null` → `null`. |
| `descriptionEn` | string \| null | No | Mismas reglas que `descriptionEs`. |
| `displayOrder` | integer | No | Entero de 0 a 1 000 000. Por defecto `0`. Se convierte con `Number()`: `"10"` → 10 y `""` → 0. No admite `null`. |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist` (p. ej. `isActive` o `id`). |

**Ejemplo de petición**

```ts
const category = await catalogApi.createCategory({
  nameEs: "Parrillas",
  nameEn: "Grills",
  descriptionEs: "Cortes a la parrilla con guarniciones.",
  descriptionEn: "Grilled cuts with sides.",
  displayOrder: 10,
});
await queryClient.invalidateQueries({ queryKey: qk.categories });
```

`POST /api/backend/commercial-categories`:

```json
{
  "nameEs": "Parrillas",
  "nameEn": "Grills",
  "descriptionEs": "Cortes a la parrilla con guarniciones.",
  "descriptionEn": "Grilled cuts with sides.",
  "displayOrder": 10
}
```

**Respuesta**

```json
{
  "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Parrillas",
  "nameEn": "Grills",
  "descriptionEs": "Cortes a la parrilla con guarniciones.",
  "descriptionEn": "Grilled cuts with sides.",
  "isActive": true,
  "displayOrder": 10,
  "createdAt": "2026-10-01T14:05:09.311Z",
  "updatedAt": "2026-10-01T14:05:09.311Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Campo no declarado (p. ej. `isActive`). |
| 400 | `nameEs must be a string` · `nameEs should not be empty` · `nameEs must be shorter than or equal to 150 characters` | `nameEs` no es string, es `""` o solo espacios, o pasa de 150. Igual con `nameEn`. |
| 400 | `descriptionEs must be a string` · `descriptionEs should not be empty` · `descriptionEs must be shorter than or equal to 2000 characters` | Lo mismo con `descriptionEs` (máx. 2000). Igual con `descriptionEn`. |
| 400 | `displayOrder must be an integer number` · `displayOrder must not be less than 0` · `displayOrder must not be greater than 1000000` | `displayOrder` es `null`, no es entero o está fuera de rango. Con `null` o un texto no numérico salen los tres. |
| 400 | `La categoría debe tener al menos un nombre en español o inglés` | No llegó ni `nameEs` ni `nameEn` con texto (p. ej. `{}` o los dos en `null`). |
| 400 | `Los datos de la categoría son inválidos` | No ocurre: el servicio lo reserva para Prisma P2004, que Prisma 7 ya no emite. Una restricción `CHECK` rechazada llega como 500 (ver abajo). |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 409 | `Ya existe una categoría comercial con ese nombre` | Uno de los nombres, normalizado, ya existe como `nameEs` o `nameEn` de otra categoría, activa o no. También si dos altas iguales llegan a la vez. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |
| 500 | `Ocurrió un error interno` | `nameEs` o `nameEn` formado solo por signos diacríticos sueltos y espacios (p. ej. `^`, `` ` `` o `´`): su forma normalizada queda vacía y la base de datos la rechaza (restricción `CHECK`). |

**Efectos**

Crea la categoría activa (`isActive: true`). No toca elementos ni la información que recibe Samanta.

**Notas para el frontend**
- Unicidad: los nombres se comparan normalizados (sin tildes, diéresis ni otros signos diacríticos, también los sueltos como `^`, `` ` ``, `´` o `·`; con `ñ` → `n`, en minúsculas y con los espacios colapsados) y de forma cruzada entre idiomas. Si existe `Bebidas`, crear `Bébidas` o `nameEn: "bebidas"` da 409. Si existe `Piña colada`, también `Pina colada`; si existe `Pisco·Sour`, también `PiscoSour`.
- Los nombres de una misma categoría pueden coincidir entre sí (`nameEs` y `nameEn` iguales).
- Se crea activa. Para desactivarla usa `PATCH /commercial-categories/:id/status`. No existe borrado de categorías.
- Muestra el 409 junto al nombre: el usuario debe elegir otro.
- Después de crear, invalida `qk.categories`. La respuesta ya es la categoría completa.

### Listar categorías comerciales
`GET /commercial-categories`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `CommercialCategory[]` |
| ft-crm | `catalogApi.categories(): Promise<CommercialCategory[]>` — existe. La usa `NuevoServicioForm` (`src/features/ajustes/servicios/nuevo-servicio-form.tsx`) con `staleTime` de 60 s. |
| Caché | `qk.categories` (`["commercial-categories"]`). |

No tiene parámetros de ruta ni body. No admite query: no hay filtros ni paginación, y los parámetros que envíes se ignoran.

**Respuesta**

```json
[
  {
    "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
    "nameEs": "Parrillas",
    "nameEn": "Grills",
    "descriptionEs": "Cortes a la parrilla con guarniciones.",
    "descriptionEn": "Grilled cuts with sides.",
    "isActive": true,
    "displayOrder": 10,
    "createdAt": "2026-10-01T14:05:09.311Z",
    "updatedAt": "2026-10-01T14:05:09.311Z"
  },
  {
    "id": "5f7a9c1e-3a5c-4e7a-9c1e-3a5c7e9a1c3e",
    "nameEs": "Promociones",
    "nameEn": "Deals",
    "descriptionEs": null,
    "descriptionEn": null,
    "isActive": true,
    "displayOrder": 20,
    "createdAt": "2026-10-02T16:20:44.502Z",
    "updatedAt": "2026-10-02T16:20:44.502Z"
  },
  {
    "id": "7b9d1f3a-5c7e-4a9b-8d1f-3a5c7e9b1d3f",
    "nameEs": "Bebidas de temporada",
    "nameEn": null,
    "descriptionEs": "Refrescos disponibles solo en verano.",
    "descriptionEn": null,
    "isActive": false,
    "displayOrder": 50,
    "createdAt": "2026-09-20T13:01:18.640Z",
    "updatedAt": "2026-10-30T22:45:09.003Z"
  }
]
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR (p. ej. solo SUPPORT). |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**
- Devuelve un array plano con todas las categorías, también las inactivas.
- Orden fijo: `displayOrder` ascendente, luego `nameEs` y después `nameEn` ascendentes, con los `null` al final. Como los nombres son únicos, el orden no cambia entre llamadas.
- En los selectores para crear o mover elementos ofrece solo las activas (`isActive: true`): con una inactiva, el backend responde 400 `La categoría comercial está inactiva`. `NuevoServicioForm` ya las filtra.
- Muestra `nameEs ?? nameEn`: una categoría puede tener solo uno de los dos nombres.
- Para ver los elementos de una categoría usa `GET /commercial-items?categoryId=<id>`.

### Ver detalle de una categoría comercial
`GET /commercial-categories/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `CommercialCategory` |
| ft-crm | `catalogApi.category(id: string): Promise<CommercialCategory>` — nueva. |
| Caché | `qk.category(id)` (nueva: `["commercial-categories", "detail", id]`). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID de 8-4-4-4-12 caracteres hexadecimales, de cualquier versión. Si no lo es, 400 `Validation failed (uuid is expected)`. |

No admite query ni body.

**Respuesta**

```json
{
  "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Parrillas",
  "nameEn": "Grills",
  "descriptionEs": "Cortes a la parrilla con guarniciones.",
  "descriptionEn": "Grilled cuts with sides.",
  "isActive": true,
  "displayOrder": 10,
  "createdAt": "2026-10-01T14:05:09.311Z",
  "updatedAt": "2026-10-01T14:05:09.311Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR. |
| 404 | `Categoría comercial no encontrada` | No existe ninguna categoría con ese `id`. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**
- Devuelve lo mismo que cada elemento de `GET /commercial-categories`. Si ya tienes el listado en caché, puedes usarlo como `initialData` del detalle.
- No incluye los elementos de la categoría. Para listarlos usa `GET /commercial-items?categoryId=<id>`.
- Devuelve también las categorías inactivas.

### Editar categoría comercial
`PATCH /commercial-categories/:id`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `CommercialCategory` |
| ft-crm | `catalogApi.updateCategory(id: string, body: UpdateCommercialCategoryRequest): Promise<CommercialCategory>` — nueva. |
| Caché | `setQueryData(qk.category(id), respuesta)` e invalida `qk.categories` y `qk.itemsAll` (cada elemento trae un resumen de su categoría). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID de la categoría. Si no lo es, 400 `Validation failed (uuid is expected)`. |

**Body**

Actualización parcial: lo omitido se conserva y `null` borra el valor. Hay que enviar al menos un campo.

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nameEs` | string \| null | No | Se recorta. De 1 a 150. `null` lo borra. Tras el cambio debe quedar al menos uno de los dos nombres, y los dos deben seguir siendo únicos. |
| `nameEn` | string \| null | No | Mismas reglas que `nameEs`. |
| `descriptionEs` | string \| null | No | Se recorta. De 1 a 2000. `null` la borra. |
| `descriptionEn` | string \| null | No | Mismas reglas que `descriptionEs`. |
| `displayOrder` | integer | No | Entero de 0 a 1 000 000. `"5"` → 5 y `""` → 0. No admite `null`. |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist` (p. ej. `isActive`: para eso está `/status`). |

**Ejemplo de petición**

```ts
const category = await catalogApi.updateCategory("3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71", {
  descriptionEn: null,
  displayOrder: 5,
});
queryClient.setQueryData(qk.category(category.id), category);
await queryClient.invalidateQueries({ queryKey: qk.categories });
await queryClient.invalidateQueries({ queryKey: qk.itemsAll });
```

`PATCH /api/backend/commercial-categories/3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71`:

```json
{
  "descriptionEn": null,
  "displayOrder": 5
}
```

**Respuesta**

```json
{
  "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Parrillas",
  "nameEn": "Grills",
  "descriptionEs": "Cortes a la parrilla con guarniciones.",
  "descriptionEn": null,
  "isActive": true,
  "displayOrder": 5,
  "createdAt": "2026-10-01T14:05:09.311Z",
  "updatedAt": "2026-11-03T16:05:48.329Z"
}
```

**Errores**

Orden de las comprobaciones: sesión y rol; UUID y DTO; después, en el servicio, body vacío, existencia, nombres y unicidad.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Campo no declarado (p. ej. `isActive` o `id`). |
| 400 | `nameEs must be a string` · `nameEs should not be empty` · `nameEs must be shorter than or equal to 150 characters` | `nameEs` no es string, es `""` o solo espacios, o pasa de 150. Igual con `nameEn`. |
| 400 | `descriptionEs must be a string` · `descriptionEs should not be empty` · `descriptionEs must be shorter than or equal to 2000 characters` | Lo mismo con `descriptionEs` (máx. 2000). Igual con `descriptionEn`. |
| 400 | `displayOrder must be an integer number` · `displayOrder must not be less than 0` · `displayOrder must not be greater than 1000000` | `displayOrder` es `null`, no es entero o está fuera de rango. |
| 400 | `Debes proporcionar al menos un campo para actualizar` | El body es `{}`. Se comprueba antes de buscar la categoría: `{}` con un `id` inexistente da 400, no 404. |
| 400 | `La categoría debe tener al menos un nombre en español o inglés` | El cambio dejaría la categoría sin nombres (p. ej. `nameEs: null` cuando no tiene `nameEn`). |
| 400 | `Los datos de la categoría son inválidos` | No ocurre: el servicio lo reserva para Prisma P2004, que Prisma 7 ya no emite. Una restricción `CHECK` rechazada llega como 500 (ver abajo). |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 404 | `Categoría comercial no encontrada` | No existe ninguna categoría con ese `id`. |
| 409 | `Ya existe una categoría comercial con ese nombre` | Uno de los nombres resultantes, normalizado, coincide con `nameEs` o `nameEn` de otra categoría. También si dos cambios iguales llegan a la vez. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |
| 500 | `Ocurrió un error interno` | El `nameEs` o `nameEn` enviado está formado solo por signos diacríticos sueltos y espacios (p. ej. `^`, `` ` `` o `´`): su forma normalizada queda vacía y la base de datos la rechaza (restricción `CHECK`). |

**Efectos**
- Actualiza solo los campos enviados y `updatedAt`. Si cambia un nombre, recalcula su forma normalizada.
- No cambia `isActive` ni el estado de aprobación de sus elementos.
- Los elementos de la categoría muestran el cambio en su resumen `category` (`nameEs`, `nameEn`, `displayOrder`). Con `sort=category`, `displayOrder` y los nombres cambian el orden de `GET /commercial-items`.
- Samanta recibe el nombre de la categoría de cada elemento que ve. Cambiar un nombre deja desactualizados los borradores pendientes que incluían elementos de esta categoría (pasan a `STALE`; ver [Generar un borrador con Samanta](#generar-un-borrador-con-samanta)). `displayOrder` no afecta a Samanta.

**Notas para el frontend**
- Envía solo lo que cambió. `""` da 400: para borrar una descripción o un nombre, envía `null`.
- La unicidad se comprueba siempre con los nombres resultantes, sin contar la propia categoría.
- Muestra el 409 junto al nombre editado.
- Después de guardar, refresca el listado de categorías y el de elementos.

### Activar o desactivar una categoría comercial
`PATCH /commercial-categories/:id/status`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `CommercialCategory` |
| ft-crm | `catalogApi.setCategoryActive(id: string, isActive: boolean): Promise<CommercialCategory>` — nueva. |
| Caché | `setQueryData(qk.category(id), respuesta)` e invalida `qk.categories` y `qk.itemsAll` (cambia `category.isActive` en cada elemento). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID de la categoría. Si no lo es, 400 `Validation failed (uuid is expected)`. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `isActive` | boolean | Sí | Booleano JSON (`"false"` → 400). |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist`. |

**Ejemplo de petición**

```ts
const category = await catalogApi.setCategoryActive("3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71", false);
```

`PATCH /api/backend/commercial-categories/3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71/status`:

```json
{ "isActive": false }
```

**Respuesta**

```json
{
  "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Parrillas",
  "nameEn": "Grills",
  "descriptionEs": "Cortes a la parrilla con guarniciones.",
  "descriptionEn": null,
  "isActive": false,
  "displayOrder": 5,
  "createdAt": "2026-10-01T14:05:09.311Z",
  "updatedAt": "2026-11-03T16:20:02.774Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `isActive must be a boolean value` | Falta `isActive` o no es un booleano JSON. |
| 400 | `property <campo> should not exist` | Se enviaron otros campos (p. ej. `nameEs`). |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 404 | `Categoría comercial no encontrada` | No existe ninguna categoría con ese `id`. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |

**Efectos**

Cambia `isActive` y `updatedAt` de la categoría. Sus elementos conservan su `isActive` y su `approvalStatus`, pero con la categoría inactiva:
- No se pueden crear elementos en ella ni moverlos a ella: 400 `La categoría comercial está inactiva`.
- Editar uno de sus elementos reenviando su `categoryId` también da ese 400. Sin `categoryId`, la edición funciona.
- No se pueden aprobar sus elementos: 400 `No se puede aprobar un elemento de una categoría inactiva`.
- Samanta deja de ver sus elementos, y los borradores pendientes que los incluían quedan desactualizados.
- Las solicitudes y reservas no miran la categoría: siguen aceptando sus elementos si están activos y aprobados.

Reactivarla revierte todo lo anterior: los elementos aprobados y activos vuelven a ser visibles para Samanta, y si alguno entra entre los 30 que ve, los borradores pendientes quedan desactualizados.

**Notas para el frontend**
- Es idempotente: repetir el mismo valor no da error (aunque `updatedAt` cambia).
- Antes de desactivar, avisa de las consecuencias, sobre todo si la categoría tiene elementos aprobados.
- En los selectores de solicitudes y reservas decide si ocultas los elementos de categorías inactivas (`category.isActive`): el backend no lo hace (ver [Preguntas abiertas](#preguntas-abiertas-2)).
- Después del cambio, refresca el listado de categorías y el de elementos.

### Crear elemento comercial
`POST /commercial-items`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 201 · `CommercialItem` |
| ft-crm | `catalogApi.create(body: CreateCommercialItemRequest): Promise<CommercialItem>` — existe. Hoy la usa `NuevoServicioForm` con un alta mínima (`type`, `categoryId`, `nameEs`, `descriptionEs`, `basePrice`); su tipo `CreateCommercialItemRequest` debe ampliarse al de [Tipos TypeScript](#tipos-typescript-1) para enviar el resto. |
| Caché | Invalida `qk.itemsAll`. Opcional: `setQueryData(qk.item(respuesta.id), respuesta)`. |
| Límites | Body máx. 100 kb (413). Un elemento con muchas variantes, FAQs o textos largos puede superarlo aunque cada campo sea válido. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `type` | `CommercialItemType` | Sí | `DISH`, `BEVERAGE`, `SERVICE`, `PROMOTION` o `EVENT`. No se puede cambiar después. |
| `categoryId` | `Uuid` | Sí | UUID de una categoría que exista y esté activa. No admite `null`. |
| `nameEs` | string \| null | `nameEs` o `nameEn` | Se recorta. De 1 a 200. Hay que enviar al menos uno de los dos nombres con texto. Sin `nameEs` no se puede aprobar. Los nombres de elementos pueden repetirse. |
| `nameEn` | string \| null | `nameEs` o `nameEn` | Mismas reglas que `nameEs`. |
| `descriptionEs` | string \| null | No | Se recorta. De 1 a 5000. Omitido o `null` → `null`. |
| `descriptionEn` | string \| null | No | Mismas reglas que `descriptionEs`. |
| `basePrice` | `MoneyString` \| null | Según la regla de precio | String que cumpla `^(?:0\|[1-9]\d{0,7})(?:\.\d{1,2})?$`: de `"0"` a `"99999999.99"`, con punto decimal, hasta 2 decimales, sin signo, sin ceros a la izquierda (`"025"` → 400) ni separador de miles. Se recorta. Un número JSON o `""` dan 400. Omitido o `null` → sin precio base. Ver la regla de precio en Notas. |
| `displayOrder` | integer | No | Entero de 0 a 1 000 000. Por defecto `0`. `"3"` → 3 y `""` → 0. No admite `null`. |
| `conditions` | string \| null | No | Se recorta. De 1 a 5000. Condiciones comerciales visibles (Samanta las recibe). |
| `internalNotes` | string \| null | No | Se recorta. De 1 a 5000. Nota interna: la ven los roles del CRM, pero no Samanta. |
| `availabilityNote` | string \| null | No | Se recorta. De 1 a 2000. Nota de disponibilidad (Samanta la recibe). |
| `variants` | `CommercialItemVariantInput[]` | No | Array de hasta 50 objetos. No admite `null`. Ver `variants[]`. |
| `images` | `CommercialItemImageInput[]` | No | Array de hasta 20 objetos. No admite `null`. Ver `images[]`. |
| `faqs` | `CommercialItemFaqInput[]` | No | Array de hasta 50 objetos. No admite `null`. Ver `faqs[]`. |
| `schedules` | `CommercialItemScheduleInput[]` | No | Array de hasta 7 objetos, sin repetir `dayOfWeek`. No admite `null`. Ver `schedules[]`. |
| `promotionDetail` | `CommercialPromotionDetailInput` \| null | No | Objeto solo si `type` es `PROMOTION` (con otro tipo, 400). `null` u omitido → sin detalle, con cualquier tipo. Ver `promotionDetail`. |
| `eventDetail` | `CommercialEventDetailInput` \| null | No | Objeto solo si `type` es `EVENT`. `null` u omitido → sin detalle. Ver `eventDetail`. |
| `isActive`, `approvalStatus`, `id`, `createdAt`, otros | — | Prohibido | 400 `property <campo> should not exist`. El elemento nace activo y en `DRAFT`. |

**Body — `variants[]`** (tamaños o porciones con precio propio)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `nameEs` | string \| null | `nameEs` o `nameEn` | Se recorta. De 1 a 150. Cada variante necesita al menos un nombre con texto. |
| `nameEn` | string \| null | `nameEs` o `nameEn` | Mismas reglas que `nameEs`. |
| `descriptionEs` | string \| null | No | Se recorta. De 1 a 2000. |
| `descriptionEn` | string \| null | No | Mismas reglas que `descriptionEs`. |
| `price` | `MoneyString` | Sí | Mismo formato que `basePrice`. No admite `null`. |
| `isActive` | boolean | No | Booleano JSON (`"true"` → 400). Omitido o `null` → `true`. Solo las variantes activas cuentan para la regla de precio y para Samanta. |
| `displayOrder` | integer \| null | No | Entero de 0 a 1 000 000. Omitido o `null` → su posición en el array (0, 1, 2…). |
| Otro campo | — | Prohibido | `variants.<i>.property <campo> should not exist` (p. ej. `id`, `createdAt` o `updatedAt` copiados del GET). |

Dos variantes del mismo elemento no pueden tener el mismo nombre normalizado. Se compara `nameEs`, o `nameEn` si falta, sin tildes ni otros signos diacríticos (también los sueltos, como `^` o `´`), con `ñ` → `n`, en minúsculas y con los espacios colapsados. Cuentan también las inactivas.

**Body — `images[]`** (solo URLs: no hay subida de archivos)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `url` | string | Sí | Se recorta. URL con `http://` o `https://` obligatorio y un host con dominio de nivel superior o una IP (`localhost` no vale). Máx. 2048. No puede repetirse en el mismo elemento (comparación exacta, tras recortar). |
| `altTextEs` | string \| null | No | Se recorta. De 1 a 300. |
| `altTextEn` | string \| null | No | Mismas reglas que `altTextEs`. |
| `isPrimary` | boolean | No | Booleano JSON (`"true"` → 400). Omitido o `null` → `false`. Como máximo una imagen con `true`; puede no haber ninguna. |
| `displayOrder` | integer \| null | No | Entero de 0 a 1 000 000. Omitido o `null` → su posición en el array. |
| Otro campo | — | Prohibido | `images.<i>.property <campo> should not exist`. |

**Body — `faqs[]`**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `questionEs` | string | Sí | Se recorta. De 1 a 500. No admite `null`. |
| `questionEn` | string \| null | No | Se recorta. De 1 a 500. |
| `answerEs` | string | Sí | Se recorta. De 1 a 5000. No admite `null`. |
| `answerEn` | string \| null | No | Se recorta. De 1 a 5000. |
| `displayOrder` | integer \| null | No | Entero de 0 a 1 000 000. Omitido o `null` → su posición en el array. |
| Otro campo | — | Prohibido | `faqs.<i>.property <campo> should not exist`. |

**Body — `schedules[]`** (disponibilidad por día)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `dayOfWeek` | `DayOfWeek` | Sí | `MONDAY` … `SUNDAY`. No puede repetirse en el array. |
| `isAvailable` | boolean | Sí | Booleano JSON. |
| `startTime` | `HhMm` \| null | Si `isAvailable` es `true` | Se recorta. `HH:mm` de 24 h (`00:00` a `23:59`) y distinto de `endTime`. Puede ser mayor que `endTime`: el horario cruza la medianoche (p. ej. `18:00` a `02:00`). Con `isAvailable: false`, omítelo o envía `null`. |
| `endTime` | `HhMm` \| null | Si `isAvailable` es `true` | Mismas reglas que `startTime`. |
| Otro campo | — | Prohibido | `schedules.<i>.property <campo> should not exist`. |

Un día sin entrada no tiene registro: no hace falta enviar los 7 días.

**Body — `promotionDetail`** (solo `PROMOTION`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `validFrom` | `IsoDateTime` \| null | No | Se recorta. ISO 8601 con segundos y zona (`Z` o `±HH:mm`, con dos puntos), hasta 3 decimales, y una fecha que exista (p. ej. `2026-12-24T20:00:00-05:00`). No puede ser posterior a `validUntil`; igual sí. |
| `validUntil` | `IsoDateTime` \| null | No | Mismo formato que `validFrom`. |
| `promotionalPrice` | `MoneyString` \| null | No | Mismo formato que `basePrice`. No se compara con `basePrice`. |
| Otro campo | — | Prohibido | `promotionDetail.property <campo> should not exist`. |

**Body — `eventDetail`** (solo `EVENT`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `startAt` | `IsoDateTime` \| null | No | Mismo formato que `validFrom`. No puede ser posterior a `endAt`; igual sí. |
| `endAt` | `IsoDateTime` \| null | No | Mismo formato que `validFrom`. |
| `capacity` | integer \| null | No | Entero de 1 a 1 000 000. `"60"` → 60. |
| Otro campo | — | Prohibido | `eventDetail.property <campo> should not exist`. |

**Ejemplo de petición**

```ts
const item = await catalogApi.create({
  type: "DISH",
  categoryId: "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  nameEs: "Anticuchos de corazón",
  nameEn: "Beef heart skewers",
  descriptionEs: "Brochetas de corazón de res con papas doradas y choclo.",
  displayOrder: 1,
  conditions: "Sujeto a disponibilidad del día.",
  internalNotes: "Confirmar stock con cocina antes de ofrecer.",
  availabilityNote: "Solo turno noche.",
  variants: [
    { nameEs: "Porción personal", nameEn: "Single portion", price: "25" },
    { nameEs: "Porción para compartir", nameEn: "Sharing portion", price: "45.00" },
  ],
  images: [
    { url: "https://cdn.example.com/fogon-andino/anticuchos.jpg", altTextEs: "Anticuchos en plato de barro", isPrimary: true },
  ],
  faqs: [{ questionEs: "¿Es picante?", answerEs: "El ají se sirve aparte." }],
  schedules: [
    { dayOfWeek: "FRIDAY", isAvailable: true, startTime: "18:00", endTime: "23:30" },
    { dayOfWeek: "SUNDAY", isAvailable: false },
  ],
});
await queryClient.invalidateQueries({ queryKey: qk.itemsAll });
```

`POST /api/backend/commercial-items`:

```json
{
  "type": "DISH",
  "categoryId": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Anticuchos de corazón",
  "nameEn": "Beef heart skewers",
  "descriptionEs": "Brochetas de corazón de res con papas doradas y choclo.",
  "displayOrder": 1,
  "conditions": "Sujeto a disponibilidad del día.",
  "internalNotes": "Confirmar stock con cocina antes de ofrecer.",
  "availabilityNote": "Solo turno noche.",
  "variants": [
    { "nameEs": "Porción personal", "nameEn": "Single portion", "price": "25" },
    { "nameEs": "Porción para compartir", "nameEn": "Sharing portion", "price": "45.00" }
  ],
  "images": [
    { "url": "https://cdn.example.com/fogon-andino/anticuchos.jpg", "altTextEs": "Anticuchos en plato de barro", "isPrimary": true }
  ],
  "faqs": [
    { "questionEs": "¿Es picante?", "answerEs": "El ají se sirve aparte." }
  ],
  "schedules": [
    { "dayOfWeek": "FRIDAY", "isAvailable": true, "startTime": "18:00", "endTime": "23:30" },
    { "dayOfWeek": "SUNDAY", "isAvailable": false }
  ]
}
```

Es un `DISH` sin `basePrice` y con dos variantes activas: cumple la regla de precio.

**Respuesta**

```json
{
  "id": "c2a4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f",
  "type": "DISH",
  "categoryId": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Anticuchos de corazón",
  "nameEn": "Beef heart skewers",
  "descriptionEs": "Brochetas de corazón de res con papas doradas y choclo.",
  "descriptionEn": null,
  "basePrice": null,
  "displayOrder": 1,
  "isActive": true,
  "approvalStatus": "DRAFT",
  "conditions": "Sujeto a disponibilidad del día.",
  "internalNotes": "Confirmar stock con cocina antes de ofrecer.",
  "availabilityNote": "Solo turno noche.",
  "createdAt": "2026-11-03T02:32:11.984Z",
  "updatedAt": "2026-11-03T02:32:11.984Z",
  "category": {
    "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
    "nameEs": "Parrillas",
    "nameEn": "Grills",
    "isActive": true,
    "displayOrder": 10
  },
  "variants": [
    {
      "id": "7e9a1c3b-5d2f-4a6e-8b0c-1d3f5a7c9e2b",
      "nameEs": "Porción personal",
      "nameEn": "Single portion",
      "descriptionEs": null,
      "descriptionEn": null,
      "price": "25.00",
      "isActive": true,
      "displayOrder": 0,
      "createdAt": "2026-11-03T02:32:11.984Z",
      "updatedAt": "2026-11-03T02:32:11.984Z"
    },
    {
      "id": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      "nameEs": "Porción para compartir",
      "nameEn": "Sharing portion",
      "descriptionEs": null,
      "descriptionEn": null,
      "price": "45.00",
      "isActive": true,
      "displayOrder": 1,
      "createdAt": "2026-11-03T02:32:11.984Z",
      "updatedAt": "2026-11-03T02:32:11.984Z"
    }
  ],
  "images": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "url": "https://cdn.example.com/fogon-andino/anticuchos.jpg",
      "altTextEs": "Anticuchos en plato de barro",
      "altTextEn": null,
      "isPrimary": true,
      "displayOrder": 0,
      "createdAt": "2026-11-03T02:32:11.984Z"
    }
  ],
  "faqs": [
    {
      "id": "b5c6d7e8-f9a0-4b1c-9d2e-3f4a5b6c7d8e",
      "questionEs": "¿Es picante?",
      "questionEn": null,
      "answerEs": "El ají se sirve aparte.",
      "answerEn": null,
      "displayOrder": 0,
      "createdAt": "2026-11-03T02:32:11.984Z",
      "updatedAt": "2026-11-03T02:32:11.984Z"
    }
  ],
  "schedules": [
    {
      "id": "d9e8f7a6-b5c4-4d3e-8f2a-1b0c9d8e7f6a",
      "dayOfWeek": "FRIDAY",
      "isAvailable": true,
      "startTime": "18:00",
      "endTime": "23:30"
    },
    {
      "id": "c8d7e6f5-a4b3-4c2d-9e1f-0a9b8c7d6e5f",
      "dayOfWeek": "SUNDAY",
      "isAvailable": false,
      "startTime": null,
      "endTime": null
    }
  ],
  "promotionDetail": null,
  "eventDetail": null
}
```

**Errores**

Orden de las comprobaciones: sesión y rol; DTO; después, en el servicio, nombres, variantes, imágenes, horarios, fechas de los detalles, regla de precio, tipo de detalle y, por último, la categoría. Los mensajes de validación llegan juntos en el array `message`; los de los hijos llevan la ruta como prefijo (`variants.<i>.`, `promotionDetail.`…), donde `<i>` es la posición en el array.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Campo no declarado, p. ej. `isActive`, `approvalStatus` o `id`. En los hijos: `variants.<i>.property id should not exist`, `promotionDetail.property id should not exist`, etc. |
| 400 | `type must be one of the following values: DISH, BEVERAGE, SERVICE, PROMOTION, EVENT` | `type` falta o no es uno de esos valores. |
| 400 | `categoryId must be a UUID` | `categoryId` falta, es `null` o no es un UUID. |
| 400 | `nameEs must be a string` · `nameEs should not be empty` · `nameEs must be shorter than or equal to 200 characters` | `nameEs` no es string, es `""` o solo espacios, o pasa de 200. Igual con `nameEn`. |
| 400 | `descriptionEs must be a string` · `descriptionEs should not be empty` · `descriptionEs must be shorter than or equal to 5000 characters` | Lo mismo con `descriptionEs` (máx. 5000). Igual con `descriptionEn`. |
| 400 | `basePrice must be a string` · `basePrice debe ser una cadena decimal no negativa con máximo dos decimales` | `basePrice` es un número JSON (salen los dos), es `""` o no cumple el formato (`"-1"`, `"1,5"`, `"025"`, `"1.234"`, `"100000000"`). |
| 400 | `displayOrder must be an integer number` · `displayOrder must not be less than 0` · `displayOrder must not be greater than 1000000` | `displayOrder` es `null`, no es entero o está fuera de rango. |
| 400 | `conditions must be a string` · `conditions should not be empty` · `conditions must be shorter than or equal to 5000 characters` | Lo mismo con `conditions`. Igual con `internalNotes` (máx. 5000) y `availabilityNote` (máx. 2000). |
| 400 | `variants must be an array` · `variants must contain no more than 50 elements` · `each value in nested property variants must be either object or array` | `variants` es `null` o un valor simple (salen los tres), o tiene más de 50 elementos. Igual con `images` (máx. 20), `faqs` (máx. 50) y `schedules` (máx. 7; con `null` también sale `All schedules's elements must be unique`). |
| 400 | `variants.each value in nested property variants must be either object or array` | Un elemento del array es `null` o un valor simple. Igual con `images`, `faqs` y `schedules`. |
| 400 | `variants.<i>.price must be a string` · `variants.<i>.price debe ser una cadena decimal no negativa con máximo dos decimales` | Falta `price`, es un número o no cumple el formato. |
| 400 | `variants.<i>.nameEs must be a string` · `variants.<i>.nameEs should not be empty` · `variants.<i>.nameEs must be shorter than or equal to 150 characters` | Igual con `nameEn` (máx. 150) y con `descriptionEs` y `descriptionEn` (máx. 2000). |
| 400 | `variants.<i>.isActive must be a boolean value` | `isActive` no es un booleano JSON. |
| 400 | `variants.<i>.displayOrder must be an integer number` · `variants.<i>.displayOrder must not be less than 0` · `variants.<i>.displayOrder must not be greater than 1000000` | Igual en `images`, `faqs` y sus `displayOrder`. |
| 400 | `images.<i>.url must be a URL address` · `images.<i>.url must be shorter than or equal to 2048 characters` | Falta `url` (salen los dos), no es `http(s)://`, no tiene dominio con extensión ni IP, o pasa de 2048. |
| 400 | `images.<i>.altTextEs must be a string` · `images.<i>.altTextEs should not be empty` · `images.<i>.altTextEs must be shorter than or equal to 300 characters` | Igual con `altTextEn`. |
| 400 | `images.<i>.isPrimary must be a boolean value` | `isPrimary` no es un booleano JSON (p. ej. `"true"`). |
| 400 | `faqs.<i>.questionEs must be a string` · `faqs.<i>.questionEs should not be empty` · `faqs.<i>.questionEs must be shorter than or equal to 500 characters` | Falta `questionEs` (salen los tres), está vacía o pasa de 500. Igual con `questionEn` (500) y con `answerEs` y `answerEn` (5000). |
| 400 | `All schedules's elements must be unique` | Dos horarios con el mismo `dayOfWeek`. |
| 400 | `schedules.<i>.dayOfWeek must be one of the following values: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY` | Día inválido. |
| 400 | `schedules.<i>.isAvailable must be a boolean value` | `isAvailable` falta o no es un booleano JSON. |
| 400 | `schedules.<i>.Un horario disponible requiere startTime y endTime distintos en formato HH:mm; un horario no disponible no admite horas` | Disponible sin las dos horas, con horas iguales o mal formadas, o no disponible con horas. |
| 400 | `schedules.<i>.startTime must be a string` · `schedules.<i>.startTime debe tener el formato HH:mm` · `schedules.<i>.endTime must be a string` · `schedules.<i>.endTime debe tener el formato HH:mm` | Hora que no es string o no cumple `HH:mm` (p. ej. `9:00` o `24:00`). Llega junto con el mensaje anterior. |
| 400 | `nested property promotionDetail must be either object or array` · `nested property eventDetail must be either object or array` | El detalle es un string, un número o un booleano. |
| 400 | `promotionDetail.validFrom debe ser una fecha ISO 8601 válida` · `promotionDetail.validFrom debe incluir segundos y zona horaria (Z o ±HH:mm)` | La fecha no existe (`2026-02-30T10:00:00Z`) o no es texto ISO; o le faltan los segundos o la zona, trae más de 3 decimales o la zona va sin dos puntos (`-0500`). Igual con `validUntil` y con `eventDetail.startAt` y `eventDetail.endAt`. |
| 400 | `promotionDetail.promotionalPrice must be a string` · `promotionDetail.promotionalPrice debe ser una cadena decimal no negativa con máximo dos decimales` | Mismo caso que `basePrice`. |
| 400 | `eventDetail.capacity must be an integer number` · `eventDetail.capacity must not be less than 1` · `eventDetail.capacity must not be greater than 1000000` | `capacity` no es entero o está fuera de 1 a 1 000 000. |
| 400 | `El elemento comercial debe tener al menos un nombre en español o inglés` | No llegó ni `nameEs` ni `nameEn` con texto. |
| 400 | `Cada variante debe tener al menos un nombre en español o inglés` | Una variante no tiene ningún nombre. |
| 400 | `Las variantes no pueden duplicarse` | Dos variantes tienen el mismo nombre normalizado (`nameEs`, o `nameEn` si falta). |
| 400 | `Las imágenes no pueden duplicarse` | Hay una URL repetida (tras recortar). |
| 400 | `Un elemento comercial solo puede tener una imagen principal` | Más de una imagen con `isPrimary: true`. |
| 400 | `No puede repetirse un día en los horarios del elemento` · `Los horarios comerciales son incoherentes` | Respaldo del servicio. Por HTTP no se ven: el DTO rechaza antes esos casos. |
| 400 | `validFrom debe ser una fecha válida` · `validUntil debe ser una fecha válida` · `startAt debe ser una fecha válida` · `endAt debe ser una fecha válida` | Respaldo del servicio; el DTO rechaza antes las fechas inválidas. |
| 400 | `validFrom no puede ser posterior a validUntil` | Rango de la promoción invertido. |
| 400 | `startAt no puede ser posterior a endAt` | Rango del evento invertido. |
| 400 | `Un plato o bebida debe tener un precio base o variantes activas, pero no ambos` | Un `DISH` o `BEVERAGE` sin `basePrice` ni variantes activas, o con las dos cosas. |
| 400 | `promotionDetail solo corresponde a elementos PROMOTION` | Se envió `promotionDetail` como objeto con otro `type`. |
| 400 | `eventDetail solo corresponde a elementos EVENT` | Se envió `eventDetail` como objeto con otro `type`. |
| 400 | `La categoría comercial no existe` | `categoryId` no corresponde a ninguna categoría. |
| 400 | `La categoría comercial está inactiva` | La categoría está desactivada. |
| 400 | `La operación contiene referencias o valores comerciales inválidos` | Defensivo: solo con una clave foránea rota (Prisma P2003). El servicio comprueba antes la categoría en la misma transacción, y una restricción `CHECK` llega como 500, no aquí. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 409 | `La operación contiene datos comerciales duplicados` | La base de datos rechaza un duplicado (Prisma P2002). Respaldo: el servicio detecta antes los duplicados. |
| 409 | `La operación comercial entró en conflicto; inténtalo nuevamente` | Conflicto con otra escritura simultánea que siguió tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |
| 500 | `Ocurrió un error interno` | El nombre enviado que se normaliza (`nameEs`, o `nameEn` si falta, del elemento o de una variante) está formado solo por signos diacríticos sueltos y espacios (p. ej. `^`, `` ` `` o `´`): su forma normalizada queda vacía y la base de datos la rechaza (restricción `CHECK`). |

**Efectos**
- Crea el elemento con `approvalStatus: "DRAFT"` e `isActive: true`, junto con sus variantes, imágenes, FAQs, horarios y detalle, en una sola transacción serializable. Si algo falla, no se guarda nada.
- Un elemento en `DRAFT` no llega a Samanta ni se puede elegir en solicitudes o reservas: hay que aprobarlo con `PATCH /commercial-items/:id/approval`.

**Notas para el frontend**
- **Regla de precio:** un `DISH` o `BEVERAGE` lleva exactamente un mecanismo de precio: `basePrice` **o** al menos una variante activa. Sin ninguno, o con los dos, da 400. `SERVICE`, `PROMOTION` y `EVENT` admiten `basePrice`, variantes, las dos cosas o ninguna. El alta mínima de ft-crm no maneja variantes, por eso exige `basePrice` en platos y bebidas (`priceRequired()`).
- Los importes viajan como string: no los conviertas a número. La respuesta trae siempre 2 decimales (`"25"` → `"25.00"`).
- Si un hijo no trae `displayOrder`, se usa su posición en el array. La respuesta ordena los hijos por `displayOrder` y después por `createdAt`, y los horarios de `MONDAY` a `SUNDAY`. No hay más desempate: si envías dos hijos con el mismo `displayOrder` en una misma petición, su orden relativo no está garantizado.
- `promotionDetail` y `eventDetail` son opcionales incluso en `PROMOTION` y `EVENT`; si se omiten, la respuesta trae `null`. Enviar `{}` crea el detalle con todos sus campos en `null`.
- Fechas de promoción o evento: envíalas con segundos y zona, igual que en reservas (`toISOString()` sirve). La respuesta viene en UTC: muéstralas en el `timeZone` del restaurante.
- Los nombres de los elementos pueden repetirse; solo las variantes deben ser únicas dentro de su elemento.
- No hay subida de archivos: `images[].url` debe apuntar a una imagen ya alojada.
- Samanta recibe, por elemento, nombres, tipo, descripciones, `basePrice`, `conditions`, `availabilityNote`, el nombre de la categoría, hasta 10 variantes activas, hasta 10 FAQs, los horarios, el detalle de promoción y las fechas del evento. No recibe imágenes, `internalNotes` ni `capacity`.
- Mantén breves los textos: si la información comercial que recibe Samanta supera 32 000 bytes, generar borradores responde 409 `Contexto comercial demasiado extenso; requiere revisión manual`.
- Después de crear, muestra que el elemento quedó en borrador y ofrece aprobarlo (ft-crm ya lo avisa en `ServiciosView`).

### Listar elementos comerciales
`GET /commercial-items`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<CommercialItem>` |
| ft-crm | `catalogApi.items(query: CommercialItemListQuery): Promise<Paginated<CommercialItem>>` — existe. `ServiciosView` (`src/features/ajustes/servicios/servicios-view.tsx`) pide `{ sort: "category", order: "asc", page, limit: 50 }` con `keepPreviousData`. |
| Caché | `qk.items(query)` (`["commercial-items", query]`); `qk.itemsAll` invalida todas las páginas. |

**Query**

Todos los parámetros son opcionales y se combinan con AND. `toSearch()` de `apiFetch` ya omite los vacíos y envía los booleanos como `true`/`false`.

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | integer | No | `1` | Entero de 1 a 1 000 000. `page=` (vacío) da 400. |
| `limit` | integer | No | `20` | Entero de 1 a 100. |
| `type` | `CommercialItemType` | No | — | Filtro exacto. Un solo valor: repetir el parámetro da 400. |
| `approvalStatus` | `CommercialApprovalStatus` | No | — | Filtro exacto: `DRAFT`, `APPROVED` o `REJECTED`. Un solo valor. |
| `isActive` | boolean | No | — (todos) | Solo los textos `true` o `false`; `1`, `0` o `TRUE` dan 400. |
| `categoryId` | `Uuid` | No | — | Filtro exacto. No comprueba que la categoría exista: si no existe, la lista sale vacía. |
| `search` | string | No | — | Se recorta. De 1 a 200 caracteres. Busca el texto, sin distinguir mayúsculas pero sí tildes, en `nameEs`, `nameEn`, `descriptionEs` o `descriptionEn` (basta con uno). |
| `sort` | `category` \| `name` \| `createdAt` | No | `createdAt` | Criterio de orden (ver Notas). |
| `order` | `asc` \| `desc` | No | `desc` | Dirección del orden, en minúsculas. |
| Otro parámetro | — | Prohibido | — | 400 `property <param> should not exist`. |

**Ejemplo de petición**

Listado de Ajustes > Servicios:

```ts
const query: CommercialItemListQuery = { sort: "category", order: "asc", page: 1, limit: 50 };
const page = await catalogApi.items(query); // caché: qk.items(query)
```

`GET /api/backend/commercial-items?sort=category&order=asc&page=1&limit=50`

Selector de elementos para una solicitud o una reserva (solo activos y aprobados):

```ts
const options = await catalogApi.items({ isActive: true, approvalStatus: "APPROVED", search: "parrillada", sort: "name", order: "asc", limit: 20 });
```

`GET /api/backend/commercial-items?isActive=true&approvalStatus=APPROVED&search=parrillada&sort=name&order=asc&limit=20`

**Respuesta**

La respuesta al selector del ejemplo:

```json
{
  "data": [
    {
      "id": "4b6d8f0a-2c4e-4a6b-9c8d-0e2f4a6b8c0d",
      "type": "PROMOTION",
      "categoryId": "5f7a9c1e-3a5c-4e7a-9c1e-3a5c7e9a1c3e",
      "nameEs": "Parrillada para dos",
      "nameEn": "Grill for two",
      "descriptionEs": "Parrillada mixta para dos personas con dos bebidas.",
      "descriptionEn": "Mixed grill for two with two drinks.",
      "basePrice": "120.00",
      "displayOrder": 0,
      "isActive": true,
      "approvalStatus": "APPROVED",
      "conditions": "Válido de lunes a jueves. No acumulable con otras promociones.",
      "internalNotes": null,
      "availabilityNote": null,
      "createdAt": "2026-10-20T17:45:03.220Z",
      "updatedAt": "2026-10-21T09:12:55.871Z",
      "category": {
        "id": "5f7a9c1e-3a5c-4e7a-9c1e-3a5c7e9a1c3e",
        "nameEs": "Promociones",
        "nameEn": "Deals",
        "isActive": true,
        "displayOrder": 20
      },
      "variants": [
        {
          "id": "0b2d4f6a-8c0e-4b2d-9f6a-8c0e2b4d6f8a",
          "nameEs": "Con jarra de chicha",
          "nameEn": "With chicha pitcher",
          "descriptionEs": "Cambia las dos bebidas por una jarra de chicha morada.",
          "descriptionEn": null,
          "price": "129.90",
          "isActive": true,
          "displayOrder": 0,
          "createdAt": "2026-10-20T17:45:03.220Z",
          "updatedAt": "2026-10-20T17:45:03.220Z"
        }
      ],
      "images": [
        {
          "id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
          "url": "https://cdn.example.com/fogon-andino/parrillada-dos.jpg",
          "altTextEs": "Parrillada mixta servida en tabla",
          "altTextEn": "Mixed grill served on a board",
          "isPrimary": true,
          "displayOrder": 0,
          "createdAt": "2026-10-20T17:45:03.220Z"
        }
      ],
      "faqs": [
        {
          "id": "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f",
          "questionEs": "¿Se puede pedir para llevar?",
          "questionEn": "Is it available for takeaway?",
          "answerEs": "Sí, con el mismo precio promocional.",
          "answerEn": "Yes, at the same promotional price.",
          "displayOrder": 0,
          "createdAt": "2026-10-20T17:45:03.220Z",
          "updatedAt": "2026-10-20T17:45:03.220Z"
        }
      ],
      "schedules": [
        {
          "id": "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
          "dayOfWeek": "MONDAY",
          "isAvailable": true,
          "startTime": "12:00",
          "endTime": "16:00"
        }
      ],
      "promotionDetail": {
        "id": "e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8",
        "validFrom": "2026-11-01T05:00:00.000Z",
        "validUntil": "2026-12-01T04:59:59.000Z",
        "promotionalPrice": "99.90",
        "createdAt": "2026-10-20T17:45:03.220Z",
        "updatedAt": "2026-10-20T17:45:03.220Z"
      },
      "eventDetail": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

**Errores**

Un parámetro repetido (`type=DISH&type=EVENT`) llega como array y da el mismo 400 que un valor inválido. `toSearch()` nunca repite parámetros.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `property <param> should not exist` | Parámetro no declarado (p. ej. `foo=1` o `status=ACTIVE`). |
| 400 | `page must be an integer number` · `page must not be less than 1` · `page must not be greater than 1000000` | `page` no es entero (`2.5`, `abc`), está vacío (`page=` equivale a 0) o fuera de 1 a 1 000 000 (`1e30`). |
| 400 | `limit must be an integer number` · `limit must not be less than 1` · `limit must not be greater than 100` | Lo mismo con `limit` (de 1 a 100). |
| 400 | `type must be one of the following values: DISH, BEVERAGE, SERVICE, PROMOTION, EVENT` | Valor desconocido, vacío o repetido (`type=DISH&type=EVENT`). |
| 400 | `approvalStatus must be one of the following values: DRAFT, APPROVED, REJECTED` | Valor desconocido, vacío o repetido. |
| 400 | `isActive must be a boolean value` | Distinto de `true` o `false` (p. ej. `1`, `TRUE` o vacío). |
| 400 | `categoryId must be a UUID` | No es un UUID. |
| 400 | `search should not be empty` · `search must be shorter than or equal to 200 characters` · `search must be a string` | `search` vacío o solo con espacios, o de más de 200 caracteres. El tercero solo sale si se repite el parámetro. |
| 400 | `sort must be one of the following values: category, name, createdAt` | Otro criterio (p. ej. `price`). |
| 400 | `order must be one of the following values: asc, desc` | Otro valor (también `ASC` en mayúsculas). |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR (p. ej. solo SUPPORT). |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**
- Orden según `sort`, todo en la dirección de `order` salvo los desempates fijos:
  - `createdAt` (por defecto): por `createdAt`, con desempate por `id` ascendente.
  - `name`: por `nameEs` y luego `nameEn` (los `null` al final), con desempate por `createdAt` descendente y después por `id` ascendente.
  - `category`: agrupa por categoría (`category.displayOrder`, nombres de la categoría y su `id`) y, dentro de cada una, ordena por `displayOrder`, `nameEs` y `nameEn` del elemento, con desempate final por `id` ascendente.
  - En los tres casos el orden es total: las páginas no se solapan ni se saltan elementos.
- `search` busca con `contains` sin distinguir mayúsculas, en los cuatro textos a la vez (OR). No ignora tildes: `cafe` no encuentra `Café`. No busca en el nombre de la categoría, en las variantes ni en `conditions`.
- Sin filtros devuelve todo: elementos inactivos, en `DRAFT` o `REJECTED` y de categorías inactivas. Cada elemento trae `internalNotes` y todos sus hijos, también las variantes inactivas.
- Selectores:
  - Solicitudes y reservas: usa `isActive=true&approvalStatus=APPROVED`. Crearlas, o cambiar su elemento, con otro responde 400 `El elemento comercial debe estar activo y aprobado` (ver [Crear solicitud de reserva](#crear-solicitud-de-reserva) y [Crear reserva manual](#crear-reserva-manual)). No hay filtro por categoría activa: revisa `category.isActive` si quieres ocultar esos elementos.
  - Intereses de clientes (`POST /customers/:id/interests`): sirve cualquier elemento existente, aunque esté inactivo o en borrador (ver [Registrar interés del cliente](#registrar-interés-del-cliente)).
  - Con más de 100 elementos, pagina o usa `search`: `limit` no pasa de 100.
- `totalPages` es `ceil(total / limit)` (0 si no hay resultados). Una página fuera de rango devuelve `data: []` con el `total` real; `ServiciosView` ya ofrece volver a la primera página.
- No envíes parámetros vacíos (`search=`, `type=`): dan 400. `toSearch()` ya los omite, también los que solo tienen espacios.
- El listado trae cada elemento completo, con todos sus hijos: no hace falta pedir el detalle de cada fila.

### Ver detalle de un elemento comercial
`GET /commercial-items/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `CommercialItem` |
| ft-crm | `catalogApi.item(id: string): Promise<CommercialItem>` — nueva. |
| Caché | `qk.item(id)` (nueva: `["commercial-items", "detail", id]`). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID de 8-4-4-4-12 caracteres hexadecimales, de cualquier versión. Si no lo es, 400 `Validation failed (uuid is expected)`. |

No admite query ni body.

**Respuesta**

```json
{
  "id": "6c8e0a2b-4d6f-4b8a-a0c2-e4f6a8b0c2d4",
  "type": "EVENT",
  "categoryId": "2d4f6a8c-0e1a-4c3e-b5a7-9c1e3a5c7e9a",
  "nameEs": "Noche criolla con música en vivo",
  "nameEn": "Creole night with live music",
  "descriptionEs": "Show de música criolla con menú degustación de cuatro tiempos.",
  "descriptionEn": null,
  "basePrice": "80.00",
  "displayOrder": 0,
  "isActive": true,
  "approvalStatus": "DRAFT",
  "conditions": "Reserva previa obligatoria.",
  "internalNotes": "Confirmar con la banda el día anterior.",
  "availabilityNote": "Cupos limitados.",
  "createdAt": "2026-10-25T19:30:12.045Z",
  "updatedAt": "2026-10-25T19:30:12.045Z",
  "category": {
    "id": "2d4f6a8c-0e1a-4c3e-b5a7-9c1e3a5c7e9a",
    "nameEs": "Eventos",
    "nameEn": "Events",
    "isActive": true,
    "displayOrder": 30
  },
  "variants": [
    {
      "id": "6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7a8b9c0",
      "nameEs": "Mesa preferencial",
      "nameEn": "Front-row table",
      "descriptionEs": "Mesa frente al escenario.",
      "descriptionEn": null,
      "price": "120.00",
      "isActive": true,
      "displayOrder": 0,
      "createdAt": "2026-10-25T19:30:12.045Z",
      "updatedAt": "2026-10-25T19:30:12.045Z"
    }
  ],
  "images": [
    {
      "id": "7a8b9c0d-1e2f-4a3b-8c4d-e5f6a7b8c9d0",
      "url": "https://cdn.example.com/fogon-andino/noche-criolla.jpg",
      "altTextEs": "Músicos criollos en el escenario",
      "altTextEn": null,
      "isPrimary": false,
      "displayOrder": 0,
      "createdAt": "2026-10-25T19:30:12.045Z"
    }
  ],
  "faqs": [
    {
      "id": "8b9c0d1e-2f3a-4b4c-9d5e-f6a7b8c9d0e1",
      "questionEs": "¿Incluye bebidas?",
      "questionEn": null,
      "answerEs": "Incluye una copa de bienvenida.",
      "answerEn": null,
      "displayOrder": 0,
      "createdAt": "2026-10-25T19:30:12.045Z",
      "updatedAt": "2026-10-25T19:30:12.045Z"
    }
  ],
  "schedules": [
    {
      "id": "9c0d1e2f-3a4b-4c5d-ae6f-a7b8c9d0e1f2",
      "dayOfWeek": "SATURDAY",
      "isAvailable": true,
      "startTime": "20:00",
      "endTime": "01:00"
    }
  ],
  "promotionDetail": null,
  "eventDetail": {
    "id": "f0e1d2c3-b4a5-4968-8776-655443322110",
    "startAt": "2026-11-29T01:00:00.000Z",
    "endAt": "2026-11-29T06:00:00.000Z",
    "capacity": 60,
    "createdAt": "2026-10-25T19:30:12.045Z",
    "updatedAt": "2026-10-25T19:30:12.045Z"
  }
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR. |
| 404 | `Elemento comercial no encontrado` | No existe ningún elemento con ese `id`. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**
- Tiene la misma forma que cada elemento del listado, con `internalNotes` y las variantes inactivas incluidas. Puedes sembrar `qk.item(id)` con el elemento del listado (`initialData`).
- Úsalo para precargar el editor. Al guardar, envía solo los campos modificados y los arrays completos que quieras reemplazar, sin los campos de solo lectura de cada hijo (`id`, `createdAt`, `updatedAt`). Ver [Editar elemento comercial](#editar-elemento-comercial).
- Solo un elemento `PROMOTION` puede tener `promotionDetail`, y solo un `EVENT` puede tener `eventDetail`. En el resto los dos son `null`.
- Los `id` de variantes, imágenes, FAQs y horarios cambian cada vez que un PATCH reemplaza ese array: no los guardes entre ediciones.

### Editar elemento comercial
`PATCH /commercial-items/:id`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `CommercialItem` |
| ft-crm | `catalogApi.update(id: string, body: UpdateCommercialItemRequest): Promise<CommercialItem>` — nueva. Hoy no hay editor de elementos. |
| Caché | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll`. Si alguna pantalla muestra el resumen `commercialItem`, invalida también `qk.customersAll`, `qk.requestsAll` y `qk.reservationsAll`. |
| Límites | Body máx. 100 kb (413). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID del elemento. Si no lo es, 400 `Validation failed (uuid is expected)`. |

**Body**

Hay que enviar al menos un campo. Cada campo y cada hijo de `variants[]`, `images[]`, `faqs[]`, `schedules[]`, `promotionDetail` y `eventDetail` siguen las reglas de [Crear elemento comercial](#crear-elemento-comercial).

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `categoryId` | `Uuid` | No | Mueve el elemento a otra categoría. No admite `null`. Si se envía, aunque sea la misma, la categoría debe existir y estar activa. |
| `nameEs`, `nameEn` | string \| null | No | Omitido → se conserva; `null` → se borra. Debe quedar al menos uno de los dos. Sin `nameEs`, el elemento ya no se puede aprobar. |
| `descriptionEs`, `descriptionEn`, `conditions`, `internalNotes`, `availabilityNote` | string \| null | No | Omitido → se conserva; `null` → se borra. `""` da 400. |
| `basePrice` | `MoneyString` \| null | No | Omitido → se conserva; `null` → se borra. La regla de precio se evalúa con el resultado final. |
| `displayOrder` | integer | No | Entero de 0 a 1 000 000. No admite `null`. |
| `variants` | `CommercialItemVariantInput[]` | No | Reemplaza la lista completa (máx. 50). `[]` elimina todas. No admite `null`. |
| `images` | `CommercialItemImageInput[]` | No | Reemplaza la lista completa (máx. 20). `[]` elimina todas. No admite `null`. |
| `faqs` | `CommercialItemFaqInput[]` | No | Reemplaza la lista completa (máx. 50). `[]` elimina todas. No admite `null`. |
| `schedules` | `CommercialItemScheduleInput[]` | No | Reemplaza la lista completa (máx. 7, sin repetir días). `[]` elimina todos. No admite `null`. |
| `promotionDetail` | `CommercialPromotionDetailInput` \| null | No | Omitido → se conserva. `null` → se elimina (con cualquier `type`, sin error). Un objeto sustituye sus 3 campos: los que no envíes quedan en `null`. Solo con `type` `PROMOTION`. |
| `eventDetail` | `CommercialEventDetailInput` \| null | No | Igual que `promotionDetail`, solo con `type` `EVENT`. |
| `type`, `isActive`, `approvalStatus`, `id`, `category`, otros | — | Prohibido | 400 `property <campo> should not exist`. `type` no se puede cambiar; para el estado usa `/status` y para la aprobación `/approval`. |

**Ejemplo de petición**

Cambiar los precios de las variantes y desactivar una, borrar la nota interna y añadir la descripción en inglés:

```ts
const updated = await catalogApi.update("c2a4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f", {
  descriptionEn: "Beef heart skewers with golden potatoes and corn.",
  internalNotes: null,
  variants: [
    { nameEs: "Porción personal", nameEn: "Single portion", price: "27.00" },
    { nameEs: "Porción para compartir", nameEn: "Sharing portion", price: "48.00", isActive: false },
  ],
});
queryClient.setQueryData(qk.item(updated.id), updated);
await queryClient.invalidateQueries({ queryKey: qk.itemsAll });
```

`PATCH /api/backend/commercial-items/c2a4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f`:

```json
{
  "descriptionEn": "Beef heart skewers with golden potatoes and corn.",
  "internalNotes": null,
  "variants": [
    { "nameEs": "Porción personal", "nameEn": "Single portion", "price": "27.00" },
    { "nameEs": "Porción para compartir", "nameEn": "Sharing portion", "price": "48.00", "isActive": false }
  ]
}
```

Si partes del detalle del GET, quita los campos de solo lectura de cada hijo antes de enviarlo:

```ts
const toVariantInput = ({ id, createdAt, updatedAt, ...input }: CommercialItemVariant): CommercialItemVariantInput => input;
const body: UpdateCommercialItemRequest = { variants: item.variants.map(toVariantInput) };
```

**Respuesta**

```json
{
  "id": "c2a4e6f8-1b3d-4f5a-8c7e-9d0b1a2c3e4f",
  "type": "DISH",
  "categoryId": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
  "nameEs": "Anticuchos de corazón",
  "nameEn": "Beef heart skewers",
  "descriptionEs": "Brochetas de corazón de res con papas doradas y choclo.",
  "descriptionEn": "Beef heart skewers with golden potatoes and corn.",
  "basePrice": null,
  "displayOrder": 1,
  "isActive": true,
  "approvalStatus": "DRAFT",
  "conditions": "Sujeto a disponibilidad del día.",
  "internalNotes": null,
  "availabilityNote": "Solo turno noche.",
  "createdAt": "2026-11-03T02:32:11.984Z",
  "updatedAt": "2026-11-03T15:47:20.416Z",
  "category": {
    "id": "3f6b1e2a-8c4d-4f7a-9b2e-5d1c0a9e8f71",
    "nameEs": "Parrillas",
    "nameEn": "Grills",
    "isActive": true,
    "displayOrder": 10
  },
  "variants": [
    {
      "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
      "nameEs": "Porción personal",
      "nameEn": "Single portion",
      "descriptionEs": null,
      "descriptionEn": null,
      "price": "27.00",
      "isActive": true,
      "displayOrder": 0,
      "createdAt": "2026-11-03T15:47:20.416Z",
      "updatedAt": "2026-11-03T15:47:20.416Z"
    },
    {
      "id": "f2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c",
      "nameEs": "Porción para compartir",
      "nameEn": "Sharing portion",
      "descriptionEs": null,
      "descriptionEn": null,
      "price": "48.00",
      "isActive": false,
      "displayOrder": 1,
      "createdAt": "2026-11-03T15:47:20.416Z",
      "updatedAt": "2026-11-03T15:47:20.416Z"
    }
  ],
  "images": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "url": "https://cdn.example.com/fogon-andino/anticuchos.jpg",
      "altTextEs": "Anticuchos en plato de barro",
      "altTextEn": null,
      "isPrimary": true,
      "displayOrder": 0,
      "createdAt": "2026-11-03T02:32:11.984Z"
    }
  ],
  "faqs": [
    {
      "id": "b5c6d7e8-f9a0-4b1c-9d2e-3f4a5b6c7d8e",
      "questionEs": "¿Es picante?",
      "questionEn": null,
      "answerEs": "El ají se sirve aparte.",
      "answerEn": null,
      "displayOrder": 0,
      "createdAt": "2026-11-03T02:32:11.984Z",
      "updatedAt": "2026-11-03T02:32:11.984Z"
    }
  ],
  "schedules": [
    {
      "id": "d9e8f7a6-b5c4-4d3e-8f2a-1b0c9d8e7f6a",
      "dayOfWeek": "FRIDAY",
      "isAvailable": true,
      "startTime": "18:00",
      "endTime": "23:30"
    },
    {
      "id": "c8d7e6f5-a4b3-4c2d-9e1f-0a9b8c7d6e5f",
      "dayOfWeek": "SUNDAY",
      "isAvailable": false,
      "startTime": null,
      "endTime": null
    }
  ],
  "promotionDetail": null,
  "eventDetail": null
}
```

**Errores**

Orden de las comprobaciones: sesión y rol; UUID y DTO; body vacío; después, en una transacción, existencia, categoría, nombres, variantes, regla de precio, tipo de detalle, imágenes, horarios y fechas de los detalles.

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | Mensajes de validación de [Crear elemento comercial](#crear-elemento-comercial) | Los mismos, salvo los de `type`, que aquí es un campo prohibido. Casos típicos: `categoryId: null` → `categoryId must be a UUID`; `displayOrder: null` → los tres de `displayOrder`; `variants: null` → `variants must be an array`…; `schedules: [null]` → `schedules.each value in nested property schedules must be either object or array`. |
| 400 | `property <campo> should not exist` | `type`, `isActive`, `approvalStatus`, `id` u otro campo no declarado; o hijos reenviados con `id`, `createdAt` o `updatedAt` (`variants.<i>.property id should not exist`, `promotionDetail.property id should not exist`…). |
| 400 | `Debes proporcionar al menos un campo para actualizar` | El body es `{}`. Se comprueba antes de buscar el elemento: con un `id` inexistente también da 400. |
| 400 | `La categoría comercial no existe` · `La categoría comercial está inactiva` | Se envió `categoryId` de una categoría inexistente o inactiva (también si es la actual). |
| 400 | `El elemento comercial debe tener al menos un nombre en español o inglés` | El cambio dejaría el elemento sin nombres. |
| 400 | `Cada variante debe tener al menos un nombre en español o inglés` · `Las variantes no pueden duplicarse` | El array `variants` enviado incumple sus reglas. |
| 400 | `Un plato o bebida debe tener un precio base o variantes activas, pero no ambos` | En un `DISH` o `BEVERAGE`, el resultado queda sin precio o con los dos mecanismos. Cuenta el `basePrice` final y las variantes activas finales (las enviadas o, si no envías `variants`, las actuales). |
| 400 | `promotionDetail solo corresponde a elementos PROMOTION` · `eventDetail solo corresponde a elementos EVENT` | Se envió un detalle como objeto que no corresponde al `type` del elemento. |
| 400 | `Las imágenes no pueden duplicarse` · `Un elemento comercial solo puede tener una imagen principal` | El array `images` enviado incumple sus reglas. |
| 400 | `No puede repetirse un día en los horarios del elemento` · `Los horarios comerciales son incoherentes` | Respaldo del servicio; el DTO rechaza antes esos casos. |
| 400 | `validFrom no puede ser posterior a validUntil` · `startAt no puede ser posterior a endAt` | El detalle enviado tiene el rango invertido. |
| 400 | `validFrom debe ser una fecha válida` · `validUntil debe ser una fecha válida` · `startAt debe ser una fecha válida` · `endAt debe ser una fecha válida` | Respaldo del servicio; el DTO rechaza antes las fechas inválidas. |
| 400 | `La operación contiene referencias o valores comerciales inválidos` | Defensivo: solo con una clave foránea rota (Prisma P2003). El servicio comprueba antes la categoría en la misma transacción, y una restricción `CHECK` llega como 500, no aquí. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 404 | `Elemento comercial no encontrado` | No existe ningún elemento con ese `id`. |
| 409 | `La operación contiene datos comerciales duplicados` | La base de datos rechaza un duplicado (Prisma P2002). Respaldo: el servicio detecta antes los duplicados. |
| 409 | `La operación comercial entró en conflicto; inténtalo nuevamente` | Conflicto con otra escritura simultánea que siguió tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |
| 500 | `Ocurrió un error interno` | El nombre enviado que se normaliza (`nameEs`, o `nameEn` si falta, del elemento o de una variante) está formado solo por signos diacríticos sueltos y espacios (p. ej. `^`, `` ` `` o `´`): su forma normalizada queda vacía y la base de datos la rechaza (restricción `CHECK`). |

**Efectos**
- **Vuelta a borrador:** si el elemento estaba `APPROVED`, cualquier PATCH exitoso lo deja en `DRAFT`, aunque solo cambie `displayOrder`. Los que estaban en `DRAFT` o `REJECTED` conservan su estado. Hasta que se vuelva a aprobar, deja de llegar a Samanta y no se puede elegir en solicitudes o reservas nuevas. Las solicitudes y reservas que ya lo tienen lo conservan.
- **Campos simples:** se actualizan solo los enviados. `updatedAt` cambia siempre.
- **Arrays:** cada array enviado se reemplaza entero. Se borran todos los registros anteriores de ese tipo y se crean los enviados, con `id`, `createdAt` y `updatedAt` nuevos. Los arrays que no envías no cambian.
- **Detalles:** un objeto actualiza el registro existente (conserva su `id` y su `createdAt`) o lo crea si no existe. `null` lo elimina.
- Todo ocurre en una sola transacción serializable: si falla una parte, no se guarda nada.
- Si el elemento estaba entre los que ve Samanta, los borradores pendientes quedan desactualizados (pasan a `STALE`; ver [Generar un borrador con Samanta](#generar-un-borrador-con-samanta)).

**Notas para el frontend**
- Antes de guardar un elemento `APPROVED`, avisa de que volverá a `DRAFT` y ofrece aprobarlo de nuevo al terminar.
- Envía solo los campos modificados. `null` borra; `""` da 400. `categoryId` y `displayOrder` no admiten `null`.
- Para editar una sola variante, imagen, FAQ u horario, reenvía el array completo con el cambio: no hay endpoints para hijos sueltos.
- La regla de precio se evalúa con el estado final. Para pasar un `DISH` de precio base a variantes, envía en la misma petición `{ "basePrice": null, "variants": [...] }`.
- Envía `categoryId` solo si cambió. Si la categoría actual está inactiva y la reenvías, da 400. Sin `categoryId`, el elemento se puede editar aunque su categoría esté inactiva.
- `type` no se puede cambiar: para otro tipo, crea un elemento nuevo.
- Un body `{}` responde 400 y no toca el elemento ni su aprobación.
- No hay control de concurrencia: si dos ADMIN editan a la vez, gana el último en guardar.

### Activar o desactivar un elemento comercial
`PATCH /commercial-items/:id/status`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `CommercialItem` |
| ft-crm | `catalogApi.setActive(id: string, isActive: boolean): Promise<CommercialItem>` — existe. La usa el interruptor de `ServiciosView` con actualización optimista. |
| Caché | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll`. `ServiciosView` parchea la página (`patchItemInPage`), la reemplaza con la respuesta y refresca `qk.itemsAll` cuando termina el último cambio pendiente. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID del elemento. Si no lo es, 400 `Validation failed (uuid is expected)`. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `isActive` | boolean | Sí | Booleano JSON (`"false"` → 400). |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist`. |

**Ejemplo de petición**

```ts
const item = await catalogApi.setActive("1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a", false);
```

`PATCH /api/backend/commercial-items/1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a/status`:

```json
{ "isActive": false }
```

**Respuesta**

```json
{
  "id": "1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a",
  "type": "SERVICE",
  "categoryId": "8e0a2c4d-6f8b-4d0e-a2c4-6e8a0c2e4a6c",
  "nameEs": "Decoración de cumpleaños",
  "nameEn": "Birthday decoration",
  "descriptionEs": "Globos, mantel temático y postre con vela para la mesa.",
  "descriptionEn": null,
  "basePrice": "60.00",
  "displayOrder": 0,
  "isActive": false,
  "approvalStatus": "APPROVED",
  "conditions": "Solicitar con 24 horas de anticipación.",
  "internalNotes": "Proveedor externo de globos; confirmar por WhatsApp.",
  "availabilityNote": null,
  "createdAt": "2026-10-10T14:22:31.778Z",
  "updatedAt": "2026-11-03T02:32:11.984Z",
  "category": {
    "id": "8e0a2c4d-6f8b-4d0e-a2c4-6e8a0c2e4a6c",
    "nameEs": "Servicios",
    "nameEn": "Services",
    "isActive": true,
    "displayOrder": 40
  },
  "variants": [
    {
      "id": "2e4a6c8e-0a2c-4e6a-8c0e-2a4c6e8a0c2e",
      "nameEs": "Paquete premium",
      "nameEn": "Premium package",
      "descriptionEs": "Incluye arreglo floral y torta pequeña.",
      "descriptionEn": null,
      "price": "95.00",
      "isActive": true,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z",
      "updatedAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "images": [
    {
      "id": "3a5c7e9a-1c3e-4a7c-9e1a-3c5e7a9c1e3a",
      "url": "https://cdn.example.com/fogon-andino/decoracion-cumple.jpg",
      "altTextEs": "Mesa decorada con globos",
      "altTextEn": "Table decorated with balloons",
      "isPrimary": true,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "faqs": [
    {
      "id": "4c6e8a0c-2e4a-4c8e-a0c2-4e6a8c0e2a4c",
      "questionEs": "¿Puedo traer mi propia torta?",
      "questionEn": null,
      "answerEs": "Sí, sin costo adicional.",
      "answerEn": null,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z",
      "updatedAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "schedules": [
    {
      "id": "5e7a9c1e-3a5c-4e9a-b1c3-5a7c9e1a3c5e",
      "dayOfWeek": "SATURDAY",
      "isAvailable": true,
      "startTime": "12:00",
      "endTime": "22:00"
    }
  ],
  "promotionDetail": null,
  "eventDetail": null
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `isActive must be a boolean value` | Falta `isActive` o no es un booleano JSON. |
| 400 | `property <campo> should not exist` | Se enviaron otros campos (p. ej. `approvalStatus`). |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 404 | `Elemento comercial no encontrado` | No existe ningún elemento con ese `id`. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |

**Efectos**
- Cambia `isActive` y `updatedAt`. No cambia `approvalStatus`, el contenido ni los hijos.
- Inactivo, el elemento deja de llegar a Samanta (los borradores pendientes que lo incluían quedan desactualizados) y no se puede elegir en solicitudes o reservas nuevas: 400 `El elemento comercial debe estar activo y aprobado`. Las que ya lo tienen lo conservan.
- Activar un elemento `APPROVED` de una categoría activa lo vuelve a poner en la lista de Samanta: si entra entre los 30 que ve, también deja desactualizados los borradores pendientes.
- Se puede seguir registrando como interés de un cliente.

**Notas para el frontend**
- Es idempotente: repetir el mismo valor no da error (aunque `updatedAt` cambia).
- No existe borrado de elementos: desactivarlo es la forma de retirarlo.
- Se puede activar un elemento de una categoría inactiva, pero Samanta no lo verá hasta reactivar la categoría.
- Ignora los clics repetidos mientras hay un cambio en curso para el mismo elemento (`ServiciosView` ya lo hace) y revierte el cambio optimista si falla.

### Cambiar la aprobación de un elemento comercial
`PATCH /commercial-items/:id/approval`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 200 · `CommercialItem` |
| ft-crm | `catalogApi.setApproval(id: string, approvalStatus: CommercialApprovalStatus): Promise<CommercialItem>` — existe. `ServiciosView` solo la usa para aprobar (botón «Aprobar» en elementos `DRAFT` o `REJECTED`). |
| Caché | `setQueryData(qk.item(id), respuesta)` e invalida `qk.itemsAll`. `ServiciosView` reemplaza el elemento en la página (`replaceItemInPage`) y refresca `qk.itemsAll`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | UUID del elemento. Si no lo es, 400 `Validation failed (uuid is expected)`. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `approvalStatus` | `CommercialApprovalStatus` | Sí | `DRAFT`, `APPROVED` o `REJECTED`, en mayúsculas. |
| Cualquier otro campo | — | Prohibido | 400 `property <campo> should not exist` (no hay campo de motivo). |

**Ejemplo de petición**

```ts
const item = await catalogApi.setApproval("1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a", "APPROVED");
```

`PATCH /api/backend/commercial-items/1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a/approval`:

```json
{ "approvalStatus": "APPROVED" }
```

**Respuesta**

```json
{
  "id": "1c3e5a7b-9d1f-4b3d-8f5a-7c9e1b3d5f7a",
  "type": "SERVICE",
  "categoryId": "8e0a2c4d-6f8b-4d0e-a2c4-6e8a0c2e4a6c",
  "nameEs": "Decoración de cumpleaños",
  "nameEn": "Birthday decoration",
  "descriptionEs": "Globos, mantel temático y postre con vela para la mesa.",
  "descriptionEn": null,
  "basePrice": "60.00",
  "displayOrder": 0,
  "isActive": true,
  "approvalStatus": "APPROVED",
  "conditions": "Solicitar con 24 horas de anticipación.",
  "internalNotes": "Proveedor externo de globos; confirmar por WhatsApp.",
  "availabilityNote": null,
  "createdAt": "2026-10-10T14:22:31.778Z",
  "updatedAt": "2026-10-12T10:03:47.150Z",
  "category": {
    "id": "8e0a2c4d-6f8b-4d0e-a2c4-6e8a0c2e4a6c",
    "nameEs": "Servicios",
    "nameEn": "Services",
    "isActive": true,
    "displayOrder": 40
  },
  "variants": [
    {
      "id": "2e4a6c8e-0a2c-4e6a-8c0e-2a4c6e8a0c2e",
      "nameEs": "Paquete premium",
      "nameEn": "Premium package",
      "descriptionEs": "Incluye arreglo floral y torta pequeña.",
      "descriptionEn": null,
      "price": "95.00",
      "isActive": true,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z",
      "updatedAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "images": [
    {
      "id": "3a5c7e9a-1c3e-4a7c-9e1a-3c5e7a9c1e3a",
      "url": "https://cdn.example.com/fogon-andino/decoracion-cumple.jpg",
      "altTextEs": "Mesa decorada con globos",
      "altTextEn": "Table decorated with balloons",
      "isPrimary": true,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "faqs": [
    {
      "id": "4c6e8a0c-2e4a-4c8e-a0c2-4e6a8c0e2a4c",
      "questionEs": "¿Puedo traer mi propia torta?",
      "questionEn": null,
      "answerEs": "Sí, sin costo adicional.",
      "answerEn": null,
      "displayOrder": 0,
      "createdAt": "2026-10-10T14:22:31.778Z",
      "updatedAt": "2026-10-10T14:22:31.778Z"
    }
  ],
  "schedules": [
    {
      "id": "5e7a9c1e-3a5c-4e9a-b1c3-5a7c9e1a3c5e",
      "dayOfWeek": "SATURDAY",
      "isAvailable": true,
      "startTime": "12:00",
      "endTime": "22:00"
    }
  ],
  "promotionDetail": null,
  "eventDetail": null
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `approvalStatus must be one of the following values: DRAFT, APPROVED, REJECTED` | Falta, es otro valor o va en minúsculas. |
| 400 | `property <campo> should not exist` | Se enviaron otros campos (p. ej. `isActive` o un motivo). |
| 400 | `El elemento necesita un nombre en español antes de aprobarse` | Se pide `APPROVED` y el elemento no tiene `nameEs`. |
| 400 | `No se puede aprobar un elemento de una categoría inactiva` | Se pide `APPROVED` y la categoría está desactivada. |
| 400 | `Un plato o bebida debe tener un precio base o variantes activas, pero no ambos` | Se pide `APPROVED` para un `DISH` o `BEVERAGE` que incumple la regla de precio. Con datos guardados por la API no ocurre: crear y editar ya aplican la regla. |
| 400 | `La operación contiene referencias o valores comerciales inválidos` | No ocurre: el servicio lo reserva para Prisma P2003 o P2004, este cambio no toca claves foráneas y Prisma 7 ya no emite P2004. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (OWNER, OPERATOR o SUPPORT). |
| 404 | `Elemento comercial no encontrado` | No existe ningún elemento con ese `id`. |
| 409 | `La operación contiene datos comerciales duplicados` | La base de datos rechaza un duplicado (Prisma P2002). No debería ocurrir: este cambio no crea registros. |
| 409 | `La operación comercial entró en conflicto; inténtalo nuevamente` | Conflicto con otra escritura simultánea que siguió tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | Body de más de 100 kb. |

**Efectos**
- Cambia `approvalStatus` y `updatedAt`. No cambia `isActive` ni el contenido.
- `APPROVED` + `isActive: true`: el elemento se puede elegir en solicitudes y reservas. Si además su categoría está activa, Samanta puede recibirlo (ver [Estados y transiciones](#estados-y-transiciones-1)).
- Pasar un elemento que Samanta veía a `DRAFT` o `REJECTED`, o aprobar uno nuevo que entra en su lista, deja desactualizados los borradores pendientes.
- No guarda quién aprobó o rechazó, ni cuándo, ni por qué.

**Notas para el frontend**
- Se permite cualquier transición entre `DRAFT`, `APPROVED` y `REJECTED`, en cualquier orden, sin flujo obligatorio. Repetir el mismo valor no da error.
- Solo `APPROVED` tiene requisitos (`nameEs`, categoría activa y, en `DISH` y `BEVERAGE`, la regla de precio), y se comprueban cada vez: reaprobar un elemento ya aprobado cuya categoría se desactivó da 400.
- No depende de `isActive`: se puede aprobar un elemento inactivo, pero no será usable hasta activarlo.
- El catálogo inicial del seed (86 elementos en `DRAFT`) tiene 9 elementos sin `nameEs`. Para aprobarlos, primero añade el nombre con `PATCH /commercial-items/:id`. Muestra el 400 junto a la acción «Aprobar» y ofrece editar el nombre.
- Samanta recibe como máximo 30 elementos activos y aprobados de categorías activas, ordenados por el `displayOrder` del elemento y después por `id`, sin importar la categoría. Usa `displayOrder` bajo para lo que deba ver primero.
- Para rechazar o devolver a borrador, añade acciones que llamen a `setApproval(id, "REJECTED")` o `setApproval(id, "DRAFT")`. Hoy `ServiciosView` solo aprueba.
- Cualquier edición posterior con `PATCH /commercial-items/:id` devuelve el elemento a `DRAFT`.

### Modelos

Todas las fechas son instantes ISO 8601 en UTC con milisegundos (`"2026-11-03T16:42:08.215Z"`). Todos los campos llegan siempre: los vacíos vienen en `null`, nunca omitidos.

#### `RestaurantConfig`

Lo devuelven `GET` y `PUT /restaurant-config`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Identificador de la configuración global. No cambia entre PUT. |
| `businessName` | string | No | Nombre comercial (hasta 150). |
| `logoUrl` | string | Sí | URL del logo (http/https). |
| `description` | string | Sí | Descripción del negocio (hasta 2000). Samanta la recibe. |
| `address` | string | No | Dirección (hasta 300). |
| `latitude` | number | Sí | Latitud con hasta 7 decimales. `null` junto con `longitude`. |
| `longitude` | number | Sí | Longitud con hasta 7 decimales. |
| `whatsappNumber` | string | No | Número del negocio en E.164 (`+51987654321`). Solo informativo. |
| `email` | string | No | Correo de contacto, en minúsculas. |
| `website` | string | Sí | Sitio web (http/https). |
| `currency` | `CurrencyCode` | No | Moneda del restaurante. |
| `timeZone` | string | No | Zona IANA en la que se muestran las fechas. |
| `reservationPolicy` | string | No | Política de reservas (hasta 5000). |
| `cancellationPolicy` | string | No | Política de cancelación (hasta 5000). |
| `responseTimeoutMinutes` | number | No | Entero de 1 a 1440. Hoy solo se guarda. |
| `approvalResponsibleId` | `Uuid` | Sí | Usuario OWNER responsable de aprobaciones. Hoy solo se guarda. |
| `approvalResponsible` | `ApprovalResponsible` | Sí | Datos públicos de ese usuario; `null` si no hay responsable. |
| `languages` | `LanguageCode[]` | No | De 1 a 3 idiomas, en orden `ES`, `EN`, `PT`. |
| `schedules` | `RestaurantSchedule[]` | No | Horario semanal: 7 entradas, de `MONDAY` a `SUNDAY`. |
| `createdAt` | `IsoDateTime` | No | Primera vez que se guardó. |
| `updatedAt` | `IsoDateTime` | No | Último PUT. |

`ApprovalResponsible`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del usuario. |
| `firstName` | string | No | Nombre. |
| `lastName` | string | No | Apellido. |
| `email` | string | No | Correo de acceso del usuario. |

`RestaurantSchedule`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `dayOfWeek` | `DayOfWeek` | No | Día. |
| `isOpen` | boolean | No | Si el restaurante abre ese día. |
| `openTime` | `HhMm` | Sí | Apertura; `null` si el día está cerrado. |
| `closeTime` | `HhMm` | Sí | Cierre, posterior a `openTime` el mismo día; `null` si el día está cerrado. |

#### `CommercialCategory`

La devuelven todas las rutas de `/commercial-categories`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Identificador. |
| `nameEs` | string | Sí | Nombre en español. Al menos uno de los dos nombres tiene valor. |
| `nameEn` | string | Sí | Nombre en inglés. |
| `descriptionEs` | string | Sí | Descripción en español. |
| `descriptionEn` | string | Sí | Descripción en inglés. |
| `isActive` | boolean | No | Si admite elementos nuevos y aprobaciones y si Samanta ve sus elementos. |
| `displayOrder` | number | No | Orden de presentación (0 a 1 000 000; menor primero). |
| `createdAt` | `IsoDateTime` | No | Alta. |
| `updatedAt` | `IsoDateTime` | No | Último cambio. |

#### `CommercialItem`

Lo devuelven `POST`, `GET`, `GET /:id` y los tres `PATCH` de `/commercial-items`, siempre con todos sus hijos.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Identificador. |
| `type` | `CommercialItemType` | No | Tipo. No cambia nunca. |
| `categoryId` | `Uuid` | No | Categoría a la que pertenece. |
| `nameEs` | string | Sí | Nombre en español. Obligatorio para aprobar. |
| `nameEn` | string | Sí | Nombre en inglés. Al menos uno de los dos tiene valor. |
| `descriptionEs` | string | Sí | Descripción en español. |
| `descriptionEn` | string | Sí | Descripción en inglés. |
| `basePrice` | `MoneyString` | Sí | Precio base con 2 decimales. |
| `displayOrder` | number | No | Orden dentro de la categoría y para Samanta (menor primero). |
| `isActive` | boolean | No | Si está a la venta. |
| `approvalStatus` | `CommercialApprovalStatus` | No | Estado de aprobación. |
| `conditions` | string | Sí | Condiciones comerciales. Samanta las recibe. |
| `internalNotes` | string | Sí | Nota interna del equipo. Samanta no la recibe. |
| `availabilityNote` | string | Sí | Nota de disponibilidad. Samanta la recibe. |
| `createdAt` | `IsoDateTime` | No | Alta. |
| `updatedAt` | `IsoDateTime` | No | Último cambio (también de estado o de aprobación). |
| `category` | `CommercialItemCategorySummary` | No | Resumen de la categoría. |
| `variants` | `CommercialItemVariant[]` | No | Todas las variantes, también las inactivas, por `displayOrder` y `createdAt`. `[]` si no hay. |
| `images` | `CommercialItemImage[]` | No | Imágenes por `displayOrder` y `createdAt`. |
| `faqs` | `CommercialItemFaq[]` | No | Preguntas frecuentes por `displayOrder` y `createdAt`. |
| `schedules` | `CommercialItemSchedule[]` | No | Solo los días configurados, de `MONDAY` a `SUNDAY`. |
| `promotionDetail` | `CommercialPromotionDetail` | Sí | Solo puede existir en `PROMOTION`. |
| `eventDetail` | `CommercialEventDetail` | Sí | Solo puede existir en `EVENT`. |

`CommercialItemCategorySummary`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id de la categoría. |
| `nameEs` | string | Sí | Nombre en español. |
| `nameEn` | string | Sí | Nombre en inglés. |
| `isActive` | boolean | No | Si la categoría está activa. |
| `displayOrder` | number | No | Orden de la categoría. |

`CommercialItemVariant`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Cambia cada vez que un PATCH reemplaza las variantes. |
| `nameEs` | string | Sí | Nombre en español. Al menos uno de los dos tiene valor. |
| `nameEn` | string | Sí | Nombre en inglés. |
| `descriptionEs` | string | Sí | Descripción en español. |
| `descriptionEn` | string | Sí | Descripción en inglés. |
| `price` | `MoneyString` | No | Precio con 2 decimales. |
| `isActive` | boolean | No | Solo las activas cuentan para la regla de precio y llegan a Samanta. |
| `displayOrder` | number | No | Orden. |
| `createdAt` | `IsoDateTime` | No | Alta (la del último reemplazo). |
| `updatedAt` | `IsoDateTime` | No | Último cambio. |

`CommercialItemImage`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Cambia con cada reemplazo de `images`. |
| `url` | string | No | URL de la imagen. |
| `altTextEs` | string | Sí | Texto alternativo en español. |
| `altTextEn` | string | Sí | Texto alternativo en inglés. |
| `isPrimary` | boolean | No | Imagen principal; como máximo una por elemento. |
| `displayOrder` | number | No | Orden. |
| `createdAt` | `IsoDateTime` | No | Alta. Las imágenes no tienen `updatedAt`. |

`CommercialItemFaq`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Cambia con cada reemplazo de `faqs`. |
| `questionEs` | string | No | Pregunta en español. |
| `questionEn` | string | Sí | Pregunta en inglés. |
| `answerEs` | string | No | Respuesta en español. |
| `answerEn` | string | Sí | Respuesta en inglés. |
| `displayOrder` | number | No | Orden. |
| `createdAt` | `IsoDateTime` | No | Alta. |
| `updatedAt` | `IsoDateTime` | No | Último cambio. |

`CommercialItemSchedule`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Cambia con cada reemplazo de `schedules`. |
| `dayOfWeek` | `DayOfWeek` | No | Día, único por elemento. |
| `isAvailable` | boolean | No | Si el elemento está disponible ese día. |
| `startTime` | `HhMm` | Sí | Inicio; `null` si no está disponible. |
| `endTime` | `HhMm` | Sí | Fin; puede ser anterior a `startTime` (cruza la medianoche). `null` si no está disponible. |

`CommercialPromotionDetail`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Se conserva al actualizar el detalle con un objeto. |
| `validFrom` | `IsoDateTime` | Sí | Inicio de la vigencia. |
| `validUntil` | `IsoDateTime` | Sí | Fin de la vigencia (igual o posterior a `validFrom`). |
| `promotionalPrice` | `MoneyString` | Sí | Precio promocional con 2 decimales. |
| `createdAt` | `IsoDateTime` | No | Alta del detalle. |
| `updatedAt` | `IsoDateTime` | No | Último cambio del detalle. |

`CommercialEventDetail`:

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Se conserva al actualizar el detalle con un objeto. |
| `startAt` | `IsoDateTime` | Sí | Inicio del evento. |
| `endAt` | `IsoDateTime` | Sí | Fin del evento (igual o posterior a `startAt`). |
| `capacity` | number | Sí | Aforo (1 a 1 000 000). Samanta no lo recibe. |
| `createdAt` | `IsoDateTime` | No | Alta del detalle. |
| `updatedAt` | `IsoDateTime` | No | Último cambio del detalle. |

El backend no expone `sourceKey` ni los nombres normalizados (`normalizedNameEs`, `normalizedNameEn`, `normalizedName`) que guarda en la base de datos.

### Estados y transiciones

#### `CommercialApprovalStatus` (elemento comercial)

| Valor | Significado |
|---|---|
| `DRAFT` | Borrador. Estado inicial y estado al que vuelve un elemento aprobado cuando se edita. No llega a Samanta ni se puede elegir en solicitudes o reservas. |
| `APPROVED` | Aprobado. Con `isActive: true` se puede elegir en solicitudes y reservas; si además la categoría está activa, Samanta puede recibirlo. |
| `REJECTED` | Rechazado. Mismo efecto que `DRAFT`; solo informa de la decisión. |

Transiciones manuales, con `PATCH /commercial-items/:id/approval` (solo ADMIN):

| Desde | Hacia | Condiciones |
|---|---|---|
| Cualquiera | `APPROVED` | `nameEs` con texto, categoría activa y, en `DISH` o `BEVERAGE`, la regla de precio. Se comprueban también al reaprobar. |
| Cualquiera | `DRAFT` o `REJECTED` | Ninguna. |

Transiciones automáticas:

| Cuándo | Cambio |
|---|---|
| `POST /commercial-items` | Nace en `DRAFT`. |
| `PATCH /commercial-items/:id` con éxito | `APPROVED` → `DRAFT`. `DRAFT` y `REJECTED` no cambian. Un body `{}` (400) no cambia nada. |

Errores de una transición no permitida (400): `El elemento necesita un nombre en español antes de aprobarse`, `No se puede aprobar un elemento de una categoría inactiva` y `Un plato o bebida debe tener un precio base o variantes activas, pero no ambos`.

Ni `PATCH /commercial-items/:id/status` ni los cambios de la categoría alteran `approvalStatus`.

#### `isActive` del elemento

| Valor | Significado |
|---|---|
| `true` | A la venta. Valor inicial al crearlo. |
| `false` | Retirado: no llega a Samanta ni se puede elegir en solicitudes o reservas nuevas. Es la forma de «borrar» (no hay `DELETE`). |

Se cambia solo con `PATCH /commercial-items/:id/status` (ADMIN), en cualquier sentido y sin condiciones. No hay cambios automáticos.

#### `isActive` de la categoría

| Valor | Significado |
|---|---|
| `true` | Valor inicial. Admite elementos nuevos y aprobaciones. |
| `false` | No admite elementos nuevos ni que se muevan a ella (400 `La categoría comercial está inactiva`), no deja aprobar sus elementos (400 `No se puede aprobar un elemento de una categoría inactiva`) y Samanta deja de ver sus elementos. |

Se cambia solo con `PATCH /commercial-categories/:id/status` (ADMIN), sin condiciones. No modifica el `isActive` ni el `approvalStatus` de sus elementos.

#### Quién puede usar cada elemento

| Elemento | Categoría | Samanta | Solicitudes y reservas (crear o cambiar el elemento) | Intereses de clientes |
|---|---|---|---|---|
| Activo y `APPROVED` | Activa | Sí, si entra entre los 30 primeros por `displayOrder` e `id` | Sí | Sí |
| Activo y `APPROVED` | Inactiva | No | Sí | Sí |
| Inactivo, `DRAFT` o `REJECTED` | Cualquiera | No | No: 400 `El elemento comercial debe estar activo y aprobado` | Sí |

Las solicitudes y reservas que ya tienen un elemento lo conservan aunque después se desactive o deje de estar aprobado.

#### Configuración del restaurante

No tiene estados: existe (200) o no existe (404). El primer `PUT /restaurant-config` la crea y ya no se puede borrar. Mientras no existe, crear solicitudes o reservas y usar Samanta responden 409.

### Preguntas abiertas

1. **Imágenes y logo:** la API solo acepta URLs `http(s)` de imágenes ya alojadas y no hay endpoint de subida. ¿Dónde y cómo alojará el frontend esas imágenes?
2. **Auditoría de la aprobación:** no se guarda quién aprobó o rechazó un elemento, cuándo ni por qué (está como `TODO` en el servicio). ¿La pantalla de aprobación necesita esa información?
3. **Búsqueda sin tildes:** `GET /commercial-items?search=` usa `contains` sin distinguir mayúsculas (ILIKE), pero sí distingue tildes: `cafe` no encuentra `Café`. ¿Se necesita una búsqueda insensible a tildes?
4. **Categorías inactivas en solicitudes y reservas:** desactivar una categoría oculta sus elementos a Samanta e impide aprobarlos, pero las solicitudes y reservas siguen aceptando sus elementos activos y aprobados. ¿Es intencional, o el backend también debería rechazarlos?
5. **Qué elementos ve Samanta:** recibe como máximo 30 elementos (por `displayOrder` e `id`, sin agrupar por categoría), con hasta 10 variantes activas y 10 FAQs cada uno. Ninguna ruta indica cuáles entran. ¿Se expondrá esa lista o un aviso de que el catálogo supera el límite?
6. **Campos sin uso:** `responseTimeoutMinutes` y `approvalResponsibleId` se guardan, pero ningún proceso del backend los usa (tampoco `whatsappNumber`, `logoUrl`, `website`, `email` ni las coordenadas). ¿Qué flujo los usará (p. ej. la aprobación del dueño) y qué debe mostrar hoy la UI?
7. **Coordenadas muy pequeñas:** una `latitude` o `longitude` distinta de 0 con valor absoluto menor que 0,000001 que JavaScript escribe sin punto decimal (`1e-7`) provoca un 500 en la validación; con punto (`1.5e-7`) pasa aunque tenga más de 7 decimales. ¿Se corregirá en el backend? Mientras tanto, ft-crm las redondea (`normalizeCoordinate()`).
8. **Concurrencia:** `PUT /restaurant-config` y `PATCH /commercial-items/:id` no tienen control de versión: gana la última escritura. ¿Se añadirá una comprobación (p. ej. de `updatedAt`) para avisar de cambios simultáneos?
9. **Borrado:** no hay `DELETE` de categorías ni de elementos; solo se desactivan. ¿Es definitivo?
10. **Nombres que se normalizan vacíos:** un nombre de categoría, elemento o variante formado solo por signos diacríticos sueltos (`^`, `´`) pasa la validación y termina en 500 por una restricción `CHECK`. ¿Debería el backend rechazarlo con 400?

### Tipos TypeScript

Bloque autocontenido que compila con `tsc --strict`. Usa los nombres de `ft-crm/src/lib/api/types.ts`; los tipos compartidos (`Uuid`, `HhMm`, `Paginated`…) tienen la misma definición que allí, así que en el frontend decláralos una sola vez.

- Donde la forma de ft-crm no coincide con el backend (`CommercialItem`, `CreateCommercialItemRequest`, `ApiErrorBody`), este bloque trae la correcta.
- `PutRestaurantConfigRequest` y `RestaurantScheduleInput` admiten además omitir los opcionales, como el backend. La forma de ft-crm, con `null` explícito, sigue siendo válida.
- Los ejemplos JSON de este archivo cumplen estos tipos, salvo el body mínimo de `PUT /restaurant-config`, que muestra a propósito las conversiones del backend.

```ts
/* =====================================================================
 * bk-crm · Configuración del restaurante y catálogo comercial
 * Tipos para el frontend. Los nombres coinciden con ft-crm/src/lib/api/types.ts;
 * donde la forma de ft-crm no coincide con el backend, aquí está la correcta.
 * ===================================================================== */

// ---------- Compartidos (misma definición que ft-crm) ----------

/** Identificador UUID. */
export type Uuid = string;
/** Instante ISO 8601. Respuesta: UTC con milisegundos ("2026-11-03T16:42:08.215Z"). */
export type IsoDateTime = string;
/** "HH:mm" 00:00–23:59 */
export type HhMm = string;
/** Importe decimal como string. Entrada: MONEY_PATTERN ("39.9"). Respuesta: siempre 2 decimales ("39.90"). */
export type MoneyString = string;

/** Lectura: ADMIN, OWNER, OPERATOR. Escritura: solo ADMIN. SUPPORT no tiene acceso. */
export type RoleCode = "ADMIN" | "OWNER" | "OPERATOR" | "SUPPORT";

export type CurrencyCode = "PEN" | "USD";
export const LANGUAGE_CODES = ["ES", "EN", "PT"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
export const DAYS_OF_WEEK = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  /** Math.ceil(total / limit); 0 cuando total = 0 */
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

/** Límite máximo de `limit` en todos los listados paginados. */
export const MAX_PAGE_SIZE = 100;

/** `code` que añade el BFF de este frontend; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/** Cuerpo de error: `message` es string[] en la validación del DTO y string en el resto. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** Texto del código HTTP ("Bad Request"…). No llega en los errores del BFF (401, 503 y 504 con `code`) ni en el 500. */
  error?: string;
  /** Solo lo añade el BFF. */
  code?: BffErrorCode;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  path?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  method?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  timestamp?: IsoDateTime;
}

// ---------- Validación (mismas expresiones que el backend) ----------

/** Importe: de "0" a "99999999.99", punto decimal, hasta 2 decimales, sin signo ni ceros a la izquierda. */
export const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
/** Hora "HH:mm" de 24 h. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** WhatsApp del negocio en E.164. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
/** Fechas de promociones y eventos: segundos y zona obligatorios, hasta 3 decimales. */
export const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

// ---------- Configuración del restaurante ----------

/** Datos públicos del responsable de aprobación (usuario activo con rol OWNER). */
export interface ApprovalResponsible {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
}

/** Horario de un día en la respuesta. */
export interface RestaurantSchedule {
  dayOfWeek: DayOfWeek;
  isOpen: boolean;
  /** null si el día está cerrado. */
  openTime: HhMm | null;
  /** Posterior a openTime el mismo día; null si el día está cerrado. */
  closeTime: HhMm | null;
}

/** Respuesta de GET y PUT /restaurant-config. */
export interface RestaurantConfig {
  id: Uuid;
  businessName: string;
  logoUrl: string | null;
  description: string | null;
  address: string;
  /** Número (nunca string) o null. */
  latitude: number | null;
  longitude: number | null;
  /** E.164: "+51987654321" */
  whatsappNumber: string;
  /** En minúsculas. */
  email: string;
  website: string | null;
  currency: CurrencyCode;
  /** IANA, p. ej. "America/Lima". Zona en la que se muestran todas las fechas. */
  timeZone: string;
  reservationPolicy: string;
  cancellationPolicy: string;
  /** 1–1440 minutos. */
  responseTimeoutMinutes: number;
  approvalResponsibleId: Uuid | null;
  approvalResponsible: ApprovalResponsible | null;
  /** Ordenados ES, EN, PT. */
  languages: LanguageCode[];
  /** Siempre 7, de lunes a domingo. */
  schedules: RestaurantSchedule[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/**
 * Horario de un día en PUT /restaurant-config. Abierto: openTime < closeTime el mismo día.
 * Cerrado: sin horas (null u omitidas; ft-crm envía null).
 */
export type RestaurantScheduleInput =
  | { dayOfWeek: DayOfWeek; isOpen: true; openTime: HhMm; closeTime: HhMm }
  | { dayOfWeek: DayOfWeek; isOpen: false; openTime?: null; closeTime?: null };

/** Body de PUT /restaurant-config: reemplazo completo (los opcionales omitidos o null quedan en null). */
export interface PutRestaurantConfigRequest {
  /** 1–150 tras recortar. */
  businessName: string;
  /** URL http(s) con dominio o IP, máx. 2048. Para borrarla, null; nunca "". */
  logoUrl?: string | null;
  /** 1–2000. */
  description?: string | null;
  /** 1–300. */
  address: string;
  /** −90..90, hasta 7 decimales. Junto con longitude o ninguna. */
  latitude?: number | null;
  /** −180..180, hasta 7 decimales. */
  longitude?: number | null;
  /** E.164 sin espacios. */
  whatsappNumber: string;
  /** Se guarda recortado y en minúsculas. Máx. efectivo 254. */
  email: string;
  /** Mismas reglas que logoUrl. */
  website?: string | null;
  currency: CurrencyCode;
  /** Zona IANA aceptada por Intl; envía el nombre canónico. */
  timeZone: string;
  /** 1–5000. */
  reservationPolicy: string;
  /** 1–5000. */
  cancellationPolicy: string;
  /** Entero 1–1440. */
  responseTimeoutMinutes: number;
  /** Usuario existente, activo y con rol OWNER; null u omitido = sin responsable. */
  approvalResponsibleId?: Uuid | null;
  /** 1–3 idiomas distintos. */
  languages: LanguageCode[];
  /** Exactamente 7, uno por día. */
  schedules: RestaurantScheduleInput[];
}

// ---------- Catálogo: enums ----------

export const COMMERCIAL_ITEM_TYPES = ["DISH", "BEVERAGE", "SERVICE", "PROMOTION", "EVENT"] as const;
export type CommercialItemType = (typeof COMMERCIAL_ITEM_TYPES)[number];

/** Nace en DRAFT; editar un APPROVED lo devuelve a DRAFT. */
export type CommercialApprovalStatus = "DRAFT" | "APPROVED" | "REJECTED";

/** Criterio de orden de GET /commercial-items. */
export type CommercialItemSortField = "category" | "name" | "createdAt";

/** Dirección del orden. */
export type SortOrder = "asc" | "desc";

// ---------- Categorías comerciales ----------

/** Respuesta de las rutas de /commercial-categories. */
export interface CommercialCategory {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Respuesta de GET /commercial-categories: array plano, sin paginación. */
export type CommercialCategoryListResponse = CommercialCategory[];

/** Body de POST /commercial-categories. Hay que enviar nameEs o nameEn con texto. */
export interface CreateCommercialCategoryRequest {
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEs?: string | null;
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** Entero 0–1 000 000 (no admite null). Por defecto 0. */
  displayOrder?: number;
}

/**
 * Body de PATCH /commercial-categories/:id. Al menos un campo. Omitido = se conserva;
 * null = se borra (salvo displayOrder). Debe quedar al menos un nombre.
 */
export type UpdateCommercialCategoryRequest = Partial<CreateCommercialCategoryRequest>;

/** Body de PATCH /commercial-categories/:id/status. */
export interface UpdateCommercialCategoryStatusRequest {
  isActive: boolean;
}

// ---------- Elementos comerciales: respuestas ----------

/** Resumen de la categoría incluido en cada elemento. */
export interface CommercialItemCategorySummary {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  isActive: boolean;
  displayOrder: number;
}

/** Variante. Su id cambia cada vez que un PATCH reemplaza las variantes. */
export interface CommercialItemVariant {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  /** 2 decimales. */
  price: MoneyString;
  isActive: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Imagen (sin updatedAt). */
export interface CommercialItemImage {
  id: Uuid;
  url: string;
  altTextEs: string | null;
  altTextEn: string | null;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
}

/** Pregunta frecuente. */
export interface CommercialItemFaq {
  id: Uuid;
  questionEs: string;
  questionEn: string | null;
  answerEs: string;
  answerEn: string | null;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Disponibilidad de un día. endTime < startTime = cruza la medianoche. */
export interface CommercialItemSchedule {
  id: Uuid;
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: HhMm | null;
  endTime: HhMm | null;
}

/** Detalle de promoción (solo en PROMOTION). */
export interface CommercialPromotionDetail {
  id: Uuid;
  validFrom: IsoDateTime | null;
  validUntil: IsoDateTime | null;
  promotionalPrice: MoneyString | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Detalle de evento (solo en EVENT). */
export interface CommercialEventDetail {
  id: Uuid;
  startAt: IsoDateTime | null;
  endAt: IsoDateTime | null;
  capacity: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Elemento comercial completo: lo devuelven POST, GET, GET /:id y los tres PATCH. */
export interface CommercialItem {
  id: Uuid;
  type: CommercialItemType;
  categoryId: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  /** 2 decimales o null. */
  basePrice: MoneyString | null;
  displayOrder: number;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
  conditions: string | null;
  /** Nota interna: la ven los roles del CRM, pero no Samanta. */
  internalNotes: string | null;
  availabilityNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  category: CommercialItemCategorySummary;
  /** Todas, también las inactivas; por displayOrder y createdAt. */
  variants: CommercialItemVariant[];
  /** Por displayOrder y createdAt. */
  images: CommercialItemImage[];
  /** Por displayOrder y createdAt. */
  faqs: CommercialItemFaq[];
  /** Solo los días configurados, de MONDAY a SUNDAY. */
  schedules: CommercialItemSchedule[];
  promotionDetail: CommercialPromotionDetail | null;
  eventDetail: CommercialEventDetail | null;
}

/** Respuesta de GET /commercial-items. */
export type CommercialItemListResponse = Paginated<CommercialItem>;

// ---------- Elementos comerciales: entradas ----------
// Las entradas no aceptan id, createdAt ni updatedAt: quítalos de los hijos del GET
// (si no, 400 "variants.0.property id should not exist").

/** Variante. Hay que enviar nameEs o nameEn; el nombre normalizado no se repite en el elemento. */
export interface CommercialItemVariantInput {
  /** 1–150. */
  nameEs?: string | null;
  /** 1–150. */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** MONEY_PATTERN, p. ej. "25" o "25.00". */
  price: MoneyString;
  /** Por defecto true. Solo las activas cuentan para la regla de precio. */
  isActive?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Imagen: solo URL (no hay subida de archivos). */
export interface CommercialItemImageInput {
  /** URL http(s) con dominio o IP, máx. 2048, sin repetir en el elemento. */
  url: string;
  /** 1–300. */
  altTextEs?: string | null;
  /** 1–300. */
  altTextEn?: string | null;
  /** Por defecto false. Como máximo una principal. */
  isPrimary?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Pregunta frecuente. */
export interface CommercialItemFaqInput {
  /** 1–500. */
  questionEs: string;
  /** 1–500. */
  questionEn?: string | null;
  /** 1–5000. */
  answerEs: string;
  /** 1–5000. */
  answerEn?: string | null;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Disponibilidad de un día: horas distintas (pueden cruzar la medianoche) o no disponible sin horas. */
export type CommercialItemScheduleInput =
  | { dayOfWeek: DayOfWeek; isAvailable: true; startTime: HhMm; endTime: HhMm }
  | { dayOfWeek: DayOfWeek; isAvailable: false; startTime?: null; endTime?: null };

/** Detalle de promoción (solo type PROMOTION). Un objeto sustituye los 3 campos. */
export interface CommercialPromotionDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a validUntil. */
  validFrom?: IsoDateTime | null;
  validUntil?: IsoDateTime | null;
  promotionalPrice?: MoneyString | null;
}

/** Detalle de evento (solo type EVENT). Un objeto sustituye los 3 campos. */
export interface CommercialEventDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a endAt. */
  startAt?: IsoDateTime | null;
  endAt?: IsoDateTime | null;
  /** Entero 1–1 000 000. */
  capacity?: number | null;
}

/** Campos editables comunes a la creación y la edición de un elemento. */
export interface CommercialItemWritableFields {
  /** 1–200. Al crear, nameEs o nameEn; al editar debe quedar al menos uno. nameEs es obligatorio para aprobar. */
  nameEs?: string | null;
  /** 1–200. */
  nameEn?: string | null;
  /** 1–5000. */
  descriptionEs?: string | null;
  /** 1–5000. */
  descriptionEn?: string | null;
  /** DISH y BEVERAGE: basePrice o variantes activas, nunca los dos ni ninguno. */
  basePrice?: MoneyString | null;
  /** Entero 0–1 000 000 (no admite null). */
  displayOrder?: number;
  /** 1–5000. Samanta lo recibe. */
  conditions?: string | null;
  /** 1–5000. Samanta no lo recibe. */
  internalNotes?: string | null;
  /** 1–2000. Samanta lo recibe. */
  availabilityNote?: string | null;
  /** Máx. 50. En PATCH reemplaza la lista completa ([] = vaciar; no admite null). */
  variants?: CommercialItemVariantInput[];
  /** Máx. 20. En PATCH reemplaza la lista completa. */
  images?: CommercialItemImageInput[];
  /** Máx. 50. En PATCH reemplaza la lista completa. */
  faqs?: CommercialItemFaqInput[];
  /** Máx. 7, sin repetir días. En PATCH reemplaza la lista completa. */
  schedules?: CommercialItemScheduleInput[];
  /** Solo PROMOTION como objeto. null lo elimina (con cualquier type). */
  promotionDetail?: CommercialPromotionDetailInput | null;
  /** Solo EVENT como objeto. null lo elimina (con cualquier type). */
  eventDetail?: CommercialEventDetailInput | null;
}

/** Body de POST /commercial-items. Nace activo y en DRAFT. */
export interface CreateCommercialItemRequest extends CommercialItemWritableFields {
  type: CommercialItemType;
  /** Categoría existente y activa. */
  categoryId: Uuid;
}

/** Body de PATCH /commercial-items/:id. Al menos un campo; no admite type, isActive ni approvalStatus. */
export interface UpdateCommercialItemRequest extends CommercialItemWritableFields {
  /** No admite null. Si se envía, la categoría debe existir y estar activa. */
  categoryId?: Uuid;
}

/** Body de PATCH /commercial-items/:id/status. */
export interface UpdateCommercialItemStatusRequest {
  isActive: boolean;
}

/** Body de PATCH /commercial-items/:id/approval. */
export interface UpdateCommercialItemApprovalRequest {
  approvalStatus: CommercialApprovalStatus;
}

/** Query de GET /commercial-items. No envíes vacíos ni parámetros no declarados. */
export interface CommercialItemListQuery {
  /** 1–1 000 000. Por defecto 1. */
  page?: number;
  /** 1–100. Por defecto 20. */
  limit?: number;
  type?: CommercialItemType;
  approvalStatus?: CommercialApprovalStatus;
  /** Viaja como "true"/"false". */
  isActive?: boolean;
  categoryId?: Uuid;
  /** 1–200 tras recortar. Sin distinguir mayúsculas; sí distingue tildes. */
  search?: string;
  /** Por defecto "createdAt". */
  sort?: CommercialItemSortField;
  /** Por defecto "desc". */
  order?: SortOrder;
}

// ---------- Contrato por ruta ----------

/** Body o query y respuesta de cada ruta del módulo. */
export interface ConfigCatalogRoutes {
  "GET /restaurant-config": { response: RestaurantConfig };
  "PUT /restaurant-config": { body: PutRestaurantConfigRequest; response: RestaurantConfig };
  "POST /commercial-categories": { body: CreateCommercialCategoryRequest; response: CommercialCategory };
  "GET /commercial-categories": { response: CommercialCategoryListResponse };
  "GET /commercial-categories/:id": { response: CommercialCategory };
  "PATCH /commercial-categories/:id": { body: UpdateCommercialCategoryRequest; response: CommercialCategory };
  "PATCH /commercial-categories/:id/status": { body: UpdateCommercialCategoryStatusRequest; response: CommercialCategory };
  "POST /commercial-items": { body: CreateCommercialItemRequest; response: CommercialItem };
  "GET /commercial-items": { query: CommercialItemListQuery; response: CommercialItemListResponse };
  "GET /commercial-items/:id": { response: CommercialItem };
  "PATCH /commercial-items/:id": { body: UpdateCommercialItemRequest; response: CommercialItem };
  "PATCH /commercial-items/:id/status": { body: UpdateCommercialItemStatusRequest; response: CommercialItem };
  "PATCH /commercial-items/:id/approval": { body: UpdateCommercialItemApprovalRequest; response: CommercialItem };
}
```

## Parte 03: Clientes, solicitudes de reserva y reservas (calendario)

> Parte de la [referencia de la API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend). Estado: 3 de noviembre de 2026.
>
> Desde el navegador, cada ruta se pide con `apiFetch` como `/api/backend<ruta>`, y el BFF añade el token ([Arquitectura](#arquitectura-navegador--bff--bk-crm)). Las convenciones comunes (errores, sesión, roles, paginación y fechas) están en el [README](#convenciones-generales). Las propias de este módulo están en [Convenciones del módulo](#convenciones-del-módulo).

Este módulo gestiona tres cosas:
- la ficha de clientes: contacto, estado comercial e intereses del catálogo;
- las solicitudes de reserva, previas a la confirmación;
- las reservas confirmadas, que forman el calendario operativo.

Lo usan las pantallas de Clientes, Solicitudes, Calendario (día, semana y mes) y Estadísticas, y el panel del cliente en la Bandeja. Un usuario que solo tenga el rol `SUPPORT` no tiene acceso a ninguna ruta (403).

### Índice

Secciones generales:
- [Convenciones del módulo](#convenciones-del-módulo)
- [Modelos](#modelos-2)
- [Estados y transiciones](#estados-y-transiciones-2)
- [Preguntas abiertas](#preguntas-abiertas-3)
- [Tipos TypeScript](#tipos-typescript-2)

Rutas:
- [Crear cliente](#crear-cliente) — `POST /customers`
- [Listar clientes](#listar-clientes) — `GET /customers`
- [Ver detalle de cliente](#ver-detalle-de-cliente) — `GET /customers/:id`
- [Editar cliente](#editar-cliente) — `PATCH /customers/:id`
- [Cambiar estado del cliente](#cambiar-estado-del-cliente) — `PATCH /customers/:id/status`
- [Registrar interés del cliente](#registrar-interés-del-cliente) — `POST /customers/:id/interests`
- [Quitar interés del cliente](#quitar-interés-del-cliente) — `DELETE /customers/:id/interests/:commercialItemId`
- [Crear solicitud de reserva](#crear-solicitud-de-reserva) — `POST /reservation-requests`
- [Listar solicitudes de reserva](#listar-solicitudes-de-reserva) — `GET /reservation-requests`
- [Ver detalle de solicitud de reserva](#ver-detalle-de-solicitud-de-reserva) — `GET /reservation-requests/:id`
- [Editar solicitud de reserva](#editar-solicitud-de-reserva) — `PATCH /reservation-requests/:id`
- [Cancelar solicitud de reserva](#cancelar-solicitud-de-reserva) — `PATCH /reservation-requests/:id/status`
- [Crear reserva manual](#crear-reserva-manual) — `POST /reservations`
- [Listar reservas (calendario)](#listar-reservas-calendario) — `GET /reservations`
- [Ver detalle de reserva](#ver-detalle-de-reserva) — `GET /reservations/:id`
- [Editar reserva](#editar-reserva) — `PATCH /reservations/:id`
- [Cambiar estado de reserva](#cambiar-estado-de-reserva) — `PATCH /reservations/:id/status`
- [Asignar o liberar responsable](#asignar-o-liberar-responsable) — `PATCH /reservations/:id/assignee`
- [Agregar observación a la reserva](#agregar-observación-a-la-reserva) — `POST /reservations/:id/notes`
- [Reprogramar reserva](#reprogramar-reserva) — `PATCH /reservations/:id/reschedule`

### Convenciones del módulo

Lo común a todo el backend está en el README: [formato de errores](#formato-de-errores), [validación](#peticiones-respuestas-y-validación), [roles](#roles), [paginación](#paginación-y-orden) y [fechas e importes](#fechas-zona-horaria-e-importes). Aquí va solo lo propio de este módulo.

#### Acceso

- Lectura (`GET`): ADMIN, OWNER y OPERATOR. Escritura: ADMIN y OPERATOR. `POST /reservations` es solo para ADMIN.
- SUPPORT recibe 403 en todas las rutas del módulo.
- Basta con tener uno de los roles permitidos. Además, `PATCH /reservations/:id/assignee` limita lo que puede hacer un OPERATOR (ver la ruta).
- En ft-crm, `can(roles, "customer.edit")`, `can(roles, "request.cancel")` y `can(roles, "reservation.status")` ya cubren ADMIN y OPERATOR. Para crear reservas falta una acción solo para ADMIN (p. ej. `reservation.create`).

#### Errores que ves desde el navegador

- **401.** El 401 de bk-crm nunca llega al navegador. El BFF renueva la sesión y repite la llamada; si no puede, responde `{ "statusCode": 401, "message": "Tu sesión terminó. Vuelve a iniciar sesión.", "code": "SESSION_EXPIRED" }`. Sin cookies responde `"message": "Inicia sesión para continuar."` con `"code": "NO_SESSION"`. Los mensajes de bk-crm (`Unauthorized`, `Token de acceso inválido`, `Usuario no autorizado`, `Sesión no válida o expirada`) se quedan en el BFF (`src/lib/server/session.ts`).
- **503 y 504 `BACKEND_UNAVAILABLE`.** bk-crm no respondió: red, servidor caído o más de 15 s (`CRM_BACKEND_TIMEOUT_MS`). Ver [Errores que añade el BFF](#errores-que-añade-el-bff). Distinto del 503 `La zona horaria del restaurante no es válida`, que sí viene de bk-crm.
- **400 de validación.** `message` es un arreglo con los textos en inglés de class-validator. Cada texto empieza por el nombre del campo (`phone must be ...`): úsalo para marcar el campo del formulario. `property <campo> should not exist` significa que el frontend envió un campo no declarado.
- **400 `Validation failed (uuid is expected)`.** Un `:id` de la ruta no es un UUID. Llega como texto, no como arreglo.
- **Errores de negocio.** `message` es un texto en español: muéstralo tal cual.
- **413 `El cuerpo de la petición supera el tamaño máximo permitido`.** El body pasa de 100 kb, por ejemplo con un texto pegado sin límite. Pon `maxLength` en los campos de texto (5000 en notas y comentarios).
- **415.** No ocurre con `apiFetch`, que siempre envía `content-type: application/json` sin `charset`.
- **429 e `Idempotency-Key`.** Este módulo no los usa.
- **«Defensivo»** en una tabla de errores: el código puede emitir ese mensaje, pero una validación o comprobación anterior lo evita, así que no debería llegar. Los que traduce un error de la base de datos (registro desaparecido, clave foránea o valor único) solo ocurrirían si alguien cambia los datos entre la comprobación y la escritura, o fuera de la API.
- **500 `Ocurrió un error interno`.** Si la base de datos rechaza una restricción `CHECK`, Prisma lo informa como `P2039` y ningún servicio lo traduce, así que llega como 500. Las validaciones del servicio lo evitan. Por eso `Los datos o referencias del cliente son inválidos` y `Datos o relaciones de reserva inválidos` solo pueden venir de una clave foránea rota.

#### Orden de las comprobaciones

1. BFF: sesión (401).
2. Parser de JSON de Express: JSON mal formado (400) o body de más de 100 kb (413).
3. Token (401) y rol (403).
4. `:id` de la ruta (400 UUID) y luego body o query (400 de validación).
5. Reglas del servicio (400, 404, 409 y 503), en el orden que indica cada ruta.

#### Campos de texto y `null`

- El backend recorta espacios (trim) en nombres, notas, comentarios, motivos y búsquedas. Si después del trim queda vacío, responde 400 `<campo> should not be empty`.
- `email` se recorta y pasa a minúsculas antes de validarse: `" Carlos.Quispe@Example.com "` es válido.
- No envíes `""` para decir «sin valor». En un POST, omite el campo; en un PATCH, envía `null` para borrarlo.
- En los PATCH, omitir un campo lo conserva y `null` lo borra, si el campo lo admite. Cada ruta indica qué campos no admiten `null`.
- No hay rutas `DELETE` para clientes, solicitudes ni reservas. Tampoco hay fusión de clientes.

#### Fechas e identificadores

- Envía instantes ISO 8601 con segundos y zona; `toISOString()` sirve. La API responde en UTC. Muéstralos en el `timeZone` de `GET /restaurant-config` (`configApi.get()`, `useRestaurant()` en ft-crm).
- Una fecha sin zona, sin segundos, solo con el día o con más de 3 decimales responde 400 `<campo> must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/ regular expression`. Una fecha imposible (30 de febrero) o un offset fuera de rango (`+25:00`) responde 400 `<campo> must be a valid ISO 8601 date string`.
- Los ids que genera el backend son UUID v4. En la ruta (`ParseUUIDPipe`) se acepta cualquier texto hexadecimal de la forma 8-4-4-4-12, sea cual sea la versión. En el body y en la query (`@IsUUID()`), el UUID debe tener versión 1 a 8 y variante RFC (el cuarto grupo empieza por `8`, `9`, `a` o `b`); también se aceptan el UUID nulo y el máximo. Si no, `<campo> must be a UUID`.

#### Concurrencia y reintentos

- Las escrituras de solicitudes y reservas, y la edición e intereses de clientes, usan transacciones serializables con hasta 3 intentos. `POST /customers` y `PATCH /customers/:id/status` no usan transacción. Si el conflicto sigue tras los 3 intentos, la respuesta es 409 `Conflicto concurrente; vuelve a intentarlo`: refresca los datos y deja que la persona repita la acción.
- No hay control de versión: el backend no compara `updatedAt`, así que gana la última escritura válida.
- Ningún POST del módulo es idempotente. Si el BFF responde 504, la petición pudo haberse completado: refresca el listado antes de reintentar. `POST /customers` se protege solo (409 si el teléfono o el email ya existen), y `POST /customers/:id/interests` no duplica: actualiza el mismo interés y solo vuelve a mover `lastInterestedAt`. En cambio, `POST /reservation-requests`, `POST /reservations` y `POST /reservations/:id/notes` crean un registro nuevo en cada intento.

#### Funciones y claves de caché en ft-crm

Estado propuesto de `src/lib/api/endpoints.ts`. Las funciones marcadas «nueva» aún no existen; las demás ya están en ft-crm:

```ts
export const customersApi = {
  list: (query: CustomerListQuery) => apiFetch<Paginated<Customer>>("/customers", { query }),
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`),
  setStatus: (id: string, status: CustomerStatus) =>
    apiFetch<Customer>(`/customers/${id}/status`, { method: "PATCH", body: { status } }),
  // nueva
  create: (body: CreateCustomerRequest) => apiFetch<Customer>("/customers", { method: "POST", body }),
  // nueva
  update: (id: string, body: UpdateCustomerRequest) =>
    apiFetch<Customer>(`/customers/${id}`, { method: "PATCH", body }),
  // nueva
  addInterest: (id: string, body: CreateCustomerInterestRequest) =>
    apiFetch<CustomerInterest>(`/customers/${id}/interests`, { method: "POST", body }),
  // nueva: responde 204, apiFetch devuelve undefined
  removeInterest: (id: string, commercialItemId: string) =>
    apiFetch<void>(`/customers/${id}/interests/${commercialItemId}`, { method: "DELETE" }),
};

export const requestsApi = {
  list: (query: ReservationRequestListQuery) =>
    apiFetch<Paginated<ReservationRequest>>("/reservation-requests", { query }),
  get: (id: string) => apiFetch<ReservationRequest>(`/reservation-requests/${id}`),
  cancel: (id: string) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }),
  // nueva
  create: (body: CreateReservationRequestBody) =>
    apiFetch<ReservationRequest>("/reservation-requests", { method: "POST", body }),
  // nueva
  update: (id: string, body: UpdateReservationRequestBody) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}`, { method: "PATCH", body }),
};

export const reservationsApi = {
  list: (query: ReservationListQuery) => apiFetch<Paginated<Reservation>>("/reservations", { query }),
  get: (id: string) => apiFetch<ReservationDetail>(`/reservations/${id}`),
  setStatus: (id: string, status: ReservationStatusTarget) =>
    apiFetch<Reservation>(`/reservations/${id}/status`, { method: "PATCH", body: { status } }),
  // nueva (solo ADMIN)
  create: (body: CreateReservationBody) => apiFetch<Reservation>("/reservations", { method: "POST", body }),
  // nueva
  update: (id: string, body: UpdateReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}`, { method: "PATCH", body }),
  // nueva
  assign: (id: string, body: AssignReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/assignee`, { method: "PATCH", body }),
  // nueva
  addNote: (id: string, content: string) =>
    apiFetch<ReservationNote>(`/reservations/${id}/notes`, {
      method: "POST",
      body: { content } satisfies CreateReservationNoteBody,
    }),
  // nueva
  reschedule: (id: string, body: RescheduleReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/reschedule`, { method: "PATCH", body }),
};
```

Claves de `src/lib/api/query-keys.ts`:

| Clave | Valor | Estado | Uso |
|---|---|---|---|
| `qk.customers(query)` | `["customers", "list", query]` | Existe | `GET /customers` |
| `qk.customer(id)` | `["customers", "detail", id]` | Existe | `GET /customers/:id` |
| `qk.customersAll` | `["customers"]` | Existe | Invalida listados y fichas de clientes |
| `qk.requests(query)` | `["reservation-requests", "list", query]` | Existe | `GET /reservation-requests` |
| `qk.request(id)` | `["reservation-requests", "detail", id]` | **Nueva** | `GET /reservation-requests/:id` |
| `qk.requestsAll` | `["reservation-requests"]` | Existe | Invalida solicitudes |
| `qk.reservations(query)` | `["reservations", "list", query]` | Existe | `GET /reservations` |
| `qk.reservation(id)` | `["reservations", "detail", id]` | Existe | `GET /reservations/:id` |
| `qk.reservationsAll` | `["reservations"]` | Existe | Invalida listados y detalles de reservas |
| `qk.conversationsAll` | `["conversations"]` | Existe | Las conversaciones incluyen el resumen del cliente |
| `qk.statsAll` | `["stats"]` | **Nueva** | Estadísticas: se calculan con solicitudes y reservas |

```ts
// src/lib/api/query-keys.ts: claves nuevas
request: (id: string) => ["reservation-requests", "detail", id] as const,
statsAll: ["stats"] as const,
```

Las respuestas de los PATCH de reservas y de clientes no traen los historiales ni los intereses. Para actualizar el detalle en caché sin perderlos, mezcla la respuesta con lo que ya había: `setQueryData(qk.reservation(id), (old) => (old ? { ...old, ...updated } : old))`. Es lo que ya hace `PrepareControl` en `reservation-detail.tsx`.

### Crear cliente
`POST /customers`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 201 · `Customer` |
| ft-crm | `customersApi.create(body: CreateCustomerRequest): Promise<Customer>` · **nueva** |
| Caché | Invalida `qk.customersAll`. |
| Cabeceras y límites | Sin `Idempotency-Key`. Si reintentas tras un 504 y el cliente ya se creó, la respuesta es 409 por teléfono o email duplicado: no se duplica. |

**Body** (`CreateCustomerRequest`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `sourceChannel` | `ContactChannel` | Sí | `WHATSAPP`, `FACEBOOK`, `INSTAGRAM`, `WEBSITE`, `PHONE`, `EMAIL` u `OTHER`. No admite `null`. Es solo el canal de origen: no habilita ningún envío. |
| `firstName` | string \| null | No | Trim. De 1 a 100 caracteres después del trim. `null` equivale a omitirlo. |
| `lastName` | string \| null | No | Igual que `firstName`. |
| `phone` | string \| null | No | Trim; de 1 a 80 caracteres. Solo dígitos, espacios, `(`, `)`, `.`, `-` y un `+` inicial opcional, con 6 a 15 dígitos (sin anexos ni letras). Con `+`: tiene que ser un número internacional válido; el país sale del prefijo. Sin `+` y con `phoneCountry`: tiene que ser válido para ese país (libphonenumber). Sin `+` ni `phoneCountry`: se guarda tal cual, sin normalizar, y solo se acepta si hay `email`. |
| `phoneCountry` | string \| null | No | Trim y mayúsculas (`"pe"` → `"PE"`). Dos letras de un país soportado (ISO 3166-1 alfa-2: `PE`, `US`, `GB`…; `UK` no existe). Exige `phone`. Si el número empieza por `+`, no se usa para validarlo, pero se guarda tal cual aunque no coincida con el prefijo. |
| `email` | string \| null | No | Trim y minúsculas antes de validar. Formato email; máx. 320 caracteres. |
| `notes` | string \| null | No | Trim. De 1 a 5000 caracteres. |

Reglas del servicio:
- Hace falta un `email` o un teléfono normalizable: internacional con `+`, o nacional con `phoneCountry`.
- El teléfono normalizado (E.164) y el email son únicos. `"+51 987 654 321"`, `"+51987654321"` y `"51987654321"` con `PE` son el mismo teléfono. El email no distingue mayúsculas.
- Un teléfono nacional guardado sin país no cuenta para la unicidad.
- El backend fija `status`, las fechas de contacto y los campos normalizados. Cualquier otro campo (`status`, `firstContactAt`, `normalizedPhone`, `providerAccountId`…) responde 400.

**Ejemplo de petición**

```ts
const customer = await customersApi.create({
  sourceChannel: "WHATSAPP",
  firstName: "Carlos",
  lastName: "Quispe",
  phone: "987 654 321",
  phoneCountry: "PE",
  email: "carlos.quispe@example.com",
  notes: "Consulta por platos de trucha",
});
```

Viaja como `POST /api/backend/customers` con este body:

```json
{
  "sourceChannel": "WHATSAPP",
  "firstName": "Carlos",
  "lastName": "Quispe",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "carlos.quispe@example.com",
  "notes": "Consulta por platos de trucha"
}
```

**Respuesta** (201)

```json
{
  "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "firstName": "Carlos",
  "lastName": "Quispe",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "carlos.quispe@example.com",
  "sourceChannel": "WHATSAPP",
  "status": "NEW",
  "firstContactAt": "2026-11-03T02:32:11.984Z",
  "lastContactAt": "2026-11-03T02:32:11.984Z",
  "notes": "Consulta por platos de trucha",
  "createdAt": "2026-11-03T02:32:11.991Z",
  "updatedAt": "2026-11-03T02:32:11.991Z"
}
```

`phone` vuelve tal como se escribió (con trim) y `email` en minúsculas. La forma E.164 (`+51987654321`) es interna y no se expone.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `status` o `normalizedPhone`). |
| 400 | `sourceChannel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Falta, es `null` o no está en el enum. |
| 400 | `firstName must be a string` · `firstName should not be empty` · `firstName must be shorter than or equal to 100 characters` | No es texto, queda vacío tras el trim o pasa de 100. Los mismos tres mensajes existen para `lastName`. |
| 400 | `phone must be a string` · `phone should not be empty` · `phone must be shorter than or equal to 80 characters` | No es texto (p. ej. un número JSON), queda vacío o pasa de 80. |
| 400 | `phoneCountry must be a string` · `phoneCountry must match /^[A-Z]{2}$/ regular expression` | No son dos letras (`""`, `"PER"`, `51`). |
| 400 | `email must be an email` · `email must be shorter than or equal to 320 characters` | Formato inválido (incluido `""`) o más de 320. |
| 400 | `notes must be a string` · `notes should not be empty` · `notes must be shorter than or equal to 5000 characters` | No es texto, queda vacío o pasa de 5000. |
| 400 | `phoneCountry debe ser un país ISO válido` | Dos letras que no son un país soportado (`ZZ`, `UK`). |
| 400 | `phoneCountry requiere un teléfono` | Llega `phoneCountry` sin `phone`. |
| 400 | `El teléfono tiene un formato inválido` | Caracteres no permitidos, menos de 6 dígitos o más de 15 (p. ej. `"+51 987 654 321 anexo 2"`). |
| 400 | `El teléfono no es válido para el país indicado` | Con `+`: no es un número válido. Sin `+`: no es válido para `phoneCountry` (p. ej. `"987654321"` con `US`). |
| 400 | `Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry` | No hay email ni teléfono normalizable (p. ej. solo `"987654321"`, sin país). |
| 400 | `Los campos de texto no pueden estar vacíos` · `El correo no es válido` · `Los datos o referencias del cliente son inválidos` | Defensivos. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF (`SESSION_EXPIRED` o `NO_SESSION`). Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 409 | `Ya existe un cliente con ese teléfono o correo` | El teléfono normalizado o el email ya son de otro cliente. |
| 409 | `Ya existe un cliente o interés con esos datos` | Dos altas simultáneas con el mismo contacto: la base de datos rechaza la segunda. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: validación del body → reglas de contacto (en el orden de la tabla) → duplicados (409).

**Efectos**

- Crea el cliente con `status: "NEW"` y `firstContactAt` igual a `lastContactAt`, con la hora del servidor.
- No crea conversación. Si el teléfono quedó normalizado, los mensajes de WhatsApp de ese número se asocian a este cliente en vez de crear otro, y su conversación aparece en la Bandeja con el primer mensaje.
- Un cliente creado a mano con `sourceChannel: "FACEBOOK"` no queda vinculado a Messenger: si esa persona escribe por Messenger, el backend crea otro cliente.
- No envía mensajes ni correos.

**Notas para el frontend**

- ft-crm aún no tiene pantalla de alta. Muestra la acción solo a ADMIN y OPERATOR (`can(roles, "customer.edit")` ya cubre esos roles).
- Teléfono: usa un selector de país (por defecto `PE`) más el número, y envía `phoneCountry` siempre que el número no empiece por `+`. No se asume Perú.
- Valida en el formulario lo mismo que el backend (email, o teléfono internacional, o nacional con país). Si aun así falla, muestra el mensaje en español de la respuesta.
- Omite los campos vacíos: `""` responde 400.
- Ante el 409 por duplicado, ofrece buscar el cliente existente con `customersApi.list({ search: <email o número> })`. No hay fusión de clientes.
- Después del alta, invalida `qk.customersAll` y abre la ficha con el `id` de la respuesta.

### Listar clientes
`GET /customers`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<Customer>` |
| ft-crm | `customersApi.list(query: CustomerListQuery): Promise<Paginated<Customer>>` · existe |
| Caché | `qk.customers(query)` → `["customers", "list", query]`. |

**Query** (`CustomerListQuery`)

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | number | No | `1` | Entero de 1 a 1 000 000. |
| `limit` | number | No | `20` | Entero de 1 a 100. |
| `search` | string | No | — | Trim; de 1 a 200 caracteres. Coincidencia parcial y sin distinguir mayúsculas en `firstName`, `lastName` y `email`. En `phone`, coincidencia parcial con el texto tal como se guardó (con sus espacios). Si el texto tiene dígitos, esos dígitos se buscan también en el teléfono normalizado. |
| `status` | `CustomerStatus` | No | — | Un solo valor del enum. |
| `channel` | `ContactChannel` | No | — | Filtra por `sourceChannel` (canal de origen del cliente), no por el canal de sus conversaciones. |
| `commercialItemId` | `Uuid` | No | — | Clientes con un interés registrado en ese elemento comercial. |

**Ejemplo de petición**

```ts
const page = await customersApi.list({ page: 1, limit: 20 });
```

Viaja como `GET /api/backend/customers?page=1&limit=20`. Con búsqueda y estado, `customersApi.list({ page: 1, limit: 20, search: "quispe", status: "INTERESTED" })` viaja como `GET /api/backend/customers?page=1&limit=20&search=quispe&status=INTERESTED`.

**Respuesta** (200)

```json
{
  "data": [
    {
      "id": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
      "firstName": "Rosa Mamani",
      "lastName": null,
      "phone": null,
      "phoneCountry": null,
      "email": null,
      "sourceChannel": "FACEBOOK",
      "status": "NEW",
      "firstContactAt": "2026-11-02T22:15:40.120Z",
      "lastContactAt": "2026-11-03T03:05:12.447Z",
      "notes": null,
      "createdAt": "2026-11-02T22:15:40.120Z",
      "updatedAt": "2026-11-03T03:05:12.447Z"
    },
    {
      "id": "7c2e9a41-3d8b-4f16-a2c9-5e1b7d4f0a83",
      "firstName": null,
      "lastName": null,
      "phone": "+51912345678",
      "phoneCountry": null,
      "email": null,
      "sourceChannel": "WHATSAPP",
      "status": "NEW",
      "firstContactAt": "2026-11-03T01:47:09.315Z",
      "lastContactAt": "2026-11-03T02:58:33.871Z",
      "notes": null,
      "createdAt": "2026-11-03T01:47:09.315Z",
      "updatedAt": "2026-11-03T02:58:33.871Z"
    },
    {
      "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
      "firstName": "Carlos",
      "lastName": "Quispe",
      "phone": "987 654 321",
      "phoneCountry": "PE",
      "email": "carlos.quispe@example.com",
      "sourceChannel": "WHATSAPP",
      "status": "INTERESTED",
      "firstContactAt": "2026-11-03T02:32:11.984Z",
      "lastContactAt": "2026-11-03T02:40:05.120Z",
      "notes": "Consulta por platos de trucha",
      "createdAt": "2026-11-03T02:32:11.991Z",
      "updatedAt": "2026-11-03T02:41:37.502Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

El primero es un cliente de Messenger con el nombre que dio Meta. El segundo es un cliente de WhatsApp sin nombre.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <parámetro> should not exist` | Llega un parámetro no declarado (p. ej. `sort` o un `_t` anticaché). |
| 400 | `page must be an integer number` · `page must not be less than 1` · `page must not be greater than 1000000` | `page` no es un entero entre 1 y 1 000 000 (`page=` vacío cuenta como 0). |
| 400 | `limit must be an integer number` · `limit must not be less than 1` · `limit must not be greater than 100` | `limit` no es un entero entre 1 y 100. |
| 400 | `search must be a string` · `search should not be empty` · `search must be shorter than or equal to 200 characters` | Vacío o solo espacios, más de 200 caracteres, o el parámetro repetido. |
| 400 | `status must be one of the following values: NEW, INTERESTED, IN_CONVERSATION, REQUESTED_RESERVATION, CONFIRMED, REJECTED, LOST, RECURRENT` | Valor fuera del enum. |
| 400 | `channel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Valor fuera del enum. |
| 400 | `commercialItemId must be a UUID` | No es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- Orden fijo: `lastContactAt` descendente y luego `id` ascendente. Los filtros se combinan con AND.
- `data` y `total` se leen en la misma transacción, así que siempre son coherentes. Si no hay resultados, `totalPages` vale 0. Una página mayor que `totalPages` devuelve `data: []` con `total > 0` (ft-crm ya lo trata en `ClientesView`).
- `search` busca cada campo por separado: «Carlos Quispe» no encuentra a un cliente con `firstName: "Carlos"` y `lastName: "Quispe"`. Busca por una sola palabra.
- Teléfonos: `987654321` encuentra `"987 654 321"` si ese número quedó normalizado (por sus dígitos). Un número nacional guardado sin país solo aparece si escribes el texto, o una parte, tal como se guardó (con sus espacios).
- Cualquier dígito del texto se busca en los teléfonos: «Mesa 4» trae también a los clientes con un 4 en el número.
- No envíes parámetros vacíos ni extra. `toSearch` ya omite `undefined`, `null` y los textos vacíos.
- Clientes creados por los webhooks:
  - Messenger (`sourceChannel: "FACEBOOK"`): sin `phone` ni `email`. `firstName` trae el nombre completo que da Meta (p. ej. «Rosa Mamani») y `lastName` queda en `null`. Si Meta no da el nombre, ambos quedan en `null`.
  - WhatsApp: `phone` con el formato `"+51912345678"` y sin nombre.
  - Texto de respaldo: el teléfono, el email o «Cliente de Messenger». Hoy `customerName` muestra «Cliente sin nombre» cuando no hay nada.
- `lastContactAt` cambia con cada mensaje entrante (WhatsApp o Messenger) y al registrar un interés. No cambia al editar el cliente, al cambiar su estado ni al enviarle mensajes.
- El listado no trae reservas, intereses ni conversación. ft-crm hace una llamada por fila para las columnas RESERVAS y CONSULTÓ.
- `ClientesView` refresca cada 60 s y solo consulta si el rol puede ver Clientes.

### Ver detalle de cliente
`GET /customers/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `CustomerDetail` |
| ft-crm | `customersApi.get(id: string): Promise<CustomerDetail>` · existe |
| Caché | `qk.customer(id)` → `["customers", "detail", id]`. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id del cliente. Si no es un UUID, responde 400. |

**Respuesta** (200)

```json
{
  "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "firstName": "Carlos",
  "lastName": "Quispe",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "carlos.quispe@example.com",
  "sourceChannel": "WHATSAPP",
  "status": "INTERESTED",
  "firstContactAt": "2026-11-03T02:32:11.984Z",
  "lastContactAt": "2026-11-03T02:40:05.120Z",
  "notes": "Consulta por platos de trucha",
  "createdAt": "2026-11-03T02:32:11.991Z",
  "updatedAt": "2026-11-03T02:41:37.502Z",
  "interests": [
    {
      "id": "d14f8b2a-6e3c-4a97-8b51-0c2e7f9d3a68",
      "firstInterestedAt": "2026-11-03T02:40:05.120Z",
      "lastInterestedAt": "2026-11-03T02:40:05.120Z",
      "notes": "Consultó disponibilidad y precio",
      "commercialItem": {
        "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
        "nameEs": "Trucha a la parrilla",
        "nameEn": "Grilled trout",
        "type": "DISH",
        "isActive": true,
        "approvalStatus": "APPROVED"
      }
    },
    {
      "id": "9e5b1c7d-2f4a-4b83-a6d0-3c8e1f5b7a29",
      "firstInterestedAt": "2026-11-03T02:38:12.640Z",
      "lastInterestedAt": "2026-11-03T02:38:12.640Z",
      "notes": null,
      "commercialItem": {
        "id": "2b8f4c6d-1e7a-4d39-8c52-9a0e3f7b1d64",
        "nameEs": "Almuerzo familiar",
        "nameEn": null,
        "type": "SERVICE",
        "isActive": false,
        "approvalStatus": "APPROVED"
      }
    }
  ]
}
```

El segundo interés apunta a un elemento que hoy está inactivo: el detalle muestra el estado actual del catálogo, no el que tenía al registrarse.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |
| 404 | `Cliente no encontrado` | El cliente no existe. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- `interests` viene ordenado por `lastInterestedAt` descendente y luego por `id` ascendente: el más reciente es `interests[0]` (lo usa `latestInterestName` para la columna CONSULTÓ).
- Cada interés trae el estado actual del elemento comercial (`isActive`, `approvalStatus`): puede estar inactivo o sin aprobar. Al menos uno de `nameEs` y `nameEn` tiene valor; muestra `nameEs ?? nameEn` (`itemName`).
- El detalle no incluye solicitudes, reservas ni conversaciones. Pídelas aparte con `customerId`: `requestsApi.list({ customerId })`, `reservationsApi.list({ customerId })` y `conversationsApi.list({ customerId })`.
- OWNER y OPERATOR también pueden leerlo. ft-crm lo comparte en caché entre la tabla de Clientes, el panel de la Bandeja y el canal que muestra el detalle de reserva.
- Con un id inexistente, muestra «Cliente no encontrado» en lugar de un error genérico (`error.isNotFound`).

### Editar cliente
`PATCH /customers/:id`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `Customer` |
| ft-crm | `customersApi.update(id: string, body: UpdateCustomerRequest): Promise<Customer>` · **nueva** |
| Caché | Mezcla la respuesta en `qk.customer(id)` (no trae `interests`) e invalida `qk.customersAll`. Si cambió el nombre, el teléfono o el email, invalida también `qk.conversationsAll`, `qk.requestsAll` y `qk.reservationsAll`: incluyen el resumen del cliente. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id del cliente. Si no es un UUID, responde 400. |

**Body** (`UpdateCustomerRequest`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `sourceChannel` | `ContactChannel` | No | Valor del enum; no admite `null`. En una identidad de Messenger solo se acepta `FACEBOOK`. |
| `firstName` | string \| null | No | Trim; de 1 a 100 caracteres. `null` lo borra. |
| `lastName` | string \| null | No | Trim; de 1 a 100 caracteres. `null` lo borra. |
| `phone` | string \| null | No | Mismas reglas que al crear. `null` borra el teléfono y también su país. |
| `phoneCountry` | string \| null | No | Mismas reglas que al crear. No se hereda: si envías `phone` sin `phoneCountry`, el país queda en `null`. Si envías solo `phoneCountry`, el backend vuelve a normalizar el teléfono actual con ese país. |
| `email` | string \| null | No | Mismas reglas que al crear. `null` lo borra. |
| `notes` | string \| null | No | Trim; de 1 a 5000 caracteres. `null` lo borra. |

Reglas del servicio:
- Hay que enviar al menos un campo; `null` cuenta como campo.
- El contacto se valida con el resultado final: tras el cambio, el cliente tiene que conservar un email o un teléfono normalizable. Las identidades de Messenger están exentas.
- El teléfono y el email no pueden ser de otro cliente.
- `status`, las fechas de contacto, los campos normalizados y cualquier otro campo responden 400.

**Ejemplo de petición**

```ts
const updated = await customersApi.update("3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42", {
  firstName: "Carlos Alberto",
  notes: "Prefiere atención por correo",
});
```

Viaja como `PATCH /api/backend/customers/3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42` con este body:

```json
{
  "firstName": "Carlos Alberto",
  "notes": "Prefiere atención por correo"
}
```

Para cambiar un teléfono nacional, reenvía siempre el país: `{ "phone": "912 345 678", "phoneCountry": "PE" }`.

**Respuesta** (200)

```json
{
  "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "firstName": "Carlos Alberto",
  "lastName": "Quispe",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "carlos.quispe@example.com",
  "sourceChannel": "WHATSAPP",
  "status": "INTERESTED",
  "firstContactAt": "2026-11-03T02:32:11.984Z",
  "lastContactAt": "2026-11-03T02:40:05.120Z",
  "notes": "Prefiere atención por correo",
  "createdAt": "2026-11-03T02:32:11.991Z",
  "updatedAt": "2026-11-03T03:25:18.330Z"
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Debes proporcionar al menos un campo para actualizar` | El body está vacío (`{}`). Se comprueba antes de buscar al cliente. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `status`). |
| 400 | `sourceChannel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Valor fuera del enum o `null`. |
| 400 | `firstName must be a string` · `firstName should not be empty` · `firstName must be shorter than or equal to 100 characters` | Igual para `lastName`. |
| 400 | `phone must be a string` · `phone should not be empty` · `phone must be shorter than or equal to 80 characters` | Ver [Crear cliente](#crear-cliente). |
| 400 | `phoneCountry must be a string` · `phoneCountry must match /^[A-Z]{2}$/ regular expression` | No son dos letras. |
| 400 | `email must be an email` · `email must be shorter than or equal to 320 characters` | Formato inválido o más de 320. |
| 400 | `notes must be a string` · `notes should not be empty` · `notes must be shorter than or equal to 5000 characters` | No es texto, queda vacío o pasa de 5000. |
| 400 | `No se puede cambiar el canal de una identidad de Messenger` | El cliente lo creó el webhook de Messenger y llega un `sourceChannel` distinto de `FACEBOOK`. |
| 400 | `phoneCountry debe ser un país ISO válido` | Dos letras que no son un país soportado. |
| 400 | `phoneCountry requiere un teléfono` | Llega `phoneCountry` para un cliente sin teléfono, o un `phoneCountry` no nulo junto con `phone: null`. En este último caso, si el cliente quedaría sin email (y no es de Messenger), responde antes el error de contacto. |
| 400 | `El teléfono tiene un formato inválido` | Caracteres no permitidos, menos de 6 dígitos o más de 15. |
| 400 | `El teléfono no es válido para el país indicado` | El número no es válido (con `+`) o no es válido para el país. |
| 400 | `Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry` | Tras el cambio, el cliente quedaría sin email y sin teléfono normalizable (p. ej. `{ "email": null }` en un cliente sin teléfono, o un número nacional sin `phoneCountry`). No aplica a las identidades de Messenger. |
| 400 | `Los campos de texto no pueden estar vacíos` · `El correo no es válido` · `Los datos o referencias del cliente son inválidos` | Defensivos. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Cliente no encontrado` | El cliente no existe. |
| 404 | `Cliente o interés no encontrado` | Defensivo. |
| 409 | `Ya existe un cliente con ese teléfono o correo` | El teléfono normalizado o el email ya son de otro cliente. |
| 409 | `Ya existe un cliente o interés con esos datos` | Otra petición tomó el mismo teléfono o email y los 3 intentos chocaron. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: `:id` y validación del body → body vacío → cliente (404) → canal de Messenger → reglas de contacto → `phoneCountry` con `phone: null` → duplicados (409).

**Efectos**

- Actualiza los campos enviados y `updatedAt`. No cambia `status`, `firstContactAt` ni `lastContactAt`.
- El resumen del cliente (`firstName`, `lastName`, `phone`, `email`) que traen las conversaciones, solicitudes y reservas cambia con él.
- **Teléfono y WhatsApp.** Las respuestas de WhatsApp van al teléfono normalizado del cliente, y la ventana de 24 h se mide con los mensajes que llegaron desde ese número. Por eso, en un cliente con conversación de WhatsApp:
  - Borrar el teléfono, o dejar un número nacional sin `phoneCountry`, hace que `POST /conversations/:id/messages` responda 400 `Conversación sin destinatario habilitado`.
  - Cambiar el número hace que las respuestas vayan al número nuevo. La ventana queda cerrada (409 `Ventana de WhatsApp cerrada; se requiere una plantilla aprobada`) hasta que ese número escriba.
  - Si el número anterior vuelve a escribir, el backend crea otro cliente con ese número.
- **Messenger.** Las respuestas van al identificador de Messenger, que no se edita: cambiar el teléfono o el email no las afecta. El nombre automático solo se aplica a clientes con `firstName` y `lastName` en `null`: si les pones un nombre, se respeta; si borras ambos, el siguiente mensaje de Messenger puede volver a llenar `firstName`.

**Notas para el frontend**

- Envía solo los campos modificados. Omitir conserva; `null` borra (salvo `sourceChannel`).
- Teléfono nacional: cada vez que envíes `phone`, reenvía `phoneCountry` aunque no haya cambiado. Si no lo haces, el país se borra y el número deja de estar normalizado; si además el cliente no tiene email, la respuesta es 400.
- Si el cliente tiene conversación de WhatsApp, avisa antes de cambiar o borrar su teléfono (ver Efectos).
- Identidad de Messenger: la respuesta no indica si un cliente `FACEBOOK` la tiene, así que no puedes saber de antemano si el canal está bloqueado ([pregunta abierta](#preguntas-abiertas-3)). Si llega el 400 `No se puede cambiar el canal de una identidad de Messenger`, muestra el mensaje y devuelve el selector a `FACEBOOK`. Esas identidades sí admiten agregar o borrar teléfono y email.
- Un cliente creado a mano con `FACEBOOK` no es una identidad de Messenger: le aplica la regla de contacto normal y puede cambiar de canal.
- No hay fusión: si el teléfono o el email ya son de otro cliente, la respuesta es 409. Ofrece abrir ese cliente.
- Para actualizar la caché sin perder los intereses: `setQueryData<CustomerDetail>(qk.customer(id), (old) => (old ? { ...old, ...updated } : old))`.

### Cambiar estado del cliente
`PATCH /customers/:id/status`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `Customer` |
| ft-crm | `customersApi.setStatus(id: string, status: CustomerStatus): Promise<Customer>` · existe (sin pantalla que la use) |
| Caché | Mezcla la respuesta en `qk.customer(id)` e invalida `qk.customersAll`. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id del cliente. Si no es un UUID, responde 400. |

**Body** (`UpdateCustomerStatusRequest`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `status` | `CustomerStatus` | Sí | `NEW`, `INTERESTED`, `IN_CONVERSATION`, `REQUESTED_RESERVATION`, `CONFIRMED`, `REJECTED`, `LOST` o `RECURRENT`. No admite `null`. Cualquier otro campo responde 400. |

**Ejemplo de petición**

```ts
const customer = await customersApi.setStatus("3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42", "INTERESTED");
```

Viaja como `PATCH /api/backend/customers/3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42/status` con este body:

```json
{ "status": "INTERESTED" }
```

**Respuesta** (200)

```json
{
  "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "firstName": "Carlos",
  "lastName": "Quispe",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "carlos.quispe@example.com",
  "sourceChannel": "WHATSAPP",
  "status": "INTERESTED",
  "firstContactAt": "2026-11-03T02:32:11.984Z",
  "lastContactAt": "2026-11-03T02:40:05.120Z",
  "notes": "Consulta por platos de trucha",
  "createdAt": "2026-11-03T02:32:11.991Z",
  "updatedAt": "2026-11-03T02:41:37.502Z"
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo además de `status` (p. ej. `notes`). |
| 400 | `status must be one of the following values: NEW, INTERESTED, IN_CONVERSATION, REQUESTED_RESERVATION, CONFIRMED, REJECTED, LOST, RECURRENT` | Falta, es `null` o no está en el enum. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Cliente o interés no encontrado` | El cliente no existe. El texto es distinto del 404 del detalle (`Cliente no encontrado`). |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

**Efectos**

- Cambia `status` y `updatedAt`. No toca las fechas de contacto ni otros recursos.
- No crea solicitudes ni reservas, y no notifica a nadie.

**Notas para el frontend**

- No hay reglas de transición: el backend acepta pasar de cualquier estado a cualquier otro, incluido el mismo. El flujo lo decide la UI (ver [Estados y transiciones](#estados-y-transiciones-2)).
- El estado nunca cambia solo. Crear una solicitud o una reserva, o recibir mensajes, no lo modifica: el código tiene esa integración pendiente. Si la UI quiere marcar `REQUESTED_RESERVATION` al crear una solicitud, tiene que llamar a esta ruta aparte (decisión abierta).
- Muestra el selector solo a ADMIN y OPERATOR (`can(roles, "customer.edit")`). Usa las etiquetas de `CUSTOMER_STATUS` de `src/lib/domain/statuses.ts`.
- Trata el 404 por su código (`error.isNotFound`), no por el texto.

### Registrar interés del cliente
`POST /customers/:id/interests`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `CustomerInterest` (también al repetir) |
| ft-crm | `customersApi.addInterest(id: string, body: CreateCustomerInterestRequest): Promise<CustomerInterest>` · **nueva** |
| Caché | Invalida `qk.customersAll` (cubre la ficha y los listados: cambia `lastContactAt` y el filtro por `commercialItemId`). |
| Cabeceras y límites | Sin `Idempotency-Key`, pero repetir no duplica: actualiza el mismo interés. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id del cliente. Si no es un UUID, responde 400. |

**Body** (`CreateCustomerInterestRequest`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `commercialItemId` | `Uuid` | Sí | Elemento comercial existente. Puede estar inactivo o sin aprobar. |
| `notes` | string \| null | No | Trim; de 1 a 5000 caracteres. Al crear, omitirlo o enviar `null` deja la nota vacía. Si el interés ya existe, omitirlo conserva la nota anterior y `null` la borra. |

**Ejemplo de petición**

```ts
const interest = await customersApi.addInterest("3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42", {
  commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  notes: "Consultó disponibilidad y precio",
});
```

Viaja como `POST /api/backend/customers/3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42/interests` con este body:

```json
{
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "notes": "Consultó disponibilidad y precio"
}
```

**Respuesta** (200)

```json
{
  "id": "d14f8b2a-6e3c-4a97-8b51-0c2e7f9d3a68",
  "firstInterestedAt": "2026-11-03T02:40:05.120Z",
  "lastInterestedAt": "2026-11-03T02:40:05.120Z",
  "notes": "Consultó disponibilidad y precio",
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

La respuesta no incluye `customerId`: el elemento se identifica con `commercialItem.id`.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega un campo no declarado. |
| 400 | `commercialItemId must be a UUID` | Falta, es `null` o no es un UUID. |
| 400 | `notes must be a string` · `notes should not be empty` · `notes must be shorter than or equal to 5000 characters` | No es texto, queda vacío tras el trim o pasa de 5000. |
| 400 | `Los datos o referencias del cliente son inválidos` · `Los campos de texto no pueden estar vacíos` | Defensivos. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Cliente no encontrado` | El cliente no existe. Se comprueba primero. |
| 404 | `Elemento comercial no encontrado` | El elemento comercial no existe. |
| 409 | `Ya existe un cliente o interés con esos datos` | Registros simultáneos del mismo interés chocaron en los 3 intentos. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

**Efectos**

- Crea el interés o actualiza el existente: hay uno solo por par cliente–elemento. Al repetir conserva `id` y `firstInterestedAt`, mueve `lastInterestedAt` a la hora actual y aplica la regla de `notes`.
- Actualiza el `lastContactAt` del cliente a la hora actual (si es posterior): para el backend, registrar una consulta cuenta como contacto. El cliente sube en `GET /customers`.
- No publica, aprueba ni activa el elemento comercial.

**Notas para el frontend**

- A diferencia de solicitudes y reservas, aquí se aceptan elementos inactivos o sin aprobar. Aun así, conviene ofrecer los activos en el selector.
- Para editar la nota de un interés existente, vuelve a llamar a esta ruta con el mismo `commercialItemId` y la nota nueva (o `null` para borrarla). No hay una ruta que edite solo la nota: la llamada también mueve `lastInterestedAt` y el `lastContactAt` del cliente a la hora actual.
- Deshabilita el botón mientras la petición está en curso: un doble clic no duplica, pero sí mueve `lastInterestedAt` dos veces.
- Después invalida `qk.customersAll`. La columna CONSULTÓ de Clientes lee `interests[0]` del detalle.

### Quitar interés del cliente
`DELETE /customers/:id/interests/:commercialItemId`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 204 · sin cuerpo (`void`) |
| ft-crm | `customersApi.removeInterest(id: string, commercialItemId: string): Promise<void>` · **nueva** |
| Caché | Invalida `qk.customersAll` (la ficha cambia y el filtro por `commercialItemId` también). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id del cliente. Si no es un UUID, responde 400. |
| `commercialItemId` | `Uuid` | Id del **elemento comercial** (`interest.commercialItem.id`), no el `id` del interés. Si no es un UUID, responde 400. |

**Respuesta** (204)

Sin cuerpo. `apiFetch` devuelve `undefined`.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` o `:commercialItemId` no son UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Cliente no encontrado` | El cliente no existe. |
| 404 | `Interés no encontrado` | El cliente no tiene interés en ese elemento. También ocurre al repetir el DELETE. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |

**Efectos**

- Borra solo la relación cliente–elemento. No borra el cliente ni el elemento.
- No cambia `lastContactAt` ni `updatedAt` del cliente.

**Notas para el frontend**

- Construye la ruta con `interest.commercialItem.id`.
- Si quitas el interés de forma optimista y llega el 404 `Interés no encontrado`, trátalo como hecho: otra persona ya lo quitó.
- Después invalida `qk.customersAll` para refrescar la ficha y la columna CONSULTÓ.

### Crear solicitud de reserva
`POST /reservation-requests`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 201 · `ReservationRequest` |
| ft-crm | `requestsApi.create(body: CreateReservationRequestBody): Promise<ReservationRequest>` · **nueva** |
| Caché | Invalida `qk.requestsAll` y `qk.statsAll` (nueva). |
| Cabeceras y límites | Sin `Idempotency-Key`: cada POST crea una solicitud con otro `code`. Tras un 504, revisa el listado antes de reintentar. |

**Body** (`CreateReservationRequestBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `customerId` | `Uuid` | Sí | Cliente existente. No admite `null`. |
| `sourceChannel` | `ContactChannel` | Sí | Canal por el que llegó la solicitud. No se hereda del cliente. No admite `null`. |
| `commercialItemId` | `Uuid` \| null | No | Elemento existente, activo (`isActive`) y `APPROVED`. |
| `reservationAt` | `IsoDateTime` \| null | No | ISO 8601 con segundos y zona: `YYYY-MM-DDTHH:mm:ss[.sss]` más `Z` o `±HH:mm` (regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$`). Fecha real y estrictamente posterior a la hora del servidor. |
| `numberOfPeople` | number \| null | No | Entero JSON (no texto) de 1 a 2147483647. El máximo es técnico, no un aforo. |
| `quotedPrice` | `MoneyString` \| null | No | Texto decimal que cumple `^(?:0\|[1-9]\d{0,7})(?:\.\d{1,2})?$`: de `"0"` a `"99999999.99"`, hasta 2 decimales, sin signo, sin ceros a la izquierda y sin exponente. `"150.5"` es válido y vuelve como `"150.50"`. |
| `currency` | `CurrencyCode` \| null | No | `PEN` o `USD`. Solo va con `quotedPrice`: si hay precio y omites la moneda, se usa la del restaurante. |
| `comments` | string \| null | No | Trim; de 1 a 5000 caracteres. |
| `specialRequirements` | string \| null | No | Trim; de 1 a 5000 caracteres. |

Reglas del servicio:
- `status` lo calcula el backend: `READY_TO_SEND` si hay `reservationAt` y `numberOfPeople`; si falta alguno, `INCOMPLETE_DATA`.
- Precio y moneda van juntos. Con precio y sin `currency`, se usa la moneda del restaurante; con precio y `currency: null`, o con moneda y sin precio, la respuesta es 400.
- No se valida aforo, horario de atención ni solapamientos.
- `code`, `status`, `createdAt` y cualquier otro campo responden 400.

**Ejemplo de petición**

```ts
const request = await requestsApi.create({
  customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  sourceChannel: "PHONE",
  commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  reservationAt: "2026-11-07T20:00:00-05:00",
  numberOfPeople: 4,
  quotedPrice: "150.00",
  comments: "Consulta por una reserva familiar",
  specialRequirements: "Una silla para bebé",
});
```

Viaja como `POST /api/backend/reservation-requests` con este body:

```json
{
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "sourceChannel": "PHONE",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-07T20:00:00-05:00",
  "numberOfPeople": 4,
  "quotedPrice": "150.00",
  "comments": "Consulta por una reserva familiar",
  "specialRequirements": "Una silla para bebé"
}
```

No envía `currency`: el backend toma la del restaurante (`PEN`).

**Respuesta** (201)

```json
{
  "id": "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
  "code": "RES-2026-000042",
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "sourceChannel": "PHONE",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 4,
  "quotedPrice": "150.00",
  "currency": "PEN",
  "comments": "Consulta por una reserva familiar",
  "specialRequirements": "Una silla para bebé",
  "status": "READY_TO_SEND",
  "createdAt": "2026-11-03T02:35:20.418Z",
  "updatedAt": "2026-11-03T02:35:20.418Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

`reservationAt` vuelve en UTC: las 20:00 del 7 de noviembre en Lima son `2026-11-08T01:00:00.000Z`.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `status` o `code`). |
| 400 | `customerId must be a UUID` | Falta, es `null` o no es un UUID. |
| 400 | `sourceChannel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Falta, es `null` o no está en el enum. |
| 400 | `commercialItemId must be a UUID` | No es un UUID. |
| 400 | `reservationAt must be a string` · `reservationAt must be a valid ISO 8601 date string` · `reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | No es texto (p. ej. un timestamp numérico), no es una fecha real o le faltan los segundos o la zona. |
| 400 | `numberOfPeople must be an integer number` · `numberOfPeople must not be less than 1` · `numberOfPeople must not be greater than 2147483647` | No es un entero JSON (`"4"` da los tres mensajes), es menor que 1 o pasa del máximo. |
| 400 | `quotedPrice must be a string` · `quotedPrice must match /^(?:0\|[1-9]\d{0,7})(?:\.\d{1,2})?$/ regular expression` | Llega como número (`150`) o con otro formato (`"-1.00"`, `"1.234"`, `"0150.00"`, `"1e2"`). |
| 400 | `currency must be one of the following values: PEN, USD` | Otra moneda (p. ej. `EUR`). |
| 400 | `comments must be a string` · `comments should not be empty` · `comments must be shorter than or equal to 5000 characters` | Igual para `specialRequirements`. |
| 400 | `El elemento comercial debe estar activo y aprobado` | El elemento está inactivo o no está `APPROVED`. |
| 400 | `La fecha de reserva debe ser válida y futura` | `reservationAt` no es posterior a la hora del servidor. |
| 400 | `El precio y la moneda deben estar presentes juntos` | Llega `currency` sin `quotedPrice`, o `quotedPrice` con `currency: null`. |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Cliente no encontrado` | `customerId` no existe. |
| 404 | `Elemento comercial no encontrado` | `commercialItemId` no existe. |
| 409 | `Configura el restaurante antes de crear solicitudes o reservas` | Aún no existe la configuración del restaurante (`PUT /restaurant-config`). Se comprueba primero. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 409 | `El código o la solicitud ya están vinculados a una reserva` | Defensivo: colisión de un valor único en la base de datos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |
| 503 | `La zona horaria del restaurante no es válida` | Caso límite: el `timeZone` guardado no es una zona IANA válida. `PUT /restaurant-config` ya la valida. |

Orden: configuración (409) → cliente (404) → elemento (404 o 400) → fecha futura (400) → precio y moneda (400) → código (503).

**Efectos**

- Crea la solicitud con su `code` `RES-<año>-<secuencia>`:
  - La secuencia es global, tiene al menos 6 dígitos y no se reinicia cada año. Puede tener saltos: un intento fallido también consume un número.
  - El año es el de la creación en la zona horaria del restaurante.
- No modifica al cliente: ni su estado ni sus fechas de contacto.
- No aparece en el calendario (`GET /reservations` solo lee reservas) y no avisa a nadie: el envío al dueño no existe todavía.

**Notas para el frontend**

- Es la única forma de crear solicitudes: ni Samanta ni los webhooks las crean. ft-crm aún no tiene el formulario «Nueva solicitud», y el panel de la Bandeja dice que «Samanta la crea…», lo que no ocurre en modo live.
- Arma `reservationAt` con la fecha y la hora que elige la persona en la zona del restaurante y conviértelo a un instante. `toISOString()` sirve.
- Envía `quotedPrice` como texto. Para el selector de moneda, propone por defecto el `currency` de `GET /restaurant-config`.
- En el selector de elementos, ofrece solo los activos y aprobados: `catalogApi.items({ isActive: true, approvalStatus: "APPROVED" })`.
- Si la respuesta es 409 `Configura el restaurante…`, lleva a la persona a Ajustes (solo un ADMIN puede guardar la configuración).
- Deshabilita el botón mientras la petición está en curso: un doble envío crea dos solicitudes.

### Listar solicitudes de reserva
`GET /reservation-requests`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<ReservationRequest>` |
| ft-crm | `requestsApi.list(query: ReservationRequestListQuery): Promise<Paginated<ReservationRequest>>` · existe |
| Caché | `qk.requests(query)` → `["reservation-requests", "list", query]`. |

**Query** (`ReservationRequestListQuery`)

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | number | No | `1` | Entero de 1 a 1 000 000. |
| `limit` | number | No | `20` | Entero de 1 a 100. |
| `customerId` | `Uuid` | No | — | Solicitudes de ese cliente. |
| `dateFrom` | `IsoDateTime` | No | — | Mismo formato con segundos y zona que `reservationAt`. Límite inferior **incluido**: `reservationAt >= dateFrom`. |
| `dateTo` | `IsoDateTime` | No | — | Mismo formato. Límite superior **excluido**: `reservationAt < dateTo`. Con ambos, `dateFrom` tiene que ser anterior a `dateTo`. |
| `status` | `ReservationRequestStatus` | No | — | Un solo valor de los 9 del enum. |
| `channel` | `ContactChannel` | No | — | Filtra por el `sourceChannel` de la solicitud. |
| `commercialItemId` | `Uuid` | No | — | Solicitudes de ese elemento comercial. |
| `search` | string | No | — | Trim; de 1 a 200 caracteres. Coincidencia parcial y sin distinguir mayúsculas en `code` y en el nombre y apellido del cliente. En el `phone` del cliente, coincidencia con el texto tal como se guardó; y, si el texto tiene dígitos, en su teléfono normalizado. No busca por email. |

**Ejemplo de petición**

```ts
const page = await requestsApi.list({
  page: 1,
  limit: 20,
  customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  dateFrom: "2026-11-02T05:00:00.000Z",
  dateTo: "2026-11-09T05:00:00.000Z",
  status: "READY_TO_SEND",
});
```

Viaja como `GET /api/backend/reservation-requests?page=1&limit=20&customerId=3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42&dateFrom=2026-11-02T05%3A00%3A00.000Z&dateTo=2026-11-09T05%3A00%3A00.000Z&status=READY_TO_SEND`. Es la semana del lunes 2 al domingo 8 de noviembre en Lima.

La respuesta de ejemplo corresponde a `requestsApi.list({ page: 1, limit: 2 })`, sin filtros: las dos solicitudes más recientes de 43.

**Respuesta** (200)

```json
{
  "data": [
    {
      "id": "4e1b8d6f-0a3c-4f92-87d5-b6c2e9a1f304",
      "code": "RES-2026-000043",
      "customerId": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
      "commercialItemId": null,
      "sourceChannel": "FACEBOOK",
      "reservationAt": null,
      "numberOfPeople": null,
      "quotedPrice": null,
      "currency": null,
      "comments": "Pregunta por almuerzo para el domingo",
      "specialRequirements": null,
      "status": "INCOMPLETE_DATA",
      "createdAt": "2026-11-03T03:10:02.115Z",
      "updatedAt": "2026-11-03T03:10:02.115Z",
      "customer": {
        "id": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
        "firstName": "Rosa Mamani",
        "lastName": null,
        "phone": null,
        "email": null
      },
      "commercialItem": null
    },
    {
      "id": "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
      "code": "RES-2026-000042",
      "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
      "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
      "sourceChannel": "PHONE",
      "reservationAt": "2026-11-08T01:00:00.000Z",
      "numberOfPeople": 4,
      "quotedPrice": "150.00",
      "currency": "PEN",
      "comments": "Consulta por una reserva familiar",
      "specialRequirements": "Una silla para bebé",
      "status": "READY_TO_SEND",
      "createdAt": "2026-11-03T02:35:20.418Z",
      "updatedAt": "2026-11-03T02:35:20.418Z",
      "customer": {
        "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
        "firstName": "Carlos",
        "lastName": "Quispe",
        "phone": "987 654 321",
        "email": "carlos.quispe@example.com"
      },
      "commercialItem": {
        "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
        "nameEs": "Trucha a la parrilla",
        "nameEn": "Grilled trout",
        "type": "DISH",
        "isActive": true,
        "approvalStatus": "APPROVED"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 2, "total": 43, "totalPages": 22 }
}
```

La primera es de un cliente de Messenger, todavía sin fecha ni número de personas.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <parámetro> should not exist` | Llega un parámetro no declarado (p. ej. `orderBy`). |
| 400 | `page must be an integer number` · `page must not be less than 1` · `page must not be greater than 1000000` | `page` no es un entero entre 1 y 1 000 000. |
| 400 | `limit must be an integer number` · `limit must not be less than 1` · `limit must not be greater than 100` | `limit` no es un entero entre 1 y 100. |
| 400 | `customerId must be a UUID` · `commercialItemId must be a UUID` | No son UUID. |
| 400 | `dateFrom must be a string` · `dateFrom must be a valid ISO 8601 date string` · `dateFrom must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Parámetro repetido, fecha imposible o sin segundos ni zona. Un `+` sin codificar llega como espacio y da los dos últimos. Los mismos mensajes existen para `dateTo`. |
| 400 | `status must be one of the following values: INCOMPLETE_DATA, READY_TO_SEND, SENT_TO_OWNER, WAITING_RESPONSE, ACCEPTED, REJECTED, MODIFICATION_REQUESTED, RENEGOTIATING, CANCELLED` | Valor fuera del enum. |
| 400 | `channel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Valor fuera del enum. |
| 400 | `search must be a string` · `search should not be empty` · `search must be shorter than or equal to 200 characters` | Vacío o solo espacios, más de 200 caracteres, o el parámetro repetido. |
| 400 | `dateFrom debe ser anterior a dateTo y las fechas deben ser válidas` | `dateFrom` es igual o posterior a `dateTo`. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- Orden fijo: `createdAt` descendente y luego `id` ascendente. Los filtros se combinan con AND.
- El rango filtra por `reservationAt`, no por `createdAt`. Con un rango, las solicitudes sin fecha no aparecen. Calcula los límites como medianoche en la zona del restaurante, igual que el calendario.
- Estadísticas (`EstadisticasView`) pide las solicitudes del periodo con este rango: las cuenta por fecha de reserva, no por fecha de alta, y deja fuera las que no tienen `reservationAt`.
- `status` acepta un solo valor. Para una pestaña con varios estados hay que pedir cada uno (es lo que hace la pestaña Esperando de `SolicitudesView`).
- Con el backend actual solo se alcanzan `INCOMPLETE_DATA`, `READY_TO_SEND` y `CANCELLED`. Los KPI y las pestañas Esperando, Aceptadas y Rechazadas siempre darán 0 (ver [Estados y transiciones](#estados-y-transiciones-2)).
- Para un conteo barato usa `limit: 1` y lee `pagination.total`.
- Las filas y el total se leen en paralelo, fuera de una transacción: con escrituras simultáneas, el total puede no coincidir un momento con las filas.
- `customer` es un resumen. Un cliente de Messenger no trae `phone` ni `email` salvo que se los hayan agregado en el CRM, y puede traer `firstName` en `null` si Meta no dio el nombre.

### Ver detalle de solicitud de reserva
`GET /reservation-requests/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `ReservationRequest` |
| ft-crm | `requestsApi.get(id: string): Promise<ReservationRequest>` · existe (sin pantalla que la use) |
| Caché | `qk.request(id)` → `["reservation-requests", "detail", id]` · **nueva**. Queda dentro de `qk.requestsAll`. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la solicitud. Si no es un UUID, responde 400. |

**Respuesta** (200)

```json
{
  "id": "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
  "code": "RES-2026-000042",
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "sourceChannel": "PHONE",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 4,
  "quotedPrice": "150.00",
  "currency": "PEN",
  "comments": "Consulta por una reserva familiar",
  "specialRequirements": "Una silla para bebé",
  "status": "READY_TO_SEND",
  "createdAt": "2026-11-03T02:35:20.418Z",
  "updatedAt": "2026-11-03T02:35:20.418Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |
| 404 | `Solicitud de reserva no encontrada` | La solicitud no existe. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- Devuelve el mismo recurso que el listado: `customer` es un resumen (`id`, `firstName`, `lastName`, `phone`, `email`) y `commercialItem` es `null` si no hay elemento.
- Úsalo para abrir una solicitud por id (p. ej. desde un enlace) sin depender de la página del listado en la que esté.
- Muestra las acciones de editar y cancelar solo si `status` es `INCOMPLETE_DATA` o `READY_TO_SEND` y el rol es ADMIN u OPERATOR. Editar en otro estado responde 409. Cancelar una solicitud ya cancelada responde 200 sin cambios; en los demás estados, 409.

### Editar solicitud de reserva
`PATCH /reservation-requests/:id`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `ReservationRequest` |
| ft-crm | `requestsApi.update(id: string, body: UpdateReservationRequestBody): Promise<ReservationRequest>` · **nueva** |
| Caché | Guarda la respuesta en `qk.request(id)` (nueva) e invalida `qk.requestsAll` y `qk.statsAll` (nueva). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la solicitud. Si no es un UUID, responde 400. |

**Body** (`UpdateReservationRequestBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `customerId` | `Uuid` | No | Cliente existente; no admite `null`. Cambiarlo pasa la solicitud a otro cliente. |
| `sourceChannel` | `ContactChannel` | No | Valor del enum; no admite `null`. |
| `commercialItemId` | `Uuid` \| null | No | Si cambia, el nuevo elemento debe existir, estar activo y `APPROVED`. Reenviar el actual es válido aunque ya esté inactivo. `null` lo quita. |
| `reservationAt` | `IsoDateTime` \| null | No | Mismo formato con segundos y zona. Si llega, tiene que ser futura, aunque sea la misma fecha que ya tenía. `null` la borra. |
| `numberOfPeople` | number \| null | No | Entero JSON de 1 a 2147483647. `null` lo borra. |
| `quotedPrice` | `MoneyString` \| null | No | Mismo formato que al crear. `null` borra el precio y, si no envías `currency`, también la moneda. |
| `currency` | `CurrencyCode` \| null | No | `PEN` o `USD`. Tiene que quedar coherente con el precio. |
| `comments` | string \| null | No | Trim; de 1 a 5000 caracteres. `null` lo borra. |
| `specialRequirements` | string \| null | No | Trim; de 1 a 5000 caracteres. `null` lo borra. |

Reglas del servicio:
- Hay que enviar al menos un campo; `null` cuenta como campo.
- Solo se edita en `INCOMPLETE_DATA` o `READY_TO_SEND`.
- `status` se recalcula en cada edición con la fecha y el número de personas que quedan.
- Precio y moneda, según lo que envíes:

| Envías | Resultado |
|---|---|
| `quotedPrice` nuevo, sin `currency` | Conserva la moneda actual. Si no había, usa la del restaurante (409 si el restaurante no está configurado). |
| `quotedPrice: null`, sin `currency` | Borra el precio y la moneda. |
| `currency` sola | Válida solo si ya hay precio; si no, 400. |
| `currency: null` con precio, o `quotedPrice: null` con una `currency` | 400 `El precio y la moneda deben estar presentes juntos`. |

`status`, `code` y cualquier otro campo responden 400.

**Ejemplo de petición**

```ts
const request = await requestsApi.update("c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93", {
  numberOfPeople: 5,
  quotedPrice: "180.00",
  specialRequirements: "Una silla para bebé y mesa en terraza",
});
```

Viaja como `PATCH /api/backend/reservation-requests/c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93` con este body:

```json
{
  "numberOfPeople": 5,
  "quotedPrice": "180.00",
  "specialRequirements": "Una silla para bebé y mesa en terraza"
}
```

**Respuesta** (200)

```json
{
  "id": "c7a3e9f1-4b2d-4e8a-9f60-2d5b8c1e7a93",
  "code": "RES-2026-000042",
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "sourceChannel": "PHONE",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 5,
  "quotedPrice": "180.00",
  "currency": "PEN",
  "comments": "Consulta por una reserva familiar",
  "specialRequirements": "Una silla para bebé y mesa en terraza",
  "status": "READY_TO_SEND",
  "createdAt": "2026-11-03T02:35:20.418Z",
  "updatedAt": "2026-11-03T03:15:44.071Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `status` o `code`). |
| 400 | `customerId must be a UUID` | No es un UUID o es `null`. |
| 400 | `sourceChannel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Valor fuera del enum o `null`. |
| 400 | `commercialItemId must be a UUID` | No es un UUID. |
| 400 | `reservationAt must be a string` · `reservationAt must be a valid ISO 8601 date string` · `reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Ver [Crear solicitud de reserva](#crear-solicitud-de-reserva). |
| 400 | `numberOfPeople must be an integer number` · `numberOfPeople must not be less than 1` · `numberOfPeople must not be greater than 2147483647` | No es un entero JSON entre 1 y 2147483647. |
| 400 | `quotedPrice must be a string` · `quotedPrice must match /^(?:0\|[1-9]\d{0,7})(?:\.\d{1,2})?$/ regular expression` | Llega como número o con otro formato. |
| 400 | `currency must be one of the following values: PEN, USD` | Otra moneda. |
| 400 | `comments must be a string` · `comments should not be empty` · `comments must be shorter than or equal to 5000 characters` | Igual para `specialRequirements`. |
| 400 | `Proporciona al menos un campo para actualizar` | El body está vacío (`{}`). Se comprueba antes de buscar la solicitud. |
| 400 | `El elemento comercial debe estar activo y aprobado` | El nuevo `commercialItemId` está inactivo o no está `APPROVED`. |
| 400 | `La fecha de reserva debe ser válida y futura` | El `reservationAt` enviado no es futuro (también si es la misma fecha, ya pasada). |
| 400 | `El precio y la moneda deben estar presentes juntos` | El precio y la moneda no quedan coherentes (ver la tabla de arriba). |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Solicitud de reserva no encontrada` | La solicitud no existe. |
| 404 | `Cliente no encontrado` | El nuevo `customerId` no existe. |
| 404 | `Elemento comercial no encontrado` | El nuevo `commercialItemId` no existe. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `La solicitud no admite modificaciones en su estado actual` | La solicitud no está en `INCOMPLETE_DATA` ni en `READY_TO_SEND` (p. ej. está `CANCELLED`). |
| 409 | `Configura el restaurante antes de crear solicitudes o reservas` | Se fija un precio en una solicitud sin moneda, sin enviar `currency`, y el restaurante no está configurado. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 409 | `El código o la solicitud ya están vinculados a una reserva` | Defensivo. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: `:id` y validación del body → body vacío → solicitud (404) → estado (409) → cliente nuevo (404) → elemento nuevo (404 o 400) → fecha futura (400) → precio y moneda (409 o 400).

**Efectos**

- Actualiza los campos enviados, recalcula `status` (`INCOMPLETE_DATA` ⇄ `READY_TO_SEND`) y cambia `updatedAt`.
- No modifica al cliente ni crea reservas.

**Notas para el frontend**

- Envía solo los campos modificados. Omitir conserva; `null` borra, salvo `customerId` y `sourceChannel`.
- No reenvíes `reservationAt` si no cambió: si la fecha guardada ya pasó, reenviarla responde 400. Si no la envías, la fecha pasada se conserva y puedes editar el resto.
- Borrar la fecha o el número de personas devuelve la solicitud a `INCOMPLETE_DATA`; completar ambos la pasa a `READY_TO_SEND`. Muestra el `status` de la respuesta.
- El precio no se copia del catálogo: si cambian el catálogo o la moneda del restaurante, el precio guardado no cambia.
- Ante el 409 `La solicitud no admite modificaciones…`, recarga la solicitud: otra persona la canceló.

### Cancelar solicitud de reserva
`PATCH /reservation-requests/:id/status`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `ReservationRequest` |
| ft-crm | `requestsApi.cancel(id: string): Promise<ReservationRequest>` · existe (sin pantalla que la use) |
| Caché | Guarda la respuesta en `qk.request(id)` (nueva) e invalida `qk.requestsAll` y `qk.statsAll` (nueva). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la solicitud. Si no es un UUID, responde 400. |

**Body** (`CancelReservationRequestBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `status` | `"CANCELLED"` | Sí | Único valor aceptado. Cualquier otro estado, `null` o un campo extra responden 400. |

**Ejemplo de petición**

```ts
const request = await requestsApi.cancel("4e1b8d6f-0a3c-4f92-87d5-b6c2e9a1f304");
```

Viaja como `PATCH /api/backend/reservation-requests/4e1b8d6f-0a3c-4f92-87d5-b6c2e9a1f304/status` con este body:

```json
{ "status": "CANCELLED" }
```

**Respuesta** (200)

```json
{
  "id": "4e1b8d6f-0a3c-4f92-87d5-b6c2e9a1f304",
  "code": "RES-2026-000043",
  "customerId": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
  "commercialItemId": null,
  "sourceChannel": "FACEBOOK",
  "reservationAt": null,
  "numberOfPeople": null,
  "quotedPrice": null,
  "currency": null,
  "comments": "Pregunta por almuerzo para el domingo",
  "specialRequirements": null,
  "status": "CANCELLED",
  "createdAt": "2026-11-03T03:10:02.115Z",
  "updatedAt": "2026-11-03T03:12:09.880Z",
  "customer": {
    "id": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
    "firstName": "Rosa Mamani",
    "lastName": null,
    "phone": null,
    "email": null
  },
  "commercialItem": null
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo además de `status`. |
| 400 | `status must be one of the following values: CANCELLED` | Falta, es `null` o llega otro valor (`READY_TO_SEND`, `ACCEPTED`, `REJECTED`…). |
| 400 | `Solo se permite cancelar solicitudes en esta fase` | Defensivo: la validación del body lo intercepta antes. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Solicitud de reserva no encontrada` | La solicitud no existe. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `La solicitud no admite modificaciones en su estado actual` | La solicitud está en un estado distinto de `INCOMPLETE_DATA`, `READY_TO_SEND` o `CANCELLED`. Hoy ninguna ruta lleva a esos estados. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

**Efectos**

- Pasa la solicitud a `CANCELLED` y cambia `updatedAt`. Es un estado final: la solicitud no se puede editar ni reactivar.
- Si ya estaba cancelada, responde 200 con el mismo recurso y el mismo `updatedAt` (idempotente).
- No borra la solicitud ni toca al cliente.

**Notas para el frontend**

- Pide confirmación antes de cancelar: no hay vuelta atrás.
- Muestra la acción solo a ADMIN y OPERATOR (`can(roles, "request.cancel")`) y solo en `INCOMPLETE_DATA` o `READY_TO_SEND`.
- Si una edición y una cancelación llegan a la vez, la cancelación no se pierde: la edición se aplica antes o responde 409. Refresca la solicitud tras cualquier 409.
- Ciclo de vida actual: `INCOMPLETE_DATA` ⇄ `READY_TO_SEND` (lo calcula el backend) → `CANCELLED` (manual y final). Ver [Estados y transiciones](#estados-y-transiciones-2).

### Crear reserva manual
`POST /reservations`

| | |
|---|---|
| Roles | ADMIN |
| Respuesta | 201 · `Reservation` |
| ft-crm | `reservationsApi.create(body: CreateReservationBody): Promise<Reservation>` · **nueva** |
| Caché | Invalida `qk.reservationsAll` y `qk.statsAll` (nueva). |
| Cabeceras y límites | Sin `Idempotency-Key`: cada POST crea una reserva con otro `code`. Tras un 504, revisa el calendario antes de reintentar. |

**Body** (`CreateReservationBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `customerId` | `Uuid` | Sí | Cliente existente. |
| `reservationAt` | `IsoDateTime` | Sí | ISO 8601 con segundos y zona (`Z` o `±HH:mm`), hasta 3 decimales. Fecha real y estrictamente posterior a la hora del servidor. |
| `numberOfPeople` | number | Sí | Entero JSON de 1 a 2147483647. El máximo es técnico, no un aforo. |
| `commercialItemId` | `Uuid` \| null | No | Elemento existente, activo y `APPROVED`. |
| `notes` | string \| null | No | Texto general de la reserva. Trim; de 1 a 5000 caracteres. |

Reglas del servicio:
- La reserva nace en `CONFIRMED`, sin responsable y sin solicitud vinculada (`reservationRequestId: null`).
- No se valida aforo, horario de atención, mesas ni solapamientos.
- `reservationRequestId`, `code`, `status`, `assignedUserId` y cualquier otro campo responden 400.

**Ejemplo de petición**

```ts
const reservation = await reservationsApi.create({
  customerId: "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  reservationAt: "2026-11-07T20:00:00-05:00",
  numberOfPeople: 4,
  commercialItemId: "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  notes: "Reserva registrada manualmente por administración",
});
```

Viaja como `POST /api/backend/reservations` con este body:

```json
{
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "reservationAt": "2026-11-07T20:00:00-05:00",
  "numberOfPeople": 4,
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "notes": "Reserva registrada manualmente por administración"
}
```

**Respuesta** (201)

```json
{
  "assignedUserId": null,
  "assignedUser": null,
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 4,
  "status": "CONFIRMED",
  "notes": "Reserva registrada manualmente por administración",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T02:45:30.512Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `reservationRequestId`, `status` o `assignedUserId`). |
| 400 | `customerId must be a UUID` | Falta, es `null` o no es un UUID. |
| 400 | `reservationAt must be a string` · `reservationAt must be a valid ISO 8601 date string` · `reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Falta, es `null` (en ambos casos llegan los tres), no es una fecha real o le faltan los segundos o la zona. |
| 400 | `numberOfPeople must be an integer number` · `numberOfPeople must not be less than 1` · `numberOfPeople must not be greater than 2147483647` | Falta o es `null` (llegan los tres), no es un entero JSON o está fuera de rango. |
| 400 | `commercialItemId must be a UUID` | No es un UUID. |
| 400 | `notes must be a string` · `notes should not be empty` · `notes must be shorter than or equal to 5000 characters` | No es texto, queda vacío tras el trim o pasa de 5000. |
| 400 | `El elemento comercial debe estar activo y aprobado` | El elemento está inactivo o no está `APPROVED`. |
| 400 | `La fecha de reserva debe ser válida y futura` | `reservationAt` no es posterior a la hora del servidor. |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN (p. ej. OPERATOR, OWNER o SUPPORT). |
| 404 | `Cliente no encontrado` | `customerId` no existe. |
| 404 | `Elemento comercial no encontrado` | `commercialItemId` no existe. |
| 409 | `Configura el restaurante antes de crear solicitudes o reservas` | Aún no existe la configuración del restaurante. Se comprueba primero. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 409 | `El código o la solicitud ya están vinculados a una reserva` | Defensivo: colisión de un valor único en la base de datos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |
| 503 | `La zona horaria del restaurante no es válida` | Caso límite: el `timeZone` guardado no es una zona IANA válida. |

Orden: configuración (409) → cliente (404) → elemento (404 o 400) → fecha futura (400) → código (503).

**Efectos**

- Crea la reserva en `CONFIRMED` con su `code` `R-<año>-<secuencia>`:
  - La secuencia es propia de las reservas, tiene al menos 6 dígitos, puede tener saltos y no se reinicia cada año.
  - El año es el de la creación en la zona del restaurante.
  - El código no cambia nunca, tampoco al reprogramar.
- Aparece en `GET /reservations` desde ese momento.
- No aprueba ni vincula ninguna solicitud, no modifica al cliente y no avisa a nadie.

**Notas para el frontend**

- Es la única forma de crear reservas: con el backend actual no existe el paso «solicitud aceptada → reserva». Sin esta pantalla, el calendario estará vacío en modo live.
- Muestra la acción solo a ADMIN. ft-crm no tiene una acción para esto: añade p. ej. `"reservation.create": ["ADMIN"]` en `permissions.ts`.
- Arma `reservationAt` con la fecha y la hora elegidas en la zona del restaurante; `toISOString()` sirve.
- En el selector de elementos, ofrece solo los activos y aprobados.
- Deshabilita el botón mientras la petición está en curso: un doble envío crea dos reservas.
- Después invalida `qk.reservationsAll` y, si la reserva cae en el periodo visible, el calendario la mostrará al refrescar.

### Listar reservas (calendario)
`GET /reservations`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<Reservation>` |
| ft-crm | `reservationsApi.list(query: ReservationListQuery): Promise<Paginated<Reservation>>` · existe |
| Caché | `qk.reservations(query)` → `["reservations", "list", query]`. El calendario usa `qk.reservations({ scope: "calendario", dateFrom, dateTo })`. |

**Query** (`ReservationListQuery`)

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | number | No | `1` | Entero de 1 a 1 000 000. |
| `limit` | number | No | `20` | Entero de 1 a 100. |
| `dateFrom` | `IsoDateTime` | No | — | Con segundos y zona. Límite **incluido**: `reservationAt >= dateFrom`. |
| `dateTo` | `IsoDateTime` | No | — | Con segundos y zona. Límite **excluido**: `reservationAt < dateTo`. Con ambos, `dateFrom` tiene que ser anterior a `dateTo`. |
| `customerId` | `Uuid` | No | — | Reservas de ese cliente. |
| `commercialItemId` | `Uuid` | No | — | Reservas de ese elemento comercial. |
| `assignedUserId` | `Uuid` | No | — | Reservas asignadas a ese usuario. |
| `status` | `ReservationStatus` | No | — | Un solo valor del enum, incluido `RESCHEDULED`. |
| `excludeCancelled` | boolean | No | — | En la URL solo `true` o `false`, en minúsculas. `true` oculta las `CANCELLED`; `false` o no enviarlo no filtra. No se combina con `status=CANCELLED`. |
| `search` | string | No | — | Trim; de 1 a 200 caracteres. Coincidencia parcial y sin distinguir mayúsculas en `code` y en el nombre y apellido del cliente. En el `phone` del cliente, coincidencia con el texto tal como se guardó; y, si el texto tiene dígitos, en su teléfono normalizado. No busca por email. |

**Ejemplo de petición**

La semana del lunes 2 al domingo 8 de noviembre en Lima, como la pide `CalendarioView` con `reservationsPageQuery`:

```ts
const page = await reservationsApi.list({
  dateFrom: "2026-11-02T05:00:00.000Z",
  dateTo: "2026-11-09T05:00:00.000Z",
  excludeCancelled: true,
  page: 1,
  limit: 100,
});
```

Viaja como `GET /api/backend/reservations?dateFrom=2026-11-02T05%3A00%3A00.000Z&dateTo=2026-11-09T05%3A00%3A00.000Z&excludeCancelled=true&page=1&limit=100`.

**Respuesta** (200)

```json
{
  "data": [
    {
      "assignedUserId": null,
      "assignedUser": null,
      "id": "0b4e7d2a-9c1f-4a58-b3e6-2f8d5c7a9e14",
      "code": "R-2026-000014",
      "reservationRequestId": null,
      "customerId": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
      "commercialItemId": null,
      "reservationAt": "2026-11-07T23:30:00.000Z",
      "numberOfPeople": 2,
      "status": "UPCOMING",
      "notes": null,
      "createdAt": "2026-11-03T01:10:44.207Z",
      "updatedAt": "2026-11-03T01:58:02.639Z",
      "customer": {
        "id": "b8e1d4c7-2a9f-4e63-9d15-7f0a3c6b2e81",
        "firstName": "Rosa Mamani",
        "lastName": null,
        "phone": null,
        "email": null
      },
      "commercialItem": null
    },
    {
      "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
      "assignedUser": {
        "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
        "firstName": "María",
        "lastName": "Huamán",
        "isActive": true,
        "isEligible": true
      },
      "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
      "code": "R-2026-000015",
      "reservationRequestId": null,
      "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
      "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
      "reservationAt": "2026-11-08T18:00:00.000Z",
      "numberOfPeople": 6,
      "status": "UPCOMING",
      "notes": "Se amplió el grupo",
      "createdAt": "2026-11-03T02:45:30.512Z",
      "updatedAt": "2026-11-03T03:20:41.093Z",
      "customer": {
        "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
        "firstName": "Carlos",
        "lastName": "Quispe",
        "phone": "987 654 321",
        "email": "carlos.quispe@example.com"
      },
      "commercialItem": {
        "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
        "nameEs": "Trucha a la parrilla",
        "nameEn": "Grilled trout",
        "type": "DISH",
        "isActive": true,
        "approvalStatus": "APPROVED"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 100, "total": 2, "totalPages": 1 }
}
```

La primera reserva es el sábado 7 a las 18:30 en Lima; la segunda, el domingo 8 a las 13:00.

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `property <parámetro> should not exist` | Llega un parámetro no declarado (p. ej. `view`). |
| 400 | `page must be an integer number` · `page must not be less than 1` · `page must not be greater than 1000000` | `page` no es un entero entre 1 y 1 000 000. |
| 400 | `limit must be an integer number` · `limit must not be less than 1` · `limit must not be greater than 100` | `limit` no es un entero entre 1 y 100. |
| 400 | `customerId must be a UUID` · `commercialItemId must be a UUID` · `assignedUserId must be a UUID` | No son UUID. |
| 400 | `dateFrom must be a string` · `dateFrom must be a valid ISO 8601 date string` · `dateFrom must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Parámetro repetido, fecha imposible o sin segundos ni zona. Un `+` sin codificar llega como espacio. Los mismos mensajes existen para `dateTo`. |
| 400 | `status must be one of the following values: CONFIRMED, UPCOMING, IN_SERVICE, COMPLETED, RESCHEDULED, CANCELLED, NO_SHOW` | Valor fuera del enum. |
| 400 | `excludeCancelled must be a boolean value` | Algo distinto de `true` o `false` (p. ej. `TRUE`, `1` o `yes`). |
| 400 | `search must be a string` · `search should not be empty` · `search must be shorter than or equal to 200 characters` | Vacío o solo espacios, más de 200 caracteres, o el parámetro repetido. |
| 400 | `No combines status=CANCELLED con excludeCancelled=true` | Llegan los dos filtros a la vez. |
| 400 | `dateFrom debe ser anterior a dateTo y las fechas deben ser válidas` | `dateFrom` es igual o posterior a `dateTo`. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- Las vistas de día, semana y mes usan esta ruta. Solo lee reservas: las solicitudes nunca aparecen en el calendario.
- El rango es semiabierto (`dateFrom <= reservationAt < dateTo`). Puedes enviar un solo límite y consultar fechas pasadas.
- El backend filtra instantes, no días. Calcula la medianoche en la zona del restaurante y conviértela en instante, como hace `periodRange` en `calendar-utils.ts`:
  - Un día en Lima: `dateFrom=2026-11-07T05:00:00.000Z` y `dateTo=2026-11-08T05:00:00.000Z` (equivalen a `…T00:00:00-05:00`).
  - Semana o mes: el inicio del periodo y el inicio del siguiente.
  - Si envías offsets positivos, construye la URL con `toSearch` o `URLSearchParams`: así el `+` viaja como `%2B`.
- Orden fijo: `reservationAt` ascendente y luego `id` ascendente. El máximo es 100 por página: para un periodo completo usa `limit: 100` y recorre las páginas hasta `totalPages` (`collectPages`, que ft-crm corta en 20 páginas).
- Agrupa por día con la zona del restaurante, nunca por el día UTC (`groupByDay`). Una cena a las 20:00 en Lima ya es el día siguiente en UTC.
- Sin `excludeCancelled` se incluyen las canceladas; las finalizadas (`COMPLETED`, `NO_SHOW`) siempre se incluyen.
- No hay filtro de reservas sin responsable. Para «Mis reservas», filtra con `assignedUserId` igual al `id` de `GET /auth/me`.
- El listado no trae `noteHistory` ni `rescheduleHistory`: solo los trae el detalle.
- Para un conteo barato usa `limit: 1` y lee `pagination.total` (columna RESERVAS de Clientes).
- Las filas y el total se leen en paralelo, fuera de una transacción, y cada página es una consulta aparte. Si cambian reservas mientras recorres las páginas, una puede repetirse o faltar. `groupByDay` ya descarta las repetidas.

### Ver detalle de reserva
`GET /reservations/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `ReservationDetail` |
| ft-crm | `reservationsApi.get(id: string): Promise<ReservationDetail>` · existe |
| Caché | `qk.reservation(id)` → `["reservations", "detail", id]`. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Respuesta** (200)

```json
{
  "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "assignedUser": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T18:00:00.000Z",
  "numberOfPeople": 6,
  "status": "UPCOMING",
  "notes": "Se amplió el grupo",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T03:20:41.093Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  },
  "noteHistory": [
    {
      "id": "a9c3e7b1-5d2f-4a86-8e14-6f0b2d9c3e57",
      "reservationId": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
      "authorUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
      "content": "Cliente solicita mesa cerca de la ventana",
      "createdAt": "2026-11-03T02:52:47.905Z",
      "author": {
        "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
        "firstName": "María",
        "lastName": "Huamán"
      }
    }
  ],
  "rescheduleHistory": [
    {
      "id": "f4e8a2c6-1b9d-4f73-b2a5-7c3e0d8f1a96",
      "previousReservationAt": "2026-11-08T01:00:00.000Z",
      "newReservationAt": "2026-11-08T18:00:00.000Z",
      "reason": "Cliente solicitó cambio de horario",
      "changedByUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
      "createdAt": "2026-11-03T03:01:19.664Z",
      "changedBy": {
        "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
        "firstName": "María",
        "lastName": "Huamán"
      }
    }
  ]
}
```

Es la reserva `R-2026-000015` de los ejemplos de este archivo, después de asignarla, agregar una observación, editarla, reprogramarla y marcarla como preparada (`UPCOMING`).

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario solo tiene SUPPORT. |
| 404 | `Reserva no encontrada` | La reserva no existe. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- Devuelve lo mismo que el listado más `noteHistory` y `rescheduleHistory`. Ambos vienen ordenados por `createdAt` ascendente (luego por `id`), sin paginar.
- `assignedUser.isEligible` se calcula en cada lectura: el responsable está activo y hoy tiene ADMIN u OPERATOR. Si es `false`, muestra un aviso: un ADMIN puede reasignar la reserva. Si el usuario se borra de la base de datos, `assignedUserId` pasa a `null`.
- `notes` es el texto general, editable con el PATCH. `noteHistory` son las observaciones con autor, que se crean con `POST /reservations/:id/notes`. Son independientes.
- Con las rutas actuales, `reservationRequestId` siempre es `null`: la etiqueta «Aceptada por el dueño» de `ReservationSummary` nunca se mostrará en modo live.
- La reserva no trae canal. ft-crm muestra el `sourceChannel` del cliente con `customersApi.get(customerId)`.
- `ReservationDetailPanel` carga la reserva por id, así que el panel sigue abierto aunque la reserva salga del periodo visible tras reprogramarla.
- Usa `RESERVATION_STATUS_TRANSITIONS` y la hora de la reserva para decidir qué acciones mostrar (ver [Estados y transiciones](#estados-y-transiciones-2)).

### Editar reserva
`PATCH /reservations/:id`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `Reservation` (sin historiales) |
| ft-crm | `reservationsApi.update(id: string, body: UpdateReservationBody): Promise<Reservation>` · **nueva** |
| Caché | Mezcla la respuesta en `qk.reservation(id)` e invalida `qk.reservationsAll` (refresca el calendario y el `rescheduleHistory` del detalle) y `qk.statsAll` (nueva). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Body** (`UpdateReservationBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `customerId` | `Uuid` | No | Cliente existente; no admite `null`. |
| `reservationAt` | `IsoDateTime` | No | Con segundos y zona; no admite `null`. Si llega, tiene que ser futura, aunque sea el mismo instante. Si cambia el instante, la reserva pasa a `RESCHEDULED` y se agrega una entrada al historial. |
| `numberOfPeople` | number | No | Entero JSON de 1 a 2147483647; no admite `null`. |
| `commercialItemId` | `Uuid` \| null | No | Si cambia, el nuevo elemento debe existir, estar activo y `APPROVED`. Reenviar el actual es válido aunque ya esté inactivo. `null` lo quita. |
| `notes` | string \| null | No | Texto general. Trim; de 1 a 5000 caracteres. `null` lo borra. |

Reglas del servicio:
- Hay que enviar al menos un campo; `null` cuenta como campo.
- Solo se edita en `CONFIRMED`, `UPCOMING` o `RESCHEDULED`.
- `status`, `code`, `assignedUserId`, `reservationRequestId` y cualquier otro campo responden 400.

**Ejemplo de petición**

```ts
const reservation = await reservationsApi.update("e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74", {
  numberOfPeople: 6,
  notes: "Se amplió el grupo",
});
```

Viaja como `PATCH /api/backend/reservations/e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74` con este body:

```json
{
  "numberOfPeople": 6,
  "notes": "Se amplió el grupo"
}
```

**Respuesta** (200)

```json
{
  "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "assignedUser": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 6,
  "status": "CONFIRMED",
  "notes": "Se amplió el grupo",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T02:57:10.226Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega un campo no declarado (p. ej. `status` o `assignedUserId`). |
| 400 | `customerId must be a UUID` | No es un UUID o es `null`. |
| 400 | `reservationAt must be a string` · `reservationAt must be a valid ISO 8601 date string` · `reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Es `null` (llegan los tres), no es una fecha real o le faltan los segundos o la zona. |
| 400 | `numberOfPeople must be an integer number` · `numberOfPeople must not be less than 1` · `numberOfPeople must not be greater than 2147483647` | Es `null` (llegan los tres), no es un entero JSON o está fuera de rango. |
| 400 | `commercialItemId must be a UUID` | No es un UUID. |
| 400 | `notes must be a string` · `notes should not be empty` · `notes must be shorter than or equal to 5000 characters` | No es texto, queda vacío tras el trim o pasa de 5000. |
| 400 | `Proporciona al menos un campo para actualizar` | El body está vacío (`{}`). Se comprueba antes de buscar la reserva. |
| 400 | `El elemento comercial debe estar activo y aprobado` | El nuevo elemento está inactivo o no está `APPROVED`. |
| 400 | `La fecha de reserva debe ser válida y futura` | El `reservationAt` enviado no es futuro (también si es el mismo instante, ya pasado). |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Reserva no encontrada` | La reserva no existe. |
| 404 | `Cliente no encontrado` | El nuevo `customerId` no existe. |
| 404 | `Elemento comercial no encontrado` | El nuevo `commercialItemId` no existe. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `La reserva no admite edición o reprogramación en su estado actual` | La reserva está en `IN_SERVICE`, `COMPLETED`, `CANCELLED` o `NO_SHOW`. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 409 | `El código o la solicitud ya están vinculados a una reserva` | Defensivo. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: `:id` y validación del body → body vacío → reserva (404) → estado (409) → cliente nuevo (404) → elemento nuevo (404 o 400) → fecha futura (400).

**Efectos**

- Actualiza los campos enviados y `updatedAt`. El `code` nunca cambia.
- Si `reservationAt` cambia de instante, en la misma transacción:
  - el estado pasa a `RESCHEDULED`;
  - se agrega una entrada a `rescheduleHistory` con la fecha anterior, la nueva, `reason: null` y el usuario del token como autor.
- Si llega el mismo instante (aunque sea con otro offset), no se agrega historial y el estado no cambia.
- No cambia el responsable ni las observaciones, y no avisa a nadie.

**Notas para el frontend**

- Para cambiar la fecha con un motivo, usa [Reprogramar reserva](#reprogramar-reserva); este PATCH guarda el cambio con `reason: null`.
- Envía solo los campos modificados. Si la hora de la reserva ya pasó, no reenvíes `reservationAt`: la respuesta sería 400. Sin `reservationAt`, puedes editar las notas de una reserva pasada.
- Habilita la edición solo en `CONFIRMED`, `UPCOMING` y `RESCHEDULED`.
- La respuesta no trae `noteHistory` ni `rescheduleHistory`: mézclala con el detalle en caché y luego invalida `qk.reservationsAll`.
- Si una cancelación llega a la vez que esta edición, la cancelación no se pierde: la edición se aplica antes o responde 409.

### Cambiar estado de reserva
`PATCH /reservations/:id/status`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `Reservation` (sin historiales) |
| ft-crm | `reservationsApi.setStatus(id: string, status: ReservationStatusTarget): Promise<Reservation>` · existe (la usa «Marcar como preparada») |
| Caché | Mezcla la respuesta en `qk.reservation(id)` e invalida `qk.reservationsAll` (ya lo hace `PrepareControl`) y `qk.statsAll` (nueva). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Body** (`UpdateReservationStatusBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `status` | `ReservationStatusTarget` | Sí | `CONFIRMED`, `UPCOMING`, `IN_SERVICE`, `COMPLETED`, `CANCELLED` o `NO_SHOW`. `RESCHEDULED` no se acepta: lo pone el backend al cambiar la fecha. |

Reglas del servicio:
- Solo se aceptan las transiciones de `RESERVATION_STATUS_TRANSITIONS` (ver [Estados y transiciones](#estados-y-transiciones-2)).
- `IN_SERVICE` y `NO_SHOW` exigen que haya llegado la hora: `reservationAt <= ahora`, según el reloj del servidor y sin tolerancia.
- Enviar el estado actual responde 200 sin cambios, incluso en un estado final.

**Ejemplo de petición**

```ts
const reservation = await reservationsApi.setStatus("e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74", "UPCOMING");
```

Viaja como `PATCH /api/backend/reservations/e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74/status` con este body:

```json
{ "status": "UPCOMING" }
```

**Respuesta** (200)

```json
{
  "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "assignedUser": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T18:00:00.000Z",
  "numberOfPeople": 6,
  "status": "UPCOMING",
  "notes": "Se amplió el grupo",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T03:20:41.093Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo además de `status`. |
| 400 | `status must be one of the following values: CONFIRMED, UPCOMING, IN_SERVICE, COMPLETED, CANCELLED, NO_SHOW` | Falta, es `null`, no está en la lista o es `RESCHEDULED`. |
| 400 | `Estado no habilitado en esta fase` | Defensivo: la validación del body lo intercepta antes. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Reserva no encontrada` | La reserva no existe. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `Transición de reserva no permitida` | El destino no está permitido desde el estado actual (p. ej. `UPCOMING` → `CONFIRMED`, o cualquier cambio desde un estado final). |
| 409 | `Todavía no ha llegado la hora de la reserva` | Se pide `IN_SERVICE` o `NO_SHOW` y `reservationAt` sigue en el futuro. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: reserva (404) → mismo estado (200 sin cambios) → transición permitida (409) → hora de la reserva (409).

**Efectos**

- Cambia `status` y `updatedAt`. Con el mismo estado no cambia nada, ni siquiera `updatedAt`.
- Cancelar no borra la reserva (no hay rutas `DELETE`): sigue en el calendario salvo que filtres con `excludeCancelled=true`.
- No cambia el responsable ni avisa a nadie. Ningún proceso del backend cambia estados por la hora.

**Notas para el frontend**

- Muestra solo los botones de `RESERVATION_STATUS_TRANSITIONS[status]` (ya está en `types.ts`).
- Habilita `IN_SERVICE` y `NO_SHOW` solo cuando `reservationAt <= ahora`. El backend usa su reloj, sin margen: si el del navegador va adelantado, aún puedes recibir el 409.
- `UPCOMING` es la «preparada» de ft-crm (`PREPARED_STATUS`). No hay vuelta directa a `CONFIRMED` (409). Si se reprograma, la reserva pasa a `RESCHEDULED`, y desde ahí sí puede volver a `CONFIRMED`.
- Pide confirmación para `CANCELLED`, `COMPLETED` y `NO_SHOW`: son finales y no se reactivan.
- Ante un 409, refresca el detalle: otra persona pudo cambiar el estado. `PrepareControl` ya invalida `qk.reservationsAll` en `onSettled`.

### Asignar o liberar responsable
`PATCH /reservations/:id/assignee`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR solo toma reservas libres o gestiona su propia asignación) |
| Respuesta | 200 · `Reservation` (sin historiales) |
| ft-crm | `reservationsApi.assign(id: string, body: AssignReservationBody): Promise<Reservation>` · **nueva** |
| Caché | Mezcla la respuesta en `qk.reservation(id)` e invalida `qk.reservationsAll` (cambia el filtro por `assignedUserId`). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Body** (`AssignReservationBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `assignedUserId` | `Uuid` \| null | Sí | Usuario existente, activo y con rol ADMIN u OPERATOR. `null` libera la reserva. La clave es obligatoria: `{}` responde 400. |

Reglas del servicio:
- Solo en `CONFIRMED`, `UPCOMING`, `RESCHEDULED` o `IN_SERVICE`.
- ADMIN puede asignar, reemplazar o quitar a cualquier usuario elegible. Si un usuario tiene ADMIN y OPERATOR, aplican las reglas de ADMIN.
- OPERATOR (sin ADMIN) solo puede:
  - tomar una reserva libre para sí mismo (`assignedUserId` = su id);
  - reenviar su propia asignación, o `null` en una reserva libre (200 sin cambios);
  - liberar (`null`) una reserva asignada a él.
- La elegibilidad se comprueba antes que la igualdad: reenviar un responsable que ya no es elegible responde 400.

**Ejemplo de petición**

```ts
const reservation = await reservationsApi.assign("e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74", {
  assignedUserId: "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
});
```

Viaja como `PATCH /api/backend/reservations/e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74/assignee` con este body:

```json
{ "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35" }
```

Para liberar: `reservationsApi.assign(id, { assignedUserId: null })`.

**Respuesta** (200)

```json
{
  "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "assignedUser": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T01:00:00.000Z",
  "numberOfPeople": 4,
  "status": "CONFIRMED",
  "notes": "Reserva registrada manualmente por administración",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T02:50:02.318Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo (p. ej. `userId`). |
| 400 | `assignedUserId must be a UUID` | Falta la clave (`{}`), es `""` o no es un UUID. |
| 400 | `El responsable debe estar activo y tener rol OPERATOR o ADMIN` | El usuario elegido está inactivo o no tiene ADMIN ni OPERATOR (p. ej. un OWNER). |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 403 | `Un operador solo puede tomar una reserva libre o gestionar su propia asignación` | Un OPERATOR sin ADMIN intenta asignar a otra persona, o tocar una reserva asignada a otra persona. |
| 404 | `Reserva no encontrada` | La reserva no existe. |
| 404 | `Responsable no encontrado` | `assignedUserId` no corresponde a ningún usuario. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `No se modifica el responsable de una reserva finalizada` | La reserva está en `COMPLETED`, `CANCELLED` o `NO_SHOW`. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: reserva (404) → estado final (409) → reglas de OPERATOR (403) → responsable (404) → elegibilidad (400) → mismo responsable (200 sin cambios).

**Efectos**

- Cambia `assignedUserId`, `assignedUser` y `updatedAt`. Con el mismo responsable no cambia nada, ni siquiera `updatedAt`.
- No notifica al responsable y no cambia la asignación de la conversación del cliente (son independientes).
- La asignación no limita quién puede operar la reserva: cualquier ADMIN u OPERATOR puede editarla o cambiar su estado.

**Notas para el frontend**

- ADMIN: arma el selector con `usersApi.list()` (`GET /users`, solo ADMIN) y quédate con los usuarios `isActive` que tengan `ADMIN` u `OPERATOR` en `roles`.
- OPERATOR: no puede listar usuarios. Muestra «Tomar» si la reserva está libre (`{ assignedUserId: <id de GET /auth/me> }`) y «Liberar» si es suya (`{ assignedUserId: null }`). Oculta ambas cuando está asignada a otra persona.
- Dos operadores que toman la misma reserva libre a la vez: uno recibe 200 y el otro 403. Refresca el detalle tras el 403.
- Si `assignedUser.isEligible` es `false`, avisa de que el responsable ya no puede atenderla y ofrece a un ADMIN reasignarla.
- Para «Mis reservas», filtra el calendario con `assignedUserId`.

### Agregar observación a la reserva
`POST /reservations/:id/notes`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 201 · `ReservationNote` |
| ft-crm | `reservationsApi.addNote(id: string, content: string): Promise<ReservationNote>` · **nueva** |
| Caché | Agrega la nota al final de `noteHistory` en `qk.reservation(id)` con `setQueryData`, o invalida `qk.reservation(id)`. El listado no cambia. |
| Cabeceras y límites | Sin `Idempotency-Key`: cada POST crea otra observación. |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Body** (`CreateReservationNoteBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `content` | string | Sí | Trim; de 1 a 5000 caracteres. No admite `null`. |

El autor sale del token. Enviar `authorUserId` u otro campo responde 400.

**Ejemplo de petición**

```ts
const note = await reservationsApi.addNote(
  "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "Cliente solicita mesa cerca de la ventana",
);
```

Viaja como `POST /api/backend/reservations/e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74/notes` con este body:

```json
{ "content": "Cliente solicita mesa cerca de la ventana" }
```

**Respuesta** (201)

```json
{
  "id": "a9c3e7b1-5d2f-4a86-8e14-6f0b2d9c3e57",
  "reservationId": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "authorUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "content": "Cliente solicita mesa cerca de la ventana",
  "createdAt": "2026-11-03T02:52:47.905Z",
  "author": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo (p. ej. `authorUserId`). |
| 400 | `content must be a string` · `content should not be empty` · `content must be shorter than or equal to 5000 characters` | Falta o es `null` (llegan los tres), no es texto, queda vacío tras el trim o pasa de 5000. |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Reserva no encontrada` | La reserva no existe. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

**Efectos**

- Crea una observación con el usuario del token como autor y la hora del servidor.
- No modifica el campo `notes` ni el `updatedAt` de la reserva, y no cambia su estado.
- No hay rutas para editar ni borrar observaciones.

**Notas para el frontend**

- Se permite en cualquier estado, incluidos los finales: sirve para aclaraciones posteriores.
- Deshabilita el botón mientras la petición está en curso: un doble clic crea dos observaciones.
- La respuesta trae `author` con nombre y apellido. Agrégala al final de `noteHistory` (orden por `createdAt` ascendente) o recarga el detalle.
- `notes` (texto general, editable con el PATCH) y `noteHistory` son independientes: muéstralos por separado.

### Reprogramar reserva
`PATCH /reservations/:id/reschedule`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `Reservation` (sin historiales) |
| ft-crm | `reservationsApi.reschedule(id: string, body: RescheduleReservationBody): Promise<Reservation>` · **nueva** |
| Caché | Mezcla la respuesta en `qk.reservation(id)` e invalida `qk.reservationsAll` (la reserva puede salir del periodo visible y el detalle gana una entrada en `rescheduleHistory`) y `qk.statsAll` (nueva). |

**Parámetros de ruta**

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la reserva. Si no es un UUID, responde 400. |

**Body** (`RescheduleReservationBody`)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `reservationAt` | `IsoDateTime` | Sí | Con segundos y zona (`Z` o `±HH:mm`), hasta 3 decimales. Fecha real y estrictamente posterior a la hora del servidor. No admite `null`. |
| `reason` | string \| null | No | Motivo. Trim; de 1 a 5000 caracteres. |

Reglas del servicio:
- Solo en `CONFIRMED`, `UPCOMING` o `RESCHEDULED`.
- El autor sale del token. Enviar `changedByUserId` u otro campo responde 400.

**Ejemplo de petición**

```ts
const reservation = await reservationsApi.reschedule("e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74", {
  reservationAt: "2026-11-08T13:00:00-05:00",
  reason: "Cliente solicitó cambio de horario",
});
```

Viaja como `PATCH /api/backend/reservations/e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74/reschedule` con este body:

```json
{
  "reservationAt": "2026-11-08T13:00:00-05:00",
  "reason": "Cliente solicitó cambio de horario"
}
```

**Respuesta** (200)

```json
{
  "assignedUserId": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
  "assignedUser": {
    "id": "5d9a1f3c-2e7b-4b48-9c06-8a4e1d7f2b35",
    "firstName": "María",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "id": "e2b7c4d9-8f1a-4c36-a5e2-9b0d3f6a1c74",
  "code": "R-2026-000015",
  "reservationRequestId": null,
  "customerId": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
  "commercialItemId": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
  "reservationAt": "2026-11-08T18:00:00.000Z",
  "numberOfPeople": 6,
  "status": "RESCHEDULED",
  "notes": "Se amplió el grupo",
  "createdAt": "2026-11-03T02:45:30.512Z",
  "updatedAt": "2026-11-03T03:01:19.664Z",
  "customer": {
    "id": "3f6c2a8e-91b4-4d2f-8a7e-5c1d9b0e7f42",
    "firstName": "Carlos",
    "lastName": "Quispe",
    "phone": "987 654 321",
    "email": "carlos.quispe@example.com"
  },
  "commercialItem": {
    "id": "6a2d9e14-7c3b-4f85-b0e2-1d8c4a9f3e57",
    "nameEs": "Trucha a la parrilla",
    "nameEn": "Grilled trout",
    "type": "DISH",
    "isActive": true,
    "approvalStatus": "APPROVED"
  }
}
```

**Errores**

| Código | Mensaje | Cuándo |
|---|---|---|
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Llega otro campo (p. ej. `changedByUserId`). |
| 400 | `reservationAt must be a string` · `reservationAt must be a valid ISO 8601 date string` · `reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z\|[+-]\d{2}:\d{2})$/ regular expression` | Falta o es `null` (llegan los tres), no es una fecha real o le faltan los segundos o la zona. |
| 400 | `reason must be a string` · `reason should not be empty` · `reason must be shorter than or equal to 5000 characters` | No es texto, queda vacío tras el trim o pasa de 5000. |
| 400 | `La fecha de reserva debe ser válida y futura` | `reservationAt` no es posterior a la hora del servidor. |
| 400 | `Datos o relaciones de reserva inválidos` | Defensivo: la base de datos rechazó una clave foránea. |
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` · `Inicia sesión para continuar.` | Los responde el BFF. Ver [Convenciones del módulo](#errores-que-ves-desde-el-navegador). |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. solo OWNER o SUPPORT). |
| 404 | `Reserva no encontrada` | La reserva no existe. |
| 404 | `Solicitud o reserva no encontrada` | Defensivo. |
| 409 | `La reserva no admite edición o reprogramación en su estado actual` | La reserva está en `IN_SERVICE`, `COMPLETED`, `CANCELLED` o `NO_SHOW`. Se comprueba antes que la fecha. |
| 409 | `Conflicto concurrente; vuelve a intentarlo` | La transacción siguió en conflicto tras 3 intentos. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body pasa de 100 kb. |

Orden: reserva (404) → estado (409) → fecha futura (400) → mismo instante (200 sin cambios).

**Efectos**

- Si el instante es distinto, en una sola transacción:
  - `reservationAt` cambia y el estado pasa a `RESCHEDULED` (también desde `UPCOMING`);
  - se agrega una entrada a `rescheduleHistory` con `previousReservationAt`, `newReservationAt`, `reason` y `changedByUserId` (el usuario del token).
- Si es el mismo instante (aunque sea con otro offset), responde 200 sin cambios: no hay historial, se ignora `reason` y `updatedAt` no cambia.
- El `code`, el responsable y las observaciones no cambian. No avisa al cliente ni a nadie.
- Con dos reprogramaciones simultáneas, ambas se aplican en orden y el historial queda encadenado (cada `previousReservationAt` es el `newReservationAt` anterior).

**Notas para el frontend**

- Úsala para «Reprogramar» con motivo. Muestra la acción solo en `CONFIRMED`, `UPCOMING` y `RESCHEDULED`.
- Si quieres detectar «sin cambios», compara `updatedAt` de la respuesta con el que tenías.
- Para volver a `CONFIRMED` después de reprogramar, usa `PATCH /reservations/:id/status`.
- La reserva puede salir del periodo visible: refresca el calendario. El panel de detalle de ft-crm la sigue mostrando porque la carga por id.

### Modelos

Recursos que devuelve el módulo. «Null» indica si el campo puede llegar en `null`; los campos siempre están presentes. Las fechas son instantes ISO 8601 en UTC.

#### `Customer`

Respuesta de `POST /customers`, `GET /customers`, `PATCH /customers/:id` y `PATCH /customers/:id/status`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Identificador del cliente. |
| `firstName` | string | Sí | Nombre (1–100). En Messenger, el nombre completo que da Meta; en WhatsApp, `null` hasta que alguien lo edite. |
| `lastName` | string | Sí | Apellido (1–100). Los webhooks no lo llenan. |
| `phone` | string | Sí | Teléfono tal como se escribió, con trim (hasta 80). WhatsApp: `+` y los dígitos (`"+51912345678"`). |
| `phoneCountry` | string | Sí | País ISO alfa-2 en mayúsculas enviado con el teléfono. `null` si no se indicó o se borró el teléfono. |
| `email` | string | Sí | Email en minúsculas (hasta 320). |
| `sourceChannel` | `ContactChannel` | No | Canal de origen. Los webhooks crean `WHATSAPP` o `FACEBOOK`. |
| `status` | `CustomerStatus` | No | Estado comercial. Nace en `NEW`. |
| `firstContactAt` | `IsoDateTime` | No | Primer contacto (alta). No cambia. |
| `lastContactAt` | `IsoDateTime` | No | Último mensaje entrante o interés registrado. Nunca retrocede. |
| `notes` | string | Sí | Notas internas (1–5000). |
| `createdAt` | `IsoDateTime` | No | Alta del registro. |
| `updatedAt` | `IsoDateTime` | No | Última modificación. |

La API no expone `normalizedPhone`, `normalizedEmail`, `providerAccountId` ni `externalContactId` (identidad de Messenger).

#### `CustomerDetail`

Respuesta de `GET /customers/:id`: `Customer` más `interests: CustomerInterest[]`, ordenado por `lastInterestedAt` descendente y luego por `id` ascendente.

#### `CustomerInterest`

Respuesta de `POST /customers/:id/interests` y elementos de `CustomerDetail.interests`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del interés. Ninguna ruta lo usa: el DELETE recibe el id del elemento. |
| `firstInterestedAt` | `IsoDateTime` | No | Primer registro. |
| `lastInterestedAt` | `IsoDateTime` | No | Último registro; cambia al repetir el POST. |
| `notes` | string | Sí | Nota del interés (1–5000). |
| `commercialItem` | `CommercialItemSummary` | No | Elemento comercial, con su estado actual. |

#### `CommercialItemSummary`

Resumen del catálogo dentro de intereses, solicitudes y reservas.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del elemento comercial. |
| `nameEs` | string | Sí | Nombre en español. Al menos uno de los dos nombres tiene valor. |
| `nameEn` | string | Sí | Nombre en inglés. |
| `type` | `CommercialItemType` | No | `DISH`, `BEVERAGE`, `SERVICE`, `PROMOTION` o `EVENT`. |
| `isActive` | boolean | No | Estado actual; un registro antiguo puede apuntar a un elemento inactivo. |
| `approvalStatus` | `CommercialApprovalStatus` | No | `DRAFT`, `APPROVED` o `REJECTED`. |

#### `CustomerSummary`

Cliente dentro de solicitudes, reservas y conversaciones. Refleja los datos actuales del cliente.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del cliente. |
| `firstName` | string | Sí | Nombre. |
| `lastName` | string | Sí | Apellido. |
| `phone` | string | Sí | Teléfono tal como se guardó. |
| `email` | string | Sí | Email en minúsculas. |

#### `ReservationRequest`

Respuesta de todas las rutas de `/reservation-requests`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id de la solicitud. |
| `code` | string | No | `RES-<año>-<secuencia>`. Único; lo genera el backend. |
| `customerId` | `Uuid` | No | Cliente. Editable. |
| `commercialItemId` | `Uuid` | Sí | Elemento comercial. |
| `sourceChannel` | `ContactChannel` | No | Canal por el que llegó la solicitud; no se hereda del cliente. |
| `reservationAt` | `IsoDateTime` | Sí | Fecha y hora pedidas. |
| `numberOfPeople` | number | Sí | Personas (≥ 1). |
| `quotedPrice` | `MoneyString` | Sí | Precio cotizado, con 2 decimales. Hay precio si y solo si hay `currency`. |
| `currency` | `CurrencyCode` | Sí | Moneda del precio. |
| `comments` | string | Sí | Comentarios (1–5000). |
| `specialRequirements` | string | Sí | Requerimientos especiales (1–5000). |
| `status` | `ReservationRequestStatus` | No | Estado (ver abajo). |
| `createdAt` | `IsoDateTime` | No | Alta; ordena el listado. |
| `updatedAt` | `IsoDateTime` | No | Última modificación. |
| `customer` | `CustomerSummary` | No | Resumen del cliente. |
| `commercialItem` | `CommercialItemSummary` | Sí | Resumen del elemento, o `null`. |

#### `Reservation`

Respuesta de `GET /reservations` y de las escrituras de reservas, salvo las observaciones.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `assignedUserId` | `Uuid` | Sí | Responsable. |
| `assignedUser` | `AssignedUser` | Sí | Datos del responsable, o `null`. |
| `id` | `Uuid` | No | Id de la reserva. |
| `code` | string | No | `R-<año>-<secuencia>`. Único; no cambia nunca. |
| `reservationRequestId` | `Uuid` | Sí | Solicitud de origen. Siempre `null` con las rutas actuales. |
| `customerId` | `Uuid` | No | Cliente. |
| `commercialItemId` | `Uuid` | Sí | Elemento comercial. |
| `reservationAt` | `IsoDateTime` | No | Fecha y hora de la reserva; ordena el calendario. |
| `numberOfPeople` | number | No | Personas (≥ 1). |
| `status` | `ReservationStatus` | No | Estado (ver abajo). |
| `notes` | string | Sí | Texto general editable (1–5000). Distinto de `noteHistory`. |
| `createdAt` | `IsoDateTime` | No | Alta. |
| `updatedAt` | `IsoDateTime` | No | Última modificación. Agregar una observación no lo cambia. |
| `customer` | `CustomerSummary` | No | Resumen del cliente. |
| `commercialItem` | `CommercialItemSummary` | Sí | Resumen del elemento, o `null`. |

#### `AssignedUser`

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del usuario. |
| `firstName` | string | No | Nombre. |
| `lastName` | string | No | Apellido. |
| `isActive` | boolean | No | Si el usuario está activo. |
| `isEligible` | boolean | No | Se calcula en cada lectura: activo y con ADMIN u OPERATOR. |

#### `ReservationDetail`

Respuesta de `GET /reservations/:id`: `Reservation` más `noteHistory: ReservationNote[]` y `rescheduleHistory: ReservationRescheduleEntry[]`, ambos por `createdAt` ascendente y luego por `id`, sin paginar.

#### `ReservationNote`

Respuesta de `POST /reservations/:id/notes` y elementos de `noteHistory`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id de la observación. |
| `reservationId` | `Uuid` | No | Reserva. |
| `authorUserId` | `Uuid` | No | Autor (el usuario del token). |
| `content` | string | No | Texto (1–5000, con trim). |
| `createdAt` | `IsoDateTime` | No | Hora de creación. |
| `author` | `PublicUser` | No | `{ id, firstName, lastName }` del autor. |

#### `ReservationRescheduleEntry`

Elementos de `rescheduleHistory`. No trae `reservationId`.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id de la entrada. |
| `previousReservationAt` | `IsoDateTime` | No | Fecha anterior. |
| `newReservationAt` | `IsoDateTime` | No | Fecha nueva (siempre distinta de la anterior). |
| `reason` | string | Sí | Motivo. `null` si la fecha se cambió con `PATCH /reservations/:id` o sin motivo. |
| `changedByUserId` | `Uuid` | No | Quién reprogramó (el usuario del token). |
| `createdAt` | `IsoDateTime` | No | Hora del cambio. |
| `changedBy` | `PublicUser` | No | `{ id, firstName, lastName }` de quien reprogramó. |

#### `Paginated<T>`

`{ data: T[], pagination: { page, limit, total, totalPages } }`. `page` y `limit` repiten los valores usados; `totalPages` es `Math.ceil(total / limit)` y vale 0 si no hay resultados. Ver [Paginación y orden](#paginación-y-orden).

### Estados y transiciones

#### Estado del cliente (`CustomerStatus`)

| Valor | Etiqueta en ft-crm | Cómo se llega |
|---|---|---|
| `NEW` | Nuevo | Al crear el cliente, a mano o con su primer mensaje de WhatsApp o Messenger. |
| `INTERESTED` | Interesado | Solo con `PATCH /customers/:id/status`. |
| `IN_CONVERSATION` | En conversación | Solo con `PATCH /customers/:id/status`. |
| `REQUESTED_RESERVATION` | Solicitó reserva | Solo con `PATCH /customers/:id/status`. |
| `CONFIRMED` | Confirmado | Solo con `PATCH /customers/:id/status`. |
| `REJECTED` | Rechazado | Solo con `PATCH /customers/:id/status`. |
| `LOST` | Perdido | Solo con `PATCH /customers/:id/status`. |
| `RECURRENT` | Recurrente | Solo con `PATCH /customers/:id/status`. |

- Transiciones: de cualquier estado a cualquier otro, incluido el mismo, con `PATCH /customers/:id/status` (ADMIN, OPERATOR). No hay transición prohibida ni error de transición.
- Automáticas: ninguna. Mensajes, intereses, solicitudes y reservas no cambian el estado. El código tiene pendiente integrar `REQUESTED_RESERVATION` y `CONFIRMED` con las reservas.
- Un valor fuera del enum responde 400 `status must be one of the following values: NEW, INTERESTED, IN_CONVERSATION, REQUESTED_RESERVATION, CONFIRMED, REJECTED, LOST, RECURRENT`.

#### Estado de la solicitud (`ReservationRequestStatus`)

| Valor | Etiqueta en ft-crm | Significado hoy |
|---|---|---|
| `INCOMPLETE_DATA` | Negociando | Automático: falta `reservationAt` o `numberOfPeople`. |
| `READY_TO_SEND` | Lista para enviar | Automático: hay `reservationAt` y `numberOfPeople`. |
| `SENT_TO_OWNER` | Enviada al dueño | Reservado para el flujo del dueño. Ninguna ruta lo asigna. |
| `WAITING_RESPONSE` | Esperando al dueño | Igual: ninguna ruta lo asigna. |
| `ACCEPTED` | Aceptada | Igual: ninguna ruta lo asigna. |
| `REJECTED` | Rechazada | Igual: ninguna ruta lo asigna. |
| `MODIFICATION_REQUESTED` | Cambios solicitados | Igual: ninguna ruta lo asigna. |
| `RENEGOTIATING` | Renegociando | Igual: ninguna ruta lo asigna. |
| `CANCELLED` | Cancelada | Manual y final. |

| Desde | Hacia | Cómo | Roles |
|---|---|---|---|
| (alta) | `INCOMPLETE_DATA` o `READY_TO_SEND` | `POST /reservation-requests`; lo calcula el backend | ADMIN, OPERATOR |
| `INCOMPLETE_DATA` | `READY_TO_SEND` | `PATCH /reservation-requests/:id` que deja fecha y personas | ADMIN, OPERATOR |
| `READY_TO_SEND` | `INCOMPLETE_DATA` | `PATCH /reservation-requests/:id` con `reservationAt: null` o `numberOfPeople: null` | ADMIN, OPERATOR |
| `INCOMPLETE_DATA`, `READY_TO_SEND` | `CANCELLED` | `PATCH /reservation-requests/:id/status` con `{ "status": "CANCELLED" }` | ADMIN, OPERATOR |
| `CANCELLED` | `CANCELLED` | La misma ruta: 200 sin cambios | ADMIN, OPERATOR |

Errores de una transición no permitida:
- Editar o cancelar fuera de `INCOMPLETE_DATA` y `READY_TO_SEND` (salvo cancelar una ya cancelada): 409 `La solicitud no admite modificaciones en su estado actual`.
- Pedir otro estado en `PATCH /reservation-requests/:id/status`: 400 `status must be one of the following values: CANCELLED`.

#### Estado de la reserva (`ReservationStatus`)

| Valor | Etiqueta en ft-crm | Significado |
|---|---|---|
| `CONFIRMED` | Confirmada | Estado inicial de toda reserva. |
| `UPCOMING` | Preparada | Manual (`PREPARED_STATUS` en ft-crm). |
| `IN_SERVICE` | En servicio | Manual; exige que haya llegado la hora. |
| `COMPLETED` | Completada | Final; solo desde `IN_SERVICE`. |
| `RESCHEDULED` | Reprogramada | Automático al cambiar `reservationAt`; no se puede pedir. |
| `CANCELLED` | Cancelada | Final. |
| `NO_SHOW` | No asistió | Final; exige que haya llegado la hora. |

Transiciones con `PATCH /reservations/:id/status` (ADMIN, OPERATOR):

| Desde | Hacia |
|---|---|
| `CONFIRMED` | `UPCOMING`, `IN_SERVICE`\*, `CANCELLED`, `NO_SHOW`\* |
| `UPCOMING` | `IN_SERVICE`\*, `CANCELLED`, `NO_SHOW`\* |
| `RESCHEDULED` | `CONFIRMED`, `UPCOMING`, `IN_SERVICE`\*, `CANCELLED`, `NO_SHOW`\* |
| `IN_SERVICE` | `COMPLETED` |
| `COMPLETED`, `CANCELLED`, `NO_SHOW` | Ninguno |

\* Solo si `reservationAt <= ahora`, según el reloj del servidor y sin tolerancia. Enviar el estado actual responde 200 sin cambios, también en los estados finales.

Transición automática: `CONFIRMED`, `UPCOMING` o `RESCHEDULED` → `RESCHEDULED`, cuando `PATCH /reservations/:id` o `PATCH /reservations/:id/reschedule` cambian `reservationAt` a otro instante (ADMIN, OPERATOR). Ningún proceso cambia estados por la hora: una reserva pasada sigue en `CONFIRMED` hasta que alguien la marque.

Para volver de `UPCOMING` a `CONFIRMED` no hay transición directa (409). Reprogramar la pasa a `RESCHEDULED`, y desde ahí sí puede volver a `CONFIRMED`.

Qué permite cada estado:

| Estado | Editar (`PATCH /:id`) | Reprogramar | Responsable | Observaciones |
|---|---|---|---|---|
| `CONFIRMED`, `UPCOMING`, `RESCHEDULED` | Sí | Sí | Sí | Sí |
| `IN_SERVICE` | No | No | Sí | Sí |
| `COMPLETED`, `CANCELLED`, `NO_SHOW` | No | No | No | Sí |

Errores de una transición u operación no permitida:
- 409 `Transición de reserva no permitida`: el destino no está en la tabla.
- 409 `Todavía no ha llegado la hora de la reserva`: `IN_SERVICE` o `NO_SHOW` antes de `reservationAt`.
- 400 `status must be one of the following values: CONFIRMED, UPCOMING, IN_SERVICE, COMPLETED, CANCELLED, NO_SHOW`: se pidió `RESCHEDULED` u otro valor.
- 409 `La reserva no admite edición o reprogramación en su estado actual`: editar o reprogramar fuera de `CONFIRMED`, `UPCOMING` y `RESCHEDULED`.
- 409 `No se modifica el responsable de una reserva finalizada`: cambiar el responsable en `COMPLETED`, `CANCELLED` o `NO_SHOW`.

### Preguntas abiertas

1. La respuesta de clientes no expone la identidad de proveedor (`providerAccountId`/`externalContactId`). Por eso el frontend no sabe de antemano si un cliente `FACEBOOK` viene de Messenger (canal bloqueado y contacto opcional): solo lo descubre al recibir el 400 `No se puede cambiar el canal de una identidad de Messenger`. ¿Se añadirá un indicador, por ejemplo `hasProviderIdentity`?
2. `PATCH /customers/:id/status` acepta cualquier transición, y el estado del cliente no se sincroniza con solicitudes, reservas ni conversaciones (hay un TODO en `customers.service.ts`). ¿Qué flujo debe imponer la UI? Por ejemplo, ¿pasar a `REQUESTED_RESERVATION` al crear una solicitud?
3. No hay ruta para enviar una solicitud al dueño, aceptarla o convertirla en reserva: `reservationRequestId` siempre es `null` y los estados `SENT_TO_OWNER`, `WAITING_RESPONSE`, `ACCEPTED`, `REJECTED`, `MODIFICATION_REQUESTED` y `RENEGOTIATING` no se alcanzan. Samanta tampoco crea solicitudes. ¿Deben aparecer ya en los filtros y KPI de la UI? ¿Cuándo llega el flujo de aprobación?
4. `GET /reservations` devuelve como máximo 100 reservas por página y no tiene filtro de reservas sin responsable. ¿El calendario necesita un modo sin paginación o un filtro tipo `unassigned`?
5. Los mensajes de validación (400) llegan en inglés y como arreglo, y los de negocio en español como texto. ¿El frontend debe traducir los de validación, o el backend los personalizará?
6. No existe fusión de clientes: si un cliente (también uno de Messenger) recibe un teléfono o email que ya es de otro, la respuesta es 409 `Ya existe un cliente con ese teléfono o correo`. ¿Se planea un flujo de fusión o de vinculación de identidades?
7. Cambiar el teléfono de un cliente con conversación de WhatsApp cambia el destinatario de las respuestas; y si el número anterior vuelve a escribir, el backend crea otro cliente. ¿Es el comportamiento deseado, o `PATCH /customers/:id` debería impedirlo o advertirlo?
8. Ningún POST del módulo admite `Idempotency-Key`: un reintento tras un 504 del BFF duplica solicitudes, reservas y observaciones. ¿Se añadirá idempotencia a esas rutas?
9. Las búsquedas no admiten el nombre completo («Carlos Quispe»), las de solicitudes y reservas no buscan por email, y cualquier dígito del texto se busca en los teléfonos. ¿Se mejorará la búsqueda?
10. `GET /customers` no trae el número de reservas ni el último interés, y ft-crm hace dos llamadas por fila para mostrarlos. ¿Se añadirán esos campos al listado?
11. `PATCH /customers/:id/status` responde 404 `Cliente o interés no encontrado` y el resto de rutas de clientes `Cliente no encontrado`. ¿Se unificará el texto?
12. `GET /reservation-requests` solo filtra por `reservationAt`: no hay filtro por fecha de alta (`createdAt`). Estadísticas cuenta hoy las solicitudes por fecha de reserva y omite las que no tienen fecha. ¿Es el criterio deseado, o hace falta un filtro por `createdAt`?

### Tipos TypeScript

Bloque autocontenido: compila con `tsc --noEmit --strict --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler`.
- Los tipos compartidos (`Uuid`, `IsoDateTime`, `Paginated<T>`…) repiten la definición de `ft-crm/src/lib/api/types.ts`. `ApiErrorBody` usa la forma ampliada de [05](#22-typests): `code?: BffErrorCode` y los campos del 500 (`path`, `method`, `timestamp`). En el frontend, decláralos una sola vez.
- Los tipos que ft-crm ya tiene (`Customer`, `ReservationRequest`, `Reservation`, `ReservationDetail`…) coinciden con el backend.
- Los nuevos siguen el estilo de cada familia: `…Request` en clientes (como `UpdateCustomerStatusRequest`) y `…Body` en solicitudes y reservas (como `CancelReservationRequestBody`).

```ts
/**
 * bk-crm · Clientes, solicitudes de reserva y reservas (calendario). Estado: 3/11/2026.
 * Forma real de las respuestas: select de Prisma y mapeos de los servicios.
 * Los tipos compartidos repiten la definición de ft-crm/src/lib/api/types.ts.
 */

/* ================================ Comunes ================================ */

export type Uuid = string;

/**
 * Instante ISO 8601.
 * - Respuestas: UTC con milisegundos ("2026-11-08T01:00:00.000Z").
 * - Envío (body y query): con segundos y zona explícita (Z o ±HH:mm), hasta 3 decimales.
 *   toISOString() sirve. Sin zona, sin segundos o solo con la fecha → 400.
 */
export type IsoDateTime = string;

/** Importe en texto: de "0" a "99999999.99", hasta 2 decimales. La API lo devuelve con 2 ("150.00"). */
export type MoneyString = string;

export type RoleCode = "ADMIN" | "OWNER" | "OPERATOR" | "SUPPORT";

export const CONTACT_CHANNELS = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export type CurrencyCode = "PEN" | "USD";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  /** 0 cuando total = 0 */
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

/** Límite máximo de `limit` en todos los listados paginados. */
export const MAX_PAGE_SIZE = 100;

/** `code` que añade el BFF de este frontend; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/** Cuerpo de error NestJS: `message` es string (negocio) o string[] (validación). */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** "Bad Request"… No llega en los errores del BFF ni en el 500. */
  error?: string;
  /** Solo lo agrega el BFF de este frontend. */
  code?: BffErrorCode;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  path?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  method?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  timestamp?: IsoDateTime;
}

/** Error 500 del filtro global de bk-crm: no expone detalles internos. */
export interface InternalErrorResponse {
  statusCode: 500;
  message: "Ocurrió un error interno";
  path: string;
  method: string;
  timestamp: IsoDateTime;
}

export const COMMERCIAL_ITEM_TYPES = ["DISH", "BEVERAGE", "SERVICE", "PROMOTION", "EVENT"] as const;
export type CommercialItemType = (typeof COMMERCIAL_ITEM_TYPES)[number];
export type CommercialApprovalStatus = "DRAFT" | "APPROVED" | "REJECTED";

/** Embebido compacto en solicitudes, reservas e intereses (sin precio). Es el estado actual del catálogo. */
export interface CommercialItemSummary {
  id: Uuid;
  /** Al menos uno de los dos nombres tiene valor. */
  nameEs: string | null;
  nameEn: string | null;
  type: CommercialItemType;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
}

/* ================================ Clientes ================================ */

export const CUSTOMER_STATUSES = [
  "NEW",
  "INTERESTED",
  "IN_CONVERSATION",
  "REQUESTED_RESERVATION",
  "CONFIRMED",
  "REJECTED",
  "LOST",
  "RECURRENT",
] as const;
/** Estado comercial. El backend no valida transiciones ni lo cambia solo. */
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface Customer {
  id: Uuid;
  /** Messenger: nombre completo que da Meta (o null). WhatsApp: null hasta que alguien lo edite. */
  firstName: string | null;
  lastName: string | null;
  /** Tal como se escribió (con trim). WhatsApp: "+51912345678". La forma E.164 no se expone. */
  phone: string | null;
  /** ISO 3166-1 alfa-2 en mayúsculas ("PE"); null si no se indicó o se borró el teléfono. */
  phoneCountry: string | null;
  /** En minúsculas. */
  email: string | null;
  /** Canal de origen. Los webhooks crean WHATSAPP o FACEBOOK. */
  sourceChannel: ContactChannel;
  /** Nace en NEW; solo cambia con PATCH /customers/:id/status. */
  status: CustomerStatus;
  firstContactAt: IsoDateTime;
  /** Mensajes entrantes e intereses registrados. Nunca retrocede. */
  lastContactAt: IsoDateTime;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CustomerInterest {
  id: Uuid;
  firstInterestedAt: IsoDateTime;
  /** Se mueve a la hora actual cada vez que se repite el POST. */
  lastInterestedAt: IsoDateTime;
  notes: string | null;
  commercialItem: CommercialItemSummary;
}

export interface CustomerDetail extends Customer {
  /** Ordenados por lastInterestedAt descendente y luego por id ascendente. */
  interests: CustomerInterest[];
}

/** Cliente embebido en solicitudes, reservas y conversaciones. */
export interface CustomerSummary {
  id: Uuid;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

/** Query de GET /customers. No envíes textos vacíos ni parámetros extra (400). */
export interface CustomerListQuery {
  /** 1–1 000 000; por defecto 1. */
  page?: number;
  /** 1–100; por defecto 20. */
  limit?: number;
  /** 1–200 tras el trim. Busca en nombre, apellido, teléfono o correo por separado (no el nombre completo). */
  search?: string;
  status?: CustomerStatus;
  /** Filtra sourceChannel (el parámetro se llama `channel`). */
  channel?: ContactChannel;
  /** Clientes con un interés en ese elemento. */
  commercialItemId?: Uuid;
}

/** Body de POST /customers. Exige un email o un teléfono normalizable. */
export interface CreateCustomerRequest {
  sourceChannel: ContactChannel;
  /** 1–100 tras el trim. */
  firstName?: string | null;
  /** 1–100 tras el trim. */
  lastName?: string | null;
  /** Internacional con "+", o nacional con phoneCountry; sin país no se normaliza y solo se acepta si hay email. 6–15 dígitos; máx. 80 caracteres. */
  phone?: string | null;
  /** ISO alfa-2 ("PE"); exige phone. */
  phoneCountry?: string | null;
  /** Máx. 320; se guarda en minúsculas. */
  email?: string | null;
  /** 1–5000 tras el trim. */
  notes?: string | null;
}

/** Body de PATCH /customers/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateCustomerRequest {
  /** No admite null. En una identidad de Messenger solo se acepta "FACEBOOK". */
  sourceChannel?: ContactChannel;
  firstName?: string | null;
  lastName?: string | null;
  /** Con un número nacional, reenvía también phoneCountry (no se hereda). null borra también el país. */
  phone?: string | null;
  phoneCountry?: string | null;
  email?: string | null;
  notes?: string | null;
}

/** Body de PATCH /customers/:id/status. Cualquier estado, sin reglas de transición. */
export interface UpdateCustomerStatusRequest {
  status: CustomerStatus;
}

/** Body de POST /customers/:id/interests (crea o actualiza el interés). */
export interface CreateCustomerInterestRequest {
  /** Puede estar inactivo o sin aprobar. */
  commercialItemId: Uuid;
  /** 1–5000 tras el trim. Si el interés ya existe: omitir conserva la nota; null la borra. */
  notes?: string | null;
}

/* ========================= Solicitudes de reserva ========================= */

export const RESERVATION_REQUEST_STATUSES = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
  "SENT_TO_OWNER",
  "WAITING_RESPONSE",
  "ACCEPTED",
  "REJECTED",
  "MODIFICATION_REQUESTED",
  "RENEGOTIATING",
  "CANCELLED",
] as const;
/** Hoy solo se alcanzan INCOMPLETE_DATA y READY_TO_SEND (calculados) y CANCELLED (manual). */
export type ReservationRequestStatus = (typeof RESERVATION_REQUEST_STATUSES)[number];

/** Estados en los que la solicitud admite edición y cancelación. */
export const RESERVATION_REQUEST_EDITABLE_STATUSES: readonly ReservationRequestStatus[] = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
];

export interface ReservationRequest {
  id: Uuid;
  /** "RES-<año>-<secuencia>", p. ej. "RES-2026-000042". */
  code: string;
  customerId: Uuid;
  commercialItemId: Uuid | null;
  sourceChannel: ContactChannel;
  /** null mientras falta la fecha. */
  reservationAt: IsoDateTime | null;
  numberOfPeople: number | null;
  /** Presente si y solo si currency también lo está. */
  quotedPrice: MoneyString | null;
  currency: CurrencyCode | null;
  comments: string | null;
  specialRequirements: string | null;
  /** Lo calcula el backend: READY_TO_SEND si hay reservationAt y numberOfPeople. */
  status: ReservationRequestStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: CustomerSummary;
  commercialItem: CommercialItemSummary | null;
}

/** Query de GET /reservation-requests. Rango: dateFrom <= reservationAt < dateTo. */
export interface ReservationRequestListQuery {
  page?: number;
  limit?: number;
  customerId?: Uuid;
  /** Filtra reservationAt >= dateFrom. */
  dateFrom?: IsoDateTime;
  /** Filtra reservationAt < dateTo. */
  dateTo?: IsoDateTime;
  /** Un solo estado. */
  status?: ReservationRequestStatus;
  /** Filtra el sourceChannel de la solicitud. */
  channel?: ContactChannel;
  commercialItemId?: Uuid;
  /** Busca en el código y en el nombre, apellido o teléfono del cliente (no en el email). */
  search?: string;
}

/** Body de POST /reservation-requests. */
export interface CreateReservationRequestBody {
  customerId: Uuid;
  sourceChannel: ContactChannel;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  /** Estrictamente futura. */
  reservationAt?: IsoDateTime | null;
  /** Entero >= 1 (número JSON, no texto). */
  numberOfPeople?: number | null;
  quotedPrice?: MoneyString | null;
  /** Solo junto con quotedPrice; si hay precio y se omite, se usa la moneda del restaurante. */
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Body de PATCH /reservation-requests/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateReservationRequestBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null. */
  sourceChannel?: ContactChannel;
  commercialItemId?: Uuid | null;
  /** Si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime | null;
  numberOfPeople?: number | null;
  /** null borra el precio y, si no se envía currency, también la moneda. */
  quotedPrice?: MoneyString | null;
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Body de PATCH /reservation-requests/:id/status (solo permite cancelar). */
export interface CancelReservationRequestBody {
  status: "CANCELLED";
}

/* ========================== Reservas (calendario) ========================== */

export const RESERVATION_STATUSES = [
  "CONFIRMED",
  "UPCOMING",
  "IN_SERVICE",
  "COMPLETED",
  "RESCHEDULED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
/** Valores que acepta PATCH /reservations/:id/status (RESCHEDULED lo pone el backend). */
export type ReservationStatusTarget = Exclude<ReservationStatus, "RESCHEDULED">;

/** Transiciones permitidas por PATCH /reservations/:id/status (reservation-rules.ts). */
export const RESERVATION_STATUS_TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatusTarget[]>> = {
  CONFIRMED: ["UPCOMING", "IN_SERVICE", "CANCELLED", "NO_SHOW"],
  UPCOMING: ["IN_SERVICE", "CANCELLED", "NO_SHOW"],
  RESCHEDULED: ["CONFIRMED", "UPCOMING", "IN_SERVICE", "CANCELLED", "NO_SHOW"],
  IN_SERVICE: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Destinos que además exigen reservationAt <= ahora (reloj del servidor); si no, 409. */
export const RESERVATION_STATUSES_REQUIRING_ARRIVAL: readonly ReservationStatusTarget[] = ["IN_SERVICE", "NO_SHOW"];

/** Estados que admiten PATCH /reservations/:id y PATCH /reservations/:id/reschedule. */
export const RESERVATION_EDITABLE_STATUSES: readonly ReservationStatus[] = ["CONFIRMED", "UPCOMING", "RESCHEDULED"];

/** Estados que admiten PATCH /reservations/:id/assignee. */
export const RESERVATION_ASSIGNABLE_STATUSES: readonly ReservationStatus[] = [
  "CONFIRMED",
  "UPCOMING",
  "RESCHEDULED",
  "IN_SERVICE",
];

/** Estados finales: no admiten cambio de estado, edición, reprogramación ni responsable. Sí observaciones. */
export const RESERVATION_FINAL_STATUSES: readonly ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

/** true si PATCH /reservations/:id/status aceptaría `target` ahora (el mismo estado siempre responde 200). */
export function canSetReservationStatus(
  reservation: Pick<Reservation, "status" | "reservationAt">,
  target: ReservationStatusTarget,
  now: Date = new Date(),
): boolean {
  if (reservation.status === target) return true;
  if (!RESERVATION_STATUS_TRANSITIONS[reservation.status].includes(target)) return false;
  return !RESERVATION_STATUSES_REQUIRING_ARRIVAL.includes(target) || Date.parse(reservation.reservationAt) <= now.getTime();
}

/** Responsable de la reserva. */
export interface AssignedUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  isActive: boolean;
  /** Se calcula en cada lectura: activo y con ADMIN u OPERATOR. */
  isEligible: boolean;
}

export interface Reservation {
  assignedUserId: Uuid | null;
  assignedUser: AssignedUser | null;
  id: Uuid;
  /** "R-<año>-<secuencia>", p. ej. "R-2026-000015". No cambia al reprogramar. */
  code: string;
  /** Siempre null con las rutas actuales. */
  reservationRequestId: Uuid | null;
  customerId: Uuid;
  commercialItemId: Uuid | null;
  reservationAt: IsoDateTime;
  numberOfPeople: number;
  status: ReservationStatus;
  /** Texto general editable (distinto de noteHistory). */
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: CustomerSummary;
  commercialItem: CommercialItemSummary | null;
}

export interface PublicUser {
  id: Uuid;
  firstName: string;
  lastName: string;
}

/** Observación con autor (respuesta de POST /reservations/:id/notes). */
export interface ReservationNote {
  id: Uuid;
  reservationId: Uuid;
  authorUserId: Uuid;
  content: string;
  createdAt: IsoDateTime;
  author: PublicUser;
}

/** Entrada del historial de reprogramaciones. */
export interface ReservationRescheduleEntry {
  id: Uuid;
  previousReservationAt: IsoDateTime;
  newReservationAt: IsoDateTime;
  /** null si la fecha se cambió con PATCH /reservations/:id o se reprogramó sin motivo. */
  reason: string | null;
  changedByUserId: Uuid;
  createdAt: IsoDateTime;
  changedBy: PublicUser;
}

/** GET /reservations/:id. Historiales por createdAt ascendente, sin paginar. */
export interface ReservationDetail extends Reservation {
  noteHistory: ReservationNote[];
  rescheduleHistory: ReservationRescheduleEntry[];
}

/** Query de GET /reservations. Rango: dateFrom <= reservationAt < dateTo. */
export interface ReservationListQuery {
  page?: number;
  limit?: number;
  customerId?: Uuid;
  /** Incluido: reservationAt >= dateFrom. */
  dateFrom?: IsoDateTime;
  /** Excluido: reservationAt < dateTo. */
  dateTo?: IsoDateTime;
  commercialItemId?: Uuid;
  assignedUserId?: Uuid;
  /** Busca en el código y en el nombre, apellido o teléfono del cliente (no en el email). */
  search?: string;
  /** Viaja como "true"/"false"; true no se combina con status "CANCELLED". */
  excludeCancelled?: boolean;
  /** Un solo estado, incluido RESCHEDULED. */
  status?: ReservationStatus;
}

/** Body de PATCH /reservations/:id/status. */
export interface UpdateReservationStatusBody {
  status: ReservationStatusTarget;
}

/** Body de POST /reservations (solo ADMIN). Siempre crea la reserva en CONFIRMED. */
export interface CreateReservationBody {
  customerId: Uuid;
  /** Estrictamente futura. */
  reservationAt: IsoDateTime;
  /** Entero >= 1. */
  numberOfPeople: number;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id. Cambiar reservationAt deja la reserva en RESCHEDULED y agrega historial. */
export interface UpdateReservationBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null; si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime;
  /** No admite null. */
  numberOfPeople?: number;
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id/assignee. null libera; la clave es obligatoria. */
export interface AssignReservationBody {
  assignedUserId: Uuid | null;
}

/** Body de POST /reservations/:id/notes. */
export interface CreateReservationNoteBody {
  /** 1–5000 tras el trim. */
  content: string;
}

/** Body de PATCH /reservations/:id/reschedule. */
export interface RescheduleReservationBody {
  /** Estrictamente futura. Si es el mismo instante, no hay cambios. */
  reservationAt: IsoDateTime;
  /** 1–5000 tras el trim. */
  reason?: string | null;
}

/* ============================== Mapa de rutas ============================== */

/** Código de éxito, parámetros, query, body y respuesta de cada ruta del módulo. */
export interface ClientesReservasRoutes {
  "POST /customers": { status: 201; body: CreateCustomerRequest; response: Customer };
  "GET /customers": { status: 200; query: CustomerListQuery; response: Paginated<Customer> };
  "GET /customers/:id": { status: 200; params: { id: Uuid }; response: CustomerDetail };
  "PATCH /customers/:id": { status: 200; params: { id: Uuid }; body: UpdateCustomerRequest; response: Customer };
  "PATCH /customers/:id/status": {
    status: 200;
    params: { id: Uuid };
    body: UpdateCustomerStatusRequest;
    response: Customer;
  };
  "POST /customers/:id/interests": {
    status: 200;
    params: { id: Uuid };
    body: CreateCustomerInterestRequest;
    response: CustomerInterest;
  };
  "DELETE /customers/:id/interests/:commercialItemId": {
    status: 204;
    params: { id: Uuid; commercialItemId: Uuid };
    response: void;
  };
  "POST /reservation-requests": { status: 201; body: CreateReservationRequestBody; response: ReservationRequest };
  "GET /reservation-requests": {
    status: 200;
    query: ReservationRequestListQuery;
    response: Paginated<ReservationRequest>;
  };
  "GET /reservation-requests/:id": { status: 200; params: { id: Uuid }; response: ReservationRequest };
  "PATCH /reservation-requests/:id": {
    status: 200;
    params: { id: Uuid };
    body: UpdateReservationRequestBody;
    response: ReservationRequest;
  };
  "PATCH /reservation-requests/:id/status": {
    status: 200;
    params: { id: Uuid };
    body: CancelReservationRequestBody;
    response: ReservationRequest;
  };
  "POST /reservations": { status: 201; body: CreateReservationBody; response: Reservation };
  "GET /reservations": { status: 200; query: ReservationListQuery; response: Paginated<Reservation> };
  "GET /reservations/:id": { status: 200; params: { id: Uuid }; response: ReservationDetail };
  "PATCH /reservations/:id": { status: 200; params: { id: Uuid }; body: UpdateReservationBody; response: Reservation };
  "PATCH /reservations/:id/status": {
    status: 200;
    params: { id: Uuid };
    body: UpdateReservationStatusBody;
    response: Reservation;
  };
  "PATCH /reservations/:id/assignee": {
    status: 200;
    params: { id: Uuid };
    body: AssignReservationBody;
    response: Reservation;
  };
  "POST /reservations/:id/notes": {
    status: 201;
    params: { id: Uuid };
    body: CreateReservationNoteBody;
    response: ReservationNote;
  };
  "PATCH /reservations/:id/reschedule": {
    status: 200;
    params: { id: Uuid };
    body: RescheduleReservationBody;
    response: Reservation;
  };
}
```

## Parte 04: Bandeja: conversaciones, mensajes (WhatsApp y Messenger) y borradores de Samanta

> Parte de la [referencia de la API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend). Estado: 3 de noviembre de 2026.
>
> Desde el navegador, cada ruta se pide como `/api/backend<ruta>` y el BFF añade el token. Las convenciones comunes (errores, sesión, roles, paginación, fechas e idempotencia) están en el [README](#convenciones-generales); lo propio de este módulo, en [Convenciones de este módulo](#convenciones-de-este-módulo).

Bandeja omnicanal del CRM. Cubre las conversaciones de WhatsApp y Messenger (canal `FACEBOOK`), el historial, las respuestas de texto, la lectura compartida por el equipo, la asignación de responsable, la pausa del asistente y los borradores de Samanta (IA), que una persona revisa antes de enviar. La usan la Bandeja (lista, filtros y contador de no leídos), la vista de conversación y el panel de Samanta. No hay WebSockets ni SSE: todo se actualiza por polling. Todas las rutas exigen sesión, salvo los webhooks de Meta, que el frontend no usa.

### Índice

- [Convenciones de este módulo](#convenciones-de-este-módulo)
- [Listar conversaciones (bandeja)](#listar-conversaciones-bandeja) — `GET /conversations`
- [Ver detalle de una conversación](#ver-detalle-de-una-conversación) — `GET /conversations/:id`
- [Ver historial de mensajes](#ver-historial-de-mensajes) — `GET /conversations/:id/messages`
- [Enviar un mensaje de texto](#enviar-un-mensaje-de-texto) — `POST /conversations/:id/messages`
- [Marcar como leído hasta un mensaje](#marcar-como-leído-hasta-un-mensaje) — `PATCH /conversations/:id/read`
- [Pausar o reanudar a Samanta en la conversación](#pausar-o-reanudar-a-samanta-en-la-conversación) — `PATCH /conversations/:id/assistant`
- [Asignar, tomar o liberar una conversación](#asignar-tomar-o-liberar-una-conversación) — `PATCH /conversations/:id/assignee`
- [Generar un borrador con Samanta](#generar-un-borrador-con-samanta) — `POST /conversations/:id/assistant-drafts`
- [Listar borradores de Samanta](#listar-borradores-de-samanta) — `GET /conversations/:id/assistant-drafts`
- [Ver un borrador de Samanta](#ver-un-borrador-de-samanta) — `GET /conversations/:id/assistant-drafts/:draftId`
- [Editar un borrador](#editar-un-borrador) — `PATCH /conversations/:id/assistant-drafts/:draftId`
- [Aprobar un borrador y encolar el envío](#aprobar-un-borrador-y-encolar-el-envío) — `POST /conversations/:id/assistant-drafts/:draftId/approve`
- [Rechazar un borrador](#rechazar-un-borrador) — `POST /conversations/:id/assistant-drafts/:draftId/reject`
- [Webhooks de Meta (no usar desde el frontend)](#webhooks-de-meta-no-usar-desde-el-frontend) — `GET /webhooks/whatsapp` · `POST /webhooks/whatsapp` · `GET /webhooks/messenger` · `POST /webhooks/messenger`
- [Modelos](#modelos-3)
- [Estados y transiciones](#estados-y-transiciones-3)
- [Preguntas abiertas](#preguntas-abiertas-4)
- [Tipos TypeScript](#tipos-typescript-3)

### Convenciones de este módulo

#### Errores comunes a todas las rutas

- **Orden.** Las tablas de errores siguen el orden en que se comprueba cada condición. Ante varios problemas, recibes el primero:
  1. las cookies de sesión, en el BFF (401 `NO_SESSION`);
  2. el parser de Express en bk-crm, en este orden: charset que no empieza por `utf-` (415), body de más de 100 kb (413) o JSON mal formado (400);
  3. el token (si bk-crm lo rechaza, el BFF renueva la sesión o responde 401 `SESSION_EXPIRED`);
  4. el rol (403);
  5. la validación del `:id`, de la query y del body (400); entre estas tres no hay un orden garantizado;
  6. las reglas del servicio, en el orden de cada tabla.

  Para no repetir, las tablas ponen el 401 primero y el 413 y el 415 al final.
- **401.** El navegador nunca recibe el 401 de bk-crm. El BFF renueva la sesión y repite la llamada una vez, también los POST (con la misma `Idempotency-Key`). Si no puede, responde 401 `Tu sesión terminó. Vuelve a iniciar sesión.` con `code: "SESSION_EXPIRED"`, o 401 `Inicia sesión para continuar.` con `code: "NO_SESSION"` si no hay cookies ([Sesión](#sesión-srclibserversessionts)).
- **503 de bk-crm o del BFF.** bk-crm responde 503 sin `code` cuando un canal o Samanta están apagados en el servidor: `WhatsApp no está habilitado`, `Messenger no está habilitado` o `Samanta está desactivada`. El BFF responde 503 o 504 con `code: "BACKEND_UNAVAILABLE"` cuando no llega a bk-crm ([Errores que añade el BFF](#errores-que-añade-el-bff)). `ApiError.isUnavailable` es `true` en los dos casos: distingue por `error.code` para no mostrar «sin conexión» ante un canal apagado.
- **409 `Conflicto de mensajería; vuelve a intentarlo`.** Lo pueden devolver todas las rutas que escriben o bloquean la conversación, es decir, todas salvo `GET /conversations`, `GET /conversations/:id`, `GET /conversations/:id/messages` y los `GET` de verificación de los webhooks. Ocurre cuando la transacción choca con otra en sus 5 intentos internos (el primero y 4 reintentos). Repite la misma llamada; en los POST idempotentes, con la misma clave.
- **UUID.** El `:id` y el `:draftId` aceptan cualquier UUID con formato 8-4-4-4-12 (`ParseUUIDPipe`). Los UUID del body y de la query (`customerId`, `assignedUserId`, `throughMessageId`, `sourceMessageId`) usan `@IsUUID()`, que exige además versión 1 a 8 y variante RFC (o el UUID nulo o máximo). Los ids que genera bk-crm son v4 y cumplen siempre; un id inventado a mano como `6f1c2a4e-8b7d-0c1e-0a3f-2d5e7b9c0a14` responde 400 `<campo> must be a UUID`.
- **Otros.** `Recurso de mensajería no encontrado` (404) y `Datos de mensajería inválidos` (400) son traducciones genéricas de errores de la base de datos que en uso normal no aparecen. Un error no controlado responde 500 `Ocurrió un error interno` ([Formato de errores](#formato-de-errores)).

#### Actualización por polling

- Con `MESSAGING_ENABLED=true`, bk-crm entrega la cola de mensajes a sus workers y aplica los recibos de Meta cada 2 s. Con `MESSAGING_ENABLED=false` (habitual en desarrollo) no hay workers: los mensajes que ya existen, como los del script de demostración, se quedan en `RECEIVED` o `QUEUED`. Además, habilitar WhatsApp o Messenger exige `MESSAGING_ENABLED=true` (si no, bk-crm no arranca), así que en ese modo los canales están apagados y enviar responde 503.
- Intervalos actuales de ft-crm: lista y detalle cada 6 s (`INBOX_POLL_MS`), chat cada 4 s (`CHAT_POLL_MS`) y cada 1,5 s mientras haya salientes en `QUEUED` o `SENDING`.
- Las fechas son ISO 8601 en UTC. Desde el 3/11/2026 bk-crm también las guarda en UTC (`src/database/pg-adapter.ts`); el formato de la API no cambia.

#### Funciones y claves de caché nuevas en ft-crm

Las rutas de conversaciones ya tienen su función en `conversationsApi`. Para los borradores de Samanta, agrega a `src/lib/api/endpoints.ts` (tipos en [Tipos TypeScript](#tipos-typescript-3)):

```ts
export const assistantDraftsApi = {
  /** Espera a la IA (hasta 60 s). Reutiliza la misma clave solo para reintentar esta generación. */
  generate: (conversationId: string, sourceMessageId: string, idempotencyKey: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts`, {
      method: "POST",
      body: { sourceMessageId } satisfies GenerateSamantaDraftRequest,
      headers: { "idempotency-key": idempotencyKey },
    }),
  list: (conversationId: string) =>
    apiFetch<SamantaDraftListResponse>(`/conversations/${conversationId}/assistant-drafts`),
  get: (conversationId: string, draftId: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`),
  edit: (conversationId: string, draftId: string, body: EditSamantaDraftRequest) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`, { method: "PATCH", body }),
  approve: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/approve`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
  reject: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/reject`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
};
```

Y a `qk` en `src/lib/api/query-keys.ts`:

```ts
  assistantDrafts: (conversationId: string) => ["conversations", "assistant-drafts", conversationId] as const,
  assistantDraft: (conversationId: string, draftId: string) =>
    ["conversations", "assistant-drafts", conversationId, draftId] as const,
```

- Las dos claves cuelgan de `["conversations"]`, así que `qk.conversationsAll` también las invalida.
- `qk.assistantDrafts(id)` es prefijo de `qk.assistantDraft(id, draftId)`: invalidar la lista invalida también cada borrador.
- A diferencia de `send`, `generate` no tiene clave por defecto: así nadie genera una clave nueva sin querer al reintentar.

### Listar conversaciones (bandeja)
`GET /conversations`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<Conversation>` |
| ft-crm | `conversationsApi.list(query: ListConversationsQuery): Promise<Paginated<Conversation>>` (existe) |
| Caché | `qk.conversations(query)`. El contador de la Bandeja usa `qk.conversations({ unreadOnly: true, limit: 100 })`. |

**Query**

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | number | No | `1` | Entero de 1 a 1 000 000. |
| `limit` | number | No | `50` | Entero de 1 a 100. |
| `channel` | `ContactChannel` | No | — | Un solo valor, en mayúsculas: `WHATSAPP`, `FACEBOOK` (Messenger), `INSTAGRAM`, `WEBSITE`, `PHONE`, `EMAIL` u `OTHER`. |
| `customerId` | `Uuid` | No | — | UUID del cliente. Si no existe, la lista sale vacía (no hay 404). |
| `assignedUserId` | `Uuid` | No | — | UUID del responsable. No hay forma de pedir las conversaciones sin asignar. |
| `unreadOnly` | boolean | No | — | Solo los textos `true` o `false`. `true`: conversaciones con al menos un `INBOUND` sin `readAt`. `false` no filtra: no significa «solo leídas». |
| `isAssistantPaused` | boolean | No | — | Solo los textos `true` o `false`. Filtra por ese valor. |
| `search` | string | No | — | Se le aplica `trim`; después no puede quedar vacío y admite hasta 200 caracteres. Ver la nota sobre la búsqueda. |

Ningún parámetro admite el valor vacío (`channel=`) ni repetirse (`channel=WHATSAPP&channel=FACEBOOK`): los dos casos responden 400. Cualquier otro parámetro (p. ej. `_t`, `status` o `sort`) responde 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
// Bandeja completa, 20 por página
const page = await conversationsApi.list({ limit: 20 });
// GET /api/backend/conversations?limit=20

// Messenger con mensajes sin leer, buscando por nombre
await conversationsApi.list({ channel: "FACEBOOK", unreadOnly: true, search: "Mamani", limit: 20 });
// GET /api/backend/conversations?channel=FACEBOOK&unreadOnly=true&search=Mamani&limit=20

// Cuántas conversaciones tienen algo sin leer
const { pagination } = await conversationsApi.list({ unreadOnly: true, limit: 1 });
// GET /api/backend/conversations?unreadOnly=true&limit=1 → pagination.total
```

**Respuesta** (ejemplo con `?limit=20`)

```json
{
  "data": [
    {
      "id": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "customerId": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
      "channel": "WHATSAPP",
      "isAssistantPaused": false,
      "assignedUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "lastMessageAt": "2026-11-03T02:32:11.984Z",
      "createdAt": "2026-10-28T19:14:05.320Z",
      "updatedAt": "2026-11-03T02:32:11.986Z",
      "customer": {
        "id": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
        "firstName": "Lucía",
        "lastName": "Quispe",
        "phone": "+51987654321",
        "email": null
      },
      "assignedUser": {
        "id": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
        "firstName": "Carlos",
        "lastName": "Huamán",
        "isActive": true,
        "isEligible": true
      },
      "unreadCount": 1
    },
    {
      "id": "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f",
      "customerId": "3a5c7e9b-1d3f-4b6a-8c0e-2d4f6a8c0e2b",
      "channel": "FACEBOOK",
      "isAssistantPaused": false,
      "assignedUserId": null,
      "lastMessageAt": "2026-11-03T01:58:44.207Z",
      "createdAt": "2026-11-03T01:57:02.118Z",
      "updatedAt": "2026-11-03T01:58:44.209Z",
      "customer": {
        "id": "3a5c7e9b-1d3f-4b6a-8c0e-2d4f6a8c0e2b",
        "firstName": "Rosa Mamani",
        "lastName": null,
        "phone": null,
        "email": null
      },
      "assignedUser": null,
      "unreadCount": 3
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR (p. ej. solo SUPPORT). |
| 400 | `property <campo> should not exist` | Parámetro no declarado. Va primero en el array. |
| 400 | `page must not be greater than 1000000` · `page must not be less than 1` · `page must be an integer number` | `page` fuera de rango, decimal o no numérico. `page=abc` devuelve los tres; `page=` (vacío), solo el segundo. |
| 400 | `limit must not be greater than 100` · `limit must not be less than 1` · `limit must be an integer number` | Lo mismo con `limit`. |
| 400 | `channel must be one of the following values: WHATSAPP, FACEBOOK, INSTAGRAM, WEBSITE, PHONE, EMAIL, OTHER` | Vacío, en minúsculas, desconocido o repetido. |
| 400 | `customerId must be a UUID` | Vacío o no es un UUID. |
| 400 | `assignedUserId must be a UUID` | Vacío o no es un UUID. |
| 400 | `unreadOnly must be a boolean value` | Distinto de `true` y `false` (`1`, `yes`, `TRUE` o vacío). |
| 400 | `isAssistantPaused must be a boolean value` | Lo mismo con `isAssistantPaused`. |
| 400 | `search should not be empty` | Vacío o solo espacios. |
| 400 | `search must be shorter than or equal to 200 characters` · `search must be a string` | Más de 200 caracteres tras `trim`. Si el parámetro se repite, llegan los dos. |

**Efectos**

Ninguno (solo lectura).

**Notas para el frontend**

- **Orden:** `lastMessageAt` descendente (los `null` al final) y, a igualdad, `id` descendente. La conversación sube cuando llega un mensaje del cliente y cuando alguien encola una respuesta, manual o aprobada desde Samanta. Los cambios de estado de un mensaje no la mueven.
- **`unreadCount`:** cuenta los `INBOUND` con `readAt = null`. Es del equipo, no de cada usuario, y los `OUTBOUND` nunca cuentan.
- **Contador de la Bandeja:** no hay un total global de mensajes sin leer. `?unreadOnly=true&limit=1` da en `pagination.total` las conversaciones con algo sin leer. ft-crm suma `unreadCount` de hasta 100 conversaciones (`useUnreadSummary`) y marca el resultado como parcial si hay más.
- **Búsqueda (`search`):**
  - Busca coincidencias parciales en `firstName`, `lastName` y `email` del cliente, sin distinguir mayúsculas, y en `phone` tal como se guardó.
  - Si el texto tiene algún dígito, busca además esos dígitos, juntos y sin el resto de caracteres, en el teléfono normalizado. Un dígito suelto amplía mucho el resultado: «Mesa 4» encuentra a todos los clientes con un 4 en el teléfono.
  - No busca en el texto de los mensajes ni por el identificador de Messenger.
- **Nombres del cliente:**
  - WhatsApp: el cliente nuevo llega sin nombre y con `phone` (`+51987654321`). Si ese teléfono ya era de un cliente, la conversación usa ese cliente con sus datos. El nombre aparece cuando alguien lo edita en Clientes.
  - Messenger: el cliente llega sin `phone` ni `email`. Cuando llega un mensaje nuevo de un cliente sin `firstName` ni `lastName`, bk-crm pide a Meta su nombre visible y lo guarda completo en `firstName` (`"Rosa Mamani"`), con `lastName` en `null`. Puede aparecer un instante después del mensaje. Si Meta no lo da, queda en `null` y se vuelve a pedir con el siguiente mensaje del cliente. Nunca reemplaza un nombre puesto en el CRM.
  - Prepara un texto de respaldo para cuando falte el nombre: el teléfono o «Cliente de Messenger». Hoy `customerName()` ya usa el teléfono, pero en Messenger sin nombre muestra «Cliente sin nombre».
- **Responsable inelegible:** `assignedUser.isEligible = false` significa que el responsable se desactivó o ya no tiene ADMIN ni OPERATOR. Resáltalo para que un ADMIN reasigne.
- **Páginas:** pedir una página posterior a la última devuelve `data: []` con la `page` pedida.
- **Vista previa:** la lista no trae el último mensaje. ft-crm lo pide con `GET /conversations/:id/messages?limit=1` por fila, con la clave `qk.lastMessage(id, lastMessageAt)`. Como los recibos de entrega no cambian `lastMessageAt`, el estado que muestra la vista previa no se refresca solo.
- `toSearch` ya omite los filtros vacíos y envía los booleanos como texto.

### Ver detalle de una conversación
`GET /conversations/:id`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Conversation` |
| ft-crm | `conversationsApi.get(id: string): Promise<Conversation>` (existe) |
| Caché | `qk.conversation(id)` |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. Acepta cualquier versión de UUID. |

No tiene query: si envías parámetros, se ignoran.

**Respuesta**

```json
{
  "id": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "customerId": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
  "channel": "WHATSAPP",
  "isAssistantPaused": false,
  "assignedUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "lastMessageAt": "2026-11-03T02:32:11.984Z",
  "createdAt": "2026-10-28T19:14:05.320Z",
  "updatedAt": "2026-11-03T02:32:11.986Z",
  "customer": {
    "id": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
    "firstName": "Lucía",
    "lastName": "Quispe",
    "phone": "+51987654321",
    "email": null
  },
  "assignedUser": {
    "id": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
    "firstName": "Carlos",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "unreadCount": 1
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |

**Efectos**

Ninguno (solo lectura). Consultar no marca nada como leído.

**Notas para el frontend**

- Devuelve el mismo objeto que cada fila de la lista, sin mensajes. Úsalo para la cabecera del chat: nombre del cliente, canal, pausa, responsable y `unreadCount`.
- ft-crm lo consulta por id (`useConversation`) para que la conversación abierta siga visible aunque un filtro de la lista la oculte, y no reintenta ante 400 o 404.
- Después de pausar o asignar no hace falta pedirlo de nuevo: esas rutas ya devuelven la conversación actualizada.

### Ver historial de mensajes
`GET /conversations/:id/messages`

| | |
|---|---|
| Roles | ADMIN, OWNER, OPERATOR |
| Respuesta | 200 · `Paginated<Message>` |
| ft-crm | `conversationsApi.messages(id: string, query?: ListMessagesQuery): Promise<Paginated<Message>>` (existe) |
| Caché | `qk.messages(id)` para la página 1 del chat y `qk.lastMessage(id, lastMessageAt)` para la vista previa de la lista. Las páginas anteriores viven en el estado del componente (`useConversationMessages`). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Query**

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `page` | number | No | `1` | Entero de 1 a 1 000 000. La página 1 trae lo más reciente. |
| `limit` | number | No | `50` | Entero de 1 a 100. |

No admite otros parámetros, ni siquiera los filtros de la lista (`channel`, `search`…): responden 400 `property <campo> should not exist`.

**Ejemplo de petición**

```ts
// Página reciente del chat
const recent = await conversationsApi.messages("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", { page: 1, limit: 50 });
// GET /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/messages?page=1&limit=50

// Vista previa de la lista: solo el último mensaje
const last = (await conversationsApi.messages("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", { limit: 1 })).data[0] ?? null;
// GET /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/messages?limit=1
```

**Respuesta** (ejemplo con `?page=1&limit=3`)

```json
{
  "data": [
    {
      "id": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
      "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "channel": "WHATSAPP",
      "sequence": 7,
      "externalMessageId": "wamid.HBgLNTE5ODc2NTQzMjEVAgASGBQzQUI3RjY0QjE4QzJEMUE5NzUwNAA=",
      "direction": "INBOUND",
      "status": "PROCESSED",
      "type": "TEXT",
      "content": "¿Tienen mesa para 4 personas este sábado a las 8 pm?",
      "authorUserId": null,
      "occurredAt": "2026-11-03T02:32:09.000Z",
      "receivedAt": "2026-11-03T02:32:11.984Z",
      "processedAt": "2026-11-03T02:32:13.402Z",
      "sentAt": null,
      "deliveredAt": null,
      "providerReadAt": null,
      "failedAt": null,
      "readAt": null,
      "errorCode": null,
      "createdAt": "2026-11-03T02:32:11.986Z",
      "updatedAt": "2026-11-03T02:32:13.404Z",
      "attachments": []
    },
    {
      "id": "4c6e8a0b-2d4f-4e7a-b1c3-5d7f9a1b3c5e",
      "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "channel": "WHATSAPP",
      "sequence": 6,
      "externalMessageId": "wamid.HBgLNTE5ODc2NTQzMjEVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA",
      "direction": "OUTBOUND",
      "status": "DELIVERED",
      "type": "TEXT",
      "content": "¡Gracias por la foto, Lucía! La compartimos con el equipo de sala.",
      "authorUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "occurredAt": null,
      "receivedAt": null,
      "processedAt": null,
      "sentAt": "2026-11-03T02:29:12.000Z",
      "deliveredAt": "2026-11-03T02:29:13.000Z",
      "providerReadAt": null,
      "failedAt": null,
      "readAt": null,
      "errorCode": null,
      "createdAt": "2026-11-03T02:29:10.551Z",
      "updatedAt": "2026-11-03T02:29:15.302Z",
      "attachments": []
    },
    {
      "id": "7e9a1c3b-5d7f-4b2e-8a4c-6e8f0b2d4a6c",
      "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "channel": "WHATSAPP",
      "sequence": 5,
      "externalMessageId": "wamid.HBgLNTE5ODc2NTQzMjEVAgASGBQzRUI5MDJBQ0Y4NjE0QjJDNzAxMwA=",
      "direction": "INBOUND",
      "status": "PROCESSED",
      "type": "IMAGE",
      "content": "Así quedó la mesa la última vez",
      "authorUserId": null,
      "occurredAt": "2026-11-03T02:25:40.000Z",
      "receivedAt": "2026-11-03T02:25:41.218Z",
      "processedAt": "2026-11-03T02:25:42.904Z",
      "sentAt": null,
      "deliveredAt": null,
      "providerReadAt": null,
      "failedAt": null,
      "readAt": "2026-11-03T02:28:03.117Z",
      "errorCode": null,
      "createdAt": "2026-11-03T02:25:41.220Z",
      "updatedAt": "2026-11-03T02:28:03.119Z",
      "attachments": [
        {
          "id": "0d2f4b6a-8c1e-4a3d-9f5b-7a9c1e3f5b7d",
          "type": "IMAGE",
          "fileName": null,
          "mimeType": "image/jpeg",
          "sizeBytes": null,
          "externalMediaId": "1043958217712345",
          "url": null,
          "createdAt": "2026-11-03T02:25:41.220Z"
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 3, "total": 7, "totalPages": 3 }
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OWNER ni OPERATOR. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `property <campo> should not exist` | Parámetro no declarado (también `channel` o `search`). |
| 400 | `page must not be greater than 1000000` · `page must not be less than 1` · `page must be an integer number` | `page` fuera de rango, vacío, decimal o no numérico. |
| 400 | `limit must not be greater than 100` · `limit must not be less than 1` · `limit must be an integer number` | Lo mismo con `limit`. |
| 404 | `Conversación no encontrada` | La conversación no existe. |

**Efectos**

Ninguno (solo lectura). Ver el historial no marca nada como leído: para eso está [Marcar como leído](#marcar-como-leído-hasta-un-mensaje).

**Notas para el frontend**

- **Orden y paginación:**
  - `sequence` descendente: la página 1 trae lo más reciente. Para pintar el chat, ordena por `sequence` ascendente.
  - `sequence` es correlativo por conversación (1, 2, 3…) y es el orden real del chat. No ordenes por fechas: la hora de Meta y la del servidor no coinciden.
  - Los mensajes nuevos desplazan las páginas. Para «cargar anteriores», pide la página siguiente y deduplica por `id`; ft-crm ya lo hace (`mergeMessages` y `loadOlder`).
  - `pagination.total` cuenta los mensajes de las dos direcciones.
- **Hora de la burbuja:** `occurredAt` en los `INBOUND` (si es `null`, `receivedAt`) y `sentAt` en los `OUTBOUND` (si es `null`, `createdAt`). Es lo que hace `messageTimestamp`.
- **Fechas según la dirección:**

  | Campo | INBOUND | OUTBOUND |
  |---|---|---|
  | `occurredAt` | Hora que informa Meta. Solo es `null` en los datos de demostración. | Siempre `null`. |
  | `receivedAt` | Llegada a bk-crm. | Siempre `null`. |
  | `processedAt` | Fin del procesamiento interno (`PROCESSED`). | Siempre `null`. |
  | `createdAt` | Momento en que se guardó (casi igual a `receivedAt`). | Momento en que se encoló. |
  | `sentAt` | Siempre `null`. | Meta aceptó el envío. Un recibo de Meta con una hora anterior lo adelanta. |
  | `deliveredAt` | Siempre `null`. | Recibo de entrega (WhatsApp o Messenger). |
  | `providerReadAt` | Siempre `null`. | El cliente lo leyó (solo WhatsApp). |
  | `failedAt` | Fallo del procesamiento. | Fallo del envío o de la entrega. |
  | `readAt` | Lectura del equipo en el CRM. | Siempre `null`. |

- **Autor:** `authorUserId` es `null` en los `INBOUND`. En los `OUTBOUND` es quien envió el mensaje o quien aprobó el borrador de Samanta: nunca es `null`. Para marcar un mensaje como de Samanta, crúzalo con `outboundMessageId` de los borradores `APPROVED` ([Listar borradores](#listar-borradores-de-samanta)). La regla actual de ft-crm, «`OUTBOUND` sin autor = Samanta» (`messageAuthor`), nunca se cumple con datos reales.
- **Nombre del autor:** solo llega el id, y `GET /users` es solo para ADMIN. Muestra «Tú» si coincide con `GET /auth/me`, el nombre del responsable si coincide con `assignedUser.id`, o «Equipo».
- **Tipos de mensaje:**
  - `TEXT`: el texto va en `content`. Los entrantes pueden tener hasta 16 000 caracteres.
  - `IMAGE` y `FILE`: solo llegan por WhatsApp (foto o documento). La metadata va en `attachments` y el pie de foto en `content` (`null` si no hay).
  - `OTHER`: contenido que el canal aún no soporta, sin `attachments`. `content` trae `[Mensaje de WhatsApp no compatible todavía]` (audio, video, sticker…) o `[Adjunto de Messenger no compatible todavía]` (adjunto sin texto).
  - Los salientes siempre son `TEXT`.
- **Adjuntos:** solo hay metadata (`externalMediaId`, `mimeType`, `fileName`). Desde WhatsApp, `url` y `sizeBytes` llegan `null`, y no hay endpoint para descargar el archivo. Muestra «[Imagen]» o «[Archivo: nombre]», como ya hace `messageText`.
- **Qué mostrar según el estado** (el detalle, en [Estados y transiciones](#estados-y-transiciones-3)):

  | `status` | Dirección | Qué mostrar |
  |---|---|---|
  | `RECEIVED`, `PROCESSING`, `PROCESSED` | INBOUND | Nada especial: el texto se muestra desde que llega. |
  | `FAILED` | INBOUND | El mensaje igual, con un indicador discreto. |
  | `QUEUED` | OUTBOUND | «En cola». Con `errorCode` `WHATSAPP_RATE_LIMITED` o `MESSENGER_RATE_LIMITED`, «Reintentando…»: Meta pidió esperar y el backend reintenta solo. |
  | `SENDING` | OUTBOUND | «Enviando…». En un reintento sigue trayendo `*_RATE_LIMITED` (el worker no borra el código al tomarlo): muestra también «Reintentando…», como ya hace `outboundStatusView`. |
  | `SENT` | OUTBOUND | «Enviado» (✓). |
  | `DELIVERED` | OUTBOUND | «Entregado» (✓✓). Es el último estado posible en Messenger. |
  | `READ` | OUTBOUND | «Leído» (✓✓ resaltado). Solo en WhatsApp, y no llega si el cliente ocultó las confirmaciones. |
  | `UNKNOWN` | OUTBOUND | «Estado incierto: verifica antes de reenviar». Meta pudo recibirlo y el backend nunca lo reenvía. |
  | `FAILED` | OUTBOUND | «No enviado» o «No entregado», según `errorCode`. |

- `FAILED_TEXT` y `outboundStatusView` de ft-crm solo conocen los códigos `WHATSAPP_*`: agrega los `MESSENGER_*`.
- **Diagnóstico:** ante un `FAILED` o `UNKNOWN` que no se entiende, pasa el `id` del mensaje al equipo de backend. Cada vez que Meta responde al envío con un error HTTP (4xx, 429 o 5xx), el log `WHATSAPP_SEND_HTTP_ERROR` o `MESSENGER_SEND_HTTP_ERROR` lo registra con ese id, el estado HTTP y los códigos numéricos de Meta. Un timeout o un error de red no deja esa línea.
- `externalMessageId` es el id de Meta (wamid o mid). En un `OUTBOUND` aparece al llegar a `SENT`.

### Enviar un mensaje de texto
`POST /conversations/:id/messages`

| | |
|---|---|
| Roles | ADMIN, OPERATOR. La asignación no limita: cualquiera de los dos puede responder aunque la conversación sea de otra persona. |
| Respuesta | 202 · `Message`: el mensaje en cola o, si repites la clave, el mismo mensaje en su estado actual |
| ft-crm | `conversationsApi.send(id: string, content: string, idempotencyKey?: string): Promise<Message>` (existe). Pasa siempre la clave: el valor por defecto crea una nueva en cada llamada. |
| Caché | Agrega el mensaje a `qk.messages(id)` con `setQueryData` (`storeSentMessage`). Invalida `["conversations", "list"]` y `qk.conversation(id)` (cambian `lastMessageAt` y el orden) y `qk.assistantDrafts(id)` (los borradores pendientes quedan desactualizados). |
| Cabeceras y límites | `Idempotency-Key` obligatoria. Timeout del BFF: `CRM_BACKEND_TIMEOUT_MS` (15 s por defecto). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Cabeceras**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `Idempotency-Key` | string | Sí | 16 a 80 caracteres `[A-Za-z0-9_-]` (`^[a-zA-Z0-9_-]{16,80}$`). Única por conversación, para todos los usuarios. No la empieces con `samanta-`. Un `crypto.randomUUID()` sirve (`newIdempotencyKey()`). |
| `Content-Type` | string | Sí | `application/json`. `apiFetch` la pone sola. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `type` | `"TEXT"` | Sí | Exactamente `TEXT`, en mayúsculas. |
| `content` | string | Sí | Al menos un carácter que no sea espacio en blanco (`/\S/`). No admite `null`. Tope del DTO: 4096 caracteres contando cada emoji como 1. Tope real por canal, con `content.length` (unidades UTF-16; un emoji suele contar 2): 4096 en `WHATSAPP` y 2000 en `FACEBOOK`. No se recorta: se envía tal cual. |
| Cualquier otro | — | — | 400 `property <campo> should not exist` (`to`, `status`, `authorUserId`, `externalMessageId`, `sentAt`…). El backend calcula el autor, el destinatario y el estado. |

**Ejemplo de petición**

```ts
// Genera la clave al pulsar «Enviar» y guárdala con el texto para reintentar ese mismo envío.
const key = newIdempotencyKey();
const message = await conversationsApi.send(
  "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f",
  "¡Hola, Rosa! Sí atendemos el feriado, de 12:00 a 22:00. ¿Te ayudamos con una reserva?",
  key,
);
```

```http
POST /api/backend/conversations/8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f/messages
Content-Type: application/json
Idempotency-Key: 3b9d6c1e-2f4a-4c8e-9b1d-5a7c9e2f4b6d

{"type":"TEXT","content":"¡Hola, Rosa! Sí atendemos el feriado, de 12:00 a 22:00. ¿Te ayudamos con una reserva?"}
```

**Respuesta** (202, conversación de Messenger)

```json
{
  "id": "5f7a9c1e-3b5d-4f8a-a2c4-6e8a0c2e4f6b",
  "conversationId": "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f",
  "channel": "FACEBOOK",
  "sequence": 4,
  "externalMessageId": null,
  "direction": "OUTBOUND",
  "status": "QUEUED",
  "type": "TEXT",
  "content": "¡Hola, Rosa! Sí atendemos el feriado, de 12:00 a 22:00. ¿Te ayudamos con una reserva?",
  "authorUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "occurredAt": null,
  "receivedAt": null,
  "processedAt": null,
  "sentAt": null,
  "deliveredAt": null,
  "providerReadAt": null,
  "failedAt": null,
  "readAt": null,
  "errorCode": null,
  "createdAt": "2026-11-03T02:35:10.291Z",
  "updatedAt": "2026-11-03T02:35:10.291Z",
  "attachments": []
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos que no son `type` ni `content`. Va primero en el array. |
| 400 | `type must be equal to TEXT` | `type` falta o no es exactamente `TEXT`. |
| 400 | `content must be shorter than or equal to 4096 characters` · `content must match /\S/ regular expression` · `content must be a string` | `content` falta, es `null` o no es texto (llegan los tres); vacío o solo espacios (el segundo); más de 4096 caracteres contando cada emoji como 1 (el primero). |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 400 | `Idempotency-Key debe contener 16 a 80 caracteres alfanuméricos, guion o guion bajo` | La cabecera falta o tiene otro formato. |
| 409 | `Idempotency-Key ya utilizada con otros datos` | La clave ya se usó en esta conversación con otro `type` o `content`, o la usó otro usuario. Se comprueba antes que el canal y la ventana. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 400 | `Conversación sin destinatario habilitado` | El canal no tiene envío: `INSTAGRAM`, `WEBSITE`, `PHONE`, `EMAIL` u `OTHER`. |
| 503 | `WhatsApp no está habilitado` · `Messenger no está habilitado` | El canal de la conversación está apagado en el servidor (`WHATSAPP_ENABLED` o `MESSENGER_ENABLED`). |
| 400 | `WhatsApp admite hasta 4096 caracteres por respuesta` · `Messenger admite hasta 2000 caracteres por respuesta` | `content.length` supera el tope del canal (p. ej. 2001 caracteres en Messenger, o 3000 emojis en WhatsApp). |
| 400 | `Conversación sin destinatario habilitado` | WhatsApp: el cliente no tiene un teléfono internacional válido (se le quitó o se cambió por uno nacional sin país). Messenger: el cliente no es una identidad de la página configurada. |
| 409 | `Ventana de WhatsApp cerrada; se requiere una plantilla aprobada` · `Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje` | No hay un `INBOUND` de ese cliente en las últimas 24 h. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta con la misma clave. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Crea un mensaje `OUTBOUND` `TEXT` en `QUEUED`, con su entrada en la cola de envío. El autor es quien llama. El destinatario se fija en ese momento: el teléfono normalizado (WhatsApp) o el PSID (Messenger) del cliente.
- La conversación suma 1 a su secuencia y actualiza `lastMessageAt` y `updatedAt`: sube en la bandeja.
- Los borradores `READY` o `GENERATING` de la conversación quedan desactualizados: pasan a `STALE` en la siguiente consulta o acción sobre ellos.
- No cambia el responsable, la pausa, `unreadCount` ni el `lastContactAt` del cliente.
- Un worker hace el envío a Meta fuera de la petición. Repetir la misma clave no tiene efectos.

**Notas para el frontend**

- **202 = en cola.** El 202 confirma que el mensaje se guardó, no que llegó. Agrega el `Message` devuelto al chat (`storeSentMessage`) y sigue su `status` con el polling del historial.
- **Idempotencia:**
  - Genera la clave cuando el usuario pulsa «Enviar» y guárdala con el texto; reutilízala solo para reintentar ese mismo envío (timeout, error de red, doble clic). El Composer de ft-crm ya lo hace (`pendingKey`).
  - Misma clave, mismo autor, mismo `type` y mismo `content`: 202 con el mensaje original en su estado actual (puede venir ya `SENT` o `FAILED`), sin reenviar. No asumas `QUEUED`.
  - Un reintento tardío devuelve el original aunque la ventana ya se haya cerrado, porque la repetición se resuelve antes.
  - bk-crm usa `samanta-<draftId>` como clave al aprobar borradores: no uses ese prefijo.
- **Longitud por canal:** cuenta con `content.length`, igual que el backend: 4096 en WhatsApp y 2000 en Messenger. ft-crm usa `OUTBOUND_CONTENT_MAX_LENGTH` (4096) en el `maxLength` del textarea y en el contador: cámbialo por el tope del canal (`OUTBOUND_TEXT_MAX_LENGTH`).
- **Ventana de 24 h:**
  - Se puede responder si hay un `INBOUND` de esta conversación, del mismo teléfono (WhatsApp) o PSID (Messenger) y del mismo número o página del negocio, con `occurredAt` en las últimas 24 h.
  - Fuera de la ventana, en WhatsApp haría falta una plantilla aprobada (no implementada) y en Messenger hay que esperar a que el cliente escriba.
  - El worker la vuelve a comprobar antes de enviar: un mensaje encolado justo antes del cierre puede terminar `FAILED` con `*_WINDOW_CLOSED`.
  - Si se cambia el teléfono del cliente en Clientes, la ventana se evalúa con el número nuevo; lo que ya estaba en cola sale al número anterior.
  - Deshabilita el editor 24 h después del `occurredAt` del último `INBOUND` cargado. ft-crm ya lo estima (`estimateReplyWindow`), pero solo en WhatsApp: aplícalo también a `FACEBOOK`. El 409 del backend es la respuesta definitiva.
- **Canales:** solo `WHATSAPP` y `FACEBOOK` tienen envío. En ft-crm, `SENDABLE_CHANNELS` solo incluye `WHATSAPP` y el Composer exige `customer.phone`. En Messenger no hay teléfono (el backend resuelve el destinatario): agrega `FACEBOOK` y quita esa condición para ese canal.
- **Asignación:** el backend deja responder a cualquier ADMIN u OPERATOR aunque la conversación sea de otra persona. ft-crm bloquea al OPERATOR en ese caso (`composerState`): es una regla de la interfaz, no del backend.
- **Textos de error:** `sendErrorText` de ft-crm tiene un texto propio solo para el 503 de WhatsApp; el 503 `Messenger no está habilitado` y el 400 de longitud de Messenger ya se muestran con el texto del backend. Lo que falla es que describe todo 409 de ventana y todo 400 de destinatario como de WhatsApp: elige esos textos según `conversation.channel` ([Bandeja](#bandeja) en el 05).
- **Espacios:** el backend no recorta `content`. El Composer envía `draft.trim()`: mantenlo.
- **Reenviar:** no hay endpoint de reintento. Reenviar es un POST nuevo con una clave nueva. Ante un `UNKNOWN`, no reenvíes sin confirmar antes que el cliente no lo recibió.

### Marcar como leído hasta un mensaje
`PATCH /conversations/:id/read`

| | |
|---|---|
| Roles | ADMIN, OPERATOR |
| Respuesta | 200 · `MarkConversationReadResponse` |
| ft-crm | `conversationsApi.markRead(id: string, throughMessageId: string): Promise<MarkConversationReadResponse>` (existe) |
| Caché | Pon `unreadCount: 0` en `qk.conversation(id)` y en las listas (`storeConversationRead`) e invalida `["conversations", "list"]` y `qk.conversation(id)` para traer el valor real. Invalida `qk.messages(id)` solo si muestras `readAt`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `throughMessageId` | `Uuid` | Sí | UUID de un mensaje de esta conversación, de cualquier dirección: el más reciente que el usuario vio. No admite `null`. |
| Cualquier otro | — | — | 400 `property <campo> should not exist`. |

**Ejemplo de petición**

```ts
await conversationsApi.markRead("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f");
```

```http
PATCH /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/read
Content-Type: application/json

{"throughMessageId":"1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f"}
```

**Respuesta**

```json
{
  "updated": 1,
  "throughMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra. |
| 400 | `throughMessageId must be a UUID` | Falta (también con el body vacío), es `null` o no es un UUID. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 404 | `Mensaje no encontrado en esta conversación` | `throughMessageId` no existe o es de otra conversación. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Pone `readAt` (hora del servidor) en todos los `INBOUND` de la conversación con `readAt = null` y `sequence` menor o igual que la del mensaje indicado. `unreadCount` baja en la misma cantidad.
- No cambia la conversación (`updatedAt`, `lastMessageAt`) ni los `OUTBOUND`.
- No avisa a Meta: el cliente no ve un doble check azul.

**Notas para el frontend**

- Envía el `id` del mensaje más reciente que el usuario vio de verdad. En la página 1 del historial es `data[0].id`; en la lista ya ordenada de ft-crm, `messages.at(-1).id`.
- Los mensajes que llegan después del corte siguen sin leer: no hay carreras.
- Es idempotente: repetirlo responde `updated: 0`.
- La lectura es del equipo, no de cada usuario.
- OWNER no puede marcar (403). ft-crm ya lo evita con el permiso `conversation.read`, y solo marca con la pestaña visible, 500 ms después de mostrar el último mensaje (`useMarkAsRead`).
- `storeConversationRead` pone `unreadCount` en 0, pero si llegó otro mensaje después del corte el valor real es mayor: por eso hay que invalidar después.

### Pausar o reanudar a Samanta en la conversación
`PATCH /conversations/:id/assistant`

| | |
|---|---|
| Roles | ADMIN, OPERATOR. La asignación no limita: cualquiera de los dos puede cambiarla. |
| Respuesta | 200 · `Conversation` |
| ft-crm | `conversationsApi.setAssistantPaused(id: string, paused: boolean): Promise<Conversation>` (existe) |
| Caché | Guarda la respuesta en `qk.conversation(id)` y en las listas (`storeConversation`). Invalida `["conversations", "list"]` si hay listas filtradas por `isAssistantPaused`, y `qk.assistantDrafts(id)`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `paused` | boolean | Sí | Booleano JSON (`true` o `false`). `"false"` como texto, `1` o `null` responden 400. |
| Cualquier otro | — | — | 400 `property <campo> should not exist`. |

**Ejemplo de petición**

```ts
const conversation = await conversationsApi.setAssistantPaused("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", true);
```

```http
PATCH /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant
Content-Type: application/json

{"paused":true}
```

**Respuesta**

```json
{
  "id": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "customerId": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
  "channel": "WHATSAPP",
  "isAssistantPaused": true,
  "assignedUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "lastMessageAt": "2026-11-03T02:34:02.407Z",
  "createdAt": "2026-10-28T19:14:05.320Z",
  "updatedAt": "2026-11-03T02:40:18.602Z",
  "customer": {
    "id": "c3e8a9b2-5d4f-4a6e-8c1b-7f2d9e0a3b56",
    "firstName": "Lucía",
    "lastName": "Quispe",
    "phone": "+51987654321",
    "email": null
  },
  "assignedUser": {
    "id": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
    "firstName": "Carlos",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "unreadCount": 0
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra (p. ej. `assignedUserId`: la asignación va por otra ruta). |
| 400 | `paused must be a boolean value` | Falta `paused` o no es un booleano JSON. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Cambia `isAssistantPaused` y `updatedAt`. Enviar el valor que ya tiene también responde 200.
- Mientras siga en pausa, generar un borrador responde 409, y los borradores `READY` o `GENERATING` pasan a `STALE` en la siguiente consulta o acción sobre ellos.
- No detiene la recepción ni el envío de mensajes, no impide las respuestas manuales y no cambia el responsable.

**Notas para el frontend**

- Samanta v1 no responde sola: la pausa solo afecta a los borradores. El «modo» que muestra ft-crm (Samanta, En pausa, Operador) es un concepto de la interfaz que se deriva de la pausa y del responsable (`conversationMode`).
- Reanudar no recupera los borradores que ya pasaron a `STALE`. Un borrador que nadie consultó durante la pausa sigue `READY` al reanudar, si no hubo otros cambios. Refresca el panel de Samanta y la cabecera.
- ft-crm encadena esta ruta con la asignación («Pasar a humano», «Devolver a Samanta»). Son llamadas independientes y cada una puede fallar por su cuenta: maneja el error de cada paso.

### Asignar, tomar o liberar una conversación
`PATCH /conversations/:id/assignee`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR solo toma conversaciones libres o se libera de las propias) |
| Respuesta | 200 · `Conversation` |
| ft-crm | `conversationsApi.assign(id: string, body: AssignConversationRequest): Promise<Conversation>` (existe) |
| Caché | Guarda la respuesta con `storeConversation` e invalida `["conversations", "list"]` (cambia el resultado del filtro `assignedUserId`). |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `assignedUserId` | `Uuid` o `null` | Sí | `null` desasigna. Si no es `null`, tiene que ser el UUID de un usuario activo con rol ADMIN u OPERATOR. Omitirlo responde 400: no desasigna. `""` y `false` también responden 400. |
| Cualquier otro | — | — | 400 `property <campo> should not exist`. |

Quién puede asignar a quién:

| Quien llama | Conversación libre | Asignada a quien llama | Asignada a otra persona |
|---|---|---|---|
| ADMIN | Asigna a cualquier usuario elegible, o `null` | Igual | Igual: reemplaza al responsable o desasigna |
| OPERATOR sin ADMIN | Solo su propio id (tomar) o `null` | Su propio id (sin cambios) o `null` (liberar) | 403, con cualquier valor |
| OWNER o SUPPORT | 403 | 403 | 403 |

**Ejemplo de petición**

```ts
// Un OPERATOR toma una conversación libre (su id sale de GET /auth/me)
await conversationsApi.assign("8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f", {
  assignedUserId: "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
});

// Y la libera
await conversationsApi.assign("8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f", { assignedUserId: null });
```

```http
PATCH /api/backend/conversations/8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f/assignee
Content-Type: application/json

{"assignedUserId":"9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d"}
```

**Respuesta** (después de tomarla)

```json
{
  "id": "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d5f",
  "customerId": "3a5c7e9b-1d3f-4b6a-8c0e-2d4f6a8c0e2b",
  "channel": "FACEBOOK",
  "isAssistantPaused": false,
  "assignedUserId": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "lastMessageAt": "2026-11-03T02:35:10.288Z",
  "createdAt": "2026-11-03T01:57:02.118Z",
  "updatedAt": "2026-11-03T02:41:55.130Z",
  "customer": {
    "id": "3a5c7e9b-1d3f-4b6a-8c0e-2d4f6a8c0e2b",
    "firstName": "Rosa Mamani",
    "lastName": null,
    "phone": null,
    "email": null
  },
  "assignedUser": {
    "id": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
    "firstName": "Carlos",
    "lastName": "Huamán",
    "isActive": true,
    "isEligible": true
  },
  "unreadCount": 0
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra. |
| 400 | `assignedUserId must be a UUID` | El campo se omitió, viene vacío, es `false` o no es un UUID. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 403 | `Solo puedes tomar conversaciones libres o desasignarte de las propias` | Un OPERATOR sin ADMIN intenta asignar a otra persona o tocar una conversación asignada a otra persona. |
| 404 | `Usuario no encontrado` | `assignedUserId` no existe. |
| 400 | `Responsable no elegible` | El usuario está inactivo o no tiene ADMIN ni OPERATOR (p. ej. es solo OWNER o SUPPORT). |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Cambia `assignedUserId` y `updatedAt`. Asignar el valor que ya tiene también responde 200.
- Un OPERATOR deja de poder generar, editar, aprobar o rechazar borradores de Samanta en una conversación asignada a otra persona (403 `Conversación asignada a otro operador`).
- No cambia la pausa y no limita la lectura ni las respuestas manuales.

**Notas para el frontend**

- Obtén el `id` y los `roles` del usuario actual con `GET /auth/me`.
- Para el selector de responsable, un ADMIN puede usar `GET /users` (solo ADMIN) y mostrar los activos con ADMIN u OPERATOR. Al OPERATOR muéstrale solo «Tomar» y «Liberar».
- Si `assignedUser.isEligible` es `false` (el responsable se desactivó o perdió sus roles después), muestra un aviso para que un ADMIN reasigne.
- No hay asignación automática: ningún mensaje ni acción de Samanta cambia el responsable.
- ft-crm decide qué botones mostrar con `conversationControls`, que ya sigue estas reglas.

### Generar un borrador con Samanta
`POST /conversations/:id/assistant-drafts`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otra persona) |
| Respuesta | 201 · `SamantaDraft`, también cuando queda `STALE` o `FAILED`: revisa `status` |
| ft-crm | `assistantDraftsApi.generate(conversationId: string, sourceMessageId: string, idempotencyKey: string): Promise<SamantaDraft>` (nueva) |
| Caché | Guarda la respuesta en `qk.assistantDraft(conversationId, draft.id)` e invalida `qk.assistantDrafts(conversationId)`. |
| Cabeceras y límites | `Idempotency-Key` obligatoria. 429 al llegar al límite diario global (`SAMANTA_DAILY_LIMIT`, 100) o al de generaciones simultáneas (`SAMANTA_CONCURRENT_LIMIT`, 2). bk-crm espera a la IA hasta `SAMANTA_TIMEOUT_MS` (20 s; máximo 60 s), por eso el BFF da a esta ruta 65 s en lugar de los 15 s generales. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

**Cabeceras**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `Idempotency-Key` | string | Sí | `^[a-zA-Z0-9_-]{16,80}$`. Única por conversación. Una clave nueva por cada clic en «Generar»; la misma solo para recuperar o reintentar esa generación. |
| `Content-Type` | string | Sí | `application/json`. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `sourceMessageId` | `Uuid` | Sí | UUID del último mensaje de la conversación (el de `sequence` más alto). Tiene que ser `INBOUND`, de tipo `TEXT`, con texto que no sea solo espacios y `content.length` ≤ 4096. No admite `null`. |
| Cualquier otro | — | — | 400 `property <campo> should not exist` (p. ej. `model`). |

**Ejemplo de petición**

```ts
const [newest] = (await conversationsApi.messages(conversationId, { limit: 1 })).data;
if (newest?.direction === "INBOUND" && newest.type === "TEXT") {
  const key = newIdempotencyKey(); // una por clic en «Generar»
  const draft = await assistantDraftsApi.generate(conversationId, newest.id, key);
}
```

```http
POST /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant-drafts
Content-Type: application/json
Idempotency-Key: 9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e

{"sourceMessageId":"1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f"}
```

**Respuesta** (201)

```json
{
  "id": "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
  "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "sourceMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
  "baselineSequence": 7,
  "idempotencyKey": "9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e",
  "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "reviewedById": null,
  "editedById": null,
  "status": "READY",
  "revision": 1,
  "model": "gpt-6-luna",
  "promptVersion": "samanta-drafts-v1",
  "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
  "originalContent": "¡Hola! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? Un miembro del equipo confirmará la disponibilidad.",
  "content": "¡Hola! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? Un miembro del equipo confirmará la disponibilidad.",
  "intent": "RESERVATION",
  "requiresHuman": true,
  "missingFields": ["nombre"],
  "inputTokens": 2148,
  "outputTokens": 87,
  "errorCode": null,
  "generationExpiresAt": "2026-11-03T02:33:20.051Z",
  "expiresAt": "2026-11-03T02:47:50.051Z",
  "reviewedAt": null,
  "outboundMessageId": null,
  "createdAt": "2026-11-03T02:32:50.058Z",
  "updatedAt": "2026-11-03T02:32:54.733Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra. Va primero en el array. |
| 400 | `sourceMessageId must be a UUID` | Falta, es `null` o no es un UUID. |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 503 | `Samanta está desactivada` | `SAMANTA_ENABLED` no es `true`. Se comprueba antes que la clave. |
| 400 | `Idempotency-Key inválida (16 a 80 caracteres)` | La cabecera falta o tiene otro formato. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 403 | `Conversación asignada a otro operador` | Un OPERATOR sin ADMIN actúa sobre una conversación asignada a otra persona. |
| 409 | `Idempotency-Key utilizada con otros datos` | La clave ya se usó en esta conversación con otro `sourceMessageId` o por otro usuario. |
| 409 | `Samanta está pausada en esta conversación` | `isAssistantPaused` es `true`. |
| 400 | `Samanta v1 admite WhatsApp` | La conversación no es `WHATSAPP` (p. ej. es de Messenger). |
| 409 | `Selecciona el último mensaje entrante de texto (máximo 4096 caracteres)` | `sourceMessageId` no es de esta conversación, no es el último mensaje, no es `INBOUND` o `TEXT`, está vacío o supera 4096. |
| 429 | `Límite de generación de Samanta alcanzado` | Se llegó al límite diario (borradores creados desde las 00:00 UTC por todos los usuarios, incluidos los fallidos) o hay tantas generaciones en curso como permite el límite simultáneo. El body es `{ "statusCode": 429, "message": "…" }`, sin `error` ni `Retry-After`. |
| 409 | `Ya hay un borrador en generación` | Otro borrador de esta conversación sigue en `GENERATING` y no venció. |
| 409 | `Configura el restaurante antes de usar Samanta` | Falta la configuración del restaurante (`PUT /restaurant-config`). |
| 409 | `Contexto comercial demasiado extenso; requiere revisión manual` | La configuración del restaurante y el catálogo superan 32 000 bytes en UTF-8. |
| 409 | `Historial demasiado extenso; requiere revisión manual` | El contexto completo (información comercial y hasta 10 mensajes) supera 48 000 bytes en UTF-8. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta con la misma clave. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |
| 504 | `El servidor del CRM tardó demasiado en responder. Inténtalo de nuevo.` (`code: "BACKEND_UNAVAILABLE"`) | Lo responde el BFF si bk-crm tarda más de 65 s. Repite con la misma clave. |

**Efectos**

- Crea el borrador en `GENERATING` antes de llamar a la IA (las consultas lo ven así mientras tanto) y lo deja en `READY`, `STALE` o `FAILED` al terminar.
- Cuenta para el límite diario aunque falle. Si la IA llegó a responder, los tokens quedan en `inputTokens` y `outputTokens`, también cuando el borrador termina `STALE` o `FAILED`.
- Envía a la IA la configuración del restaurante, hasta 30 elementos activos y aprobados de categorías activas (con hasta 10 variantes y 10 preguntas frecuentes cada uno) y los últimos 10 mensajes de la conversación (entrantes y salientes ya enviados). No envía datos de contacto del cliente, notas internas ni otras conversaciones.
- No envía nada al cliente ni crea solicitudes ni reservas.
- Con la misma clave y los mismos datos no vuelve a llamar a la IA: devuelve el borrador que ya existe, con el estado recalculado.

**Notas para el frontend**

- **Cuándo habilitar «Generar»:** el usuario tiene ADMIN u OPERATOR; la conversación es `WHATSAPP`; `isAssistantPaused` es `false`; el último mensaje (`data[0]` de la página 1) es `INBOUND` y `TEXT`, con texto y `content.length` ≤ 4096; y, si el usuario es OPERATOR sin ADMIN, la conversación está libre o es suya. En Messenger oculta el botón.
- **Espera:** la petición dura lo que tarde la IA, hasta `SAMANTA_TIMEOUT_MS`. Muestra un estado de carga y no la canceles.
- **Recuperar tras un corte:** si la petición falla por red o con 504, repítela con la misma clave. Devuelve el borrador, que puede venir `GENERATING`; en ese caso síguelo con [Ver un borrador](#ver-un-borrador-de-samanta). Una clave nueva es otra generación: consume cuota y tokens.
- **Resultado:** sin error, siempre 201. Mira `status`:
  - `READY`: texto listo para revisar, editar, aprobar o rechazar.
  - `STALE`: durante la generación llegó otro mensaje, se pausó a Samanta o cambió la información comercial. Si fue esto último, trae el texto de todos modos.
  - `FAILED`: la IA falló; `errorCode` dice por qué.
  - `GENERATING`: solo al repetir la clave mientras la primera petición sigue en curso.
- **`errorCode` de un `FAILED`:** `AI_TIMEOUT` (la IA tardó demasiado), `AI_RATE_LIMITED` (el proveedor limitó), `AI_REQUEST_REJECTED`, `AI_INVALID_RESPONSE`, `AI_INCOMPLETE_RESPONSE`, `AI_REFUSED_RESPONSE`, `AI_RESPONSE_TOO_LARGE`, `AI_UNAVAILABLE` (cualquier otro fallo) y `AI_GENERATION_EXPIRED` (la generación quedó abandonada). En todos los casos, muestra «No se pudo generar» y ofrece generar de nuevo con otra clave.
- **Qué mostrar en `READY`:** el texto editable, `intent`, un aviso si `requiresHuman` es `true`, `missingFields` como etiquetas de texto libre y una cuenta atrás hasta `expiresAt` (15 min desde que se pidió).
- **Límites:** el 429 es global, no por usuario, y no hay endpoint para consultar la cuota restante. Solo puede haber una generación en curso por conversación.
- **503:** `Samanta está desactivada` llega sin `code`: no lo trates como falta de conexión ([Errores comunes](#errores-comunes-a-todas-las-rutas)).

### Listar borradores de Samanta
`GET /conversations/:id/assistant-drafts`

| | |
|---|---|
| Roles | ADMIN, OPERATOR, OWNER |
| Respuesta | 200 · `SamantaDraftListResponse` |
| ft-crm | `assistantDraftsApi.list(conversationId: string): Promise<SamantaDraftListResponse>` (nueva) |
| Caché | `qk.assistantDrafts(conversationId)` (nueva) |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |

No tiene query ni paginación: si envías parámetros, se ignoran.

**Respuesta**

```json
{
  "data": [
    {
      "id": "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
      "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "sourceMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
      "baselineSequence": 7,
      "idempotencyKey": "9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e",
      "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "reviewedById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "editedById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "status": "APPROVED",
      "revision": 2,
      "model": "gpt-6-luna",
      "promptVersion": "samanta-drafts-v1",
      "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
      "originalContent": "¡Hola! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? Un miembro del equipo confirmará la disponibilidad.",
      "content": "¡Hola, Lucía! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? En breve te confirmamos la disponibilidad.",
      "intent": "RESERVATION",
      "requiresHuman": true,
      "missingFields": ["nombre"],
      "inputTokens": 2148,
      "outputTokens": 87,
      "errorCode": null,
      "generationExpiresAt": "2026-11-03T02:33:20.051Z",
      "expiresAt": "2026-11-03T02:47:50.051Z",
      "reviewedAt": "2026-11-03T02:34:02.415Z",
      "outboundMessageId": "e2a4c6e8-0b1d-4f3a-8c5e-7a9b1d3f5c7e",
      "createdAt": "2026-11-03T02:32:50.058Z",
      "updatedAt": "2026-11-03T02:34:02.418Z"
    },
    {
      "id": "b4d6f8a0-2c4e-4f6a-9b1d-3e5f7a9c1b3d",
      "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
      "sourceMessageId": "2b4d6f80-1a3c-4e5f-9b7d-8c0e2a4b6d8f",
      "baselineSequence": 3,
      "idempotencyKey": "0e2c4a6b-8d1f-4e3a-b5c7-9d1e3f5a7b9c",
      "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
      "reviewedById": null,
      "editedById": null,
      "status": "FAILED",
      "revision": 1,
      "model": "gpt-6-luna",
      "promptVersion": "samanta-drafts-v1",
      "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
      "originalContent": null,
      "content": null,
      "intent": null,
      "requiresHuman": true,
      "missingFields": [],
      "inputTokens": null,
      "outputTokens": null,
      "errorCode": "AI_TIMEOUT",
      "generationExpiresAt": "2026-11-02T23:41:37.512Z",
      "expiresAt": "2026-11-02T23:56:07.512Z",
      "reviewedAt": null,
      "outboundMessageId": null,
      "createdAt": "2026-11-02T23:41:07.519Z",
      "updatedAt": "2026-11-02T23:41:27.840Z"
    }
  ]
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OPERATOR ni OWNER (p. ej. solo SUPPORT). |
| 400 | `Validation failed (uuid is expected)` | `:id` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |

**Efectos**

- Recalcula y guarda el estado de cada borrador devuelto: un `GENERATING` con `generationExpiresAt` vencido pasa a `FAILED` (`AI_GENERATION_EXPIRED`), y un `READY` o `GENERATING` pasa a `STALE` si llegó otro mensaje, si Samanta está en pausa o si venció `expiresAt`.
- No comprueba cambios en la información comercial: eso se detecta al terminar la generación, al editar y al aprobar.

**Notas para el frontend**

- Devuelve como máximo los 50 borradores más recientes (`createdAt` y luego `id`, descendente), sin paginación ni filtros. El envoltorio es `{ data }`, sin `pagination`.
- Funciona aunque Samanta esté desactivada.
- Cualquier ADMIN, OPERATOR u OWNER puede leer los borradores, aunque la conversación esté asignada a otra persona. OWNER puede consultar, pero no actuar.
- Úsala para el panel de Samanta y para marcar como «Samanta» los mensajes cuyo `id` coincide con el `outboundMessageId` de un borrador `APPROVED`. Solo cubre los 50 borradores más recientes: un mensaje aprobado desde un borrador más antiguo se verá como de quien lo aprobó.
- Como la consulta recalcula estados, un borrador puede volver `STALE` sin que nadie haya actuado sobre él. Refréscala después de enviar, pausar, aprobar o rechazar, y con el ritmo del chat mientras el panel esté abierto.

### Ver un borrador de Samanta
`GET /conversations/:id/assistant-drafts/:draftId`

| | |
|---|---|
| Roles | ADMIN, OPERATOR, OWNER |
| Respuesta | 200 · `SamantaDraft` |
| ft-crm | `assistantDraftsApi.get(conversationId: string, draftId: string): Promise<SamantaDraft>` (nueva) |
| Caché | `qk.assistantDraft(conversationId, draftId)` (nueva) |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |
| `draftId` | `Uuid` | Id del borrador. Tiene que ser de esa conversación. |

No tiene query: si envías parámetros, se ignoran.

**Respuesta** (un borrador mientras la IA trabaja)

```json
{
  "id": "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
  "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "sourceMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
  "baselineSequence": 7,
  "idempotencyKey": "9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e",
  "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "reviewedById": null,
  "editedById": null,
  "status": "GENERATING",
  "revision": 1,
  "model": "gpt-6-luna",
  "promptVersion": "samanta-drafts-v1",
  "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
  "originalContent": null,
  "content": null,
  "intent": null,
  "requiresHuman": true,
  "missingFields": [],
  "inputTokens": null,
  "outputTokens": null,
  "errorCode": null,
  "generationExpiresAt": "2026-11-03T02:33:20.051Z",
  "expiresAt": "2026-11-03T02:47:50.051Z",
  "reviewedAt": null,
  "outboundMessageId": null,
  "createdAt": "2026-11-03T02:32:50.058Z",
  "updatedAt": "2026-11-03T02:32:50.058Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN, OPERATOR ni OWNER (p. ej. solo SUPPORT). |
| 400 | `Validation failed (uuid is expected)` | `:id` o `:draftId` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 404 | `Borrador no encontrado` | El borrador no existe o es de otra conversación. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |

**Efectos**

Los mismos que la lista, para este borrador: puede guardarlo como `FAILED` (`AI_GENERATION_EXPIRED`) o `STALE`.

**Notas para el frontend**

- Úsala para seguir un borrador en `GENERATING`, por ejemplo después de un 504 o al recargar la página. Consulta cada 2 o 3 s ([flujo de Samanta](#samanta-borradores-con-revisión-humana)) hasta que el estado cambie. La espera tiene tope: la primera consulta después de `generationExpiresAt` lo deja `FAILED`.
- Deja de consultar cuando el estado sea final (`APPROVED`, `REJECTED`, `STALE` o `FAILED`).
- Lo pueden leer ADMIN, OPERATOR y OWNER, aunque la conversación esté asignada a otra persona.

### Editar un borrador
`PATCH /conversations/:id/assistant-drafts/:draftId`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otra persona) |
| Respuesta | 200 · `SamantaDraft` |
| ft-crm | `assistantDraftsApi.edit(conversationId: string, draftId: string, body: EditSamantaDraftRequest): Promise<SamantaDraft>` (nueva) |
| Caché | Guarda la respuesta en `qk.assistantDraft(conversationId, draftId)` e invalida `qk.assistantDrafts(conversationId)`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |
| `draftId` | `Uuid` | Id del borrador. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `revision` | number | Sí | Entero de 1 a 2 147 483 646. Tiene que ser la `revision` actual del borrador. |
| `content` | string | Sí | Al menos un carácter que no sea espacio en blanco. No admite `null`. Tope del DTO: 4096 caracteres contando cada emoji como 1; el servicio exige además `content.length` ≤ 4096. Se guarda tal cual, sin recortar. |
| Cualquier otro | — | — | 400 `property <campo> should not exist` (p. ej. `intent` o `missingFields`: no se pueden editar). |

**Ejemplo de petición**

```ts
const edited = await assistantDraftsApi.edit("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", draft.id, {
  revision: draft.revision,
  content:
    "¡Hola, Lucía! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? En breve te confirmamos la disponibilidad.",
});
```

```http
PATCH /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant-drafts/d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c
Content-Type: application/json

{"revision":1,"content":"¡Hola, Lucía! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? En breve te confirmamos la disponibilidad."}
```

**Respuesta**

```json
{
  "id": "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
  "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "sourceMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
  "baselineSequence": 7,
  "idempotencyKey": "9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e",
  "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "reviewedById": null,
  "editedById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "status": "READY",
  "revision": 2,
  "model": "gpt-6-luna",
  "promptVersion": "samanta-drafts-v1",
  "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
  "originalContent": "¡Hola! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? Un miembro del equipo confirmará la disponibilidad.",
  "content": "¡Hola, Lucía! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? En breve te confirmamos la disponibilidad.",
  "intent": "RESERVATION",
  "requiresHuman": true,
  "missingFields": ["nombre"],
  "inputTokens": 2148,
  "outputTokens": 87,
  "errorCode": null,
  "generationExpiresAt": "2026-11-03T02:33:20.051Z",
  "expiresAt": "2026-11-03T02:47:50.051Z",
  "reviewedAt": null,
  "outboundMessageId": null,
  "createdAt": "2026-11-03T02:32:50.058Z",
  "updatedAt": "2026-11-03T02:33:41.270Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra. Va primero en el array. |
| 400 | `content must be shorter than or equal to 4096 characters` · `content must match /\S/ regular expression` · `content must be a string` | `content` falta, es `null` o no es texto (los tres); vacío o solo espacios (el segundo); más de 4096 caracteres contando cada emoji como 1 (el primero). Van antes que los de `revision`. |
| 400 | `revision must not be greater than 2147483646` · `revision must not be less than 1` · `revision must be an integer number` | `revision` falta, es `null` o viene como texto (los tres); es 0 o negativa (el segundo); es decimal (el tercero); supera el tope (el primero). |
| 400 | `Validation failed (uuid is expected)` | `:id` o `:draftId` no es un UUID. |
| 503 | `Samanta está desactivada` | `SAMANTA_ENABLED` no es `true`. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 403 | `Conversación asignada a otro operador` | Un OPERATOR sin ADMIN actúa sobre una conversación asignada a otra persona. |
| 404 | `Borrador no encontrado` | El borrador no existe o es de otra conversación. |
| 409 | `El borrador cambió; vuelve a revisarlo` | `revision` no es la actual. Se comprueba antes que el estado. |
| 409 | `Borrador desactualizado o fallido; genera uno nuevo` | El borrador está `STALE` o `FAILED`, o queda `STALE` en esta llamada (mensaje nuevo, pausa, `expiresAt` vencido o cambio en la información comercial). |
| 409 | `El borrador no está disponible para revisión` | El borrador está `GENERATING`, `APPROVED` o `REJECTED`. |
| 400 | `Contenido inválido` | `content.length` supera 4096 aunque pasó el DTO (p. ej. por emojis, que cuentan 2). |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Guarda `content`, pone `editedById` y suma 1 a `revision`. El estado sigue `READY`.
- `originalContent`, `intent`, `requiresHuman` y `missingFields` no cambian.
- Si el borrador quedó desactualizado, lo guarda como `STALE` y responde 409.

**Notas para el frontend**

- Guarda la `revision` de la respuesta: aprobar o rechazar con la anterior responde 409 `El borrador cambió; vuelve a revisarlo`.
- Si dos personas editan a la vez, la segunda recibe ese 409: vuelve a pedir el borrador y muestra el texto actual antes de que siga.
- Editar no es idempotente: si reintentas tras un error de red o un 504 y la primera llamada sí llegó, la `revision` ya subió y recibes el mismo 409. Pide el borrador y compara su `content` con el que enviaste antes de repetir.
- Solo se edita en `READY`. `SAMANTA_DRAFT_ACTIONS` ([Tipos TypeScript](#tipos-typescript-3)) dice qué acciones admite cada estado.
- `intent`, `requiresHuman` y `missingFields` describen el texto original de la IA: tras editar, pueden no coincidir con el texto nuevo.
- Para el contador del editor usa `content.length`, con tope 4096.

### Aprobar un borrador y encolar el envío
`POST /conversations/:id/assistant-drafts/:draftId/approve`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otra persona) |
| Respuesta | 202 · `SamantaDraft` en `APPROVED`, con `outboundMessageId` |
| ft-crm | `assistantDraftsApi.approve(conversationId: string, draftId: string, revision: number): Promise<SamantaDraft>` (nueva) |
| Caché | Guarda la respuesta en `qk.assistantDraft(conversationId, draftId)`. Invalida `qk.assistantDrafts(conversationId)`, `qk.messages(conversationId)` (hay un saliente nuevo), `qk.conversation(conversationId)` y `["conversations", "list"]`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |
| `draftId` | `Uuid` | Id del borrador. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `revision` | number | Sí | Entero de 1 a 2 147 483 646. Tiene que ser la `revision` actual. |
| Cualquier otro | — | — | 400 `property <campo> should not exist` (p. ej. `content`: para cambiar el texto, edita antes). |

**Ejemplo de petición**

```ts
const approved = await assistantDraftsApi.approve("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", edited.id, edited.revision);
```

```http
POST /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant-drafts/d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c/approve
Content-Type: application/json

{"revision":2}
```

**Respuesta** (202)

```json
{
  "id": "d8f0a2c4-6e8b-4d1f-a3c5-7e9b1d3f5a7c",
  "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "sourceMessageId": "1c3e5a7b-9d2f-4b4a-8e6c-0a2b4c6d8e0f",
  "baselineSequence": 7,
  "idempotencyKey": "9c2f7e4a-1b3d-4f6a-8e0c-2d4b6f8a0c1e",
  "createdById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "reviewedById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "editedById": "9a7b5c3d-1e2f-4a6b-8c9d-0e1f2a3b4c5d",
  "status": "APPROVED",
  "revision": 2,
  "model": "gpt-6-luna",
  "promptVersion": "samanta-drafts-v1",
  "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
  "originalContent": "¡Hola! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? Un miembro del equipo confirmará la disponibilidad.",
  "content": "¡Hola, Lucía! Con gusto te ayudamos con tu solicitud para 4 personas este sábado a las 8 p. m. ¿A nombre de quién la registramos? En breve te confirmamos la disponibilidad.",
  "intent": "RESERVATION",
  "requiresHuman": true,
  "missingFields": ["nombre"],
  "inputTokens": 2148,
  "outputTokens": 87,
  "errorCode": null,
  "generationExpiresAt": "2026-11-03T02:33:20.051Z",
  "expiresAt": "2026-11-03T02:47:50.051Z",
  "reviewedAt": "2026-11-03T02:34:02.415Z",
  "outboundMessageId": "e2a4c6e8-0b1d-4f3a-8c5e-7a9b1d3f5c7e",
  "createdAt": "2026-11-03T02:32:50.058Z",
  "updatedAt": "2026-11-03T02:34:02.418Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra (p. ej. `content`). |
| 400 | `revision must not be greater than 2147483646` · `revision must not be less than 1` · `revision must be an integer number` | `revision` falta, es `null` o viene como texto (los tres); es 0 o negativa; es decimal; supera el tope. |
| 400 | `Validation failed (uuid is expected)` | `:id` o `:draftId` no es un UUID. |
| 503 | `Samanta está desactivada` | `SAMANTA_ENABLED` no es `true`. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 403 | `Conversación asignada a otro operador` | Un OPERATOR sin ADMIN actúa sobre una conversación asignada a otra persona. |
| 404 | `Borrador no encontrado` | El borrador no existe o es de otra conversación. |
| 409 | `El borrador cambió; vuelve a revisarlo` | `revision` no es la actual. Se comprueba antes que el estado. |
| 409 | `Borrador desactualizado o fallido; genera uno nuevo` | El borrador está `STALE` o `FAILED`, o queda `STALE` en esta llamada (mensaje nuevo, pausa, `expiresAt` vencido o cambio en la información comercial). |
| 409 | `El borrador no está disponible para revisión` | El borrador está `GENERATING` o `REJECTED`, o ya lo aprobó otra persona. |
| 409 | `Idempotency-Key ya utilizada con otros datos` | Ya hay en la conversación un mensaje con la clave `samanta-<draftId>` de otro autor o con otro texto (alguien envió a mano con ese prefijo). El borrador sigue `READY`. |
| 503 | `WhatsApp no está habilitado` | WhatsApp está apagado en el servidor. El borrador sigue `READY`. |
| 400 | `Conversación sin destinatario habilitado` | El cliente ya no tiene un teléfono internacional válido. El borrador sigue `READY`. |
| 409 | `Ventana de WhatsApp cerrada; se requiere una plantilla aprobada` | No hay un `INBOUND` del cliente en las últimas 24 h. El borrador sigue `READY`. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- En una sola transacción:
  - crea un mensaje `OUTBOUND` `TEXT` en `QUEUED` con el `content` actual del borrador (el editado, si se editó), con quien aprueba como autor y la clave interna `samanta-<draftId>`;
  - pasa el borrador a `APPROVED` con `reviewedById`, `reviewedAt` y `outboundMessageId`.
- El mensaje nuevo suma 1 a la secuencia de la conversación: los demás borradores `READY` pasan a `STALE` al consultarlos, y la conversación sube en la bandeja (`lastMessageAt`).
- Si el encolado falla (clave usada, WhatsApp apagado, sin destinatario o ventana cerrada), no se crea nada y el borrador sigue `READY`.

**Notas para el frontend**

- `APPROVED` no significa entregado. Busca `outboundMessageId` en la página 1 del historial y sigue su `status` como el de cualquier saliente. No hay endpoint para pedir un mensaje suelto.
- Repetir la aprobación (mismo usuario, misma `revision`) responde 202 con el mismo borrador y no duplica el mensaje. Si otra persona ya lo aprobó, recibes 409 `El borrador no está disponible para revisión`.
- En el historial, ese mensaje tiene como `authorUserId` a quien aprobó: identifícalo como de Samanta por `outboundMessageId`.
- La ventana de 24 h se comprueba igual que al enviar a mano: si el último mensaje del cliente tiene más de 24 h, deshabilita «Aprobar» y explica por qué.
- Si la respuesta es 409 por desactualización, refresca el panel y ofrece generar otro borrador.

### Rechazar un borrador
`POST /conversations/:id/assistant-drafts/:draftId/reject`

| | |
|---|---|
| Roles | ADMIN, OPERATOR (un OPERATOR no puede si la conversación está asignada a otra persona) |
| Respuesta | 200 · `SamantaDraft` en `REJECTED` |
| ft-crm | `assistantDraftsApi.reject(conversationId: string, draftId: string, revision: number): Promise<SamantaDraft>` (nueva) |
| Caché | Guarda la respuesta en `qk.assistantDraft(conversationId, draftId)` e invalida `qk.assistantDrafts(conversationId)`. |

**Parámetros de ruta**

| Parámetro | Tipo | Reglas |
|---|---|---|
| `id` | `Uuid` | Id de la conversación. |
| `draftId` | `Uuid` | Id del borrador. |

**Body**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `revision` | number | Sí | Entero de 1 a 2 147 483 646. Tiene que ser la `revision` actual. |
| Cualquier otro | — | — | 400 `property <campo> should not exist`. |

**Ejemplo de petición**

```ts
const rejected = await assistantDraftsApi.reject("6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14", draft.id, draft.revision);
```

```http
POST /api/backend/conversations/6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14/assistant-drafts/a1c3e5f7-9b2d-4f6a-8c0e-1d3f5a7b9c2e/reject
Content-Type: application/json

{"revision":1}
```

**Respuesta** (200; otro borrador, rechazado por un ADMIN)

```json
{
  "id": "a1c3e5f7-9b2d-4f6a-8c0e-1d3f5a7b9c2e",
  "conversationId": "6f1c2a4e-8b7d-4c1e-9a3f-2d5e7b9c0a14",
  "sourceMessageId": "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f5a",
  "baselineSequence": 9,
  "idempotencyKey": "7b1d3f5a-9c2e-4b6d-8f0a-2c4e6a8b0d1f",
  "createdById": "2e4a6c8e-0b2d-4f6a-8c1e-3a5c7e9b1d3f",
  "reviewedById": "2e4a6c8e-0b2d-4f6a-8c1e-3a5c7e9b1d3f",
  "editedById": null,
  "status": "REJECTED",
  "revision": 1,
  "model": "gpt-6-luna",
  "promptVersion": "samanta-drafts-v1",
  "knowledgeHash": "3f9a1c7e5b2d4f6081a3c5e7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f7a9c1e3b5d7",
  "originalContent": "¡Hola! Gracias por escribirnos. ¿Para qué fecha y cuántas personas deseas la reserva?",
  "content": "¡Hola! Gracias por escribirnos. ¿Para qué fecha y cuántas personas deseas la reserva?",
  "intent": "RESERVATION",
  "requiresHuman": true,
  "missingFields": ["fecha", "personas"],
  "inputTokens": 1984,
  "outputTokens": 41,
  "errorCode": null,
  "generationExpiresAt": "2026-11-03T03:05:41.330Z",
  "expiresAt": "2026-11-03T03:20:11.330Z",
  "reviewedAt": "2026-11-03T03:06:02.904Z",
  "outboundMessageId": null,
  "createdAt": "2026-11-03T03:05:11.337Z",
  "updatedAt": "2026-11-03T03:06:02.907Z"
}
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` (`SESSION_EXPIRED`) · `Inicia sesión para continuar.` (`NO_SESSION`) | Lo responde el BFF: no hay una sesión válida. |
| 403 | `No tienes permisos para realizar esta acción` | El usuario no tiene ADMIN ni OPERATOR (p. ej. OWNER o SUPPORT). |
| 400 | `property <campo> should not exist` | Campos extra. |
| 400 | `revision must not be greater than 2147483646` · `revision must not be less than 1` · `revision must be an integer number` | `revision` falta, es `null` o viene como texto (los tres); es 0 o negativa; es decimal; supera el tope. |
| 400 | `Validation failed (uuid is expected)` | `:id` o `:draftId` no es un UUID. |
| 404 | `Conversación no encontrada` | La conversación no existe. |
| 403 | `Conversación asignada a otro operador` | Un OPERATOR sin ADMIN actúa sobre una conversación asignada a otra persona. |
| 404 | `Borrador no encontrado` | El borrador no existe o es de otra conversación. |
| 409 | `El borrador cambió; vuelve a revisarlo` | `revision` no es la actual. Se comprueba antes que el estado. |
| 409 | `Borrador desactualizado o fallido; genera uno nuevo` | El borrador está `STALE` o `FAILED`, o pasa a uno de esos estados en esta llamada (mensaje nuevo, pausa, vencimiento). No comprueba la información comercial. |
| 409 | `El borrador no está disponible para revisión` | El borrador está `GENERATING` o `APPROVED`, o ya lo rechazó otra persona. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención en la base de datos. Reintenta. |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El body supera 100 kb. |
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). `apiFetch` no envía `charset`, así que desde ft-crm no ocurre. |

**Efectos**

- Pasa el borrador a `REJECTED`, con `reviewedById` y `reviewedAt`. Es un estado final.
- No envía nada al cliente.

**Notas para el frontend**

- Funciona aunque Samanta esté desactivada: no responde 503.
- Repetirlo con el mismo usuario y la misma `revision` responde 200 con el mismo borrador.
- No hace falta rechazar para descartar: un borrador sin usar deja de servir con el siguiente mensaje o a los 15 min, y queda `STALE` en la siguiente consulta. Rechazar deja constancia de quién lo descartó.

### Webhooks de Meta (no usar desde el frontend)
`GET /webhooks/whatsapp` · `POST /webhooks/whatsapp` · `GET /webhooks/messenger` · `POST /webhooks/messenger`

Los llama Meta, directo a bk-crm, para verificar la suscripción y para entregar mensajes y recibos. El frontend nunca los usa: el BFF responde 404 `Ruta no disponible.` a `/api/backend/webhooks/*`. Se documentan para entender qué llega a la Bandeja y cuándo. Para el frontend, su efecto visible son conversaciones, mensajes y cambios de estado nuevos en el siguiente polling.

#### Verificar el webhook de WhatsApp
`GET /webhooks/whatsapp`

| | |
|---|---|
| Roles | Pública: la llama Meta, sin JWT |
| Respuesta | 200 · texto plano con el valor de `hub.challenge` (`Content-Type: text/plain; charset=utf-8`) |
| ft-crm | No se usa desde el navegador: el BFF bloquea `/webhooks/*`. |
| Caché | — (no cambia datos) |

**Query**

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `hub.mode` | string | Sí | — | Debe ser `subscribe`. |
| `hub.verify_token` | string | Sí | — | Igual a `WHATSAPP_VERIFY_TOKEN` del servidor. |
| `hub.challenge` | string | Sí | — | No vacío. Se devuelve tal cual. |

**Ejemplo de petición**

```http
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=1158201444
```

**Respuesta**

```text
1158201444
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 503 | `WhatsApp no está habilitado` | `WHATSAPP_ENABLED` no es `true`. Se comprueba primero. |
| 403 | `Verificación inválida` | `hub.mode` distinto de `subscribe`, token distinto, o `hub.challenge` vacío, ausente o repetido. |

El cuerpo de estos errores es el JSON habitual (`statusCode`, `message`, `error`), pero llega con `Content-Type: text/plain; charset=utf-8`: Nest pone la cabecera de la ruta antes de ejecutarla y `res.json` no la reemplaza.

**Efectos**

Ninguno.

#### Recibir eventos de WhatsApp
`POST /webhooks/whatsapp`

| | |
|---|---|
| Roles | Pública: la llama Meta, autenticada por la firma |
| Respuesta | 200 · `MetaWebhookAck` |
| ft-crm | No se usa desde el navegador: el BFF bloquea `/webhooks/*`. |
| Caché | Ninguna directa: lo que guarda aparece en el siguiente polling de `qk.conversations(query)`, `qk.conversation(id)` y `qk.messages(id)`. |

**Cabeceras**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `X-Hub-Signature-256` | string | Sí | `sha256=` y 64 caracteres hexadecimales: HMAC-SHA256 del cuerpo crudo con `META_APP_SECRET`. |
| `Content-Type` | string | Sí | `application/json`, que es lo que envía Meta. Con otro tipo, el evento no se procesa. |

**Body** (solo los campos que lee bk-crm; el resto se ignora)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `object` | string | Sí | Solo se procesa `whatsapp_business_account`. |
| `entry[].id` | string | Sí | Tiene que ser `WHATSAPP_BUSINESS_ACCOUNT_ID`; si no, la entrada se ignora. |
| `entry[].changes[].field` | string | Sí | Solo se procesa `messages`. |
| `entry[].changes[].value.metadata.phone_number_id` | string | Sí | Tiene que ser `WHATSAPP_PHONE_NUMBER_ID`. |
| `…value.messages[]` | array | No | `from`: teléfono internacional sin `+` (7 a 15 dígitos, sin 0 inicial). `id`: wamid, hasta 255 caracteres. `timestamp`: segundos Unix, como mucho 60 s en el futuro. `type`. `text.body`: hasta 16 000 caracteres. `image` y `document`: `id`, `mime_type`, `filename` y `caption`. |
| `…value.statuses[]` | array | No | `id` (wamid de un saliente), `status` (`sent`, `delivered`, `read` o `failed`; los demás se ignoran) y `timestamp`. |

**Ejemplo de petición**

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "102938475610293",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "display_phone_number": "51911222333", "phone_number_id": "109876543210987" },
            "messages": [
              {
                "from": "51987654321",
                "id": "wamid.HBgLNTE5ODc2NTQzMjEVAgASGBQzQUI3RjY0QjE4QzJEMUE5NzUwNAA=",
                "timestamp": "1793673129",
                "type": "text",
                "text": { "body": "¿Tienen mesa para 4 personas este sábado a las 8 pm?" }
              }
            ],
            "statuses": [
              {
                "id": "wamid.HBgLNTE5ODc2NTQzMjEVAgARGBI5QTNDQTVCM0Q0Q0Q2RTY3RTcA",
                "status": "delivered",
                "timestamp": "1793672953",
                "recipient_id": "51987654321"
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Respuesta**

```json
{ "received": true }
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El cuerpo supera 100 kb. |
| 400 | Texto del parser de JSON | El cuerpo no es JSON válido. Lo rechaza el parser, antes que la firma. |
| 503 | `WhatsApp no está habilitado` | `WHATSAPP_ENABLED` no es `true`. |
| 403 | `Firma inválida` | Falta la firma, no tiene el formato o no coincide con los bytes recibidos. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención al guardar. Meta reintenta la entrega. |
| 500 | `Ocurrió un error interno` | Falla la base de datos u otro error no controlado. El evento no se confirma y Meta lo reintenta. |

**Efectos**

- Por cada mensaje:
  - busca o crea el cliente por teléfono (`+<from>`). Si el teléfono ya era de un cliente, usa ese cliente y actualiza su `lastContactAt`;
  - crea la conversación `WHATSAPP` del cliente si no existe;
  - guarda el `INBOUND` en `RECEIVED` con su entrada en la cola, suma 1 a la secuencia y actualiza `lastMessageAt`.
- `text` se guarda como `TEXT`; `image` como `IMAGE` y `document` como `FILE`, con la metadata en `attachments` y el pie en `content`; cualquier otro tipo, como `OTHER` con `[Mensaje de WhatsApp no compatible todavía]`.
- Un wamid repetido no se duplica ni toca el cliente.
- Los recibos se guardan y el worker los aplica cada 2 s ([Estados y transiciones](#estados-y-transiciones-3)). Si el mensaje aún no llegó a `SENT`, el recibo se vuelve a mirar cada 60 s.
- Se ignoran, con 200: otro `object`, otra cuenta, otro número u otro `field`.
- Quedan en cuarentena (solo se guarda una huella, con el código `WHATSAPP_EVENT_INVALID`), también con 200: eventos mal formados, fechas futuras, un `from` que `libphonenumber` no reconoce como teléfono válido y un wamid ya guardado con otro teléfono. Ese mensaje no llega a la Bandeja.
- No guarda el nombre de perfil del cliente: un cliente nuevo de WhatsApp queda sin nombre.

**Notas para el frontend**

- Un cliente nuevo de WhatsApp llega sin nombre: muestra su teléfono hasta que alguien lo edite en Clientes.
- La entrega y la lectura de los salientes llegan por esta ruta, así que tardan lo que tarde Meta en enviarlas, más el ciclo de 2 s del worker.

#### Verificar el webhook de Messenger
`GET /webhooks/messenger`

| | |
|---|---|
| Roles | Pública: la llama Meta, sin JWT |
| Respuesta | 200 · texto plano con el valor de `hub.challenge` (`Content-Type: text/plain; charset=utf-8`) |
| ft-crm | No se usa desde el navegador: el BFF bloquea `/webhooks/*`. |
| Caché | — (no cambia datos) |

**Query**

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `hub.mode` | string | Sí | — | Debe ser `subscribe`. |
| `hub.verify_token` | string | Sí | — | Igual a `MESSENGER_VERIFY_TOKEN` del servidor. |
| `hub.challenge` | string | Sí | — | No vacío. Se devuelve tal cual. |

**Ejemplo de petición**

```http
GET /webhooks/messenger?hub.mode=subscribe&hub.verify_token=<MESSENGER_VERIFY_TOKEN>&hub.challenge=8837419920
```

**Respuesta**

```text
8837419920
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 503 | `Messenger no está habilitado` | `MESSENGER_ENABLED` no es `true`. Se comprueba primero. |
| 403 | `Verificación inválida` | `hub.mode` distinto de `subscribe`, token distinto, o `hub.challenge` vacío, ausente o repetido. |

Como en WhatsApp, el cuerpo de estos errores es JSON pero llega con `Content-Type: text/plain; charset=utf-8`.

**Efectos**

Ninguno.

#### Recibir eventos de Messenger
`POST /webhooks/messenger`

| | |
|---|---|
| Roles | Pública: la llama Meta, autenticada por la firma |
| Respuesta | 200 · `MetaWebhookAck` |
| ft-crm | No se usa desde el navegador: el BFF bloquea `/webhooks/*`. |
| Caché | Ninguna directa: lo que guarda aparece en el siguiente polling de `qk.conversations(query)`, `qk.conversation(id)` y `qk.messages(id)`. |

**Cabeceras**

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `X-Hub-Signature-256` | string | Sí | `sha256=` y 64 caracteres hexadecimales: HMAC-SHA256 del cuerpo crudo con `META_APP_SECRET`. |
| `Content-Type` | string | Sí | `application/json`, que es lo que envía Meta. Con otro tipo, el evento no se procesa. |

**Body** (solo los campos que lee bk-crm; el resto se ignora)

| Campo | Tipo | Obligatorio | Reglas |
|---|---|---|---|
| `object` | string | Sí | Solo se procesa `page` (Instagram y otros se ignoran). |
| `entry[].id` | string | Sí | Tiene que ser `MESSENGER_PAGE_ID`. |
| `entry[].messaging[].recipient.id` | string | Sí | Tiene que ser la página; si no, el evento se ignora. |
| `entry[].messaging[].sender.id` | string | Sí | PSID numérico del cliente, de hasta 80 dígitos. Si es la propia página, se ignora. |
| `…timestamp` | number | Sí en los mensajes | Milisegundos Unix, como mucho 60 s en el futuro. En una entrega puede faltar si trae `watermark`. |
| `…message` | object | No | `mid` (hasta 255 caracteres) y `text` (hasta 16 000). Se ignoran los ecos (`is_echo`), los borrados (`is_deleted`) y los no soportados (`is_unsupported`). |
| `…delivery` | object | No | `mids` y `watermark` (milisegundos); los dos son opcionales. |

**Ejemplo de petición**

```json
{
  "object": "page",
  "entry": [
    {
      "id": "100200300400500",
      "time": 1793673312004,
      "messaging": [
        {
          "sender": { "id": "7329184650123987" },
          "recipient": { "id": "100200300400500" },
          "timestamp": 1793671123950,
          "message": { "mid": "m_Aq3xV9pL2kR7tY1uZ8wB4cD6eF0gH5jK", "text": "¿Hasta qué hora atienden el feriado?" }
        },
        {
          "sender": { "id": "7329184650123987" },
          "recipient": { "id": "100200300400500" },
          "timestamp": 1793673312000,
          "delivery": { "mids": ["m_Ht5yU2iO8pA4sD6fG1hJ3kL9zX7cV0bN"], "watermark": 1793673311400 }
        }
      ]
    }
  ]
}
```

**Respuesta**

```json
{ "received": true }
```

**Errores**

| Código | Mensaje exacto | Cuándo |
|---|---|---|
| 415 | `unsupported charset "<CHARSET>"` | `Content-Type` con un charset que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion). |
| 413 | `El cuerpo de la petición supera el tamaño máximo permitido` | El cuerpo supera 100 kb. |
| 400 | Texto del parser de JSON | El cuerpo no es JSON válido. Lo rechaza el parser, antes que la firma. |
| 503 | `Messenger no está habilitado` | `MESSENGER_ENABLED` no es `true`. |
| 403 | `Firma inválida` | Falta la firma, no tiene el formato o no coincide con los bytes recibidos. |
| 409 | `Conflicto de mensajería; vuelve a intentarlo` | Contención al guardar. Meta reintenta la entrega. |
| 500 | `Ocurrió un error interno` | Falla la base de datos u otro error no controlado. El evento no se confirma y Meta lo reintenta. |

**Efectos**

- Por cada mensaje:
  - busca o crea el cliente por página y PSID. Nunca lo mezcla con un cliente de teléfono o email, y no le inventa `phone` ni `email`. Si ya existía, actualiza su `lastContactAt`;
  - crea la conversación `FACEBOOK` del cliente si no existe y guarda el `INBOUND` (`TEXT` si trae `text`; si solo trae adjuntos, `OTHER` con `[Adjunto de Messenger no compatible todavía]`).
- **Nombre automático:** para los clientes sin `firstName` ni `lastName`, bk-crm pide a Meta el remitente del mensaje recién guardado y guarda su nombre en `firstName` (hasta 100 caracteres; `lastName` queda `null`).
  - Nunca sobrescribe un nombre puesto en el CRM.
  - Hace como mucho 3 consultas por webhook, en paralelo, de hasta 2 s cada una, después de guardar los mensajes.
  - Si Meta no da el nombre o da uno genérico («Facebook User», «Usuario de Facebook»), queda `null` y se vuelve a intentar con el siguiente mensaje del cliente. Si la consulta falla, el log registra `MESSENGER_NAME_LOOKUP_FAILED`, sin el PSID ni el nombre.
- **Entregas:** marca `DELIVERED` los `mids` listados y, con `watermark`, las respuestas `SENT` a ese cliente cuyo `sentAt` no pasa de `watermark` + 2 s. `deliveredAt` es la hora del evento, o el `watermark` si el evento no trae una hora válida o es anterior a él. En las respuestas confirmadas solo por `watermark`, nunca es anterior a su `sentAt`.
- Se ignoran, con 200: lecturas (`read`), postbacks, eventos `standby` y otras páginas.
- Quedan en cuarentena (código `MESSENGER_EVENT_INVALID`), también con 200: eventos mal formados, ids no numéricos, fechas futuras y un `mid` ya guardado con otro remitente.

**Notas para el frontend**

- Messenger v1 no informa lecturas: el último estado posible de un saliente es `DELIVERED`.
- El nombre del cliente puede aparecer un instante después de su mensaje, porque la consulta a Meta se hace después de guardarlo.

### Modelos

#### Conversation

Respuesta de cada fila de `GET /conversations`, de `GET /conversations/:id` y de `PATCH /conversations/:id/assistant` y `/assignee` (`conversationSelect` y `conversationResponse` en `src/messaging/messaging.select.ts`).

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id de la conversación. |
| `customerId` | `Uuid` | No | Cliente. Hay una sola conversación por cliente y canal. |
| `channel` | `ContactChannel` | No | Canal. Messenger es `FACEBOOK`. Hoy solo se crean conversaciones al llegar un mensaje de WhatsApp o Messenger. |
| `isAssistantPaused` | boolean | No | `true`: no se pueden generar ni usar borradores de Samanta. Por defecto, `false`. |
| `assignedUserId` | `Uuid` | Sí | Responsable. `null`: conversación libre. |
| `lastMessageAt` | `IsoDateTime` | Sí | Hora de llegada (del servidor) del último `INBOUND` o de encolado del último `OUTBOUND`. Ordena la bandeja. `null` si la conversación no tiene mensajes. |
| `createdAt` | `IsoDateTime` | No | Creación: el primer mensaje del cliente por ese canal. |
| `updatedAt` | `IsoDateTime` | No | Última escritura: mensaje nuevo, pausa o asignación. Marcar como leído no lo cambia. |
| `customer` | `ConversationCustomer` | No | Datos básicos del cliente. |
| `assignedUser` | `ConversationAssignedUser` | Sí | Responsable; `null` si no hay. |
| `unreadCount` | number | No | `INBOUND` con `readAt = null`. Es del equipo, no de cada usuario. |

No se exponen `externalConversationId` ni `lastSequence`.

#### ConversationCustomer (`Conversation.customer`)

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del cliente (para `GET /customers/:id`). |
| `firstName` | string | Sí | Nombre. Cliente nuevo de WhatsApp: `null` hasta que alguien lo edite en Clientes (si el teléfono ya era de un cliente, trae el nombre que tenía). Messenger: el nombre visible que da Meta, completo, si lo da. |
| `lastName` | string | Sí | Apellido. Messenger nunca lo completa solo. |
| `phone` | string | Sí | Teléfono tal como se guardó (WhatsApp: `+51987654321`). Messenger: `null`, salvo que alguien lo agregue en Clientes. |
| `email` | string | Sí | Correo. `null` en los clientes creados por WhatsApp o Messenger, salvo que alguien lo agregue. |

No incluye el canal de origen, el estado ni las notas (están en `GET /customers/:id`). El identificador de Messenger (PSID) no se expone en ninguna ruta.

#### ConversationAssignedUser (`Conversation.assignedUser`)

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del usuario. |
| `firstName` | string | No | Nombre. |
| `lastName` | string | No | Apellido. |
| `isActive` | boolean | No | El usuario está activo. |
| `isEligible` | boolean | No | Está activo y tiene rol ADMIN u OPERATOR. `false`: conviene reasignar. |

#### Message

Respuesta de cada fila de `GET /conversations/:id/messages` y de `POST /conversations/:id/messages` (`messageSelect`).

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del mensaje. |
| `conversationId` | `Uuid` | No | Conversación. |
| `channel` | `ContactChannel` | No | Canal de la conversación. |
| `sequence` | number | No | Correlativo por conversación desde 1: orden real del chat. |
| `externalMessageId` | string | Sí | wamid (WhatsApp) o mid (Messenger). `INBOUND`: siempre viene. `OUTBOUND`: desde `SENT`. |
| `direction` | `MessageDirection` | No | `INBOUND` (cliente → CRM) u `OUTBOUND` (CRM → cliente). |
| `status` | `MessageStatus` | No | Ver [Estados y transiciones](#estados-y-transiciones-3). |
| `type` | `MessageType` | No | `TEXT`, `IMAGE`, `FILE` u `OTHER`. Los salientes siempre son `TEXT`. |
| `content` | string | Sí | Texto. `null` solo en `IMAGE` o `FILE` sin pie de foto. |
| `authorUserId` | `Uuid` | Sí | `INBOUND`: `null`. `OUTBOUND`: quien envió o aprobó el borrador; nunca `null`. |
| `occurredAt` | `IsoDateTime` | Sí | `INBOUND`: hora que informa Meta. `OUTBOUND`: `null`. |
| `receivedAt` | `IsoDateTime` | Sí | `INBOUND`: llegada a bk-crm. `OUTBOUND`: `null`. |
| `processedAt` | `IsoDateTime` | Sí | `INBOUND` en `PROCESSED`: fin del procesamiento. |
| `sentAt` | `IsoDateTime` | Sí | `OUTBOUND`: Meta aceptó el envío. |
| `deliveredAt` | `IsoDateTime` | Sí | `OUTBOUND`: entregado. |
| `providerReadAt` | `IsoDateTime` | Sí | `OUTBOUND` de WhatsApp: leído por el cliente. |
| `failedAt` | `IsoDateTime` | Sí | Momento del fallo (`FAILED`). |
| `readAt` | `IsoDateTime` | Sí | `INBOUND`: leído por el equipo en el CRM. `OUTBOUND`: siempre `null`. |
| `errorCode` | `MessageErrorCode` | Sí | Motivo del estado. Ver [Estados y transiciones](#estados-y-transiciones-3). |
| `createdAt` | `IsoDateTime` | No | Creación del registro. |
| `updatedAt` | `IsoDateTime` | No | Cambia con cada cambio de estado, de `errorCode` o de `readAt`. |
| `attachments` | `MessageAttachment[]` | No | Metadata de adjuntos, por `id` ascendente. Vacío salvo en `IMAGE` y `FILE`. |

No se exponen la clave de idempotencia, el destinatario, la cuenta del negocio, los intentos de envío ni el motivo interno del error.

#### MessageAttachment

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del adjunto. |
| `type` | `"IMAGE" \| "FILE" \| "OTHER"` | No | Hoy solo llegan `IMAGE` (foto) y `FILE` (documento), por WhatsApp. |
| `fileName` | string | Sí | Nombre del documento, si Meta lo da. |
| `mimeType` | string | Sí | Tipo MIME, si Meta lo da. |
| `sizeBytes` | number | Sí | Tamaño. WhatsApp no lo envía: `null`. |
| `externalMediaId` | string | Sí | Id del archivo en Meta. En WhatsApp siempre viene. |
| `url` | string | Sí | URL del archivo. WhatsApp no la envía: `null`. |
| `createdAt` | `IsoDateTime` | No | Creación. |

#### MarkConversationReadResponse

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `updated` | number | No | `INBOUND` marcados en esta llamada (0 si ya estaban leídos). |
| `throughMessageId` | `Uuid` | No | El mismo id que se envió. |

#### SamantaDraft

Respuesta de todas las rutas de borradores: la fila completa del borrador.

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `id` | `Uuid` | No | Id del borrador. |
| `conversationId` | `Uuid` | No | Conversación (siempre `WHATSAPP`). |
| `sourceMessageId` | `Uuid` | No | Mensaje `INBOUND` al que responde. |
| `baselineSequence` | number | No | `sequence` del último mensaje al generar. Si llega otro, el borrador queda desactualizado. |
| `idempotencyKey` | string | No | Clave usada al generar. |
| `createdById` | `Uuid` | No | Quien pidió la generación. |
| `reviewedById` | `Uuid` | Sí | Quien aprobó o rechazó. |
| `editedById` | `Uuid` | Sí | Último usuario que editó el texto. |
| `status` | `SamantaDraftStatus` | No | Ver [Estados y transiciones](#estados-y-transiciones-3). |
| `revision` | number | No | Empieza en 1 y suma 1 con cada edición. |
| `model` | string | No | Modelo de IA (`SAMANTA_MODEL`; por defecto, `gpt-6-luna`). |
| `promptVersion` | string | No | Versión del prompt (`samanta-drafts-v1`). |
| `knowledgeHash` | string | No | SHA-256 (hex) de la configuración y el catálogo usados. Si cambian, el borrador queda `STALE` al editar o aprobar. |
| `originalContent` | string | Sí | Texto que dio la IA. `null` mientras está `GENERATING`, si falló, o si quedó `STALE` durante la generación por un mensaje nuevo, una pausa o el vencimiento. |
| `content` | string | Sí | Texto actual (el editado, si se editó). Mismos casos de `null`. Nunca es `null` en `READY` ni en `APPROVED`. |
| `intent` | `SamantaIntent` | Sí | Intención detectada. Se guarda junto con el texto de la IA: es `null` en los mismos casos que `originalContent`, aunque la IA haya respondido. |
| `requiresHuman` | boolean | No | `true` por defecto. Toma el valor de la IA solo cuando se guarda su texto; si no, se queda en `true`. No se recalcula al editar. |
| `missingFields` | string[] | No | Datos que faltan, en texto libre (hasta 8, de hasta 80 caracteres). `[]` mientras no se guarde el texto de la IA. |
| `inputTokens` | number | Sí | Tokens de entrada. `null` si la IA no respondió. Si respondió, se guardan aunque el texto se descarte (`STALE` o `FAILED`). |
| `outputTokens` | number | Sí | Tokens de salida. `null` si la IA no respondió. |
| `errorCode` | `SamantaErrorCode` | Sí | Solo en `FAILED`. |
| `generationExpiresAt` | `IsoDateTime` | No | Inicio + `SAMANTA_TIMEOUT_MS` + 10 s. Después, un `GENERATING` pasa a `FAILED`. |
| `expiresAt` | `IsoDateTime` | No | Inicio + 15 min. Después, un `READY` pasa a `STALE`. |
| `reviewedAt` | `IsoDateTime` | Sí | Momento de la aprobación o el rechazo. |
| `outboundMessageId` | `Uuid` | Sí | Mensaje creado al aprobar. Siempre presente en `APPROVED`, y solo en ese estado. |
| `createdAt` | `IsoDateTime` | No | Creación. |
| `updatedAt` | `IsoDateTime` | No | Último cambio. |

#### SamantaDraftListResponse

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `data` | `SamantaDraft[]` | No | Hasta 50 borradores, los más recientes primero. |

#### MetaWebhookAck

| Campo | Tipo | Null | Significado |
|---|---|---|---|
| `received` | `true` | No | Siempre `true`: Meta da el evento por entregado. |

### Estados y transiciones

#### Mensajes entrantes (`direction: "INBOUND"`)

Ninguna ruta cambia estos estados: los mueve el worker de procesamiento (necesita `MESSAGING_ENABLED=true`). En v1, el procesamiento solo valida el mensaje: no responde ni crea nada.

| Estado | Significado | Pasa a |
|---|---|---|
| `RECEIVED` | Guardado; espera al worker. Con `errorCode` `MESSAGE_PROCESSING_TEMPORARY`, el intento anterior falló y se reintentará tras una espera que empieza en 1 s, se duplica y llega como mucho a 60 s. | `PROCESSING` |
| `PROCESSING` | Un worker lo está procesando. En un reintento conserva `MESSAGE_PROCESSING_TEMPORARY` hasta terminar. | `PROCESSED` (borra `errorCode`), `RECEIVED` (fallo temporal) o `FAILED` |
| `PROCESSED` | Final. `processedAt` tiene la hora. | — |
| `FAILED` | Final. `errorCode`: `MESSAGE_INVALID` (no pasó la validación) o `MESSAGE_ATTEMPTS_EXHAUSTED` (5 intentos agotados). | — |

`readAt` es independiente del estado: lo pone [Marcar como leído](#marcar-como-leído-hasta-un-mensaje).

#### Mensajes salientes (`direction: "OUTBOUND"`)

Se crean en `QUEUED` con [Enviar un mensaje](#enviar-un-mensaje-de-texto) o con [Aprobar un borrador](#aprobar-un-borrador-y-encolar-el-envío) (ADMIN u OPERATOR). Después solo los mueve el sistema: el worker de envío y los recibos de Meta. No hay ruta para reintentar, cancelar ni cambiar el estado de un mensaje.

| Estado | Significado | Pasa a |
|---|---|---|
| `QUEUED` | En cola. Con `*_RATE_LIMITED`, Meta respondió 429 y se reintentará tras la mayor de dos esperas: la que pidió Meta y una que crece desde 1 s con cada intento. Si su canal está apagado, se queda aquí hasta que se encienda. | `SENDING`; `FAILED` con `*_SEND_INVALID` o `*_WINDOW_CLOSED` |
| `SENDING` | Un worker está llamando a Meta. En un reintento conserva el `*_RATE_LIMITED` anterior hasta terminar. | `SENT` (borra `errorCode`); `QUEUED` (429, hasta 5 intentos); `UNKNOWN`; `FAILED` con `*_SEND_REJECTED` |
| `SENT` | Meta lo aceptó: hay `externalMessageId` y `sentAt`. | `DELIVERED`, `READ` (WhatsApp) o `FAILED` con `*_DELIVERY_FAILED` |
| `DELIVERED` | Meta confirmó la entrega. | `READ` (WhatsApp) |
| `READ` | Final. El cliente lo leyó (solo WhatsApp). | — |
| `UNKNOWN` | Envío incierto: timeout, error de red, HTTP 5xx o 408, respuesta sin id, o el worker se cayó durante el envío. Meta pudo recibirlo. Nunca se reenvía solo. | `SENT` o `FAILED`, solo si llega tarde la respuesta del mismo intento |
| `FAILED` | No se envió o no se entregó; `errorCode` dice por qué. | `DELIVERED` o `READ` si después llega un recibo de entrega o lectura |

Reglas de los recibos de Meta:
- `READ` nunca retrocede.
- `DELIVERED` y `READ` prevalecen sobre `FAILED`, pero un recibo `sent` tardío no deshace un `FAILED`.
- Un recibo que llega antes de que el mensaje esté `SENT` espera y se vuelve a revisar cada 60 s.
- Las fechas (`sentAt`, `deliveredAt`, `providerReadAt`, `failedAt`) conservan la más temprana entre los recibos.

`errorCode` de los salientes (con prefijo `WHATSAPP_` o `MESSENGER_`):

| Código | Estado | Significado | Texto sugerido |
|---|---|---|---|
| `*_RATE_LIMITED` | `QUEUED` o `SENDING` | Meta limitó el envío (429); hay un reintento programado o en curso. | «Reintentando…» |
| `*_SEND_UNKNOWN` | `UNKNOWN` | No se sabe si Meta lo recibió. | «Estado incierto: verifica antes de reenviar» |
| `*_SEND_INVALID` | `FAILED` | No se podía enviar: sin destinatario, texto vacío o más largo que el tope, cambió el número o la página del negocio, o intentos agotados. | «No se envió» |
| `*_WINDOW_CLOSED` | `FAILED` | La ventana de 24 h se cerró antes de enviar. | «No se envió: pasaron más de 24 h desde el último mensaje del cliente» |
| `*_SEND_REJECTED` | `FAILED` | Meta lo rechazó (4xx) o siguió limitando tras 5 intentos. | «No se envió: el canal lo rechazó» |
| `*_DELIVERY_FAILED` | `FAILED` | Meta lo aceptó, pero después informó que no pudo entregarlo. | «No se pudo entregar» |

#### Conversación: pausa y responsable

| Dato | Valores | Cómo cambia | Quién | Error si no se permite |
|---|---|---|---|---|
| `isAssistantPaused` | `false` (por defecto) o `true`, en cualquier dirección | [`PATCH /conversations/:id/assistant`](#pausar-o-reanudar-a-samanta-en-la-conversación) | ADMIN, OPERATOR | 403 `No tienes permisos para realizar esta acción` (OWNER, SUPPORT) |
| `assignedUserId` | `null` (libre) o el id de un usuario elegible | [`PATCH /conversations/:id/assignee`](#asignar-tomar-o-liberar-una-conversación) | ADMIN: cualquier cambio. OPERATOR: tomar una libre o liberar la suya | 403 `Solo puedes tomar conversaciones libres o desasignarte de las propias`; 404 `Usuario no encontrado`; 400 `Responsable no elegible` |

No hay cambios automáticos: ni los mensajes ni Samanta tocan la pausa o el responsable. Si el responsable se desactiva o pierde sus roles, sigue asignado con `isEligible: false`.

#### Borradores de Samanta (`SamantaDraft.status`)

| Estado | Significado | ¿Final? | Qué mostrar |
|---|---|---|---|
| `GENERATING` | La IA está generando. | No | Indicador de carga y polling del borrador. |
| `READY` | Texto listo para editar, aprobar o rechazar. | No | Texto editable, `intent`, aviso de `requiresHuman`, `missingFields` y cuenta atrás hasta `expiresAt`. |
| `APPROVED` | Aprobado: se encoló el mensaje `outboundMessageId`. | Sí | «Enviado a la cola», con el estado del mensaje `outboundMessageId`. |
| `REJECTED` | Descartado por una persona. | Sí | «Descartado». |
| `STALE` | Desactualizado: llegó otro mensaje, se pausó a Samanta, venció o cambió la información comercial. | Sí | «Desactualizado», con la opción de generar otro. |
| `FAILED` | La generación falló o quedó abandonada (`errorCode`). | Sí | «No se pudo generar», con la opción de generar otro. |

| Desde | Hacia | Cuándo | Quién |
|---|---|---|---|
| — | `GENERATING` | [Generar](#generar-un-borrador-con-samanta) crea el borrador antes de llamar a la IA. | ADMIN u OPERATOR (no asignado a otra persona) |
| `GENERATING` | `READY` | La IA da un texto válido y la información comercial no cambió. | Sistema, en la misma petición |
| `GENERATING` | `STALE` | Al terminar o al consultarlo: llegó otro mensaje, Samanta está en pausa o venció `expiresAt`. Al terminar, además, si cambió la información comercial. | Sistema |
| `GENERATING` | `FAILED` | La IA falló (`AI_*`), o se consulta o actúa después de `generationExpiresAt` (`AI_GENERATION_EXPIRED`). | Sistema |
| `READY` | `READY` (`revision` + 1) | [Editar](#editar-un-borrador). | ADMIN u OPERATOR (no asignado a otra persona) |
| `READY` | `APPROVED` | [Aprobar](#aprobar-un-borrador-y-encolar-el-envío). | ADMIN u OPERATOR (no asignado a otra persona) |
| `READY` | `REJECTED` | [Rechazar](#rechazar-un-borrador). | ADMIN u OPERATOR (no asignado a otra persona) |
| `READY` | `STALE` | Al consultarlo o actuar: llegó otro mensaje (de cualquier dirección), Samanta está en pausa o venció `expiresAt`. Al editar o aprobar, además, si cambió la información comercial. | Sistema |

Los cambios del sistema no ocurren en segundo plano: se calculan y se guardan cuando alguien consulta el borrador (lista o detalle) o actúa sobre él. Mientras tanto, un borrador que todavía dice `READY` ya no se puede usar si la página 1 del historial tiene un `sequence` mayor que `baselineSequence`, si `isAssistantPaused` es `true` o si pasó `expiresAt`.

Errores de una acción no permitida:

| Situación | Error |
|---|---|
| `revision` distinta de la actual (se comprueba antes que el estado) | 409 `El borrador cambió; vuelve a revisarlo` |
| El borrador está `STALE` o `FAILED`, o queda así en esa llamada | 409 `Borrador desactualizado o fallido; genera uno nuevo` |
| Editar, aprobar o rechazar un borrador `GENERATING`, `APPROVED` o `REJECTED` (salvo repetir la misma aprobación o el mismo rechazo con el mismo usuario) | 409 `El borrador no está disponible para revisión` |
| OPERATOR sin ADMIN en una conversación asignada a otra persona | 403 `Conversación asignada a otro operador` |
| Samanta apagada (`SAMANTA_ENABLED` distinto de `true`), al generar, editar o aprobar | 503 `Samanta está desactivada` |

### Preguntas abiertas

Lo que el código no resuelve. Las respuestas dependen del equipo de backend o de producto.

1. **Adjuntos:** solo hay metadata (`externalMediaId`; `url` y `sizeBytes` llegan `null` desde WhatsApp) y no hay endpoint para descargar o previsualizar imágenes y documentos. ¿Está previsto un proxy de medios?
2. **Nombre del autor de los salientes:** solo llega `authorUserId`, y `GET /users` es solo para ADMIN. ¿Se agregará el nombre al mensaje, o un endpoint ligero de usuarios para OPERATOR y OWNER?
3. **Filtro «sin asignar»:** `assignedUserId` solo acepta un UUID. ¿Se necesita un filtro de conversaciones libres?
4. **Vencimiento de la ventana de 24 h:** no se expone (p. ej. un `windowExpiresAt`). El frontend lo estima con el último `INBOUND` cargado, que puede no estar en la página actual. ¿Se agregará a la conversación?
5. **Mensaje individual:** no existe `GET /conversations/:id/messages/:messageId`, útil para seguir el `outboundMessageId` de un borrador aprobado. ¿Se necesita?
6. **Tiempo real:** no hay WebSockets ni SSE, ni límite de peticiones en estas rutas. ¿Son aceptables para el backend los intervalos actuales de ft-crm (6 s la lista, 4 s el chat, 1,5 s con envíos pendientes y una consulta por fila para la vista previa) y los 2 o 3 s sugeridos para un borrador en `GENERATING`? ¿Se planea un canal en tiempo real?
7. **Vista previa del último mensaje:** la lista no la incluye y ft-crm hace una llamada por fila. ¿Se agregará a `GET /conversations`?
8. **Samanta en Messenger:** v1 responde 400 `Samanta v1 admite WhatsApp`. ¿Se habilitará para `FACEBOOK`?
9. **Lecturas en Messenger:** v1 ignora los eventos `read`, así que un saliente de Messenger nunca pasa de `DELIVERED`. ¿Se procesarán?
10. **Mensajes `UNKNOWN`:** la API no permite resolverlos (marcarlos como enviados o no enviados) ni reintentarlos. ¿Se agregará algo para eso?
11. **Estado de las integraciones:** el frontend solo se entera de que WhatsApp, Messenger o Samanta están apagados por el 503 al intentar usarlos. ¿Se expondrá un endpoint de capacidades para ocultar esos botones de antemano?
12. **Cuota de Samanta:** el límite diario es global y no hay forma de consultar cuántas generaciones quedan. ¿Se expondrá?
13. **Nombre en WhatsApp:** bk-crm no guarda un nombre para los clientes nuevos de WhatsApp (el adaptador solo lee el teléfono). ¿Se tomará el nombre del perfil, como en Messenger?
14. **Búsqueda con dígitos:** cualquier dígito del texto activa la búsqueda por teléfono solo con esos dígitos («Mesa 4» encuentra todos los teléfonos con un 4). ¿Es el comportamiento deseado?

### Tipos TypeScript

Bloque autocontenido: compila con `tsc --strict` y repite los tipos compartidos (`Uuid`, `IsoDateTime`, `ContactChannel`, `Pagination`, `Paginated<T>`, `CustomerSummary`) con la misma definición que `ft-crm/src/lib/api/types.ts`. En el frontend, declara los compartidos una sola vez.

Qué cambia respecto de `src/lib/api/types.ts` de ft-crm:
- `ApiErrorBody` usa la forma ampliada de [05](#22-typests): `code` pasa a `BffErrorCode` y se añaden `path`, `method` y `timestamp`, opcionales.
- `Message.errorCode` pasa de `string | null` a `MessageErrorCode | null`, con los códigos que produce el backend.
- `Message.authorUserId`: el comentario «`null` = automático (Samanta)» es incorrecto. Un `OUTBOUND` siempre tiene autor; los de Samanta llevan el de quien aprobó.
- `SendMessageRequest.content` no tiene un único tope de 4096: es 4096 en WhatsApp y 2000 en Messenger, medido con `content.length` (`OUTBOUND_TEXT_MAX_LENGTH`). `OUTBOUND_CONTENT_MAX_LENGTH` (4096) es solo el tope del DTO.
- Son nuevos `InternalErrorResponse`, `SendableChannel`, `SENDABLE_CHANNELS`, `OUTBOUND_TEXT_MAX_LENGTH`, `RESERVED_IDEMPOTENCY_PREFIX`, `IdempotencyHeaders`, los códigos de error de los mensajes y todos los tipos de Samanta y de los webhooks. Este `SENDABLE_CHANNELS` reemplaza al de `src/lib/domain/channels.ts`, que solo incluye `WHATSAPP`.
- `ConversationCustomer`, `ConversationAssignedUser`, `Conversation`, `MessageAttachment`, `ListConversationsQuery`, `ListMessagesQuery`, `MarkConversationReadRequest`, `MarkConversationReadResponse`, `UpdateAssistantPauseRequest` y `AssignConversationRequest` no cambian de forma.

```ts
/* ==========================================================================
 * Bandeja: conversaciones, mensajes (WhatsApp y Messenger), borradores de
 * Samanta y webhooks de Meta. Reflejan las respuestas de bk-crm al 3/11/2026.
 * Fechas: string ISO 8601 en UTC ("2026-11-03T02:32:11.984Z").
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 * Compartidos: misma definición que ft-crm/src/lib/api/types.ts, salvo
 * ApiErrorBody, que usa la forma ampliada del 05 (BffErrorCode y campos del 500).
 * -------------------------------------------------------------------------- */

export type Uuid = string;
export type IsoDateTime = string;

export const CONTACT_CHANNELS = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "WEBSITE", "PHONE", "EMAIL", "OTHER"] as const;
/** Canal de contacto. Messenger se representa como FACEBOOK. */
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  /** Math.ceil(total / limit); 0 cuando total = 0. */
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

/** Límite máximo de `limit` en todos los listados paginados. */
export const MAX_PAGE_SIZE = 100;

/** `code` que añade el BFF de este frontend; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/** Cuerpo de error: `message` es string[] en la validación de DTO y string en los demás casos. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** No viene en el 429 de Samanta, en el 500 ni en los errores que genera el BFF. */
  error?: string;
  /** Solo lo agrega el BFF de ft-crm. */
  code?: BffErrorCode;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  path?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  method?: string;
  /** Solo en el 500 no controlado (ft-crm aún no lo declara). */
  timestamp?: IsoDateTime;
}

/** Error 500 no controlado de bk-crm: trae `path`, `method` y `timestamp` en lugar de `error`. */
export interface InternalErrorResponse {
  statusCode: 500;
  message: "Ocurrió un error interno";
  path: string;
  method: string;
  timestamp: IsoDateTime;
}

/** Cliente embebido en solicitudes, reservas y conversaciones. */
export interface CustomerSummary {
  id: Uuid;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}

/* ----------------------------------------------------------------------------
 * Canales con envío, límites y cabecera de idempotencia
 * -------------------------------------------------------------------------- */

/** Canales en los que bk-crm puede enviar (tienen transporte registrado). */
export type SendableChannel = Extract<ContactChannel, "WHATSAPP" | "FACEBOOK">;
export const SENDABLE_CHANNELS: readonly SendableChannel[] = ["WHATSAPP", "FACEBOOK"];

/** Máximo de `content.length` (unidades UTF-16, igual que String.length) por canal. */
export const OUTBOUND_TEXT_MAX_LENGTH: Readonly<Record<SendableChannel, number>> = {
  WHATSAPP: 4096,
  FACEBOOK: 2000,
};

/** Tope del DTO de envío (cuenta cada emoji como 1). El límite real es OUTBOUND_TEXT_MAX_LENGTH. */
export const OUTBOUND_CONTENT_MAX_LENGTH = 4096;

/** Formato de Idempotency-Key en POST /messages y POST /assistant-drafts. */
export const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

/** Prefijo reservado: el backend usa "samanta-<draftId>" al aprobar un borrador. */
export const RESERVED_IDEMPOTENCY_PREFIX = "samanta-";

/** Cabecera obligatoria de los POST idempotentes del módulo. */
export interface IdempotencyHeaders {
  "Idempotency-Key": string;
}

/* ----------------------------------------------------------------------------
 * Mensajes
 * -------------------------------------------------------------------------- */

/** INBOUND = cliente → CRM; OUTBOUND = CRM → cliente. */
export type MessageDirection = "INBOUND" | "OUTBOUND";

/** Estados de un mensaje entrante (informativos: el contenido se muestra desde RECEIVED). */
export type InboundMessageStatus = "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED";

/** Estados de un mensaje saliente. Flujo normal: QUEUED → SENDING → SENT → DELIVERED → READ. */
export type OutboundMessageStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  /** Solo WhatsApp: Messenger v1 nunca llega a READ. */
  | "READ"
  /** Envío incierto: Meta pudo recibirlo. No se reenvía solo. */
  | "UNKNOWN"
  | "FAILED";

export type MessageStatus = InboundMessageStatus | OutboundMessageStatus;

/** Los salientes siempre son TEXT. IMAGE y FILE solo llegan por WhatsApp. */
export type MessageType = "TEXT" | "IMAGE" | "FILE" | "OTHER";

/** Códigos de `Message.errorCode` en mensajes entrantes. */
export type InboundMessageErrorCode =
  /** RECEIVED (y el PROCESSING del reintento): fallo temporal, el worker reintenta solo. */
  | "MESSAGE_PROCESSING_TEMPORARY"
  /** FAILED: el mensaje no pasó la validación interna. */
  | "MESSAGE_INVALID"
  /** FAILED: se agotaron los 5 intentos de procesamiento. */
  | "MESSAGE_ATTEMPTS_EXHAUSTED";

/**
 * Códigos de `Message.errorCode` en mensajes salientes (prefijo WHATSAPP_ o MESSENGER_).
 * *_RATE_LIMITED aparece en QUEUED y también en el SENDING del reintento.
 */
export type OutboundMessageErrorCode =
  | "WHATSAPP_RATE_LIMITED"
  | "WHATSAPP_SEND_UNKNOWN"
  | "WHATSAPP_SEND_INVALID"
  | "WHATSAPP_WINDOW_CLOSED"
  | "WHATSAPP_SEND_REJECTED"
  | "WHATSAPP_DELIVERY_FAILED"
  | "MESSENGER_RATE_LIMITED"
  | "MESSENGER_SEND_UNKNOWN"
  | "MESSENGER_SEND_INVALID"
  | "MESSENGER_WINDOW_CLOSED"
  | "MESSENGER_SEND_REJECTED"
  | "MESSENGER_DELIVERY_FAILED";

export type MessageErrorCode = InboundMessageErrorCode | OutboundMessageErrorCode;

/** Metadata de un adjunto entrante. No hay endpoint para descargar el archivo. */
export interface MessageAttachment {
  id: Uuid;
  type: "IMAGE" | "FILE" | "OTHER";
  fileName: string | null;
  mimeType: string | null;
  /** null en los adjuntos de WhatsApp. */
  sizeBytes: number | null;
  /** Id del archivo en Meta. */
  externalMediaId: string | null;
  /** null en los adjuntos de WhatsApp. */
  url: string | null;
  createdAt: IsoDateTime;
}

/** Mensaje del historial; también la respuesta 202 de POST /conversations/:id/messages. */
export interface Message {
  id: Uuid;
  conversationId: Uuid;
  channel: ContactChannel;
  /** Correlativo por conversación (1, 2, 3…): orden real del chat y corte de lectura. */
  sequence: number;
  /** wamid (WhatsApp) o mid (Messenger). En OUTBOUND es null hasta SENT. */
  externalMessageId: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  type: MessageType;
  /** null en IMAGE/FILE sin pie de foto. Entrantes: hasta 16 000 caracteres. */
  content: string | null;
  /**
   * INBOUND: siempre null. OUTBOUND: usuario que lo envió o que aprobó el borrador de Samanta.
   * Un OUTBOUND creado por la API nunca tiene autor null.
   */
  authorUserId: Uuid | null;
  /** INBOUND: hora del proveedor. OUTBOUND: null. */
  occurredAt: IsoDateTime | null;
  /** INBOUND: llegada a bk-crm. OUTBOUND: null. */
  receivedAt: IsoDateTime | null;
  /** INBOUND: fin del procesamiento interno. OUTBOUND: null. */
  processedAt: IsoDateTime | null;
  /** OUTBOUND: Meta aceptó el envío. INBOUND: null. */
  sentAt: IsoDateTime | null;
  /** OUTBOUND: recibo de entrega. INBOUND: null. */
  deliveredAt: IsoDateTime | null;
  /** OUTBOUND (solo WhatsApp): el cliente lo leyó. INBOUND: null. */
  providerReadAt: IsoDateTime | null;
  /** Momento del fallo (FAILED). */
  failedAt: IsoDateTime | null;
  /** INBOUND: leído por el equipo en el CRM. OUTBOUND: siempre null. */
  readAt: IsoDateTime | null;
  errorCode: MessageErrorCode | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Ordenados por id ascendente. Vacío en TEXT y en los salientes. */
  attachments: MessageAttachment[];
}

/* ----------------------------------------------------------------------------
 * Conversaciones
 * -------------------------------------------------------------------------- */

/** Cliente de la conversación. En Messenger no hay phone ni email; el nombre puede faltar. */
export interface ConversationCustomer extends CustomerSummary {}

/** Responsable de la conversación. */
export interface ConversationAssignedUser {
  id: Uuid;
  firstName: string;
  lastName: string;
  isActive: boolean;
  /** true si está activo y tiene rol ADMIN u OPERATOR. false: conviene reasignar. */
  isEligible: boolean;
}

/** Misma forma en el listado, el detalle y las respuestas de PATCH /assistant y /assignee. */
export interface Conversation {
  id: Uuid;
  customerId: Uuid;
  channel: ContactChannel;
  /** Samanta pausada: no se pueden generar ni usar borradores. */
  isAssistantPaused: boolean;
  assignedUserId: Uuid | null;
  /** Última actividad: llegada de un INBOUND o encolado de un OUTBOUND. Orden de la bandeja. */
  lastMessageAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  customer: ConversationCustomer;
  assignedUser: ConversationAssignedUser | null;
  /** INBOUND con readAt = null (lectura compartida por el equipo). */
  unreadCount: number;
}

/** Query de GET /conversations. Omite las claves vacías: un parámetro vacío o no declarado da 400. */
export interface ListConversationsQuery {
  /** Entero 1–1 000 000. Por defecto 1. */
  page?: number;
  /** Entero 1–100. Por defecto 50. */
  limit?: number;
  /** Un solo canal. */
  channel?: ContactChannel;
  customerId?: Uuid;
  /** Responsable. No hay filtro de "sin asignar". */
  assignedUserId?: Uuid;
  /** Viaja como "true"/"false". true = al menos un INBOUND sin leer; false no filtra. */
  unreadOnly?: boolean;
  /** Viaja como "true"/"false". */
  isAssistantPaused?: boolean;
  /** 1–200 caracteres tras trim. Nombre, apellido, email y teléfono del cliente; no busca en mensajes. */
  search?: string;
}

/** Query de GET /conversations/:id/messages (orden: sequence descendente). */
export interface ListMessagesQuery {
  /** Entero 1–1 000 000. Por defecto 1 (lo más reciente). */
  page?: number;
  /** Entero 1–100. Por defecto 50. */
  limit?: number;
}

/** Body de POST /conversations/:id/messages (+ IdempotencyHeaders). */
export interface SendMessageRequest {
  type: "TEXT";
  /** Al menos un carácter no blanco. content.length ≤ 4096 en WhatsApp y ≤ 2000 en Messenger. */
  content: string;
}

/** Body de PATCH /conversations/:id/read. */
export interface MarkConversationReadRequest {
  /** Id de un mensaje de la conversación: el más reciente que el usuario vio. */
  throughMessageId: Uuid;
}

/** Respuesta de PATCH /conversations/:id/read. */
export interface MarkConversationReadResponse {
  /** INBOUND marcados en esta llamada (0 si ya estaban leídos). */
  updated: number;
  throughMessageId: Uuid;
}

/** Body de PATCH /conversations/:id/assistant. */
export interface UpdateAssistantPauseRequest {
  /** Booleano JSON real ("true" como texto da 400). */
  paused: boolean;
}

/** Body de PATCH /conversations/:id/assignee. */
export interface AssignConversationRequest {
  /** UUID de un usuario activo ADMIN u OPERATOR, o null para desasignar. Obligatorio. */
  assignedUserId: Uuid | null;
}

/* ----------------------------------------------------------------------------
 * Borradores de Samanta
 * -------------------------------------------------------------------------- */

/** APPROVED, REJECTED, STALE y FAILED son finales. */
export type SamantaDraftStatus = "GENERATING" | "READY" | "APPROVED" | "REJECTED" | "STALE" | "FAILED";

export const SAMANTA_DRAFT_FINAL_STATUSES: readonly SamantaDraftStatus[] = ["APPROVED", "REJECTED", "STALE", "FAILED"];

/** Acciones que admite cada estado (todas exigen la `revision` actual). */
export const SAMANTA_DRAFT_ACTIONS: Readonly<Record<SamantaDraftStatus, readonly ("edit" | "approve" | "reject")[]>> = {
  GENERATING: [],
  READY: ["edit", "approve", "reject"],
  APPROVED: [],
  REJECTED: [],
  STALE: [],
  FAILED: [],
};

/** Intención que detecta la IA. */
export type SamantaIntent = "GENERAL" | "RESERVATION" | "CANCELLATION" | "HUMAN" | "OTHER";

/** Códigos de error de un borrador FAILED. */
export type SamantaErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_REQUEST_REJECTED"
  | "AI_INVALID_RESPONSE"
  | "AI_INCOMPLETE_RESPONSE"
  | "AI_REFUSED_RESPONSE"
  | "AI_RESPONSE_TOO_LARGE"
  | "AI_UNAVAILABLE"
  | "AI_GENERATION_EXPIRED";

/** Máximo de content.length de un borrador (texto de la IA y texto editado). */
export const SAMANTA_DRAFT_MAX_LENGTH = 4096;

/** Body de POST /conversations/:id/assistant-drafts (+ IdempotencyHeaders). */
export interface GenerateSamantaDraftRequest {
  /** Id del último mensaje de la conversación: INBOUND, TEXT, no vacío, content.length ≤ 4096. */
  sourceMessageId: Uuid;
}

/** Body de POST …/approve y POST …/reject. */
export interface ReviewSamantaDraftRequest {
  /** Revisión actual del borrador (entero 1–2 147 483 646). */
  revision: number;
}

/** Body de PATCH /conversations/:id/assistant-drafts/:draftId. */
export interface EditSamantaDraftRequest extends ReviewSamantaDraftRequest {
  /** Al menos un carácter no blanco; content.length ≤ 4096. Se guarda sin recortar. */
  content: string;
}

/** Borrador de Samanta: fila completa que devuelven todas sus rutas. */
export interface SamantaDraft {
  id: Uuid;
  conversationId: Uuid;
  /** Mensaje INBOUND al que responde. */
  sourceMessageId: Uuid;
  /** `sequence` del último mensaje al generar. Si llega otro mensaje, el borrador queda STALE. */
  baselineSequence: number;
  /** Clave Idempotency-Key usada al generar. */
  idempotencyKey: string;
  createdById: Uuid;
  /** Quien aprobó o rechazó. */
  reviewedById: Uuid | null;
  /** Último usuario que editó el texto. */
  editedById: Uuid | null;
  status: SamantaDraftStatus;
  /** Empieza en 1 y suma 1 con cada edición. Se envía en editar, aprobar y rechazar. */
  revision: number;
  /** Modelo de IA (SAMANTA_MODEL). */
  model: string;
  /** Versión del prompt ("samanta-drafts-v1"). */
  promptVersion: string;
  /** SHA-256 (hex) de la información comercial usada. */
  knowledgeHash: string;
  /**
   * Texto original de la IA. null mientras está GENERATING, si falló, o si quedó STALE durante
   * la generación por un mensaje nuevo, una pausa o el vencimiento (el texto se descarta).
   */
  originalContent: string | null;
  /** Texto actual (el editado, si se editó). null en los mismos casos que originalContent. */
  content: string | null;
  /** Se guarda con el texto de la IA: null en los mismos casos que originalContent. */
  intent: SamantaIntent | null;
  /** true por defecto; toma el valor de la IA solo si se guarda su texto. No se recalcula al editar. */
  requiresHuman: boolean;
  /** Datos que faltan, en texto libre (máx. 8 de hasta 80 caracteres). [] si no se guardó el texto. */
  missingFields: string[];
  /** null hasta que la IA responde. Pueden venir en STALE o FAILED si la IA respondió tarde. */
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: SamantaErrorCode | null;
  /** Límite de la generación (inicio + SAMANTA_TIMEOUT_MS + 10 s). Después pasa a FAILED. */
  generationExpiresAt: IsoDateTime;
  /** Inicio + 15 min. Después pasa a STALE. */
  expiresAt: IsoDateTime;
  reviewedAt: IsoDateTime | null;
  /** Mensaje OUTBOUND creado al aprobar. */
  outboundMessageId: Uuid | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Respuesta de GET /conversations/:id/assistant-drafts: hasta 50, los más recientes primero. */
export interface SamantaDraftListResponse {
  data: SamantaDraft[];
}

/* ----------------------------------------------------------------------------
 * Webhooks de Meta (solo los llama Meta; el BFF los bloquea)
 * -------------------------------------------------------------------------- */

/** Query de GET /webhooks/whatsapp y GET /webhooks/messenger. */
export interface MetaWebhookVerifyQuery {
  "hub.mode": "subscribe";
  "hub.verify_token": string;
  "hub.challenge": string;
}

/** Respuesta 200 de POST /webhooks/whatsapp y POST /webhooks/messenger. */
export interface MetaWebhookAck {
  received: true;
}

/** Campos de un evento de WhatsApp Cloud API que lee bk-crm (el resto se ignora). */
export interface WhatsAppWebhookPayload {
  /** Solo se procesa "whatsapp_business_account". */
  object: string;
  entry?: Array<{
    /** Debe ser WHATSAPP_BUSINESS_ACCOUNT_ID. */
    id: string;
    changes?: Array<{
      /** Solo se procesa "messages". */
      field: string;
      value: {
        /** phone_number_id debe ser WHATSAPP_PHONE_NUMBER_ID. */
        metadata: { phone_number_id: string };
        messages?: Array<{
          /** Teléfono internacional sin "+" (7 a 15 dígitos). */
          from: string;
          id: string;
          /** Segundos Unix en texto. */
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type?: string; caption?: string };
          document?: { id: string; mime_type?: string; filename?: string; caption?: string };
        }>;
        statuses?: Array<{
          id: string;
          /** Solo se procesan sent, delivered, read y failed. */
          status: string;
          timestamp: string;
        }>;
      };
    }>;
  }>;
}

/** Campos de un evento de Messenger que lee bk-crm (el resto se ignora). */
export interface MessengerWebhookPayload {
  /** Solo se procesa "page". */
  object: string;
  entry?: Array<{
    /** Debe ser MESSENGER_PAGE_ID. */
    id: string;
    messaging?: Array<{
      /** PSID numérico del cliente. */
      sender: { id: string };
      /** Debe ser MESSENGER_PAGE_ID. */
      recipient: { id: string };
      /** Milisegundos Unix. */
      timestamp?: number;
      message?: {
        mid: string;
        text?: string;
        is_echo?: boolean;
        is_deleted?: boolean;
        is_unsupported?: boolean;
        attachments?: unknown[];
      };
      delivery?: { mids?: string[]; watermark?: number };
    }>;
  }>;
}
```

## Parte 05: Implementación en ft-crm: de mock a live

> Parte de la [referencia de la API de bk-crm para el frontend](#readme-api-de-bk-crm-para-el-frontend). Estado: 3 de noviembre de 2026.
>
> Código revisado: bk-crm en `main` (`9538556`) y ft-crm en `main` (`aaeb85e`), los dos con sus cambios sin commit del 3/11. Las rutas de archivo de ft-crm empiezan en `ft-crm/src`.

Esta guía es el plan para conectar ft-crm con bk-crm en modo live (`CRM_BACKEND_MODE=live`). Reúne por pantalla lo que los módulos 01 a 04 explican por ruta, propone el código de `src/lib/api/` y lista lo que el mock hace distinto del backend real.

### Índice

1. [Cómo usar esta guía](#1-cómo-usar-esta-guía)
2. [Capa de API](#2-capa-de-api): [`endpoints.ts`](#21-endpointsts), [`types.ts`](#22-typests), [`query-keys.ts`](#23-query-keysts), [cómo se comprobó](#24-cómo-se-comprobó)
3. [Guía por pantalla](#3-guía-por-pantalla)
4. [Manejo de errores en la UI](#4-manejo-de-errores-en-la-ui)
5. [Reglas transversales](#5-reglas-transversales)
6. [De mock a live: lista de comprobación](#6-de-mock-a-live-lista-de-comprobación)
7. [Cómo probar contra el backend real](#7-cómo-probar-contra-el-backend-real)

### 1. Cómo usar esta guía

- **Detalle por ruta.** Body, query, respuesta, errores exactos y efectos están en los módulos: [01](#parte-01-autenticación-sesión-usuarios-y-salud), [02](#parte-02-configuración-del-restaurante-y-catálogo-comercial), [03](#parte-03-clientes-solicitudes-de-reserva-y-reservas-calendario) y [04](#parte-04-bandeja-conversaciones-mensajes-whatsapp-y-messenger-y-borradores-de-samanta). Aquí no se repiten: se enlazan.
- **Filas ft-crm y Caché.** Cada ruta de los módulos tiene una fila **ft-crm** (función y firma) y una fila **Caché** (clave y qué invalidar). Esta guía las reúne por pantalla y en el [mapa de invalidaciones](#mapa-de-invalidaciones).
- **Estados de una función:**
  - **existe**: ya está en `src/lib/api/endpoints.ts`;
  - **nueva**: hay que crearla;
  - **cambia**: existe, pero cambia su tipo;
  - **BFF**: la resuelve el servidor de Next.js;
  - **no aplica**: el navegador no la usa.
- **Código.** El de la [sección 2](#2-capa-de-api) y los ejemplos marcados con `// ejemplo:` compilan con `tsc --strict` junto con el `client.ts` actual de ft-crm ([cómo se comprobó](#24-cómo-se-comprobó)). Después de copiarlos, ejecuta `npm run typecheck` en ft-crm.
- **Ejemplos.** Usan datos ficticios.

#### Orden de trabajo recomendado

| Paso | Qué hacer | Listo cuando | Dónde |
|---|---|---|---|
| 0 | Levanta bk-crm en local y ft-crm en modo live. | `/api/listo` responde 200 con `"backend": "disponible"` y entras con el ADMIN del seed. | [§7](#7-cómo-probar-contra-el-backend-real) |
| 1 | Aplica la capa de API: `types.ts`, `endpoints.ts`, `query-keys.ts` y el nuevo `errors.ts`. | `npm run typecheck` y `npm test` pasan, con el ajuste de `servicios-logic.test.ts`. | [§2](#2-capa-de-api) |
| 2 | Ajusta el manejo de errores: «sin conexión» frente a «función apagada», y errores de validación por campo. | Las acciones nuevas usan `isConnectionError` e `isDisabledInServer` (no `ApiError.isUnavailable`), y los formularios llevan los 400 de validación a su campo con `serverFormErrors`. | [§4](#4-manejo-de-errores-en-la-ui) |
| 3 | Prepara los datos del primer arranque: configuración del restaurante, catálogo aprobado y un usuario por rol. | Empresa guarda, Servicios aprueba y puedes entrar con ADMIN, OWNER y OPERATOR. | [Ajustes](#ajustes--empresa) |
| 4 | Habilita Messenger (canal `FACEBOOK`) en la Bandeja. | Puedes responder en Messenger con tope de 2000 caracteres y los fallos `MESSENGER_*` tienen texto. | [Bandeja](#bandeja) |
| 5 | Añade los borradores de Samanta al chat. | Puedes generar, esperar, editar, aprobar y rechazar un borrador. | [Bandeja](#bandeja) |
| 6 | Crea las altas y ediciones que faltan en clientes, solicitudes y reservas. | Las 11 funciones nuevas de [03](#funciones-y-claves-de-caché-en-ft-crm) tienen pantalla o formulario. | [Clientes](#clientes), [Solicitudes](#solicitudes), [Calendario](#calendario) |
| 7 | Corrige los textos del flujo del dueño, que bk-crm aún no tiene. | Ninguna pantalla promete algo que el backend no hace. | [§3](#3-guía-por-pantalla) y [§6](#6-de-mock-a-live-lista-de-comprobación) |
| 8 | Pon al día el mock y las pruebas. | El mock responde como bk-crm en las rutas nuevas, y `npm test` y `npm run test:e2e` pasan. | [§6](#6-de-mock-a-live-lista-de-comprobación) |

Si hay que recortar, empieza por los pasos 0 a 4: con datos reales es lo que más se nota, porque hoy la Bandeja no deja responder en Messenger.

### 2. Capa de API

Son tres archivos de `src/lib/api/` y uno nuevo. `client.ts` no cambia: `apiFetch`, `toSearch`, `collectPages` y `newIdempotencyKey` ya hacen lo que pide bk-crm.

| Archivo | Qué cambia |
|---|---|
| `endpoints.ts` | Se añaden 25 funciones, 6 de ellas en el objeto nuevo `assistantDraftsApi`. Cambia el tipo del body de `catalogApi.create`. |
| `types.ts` | Se reemplazan 6 declaraciones y se añaden los tipos de las rutas nuevas. |
| `query-keys.ts` | Se añaden 7 claves. |
| `errors.ts` (nuevo) | Ayudas para clasificar errores y llevar los de validación a cada campo ([§4](#4-manejo-de-errores-en-la-ui)). |

#### 2.1 `endpoints.ts`

Archivo completo. Cubre las 53 rutas que el navegador pide por `/api/backend`. Login, logout y recuperación de contraseña siguen en `sessionApi`, que no cambia y va por `/api/auth/*`. Quedan fuera:
- `GET /`;
- `GET /auth/test-admin` (el BFF la bloquea);
- `POST /auth/refresh` (la llama el BFF);
- `GET /health` (se consulta con `/api/listo`);
- los cuatro webhooks de Meta.

| Objeto | Existen | Nuevas | Cambian |
|---|---|---|---|
| `sessionApi` | 5 (4 por `/api/auth/*` y `me` por `/api/backend`) | 0 | 0 |
| `usersApi` | 4 | 2 | 0 |
| `configApi` | 2 | 0 | 0 |
| `catalogApi` | 5 | 6 | 1 (`create`: tipo del body) |
| `customersApi` | 3 | 4 | 0 |
| `requestsApi` | 3 | 2 | 0 |
| `reservationsApi` | 3 | 5 | 0 |
| `conversationsApi` | 7 | 0 | 0 |
| `assistantDraftsApi` | 0 | 6 | 0 |

Las funciones nuevas van al final de cada objeto, para que el diff con el archivo actual sea pequeño. Las firmas son las de la fila ft-crm de cada ruta.

```ts
// src/lib/api/endpoints.ts
/**
 * Funciones tipadas por endpoint de bk-crm (vía el proxy /api/backend).
 * Marcas: «NUEVA» no existe en el archivo anterior; «CAMBIA» existía, pero cambia su tipo.
 * Lo que no lleva marca queda igual.
 */
import { apiFetch, newIdempotencyKey } from "./client";
import type {
  AssignConversationRequest,
  AssignReservationBody,
  CommercialApprovalStatus,
  CommercialCategory,
  CommercialItem,
  CommercialItemListQuery,
  Conversation,
  CreateCommercialCategoryRequest,
  CreateCommercialItemRequest,
  CreateCustomerInterestRequest,
  CreateCustomerRequest,
  CreateReservationBody,
  CreateReservationNoteBody,
  CreateReservationRequestBody,
  CreateUserRequest,
  Customer,
  CustomerDetail,
  CustomerInterest,
  CustomerListQuery,
  CustomerStatus,
  EditSamantaDraftRequest,
  GenerateSamantaDraftRequest,
  ListConversationsQuery,
  ListMessagesQuery,
  LoginUser,
  MarkConversationReadResponse,
  MeResponse,
  Message,
  Paginated,
  PutRestaurantConfigRequest,
  RescheduleReservationBody,
  Reservation,
  ReservationDetail,
  ReservationListQuery,
  ReservationNote,
  ReservationRequest,
  ReservationRequestListQuery,
  ReservationStatusTarget,
  RestaurantConfig,
  ReviewSamantaDraftRequest,
  RoleCode,
  SamantaDraft,
  SamantaDraftListResponse,
  UpdateCommercialCategoryRequest,
  UpdateCommercialCategoryStatusRequest,
  UpdateCommercialItemRequest,
  UpdateCustomerRequest,
  UpdateReservationBody,
  UpdateReservationRequestBody,
  UpdateUserRequest,
  User,
  Uuid,
} from "./types";

// ---------------------------------------------------------------- sesión (manejadores propios del BFF)

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  }).catch(() => null);
  if (!res) throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.");
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) throw new Error(typeof data?.message === "string" ? data.message : `Error ${res.status}`);
  return data as T;
}

/** login, logout, forgotPassword y resetPassword van por /api/auth/*; me, por /api/backend. */
export const sessionApi = {
  login: (email: string, password: string) => postJson<{ user: LoginUser }>("/api/auth/login", { email, password }),
  logout: () => postJson<{ ok: true }>("/api/auth/logout", {}),
  forgotPassword: (email: string) => postJson<{ message: string }>("/api/auth/forgot-password", { email }),
  resetPassword: (token: string, newPassword: string) =>
    postJson<{ message: string }>("/api/auth/reset-password", { token, newPassword }),
  me: (signal?: AbortSignal) => apiFetch<MeResponse>("/auth/me", { signal }),
};

// ---------------------------------------------------------------- usuarios (solo ADMIN)

export const usersApi = {
  list: () => apiFetch<User[]>("/users"),
  create: (body: CreateUserRequest) => apiFetch<User>("/users", { method: "POST", body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<User>(`/users/${id}/status`, { method: "PATCH", body: { isActive } }),
  setRoles: (id: string, roles: RoleCode[]) => apiFetch<User>(`/users/${id}/roles`, { method: "PATCH", body: { roles } }),
  /** NUEVA · GET /users/:id */
  get: (id: Uuid, signal?: AbortSignal) => apiFetch<User>(`/users/${id}`, { signal }),
  /** NUEVA · PATCH /users/:id. Solo los campos que cambian (al menos uno); nunca null ni "". */
  update: (id: Uuid, body: UpdateUserRequest) => apiFetch<User>(`/users/${id}`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- configuración

export const configApi = {
  get: () => apiFetch<RestaurantConfig>("/restaurant-config"),
  put: (body: PutRestaurantConfigRequest) => apiFetch<RestaurantConfig>("/restaurant-config", { method: "PUT", body }),
};

// ---------------------------------------------------------------- catálogo

export const catalogApi = {
  categories: () => apiFetch<CommercialCategory[]>("/commercial-categories"),
  items: (query: CommercialItemListQuery) => apiFetch<Paginated<CommercialItem>>("/commercial-items", { query }),
  /** CAMBIA (solo el tipo): CreateCommercialItemRequest admite todos los campos del DTO del backend. */
  create: (body: CreateCommercialItemRequest) => apiFetch<CommercialItem>("/commercial-items", { method: "POST", body }),
  setActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/status`, { method: "PATCH", body: { isActive } }),
  setApproval: (id: string, approvalStatus: CommercialApprovalStatus) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}/approval`, { method: "PATCH", body: { approvalStatus } }),
  /** NUEVA · GET /commercial-categories/:id */
  category: (id: string) => apiFetch<CommercialCategory>(`/commercial-categories/${id}`),
  /** NUEVA · POST /commercial-categories */
  createCategory: (body: CreateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>("/commercial-categories", { method: "POST", body }),
  /** NUEVA · PATCH /commercial-categories/:id (al menos un campo). */
  updateCategory: (id: string, body: UpdateCommercialCategoryRequest) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}`, { method: "PATCH", body }),
  /** NUEVA · PATCH /commercial-categories/:id/status */
  setCategoryActive: (id: string, isActive: boolean) =>
    apiFetch<CommercialCategory>(`/commercial-categories/${id}/status`, {
      method: "PATCH",
      body: { isActive } satisfies UpdateCommercialCategoryStatusRequest,
    }),
  /** NUEVA · GET /commercial-items/:id */
  item: (id: string) => apiFetch<CommercialItem>(`/commercial-items/${id}`),
  /** NUEVA · PATCH /commercial-items/:id. variants, images, faqs y schedules reemplazan la lista completa. */
  update: (id: string, body: UpdateCommercialItemRequest) =>
    apiFetch<CommercialItem>(`/commercial-items/${id}`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- clientes

export const customersApi = {
  list: (query: CustomerListQuery) => apiFetch<Paginated<Customer>>("/customers", { query }),
  get: (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`),
  setStatus: (id: string, status: CustomerStatus) =>
    apiFetch<Customer>(`/customers/${id}/status`, { method: "PATCH", body: { status } }),
  /** NUEVA · POST /customers */
  create: (body: CreateCustomerRequest) => apiFetch<Customer>("/customers", { method: "POST", body }),
  /** NUEVA · PATCH /customers/:id. La respuesta no trae interests: mézclala con el detalle en caché. */
  update: (id: string, body: UpdateCustomerRequest) =>
    apiFetch<Customer>(`/customers/${id}`, { method: "PATCH", body }),
  /** NUEVA · POST /customers/:id/interests. Responde 200 también al repetir (actualiza el interés). */
  addInterest: (id: string, body: CreateCustomerInterestRequest) =>
    apiFetch<CustomerInterest>(`/customers/${id}/interests`, { method: "POST", body }),
  /** NUEVA · DELETE /customers/:id/interests/:commercialItemId. Responde 204: apiFetch devuelve undefined. */
  removeInterest: (id: string, commercialItemId: string) =>
    apiFetch<void>(`/customers/${id}/interests/${commercialItemId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------- solicitudes

export const requestsApi = {
  list: (query: ReservationRequestListQuery) =>
    apiFetch<Paginated<ReservationRequest>>("/reservation-requests", { query }),
  get: (id: string) => apiFetch<ReservationRequest>(`/reservation-requests/${id}`),
  cancel: (id: string) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}/status`, { method: "PATCH", body: { status: "CANCELLED" } }),
  /** NUEVA · POST /reservation-requests (no es idempotente: un reintento crea otra solicitud). */
  create: (body: CreateReservationRequestBody) =>
    apiFetch<ReservationRequest>("/reservation-requests", { method: "POST", body }),
  /** NUEVA · PATCH /reservation-requests/:id (solo en INCOMPLETE_DATA o READY_TO_SEND). */
  update: (id: string, body: UpdateReservationRequestBody) =>
    apiFetch<ReservationRequest>(`/reservation-requests/${id}`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- reservas

export const reservationsApi = {
  list: (query: ReservationListQuery) => apiFetch<Paginated<Reservation>>("/reservations", { query }),
  get: (id: string) => apiFetch<ReservationDetail>(`/reservations/${id}`),
  setStatus: (id: string, status: ReservationStatusTarget) =>
    apiFetch<Reservation>(`/reservations/${id}/status`, { method: "PATCH", body: { status } }),
  /** NUEVA · POST /reservations (solo ADMIN; no es idempotente). */
  create: (body: CreateReservationBody) => apiFetch<Reservation>("/reservations", { method: "POST", body }),
  /** NUEVA · PATCH /reservations/:id. La respuesta no trae historiales: mézclala con el detalle en caché. */
  update: (id: string, body: UpdateReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}`, { method: "PATCH", body }),
  /** NUEVA · PATCH /reservations/:id/assignee ({ assignedUserId: null } libera). */
  assign: (id: string, body: AssignReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/assignee`, { method: "PATCH", body }),
  /** NUEVA · POST /reservations/:id/notes (no es idempotente). */
  addNote: (id: string, content: string) =>
    apiFetch<ReservationNote>(`/reservations/${id}/notes`, {
      method: "POST",
      body: { content } satisfies CreateReservationNoteBody,
    }),
  /** NUEVA · PATCH /reservations/:id/reschedule. Deja la reserva en RESCHEDULED (con el mismo instante, no cambia nada). */
  reschedule: (id: string, body: RescheduleReservationBody) =>
    apiFetch<Reservation>(`/reservations/${id}/reschedule`, { method: "PATCH", body }),
};

// ---------------------------------------------------------------- conversaciones

export const conversationsApi = {
  list: (query: ListConversationsQuery) => apiFetch<Paginated<Conversation>>("/conversations", { query }),
  get: (id: string) => apiFetch<Conversation>(`/conversations/${id}`),
  messages: (id: string, query: ListMessagesQuery = {}) =>
    apiFetch<Paginated<Message>>(`/conversations/${id}/messages`, { query }),
  markRead: (id: string, throughMessageId: string) =>
    apiFetch<MarkConversationReadResponse>(`/conversations/${id}/read`, { method: "PATCH", body: { throughMessageId } }),
  setAssistantPaused: (id: string, paused: boolean) =>
    apiFetch<Conversation>(`/conversations/${id}/assistant`, { method: "PATCH", body: { paused } }),
  assign: (id: string, body: AssignConversationRequest) =>
    apiFetch<Conversation>(`/conversations/${id}/assignee`, { method: "PATCH", body }),
  /**
   * La clave de idempotencia identifica un mismo mensaje en reintentos: genérala una vez por envío y pásala
   * siempre. El valor por defecto crea una clave nueva en cada llamada.
   */
  send: (id: string, content: string, idempotencyKey: string = newIdempotencyKey()) =>
    apiFetch<Message>(`/conversations/${id}/messages`, {
      method: "POST",
      body: { type: "TEXT", content },
      headers: { "idempotency-key": idempotencyKey },
    }),
};

// ---------------------------------------------------------------- borradores de Samanta (NUEVO objeto)

export const assistantDraftsApi = {
  /**
   * NUEVA · POST /conversations/:id/assistant-drafts. Espera a la IA (el BFF da 65 s a esta ruta).
   * Sin clave por defecto a propósito: reutiliza la misma solo para reintentar esta generación.
   */
  generate: (conversationId: string, sourceMessageId: string, idempotencyKey: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts`, {
      method: "POST",
      body: { sourceMessageId } satisfies GenerateSamantaDraftRequest,
      headers: { "idempotency-key": idempotencyKey },
    }),
  /** NUEVA · GET /conversations/:id/assistant-drafts (hasta 50, los más recientes primero, sin paginar). */
  list: (conversationId: string) =>
    apiFetch<SamantaDraftListResponse>(`/conversations/${conversationId}/assistant-drafts`),
  /** NUEVA · GET /conversations/:id/assistant-drafts/:draftId */
  get: (conversationId: string, draftId: string) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`),
  /** NUEVA · PATCH /conversations/:id/assistant-drafts/:draftId (suma 1 a revision). */
  edit: (conversationId: string, draftId: string, body: EditSamantaDraftRequest) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}`, { method: "PATCH", body }),
  /** NUEVA · POST …/approve (202): encola un OUTBOUND cuyo autor es quien aprueba. */
  approve: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/approve`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
  /** NUEVA · POST …/reject (200). */
  reject: (conversationId: string, draftId: string, revision: number) =>
    apiFetch<SamantaDraft>(`/conversations/${conversationId}/assistant-drafts/${draftId}/reject`, {
      method: "POST",
      body: { revision } satisfies ReviewSamantaDraftRequest,
    }),
};
```

Notas:
- **Fechas.** Las funciones reciben instantes ISO ya armados. Usa `toISOString()` o los helpers de `src/lib/format/dates.ts` ([§5](#fechas-y-zona-horaria)).
- **Bodies.** Envía solo campos declarados: bk-crm responde 400 a cualquier otro. En los PATCH, envía solo los que el usuario tocó, porque omitir un campo no es lo mismo que enviarlo como `null` ([§5](#bodies-y-null)).
- **Permisos.** Que exista la función no significa que todos los roles puedan usarla. La tabla de cada pantalla dice qué ocultar ([§3](#3-guía-por-pantalla)).

#### 2.2 `types.ts`

Los tipos coinciden con los bloques **Tipos TypeScript** de cada módulo. Aquí están solo los cambios respecto del `types.ts` actual.

| Declaración | Cambio | Motivo | ¿Rompe algo en ft-crm? |
|---|---|---|---|
| `ApiErrorBody` | `code` pasa a `BffErrorCode` (nuevo). Se añaden `path`, `method` y `timestamp`, opcionales. | El BFF solo pone `NO_SESSION`, `SESSION_EXPIRED` o `BACKEND_UNAVAILABLE`. El 500 de bk-crm trae `path`, `method` y `timestamp`. | No. `ApiError.code` sigue siendo `string`. |
| `CommercialItem` | `category`, `images`, `faqs`, `schedules`, `promotionDetail` y `eventDetail` pasan a tener tipos completos. | ft-crm los declaraba como `unknown[]` o con campos de menos ([02 · Modelos](#commercialitem)). | Sí: `src/features/ajustes/servicios/servicios-logic.test.ts` (líneas 116 y 137) arma `promotionDetail` sin `id`, `createdAt` ni `updatedAt`. Complétalos. |
| `CreateCommercialItemRequest` | Pasa a admitir todos los campos del DTO. `nameEs` deja de ser obligatorio: basta con `nameEs` o `nameEn`. | El alta mínima de Servicios sigue valiendo; un editor completo necesita el resto. | No. `buildCreateItemBody` sigue compilando. |
| `Message` | `errorCode` pasa a `MessageErrorCode \| null`. Se corrige el comentario de `authorUserId`. | bk-crm solo produce esos códigos. Un `OUTBOUND` creado por la API siempre tiene autor: `null` no significa «Samanta». | No. `inbox-utils.test.ts` usa `WHATSAPP_WINDOW_CLOSED`, que es válido. |
| `SendMessageRequest` | Solo el comentario. | El tope es por canal: 4096 en WhatsApp y 2000 en Messenger, medido con `content.length`. | No |
| `OUTBOUND_CONTENT_MAX_LENGTH` | Solo el comentario. | Es el tope del DTO, no el del canal. | No |

No cambian, porque coinciden con el backend:
- `Customer`, `CustomerDetail`, `CustomerSummary`, `ReservationRequest`, `Reservation`, `ReservationDetail` y los demás tipos de [03](#tipos-typescript-2);
- `Conversation`, `ConversationAssignedUser`, `MessageAttachment` y las query de [04](#tipos-typescript-3);
- `User`, `LoginUser`, `MeResponse`, `RestaurantConfig` y `CommercialCategory`;
- `CommercialItemListQuery`: sus uniones `sort` y `order` son las mismas que `CommercialItemSortField` y `SortOrder`.

Los bloques de tipos de los cuatro módulos declaran `ApiErrorBody` y `BffErrorCode` igual que este bloque.

`PutRestaurantConfigRequest` y `RestaurantScheduleInput` tampoco cambian. El backend además acepta omitir los opcionales ([02](#tipos-typescript-1)), pero la forma de ft-crm, con `null` explícito, es válida y `toPutRequest` siempre la arma completa.

**Declaraciones que se reemplazan.** Cada bloque sustituye las declaraciones que nombra en su primera línea.

```ts
// src/lib/api/types.ts · reemplaza: ApiErrorBody
/** `code` que añade el BFF de este frontend; bk-crm nunca lo envía. */
export type BffErrorCode = "NO_SESSION" | "SESSION_EXPIRED" | "BACKEND_UNAVAILABLE";

/**
 * Cuerpo de error de bk-crm o de un handler del BFF.
 * `message` es string[] solo en el 400 de validación de DTO; en el resto, string.
 */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  /** "Bad Request", "Forbidden"… No viene en el 401 genérico de bk-crm, en los 429, en el 500 ni en los errores del BFF. */
  error?: string;
  /** Solo lo añade el BFF. */
  code?: BffErrorCode;
  /** Solo en el 500 de bk-crm: ruta sin query string. */
  path?: string;
  /** Solo en el 500 de bk-crm. */
  method?: string;
  /** Solo en el 500 de bk-crm. */
  timestamp?: IsoDateTime;
}
```

```ts
// src/lib/api/types.ts · reemplaza: CommercialItem, CreateCommercialItemRequest
/** Elemento comercial completo: lo devuelven POST, GET, GET /:id y los tres PATCH. */
export interface CommercialItem {
  id: Uuid;
  type: CommercialItemType;
  categoryId: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  descriptionEs: string | null;
  descriptionEn: string | null;
  /** 2 decimales o null. */
  basePrice: MoneyString | null;
  displayOrder: number;
  isActive: boolean;
  approvalStatus: CommercialApprovalStatus;
  conditions: string | null;
  /** Nota interna: la ven los roles del CRM, pero no Samanta. */
  internalNotes: string | null;
  availabilityNote: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  category: CommercialItemCategorySummary;
  /** Todas, también las inactivas; por displayOrder y createdAt. */
  variants: CommercialItemVariant[];
  /** Por displayOrder y createdAt. */
  images: CommercialItemImage[];
  /** Por displayOrder y createdAt. */
  faqs: CommercialItemFaq[];
  /** Solo los días configurados, de MONDAY a SUNDAY. */
  schedules: CommercialItemSchedule[];
  promotionDetail: CommercialPromotionDetail | null;
  eventDetail: CommercialEventDetail | null;
}

/** Body de POST /commercial-items. Nace activo y en DRAFT. Hay que enviar nameEs o nameEn con texto. */
export interface CreateCommercialItemRequest extends CommercialItemWritableFields {
  type: CommercialItemType;
  /** Categoría existente y activa. */
  categoryId: Uuid;
}
```

```ts
// src/lib/api/types.ts · reemplaza: Message, SendMessageRequest, OUTBOUND_CONTENT_MAX_LENGTH
/** Mensaje del historial; también la respuesta 202 de POST /conversations/:id/messages. */
export interface Message {
  id: Uuid;
  conversationId: Uuid;
  channel: ContactChannel;
  /** Orden total dentro de la conversación: ordenar siempre por sequence. */
  sequence: number;
  /** wamid (WhatsApp) o mid (Messenger). En OUTBOUND es null hasta SENT. */
  externalMessageId: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  type: MessageType;
  /** null en IMAGE o FILE sin pie de foto. */
  content: string | null;
  /**
   * INBOUND: null. OUTBOUND: usuario que lo envió o que aprobó el borrador de Samanta.
   * Un OUTBOUND creado por la API nunca tiene autor null: null no significa «Samanta».
   */
  authorUserId: Uuid | null;
  /** INBOUND: hora del proveedor. OUTBOUND: null. */
  occurredAt: IsoDateTime | null;
  receivedAt: IsoDateTime | null;
  processedAt: IsoDateTime | null;
  sentAt: IsoDateTime | null;
  deliveredAt: IsoDateTime | null;
  /** Solo WhatsApp: Messenger no informa lecturas. */
  providerReadAt: IsoDateTime | null;
  failedAt: IsoDateTime | null;
  /** INBOUND: leído por el equipo en el CRM. OUTBOUND: siempre null. */
  readAt: IsoDateTime | null;
  errorCode: MessageErrorCode | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  attachments: MessageAttachment[];
}

export interface SendMessageRequest {
  type: "TEXT";
  /** Al menos un carácter no blanco. content.length ≤ OUTBOUND_TEXT_MAX_LENGTH del canal (4096 WhatsApp, 2000 Messenger). */
  content: string;
}

/** Tope del DTO de envío (cuenta cada emoji como 1). Para el textarea y el contador usa OUTBOUND_TEXT_MAX_LENGTH. */
export const OUTBOUND_CONTENT_MAX_LENGTH = 4096;
```

**Declaraciones nuevas.** Añádelas en la sección correspondiente de `types.ts`; el orden no importa para el compilador.

```ts
// src/lib/api/types.ts · añade (autenticación, usuarios y salud)
/** Body de POST /auth/refresh. Solo lo envía el BFF (src/lib/server/session.ts). */
export interface RefreshRequest {
  /** Último refresh token emitido para la sesión. */
  refreshToken: string;
}

/** Body de PATCH /users/:id (200 · User). Envía al menos un campo; los que no cambian se omiten: nunca null ni "". */
export interface UpdateUserRequest {
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  firstName?: string;
  /** Máximo 100 caracteres, al menos uno no blanco; se guarda con trim. */
  lastName?: string;
  /** Email válido sin espacios alrededor; único; se guarda en minúsculas. */
  email?: string;
}

export type HealthStatus = "ok" | "error";
export type HealthServiceStatus = "up" | "down";

/** GET /health de bk-crm: 200 con status "ok" o 503 con status "error" (sin message). El navegador usa /api/listo. */
export interface HealthResponse {
  status: HealthStatus;
  services: {
    api: "up";
    database: HealthServiceStatus;
  };
  timestamp: IsoDateTime;
  /** Segundos enteros desde que arrancó el proceso. */
  uptimeSeconds: number;
}

/** GET /api/listo (handler del BFF): 200 si bk-crm responde GET /health con 2xx (o en modo mock); 503 si no. */
export type ReadyResponse =
  | { estado: "ok"; backend: "disponible" | "simulado" }
  | { estado: "error"; backend: string; motivo?: "timeout" | "network" | "error" };

/** 200 de POST /api/auth/login (además fija las cookies httpOnly crm_at y crm_rt). */
export interface BffLoginResponse {
  user: LoginUser;
}

/** 200 de POST /api/auth/logout: siempre, aunque bk-crm no responda; borra las cookies. */
export interface BffLogoutResponse {
  ok: true;
}
```

```ts
// src/lib/api/types.ts · añade (configuración y catálogo)
/** Importe: de "0" a "99999999.99", punto decimal, hasta 2 decimales, sin signo ni ceros a la izquierda. */
export const MONEY_PATTERN = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
/** Hora "HH:mm" de 24 h. */
export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** WhatsApp del negocio en E.164. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
/** Instantes de entrada (body y query): segundos y zona obligatorios, hasta 3 decimales. */
export const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Criterio de orden de GET /commercial-items. */
export type CommercialItemSortField = "category" | "name" | "createdAt";
/** Dirección del orden. */
export type SortOrder = "asc" | "desc";

/** Body de POST /commercial-categories. Hay que enviar nameEs o nameEn con texto. */
export interface CreateCommercialCategoryRequest {
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEs?: string | null;
  /** 1–150. Único (normalizado y entre ambos idiomas). */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** Entero 0–1 000 000 (no admite null). Por defecto 0. */
  displayOrder?: number;
}

/**
 * Body de PATCH /commercial-categories/:id. Al menos un campo. Omitido = se conserva;
 * null = se borra (salvo displayOrder). Debe quedar al menos un nombre.
 */
export type UpdateCommercialCategoryRequest = Partial<CreateCommercialCategoryRequest>;

/** Body de PATCH /commercial-categories/:id/status. */
export interface UpdateCommercialCategoryStatusRequest {
  isActive: boolean;
}

/** Resumen de la categoría incluido en cada elemento. */
export interface CommercialItemCategorySummary {
  id: Uuid;
  nameEs: string | null;
  nameEn: string | null;
  isActive: boolean;
  displayOrder: number;
}

/** Imagen (sin updatedAt). */
export interface CommercialItemImage {
  id: Uuid;
  url: string;
  altTextEs: string | null;
  altTextEn: string | null;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: IsoDateTime;
}

/** Pregunta frecuente. */
export interface CommercialItemFaq {
  id: Uuid;
  questionEs: string;
  questionEn: string | null;
  answerEs: string;
  answerEn: string | null;
  displayOrder: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Disponibilidad de un día. endTime < startTime = cruza la medianoche. */
export interface CommercialItemSchedule {
  id: Uuid;
  dayOfWeek: DayOfWeek;
  isAvailable: boolean;
  startTime: HhMm | null;
  endTime: HhMm | null;
}

/** Detalle de promoción (solo en PROMOTION). */
export interface CommercialPromotionDetail {
  id: Uuid;
  validFrom: IsoDateTime | null;
  validUntil: IsoDateTime | null;
  promotionalPrice: MoneyString | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Detalle de evento (solo en EVENT). */
export interface CommercialEventDetail {
  id: Uuid;
  startAt: IsoDateTime | null;
  endAt: IsoDateTime | null;
  capacity: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// Las entradas no aceptan id, createdAt ni updatedAt: quítalos de los hijos del GET
// (si no, 400 "variants.0.property id should not exist").

/** Variante. Hay que enviar nameEs o nameEn; el nombre normalizado no se repite en el elemento. */
export interface CommercialItemVariantInput {
  /** 1–150. */
  nameEs?: string | null;
  /** 1–150. */
  nameEn?: string | null;
  /** 1–2000. */
  descriptionEs?: string | null;
  /** 1–2000. */
  descriptionEn?: string | null;
  /** MONEY_PATTERN, p. ej. "25" o "25.00". */
  price: MoneyString;
  /** Por defecto true. Solo las activas cuentan para la regla de precio. */
  isActive?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Imagen: solo URL (no hay subida de archivos). */
export interface CommercialItemImageInput {
  /** URL http(s) con dominio o IP, máx. 2048, sin repetir en el elemento. */
  url: string;
  /** 1–300. */
  altTextEs?: string | null;
  /** 1–300. */
  altTextEn?: string | null;
  /** Por defecto false. Como máximo una principal. */
  isPrimary?: boolean;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Pregunta frecuente. */
export interface CommercialItemFaqInput {
  /** 1–500. */
  questionEs: string;
  /** 1–500. */
  questionEn?: string | null;
  /** 1–5000. */
  answerEs: string;
  /** 1–5000. */
  answerEn?: string | null;
  /** Entero 0–1 000 000; omitido o null = posición en el array. */
  displayOrder?: number | null;
}

/** Disponibilidad de un día: horas distintas (pueden cruzar la medianoche) o no disponible sin horas. */
export type CommercialItemScheduleInput =
  | { dayOfWeek: DayOfWeek; isAvailable: true; startTime: HhMm; endTime: HhMm }
  | { dayOfWeek: DayOfWeek; isAvailable: false; startTime?: null; endTime?: null };

/** Detalle de promoción (solo type PROMOTION). Un objeto sustituye los 3 campos. */
export interface CommercialPromotionDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a validUntil. */
  validFrom?: IsoDateTime | null;
  validUntil?: IsoDateTime | null;
  promotionalPrice?: MoneyString | null;
}

/** Detalle de evento (solo type EVENT). Un objeto sustituye los 3 campos. */
export interface CommercialEventDetailInput {
  /** ISO_INSTANT_PATTERN y fecha existente. No posterior a endAt. */
  startAt?: IsoDateTime | null;
  endAt?: IsoDateTime | null;
  /** Entero 1–1 000 000. */
  capacity?: number | null;
}

/** Campos editables comunes a la creación y la edición de un elemento. */
export interface CommercialItemWritableFields {
  /** 1–200. Al crear, nameEs o nameEn; al editar debe quedar al menos uno. nameEs es obligatorio para aprobar. */
  nameEs?: string | null;
  /** 1–200. */
  nameEn?: string | null;
  /** 1–5000. */
  descriptionEs?: string | null;
  /** 1–5000. */
  descriptionEn?: string | null;
  /** DISH y BEVERAGE: basePrice o variantes activas, nunca los dos ni ninguno. */
  basePrice?: MoneyString | null;
  /** Entero 0–1 000 000 (no admite null). */
  displayOrder?: number;
  /** 1–5000. Samanta lo recibe. */
  conditions?: string | null;
  /** 1–5000. Samanta no lo recibe. */
  internalNotes?: string | null;
  /** 1–2000. Samanta lo recibe. */
  availabilityNote?: string | null;
  /** Máx. 50. En PATCH reemplaza la lista completa ([] = vaciar; no admite null). */
  variants?: CommercialItemVariantInput[];
  /** Máx. 20. En PATCH reemplaza la lista completa. */
  images?: CommercialItemImageInput[];
  /** Máx. 50. En PATCH reemplaza la lista completa. */
  faqs?: CommercialItemFaqInput[];
  /** Máx. 7, sin repetir días. En PATCH reemplaza la lista completa. */
  schedules?: CommercialItemScheduleInput[];
  /** Solo PROMOTION como objeto. null lo elimina (con cualquier type). */
  promotionDetail?: CommercialPromotionDetailInput | null;
  /** Solo EVENT como objeto. null lo elimina (con cualquier type). */
  eventDetail?: CommercialEventDetailInput | null;
}

/** Body de PATCH /commercial-items/:id. Al menos un campo; no admite type, isActive ni approvalStatus. */
export interface UpdateCommercialItemRequest extends CommercialItemWritableFields {
  /** No admite null. Si se envía, la categoría debe existir y estar activa. */
  categoryId?: Uuid;
}

/** Body de PATCH /commercial-items/:id/status. */
export interface UpdateCommercialItemStatusRequest {
  isActive: boolean;
}

/** Body de PATCH /commercial-items/:id/approval. */
export interface UpdateCommercialItemApprovalRequest {
  approvalStatus: CommercialApprovalStatus;
}
```

```ts
// src/lib/api/types.ts · añade (clientes, solicitudes y reservas)
/** Body de POST /customers. Exige un email o un teléfono normalizable. */
export interface CreateCustomerRequest {
  sourceChannel: ContactChannel;
  /** 1–100 tras el trim. */
  firstName?: string | null;
  /** 1–100 tras el trim. */
  lastName?: string | null;
  /** Internacional con "+", o nacional junto con phoneCountry. 6–15 dígitos; máx. 80 caracteres. */
  phone?: string | null;
  /** ISO alfa-2 ("PE"); exige phone. */
  phoneCountry?: string | null;
  /** Máx. 320; se guarda en minúsculas. */
  email?: string | null;
  /** 1–5000 tras el trim. */
  notes?: string | null;
}

/** Body de PATCH /customers/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateCustomerRequest {
  /** No admite null. En una identidad de Messenger solo se acepta "FACEBOOK". */
  sourceChannel?: ContactChannel;
  firstName?: string | null;
  lastName?: string | null;
  /** Con un número nacional, reenvía también phoneCountry (no se hereda). null borra también el país. */
  phone?: string | null;
  phoneCountry?: string | null;
  email?: string | null;
  notes?: string | null;
}

/** Body de POST /customers/:id/interests (crea o actualiza el interés). */
export interface CreateCustomerInterestRequest {
  /** Puede estar inactivo o sin aprobar. */
  commercialItemId: Uuid;
  /** 1–5000 tras el trim. Si el interés ya existe: omitir conserva la nota; null la borra. */
  notes?: string | null;
}

/** Estados en los que la solicitud admite edición y cancelación. */
export const RESERVATION_REQUEST_EDITABLE_STATUSES: readonly ReservationRequestStatus[] = [
  "INCOMPLETE_DATA",
  "READY_TO_SEND",
];

/** Body de POST /reservation-requests. */
export interface CreateReservationRequestBody {
  customerId: Uuid;
  sourceChannel: ContactChannel;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  /** Estrictamente futura. */
  reservationAt?: IsoDateTime | null;
  /** Entero >= 1 (número JSON, no texto). */
  numberOfPeople?: number | null;
  quotedPrice?: MoneyString | null;
  /** Solo junto con quotedPrice; si hay precio y se omite, se usa la moneda del restaurante. */
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Body de PATCH /reservation-requests/:id. Omitir = conservar; null = borrar. Al menos un campo. */
export interface UpdateReservationRequestBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null. */
  sourceChannel?: ContactChannel;
  commercialItemId?: Uuid | null;
  /** Si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime | null;
  numberOfPeople?: number | null;
  /** null borra el precio y, si no se envía currency, también la moneda. */
  quotedPrice?: MoneyString | null;
  currency?: CurrencyCode | null;
  comments?: string | null;
  specialRequirements?: string | null;
}

/** Destinos que además exigen reservationAt <= ahora (reloj del servidor); si no, 409. */
export const RESERVATION_STATUSES_REQUIRING_ARRIVAL: readonly ReservationStatusTarget[] = ["IN_SERVICE", "NO_SHOW"];

/** Estados que admiten PATCH /reservations/:id y PATCH /reservations/:id/reschedule. */
export const RESERVATION_EDITABLE_STATUSES: readonly ReservationStatus[] = ["CONFIRMED", "UPCOMING", "RESCHEDULED"];

/** Estados que admiten PATCH /reservations/:id/assignee. */
export const RESERVATION_ASSIGNABLE_STATUSES: readonly ReservationStatus[] = [
  "CONFIRMED",
  "UPCOMING",
  "RESCHEDULED",
  "IN_SERVICE",
];

/** Estados finales: no admiten cambio de estado, edición, reprogramación ni responsable. Sí observaciones. */
export const RESERVATION_FINAL_STATUSES: readonly ReservationStatus[] = ["COMPLETED", "CANCELLED", "NO_SHOW"];

/** true si PATCH /reservations/:id/status aceptaría `target` ahora (el mismo estado siempre responde 200). */
export function canSetReservationStatus(
  reservation: Pick<Reservation, "status" | "reservationAt">,
  target: ReservationStatusTarget,
  now: Date = new Date(),
): boolean {
  if (reservation.status === target) return true;
  if (!RESERVATION_STATUS_TRANSITIONS[reservation.status].includes(target)) return false;
  return !RESERVATION_STATUSES_REQUIRING_ARRIVAL.includes(target) || Date.parse(reservation.reservationAt) <= now.getTime();
}

/** Body de POST /reservations (solo ADMIN). Siempre crea la reserva en CONFIRMED. */
export interface CreateReservationBody {
  customerId: Uuid;
  /** Estrictamente futura. */
  reservationAt: IsoDateTime;
  /** Entero >= 1. */
  numberOfPeople: number;
  /** Activo y APPROVED. */
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id. Cambiar reservationAt deja la reserva en RESCHEDULED y agrega historial. */
export interface UpdateReservationBody {
  /** No admite null. */
  customerId?: Uuid;
  /** No admite null; si llega, tiene que ser futura aunque no cambie. */
  reservationAt?: IsoDateTime;
  /** No admite null. */
  numberOfPeople?: number;
  commercialItemId?: Uuid | null;
  notes?: string | null;
}

/** Body de PATCH /reservations/:id/assignee. null libera; la clave es obligatoria. */
export interface AssignReservationBody {
  assignedUserId: Uuid | null;
}

/** Body de POST /reservations/:id/notes. */
export interface CreateReservationNoteBody {
  /** 1–5000 tras el trim. */
  content: string;
}

/** Body de PATCH /reservations/:id/reschedule. */
export interface RescheduleReservationBody {
  /** Estrictamente futura. Si es el mismo instante, no hay cambios. */
  reservationAt: IsoDateTime;
  /** 1–5000 tras el trim. */
  reason?: string | null;
}
```

```ts
// src/lib/api/types.ts · añade (bandeja y Samanta)
/** Canales en los que bk-crm puede enviar (tienen transporte registrado). */
export type SendableChannel = Extract<ContactChannel, "WHATSAPP" | "FACEBOOK">;
export const SENDABLE_CHANNELS: readonly SendableChannel[] = ["WHATSAPP", "FACEBOOK"];

/** Acota un ContactChannel a los canales con envío. */
export function isSendableChannel(channel: ContactChannel): channel is SendableChannel {
  return (SENDABLE_CHANNELS as readonly ContactChannel[]).includes(channel);
}

/** Máximo de content.length (unidades UTF-16, igual que String.length) por canal. */
export const OUTBOUND_TEXT_MAX_LENGTH: Readonly<Record<SendableChannel, number>> = {
  WHATSAPP: 4096,
  FACEBOOK: 2000,
};

/** Prefijo reservado: el backend usa "samanta-<draftId>" al aprobar un borrador. */
export const RESERVED_IDEMPOTENCY_PREFIX = "samanta-";

/** Códigos de `Message.errorCode` en mensajes entrantes. */
export type InboundMessageErrorCode =
  /** RECEIVED: fallo temporal, el worker reintenta solo. */
  | "MESSAGE_PROCESSING_TEMPORARY"
  /** FAILED: el mensaje no pasó la validación interna. */
  | "MESSAGE_INVALID"
  /** FAILED: se agotaron los 5 intentos de procesamiento. */
  | "MESSAGE_ATTEMPTS_EXHAUSTED";

/** Códigos de `Message.errorCode` en mensajes salientes (prefijo WHATSAPP_ o MESSENGER_). */
export type OutboundMessageErrorCode =
  | "WHATSAPP_RATE_LIMITED"
  | "WHATSAPP_SEND_UNKNOWN"
  | "WHATSAPP_SEND_INVALID"
  | "WHATSAPP_WINDOW_CLOSED"
  | "WHATSAPP_SEND_REJECTED"
  | "WHATSAPP_DELIVERY_FAILED"
  | "MESSENGER_RATE_LIMITED"
  | "MESSENGER_SEND_UNKNOWN"
  | "MESSENGER_SEND_INVALID"
  | "MESSENGER_WINDOW_CLOSED"
  | "MESSENGER_SEND_REJECTED"
  | "MESSENGER_DELIVERY_FAILED";

export type MessageErrorCode = InboundMessageErrorCode | OutboundMessageErrorCode;

/** APPROVED, REJECTED, STALE y FAILED son finales. */
export type SamantaDraftStatus = "GENERATING" | "READY" | "APPROVED" | "REJECTED" | "STALE" | "FAILED";

export const SAMANTA_DRAFT_FINAL_STATUSES: readonly SamantaDraftStatus[] = ["APPROVED", "REJECTED", "STALE", "FAILED"];

/** Acciones que admite cada estado (todas exigen la `revision` actual). */
export const SAMANTA_DRAFT_ACTIONS: Readonly<Record<SamantaDraftStatus, readonly ("edit" | "approve" | "reject")[]>> = {
  GENERATING: [],
  READY: ["edit", "approve", "reject"],
  APPROVED: [],
  REJECTED: [],
  STALE: [],
  FAILED: [],
};

/** Intención que detecta la IA. */
export type SamantaIntent = "GENERAL" | "RESERVATION" | "CANCELLATION" | "HUMAN" | "OTHER";

/** Códigos de error de un borrador FAILED. */
export type SamantaErrorCode =
  | "AI_TIMEOUT"
  | "AI_RATE_LIMITED"
  | "AI_REQUEST_REJECTED"
  | "AI_INVALID_RESPONSE"
  | "AI_INCOMPLETE_RESPONSE"
  | "AI_REFUSED_RESPONSE"
  | "AI_RESPONSE_TOO_LARGE"
  | "AI_UNAVAILABLE"
  | "AI_GENERATION_EXPIRED";

/** Máximo de content.length de un borrador (texto de la IA y texto editado). */
export const SAMANTA_DRAFT_MAX_LENGTH = 4096;

/** Body de POST /conversations/:id/assistant-drafts (+ cabecera Idempotency-Key). */
export interface GenerateSamantaDraftRequest {
  /** Id del último mensaje de la conversación: INBOUND, TEXT, no vacío, content.length ≤ 4096. */
  sourceMessageId: Uuid;
}

/** Body de POST …/approve y POST …/reject. */
export interface ReviewSamantaDraftRequest {
  /** Revisión actual del borrador (entero 1–2 147 483 646). */
  revision: number;
}

/** Body de PATCH /conversations/:id/assistant-drafts/:draftId. */
export interface EditSamantaDraftRequest extends ReviewSamantaDraftRequest {
  /** Al menos un carácter no blanco; content.length ≤ 4096. Se guarda sin recortar. */
  content: string;
}

/** Borrador de Samanta: fila completa que devuelven todas sus rutas. */
export interface SamantaDraft {
  id: Uuid;
  conversationId: Uuid;
  /** Mensaje INBOUND al que responde. */
  sourceMessageId: Uuid;
  /** `sequence` del último mensaje al generar. Si llega otro mensaje, el borrador queda STALE. */
  baselineSequence: number;
  /** Clave Idempotency-Key usada al generar. */
  idempotencyKey: string;
  createdById: Uuid;
  /** Quien aprobó o rechazó. */
  reviewedById: Uuid | null;
  /** Último usuario que editó el texto. */
  editedById: Uuid | null;
  status: SamantaDraftStatus;
  /** Empieza en 1 y suma 1 con cada edición. Se envía en editar, aprobar y rechazar. */
  revision: number;
  /** Modelo de IA (SAMANTA_MODEL). */
  model: string;
  /** Versión del prompt ("samanta-drafts-v1"). */
  promptVersion: string;
  /** SHA-256 (hex) de la información comercial usada. */
  knowledgeHash: string;
  /** Texto original de la IA. null si la IA no llegó a dar un texto utilizable. */
  originalContent: string | null;
  /** Texto actual (el editado, si se editó). null mientras no haya texto de la IA. */
  content: string | null;
  /** null hasta que la IA responde. */
  intent: SamantaIntent | null;
  /** true por defecto; luego lo decide la IA. No se recalcula al editar. */
  requiresHuman: boolean;
  /** Datos que faltan, en texto libre (máx. 8 de hasta 80 caracteres). */
  missingFields: string[];
  /** null hasta que la IA responde. Pueden venir en STALE o FAILED si la IA respondió tarde. */
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: SamantaErrorCode | null;
  /** Límite de la generación (inicio + SAMANTA_TIMEOUT_MS + 10 s). Después pasa a FAILED. */
  generationExpiresAt: IsoDateTime;
  /** Inicio + 15 min. Después pasa a STALE. */
  expiresAt: IsoDateTime;
  reviewedAt: IsoDateTime | null;
  /** Mensaje OUTBOUND creado al aprobar. */
  outboundMessageId: Uuid | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Respuesta de GET /conversations/:id/assistant-drafts: hasta 50, los más recientes primero. */
export interface SamantaDraftListResponse {
  data: SamantaDraft[];
}
```

Lo que no se añade a `types.ts`, aunque esté en los bloques de los módulos:
- los tipos de los webhooks de Meta (`WhatsAppWebhookPayload`, `MessengerWebhookPayload`, `MetaWebhookAck`, `MetaWebhookVerifyQuery`): el frontend no los usa;
- las uniones de mensajes literales de [01](#tipos-typescript) (`LoginErrorMessage`, `UserConflictMessage`…): son documentación; compara con el texto solo cuando la UI necesite reaccionar a un caso concreto;
- lo que solo ve el BFF: `AccessTokenClaims`, `RefreshTokenClaims`, `LogoutResponse` y las respuestas literales de bk-crm a `forgot-password` y `reset-password` (el navegador recibe las del BFF, que `sessionApi` tipa como `{ message: string }`);
- `BffForgotPasswordResponse` y `BffResetPasswordResponse`: documentan el texto exacto que devuelve el BFF, pero `sessionApi` ya las tipa como `{ message: string }`;
- `AppRootResponse` y `TestAdminResponse`: son de `GET /` y `GET /auth/test-admin`, que el navegador no usa;
- los alias `UserListResponse`, `CommercialCategoryListResponse` y `CommercialItemListResponse`, que equivalen a `User[]`, `CommercialCategory[]` y `Paginated<CommercialItem>`;
- `InternalErrorResponse` (03 y 04): describe el 500, que aquí cubren los campos opcionales de `ApiErrorBody`;
- `IdempotencyHeaders`: la cabecera la pone `endpoints.ts`;
- los mapas de rutas `ConfigCatalogRoutes` y `ClientesReservasRoutes`.

Ajustes fuera de `src/lib/api/` que implica este cambio:
- `src/features/ajustes/servicios/servicios-logic.test.ts`: completa los dos `promotionDetail` del test con `id`, `createdAt` y `updatedAt`.
- `src/lib/domain/channels.ts`: elimina su `SENDABLE_CHANNELS`, que solo incluye `WHATSAPP`. En `composerState` (`src/features/bandeja/inbox-utils.ts`), cambia `SENDABLE_CHANNELS.includes(conversation.channel)` por `isSendableChannel(conversation.channel)`. Con el nuevo tipo `readonly SendableChannel[]`, `includes` no acepta un `ContactChannel`.
- `src/features/ajustes/servicios/servicios-logic.ts`: su `MONEY_PATTERN` es la misma expresión que la de `types.ts`. Importa la de `types.ts` para no tener dos.
- El mock no necesita cambios para compilar: arma `images: []`, `promotionDetail: null` y `errorCode: null`.

#### 2.3 `query-keys.ts`

Archivo completo. Las claves nuevas siguen la convención actual: el detalle usa el segmento `"detail"` y cuelga del prefijo del recurso, así que invalidar el prefijo también lo invalida.

```ts
// src/lib/api/query-keys.ts
/** Claves de TanStack Query. Agrupadas por recurso para invalidar en bloque tras una mutación. */
export const qk = {
  me: ["me"] as const,
  config: ["restaurant-config"] as const,
  users: ["users"] as const,
  /** NUEVA · GET /users/:id. Cuelga de qk.users. */
  user: (id: string) => ["users", "detail", id] as const,
  categories: ["commercial-categories"] as const,
  /** NUEVA · GET /commercial-categories/:id. Cuelga de qk.categories. */
  category: (id: string) => ["commercial-categories", "detail", id] as const,
  items: (query: object) => ["commercial-items", query] as const,
  /** NUEVA · GET /commercial-items/:id. Cuelga de qk.itemsAll. */
  item: (id: string) => ["commercial-items", "detail", id] as const,
  itemsAll: ["commercial-items"] as const,
  customers: (query: object) => ["customers", "list", query] as const,
  customer: (id: string) => ["customers", "detail", id] as const,
  customersAll: ["customers"] as const,
  requests: (query: object) => ["reservation-requests", "list", query] as const,
  /** NUEVA · GET /reservation-requests/:id. Cuelga de qk.requestsAll. */
  request: (id: string) => ["reservation-requests", "detail", id] as const,
  requestsAll: ["reservation-requests"] as const,
  reservations: (query: object) => ["reservations", "list", query] as const,
  reservation: (id: string) => ["reservations", "detail", id] as const,
  reservationsAll: ["reservations"] as const,
  conversations: (query: object) => ["conversations", "list", query] as const,
  conversation: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["conversations", "messages", id] as const,
  /** Vista previa del último mensaje: cambia solo cuando cambia lastMessageAt. */
  lastMessage: (id: string, lastMessageAt: string | null) => ["conversations", "last-message", id, lastMessageAt] as const,
  /** NUEVA · GET /conversations/:id/assistant-drafts. Cuelga de qk.conversationsAll. */
  assistantDrafts: (conversationId: string) => ["conversations", "assistant-drafts", conversationId] as const,
  /** NUEVA · GET /conversations/:id/assistant-drafts/:draftId. Cuelga de qk.assistantDrafts(conversationId). */
  assistantDraft: (conversationId: string, draftId: string) =>
    ["conversations", "assistant-drafts", conversationId, draftId] as const,
  conversationsAll: ["conversations"] as const,
  stats: (period: string, anchor: string) => ["stats", period, anchor] as const,
  /** NUEVA · prefijo de todas las consultas de Estadísticas (se calculan con reservas, solicitudes y conversaciones). */
  statsAll: ["stats"] as const,
};
```

Qué guarda cada clave hoy y quién la usa:

| Clave | Valor | Guarda | Quién la usa |
|---|---|---|---|
| `qk.me` | `["me"]` | `MeResponse` | `SessionProvider` |
| `qk.config` | `["restaurant-config"]` | `RestaurantConfig` | `useRestaurant()`, `useConfigSave()` |
| `qk.users` | `["users"]` | `User[]` | Ajustes › Usuarios y Ajustes › Samanta |
| `qk.user(id)` · nueva | `["users", "detail", id]` | `User` | Ficha o edición de usuario |
| `qk.categories` | `["commercial-categories"]` | `CommercialCategory[]` | `NuevoServicioForm` |
| `qk.category(id)` · nueva | `["commercial-categories", "detail", id]` | `CommercialCategory` | Edición de categoría |
| `qk.items(query)` | `["commercial-items", query]` | `Paginated<CommercialItem>` | `ServiciosView` |
| `qk.item(id)` · nueva | `["commercial-items", "detail", id]` | `CommercialItem` | Ficha o editor de elemento |
| `qk.customers(query)` | `["customers", "list", query]` | `Paginated<Customer>` | `ClientesView` |
| `qk.customer(id)` | `["customers", "detail", id]` | `CustomerDetail` | Clientes (columna CONSULTÓ), panel de la Bandeja, detalle de reserva |
| `qk.requests(query)` | `["reservation-requests", "list", query]` | Varía (ver abajo) | Solicitudes, Bandeja y su panel |
| `qk.request(id)` · nueva | `["reservation-requests", "detail", id]` | `ReservationRequest` | Detalle o edición de solicitud |
| `qk.reservations(query)` | `["reservations", "list", query]` | Varía (ver abajo) | Calendario, Clientes y panel de la Bandeja |
| `qk.reservation(id)` | `["reservations", "detail", id]` | `ReservationDetail` | Detalle del Calendario |
| `qk.conversations(query)` | `["conversations", "list", query]` | `Paginated<Conversation>`; el contador de no leídos guarda `{ messages, partial }` | Bandeja |
| `qk.conversation(id)` | `["conversations", "detail", id]` | `Conversation` | Bandeja |
| `qk.messages(id)` | `["conversations", "messages", id]` | `Paginated<Message>` (página 1) | Chat |
| `qk.lastMessage(id, lastMessageAt)` | `["conversations", "last-message", id, lastMessageAt]` | `Message \| null` | Vista previa de la lista |
| `qk.assistantDrafts(conversationId)` · nueva | `["conversations", "assistant-drafts", conversationId]` | `SamantaDraftListResponse` | Panel de Samanta |
| `qk.assistantDraft(conversationId, draftId)` · nueva | `["conversations", "assistant-drafts", conversationId, draftId]` | `SamantaDraft` | Borrador en `GENERATING` o abierto |
| `qk.stats(period, anchor)` | `["stats", period, anchor, …]` | Resultado de `collectPages` (reservas y solicitudes) o de `collectConversationsSince` (conversaciones) | Estadísticas (añade `toIso` y la fuente a la clave) |
| `qk.statsAll` · nueva | `["stats"]` | Prefijo | Invalidar Estadísticas |

Bajo un mismo prefijo conviven valores de forma distinta:
- `["reservation-requests", "list", …]`: `Paginated<ReservationRequest>`, un `number` (los KPI de Solicitudes, `{ count: status }`), un `ReservationRequest | null` (la etiqueta de cada fila de la Bandeja, `{ customerId, limit: 1 }`) y el objeto con `truncated` de la pestaña Esperando.
- `["reservations", "list", …]`: `Paginated<Reservation>`, el `CollectedPages<Reservation>` del calendario (`{ scope: "calendario", … }`) y el `Reservation[]` del historial del panel (`{ customerId, history: true }`).

Por eso, en esos prefijos **invalida; no uses `setQueriesData`**. En las conversaciones, `storeConversation` sí usa `setQueriesData`, pero comprueba `Array.isArray(page.data)` antes de tocar cada valor: copia esa guarda si escribes otro actualizador.

Opcional, no incluida: `["ready"]`, si alguna pantalla muestra un indicador de conexión con `fetch("/api/listo")` (`apiFetch` no sirve, porque antepone `/api/backend`).

##### Mapa de invalidaciones

Qué hacer en la caché tras cada mutación. «Mezcla» significa `setQueryData(clave, (old) => (old ? { ...old, ...respuesta } : old))`, para no perder los campos que la respuesta no trae.

| Mutación | Con la respuesta | Invalida |
|---|---|---|
| `usersApi.create` | — | `qk.users` |
| `usersApi.update` | `setQueryData(qk.user(id))` | `qk.users`; `qk.me` si es el propio usuario; `qk.conversationsAll` y `qk.reservationsAll` si cambió el nombre; `qk.config` si cambió el nombre o el email (por `approvalResponsible`) |
| `usersApi.setActive` | Fila de `qk.users` (optimista, ya en `UsuariosView`) y `qk.user(id)` | `qk.users`, `qk.conversationsAll`, `qk.reservationsAll` |
| `usersApi.setRoles` | Fila de `qk.users` y `qk.user(id)` | `qk.me` si es el propio usuario; `qk.conversationsAll` y `qk.reservationsAll` si cambió ADMIN u OPERATOR |
| `configApi.put` | `setQueryData(qk.config)` (ya en `useConfigSave`) | — |
| `catalogApi.createCategory` | — | `qk.categories` |
| `catalogApi.updateCategory`, `setCategoryActive` | `setQueryData(qk.category(id))` | `qk.categories`, `qk.itemsAll` |
| `catalogApi.create` | Opcional: `setQueryData(qk.item(id))` | `qk.itemsAll` |
| `catalogApi.update`, `setActive`, `setApproval` | `setQueryData(qk.item(id))` | `qk.itemsAll`; además `qk.customersAll`, `qk.requestsAll` y `qk.reservationsAll` si una pantalla muestra el resumen `commercialItem` |
| `customersApi.create` | — | `qk.customersAll` |
| `customersApi.update` | Mezcla en `qk.customer(id)` | `qk.customersAll`; si cambió nombre, teléfono o email, también `qk.conversationsAll`, `qk.requestsAll` y `qk.reservationsAll` |
| `customersApi.setStatus` | Mezcla en `qk.customer(id)` | `qk.customersAll` |
| `customersApi.addInterest`, `removeInterest` | — | `qk.customersAll` |
| `requestsApi.create` | — | `qk.requestsAll`, `qk.statsAll` |
| `requestsApi.update`, `cancel` | `setQueryData(qk.request(id))` | `qk.requestsAll`, `qk.statsAll` |
| `reservationsApi.create` | — | `qk.reservationsAll`, `qk.statsAll` |
| `reservationsApi.update`, `setStatus`, `reschedule` | Mezcla en `qk.reservation(id)` | `qk.reservationsAll`, `qk.statsAll` |
| `reservationsApi.assign` | Mezcla en `qk.reservation(id)` | `qk.reservationsAll` |
| `reservationsApi.addNote` | Añade la nota al final de `noteHistory` en `qk.reservation(id)`, o invalida esa clave | — |
| `conversationsApi.send` | `storeSentMessage` en `qk.messages(id)` | `["conversations", "list"]`, `qk.conversation(id)`, `qk.assistantDrafts(id)` |
| `conversationsApi.markRead` | `storeConversationRead` | `["conversations", "list"]`, `qk.conversation(id)` |
| `conversationsApi.setAssistantPaused` | `storeConversation` | `["conversations", "list"]`, `qk.assistantDrafts(id)` |
| `conversationsApi.assign` | `storeConversation` | `["conversations", "list"]` |
| `assistantDraftsApi.generate` | `setQueryData(qk.assistantDraft(id, draft.id))` | `qk.assistantDrafts(id)` |
| `assistantDraftsApi.edit`, `reject` | `setQueryData(qk.assistantDraft(id, draftId))` | `qk.assistantDrafts(id)` |
| `assistantDraftsApi.approve` | `setQueryData(qk.assistantDraft(id, draftId))` | `qk.assistantDrafts(id)`, `qk.messages(id)`, `qk.conversation(id)`, `["conversations", "list"]` |

Las solicitudes y las reservas incluyen el resumen del cliente y del elemento, y las conversaciones el del cliente. Por eso algunas mutaciones de clientes y catálogo invalidan también esas claves.

#### 2.4 Cómo se comprobó

- Se copió `ft-crm/src/lib/api/client.ts` sin cambios. `types.ts` se armó aplicando al archivo actual los bloques «reemplaza» y «añade» de esta sección, tal como están escritos aquí. `endpoints.ts`, `query-keys.ts` y `errors.ts` ([§4](#42-errores-de-validación-por-campo)) se extrajeron de los bloques de esta guía.
- Los cinco archivos compilan juntos con `tsc --noEmit --strict --target es2022 --lib es2022,dom --module esnext --moduleResolution bundler --skipLibCheck`.
- Los ejemplos `// ejemplo:` de las secciones 3 y 4 compilan contra esos archivos y contra `@tanstack/react-query` de ft-crm.
- También se comprobó ft-crm completo, en memoria y sin escribir en el repo: su `tsconfig.json` y su TypeScript 5.9.3, con estos cuatro archivos en lugar de los actuales. Sin más cambios, solo fallan las líneas 116 y 137 de `servicios-logic.test.ts` (falta `id`, `createdAt` y `updatedAt` en `promotionDetail`). Con ellas completadas, compila sin errores, también tras quitar `SENDABLE_CHANNELS` de `channels.ts` y usar `isSendableChannel` en `composerState`, y con los cuatro ejemplos copiados en la ruta que indica su primera línea.
- No se ejecutaron `next typegen` ni las pruebas. Después de aplicar los cambios, ejecuta `npm run typecheck` y `npm test`.

### 3. Guía por pantalla

Cada ficha dice qué rutas usa la pantalla, con qué función y clave de caché, cada cuánto se actualiza, qué invalidar tras cada cambio, qué ve cada rol, cómo mostrar los estados vacíos y de error, y qué falta en el backend. Los intervalos de polling son los del código actual.

Índice de pantallas:
- [Marco del CRM](#marco-del-crm) (todas las pantallas con sesión)
- [Login](#login) · [Olvidé mi contraseña](#olvidé-mi-contraseña) · [Restablecer contraseña](#restablecer-contraseña-1)
- [Bandeja](#bandeja) · [Calendario](#calendario) · [Clientes](#clientes) · [Solicitudes](#solicitudes) · [Estadísticas](#estadísticas)
- [Ajustes](#ajustes): [Empresa](#ajustes--empresa) · [Horarios](#ajustes--horarios) · [Políticas](#ajustes--políticas) · [Samanta](#ajustes--samanta) · [Servicios](#ajustes--servicios) · [Usuarios](#ajustes--usuarios)

Acciones de `src/lib/auth/permissions.ts` que faltan para las funciones nuevas (propuesta; se usan en las fichas):

| Acción nueva | Roles | Para |
|---|---|---|
| `draft.review` | ADMIN, OPERATOR | Generar, editar, aprobar y rechazar borradores de Samanta |
| `customer.create` | ADMIN, OPERATOR | `customersApi.create`, `update`, `addInterest` y `removeInterest` (hoy `customer.edit` cubre los mismos roles; puedes reutilizarla) |
| `request.edit` | ADMIN, OPERATOR | `requestsApi.create` y `update` |
| `reservation.create` | ADMIN | `reservationsApi.create` |
| `reservation.edit` | ADMIN, OPERATOR | `reservationsApi.update`, `assign`, `addNote` y `reschedule` |

Las acciones de catálogo (`catalog.edit`) y de usuarios (`users.manage`) ya cubren las funciones nuevas de esos objetos: son solo para ADMIN.

#### Marco del CRM

`src/app/(crm)/layout.tsx` → `CrmShell` (`src/components/shell/crm-shell.tsx`), con `SessionProvider` (`src/lib/auth/session.tsx`) y `Sidebar`. La configuración no la pide el marco: cada vista llama a `useRestaurant()` (`src/lib/restaurant.tsx`) para la zona horaria y la moneda, y todas comparten `qk.config`.

| Uso | Ruta | Función | Estado | Caché y polling |
|---|---|---|---|---|
| Usuario y roles | `GET /auth/me` | `sessionApi.me` | existe | `qk.me`: `staleTime` 60 s, `refetchInterval` 5 min |
| Zona horaria y moneda | `GET /restaurant-config` | `configApi.get` | existe | `qk.config`: `staleTime` 5 min, sin polling |
| Cerrar sesión | `POST /auth/logout`, vía `/api/auth/logout` | `sessionApi.logout` | existe | `queryClient.clear()` y `/login` |

- **Sesión.** Cualquier 401 de `apiFetch` emite `crm:session-expired`. `SessionProvider` limpia la caché y lleva a `/login?motivo=sesion&next=<ruta>`. Antes, `src/proxy.ts` ya manda a `/login` a quien no tiene cookies.
- **Roles.** Salen de `GET /auth/me`, que bk-crm relee de la base de datos en cada petición. Un cambio de roles se nota en el siguiente `me` (como mucho 5 min) o en el primer 403.
- **SUPPORT.** No tiene ninguna vista: `homePathFor` devuelve `null` y el marco muestra «Tu rol no tiene vistas habilitadas». Es coherente con bk-crm, que solo le deja usar `/auth/me` y el logout.
- **Configuración.** `useRestaurant()` solo consulta con la sesión lista y un rol que puede ver Ajustes (ADMIN, OWNER u OPERATOR). Un 404 significa que el restaurante no está configurado (`missing`), y no se reintenta. Mientras no hay configuración, las fechas se muestran en `America/Lima` y los importes en `PEN`.
- **Errores.** Si `GET /auth/me` falla por otra causa que no sea 401, el marco muestra `ErrorState` con «Reintentar». Con un 503 o 504 `BACKEND_UNAVAILABLE`, el título es «No se pudo cargar tu sesión.».
- **Falta en el backend.** No hay endpoint para saber qué está habilitado en el servidor (WhatsApp, Messenger, Samanta), ni para listar roles ni para cambiar la contraseña con la sesión abierta.

#### Login

`/login` · `src/app/(auth)/login/login-form.tsx`

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Iniciar sesión | `POST /auth/login`, vía `/api/auth/login` | `sessionApi.login(email, password)` | existe | Ninguna |

- **Validación en el cliente.** Hoy comprueba que haya correo y que la contraseña tenga al menos 8 caracteres. El BFF vuelve a validar con zod: correo con `trim`, en minúsculas y de hasta 320 caracteres; contraseña de 8 a 200.
- **Mensajes.** `sessionApi.login` lanza `Error` con el texto del BFF: muéstralo tal cual. La tabla completa está en [Iniciar sesión](#iniciar-sesión):

  | Caso | `message` |
  |---|---|
  | Correo o contraseña con formato inválido (BFF) | `Ingresa un correo válido y una contraseña de al menos 8 caracteres.` |
  | Credenciales incorrectas o usuario inactivo | `Correo o contraseña incorrectos.` |
  | Sexto intento en 60 s con la misma IP y el mismo correo | `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` |
  | bk-crm no responde | Texto del BFF (`BACKEND_UNAVAILABLE`) |

- **Tras el éxito.** Llama a `queryClient.clear()` antes de `router.replace(destino)`; hoy no se hace. Si alguien entra con otra cuenta sin cerrar la anterior, `qk.me` podría mostrar al usuario anterior durante su `staleTime`. El destino es `safeNextPath(next) ?? homePathFor(user.roles) ?? "/bandeja"`.
- **Límite de intentos.** 5 cada 60 s por IP y correo, contando también los logins correctos. Detrás del BFF la IP es siempre la del servidor de Next.js, así que en la práctica el límite es por correo. El BFF no reenvía `Retry-After`: tras un 429, deshabilita el botón durante 60 s.
- **Avisos de la URL.** `?motivo=sesion` y `?motivo=restablecida` ya tienen su aviso.
- **Falta en el backend.** No hay registro público ni forma de saber que la cuenta está inactiva (el mensaje es el mismo que el de una contraseña errónea).

#### Olvidé mi contraseña

`/olvide-contrasena` · `src/app/(auth)/olvide-contrasena/page.tsx`

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Pedir el enlace | `POST /auth/forgot-password`, vía `/api/auth/forgot-password` | `sessionApi.forgotPassword(email)` | existe | Ninguna |

- **Respuesta.** Siempre la misma, exista o no el correo: `Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.` Muéstrala sin decir si la cuenta existe.
- **Errores del BFF:**
  - 400 `Ingresa un correo válido.`;
  - 429 `Hiciste demasiados intentos. Espera un minuto e inténtalo otra vez.` (3 pedidos cada 60 s por IP y correo);
  - 502 `No se pudo enviar el enlace. Inténtalo de nuevo.`;
  - 503 o 504 con `BACKEND_UNAVAILABLE`.
- **Enlace.** Vence a los `PASSWORD_RESET_TOKEN_TTL_MINUTES` minutos (15 por defecto). Pedir otro invalida el anterior: sugiere usar el correo más reciente. Un usuario inactivo no recibe correo, pero la respuesta es la misma ([Solicitar recuperación de contraseña](#solicitar-recuperación-de-contraseña)).

#### Restablecer contraseña

`/reset-password?token=…` · `src/app/(auth)/reset-password/reset-form.tsx`

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Guardar la nueva contraseña | `POST /auth/reset-password`, vía `/api/auth/reset-password` | `sessionApi.resetPassword(token, newPassword)` | existe | Ninguna |

- **Enlace.** bk-crm lo arma con `FRONTEND_RESET_PASSWORD_URL`, que debe apuntar a `<origen de ft-crm>/reset-password`. El formulario solo aparece si `token` tiene 64 caracteres hexadecimales.
- **Reglas.** Contraseña de 8 a 72 caracteres, igual a la confirmación (esto último se comprueba solo en el cliente). bcrypt solo usa los primeros 72 bytes en UTF-8: con tildes, `ñ` o emojis, el final de una contraseña larga se ignora sin aviso. Si quieres evitarlo, limita en bytes (`new TextEncoder().encode(clave).length <= 72`); está pendiente de decisión ([01, Preguntas abiertas](#preguntas-abiertas-1)).
- **Mensajes del BFF:**
  - éxito: `Contraseña restablecida correctamente.` y redirección a `/login?motivo=restablecida`;
  - 400 de formato: `El enlace no es válido o la contraseña no cumple el largo (8 a 72 caracteres).`;
  - enlace usado, vencido o de un usuario inactivo: `El enlace de recuperación es inválido o ha expirado. Solicita uno nuevo.`;
  - 429 (5 intentos cada 60 s por IP y enlace) y 502 `No se pudo cambiar la contraseña. Inténtalo de nuevo.`.
- **Efecto.** bk-crm revoca todas las sesiones del usuario. Si tenía el CRM abierto en otra pestaña, su siguiente llamada termina en `SESSION_EXPIRED`.

#### Bandeja

`/bandeja` · `src/features/bandeja/`: `bandeja-view.tsx`, `conversation-list.tsx`, `chat-panel.tsx`, `customer-panel.tsx`, `use-inbox.ts`, `use-conversation-actions.ts` e `inbox-utils.ts`. Estado en la URL: `c` (conversación), `canal` y `q` (búsqueda).

| Uso | Ruta | Función | Estado | Caché y polling |
|---|---|---|---|---|
| Lista | `GET /conversations` | `conversationsApi.list` | existe | `qk.conversations({ channel, search, limit })`, cada 6 s (`INBOX_POLL_MS`) |
| Contador «N sin leer» | `GET /conversations?unreadOnly=true&limit=100` | `conversationsApi.list` | existe | `qk.conversations({ unreadOnly: true, limit: 100 })`, cada 6 s |
| Vista previa de cada fila | `GET /conversations/:id/messages?limit=1` | `conversationsApi.messages` | existe | `qk.lastMessage(id, lastMessageAt)`, `staleTime` infinito |
| Etiqueta de cada fila | `GET /reservation-requests?limit=100` y, si falta, `?customerId=…&limit=1` | `requestsApi.list` | existe | `qk.requests({ recent: 100 })`, cada 30 s |
| Conversación abierta | `GET /conversations/:id` | `conversationsApi.get` | existe | `qk.conversation(id)`, cada 6 s |
| Chat | `GET /conversations/:id/messages?page=1&limit=50` | `conversationsApi.messages` | existe | `qk.messages(id)`, cada 4 s (`CHAT_POLL_MS`) o cada 1,5 s con salientes en `QUEUED` o `SENDING` |
| Marcar como leído | `PATCH /conversations/:id/read` | `conversationsApi.markRead` | existe | `storeConversationRead` |
| Pausar o reanudar a Samanta | `PATCH /conversations/:id/assistant` | `conversationsApi.setAssistantPaused` | existe | `storeConversation` |
| Tomar, liberar o asignar | `PATCH /conversations/:id/assignee` | `conversationsApi.assign` | existe | `storeConversation` |
| Enviar | `POST /conversations/:id/messages` | `conversationsApi.send` | existe | `storeSentMessage` |
| Borradores de Samanta | `GET /conversations/:id/assistant-drafts` | `assistantDraftsApi.list` | nueva | `qk.assistantDrafts(id)` |
| Un borrador | `GET /conversations/:id/assistant-drafts/:draftId` | `assistantDraftsApi.get` | nueva | `qk.assistantDraft(id, draftId)`, cada 2–3 s mientras esté en `GENERATING` |
| Generar, editar, aprobar o rechazar | `POST`, `PATCH`, `POST …/approve`, `POST …/reject` | `assistantDraftsApi.generate`, `edit`, `approve`, `reject` | nueva | Ver el [mapa de invalidaciones](#mapa-de-invalidaciones) |
| Panel: solicitud vigente | `GET /reservation-requests?customerId=…&limit=20` | `requestsApi.list` | existe | `qk.requests({ customerId, limit: 20 })`, cada 30 s |
| Panel: cliente | `GET /customers/:id` | `customersApi.get` | existe | `qk.customer(customerId)`, `staleTime` 60 s |
| Panel: historial | `GET /reservations?customerId=…&limit=100` (y las dos últimas páginas) | `reservationsApi.list` | existe | `qk.reservations({ customerId, history: true })`, `staleTime` 60 s |

**Tras cada acción.** `useConversationActions` invalida `["conversations", "list"]` y `qk.conversation(id)` al terminar. Añade `qk.assistantDrafts(id)` tras enviar y tras pausar: los borradores pendientes pasan a `STALE`.

**Permisos.** El detalle de cada regla está en [04](#conversación-pausa-y-responsable).

| Acción | ADMIN | OPERATOR | OWNER | En ft-crm |
|---|---|---|---|---|
| Ver lista, chat, panel y borradores | Sí | Sí | Sí | `canView("bandeja")` |
| Marcar como leído | Sí | Sí | No (403) | `can("conversation.read")`: con OWNER no se llama |
| Enviar | Sí | Sí, aunque la atienda otra persona | No | `can("conversation.send")`. `composerState` bloquea al OPERATOR si la atiende otra persona: es una regla de la UI, no del backend. |
| Pausar o reanudar | Sí | Sí | No | `can("conversation.pause")` |
| Asignar a cualquier usuario elegible | Sí | No | No | Sin interfaz: `conversationControls` solo ofrece «Pasar a humano» (asignársela a uno mismo) y «Devolver a Samanta» (liberarla). Para elegir a otra persona, lista los candidatos con `usersApi.list()` (solo ADMIN) y filtra los activos con ADMIN u OPERATOR. |
| Tomar una libre o liberar la propia | Sí (también tomar o liberar la de otra persona) | Sí | No | `conversationControls` |
| Generar, editar, aprobar o rechazar borradores | Sí | Sí, salvo si la conversación está asignada a otra persona (403 `Conversación asignada a otro operador`) | No | `can("draft.review")` (nueva) |

**Messenger (canal `FACEBOOK`).** Hoy no se puede responder en Messenger. Cambios:
- **Canal.** En `composerState`, usa `isSendableChannel(conversation.channel)`. Exige `customer.phone` solo en `WHATSAPP`: en Messenger no hay teléfono, y el backend resuelve el destinatario con el PSID, que no se expone.
- **Tope.** Usa `OUTBOUND_TEXT_MAX_LENGTH[channel]` en el `maxLength` del textarea y en el contador. Hoy ambos usan `OUTBOUND_CONTENT_MAX_LENGTH` (4096) y el contador aparece a 300 del tope.
- **Ventana de 24 h.** Aplica `estimateReplyWindow` también a `FACEBOOK`: `chat-panel.tsx` hoy solo lo hace en `WHATSAPP`. El texto de ventana cerrada es distinto por canal: en Messenger hay que esperar a que el cliente escriba.
- **Fallos.** `FAILED_TEXT` y `outboundStatusView` solo conocen códigos `WHATSAPP_*`. Usa el sufijo del código, como en el ejemplo de abajo. Messenger nunca llega a `READ`: su último estado posible es `DELIVERED`.
- **Errores al enviar.** Hoy `sendErrorText` ya muestra con el texto del backend un 503 `Messenger no está habilitado` y un 400 `Messenger admite hasta 2000 caracteres por respuesta`: solo trata como falta de conexión los status 0, 502 y 504. Lo que falla es que describe todo 409 de ventana (también `Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje`) y todo 400 de destinatario (`Conversación sin destinatario habilitado`) como si fueran de WhatsApp. Elige el texto según `conversation.channel`.
- **Nombre.** `customerName` termina en «Cliente sin nombre». Los clientes de Messenger no tienen teléfono ni email; normalmente traen en `firstName` el nombre que da Meta, pero puede faltar. Usa «Cliente de Messenger» como respaldo.

```ts
// ejemplo: src/features/bandeja/channel-utils.ts — tope, textos de fallo y nombre según el canal
import {
  isSendableChannel,
  OUTBOUND_TEXT_MAX_LENGTH,
  type ContactChannel,
  type CustomerSummary,
  type Message,
  type OutboundMessageErrorCode,
} from "@/lib/api/types";

/** Tope de content.length del Composer, o null si el canal no tiene envío. */
export function replyMaxLength(channel: ContactChannel): number | null {
  return isSendableChannel(channel) ? OUTBOUND_TEXT_MAX_LENGTH[channel] : null;
}

type Suffix<T> = T extends `${"WHATSAPP" | "MESSENGER"}_${infer S}` ? S : never;
/** "RATE_LIMITED" | "SEND_UNKNOWN" | "SEND_INVALID" | "WINDOW_CLOSED" | "SEND_REJECTED" | "DELIVERY_FAILED" */
export type OutboundErrorKind = Suffix<OutboundMessageErrorCode>;

/** Textos sugeridos en 04 (Estados y transiciones), válidos para los dos canales. */
export const OUTBOUND_ERROR_TEXT: Record<OutboundErrorKind, string> = {
  RATE_LIMITED: "Reintentando…",
  SEND_UNKNOWN: "Estado incierto: verifica antes de reenviar",
  SEND_INVALID: "No se envió",
  WINDOW_CLOSED: "No se envió: pasaron más de 24 h desde el último mensaje del cliente",
  SEND_REJECTED: "No se envió: el canal lo rechazó",
  DELIVERY_FAILED: "No se pudo entregar",
};

export function outboundErrorText(code: Message["errorCode"]): string | null {
  const kind = code?.replace(/^(?:WHATSAPP|MESSENGER)_/, "");
  return kind && kind in OUTBOUND_ERROR_TEXT ? OUTBOUND_ERROR_TEXT[kind as OutboundErrorKind] : null;
}

/** Nombre visible: nombre y apellido, teléfono, email o un respaldo según el canal. */
export function customerDisplayName(customer: CustomerSummary, channel: ContactChannel): string {
  const name = [customer.firstName, customer.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || customer.phone || customer.email || (channel === "FACEBOOK" ? "Cliente de Messenger" : "Cliente sin nombre");
}
```

**Samanta con borradores.** Samanta v1 no responde sola: una persona pide un borrador, lo revisa y lo aprueba ([Samanta](#samanta-borradores-con-revisión-humana) y [04](#generar-un-borrador-con-samanta)). Flujo en el chat:
1. **Cuándo ofrecer «Generar».** Solo si la conversación es de `WHATSAPP`, no está en pausa, el último mensaje cargado es un `INBOUND` de texto y el usuario tiene `draft.review`. Un OPERATOR, además, solo si la conversación está libre o es suya.
2. **Generar.** `assistantDraftsApi.generate(id, ultimoMensaje.id, clave)`. Genera la clave al hacer clic y reutilízala solo para reintentar esa misma generación, por ejemplo tras un 504: el BFF corta a los 65 s y bk-crm devuelve el mismo borrador sin generar otro.
3. **Esperar.** Si el borrador llega en `GENERATING`, consulta su detalle cada 2–3 s hasta que cambie.
4. **Revisar.** En `READY`, muestra el texto editable, `intent`, el aviso de `requiresHuman`, `missingFields` y una cuenta atrás hasta `expiresAt` (15 min). Editar suma 1 a `revision`. Envía siempre la `revision` que tienes en pantalla al editar, aprobar o rechazar.
5. **Aprobar o rechazar.** Al aprobar, bk-crm encola un `OUTBOUND` cuyo autor es quien aprueba y lo guarda en `outboundMessageId`. Invalida el chat para verlo. Aprobar hace las mismas comprobaciones que enviar: puede responder 503 `WhatsApp no está habilitado`, 409 de ventana cerrada o 400 `Conversación sin destinatario habilitado`, y en esos casos el borrador sigue en `READY` ([Aprobar un borrador](#aprobar-un-borrador-y-encolar-el-envío)).
6. **Desactualizado.** Un borrador pasa a `STALE` si llega otro mensaje, si se pausa a Samanta, si vence o si cambia la información comercial. Ofrece generar otro con una clave nueva.

```ts
// ejemplo: src/features/bandeja/use-samanta.ts — borradores de Samanta con TanStack Query
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { newIdempotencyKey } from "@/lib/api/client";
import { assistantDraftsApi } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/query-keys";
import type { Message, SamantaDraft } from "@/lib/api/types";

const DRAFT_POLL_MS = 2500;

export function useAssistantDrafts(conversationId: string) {
  return useQuery({
    queryKey: qk.assistantDrafts(conversationId),
    queryFn: () => assistantDraftsApi.list(conversationId),
  });
}

/** Un borrador: mientras está en GENERATING se consulta cada 2,5 s. */
export function useAssistantDraft(conversationId: string, draftId: string | null) {
  return useQuery({
    queryKey: qk.assistantDraft(conversationId, draftId ?? ""),
    queryFn: () => assistantDraftsApi.get(conversationId, draftId!),
    enabled: draftId !== null,
    refetchInterval: (query) => (query.state.data?.status === "GENERATING" ? DRAFT_POLL_MS : false),
  });
}

/** Mensaje al que puede responder Samanta: el último cargado, si es un INBOUND de texto con contenido. */
export function draftSource(messages: readonly Message[]): Message | null {
  const last = messages.at(-1);
  return last && last.direction === "INBOUND" && last.type === "TEXT" && last.content?.trim() ? last : null;
}

/** Generar: una clave por clic, reutilizada solo al reintentar la misma fuente tras un fallo. */
export function useGenerateDraft(conversationId: string) {
  const queryClient = useQueryClient();
  const pending = useRef<{ sourceMessageId: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (sourceMessageId: string) => {
      if (pending.current?.sourceMessageId !== sourceMessageId) {
        pending.current = { sourceMessageId, key: newIdempotencyKey() };
      }
      return assistantDraftsApi.generate(conversationId, sourceMessageId, pending.current.key);
    },
    onSuccess: (draft: SamantaDraft) => {
      pending.current = null;
      queryClient.setQueryData(qk.assistantDraft(conversationId, draft.id), draft);
      void queryClient.invalidateQueries({ queryKey: qk.assistantDrafts(conversationId) });
    },
  });
}

/** Aprobar o rechazar con la revisión que se ve en pantalla. */
export function useReviewDraft(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draft, action }: { draft: SamantaDraft; action: "approve" | "reject" }) =>
      action === "approve"
        ? assistantDraftsApi.approve(conversationId, draft.id, draft.revision)
        : assistantDraftsApi.reject(conversationId, draft.id, draft.revision),
    onSuccess: (draft, { action }) => {
      queryClient.setQueryData(qk.assistantDraft(conversationId, draft.id), draft);
      void queryClient.invalidateQueries({ queryKey: qk.assistantDrafts(conversationId) });
      if (action === "approve") {
        void queryClient.invalidateQueries({ queryKey: qk.messages(conversationId) });
        void queryClient.invalidateQueries({ queryKey: qk.conversation(conversationId) });
        void queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      }
    },
    // Un 409 (revisión vieja, borrador desactualizado) se resuelve releyendo el borrador.
    onError: () => void queryClient.invalidateQueries({ queryKey: qk.assistantDrafts(conversationId) }),
  });
}

/** Ids de los mensajes que salieron de un borrador aprobado, para etiquetarlos como «Samanta». */
export function samantaMessageIds(drafts: readonly SamantaDraft[]): Set<string> {
  return new Set(drafts.flatMap((d) => (d.status === "APPROVED" && d.outboundMessageId ? [d.outboundMessageId] : [])));
}
```

Ajustes de la Bandeja que dependen de Samanta:
- **Autor de los mensajes.** `messageAuthor` (`src/lib/domain/conversation.ts`) trata como Samanta todo `OUTBOUND` sin autor, y con bk-crm eso no ocurre nunca. Etiqueta como «Samanta» solo los mensajes de `samantaMessageIds` (los 50 borradores más recientes). Para los demás, conserva lo que ya hace `outboundAuthorLabel`: «Tú» si coincide con `GET /auth/me`, el nombre del responsable si coincide con `assignedUser.id`, o un texto genérico (hoy «Operador»; [04](#ver-historial-de-mensajes) sugiere «Equipo»). No hay forma de traer otros nombres, porque `GET /users` es solo para ADMIN. Lo mismo vale para el prefijo de la vista previa (`previewPrefix`).
- **Modo de la conversación.** La píldora «Samanta» y el aviso «Samanta está respondiendo» dan a entender que Samanta contesta sola. En v1, `isAssistantPaused` solo impide generar y usar borradores. Ajusta los textos con producto.
- **«Quien escribe toma el control».** Al enviar, el Composer pausa a Samanta (`plan.pause`). Con la conversación en pausa, generar responde 409 `Samanta está pausada en esta conversación` y los borradores quedan `STALE`. Decide con producto si enviar debe seguir pausando, o muestra «Reanudar» junto a «Generar».
- **Samanta apagada.** Si `SAMANTA_ENABLED` no es `true`, generar, editar y aprobar responden 503 `Samanta está desactivada`. Como no hay endpoint de capacidades, tras el primer 503 muestra el aviso y deshabilita el botón hasta recargar.
- **Otros errores al generar:** 400 `Samanta v1 admite WhatsApp`; 409 `Selecciona el último mensaje entrante de texto (máximo 4096 caracteres)`; 429 `Límite de generación de Samanta alcanzado` (100 al día en total y 2 a la vez, por defecto); 409 `Ya hay un borrador en generación`.

**Panel derecho.**
- El texto «Aún no hay solicitud. Samanta la crea cuando el cliente confirma fecha, hora y personas.» no se cumple: Samanta no crea solicitudes. Cámbialo y, para ADMIN y OPERATOR, ofrece «Nueva solicitud» con `requestsApi.create({ customerId, sourceChannel: conversation.channel, … })` ([Solicitudes](#solicitudes)).
- Los pasos «Enviada al dueño» y «Respuesta del dueño» de la línea de tiempo nunca se alcanzan. Además, con una solicitud `CANCELLED`, `requestTimeline` (`src/lib/domain/statuses.ts`) marca los tres pasos como completados, también «Enviada al dueño», aunque nunca se envió. Ajusta la línea de tiempo para ese estado.
- En los clientes de Messenger, «Teléfono» y «Correo» quedan en «—».

**Estados vacíos y errores.** Ya están resueltos: carga, error sin datos, aviso «Sin conexión…» si falla un sondeo con datos, «Aún no hay conversaciones.» y «Sin conversaciones para este filtro.». Un `c` que no es UUID o que da 404 muestra «No se encontró la conversación». Al enviar:
- un 503 de canal apagado no es «sin conexión» ([§4](#44-qué-hacer-según-el-código));
- un 409 de ventana deshabilita el editor hasta que el cliente escriba;
- un `UNKNOWN` no se reenvía sin confirmar con el cliente.

**Falta en el backend:**
- la vista previa del último mensaje en la lista (hoy, una llamada por fila);
- un filtro «sin asignar»;
- el vencimiento de la ventana de 24 h;
- un endpoint de capacidades;
- Samanta en Messenger y las lecturas de Messenger;
- resolver o reintentar mensajes `UNKNOWN`;
- descargar adjuntos (solo hay metadata);
- los nombres de los autores para OWNER y OPERATOR;
- tiempo real (WebSockets o SSE).

#### Calendario

`/calendario` · `src/features/calendario/`: `calendario-view.tsx`, `calendar-grids.tsx`, `calendar-utils.ts` y `reservation-detail.tsx`. Estado en la URL: `vista` (`dia`, `semana` o `mes`; por defecto `semana`), `fecha` (`YYYY-MM-DD` en la zona del restaurante; por defecto hoy) y `reserva`.

| Uso | Ruta | Función | Estado | Caché y polling |
|---|---|---|---|---|
| Reservas del periodo | `GET /reservations?dateFrom=…&dateTo=…&excludeCancelled=true&page=…&limit=100` | `reservationsApi.list` con `collectPages` (hasta 20 páginas) | existe | `qk.reservations({ scope: "calendario", dateFrom, dateTo })`, cada 60 s |
| Detalle | `GET /reservations/:id` | `reservationsApi.get` | existe | `qk.reservation(id)`, cada 60 s |
| Canal del cliente | `GET /customers/:id` | `customersApi.get` | existe | `qk.customer(customerId)`, `staleTime` 5 min |
| «Marcar como preparada» y demás estados | `PATCH /reservations/:id/status` | `reservationsApi.setStatus` | existe | Mezcla en `qk.reservation(id)`; invalida `qk.reservationsAll` y `qk.statsAll` |
| Nueva reserva | `POST /reservations` | `reservationsApi.create` | nueva | Invalida `qk.reservationsAll` y `qk.statsAll` |
| Editar | `PATCH /reservations/:id` | `reservationsApi.update` | nueva | Mezcla; invalida `qk.reservationsAll` y `qk.statsAll` |
| Responsable | `PATCH /reservations/:id/assignee` | `reservationsApi.assign` | nueva | Mezcla; invalida `qk.reservationsAll` |
| Observación | `POST /reservations/:id/notes` | `reservationsApi.addNote` | nueva | Añade la nota a `noteHistory` |
| Reprogramar | `PATCH /reservations/:id/reschedule` | `reservationsApi.reschedule` | nueva | Mezcla; invalida `qk.reservationsAll` y `qk.statsAll` |

Para los formularios:
- **Cliente:** `customersApi.list({ search, limit })`.
- **Elemento:** `catalogApi.items({ isActive: true, approvalStatus: "APPROVED" })`. bk-crm exige un elemento activo y aprobado.
- **Responsable** (solo ADMIN): `usersApi.list()`, filtrando los activos con ADMIN u OPERATOR.

**Permisos.**

| Acción | ADMIN | OPERATOR | OWNER | En ft-crm |
|---|---|---|---|---|
| Ver | Sí | Sí | Sí | `canView("calendario")` |
| Crear | Sí | No | No | `can("reservation.create")` (nueva) |
| Cambiar estado | Sí | Sí | No | `can("reservation.status")` |
| Editar, observaciones y reprogramar | Sí | Sí | No | `can("reservation.edit")` (nueva) |
| Responsable | Cualquier usuario elegible | Solo tomar una libre o liberar la propia | No | `can("reservation.edit")` y la regla de OPERATOR de [Asignar o liberar responsable](#asignar-o-liberar-responsable) |

Las reglas de estado van en las declaraciones nuevas de `types.ts` ([§2.2](#22-typests)): `canSetReservationStatus`, `RESERVATION_EDITABLE_STATUSES`, `RESERVATION_ASSIGNABLE_STATUSES` y `RESERVATION_FINAL_STATUSES` (en un estado final se pueden agregar observaciones). Hoy `types.ts` solo tiene `RESERVATION_STATUS_TRANSITIONS`.

**Cambios para live:**
- **Calendario vacío.** Las reservas solo se crean con `POST /reservations`, que es solo para ADMIN y no tiene pantalla. Sin ella, el calendario estará vacío. Crear exige la configuración del restaurante (409 `Configura el restaurante antes de crear solicitudes o reservas`) y una fecha futura según el reloj del servidor (400 `La fecha de reserva debe ser válida y futura`).
- **Textos.** El subtítulo «Solo reservas aceptadas por el dueño.» y la píldora «Aceptada por el dueño» dependen de un flujo que no existe: `reservationRequestId` siempre es `null` y la píldora siempre dirá «Registrada en el CRM».
- **«No se puede deshacer».** La confirmación de «Marcar como preparada» y el comentario de `PREPARED_STATUS` (`src/lib/domain/statuses.ts`) dicen que `UPCOMING` es irreversible. No hay transición directa a `CONFIRMED`, pero al reprogramar la reserva pasa a `RESCHEDULED`, y desde ahí puede volver a `CONFIRMED`.
- **Caché.** Las respuestas de los PATCH no traen historiales: mézclalas con el detalle, como ya hace `PrepareControl`.

```ts
// ejemplo: src/features/calendario/reservation-cache.ts — guardar en caché las respuestas de reservas
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/query-keys";
import type { Reservation, ReservationDetail, ReservationNote } from "@/lib/api/types";

/** Mezcla la respuesta de un PATCH (sin historiales) con el detalle e invalida lo que depende de la reserva. */
export function storeReservation(queryClient: QueryClient, updated: Reservation, options: { stats: boolean }) {
  queryClient.setQueryData<ReservationDetail>(qk.reservation(updated.id), (old) => (old ? { ...old, ...updated } : old));
  void queryClient.invalidateQueries({ queryKey: qk.reservationsAll });
  if (options.stats) void queryClient.invalidateQueries({ queryKey: qk.statsAll });
}

/** Agrega la observación nueva al final de noteHistory (ordenado por createdAt ascendente). */
export function storeReservationNote(queryClient: QueryClient, note: ReservationNote) {
  queryClient.setQueryData<ReservationDetail>(qk.reservation(note.reservationId), (old) =>
    old ? { ...old, noteHistory: [...old.noteHistory, note] } : old,
  );
}
```

**Estados vacíos y errores.** Ya existen la carga, el error sin datos, el aviso si falla una actualización y el aviso de lectura parcial (más de 2000 reservas en el periodo). Con datos reales, añade un estado vacío que explique cómo se crean las reservas (para ADMIN, con el botón «Nueva reserva»).

**Falta en el backend:**
- una consulta sin paginar para el calendario;
- un filtro de reservas sin responsable;
- el paso «solicitud aceptada → reserva».

#### Clientes

`/clientes` · `src/features/clientes/`: `clientes-view.tsx`, `clientes-utils.ts` y `search-box.tsx`; `src/lib/hooks/use-open-chat.ts`. Estado en la URL: `q`, `estado` y `pagina`.

| Uso | Ruta | Función | Estado | Caché y polling |
|---|---|---|---|---|
| Lista | `GET /customers?page=…&limit=20&search=…&status=…` | `customersApi.list` | existe | `qk.customers(filtros de la URL)`, cada 60 s |
| Columna RESERVAS | `GET /reservations?customerId=…&excludeCancelled=true&limit=1` | `reservationsApi.list` | existe | `qk.reservations({ customerId, excludeCancelled: true, limit: 1 })`, `staleTime` 60 s |
| Columna CONSULTÓ | `GET /customers/:id` | `customersApi.get` | existe | `qk.customer(id)`, `staleTime` 5 min |
| Abrir el chat | `GET /conversations?customerId=…&channel=…&limit=1` y, si no hay, sin `channel` | `conversationsApi.list` (`useOpenChat`) | existe | Sin caché |
| Nuevo cliente | `POST /customers` | `customersApi.create` | nueva | Invalida `qk.customersAll` |
| Editar | `PATCH /customers/:id` | `customersApi.update` | nueva | Mezcla en `qk.customer(id)`; invalida `qk.customersAll` (y conversaciones, solicitudes y reservas si cambia el nombre o el contacto) |
| Estado comercial | `PATCH /customers/:id/status` | `customersApi.setStatus` | existe, sin pantalla | Mezcla en `qk.customer(id)`; invalida `qk.customersAll` |
| Intereses | `POST /customers/:id/interests`, `DELETE /customers/:id/interests/:commercialItemId` | `customersApi.addInterest`, `removeInterest` | nueva | Invalida `qk.customersAll` |

**Permisos.** Ven ADMIN, OWNER y OPERATOR. Escriben ADMIN y OPERATOR: `can("customer.edit")` ya cubre esos roles.

**Cambios para live:**
- **Nombre.** Los clientes de WhatsApp llegan sin nombre y con teléfono. Los de Messenger, sin teléfono ni email, y con el nombre de Meta en `firstName` cuando Meta lo da. Hoy `customerIdentity` muestra «Cliente sin nombre» si no hay nada: usa «Cliente de Messenger» cuando `sourceChannel` es `FACEBOOK`.
- **Estado comercial.** El backend acepta cualquier transición y nunca lo cambia solo: todos los clientes nuevos quedan en `NEW`. Decide con producto qué estados ofrecer.
- **Canal de Messenger.** No se puede cambiar el canal de un cliente de Messenger: responde 400 `No se puede cambiar el canal de una identidad de Messenger`, y la respuesta no indica de antemano si el cliente es de Messenger. Para `sourceChannel: "FACEBOOK"`, no ofrezcas cambiar el canal.
- **Teléfono.** Cambiar el teléfono de un cliente con conversación de WhatsApp cambia el destinatario de las respuestas ([Editar cliente](#editar-cliente)). Avísalo en el formulario.
- **Duplicados.** Un teléfono o email que ya tiene otro cliente responde 409. Muéstralo en el campo.
- **Rendimiento.** Cada fila hace dos llamadas (RESERVAS y CONSULTÓ): hasta 40 por página de 20.

**Estados vacíos y errores.** Ya resueltos: «Sin clientes para este filtro.», «No hay clientes en esta página.» con enlace a la primera, el error sin datos y el aviso si falla una actualización.

**Falta en el backend:**
- el número de reservas y el último interés en el listado;
- buscar por nombre completo;
- la fusión de clientes;
- un indicador de identidad de Messenger.

#### Solicitudes

`/solicitudes` · `src/features/solicitudes/solicitudes-view.tsx`; textos y grupos en `src/lib/domain/statuses.ts`. Estado en la URL: `tab` (`todas`, `esperando`, `aceptadas` o `rechazadas`) y `pagina`.

| Uso | Ruta | Función | Estado | Caché y polling |
|---|---|---|---|---|
| KPI (4 estados) | `GET /reservation-requests?status=…&limit=1` | `requestsApi.list` | existe | `qk.requests({ count: status })`, `staleTime` 30 s |
| Lista | `GET /reservation-requests?page=…&limit=50[&status=…]` | `requestsApi.list` | existe | `qk.requests({ tab, page })`, cada 30 s |
| Pestaña Esperando | Dos estados, con `collectPages` (hasta 5 páginas cada uno) | `requestsApi.list` | existe | La misma clave |
| Abrir el chat | `GET /conversations?customerId=…&channel=…&limit=1` y, si no hay, sin `channel` | `conversationsApi.list` (`useOpenChat`) | existe | Sin caché |
| Detalle | `GET /reservation-requests/:id` | `requestsApi.get` | existe, sin pantalla | `qk.request(id)` (nueva) |
| Nueva solicitud | `POST /reservation-requests` | `requestsApi.create` | nueva | Invalida `qk.requestsAll` y `qk.statsAll` |
| Editar | `PATCH /reservation-requests/:id` | `requestsApi.update` | nueva | `setQueryData(qk.request(id))`; invalida `qk.requestsAll` y `qk.statsAll` |
| Cancelar | `PATCH /reservation-requests/:id/status` | `requestsApi.cancel` | existe, sin pantalla | Igual que editar |

**Permisos.** Ven ADMIN, OWNER y OPERATOR. Crean, editan y cancelan ADMIN y OPERATOR: `can("request.cancel")` ya existe; añade `request.edit`.

**Cambios para live:**
- **Flujo del dueño.** Con las rutas actuales solo se alcanzan `INCOMPLETE_DATA` y `READY_TO_SEND` (los calcula el backend según haya fecha y personas) y `CANCELLED`. Las pestañas Esperando, Aceptadas y Rechazadas, y sus tres KPI, siempre estarán en 0. Ocúltalos o márcalos como «Próximamente».
- **Subtítulo.** «Samanta envía cada solicitud al WhatsApp del dueño…» no se cumple: cámbialo.
- **Formulario nuevo.**
  - Campos: cliente, canal, elemento (activo y aprobado), fecha futura, personas (entero ≥ 1), precio con moneda, comentarios y requisitos.
  - Si mandas precio sin moneda, el backend usa la del restaurante.
  - Exige la configuración del restaurante (409).
  - No es idempotente: tras un 504, refresca la lista antes de reintentar.
- **Editar y cancelar.** Solo se permiten en `INCOMPLETE_DATA` y `READY_TO_SEND` (`RESERVATION_REQUEST_EDITABLE_STATUSES`); en otro estado responden 409. Cancelar una solicitud ya cancelada responde 200 sin cambios.
- **`pagina`.** Hoy se lee con `Math.max(1, Number(…) || 1)`, que no pone tope ni exige un entero: una página mayor que 1 000 000 o con decimales (`?pagina=2.5`) da 400. Usa `parsePage` de `clientes-utils.ts`.

**Estados vacíos y errores.** Ya resueltos: «No hay solicitudes en esta pestaña.», el error con «Reintentar» y el aviso de lectura parcial de Esperando.

**Falta en el backend:** el flujo del dueño (enviar, aceptar, rechazar y convertir en reserva) y el registro de cuándo responde el dueño (KPI «Respuesta media»).

#### Estadísticas

`/estadisticas` · `src/features/estadisticas/`: `estadisticas-view.tsx` y `stats-utils.ts`. Estado en la URL: `periodo` (`semana` o `mes`).

| Fuente | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Reservas del periodo | `GET /reservations?dateFrom=…&dateTo=…&excludeCancelled=true` (hasta 20 páginas) | `reservationsApi.list` + `collectPages` | existe | `[...qk.stats(period, fromIso), toIso, "reservations"]`, `staleTime` 60 s |
| Solicitudes con fecha de reserva en el periodo | `GET /reservation-requests?dateFrom=…&dateTo=…` (hasta 20 páginas) | `requestsApi.list` + `collectPages` | existe | `…, "requests"` |
| Conversaciones activas en el periodo | `GET /conversations?page=…&limit=100`, hasta salir del periodo | `conversationsApi.list` + `collectConversationsSince` | existe | `…, "conversations"` |

- **Actualización.** Sin polling: `staleTime` de 60 s y recarga al volver a la pestaña. Tras crear o editar solicitudes o reservas, invalida `qk.statsAll` (nueva).
- **Espera a la zona horaria.** La vista ya espera a conocer la zona del restaurante antes de calcular el periodo.
- **Permisos.** ADMIN, OWNER y OPERATOR, solo lectura.
- **Con datos reales:**
  - «Rechazadas» y «Tasa de aceptación» quedan en 0 y «—» (no hay flujo del dueño);
  - «Resueltas por Samanta» no tiene dato;
  - las solicitudes se filtran por `reservationAt`, así que las que aún no tienen fecha no cuentan.
- **Falta en el backend:** endpoints de agregados (hoy se leen hasta 2000 registros por fuente) y un filtro de solicitudes por fecha de alta (`createdAt`).

#### Ajustes

`/ajustes` redirige a `/ajustes/empresa`. Marco: `src/app/(crm)/ajustes/layout.tsx` → `AjustesShell` (`src/features/ajustes/shell/`).

- **Pestañas.** Todas para ADMIN, OWNER y OPERATOR, salvo Usuarios, que es solo para ADMIN. Una pestaña no permitida muestra `NoAccess`.
- **Configuración.** Empresa, Horarios, Políticas y Samanta comparten `qk.config` mediante `useRestaurant()` y `ConfigGate`, que distingue carga, 404 (sin configurar) y error.
- **Guardado.** `useConfigSave` relee la configuración (`configApi.get`), aplica los cambios de la pestaña sobre `toPutRequest(actual)` y guarda con `configApi.put`. Así reduce el riesgo de pisar cambios hechos en otra pestaña, porque el backend no tiene control de versión. La respuesta reemplaza `qk.config`.
- **Errores.** `SaveError` muestra los mensajes del backend y enlaza la pestaña donde está el problema (`backendMessageTabs`). Un 409 `La configuración entró en conflicto con otro cambio; inténtalo nuevamente` se resuelve repitiendo.
- **Permisos.** Solo ADMIN guarda (`can("config.edit")`). Los demás ven `ReadOnlyNotice`.

#### Ajustes › Empresa

`/ajustes/empresa` · `src/features/ajustes/config/empresa-view.tsx`

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Leer | `GET /restaurant-config` | `configApi.get` | existe | `qk.config` |
| Guardar o crear la configuración | `PUT /restaurant-config` | `configApi.put` | existe | `setQueryData(qk.config)` |

- **Primer arranque.** bk-crm empieza sin configuración: `GET` responde 404. El ADMIN ve `SetupForm` y los demás roles, un aviso. Sin configuración no se pueden crear solicitudes ni reservas. Al guardar, los 7 días quedan cerrados.
- **Validaciones que conviene replicar con zod** ([Guardar la configuración](#guardar-la-configuración-del-restaurante-crear-o-reemplazar)):
  - email de hasta 254 caracteres en la práctica;
  - `logoUrl` y `website` con `http(s)` y un dominio o una IP;
  - `whatsappNumber` en E.164 (`E164_PATTERN`);
  - `timeZone` IANA;
  - de 1 a 3 idiomas.
- **Coordenadas.** Una distinta de 0 con valor absoluto menor que 0,000001 que JavaScript escribe sin punto decimal (`1e-7`) provoca un 500; con punto (`1.5e-7`) pasa. `normalizeCoordinate` ya lo evita: redondea a 7 decimales y deja en 0 esos valores.
- **Falta en el backend:** subir el logo (solo acepta URLs ya alojadas) y auditar quién cambió qué.

#### Ajustes › Horarios

`/ajustes/horarios` · `src/features/ajustes/config/horarios-view.tsx`. Mismas rutas y caché que Empresa.

- `replaceSchedules` envía la semana completa y cambia solo los días tocados.
- **Reglas.** Un día abierto necesita `openTime` antes que `closeTime` el mismo día: no se puede cruzar la medianoche (el cierre más tardío es 23:59). Un día cerrado no lleva horas.
- **Errores.** Los del backend llegan como `schedules.<i>.…`, donde `<i>` es el día en el orden de `DAYS_OF_WEEK`.

#### Ajustes › Políticas

`/ajustes/politicas` · `src/features/ajustes/config/politicas-view.tsx`. Mismas rutas y caché que Empresa. `reservationPolicy` y `cancellationPolicy` son obligatorias, de 1 a 5000 caracteres.

#### Ajustes › Samanta

`/ajustes/samanta` · `src/features/ajustes/config/samanta-view.tsx`

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Responsable y tiempo de respuesta | `GET` y `PUT /restaurant-config` | `configApi.get`, `configApi.put` | existe | `qk.config` |
| Candidatos a responsable | `GET /users` | `usersApi.list` | existe | `qk.users`, solo si puede editar (ADMIN) |

- **Responsable.** `approvalResponsibleId` debe ser un usuario activo con rol OWNER. Si se desactiva o pierde OWNER, cualquier guardado de Ajustes responde 400 hasta elegir otro. `OwnerValidationCard` ya lo avisa (`staleSelected`).
- **Datos sin uso.** `responseTimeoutMinutes` y `approvalResponsibleId` se guardan, pero ningún proceso del backend los usa todavía.
- **Tarjetas «Canales donde atiende» y «Reglas».** No existen en el backend: son estáticas y lo dicen. Con Samanta v1, la nota correcta es que Samanta prepara borradores solo en WhatsApp y solo si el servidor la tiene habilitada (`SAMANTA_ENABLED`, que el frontend no puede consultar).
- **Falta en el backend:** el endpoint de capacidades, las reglas de Samanta y el WhatsApp personal del dueño.

#### Ajustes › Servicios

`/ajustes/servicios` · `src/features/ajustes/servicios/`: `servicios-view.tsx`, `nuevo-servicio-form.tsx` y `servicios-logic.ts`. Estado en la URL: `pagina`.

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Lista | `GET /commercial-items?sort=category&order=asc&page=…&limit=50` | `catalogApi.items` | existe | `qk.items(query)` |
| Categorías del formulario | `GET /commercial-categories` | `catalogApi.categories` | existe | `qk.categories`, `staleTime` 60 s |
| Nuevo servicio | `POST /commercial-items` | `catalogApi.create` | cambia (tipo del body) | Invalida `qk.itemsAll` |
| Activar o desactivar | `PATCH /commercial-items/:id/status` | `catalogApi.setActive` | existe | Optimista en la página; invalida `qk.itemsAll` al terminar el último cambio |
| Aprobar | `PATCH /commercial-items/:id/approval` | `catalogApi.setApproval` | existe | Reemplaza el elemento en la página; invalida `qk.itemsAll` |
| Ficha y editor | `GET` y `PATCH /commercial-items/:id` | `catalogApi.item`, `catalogApi.update` | nueva | `qk.item(id)` |
| Categorías | `POST`, `GET /:id`, `PATCH /:id`, `PATCH /:id/status` en `/commercial-categories` | `catalogApi.createCategory`, `category`, `updateCategory`, `setCategoryActive` | nueva | `qk.categories`, `qk.category(id)` |

- **Catálogo inicial.** El seed carga 16 categorías y 86 elementos, todos en `DRAFT`. Samanta solo usa elementos activos, aprobados y de categorías activas (como máximo 30), así que hay que aprobarlos.
- **Elementos sin nombre en español.** 9 elementos no tienen `nameEs`: aprobarlos responde 400 `El elemento necesita un nombre en español antes de aprobarse` hasta que se editen con `catalogApi.update`. Cuatro categorías tampoco tienen `nameEs`; `categoryName` ya muestra `nameEn`.
- **Volver a borrador.** Editar un elemento `APPROVED` lo devuelve a `DRAFT`.
- **Búsqueda.** Si añades un buscador, ten en cuenta que no distingue mayúsculas pero sí tildes: `cafe` no encuentra «Café».
- **Permisos.** Solo ADMIN escribe (`can("catalog.edit")`); para los demás, el interruptor está deshabilitado.
- **Falta en el backend:** subir imágenes, borrar categorías o elementos (solo se desactivan) y auditar las aprobaciones.

#### Ajustes › Usuarios

`/ajustes/usuarios` · `src/features/ajustes/usuarios/`: `usuarios-view.tsx`, `invitar-usuario-form.tsx` y `usuarios-logic.ts`.

| Uso | Ruta | Función | Estado | Caché |
|---|---|---|---|---|
| Lista | `GET /users` | `usersApi.list` | existe | `qk.users` |
| Invitar | `POST /users` | `usersApi.create` | existe | Invalida `qk.users` |
| Activar o desactivar | `PATCH /users/:id/status` | `usersApi.setActive` | existe | Optimista con reversión; invalida `qk.users` |
| Roles | `PATCH /users/:id/roles` | `usersApi.setRoles` | existe, sin pantalla | Fila de `qk.users` y `qk.user(id)` |
| Ficha y edición | `GET` y `PATCH /users/:id` | `usersApi.get`, `usersApi.update` | nueva | `qk.user(id)` |

- **Permisos.** Solo ADMIN: la vista muestra `NoAccess` a los demás roles.
- **Desactivar.**
  - Revoca todas las sesiones del usuario. Desactivarse a uno mismo cierra la sesión (ya se pide confirmación).
  - No libera sus conversaciones ni reservas: quedan con `isEligible: false`. Invalida `qk.conversationsAll` y `qk.reservationsAll`.
  - Si es el responsable de aprobación, después `PUT /restaurant-config` responde 400. Avísalo antes de desactivar.
- **Último ADMIN.** 409 `No se puede desactivar al último administrador activo` y 409 `No se puede retirar el rol al último administrador activo`. `UsuariosView` ya revierte el interruptor.
- **Roles.** El formulario de alta elige un solo rol, pero bk-crm admite varios por usuario.
- **Contraseña temporal.** Hasta 72 caracteres, pero bcrypt solo usa los primeros 72 bytes: la misma advertencia que en [Restablecer contraseña](#restablecer-contraseña-1).
- **Invitación.** No hay invitación por correo: el formulario ya lo explica.
- **Falta en el backend:** paginación y búsqueda de usuarios, un restablecimiento de contraseña hecho por un ADMIN e invitaciones por correo.

### 4. Manejo de errores en la UI

#### 4.1 Cómo llega un error

- **Rutas de `/api/backend`.** `apiFetch` lanza `ApiError(status, messages, code, body)`:
  - `messages` siempre es un array: el `message` del body (string o array), sin el texto `Unauthorized`. Si queda vacío, usa el texto genérico del código (`GENERIC` en `client.ts`).
  - `code` solo existe si el error lo generó el BFF.
  - `body` es el JSON recibido. Sirve para saber si `message` era un array (validación) o un string (negocio).
  - `status` 0 significa que el navegador no llegó al BFF. Un `AbortError` (cancelación de TanStack Query) se relanza tal cual.
- **Handlers `/api/auth/*`.** `sessionApi` lanza un `Error` normal, sin código, con el texto ya preparado por el BFF: muéstralo tal cual.
- **Reintentos.** `src/components/providers.tsx` reintenta las consultas hasta 2 veces solo ante status 0 o 5xx, y nunca reintenta las mutaciones. Mantenlo así.

#### 4.2 Errores de validación por campo

El 400 de validación trae `message` como array, con textos de class-validator en inglés (los validadores propios de bk-crm, en español). Casi todos empiezan por la ruta del campo; las excepciones son `each value in <campo> …`, `All <campo>'s elements must be unique` y `property <campo> should not exist`, que `splitValidationMessage` también reconoce:

| Mensaje | Campo | Texto propuesto |
|---|---|---|
| `email must be an email` | `email` | Escribe un correo válido. |
| `password must be longer than or equal to 8 characters` | `password` | Escribe al menos 8 caracteres. |
| `each value in roles must be one of the following values: ADMIN, OWNER, OPERATOR, SUPPORT` | `roles` | Elige una opción de la lista. |
| `All roles's elements must be unique` | `roles` | No repitas valores. |
| `schedules.2.openTime debe tener el formato HH:mm` | `schedules.2.openTime` | Debe tener el formato HH:mm. |
| `schedules.2.Un día abierto requiere openTime y closeTime…` | `schedules.2` | Un día abierto requiere openTime y closeTime… |
| `property confirmPassword should not exist` | — | Error del frontend: envió un campo que el DTO no declara |

Reglas:
- **Previene el 400.** Valida en el cliente con las mismas reglas: longitudes de cada módulo, `MONEY_PATTERN`, `TIME_PATTERN`, `E164_PATTERN` e `ISO_INSTANT_PATTERN`. El 400 del backend es la red de seguridad.
- **Varios mensajes del mismo campo.** Llegan cuando falta, es `null` o tiene otro tipo (p. ej. `email` ausente trae dos), y eso indica un body mal armado. Muestra el primero.
- **Mensajes en español.** Los que ya vienen en español (validadores propios de bk-crm) se muestran sin la ruta del campo.

```ts
// src/lib/api/errors.ts
/**
 * Clasificación de errores de bk-crm y del BFF para la UI (archivo nuevo).
 * Los mensajes de negocio llegan en español y se muestran tal cual. Los de validación
 * (class-validator) llegan en inglés: aquí se agrupan por campo y se traducen.
 */
import { ApiError } from "./client";
import type { ApiErrorBody } from "./types";

/** El navegador no llegó al BFF, o el BFF no llegó a bk-crm: es un problema de conexión, no de datos. */
export function isConnectionError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status === 502 || error.code === "BACKEND_UNAVAILABLE");
}

/** bk-crm respondió 503 sin `code`: algo está apagado en el servidor (WhatsApp, Messenger, Samanta…). */
export function isDisabledInServer(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503 && error.code === undefined;
}

/** 400 de validación de DTO: el body traía `message` como array. */
export function isValidationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 400 && Array.isArray((error.body as ApiErrorBody | null)?.message);
}

export interface FieldErrors {
  /** Textos en español por ruta del campo: "email", "roles", "schedules.0", "schedules.0.openTime"… */
  fields: Record<string, string[]>;
  /** Mensajes sin campo. «property x should not exist» indica un body mal armado por el frontend. */
  other: string[];
}

const PATH_SEGMENT = /^(?:\d+|[a-z][A-Za-z0-9]*)$/;

/** Separa la ruta del campo del resto del mensaje; null si el mensaje no empieza por un campo. */
export function splitValidationMessage(message: string): { path: string; rest: string } | null {
  if (/(?:^|\.)property \S+ should not exist$/.test(message)) return null;
  const each = /^(?:(\S+)\.)?each value in (?:nested property )?(\w+) (.+)$/.exec(message);
  if (each) return { path: each[1] ?? each[2]!, rest: each[3]! };
  const unique = /^All (\w+)'s elements must be unique$/.exec(message);
  if (unique) return { path: unique[1]!, rest: "must be unique" };
  const path: string[] = [];
  for (const segment of message.split(" ", 1)[0]!.split(".")) {
    if (!PATH_SEGMENT.test(segment)) break;
    path.push(segment);
  }
  if (path.length === 0) return null;
  const joined = path.join(".");
  return { path: joined, rest: message.slice(joined.length).replace(/^[.\s]+/, "") };
}

const RULES: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [/^should not be (?:empty|null or undefined)$/, () => "Completa este campo."],
  [/^must match \/\\S\/ regular expression$/, () => "Completa este campo."],
  [/^must be an email$/, () => "Escribe un correo válido."],
  [/^must be longer than or equal to (\d+) characters$/, (m) => (m[1] === "1" ? "Completa este campo." : `Escribe al menos ${m[1]} caracteres.`)],
  [/^must be shorter than or equal to (\d+) characters$/, (m) => `Escribe como máximo ${m[1]} caracteres.`],
  [/^must not be less than (-?[\d.]+)$/, (m) => `El valor mínimo es ${m[1]}.`],
  [/^must not be greater than (-?[\d.]+)$/, (m) => `El valor máximo es ${m[1]}.`],
  [/^must contain at least (\d+) elements$/, (m) => (m[1] === "1" ? "Elige al menos una opción." : `Elige al menos ${m[1]}.`)],
  [/^must contain no more than (\d+) elements$/, (m) => `Elige como máximo ${m[1]}.`],
  [/^must be unique$/, () => "No repitas valores."],
  [/^must be one of the following values: /, () => "Elige una opción de la lista."],
  [/^must be a UUID$/, () => "Elige una opción de la lista."],
  [/^must be a valid ISO 8601 date string$/, () => "La fecha no es válida."],
  [/^must match .+ regular expression$/, () => "El formato no es válido."],
  [/^must be an integer number$/, () => "Escribe un número entero."],
  [/^must be a number conforming to the specified constraints$/, () => "Escribe un número válido."],
  [/^must be a URL address$/, () => "Escribe una dirección que empiece por http:// o https://."],
];

/** Texto en español para el resto de un mensaje de validación (sin la ruta del campo). */
export function validationText(rest: string): string {
  for (const [pattern, text] of RULES) {
    const match = pattern.exec(rest);
    if (match) return text(match);
  }
  // Una regla en inglés sin traducir, o un mensaje propio de bk-crm, que ya está en español.
  if (/^(?:must|should)\b/.test(rest)) return "Revisa este campo.";
  const sentence = rest.charAt(0).toLocaleUpperCase("es") + rest.slice(1);
  return /[.!?…]$/.test(sentence) ? sentence : `${sentence}.`;
}

/** Agrupa por campo los mensajes de un 400 de validación, ya en español. */
export function fieldErrors(messages: readonly string[]): FieldErrors {
  const fields: Record<string, string[]> = {};
  const other: string[] = [];
  for (const message of messages) {
    const parsed = splitValidationMessage(message);
    if (!parsed) {
      other.push(message);
      continue;
    }
    const text = validationText(parsed.rest);
    const list = (fields[parsed.path] ??= []);
    if (!list.includes(text)) list.push(text);
  }
  return { fields, other };
}
```

Uso en un formulario:

```ts
// ejemplo: src/lib/forms/server-errors.ts — llevar el error de un guardado a los campos del formulario
import { ApiError } from "@/lib/api/client";
import { fieldErrors, isConnectionError, isValidationError } from "@/lib/api/errors";

export interface ServerFormErrors<F extends string> {
  fields: Partial<Record<F, string>>;
  form: string | null;
}

/** `formFields` son los campos que el formulario muestra; las rutas anidadas ("schedules.2.openTime") van a su raíz. */
export function serverFormErrors<F extends string>(error: unknown, formFields: readonly F[]): ServerFormErrors<F> {
  if (isValidationError(error)) {
    const { fields, other } = fieldErrors(error.messages);
    const result: Partial<Record<F, string>> = {};
    let unmatched = other.length > 0;
    for (const [path, texts] of Object.entries(fields)) {
      const field = formFields.find((name) => path === name || path.startsWith(`${name}.`));
      if (!field) unmatched = true;
      else if (!result[field]) result[field] = texts[0];
    }
    return { fields: result, form: unmatched ? "No se pudo guardar. Revisa los datos e inténtalo de nuevo." : null };
  }
  if (isConnectionError(error)) return { fields: {}, form: "No se pudo conectar con el servidor. Inténtalo de nuevo." };
  if (error instanceof ApiError) return { fields: {}, form: error.messages.join(" ") };
  return { fields: {}, form: error instanceof Error ? error.message : "Ocurrió un error inesperado." };
}
```

#### 4.3 Mensajes de negocio

Los 400, 403, 404 y 409 con `message` de tipo string vienen en español y ya están escritos para el usuario: muéstralos tal cual. Algunos piden, además, una reacción de la UI:

| Mensaje | Código | Reacción |
|---|---|---|
| `Configura el restaurante antes de crear solicitudes o reservas` | 409 | Enlaza a Ajustes › Empresa (solo ADMIN puede configurarlo). |
| `El responsable de aprobación debe estar activo` · `El responsable de aprobación debe tener el rol OWNER` | 400 | Lleva a Ajustes › Samanta para elegir otro responsable. |
| `Ventana de WhatsApp cerrada; se requiere una plantilla aprobada` · `Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje` | 409 | Deshabilita el editor hasta que llegue otro `INBOUND`. |
| `Idempotency-Key ya utilizada con otros datos` (enviar) · `Idempotency-Key utilizada con otros datos` (generar) | 409 | Genera una clave nueva: desde el primer intento cambió el texto, el mensaje fuente del borrador o el usuario. |
| `El borrador cambió; vuelve a revisarlo` | 409 | Relee el borrador y muestra el texto nuevo antes de aprobar. |
| `Borrador desactualizado o fallido; genera uno nuevo` | 409 | Ofrece «Generar otro». |
| `El borrador no está disponible para revisión` | 409 | Relee el borrador: sigue en `GENERATING` o ya está `APPROVED` o `REJECTED`. Repetir un aprobar o un rechazar con el mismo usuario y la misma `revision` no da este error: devuelve el borrador. |
| `Samanta está pausada en esta conversación` | 409 | Ofrece «Reanudar». |
| `No se puede desactivar al último administrador activo` · `No se puede retirar el rol al último administrador activo` | 409 | Revierte el cambio optimista. |
| `Ya existe un usuario registrado con este correo` · `Ya existe un cliente con ese teléfono o correo` · `Ya existe una categoría comercial con ese nombre` | 409 | Marca el campo. |
| `Validation failed (uuid is expected)` | 400 | Un id mal formado en la URL: trátalo como «No se encontró». |
| `Debes proporcionar al menos un campo para actualizar` · `Proporciona al menos un campo para actualizar` | 400 | Es un error de la UI: no envíes un PATCH sin cambios (deshabilita «Guardar», como hace `useDraft`). |

Conflictos de concurrencia: la operación chocó con otra. Refresca y deja que la persona repita la acción.

| Mensaje | Módulo |
|---|---|
| `La operación entró en conflicto con otro cambio; inténtalo nuevamente` | Usuarios |
| `La configuración entró en conflicto con otro cambio; inténtalo nuevamente` | Configuración |
| `La operación comercial entró en conflicto; inténtalo nuevamente` | Catálogo |
| `Conflicto concurrente; vuelve a intentarlo` | Clientes, solicitudes y reservas |
| `Conflicto de mensajería; vuelve a intentarlo` | Bandeja y Samanta (en los POST idempotentes, repite con la misma clave) |

#### 4.4 Qué hacer según el código

| Código | Origen | Qué hacer en la UI |
|---|---|---|
| 0 | El navegador no llegó al BFF | «No se pudo conectar…». Conserva los datos que ya había. TanStack Query reintenta las consultas; en una mutación, ofrece «Reintentar» (con la misma clave si es idempotente). |
| 400 con `message` array | Validación del DTO | `fieldErrors` / `serverFormErrors` ([§4.2](#42-errores-de-validación-por-campo)). |
| 400 con `message` string | Regla de negocio o `:id` inválido | Muestra el texto ([§4.3](#43-mensajes-de-negocio)). |
| 401 | Siempre del BFF: `NO_SESSION` o `SESSION_EXPIRED` | Nada en la pantalla: `apiFetch` emite `crm:session-expired` y `SessionProvider` lleva a `/login?motivo=sesion`. No reintentes. |
| 403 | Falta de rol (`No tienes permisos para realizar esta acción`) o una regla de asignación (`Solo puedes tomar conversaciones libres o desasignarte de las propias`, `Conversación asignada a otro operador`, `Un operador solo puede tomar una reserva libre o gestionar su propia asignación`) | Muestra el texto y refresca el recurso: cambió la asignación. Si es de rol, invalida `qk.me`. Oculta de antemano lo que el rol no puede hacer. |
| 404 | El recurso no existe (`Cliente no encontrado`…) o la ruta no existe (`Cannot GET …`; `Ruta no disponible.` del BFF) | En un detalle, «No se encontró» con enlace a la lista. En modo mock, `Cannot <MÉTODO> <ruta>` significa que esa ruta no está en el mock. |
| 409 | Estado que no permite la acción, duplicado, idempotencia o concurrencia | Muestra el texto y refresca ([§4.3](#43-mensajes-de-negocio)). |
| 413 | Body de más de 100 kb (`El cuerpo de la petición supera el tamaño máximo permitido`) | «El contenido es demasiado largo». Pon `maxLength` en los textos largos. |
| 415 | `unsupported charset "<CHARSET>"`: el `Content-Type` trae un `charset` que no empieza por `utf-` (p. ej. `latin1`, o `utf8` sin guion) | No ocurre con `apiFetch`, que envía `application/json` sin charset. |
| 429 | Login y recuperación (texto del BFF); `Límite de generación de Samanta alcanzado` | Muestra el texto y deshabilita la acción un rato. En Samanta no se sabe si se agotó el límite diario o el de generaciones simultáneas. |
| 500 | `Ocurrió un error interno`, con `path`, `method` y `timestamp` | «El servidor tuvo un error interno» con «Reintentar». Guarda `timestamp` para soporte. |
| 502 | Solo en `/api/auth/*` (bk-crm respondió algo inesperado) o en un proxy delante de ft-crm | Igual que la falta de conexión. |
| 503 sin `code` | bk-crm: `WhatsApp no está habilitado`, `Messenger no está habilitado`, `Samanta está desactivada`, `La zona horaria del restaurante no es válida` | Una función está apagada en el servidor (`isDisabledInServer`): muestra el texto y deshabilita la acción. No digas «sin conexión». |
| 503 o 504 con `BACKEND_UNAVAILABLE` | El BFF no llegó a bk-crm: red, servidor caído o más de 15 s (65 s al generar un borrador) | «No se pudo conectar» (`isConnectionError`). Antes de repetir un POST que no es idempotente, refresca: pudo completarse. |

`ApiError.isUnavailable` es `true` con 0, 502, 503 y 504, sin mirar `code`. Hoy no causa errores visibles: ninguna consulta (`GET`) responde 503 sin `code`, y al enviar, `sendErrorText` ya separa el 503 (solo trata como falta de conexión 0, 502 y 504). El riesgo está en el código nuevo. Las rutas que sí responden 503 sin `code` (generar, editar y aprobar borradores de Samanta; crear solicitudes y reservas con una zona horaria inválida) no deben pasar por `isUnavailable` ni por `actionErrorText` (`use-conversation-actions.ts`), que ante cualquier 503 responde «No se pudo conectar con el servidor.». Usa `isConnectionError` e `isDisabledInServer`.

Códigos que pone el BFF (`ApiErrorBody.code`):

| `code` | Estado | `message` | Cuándo |
|---|---|---|---|
| `NO_SESSION` | 401 | `Inicia sesión para continuar.` | No hay cookies de sesión |
| `SESSION_EXPIRED` | 401 | `Tu sesión terminó. Vuelve a iniciar sesión.` | Hacía falta renovar y no había cookie `crm_rt`, el refresh respondió 400 o 401, o bk-crm siguió respondiendo 401 tras renovar: logout, usuario desactivado, contraseña restablecida o sesión de más de 7 días. Además, borra las cookies. |
| `BACKEND_UNAVAILABLE` | 503 | `No se pudo conectar con el servidor del CRM. Inténtalo de nuevo en unos segundos.` | Error de red hacia bk-crm, o el refresh falló por otro motivo (la sesión sigue abierta) |
| `BACKEND_UNAVAILABLE` | 504 | `El servidor del CRM tardó demasiado en responder. Inténtalo de nuevo.` | Se superó `CRM_BACKEND_TIMEOUT_MS` (65 s al generar un borrador) |

Si el BFF renovó la sesión y justo después la llamada a bk-crm da 503 o 504, la respuesta no lleva las cookies nuevas. El BFF recuerda esa renovación 60 s en memoria, así que un reintento dentro de ese plazo la recupera.

### 5. Reglas transversales

#### Fechas y zona horaria

- **Lectura.** La API devuelve instantes ISO 8601 en UTC con milisegundos. Muéstralos siempre en `useRestaurant().timeZone` con los helpers de `src/lib/format/dates.ts`, nunca en la zona del navegador.
- **Zona por defecto.** Mientras no hay configuración, `DEFAULT_TIME_ZONE` es `America/Lima`. Estadísticas ya espera a conocer la zona antes de calcular el periodo; haz lo mismo en cualquier vista que calcule rangos.
- **Envío.** Usa instantes con segundos y zona (`ISO_INSTANT_PATTERN`). Sirven `toISOString()` y el `toISOString()` de un `TZDate`, que incluye el desplazamiento. Para un día y una hora elegidos en la UI, usa `zonedDateTime(día, hora, timeZone)`: crea el instante en la zona del restaurante.
- **Rangos.** `dateFrom` es inclusivo y `dateTo` exclusivo. Usa la medianoche de la zona del restaurante, como `zonedMidnightIso` (Calendario) y `periodRange` (Estadísticas).
- **Fechas futuras.** Crear solicitudes y reservas, editar su fecha y reprogramar exigen una fecha posterior a la hora del servidor. Valida con margen en el cliente; el 400 del backend es el que manda.
- **Hora de la reserva.** `IN_SERVICE` y `NO_SHOW` exigen que haya llegado la hora (`canSetReservationStatus` usa el reloj del dispositivo; el del servidor manda).
- **Almacenamiento.** Desde el 3/11/2026 bk-crm también guarda las fechas en UTC. Es un cambio interno: el formato de la API no cambia.

#### Importes

- Son strings (`MoneyString`). Envíalos como texto que cumpla `MONEY_PATTERN`: de `"0"` a `"99999999.99"`, punto decimal, sin separador de miles y con hasta 2 decimales. No los conviertas a `number` para enviarlos.
- La API los devuelve siempre con 2 decimales (`"38.5"` → `"38.50"`).
- Muéstralos con `formatMoney(importe, currency)` y la moneda de `useRestaurant()` (`PEN` por defecto).
- En las solicitudes, `quotedPrice` y `currency` van juntos. Si mandas precio sin moneda, el backend usa la del restaurante.

#### Bodies y `null`

- Envía solo los campos que declara el DTO: cualquier otro responde 400 `property <campo> should not exist`. Nunca reenvíes una respuesta del GET; arma el body campo a campo, como `toPutRequest`.
- En un POST, omite los opcionales vacíos.
- En un PATCH, omitir un campo lo conserva y `null` lo borra, si el campo lo admite (cada módulo dice cuáles no).
- Un texto vacío o con solo espacios responde 400: para borrar, envía `null`.
- Un PATCH sin campos responde 400. Deshabilita «Guardar» si no hay cambios.
- Booleanos y números van como tipos JSON en el body (`true`, `5`), no como texto. En la query, `toSearch` los convierte a texto y omite los vacíos.
- El body admite hasta 100 kb.

#### Idempotencia y reintentos

| Operación | ¿Repetirla duplica? | Cómo reintentar |
|---|---|---|
| `POST /conversations/:id/messages` | No, con la misma `Idempotency-Key` | Misma clave y mismo texto (el Composer ya guarda la clave en `pendingKey`) |
| `POST /conversations/:id/assistant-drafts` | No, con la misma `Idempotency-Key` | Misma clave y misma fuente (ver `useGenerateDraft` en [Bandeja](#bandeja)) |
| Aprobar o rechazar un borrador | No: el mismo usuario con la misma `revision` recibe el mismo resultado | Repite tal cual |
| PATCH y PUT | No: dejan el mismo estado (puede cambiar `updatedAt`) | Repite tal cual |
| Editar un borrador (`PATCH …/assistant-drafts/:draftId`) | No duplica, pero cada edición suma 1 a `revision`: si la primera llegó, el reintento responde 409 `El borrador cambió; vuelve a revisarlo` | Pide el borrador y compara su `content` antes de repetir |
| `POST /customers/:id/interests` | No: actualiza el interés existente (200) | Repite tal cual |
| `DELETE /customers/:id/interests/:commercialItemId` | La segunda vez responde 404 `Interés no encontrado` | Trata ese 404 como hecho |
| `POST /users`, `POST /customers`, `POST /commercial-categories` | No crean duplicados: un correo, teléfono o nombre repetido responde 409 | Refresca y revisa |
| `POST /commercial-items`, `POST /reservation-requests`, `POST /reservations`, `POST /reservations/:id/notes` | Sí: cada intento crea un registro | Tras un 504 o un error de red, refresca la lista antes de reintentar |
| Login, `forgot-password` y `reset-password` | Cuentan para el límite de intentos | No reintentes automáticamente |

- Cada acción del usuario lleva una clave nueva (`newIdempotencyKey()`). Reutilízala solo para repetir esa misma acción. No uses el prefijo `samanta-`: bk-crm lo reserva para aprobar borradores.
- El BFF repite una vez la llamada tras un 401 de bk-crm, con las mismas cabeceras (también `Idempotency-Key`). Es seguro: bk-crm rechazó la primera antes de ejecutarla.
- Mantén `retry: false` en las mutaciones.

#### Paginación con `collectPages`

- **Límites.** `limit` va de 1 a 100. Por defecto es 20, y 50 en conversaciones y mensajes. `page` va de 1 a 1 000 000: lee la de la URL con `parsePage`.
- **Sin resultados.** `totalPages` vale 0. Una página mayor que `totalPages` devuelve `data: []` con `total > 0`: ofrece volver a la primera, como Clientes.
- **Sin paginar.** `GET /users`, `GET /commercial-categories` y `GET /conversations/:id/assistant-drafts` (hasta 50) devuelven todo de una vez.
- **Mensajes.** La página 1 trae lo más reciente (`sequence` descendente). «Cargar anteriores» pide la página siguiente y deduplica por `id`, como `mergeMessages`.
- **`collectPages(fetchPage, maxPages = 20)`.** Lee la página 1 con `limit` 100 y después, en paralelo, hasta `maxPages`. Devuelve `{ rows, total, truncated }`:
  - úsalo solo donde hace falta el periodo completo: Calendario, Estadísticas y la pestaña Esperando;
  - muestra un aviso cuando `truncated` es `true`;
  - deduplica por `id`: si los datos cambian mientras se leen las páginas, la paginación por desplazamiento puede repetir o saltar filas (`groupByDay` ya deduplica).

#### Polling

No hay WebSockets ni SSE. Intervalos actuales de ft-crm:

| Datos | Intervalo | Dónde |
|---|---|---|
| `qk.me` | 5 min (`staleTime` 60 s) | `src/lib/auth/session.tsx` |
| Lista de la Bandeja, contador y conversación abierta | 6 s (`NEXT_PUBLIC_INBOX_POLL_MS`, mínimo 2 s) | `use-inbox.ts` |
| Chat | 4 s (`NEXT_PUBLIC_CHAT_POLL_MS`, mínimo 1,5 s); 1,5 s con salientes en `QUEUED` o `SENDING` | `use-inbox.ts` |
| Solicitudes de la Bandeja y del panel | 30 s | `use-inbox.ts`, `customer-panel.tsx` |
| Borrador en `GENERATING` (propuesta) | 2–3 s | `useAssistantDraft` en [Bandeja](#bandeja) |
| Calendario y detalle de reserva | 60 s | `calendario-view.tsx`, `reservation-detail.tsx` |
| Clientes | 60 s | `clientes-view.tsx` |
| Solicitudes | 30 s | `solicitudes-view.tsx` |
| Estadísticas, Ajustes y Usuarios | Sin polling | — |

- TanStack Query pausa el `refetchInterval` cuando la pestaña no está visible y vuelve a consultar al recuperar el foco (`refetchOnWindowFocus: true` en `providers.tsx`).
- Estas rutas no tienen límite de peticiones en bk-crm. Si el backend pide bajar la frecuencia, cambia las variables `NEXT_PUBLIC_*`.
- Con `MESSAGING_ENABLED=true`, el worker de bk-crm procesa la cola cada 2 s. Con `false` no hay worker: los mensajes ya guardados se quedan en `RECEIVED` o `QUEUED`.

### 6. De mock a live: lista de comprobación

El mock (`src/lib/mock/server.ts`, `seed.ts` y `simulator.ts`) implementa 28 de las 53 rutas que el navegador pide por `/api/backend`. Esta lista se verificó contra el código actual de ft-crm.

#### 6.1 Qué hace distinto el mock

| Área | Mock | bk-crm | Qué revisar en live |
|---|---|---|---|
| Rutas | Las 25 rutas nuevas de la [sección 2](#21-endpointsts) no existen: responde 404 `Cannot <MÉTODO> <ruta>`. | Existen todas. | Implementa en el mock las que uses, o prueba esas pantallas solo en live. |
| Sesión | Tokens sin firma (`alg: none`) y contraseña común `demo1234` (`CRM_MOCK_PASSWORD`). Sin límite de intentos. `forgot-password` no envía nada. `reset-password` acepta cualquier token de 64 hexadecimales y no cambia la contraseña ni cierra sesiones. | JWT firmados y contraseña de cada usuario. 429 al pasar el límite: 5 logins, 3 pedidos de recuperación o 5 restablecimientos cada 60 s. Correo real (Resend). El reset cierra todas las sesiones. | El 429 de login y el enlace real de recuperación. |
| Usuarios | `POST /users` con `roles: []` responde 400 con un string (`Debes asignar al menos un rol`). No valida el formato del email. `PATCH /users/:id/roles` cambia `updatedAt`. La regla del último ADMIN no mira si el usuario está activo. | Mensajes de class-validator en array (`roles must contain at least 1 elements`, `email must be an email`). Cambiar roles no toca `updatedAt`. La regla solo aplica a un ADMIN activo. | `createUserErrorTarget` y los errores por campo. |
| Configuración | Arranca configurado. El PUT valida poco: URL con una regex simple; no valida email, zona horaria ni decimales de las coordenadas. | 404 hasta el primer PUT y DTO completo. | `SetupForm` y los errores por campo de Empresa. |
| Catálogo | Elementos `APPROVED` por defecto. `POST /commercial-items` acepta solo 7 campos. Categorías ordenadas solo por `displayOrder`. | 86 elementos en `DRAFT` (9 sin `nameEs`), DTO completo y orden `displayOrder`, `nameEs`, `nameEn`. | Aprobar el catálogo y tener un editor. |
| Clientes | Casi todos con nombre y todos con teléfono, también los de `FACEBOOK`. `PATCH /customers/:id/status` no valida el enum. | WhatsApp: sin nombre. Messenger: sin teléfono ni email. Enum validado. | Textos de respaldo del nombre. |
| Solicitudes | El simulador las lleva a `WAITING_RESPONSE`, `ACCEPTED` o `REJECTED`. | Solo `INCOMPLETE_DATA`, `READY_TO_SEND` y `CANCELLED`. | KPI y pestañas en 0. |
| Reservas | Hay reservas que nacen de solicitudes aceptadas (`reservationRequestId` con valor). | Solo `POST /reservations` (ADMIN); `reservationRequestId` siempre `null`. | Calendario vacío y la píldora «Registrada en el CRM». |
| Envío | Solo `WHATSAPP` con teléfono; si no, 400 `Conversación sin destinatario WhatsApp habilitado`. Tope de 4096 en todos los canales. Nunca 503 ni 409 `Conflicto de mensajería`. | `WHATSAPP` y `FACEBOOK`; 400 `Conversación sin destinatario habilitado`; 2000 en Messenger; 503 con el canal apagado. | Messenger y los textos de error. |
| Estados de envío | Siempre `QUEUED` → `SENT` (1,2 s) → `DELIVERED` (2,6 s). | Dependen de `MESSAGING_ENABLED`, Redis y Meta. `READ` solo en WhatsApp; también `FAILED` y `UNKNOWN`. | Textos de `FAILED` y `UNKNOWN`. |
| Samanta | El simulador escribe `OUTBOUND` sin autor y ya `DELIVERED`. Regla de «más de 20 personas». | Borradores revisados por una persona; todo `OUTBOUND` tiene autor; no existe la regla de 20 personas. | `messageAuthor` y el panel de borradores. |
| Validación | Mensajes genéricos (p. ej. `page must not be less than 1` para cualquier página inválida). Nunca 413, 415 ni 429. | Mensajes exactos de class-validator. | `fieldErrors`. |
| Salud | `/api/listo` responde `{ "estado": "ok", "backend": "simulado" }` sin consultar nada. | `/api/listo` consulta `GET /health`. | Que `/api/listo` dé `"disponible"`. |
| Simulador | `/api/dev/simulador` hace de cliente, de Samanta y del dueño. | Responde 404 `El simulador solo está disponible en modo mock.` | Las pruebas e2e (`e2e/*.spec.ts`) dependen de él: son solo de modo mock. |

#### 6.2 Lista de comprobación

Configuración y datos:
- [ ] `.env.local` con `CRM_BACKEND_MODE=live` y `CRM_BACKEND_URL` ([§7](#72-ft-crm-en-modo-live)).
- [ ] `/api/salud` responde `"modo": "live"` y `/api/listo`, 200 con `"backend": "disponible"`.
- [ ] Entras con el ADMIN del seed y creas un usuario OWNER y otro OPERATOR en Ajustes › Usuarios.
- [ ] Ajustes › Empresa crea la configuración (pantalla inicial con 404) y Horarios abre los días.
- [ ] Ajustes › Servicios aprueba los elementos que Samanta debe ofrecer. Los 9 sin `nameEs` necesitan el editor.

Capa de API y errores:
- [ ] La [sección 2](#2-capa-de-api) está aplicada; `npm run typecheck`, `npm test` y `npm run lint` pasan.
- [ ] `servicios-logic.test.ts` completa `promotionDetail`.
- [ ] Las acciones nuevas (Samanta y altas de solicitudes y reservas) distinguen una función apagada (503 sin `code`, `isDisabledInServer`) de la falta de conexión (`isConnectionError`), y `sendErrorText` elige los textos de ventana y destinatario según el canal.

Sesión:
- [ ] El login limpia la caché antes de navegar.
- [ ] El sexto intento de login en 60 s muestra el texto del 429.
- [ ] La recuperación llega por correo (con `RESEND_API_KEY`) y el enlace abre `/reset-password`.

Bandeja:
- [ ] Messenger: envío, tope de 2000, ventana de 24 h y textos `MESSENGER_*`.
- [ ] Respaldo «Cliente de Messenger» en la lista, el chat, Clientes, Solicitudes y Calendario.
- [ ] `messageAuthor` ya no supone que un `OUTBOUND` sin autor es de Samanta.
- [ ] Panel de borradores de Samanta, con el aviso de `Samanta está desactivada` cuando `SAMANTA_ENABLED=false`.
- [ ] Con `WHATSAPP_ENABLED=false`, enviar avisa que WhatsApp no está habilitado (hoy `sendErrorText` muestra «El envío por WhatsApp no está habilitado en el servidor.») y no «sin conexión».
- [ ] Panel derecho sin el texto «Samanta la crea…», con «Nueva solicitud».

Solicitudes, Calendario, Clientes y Estadísticas:
- [ ] Pestañas y KPI del flujo del dueño ocultos o marcados como «Próximamente».
- [ ] «Nueva solicitud», «Nueva reserva» (solo ADMIN) y las ediciones de [03](#funciones-y-claves-de-caché-en-ft-crm).
- [ ] Textos «aceptadas por el dueño» y «No se puede deshacer» corregidos.
- [ ] `parsePage` en Solicitudes.
- [ ] Las escrituras de solicitudes y reservas invalidan `qk.statsAll`.

Mock y pruebas:
- [ ] El mock responde las rutas nuevas como bk-crm, o al menos las pantallas nuevas muestran bien su 404.
- [ ] El mock usa `Conversación sin destinatario habilitado`, acepta `FACEBOOK` con tope de 2000 y su `POST /users` con `roles: []` responde como bk-crm.
- [ ] Las pruebas e2e siguen en modo mock; el modo live se prueba a mano con la [sección 7](#7-cómo-probar-contra-el-backend-real).

### 7. Cómo probar contra el backend real

#### 7.1 bk-crm en local

1. **Requisitos.** Node.js y PostgreSQL. Redis solo hace falta para encender WhatsApp o Messenger, que exigen `MESSAGING_ENABLED=true` y `REDIS_URL` (`bk-crm/docs/redis-docker.md`). Samanta genera borradores sin Redis, pero aprobar uno envía por WhatsApp, así que para probar el flujo completo también lo necesitas.
2. **`.env`.** Cópialo de `.env.example` y ajusta:
   - `DATABASE_URL`: tu PostgreSQL local.
   - `JWT_SECRET` y `JWT_REFRESH_SECRET`: dos valores distintos.
   - `ADMIN_EMAIL` y `ADMIN_PASSWORD`: serán tu usuario ADMIN.
   - `WHATSAPP_ENABLED=false`. `.env.example` trae `true` con las credenciales vacías, y así bk-crm no arranca (`WHATSAPP_ACCESS_TOKEN requerida`).
   - `MESSAGING_ENABLED=false` si no tienes Redis. Entonces WhatsApp y Messenger tienen que estar apagados (si no, bk-crm no arranca: `WhatsApp requiere MESSAGING_ENABLED y REDIS_URL`), y enviar responde 503.
   - `MESSENGER_ENABLED=false` y `SAMANTA_ENABLED=false`, como en `.env.example`.
   - `FRONTEND_RESET_PASSWORD_URL=http://localhost:5173/reset-password`, que ya es el valor del ejemplo.
   - `RESEND_API_KEY`: una clave real solo si quieres recibir el correo de recuperación (con el remitente de prueba `onboarding@resend.dev`, Resend solo entrega al dueño de la cuenta). No la dejes vacía: bk-crm no arranca (`RESEND_API_KEY no está configurada`). Con el valor del ejemplo arranca, pero el correo no sale y la respuesta de `forgot-password` es la misma.
3. **Base de datos y arranque.**

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev
   npx prisma db seed
   npm run start:dev
   ```

   bk-crm queda en `http://localhost:3000`. El seed crea los roles, el ADMIN y el catálogo (16 categorías y 86 elementos en `DRAFT`). No crea la configuración del restaurante.
4. **Conversación de demostración** (opcional, solo con PostgreSQL local). En PowerShell:

   ```powershell
   $env:ALLOW_MESSAGING_DEMO = 'true'
   npx tsx scripts/seed-messaging-demo.ts
   Remove-Item Env:ALLOW_MESSAGING_DEMO
   ```

   Crea un cliente ficticio (`messaging.demo@example.com`) con una conversación de WhatsApp y dos mensajes entrantes. El script fuerza `MESSAGING_ENABLED=false`, así que solo funciona con `WHATSAPP_ENABLED=false` y `MESSENGER_ENABLED=false`; si no, falla con `No se pudo preparar la demo`. Ese cliente no tiene teléfono: con WhatsApp habilitado, responderle daría 400 `Conversación sin destinatario habilitado`.

#### 7.2 ft-crm en modo live

En `ft-crm/.env.local`:

```ini
CRM_BACKEND_MODE=live
CRM_BACKEND_URL=http://localhost:3000
```

Reinicia `npm run dev` (puerto 5173): el BFF lee las variables una sola vez. Comprueba:
- `http://localhost:5173/api/salud` → `{"estado":"ok","modo":"live"}`;
- `http://localhost:5173/api/listo` → 200 `{"estado":"ok","backend":"disponible"}`. Si responde 503, `backend` dice `no disponible` (bk-crm no contestó; `motivo` es `timeout`, `network` o `error`) o `respondió <código>` (bk-crm contestó con error, p. ej. 503 con la base de datos caída; sin `motivo`).

Variables del BFF (`src/lib/server/env.ts`; las `NEXT_PUBLIC_*` las lee `src/lib/config.ts` en el navegador):

| Variable | Por defecto | Uso |
|---|---|---|
| `CRM_BACKEND_MODE` | `live` si no está definida (`.env.example` trae `mock`) | `live` llama a bk-crm; `mock`, al backend simulado |
| `CRM_BACKEND_URL` | `http://localhost:3000` | URL de bk-crm, sin barra final. Solo la usa el servidor. |
| `CRM_BACKEND_TIMEOUT_MS` | `15000` (de 1000 a 120000) | Techo de cada llamada. Generar un borrador usa al menos 65 000. |
| `CRM_COOKIE_SECURE` | `true` en producción | Cookies `Secure`: en producción hace falta HTTPS. |
| `CRM_ALLOW_MOCK_IN_PRODUCTION` | `false` | El modo mock no arranca en producción salvo que esto sea `true`. |
| `NEXT_PUBLIC_INBOX_POLL_MS`, `NEXT_PUBLIC_CHAT_POLL_MS` | `6000`, `4000` | Polling de la Bandeja ([§5](#polling)). |

`CRM_MOCK_PASSWORD`, `CRM_ENABLE_SIMULATOR` y `CRM_MOCK_LATENCY_MS` no tienen efecto en modo live.

#### 7.3 Escenarios que conviene probar

| Escenario | Cómo provocarlo | Qué debe pasar |
|---|---|---|
| Primer arranque | Base recién creada con el seed | Ajustes › Empresa muestra la configuración inicial al ADMIN; OWNER y OPERATOR ven un aviso. |
| Roles | Entra como OWNER, OPERATOR y SUPPORT | OWNER solo lee. OPERATOR opera, pero no configura, no gestiona usuarios ni crea reservas. SUPPORT no tiene vistas. |
| Sesión revocada | Con un ADMIN, desactiva a otro usuario con sesión abierta | En su siguiente llamada, ese usuario vuelve a `/login?motivo=sesion`. |
| Límite de login | Seis intentos con el mismo correo en 60 s | `Hiciste demasiados intentos…` |
| Canal apagado | `WHATSAPP_ENABLED=false` y responde en una conversación de WhatsApp | El aviso de que WhatsApp no está habilitado (bk-crm responde 503 `WhatsApp no está habilitado`), no «sin conexión». |
| Samanta apagada | `SAMANTA_ENABLED=false` y pulsa «Generar» | Aviso de `Samanta está desactivada` y el botón deshabilitado. |
| Backend caído | Detén bk-crm | `/api/listo` da 503. Las vistas muestran «No se pudo cargar» o conservan sus datos con un aviso, sin mostrar listas vacías. |
| Restaurante sin configurar | Crea una solicitud antes de configurar | 409 `Configura el restaurante antes de crear solicitudes o reservas`, con enlace a Empresa. |

#### 7.4 Guías Postman de bk-crm

Sirven para separar un fallo del frontend de uno del backend: si Postman da la misma respuesta, el problema está en bk-crm. Llaman a bk-crm directamente, con `Authorization: Bearer`. Por eso ves los 401 propios de bk-crm, que en el navegador siempre traduce el BFF.

| Guía (`bk-crm/docs/`) | Qué cubre |
|---|---|
| `customers-postman.md` | Clientes e intereses comerciales |
| `reservations-postman.md` | Solicitudes de reserva y reservas; recuerda que sin configuración del restaurante crearlas da 409 |
| `reservation-calendar-postman.md` | Responsable, observaciones y reprogramación de reservas |
| `messaging-postman.md` | Conversaciones, mensajes, lectura, pausa y asignación; script de demostración |
| `whatsapp-postman.md` | WhatsApp Cloud API: webhook, envío y estados |
| `messenger-postman.md` | Activación y prueba controlada de Messenger |
| `samanta-postman.md` | Borradores de Samanta |
| `redis-docker.md` | Redis local para los workers |

- Algunas guías son anteriores a los cambios del 3/11. Si contradicen este documento, sigue este documento y avisa al equipo de backend.
- Con credenciales reales de WhatsApp o Messenger, enviar desde la Bandeja manda mensajes reales. Usa un número o una página de prueba.
