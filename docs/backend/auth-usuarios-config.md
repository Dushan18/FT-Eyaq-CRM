# bk-crm API contract: auth, users, health, restaurant config, and route inventory

I built this by reading the bk-crm source only. I did not run, build, or modify anything, and I did not open `.env`.
Companion types live in `auth-config.ts`, which is standalone and type-checks with `tsc --strict`.

---

## 0. Global conventions

| Topic | Fact | Source |
|---|---|---|
| Base URL | `http://localhost:3000` (`PORT`, default 3000). **No global prefix.** | `src/main.ts` |
| CORS | **Not enabled.** A browser on another origin can't call the API directly, so use a Next.js server-side proxy/BFF or get CORS enabled. | `src/main.ts` |
| Port clash | Next.js dev also defaults to 3000, so run the frontend on another port. | — |
| Auth transport | `Authorization: Bearer <accessToken>`. There are **no cookies**. The refresh token goes in the JSON body. | `access-token.strategy.ts` |
| Validation | `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`. An unknown prop returns 400 `"property X should not exist"`. There is no implicit conversion: only fields with `@Type(() => Number)` coerce strings. | `main.ts` |
| Dates | ISO-8601 UTC strings ending in `Z`. | Prisma `DateTime` |
| IDs | UUID strings. `:id` params go through `ParseUUIDPipe` and fail with 400 `"Validation failed (uuid is expected)"`. | controllers |
| Decimal | Restaurant `latitude`/`longitude` come back as JSON **numbers** (`toNumber()`). Money in commercial items and reservation requests comes back as **strings with 2 decimals** (`toFixed(2)`). | services |
| Global filter | HttpException bodies pass through unchanged. Non-HTTP errors become `{statusCode:500, message:'Ocurrió un error interno', path, method, timestamp}`. | `global-exception.filter.ts` |
| Messages language | Business messages are in Spanish. Validation messages are class-validator English defaults unless the DTO sets a custom Spanish message. | DTOs |

### Error body shapes
| Case | Body |
|---|---|
| ValidationPipe | `{ statusCode: 400, message: string[], error: 'Bad Request' }`. Nested messages get a path prefix, e.g. `"schedules.0.openTime debe tener el formato HH:mm"`. |
| Business (`new XException('msg')`) | `{ statusCode, message: 'msg', error: 'Bad Request'/'Unauthorized'/'Forbidden'/'Not Found'/'Conflict' }` |
| Passport default 401 (no token, bad token, **expired** token) | `{ statusCode: 401, message: 'Unauthorized' }` with **no `error` field** |
| 403 RolesGuard | `{ statusCode: 403, message: 'No tienes permisos para realizar esta acción', error: 'Forbidden' }` |
| 429 Throttler | `{ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }` plus the `Retry-After` header (seconds) |
| Unknown route | `{ statusCode: 404, message: 'Cannot GET /x', error: 'Not Found' }` |
| 500 | `{ statusCode: 500, message: 'Ocurrió un error interno', path, method, timestamp }` |
| 503 health | the HealthResponse object itself (`status:'error'`, `database:'down'`) |

---

## 1. Endpoint tables (scope A and B)

### Auth
| Method | Path | Access | Success | Request | Response |
|---|---|---|---|---|---|
| POST | `/auth/login` | public (**not throttled**) | **201** | `{ email, password }` | `{ accessToken, refreshToken, user:{id,firstName,lastName,email,roles[]} }` |
| POST | `/auth/refresh` | public | **201** | `{ refreshToken }` | `{ accessToken, refreshToken }` (**no user**) |
| GET | `/auth/me` | any authenticated | 200 | — | `{ id, sessionId, firstName, lastName, email, roles[] }` |
| POST | `/auth/logout` | any authenticated | **201** | no body | `{ message:'Sesión cerrada correctamente' }` |
| POST | `/auth/forgot-password` | public, **3 req/60 s per IP** | 200 | `{ email }` | `{ message:'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña' }` (always the same) |
| POST | `/auth/reset-password` | public, **5 req/60 s per IP** | 200 | `{ token, newPassword }` | `{ message:'Contraseña restablecida correctamente' }` |
| GET | `/auth/test-admin` | ADMIN | 200 | — | `{ message:'Acceso autorizado para administrador' }` |

### Health and root
| Method | Path | Access | Success | Response |
|---|---|---|---|---|
| GET | `/health` | public | 200 / 503 | `{ status:'ok'\|'error', services:{api:'up', database:'up'\|'down'}, timestamp, uptimeSeconds }`, sent with `Cache-Control: no-store`. It only runs `SELECT 1` with a 3 s timeout and does not check Redis. |
| GET | `/` | public | 200 | text `Hello World!` |

### Users (every route is ADMIN only; class-level `@Roles(ADMIN)`)
| Method | Path | Success | Body | Response |
|---|---|---|---|---|
| POST | `/users` | **201** | `{ firstName, lastName, email, password, roles[] }` | `User` |
| GET | `/users` | 200 | — | `User[]`: **plain array, not paginated, no filters**, ordered `createdAt DESC` |
| GET | `/users/:id` | 200 | — | `User` |
| PATCH | `/users/:id` | 200 | `{ firstName?, lastName?, email? }` (at least one) | `User` |
| PATCH | `/users/:id/status` | 200 | `{ isActive: boolean }` | `User` |
| PATCH | `/users/:id/roles` | 200 | `{ roles: RoleCode[] }` (replaces the whole set) | `User` |

`User` = `{ id, firstName, lastName, email, isActive, lastLoginAt: string|null, createdAt, updatedAt, roles: RoleCode[] }`.
- Roles come back as a flat array of codes, with no names and no guaranteed order.
- `passwordHash` is never returned.

Some admin operations have no endpoint at all:
- deleting a user
- setting or changing another user's password
- listing roles
- managing sessions

### Restaurant config (singleton, scope GLOBAL)
| Method | Path | Access | Success | Body | Response |
|---|---|---|---|---|---|
| GET | `/restaurant-config` | ADMIN, OWNER, OPERATOR | 200 (**404** `'Configuración del restaurante no encontrada'` until the first PUT) | — | `RestaurantConfig` |
| PUT | `/restaurant-config` | ADMIN | **200 even on first creation** | `PutRestaurantConfigRequest` (full replace) | `RestaurantConfig` |

There is no POST, DELETE, or `/:id` route. SUPPORT gets 403 on GET.

---

## 2. Token and session lifecycle

1. **Login** (`POST /auth/login`, 201)
   - Looks the email up after trim and lowercase.
   - Unknown email, inactive user, and wrong password all return 401 `'Correo o contraseña incorrectos'`.
   - A malformed email or a password **shorter than 8 characters returns 400**, not 401, because `LoginDto` has `@MinLength(8)`.
   - On success it creates a `Session` row with `expiresAt = now + 7 days` (hard-coded), stores the SHA-256 of the refresh token, and updates `lastLoginAt`.
2. **Access token**
   - JWT signed with `JWT_SECRET`, expiry `JWT_EXPIRES_IN` (`.env.example`: `15m`).
   - Claims: `{ sub, sessionId, email, roles, iat, exp }`.
   - **The expiry is not in the response body**, so decode `exp`.
3. **Refresh token**
   - JWT signed with `JWT_REFRESH_SECRET`, expiry `JWT_REFRESH_EXPIRES_IN` (example `7d`).
   - Claims: `{ sub, sessionId, jti }`.
4. **Each guarded request**
   - The strategy re-reads the user and session from the database every time.
   - Deactivation, logout, password reset, and role changes therefore take effect **immediately**.
   - Roles in the JWT can go stale, so use `/auth/me` for authorization in the UI.
5. **Refresh** (`POST /auth/refresh`, body `{refreshToken}`, 201)
   - Verifies the JWT, then the session (exists, belongs to the user, not revoked, not expired), then the hash, then that the user is active.
   - **Rotates** the token: a new pair is returned and the old refresh token stops working.
   - **The session's 7-day absolute lifetime is not extended**, so the user must log in again 7 days after login.
   - Reusing an old token returns 401 `'Refresh token inválido'`. The session is not revoked, so there is no reuse detection.
   - Parallel refreshes with the same token: one succeeds and the rest return 401. The client needs a single-flight refresh mutex.
6. **Logout** (`POST /auth/logout`, 201)
   - Needs a valid access token.
   - Revokes only the current session. Other devices and sessions stay alive.
   - With an expired access token it returns 401, so the client should still clear its local tokens.
7. **Global revocation**
   - Deactivating a user (`PATCH /users/:id/status {isActive:false}`) revokes all of that user's sessions.
   - A successful `reset-password` also revokes all of that user's sessions.

### 401 messages
| When | message | `error` field |
|---|---|---|
| Missing, malformed, badly signed, or **expired** access token | `Unauthorized` | absent |
| JWT has no `sub`/`sessionId` | `Token de acceso inválido` | `Unauthorized` |
| User deleted or inactive (guard or refresh) | `Usuario no autorizado` | `Unauthorized` |
| Session revoked or expired (guard) | `Sesión no válida o expirada` | `Unauthorized` |
| Refresh JWT invalid or expired | `Refresh token inválido o expirado` | `Unauthorized` |
| Refresh: session missing or user mismatch | `Sesión no válida` | `Unauthorized` |
| Refresh: session revoked | `Sesión revocada` | `Unauthorized` |
| Refresh: session past 7 days | `Sesión expirada` | `Unauthorized` |
| Refresh: hash mismatch (old token) | `Refresh token inválido` | `Unauthorized` |
| Refresh: lost the rotation race | `Refresh token ya utilizado o sesión no válida` | `Unauthorized` |
| Login failure | `Correo o contraseña incorrectos` | `Unauthorized` |

Client strategy:
- On a 401 from any guarded route except `/auth/*`, try **one** refresh and then replay the request.
- If the refresh itself returns 401, log the user out locally.

### Password reset flow
- **Throttling** is in-memory, keyed by `req.ip`, per instance. Behind a proxy without `trust proxy`, every user shares one IP. Login has **no** throttle.
- **Forgot**
  - Always returns 200 with the same message.
  - Creates a 64-hex token with a TTL of `PASSWORD_RESET_TOKEN_TTL_MINUTES` (default 15, allowed 1–1440).
  - Deletes the user's previous tokens.
  - Sends an email through Resend.
- **Link**: `new URL(FRONTEND_RESET_PASSWORD_URL)` plus `searchParams.set('token', <64 lowercase hex>)`.
  - The default is `http://localhost:5173/reset-password` (a Vite default).
  - The Next.js app must expose a page that reads **`?token=`**, and the backend env must point at that page.
- **Reset** with `{ token: /^[a-f0-9]{64}$/i, newPassword: 8..72 }`:
  - Single use.
  - Fails with 400 `'El enlace de recuperación es inválido o ha expirado'` when the token is used, expired, or unknown, or when the user is inactive.
  - On success it revokes **all** of the user's sessions.

### Password rules
- **Create user and reset:** 8 to 72 characters. There are no complexity rules.
- **Login:** minimum 8 characters, no maximum.

---

## 3. RBAC matrix

✅ means allowed. 🔓 means public. "auth" means any valid token.

| Area / route | ADMIN | OWNER | OPERATOR | SUPPORT |
|---|---|---|---|---|
| `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password`, `/health`, `/` | 🔓 | 🔓 | 🔓 | 🔓 |
| `GET /auth/me`, `POST /auth/logout` | auth | auth | auth | auth |
| `GET /auth/test-admin` | ✅ | ❌ | ❌ | ❌ |
| `/users/**` (all) | ✅ | ❌ | ❌ | ❌ |
| `GET /restaurant-config` | ✅ | ✅ | ✅ | ❌ |
| `PUT /restaurant-config` | ✅ | ❌ | ❌ | ❌ |
| `GET /commercial-categories[/:id]`, `GET /commercial-items[/:id]` | ✅ | ✅ | ✅ | ❌ |
| `POST/PATCH` commercial categories and items (incl. `/approval`) | ✅ | ❌ | ❌ | ❌ |
| `GET /customers[/:id]` | ✅ | ✅ | ✅ | ❌ |
| `POST/PATCH /customers…`, interests POST/DELETE | ✅ | ❌ | ✅ | ❌ |
| `GET /reservation-requests[/:id]` | ✅ | ✅ | ✅ | ❌ |
| `POST/PATCH /reservation-requests…` | ✅ | ❌ | ✅ | ❌ |
| `GET /reservations[/:id]` | ✅ | ✅ | ✅ | ❌ |
| `POST /reservations` | ✅ | ❌ | ❌ | ❌ |
| `PATCH /reservations/:id{,/status,/assignee,/reschedule}`, `POST /:id/notes` | ✅ | ❌ | ✅ | ❌ |
| `GET /conversations[/:id][/messages]` | ✅ | ✅ | ✅ | ❌ |
| `POST /conversations/:id/messages`, `PATCH …/read`, `…/assistant`, `…/assignee` | ✅ | ❌ | ✅ | ❌ |
| `/webhooks/whatsapp` (Meta only) | 🔓 | 🔓 | 🔓 | 🔓 |

Notes:
- Roles combine with OR, and a method-level `@Roles` **overrides** the class-level one.
- **SUPPORT can't reach any business endpoint**; it only gets `/auth/me` and logout.
- OWNER is read-only everywhere and **cannot approve commercial items**, even though the seed describes OWNER as "Responsable de validación".
- A user with zero roles can only call `/auth/me` and logout.

---

## 4. Restaurant config validation rules (PUT body)

String fields are **trimmed before validation**, so length limits apply to the trimmed value. The PUT is a **full replacement**: an omitted optional field becomes `null`, and languages and schedules are deleted and recreated.

| Field | Required | Rules |
|---|---|---|
| businessName | yes | string, not empty, ≤150 |
| logoUrl | no, nullable | http/https URL, protocol required, **TLD required** (`http://localhost/...` is rejected, IPs are OK), ≤2048. **`""` is rejected**: send `null` or omit it to clear. |
| description | no, nullable | not empty, ≤2000 (the DB column is TEXT). `""` or whitespace is rejected. |
| address | yes | not empty, ≤300 |
| latitude | no, nullable | JSON **number** (strings are rejected), −90..90, ≤7 decimals, finite |
| longitude | no, nullable | JSON number, −180..180, ≤7 decimals. Both must be numbers or both null/omitted; sending only one gives a 400 validation array for the missing one. There is also a DB CHECK. |
| whatsappNumber | yes | `^\+[1-9]\d{7,14}$` (E.164, 8–15 digits), ≤16 |
| email | yes | trimmed and lowercased, then `@IsEmail`, ≤320 |
| website | no, nullable | same as logoUrl |
| currency | yes | `PEN` \| `USD` |
| timeZone | yes | IANA (validated through `Intl`), ≤64, e.g. `America/Lima` |
| reservationPolicy / cancellationPolicy | yes | not empty, ≤5000 each |
| responseTimeoutMinutes | yes | integer 1..1440 (a numeric string like `"45"` is coerced). There is also a DB CHECK. |
| approvalResponsibleId | no, nullable | UUID of an **existing, active user that has OWNER** (ADMIN alone is rejected). `null` or omitted disconnects it. |
| languages | yes | 1..3 items, unique, `ES`/`EN`/`PT` |
| schedules | yes | **exactly 7**, unique by `dayOfWeek`, any order |
| schedules[].isOpen=false | — | `openTime`/`closeTime` must be omitted or null |
| schedules[].isOpen=true | — | both are `HH:mm` (`00:00`–`23:59`; `24:00` is invalid) and **`openTime < closeTime`** (string comparison). **Overnight ranges are not supported, and `closeTime:"00:00"` is never valid**, so the latest close is `23:59`. |

**Response (`RestaurantConfig`):**
- Fields: `id`, `businessName`, `logoUrl|null`, `description|null`, `address`, `latitude:number|null`, `longitude:number|null`, `whatsappNumber`, `email`, `website|null`, `currency`, `timeZone`, `reservationPolicy`, `cancellationPolicy`, `responseTimeoutMinutes`, `approvalResponsibleId|null`, `approvalResponsible:{id,firstName,lastName,email}|null`, `languages` (sorted ES, EN, PT), `schedules` (7 rows sorted MONDAY..SUNDAY, each `{dayOfWeek,isOpen,openTime|null,closeTime|null}`), `createdAt`, `updatedAt`.
- `scope` is not returned.

**PUT errors:**
- 400 validation array.
- 400 strings: the responsible user doesn't exist, isn't active, or doesn't have OWNER.
- 400 `schedules debe contener exactamente…`.
- 400 `Los horarios son incoherentes o cruzan la medianoche`.
- 400 `La configuración contiene referencias o valores inválidos`.
- 409 conflict, after 3 serializable retries.

**Other modules depend on this config:**
- Creating reservation requests or reservations without it returns 409 `'Configura el restaurante antes de crear solicitudes o reservas'`.
- Its `timeZone` sets the year in reservation codes.

---

## 5. Users rules
- **Names:**
  - string, 1..100 characters, must contain a non-whitespace character, trimmed by the server.
  - A whitespace-only name returns 400 (`'firstName no puede contener solo espacios'`).
- **Email:**
  - `@IsEmail`, ≤320, stored trimmed and lowercased, unique.
  - A duplicate returns 409 `'Ya existe un usuario registrado con este correo'`.
  - Send it already trimmed: surrounding spaces fail `@IsEmail`.
- **`PATCH /users/:id`:**
  - An empty `{}` returns 400 `'Debes proporcionar al menos un campo para actualizar'`.
  - **A bug: sending `null` for firstName, lastName, or email passes validation and then crashes, returning 500.** Omit fields instead of sending null.
- **Roles:**
  - array, ≥1, unique, valid enum values.
  - If the role rows are missing from the DB (seed not run), it returns 400 `'Uno o más roles no están disponibles'`.
- **Last-admin protection** (inside a Serializable transaction):
  - Deactivating the last active ADMIN returns 409 `'No se puede desactivar al último administrador activo'`.
  - Removing ADMIN from the last active ADMIN returns 409 `'No se puede retirar el rol al último administrador activo'`.
  - A concurrent change returns 409 `'La operación entró en conflicto con otro cambio; inténtalo nuevamente'`.
  - Self-deactivation is allowed when another active admin exists, and it kills the caller's own session.
- **Not found:** 404 `'Usuario no encontrado'`.

---

## 6. Full route inventory (scope C)

`ROUTES` in the `.ts` file is the machine-readable version. There are 57 routes.

| Method | Path | Roles | Status | File |
|---|---|---|---|---|
| GET | `/` | public | 200 | app.controller.ts |
| GET | `/health` | public | 200 | health/health.controller.ts |
| POST | `/auth/forgot-password` | public, throttle 3/60s | 200 | auth/auth.controller.ts |
| POST | `/auth/reset-password` | public, throttle 5/60s | 200 | auth/auth.controller.ts |
| POST | `/auth/login` | public | 201 | auth/auth.controller.ts |
| GET | `/auth/me` | authenticated | 200 | auth/auth.controller.ts |
| GET | `/auth/test-admin` | ADMIN | 200 | auth/auth.controller.ts |
| POST | `/auth/refresh` | public | 201 | auth/auth.controller.ts |
| POST | `/auth/logout` | authenticated | 201 | auth/auth.controller.ts |
| POST | `/users` | ADMIN | 201 | users/users.controller.ts |
| GET | `/users` | ADMIN | 200 | users/users.controller.ts |
| GET | `/users/:id` | ADMIN | 200 | users/users.controller.ts |
| PATCH | `/users/:id` | ADMIN | 200 | users/users.controller.ts |
| PATCH | `/users/:id/status` | ADMIN | 200 | users/users.controller.ts |
| PATCH | `/users/:id/roles` | ADMIN | 200 | users/users.controller.ts |
| GET | `/restaurant-config` | ADMIN, OWNER, OPERATOR | 200 | restaurant-config/…controller.ts |
| PUT | `/restaurant-config` | ADMIN | 200 | restaurant-config/…controller.ts |
| POST | `/commercial-categories` | ADMIN | 201 | commercial/commercial-categories.controller.ts |
| GET | `/commercial-categories` | ADMIN, OWNER, OPERATOR | 200 (array) | same |
| GET | `/commercial-categories/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| PATCH | `/commercial-categories/:id` | ADMIN | 200 | same |
| PATCH | `/commercial-categories/:id/status` | ADMIN | 200 | same |
| POST | `/commercial-items` | ADMIN | 201 | commercial/commercial-items.controller.ts |
| GET | `/commercial-items` | ADMIN, OWNER, OPERATOR | 200 (paginated) | same |
| GET | `/commercial-items/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| PATCH | `/commercial-items/:id` | ADMIN | 200 | same |
| PATCH | `/commercial-items/:id/status` | ADMIN | 200 | same |
| PATCH | `/commercial-items/:id/approval` | ADMIN | 200 | same |
| POST | `/customers` | ADMIN, OPERATOR | 201 | customers/customers.controller.ts |
| GET | `/customers` | ADMIN, OWNER, OPERATOR | 200 (paginated) | same |
| GET | `/customers/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| PATCH | `/customers/:id` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/customers/:id/status` | ADMIN, OPERATOR | 200 | same |
| POST | `/customers/:id/interests` | ADMIN, OPERATOR | **200** | same |
| DELETE | `/customers/:id/interests/:commercialItemId` | ADMIN, OPERATOR | **204** | same |
| POST | `/reservation-requests` | ADMIN, OPERATOR | 201 | reservation-requests/…controller.ts |
| GET | `/reservation-requests` | ADMIN, OWNER, OPERATOR | 200 (paginated) | same |
| GET | `/reservation-requests/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| PATCH | `/reservation-requests/:id` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/reservation-requests/:id/status` | ADMIN, OPERATOR | 200 | same |
| POST | `/reservations` | **ADMIN** | 201 | reservations/reservations.controller.ts |
| GET | `/reservations` | ADMIN, OWNER, OPERATOR | 200 (paginated) | same |
| GET | `/reservations/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| PATCH | `/reservations/:id` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/reservations/:id/status` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/reservations/:id/assignee` | ADMIN, OPERATOR | 200 | same |
| POST | `/reservations/:id/notes` | ADMIN, OPERATOR | 201 | same |
| PATCH | `/reservations/:id/reschedule` | ADMIN, OPERATOR | 200 | same |
| POST | `/conversations/:id/messages` | ADMIN, OPERATOR | **202** (needs the `Idempotency-Key` header) | messaging/conversations.controller.ts |
| GET | `/conversations` | ADMIN, OWNER, OPERATOR | 200 (paginated, limit default 50) | same |
| GET | `/conversations/:id` | ADMIN, OWNER, OPERATOR | 200 | same |
| GET | `/conversations/:id/messages` | ADMIN, OWNER, OPERATOR | 200 (paginated, default 50, `sequence DESC`) | same |
| PATCH | `/conversations/:id/read` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/conversations/:id/assistant` | ADMIN, OPERATOR | 200 | same |
| PATCH | `/conversations/:id/assignee` | ADMIN, OPERATOR | 200 | same |
| GET | `/webhooks/whatsapp` | public (Meta verify) | 200 text/plain | whatsapp/whatsapp.controller.ts |
| POST | `/webhooks/whatsapp` | public (`X-Hub-Signature-256`) | 200 `{received:true}` | same |

---

## 7. Shared conventions

- **Pagination envelope:** `{ data: T[], pagination: { page, limit, total, totalPages } }`, where `totalPages = ceil(total/limit)` and is 0 when there are no rows.
  - Query `page` is an integer 1..1,000,000 (default 1).
  - Query `limit` is an integer 1..100. It defaults to 20, or 50 for conversations and messages.
  - Unknown query params return 400.
  - It's offset-based; there are no cursors.
  - It's used by customers, commercial-items, reservation-requests, reservations, conversations, and conversation messages.
  - Users and commercial-categories return **plain arrays**.
- **IDs:** UUIDs everywhere, including the session id.
- **Business codes:**
  - Reservation request: `RES-YYYY-NNNNNN`.
  - Reservation: `R-YYYY-NNNNNN`.
  - Both use PostgreSQL sequences, zero-padded to 6 digits. The year is computed in the restaurant's time zone.
  - The **request** code starts with `RES-`, which is counter-intuitive.
- **Idempotency-Key** is used only by `POST /conversations/:id/messages`:
  - The header is required and must match `/^[a-zA-Z0-9_-]{16,80}$/`. Otherwise it returns 400.
  - Replaying the same key with the same author, type, and content returns the existing message (202).
  - The same key with different data returns 409 `'Idempotency-Key ya utilizada con otros datos'`.
  - WhatsApp disabled returns 503 `'WhatsApp no está habilitado'`, and that check runs before the key check.
  - If the 24 h window is closed it returns 409.
  - The body is `{ type:'TEXT', content: 1..4096 chars, non-blank }`.
- **HTTP status quirks:**
  - Nest returns 201 for every POST without `@HttpCode`, which includes login, refresh, logout, and notes.
  - These return 200: forgot-password, reset-password, `/customers/:id/interests`, and the webhook POST.
  - PUT always returns 200.

---

## 8. Realtime, stats, and audit findings

- **Realtime: none.**
  - There is no `@nestjs/websockets`, socket.io, `@Sse`, or `text/event-stream`.
  - BullMQ and Redis are used only internally for message processing and the outbox, and nothing about them is exposed.
  - The frontend has to **poll**, e.g. `GET /conversations` (which includes `unreadCount`) and `GET /conversations/:id/messages`.
- **Stats / dashboards / aggregation: none.**
  - There are no stats or KPI endpoints.
  - The only aggregate is `unreadCount` per conversation, which comes from `_count`.
  - Dashboards would have to be computed client-side from paginated lists, using `pagination.total` for counts with filters.
- **Audit: none.**
  - There is no audit table in the Prisma schema.
  - There are only `// TODO: integrar auditoría …` comments in the services (restaurant config, commercial, customers, reservations, messaging).
  - The available activity fields are:
    - `User.lastLoginAt`
    - `createdAt`/`updatedAt` on records
    - reservation `noteHistory` and `rescheduleHistory`
    - message timestamps

---

## 9. Seed data

**`prisma/seed.ts`** is idempotent and runs through `tsx prisma/seed.ts`.
- **Roles (4):**
  - ADMIN "Administrador"
  - OWNER "Propietario"
  - OPERATOR "Operador"
  - SUPPORT "Soporte EYAQ"
- **One user:**
  - "Administrador EYAQ", email `ADMIN_EMAIL` (code fallback `admin@eyaqsystems.com`; `.env.example` uses `admin@eyaq.systems`), with the ADMIN role.
  - Password: `ADMIN_PASSWORD` (code fallback `ChangeMe123!`).
  - Re-running the seed does **not** reset the password, because the upsert update leaves `passwordHash` alone.
- **No OWNER, OPERATOR, or SUPPORT users, and no restaurant config**, so `GET /restaurant-config` returns 404 and `approvalResponsibleId` needs an OWNER created through `POST /users` first.
- It also calls `seedCommercialCatalog`.

**`prisma/seed-commercial-catalog.ts`** (data in `prisma/data/commercial-catalog.data.ts`) holds the "Sabor Mágico Grill" menu:
- **16 categories** (ENTRADAS/STARTERS, SOPAS, platos típicos, alpaca, res, pollo, trucha, pastas, vegetariano, postres, jugos, bebidas calientes, bebidas frías, cerveza, cócteles, vinos).
- **86 items**: 48 DISH and 38 BEVERAGE.
- 69 items have a `basePrice`. 17 items carry 27 variants instead.
- Prices are in PEN.
- **Every item is `approvalStatus: DRAFT`** and `isActive: true`.
  - Reservations and requests require **APPROVED** items, so seeded items have to be approved (`PATCH /commercial-items/:id/approval`, ADMIN) before they can be linked.
- There are no images, FAQs, schedules, or promotion/event details.

**`scripts/seed-messaging-demo.ts`** (dev only):
- **Preconditions:** `ALLOW_MESSAGING_DEMO=true`, a non-production environment, and a local Postgres.
- **What it does:** ingests 2 inbound WHATSAPP TEXT messages from customer "Cliente Demo mensajería" (`messaging.demo@example.com`):
  - "Hola, quiero información"
  - "¿Qué platos tienen disponibles?"
- **Result:** 1 customer and 1 conversation with 2 messages. It forces `MESSAGING_ENABLED=false`.

---

## 10. Open questions and risks for the frontend

1. **CORS is off, and Next.js and the API both default to port 3000.** Decide between a BFF/proxy (where an httpOnly cookie holds the tokens on the Next.js side) and asking the backend to enable CORS.
2. **The reset link defaults to `http://localhost:5173/reset-password`.** Set the backend `FRONTEND_RESET_PASSWORD_URL` to the Next.js page, which must read `?token=`.
3. **Access-token expiry isn't in the body**, so decode the JWT `exp`. **Sessions hard-expire 7 days after login**, whatever refresh activity there is.
4. **Expired and invalid access tokens look the same** (`{statusCode:401,message:'Unauthorized'}`), so the client should attempt one refresh on any 401.
5. **Refresh has no reuse detection and no per-device session list.** A single-flight refresh is mandatory, or parallel tabs will log each other out.
6. **Login isn't rate limited.** The throttle is in-memory and keyed by IP, so it is unreliable behind a proxy or BFF unless `trust proxy` is set.
7. **SUPPORT can't use any business endpoint, and OWNER can't approve catalog items.** Is that intended?
8. **No endpoints for:** listing roles, role display names, admin set-password, self-service profile or password change, deleting a user, or a paginated/searchable users list. The users list is client-side only.
9. **`PATCH /users/:id` with a `null` field returns 500.** The frontend must omit fields instead of sending null. This is a backend bug.
10. **Restaurant config:**
    - `closeTime` cannot be `00:00`, and overnight hours are unsupported.
    - URLs with `localhost` are rejected (a TLD is required).
    - An empty string for an optional field is rejected (send null).
    - `description` is capped at 2000 characters even though the DB column is TEXT.
11. **No realtime, stats, or audit.** The polling interval and dashboards need product decisions.
12. **Roles have no guaranteed order** in login, `/auth/me`, or `/users` responses. Sort them client-side.
13. **The `approvalResponsible` returned by GET isn't re-validated.** It may no longer be an OWNER or may be inactive, and the next PUT would then fail with 400.
