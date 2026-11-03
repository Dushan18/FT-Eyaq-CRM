# restaurant-config: API contract report

Module: global restaurant configuration (company data, schedules, policies, languages, approval responsible, response timeout).
Types: `restaurant-config.ts` (same folder). This analysis was read-only: nothing was run or modified in `bk-crm`.

Sources read: `src/restaurant-config/{controller,service,module}.ts` and their specs, `src/dto/put-restaurant-config.dto.ts` (+spec), `src/dto/restaurant-schedule.dto.ts` (+spec), `src/config/config.module.ts` (empty `@Module({})`, unused; the app uses `@nestjs/config`), `prisma/schema.prisma`, migration `20260902052912_add_restaurant_config/migration.sql`, `src/common/filters/global-exception.filter.ts`, auth guards/strategy, `src/reservations/reservation-support.service.ts` (consumer), `test/sprint2-closure.cases.ts`, `test/reservations.integration.e2e-spec.ts`, `README.md`, `docs/sprint-2-closure.md`. Library behavior was verified in `node_modules`: class-validator 0.15.1, validator 13.15.35, @nestjs/common 11.1.28, @nestjs/passport 11.0.5.

---

## (a) Endpoints

| Method | Path | Allowed roles | Success | Request | Response |
| --- | --- | --- | --- | --- | --- |
| GET | `/restaurant-config` | ADMIN, OWNER, OPERATOR | **200** | no body, no query params (a query string is ignored) | `RestaurantConfigResponse` |
| PUT | `/restaurant-config` | ADMIN | **200** (on first creation **and** on later updates; never 201) | `PutRestaurantConfigRequest` (full replacement) | `RestaurantConfigResponse` (same shape as GET) |

There is no POST, PATCH, DELETE or `/:id` route. Any other method returns Nest's 404 `Cannot <METHOD> /restaurant-config`.

**Required headers**
- Both routes need `Authorization: Bearer <accessToken>`.
- PUT also needs `Content-Type: application/json`. Without it the body is not parsed, so every field fails validation and the response is 400.
- CORS is not enabled in `main.ts`. Browser calls must go through a same-origin proxy (Next.js rewrites or route handlers), or the backend must enable CORS.

**Check order:** `AccessTokenGuard` (401), then `RolesGuard` (403), then `ValidationPipe` (400), then the service (400/404/409). Earlier checks win. For example, an OPERATOR who sends an invalid PUT body gets 403, not 400. Roles are reloaded from the DB on every request, and access is granted when **any** of the user's roles is allowed.

**Error statuses**

| Status | Endpoint | When | Body |
| --- | --- | --- | --- |
| 401 | both | Token missing, malformed, wrongly signed or expired | `{"message":"Unauthorized","statusCode":401}`. Note there is no `error` key. |
| 401 | both | Token is valid, but the user was deleted or is inactive, the session was revoked or expired, or the payload has no sub/sessionId | `{"message":"Usuario no autorizado" \| "Sesión no válida o expirada" \| "Token de acceso inválido","error":"Unauthorized","statusCode":401}` |
| 403 | GET | The user's only role is SUPPORT, or none of the user's roles is allowed | `{"message":"No tienes permisos para realizar esta acción","error":"Forbidden","statusCode":403}` |
| 403 | PUT | The user is not ADMIN (OWNER, OPERATOR, SUPPORT) | same body as above |
| **404** | GET | The GLOBAL config has never been created (fresh DB: the seed does **not** create it) | `{"message":"Configuración del restaurante no encontrada","error":"Not Found","statusCode":404}` |
| 400 | PUT | DTO validation fails, including any undeclared property | `{"message":[...string],"error":"Bad Request","statusCode":400}` (`message` is **always an array**) |
| 400 | PUT | The approval responsible does not exist, is inactive, or lacks the OWNER role. These are checked inside the transaction, before anything is written. | `{"message":"El responsable de aprobación no existe" \| "El responsable de aprobación debe estar activo" \| "El responsable de aprobación debe tener el rol OWNER","error":"Bad Request","statusCode":400}` (`message` is a **single string**) |
| 400 | PUT | Prisma P2003/P2004 (FK or CHECK violation; defensive) | `message: "La configuración contiene referencias o valores inválidos"` |
| 409 | PUT | Serializable conflict (P2034) that persists after 3 attempts | `{"message":"La configuración entró en conflicto con otro cambio; inténtalo nuevamente","error":"Conflict","statusCode":409}`. Safe to retry. |
| 409 | PUT | Unique race on the first creation (P2002) | `message: "Ya existe una configuración global en conflicto"`. Safe to retry. |
| 500 | both | Unexpected error (DB down, unmapped Prisma error, see the edge cases below) | `{"statusCode":500,"message":"Ocurrió un error interno","path":"/restaurant-config","method":"PUT","timestamp":"<ISO>"}` |

The service also contains three defensive 400 messages that the DTO normally catches first, so they are practically unreachable over HTTP: `latitude y longitude deben proporcionarse juntas`, `schedules debe contener exactamente una entrada para cada día de la semana` and `Los horarios son incoherentes o cruzan la medianoche`.

---

## (b) Pagination, sorting, filters

- **None.** The resource is a singleton (`scope = GLOBAL`, with a UNIQUE index). There are no query params, no envelope and no paging.
- The arrays inside the response are always returned complete and in a fixed order:
  - `languages`: ES, EN, PT, whatever order was sent.
  - `schedules`: MONDAY to SUNDAY, whatever order was sent.
- Express adds a weak `ETag`, so a conditional GET can produce a 304 that `fetch` handles transparently. **PUT ignores `If-Match`. There is no optimistic locking.**

---

## (c) Business rules and state

### Lifecycle
```
NOT_CONFIGURED --(PUT by ADMIN, 200)--> CONFIGURED --(PUT by ADMIN, 200)--> CONFIGURED (same id, updatedAt bumped)
```
- `NOT_CONFIGURED`: GET returns 404 for every role.
- There is no API path back to NOT_CONFIGURED (no DELETE).
- The `id` stays the same across PUTs.

### Full-replacement semantics (most important UI rule)
PUT never merges with the stored row:
- An optional field that is **omitted or `null` is saved as `null`**. This applies to `logoUrl`, `description`, `website`, `latitude`/`longitude` and `approvalResponsibleId` (the responsible is disconnected).
- `languages` and `schedules` are deleted and re-created from the body.
- Several Ajustes screens share this one resource: Empresa, Horarios, Políticas, and Samanta > Validación del dueño (responsible and timeout). **Every save must send the whole object.**

Recommended frontend pattern:
1. Load the GET result into one store.
2. Each section edits its own slice.
3. On save, send `toPutRestaurantConfigRequest(latestResponse)` with the section's edits applied.
4. Replace the store with the PUT response.

Never send the GET body as-is. `id`, `createdAt`, `updatedAt` and `approvalResponsible` (and `scope`) cause 400 `property X should not exist`.

### Field rules (PUT)
All strings are trimmed by the backend before validation. Lengths below are measured after trimming.

| Field | Required | Nullable | Absent means | Constraints |
| --- | --- | --- | --- | --- |
| businessName | yes | no | 400 | string, 1–150 |
| logoUrl | no | yes | set to null | absolute `http`/`https` URL with protocol; host must have a TLD or be an IP (**`localhost` is rejected**); no underscores in host, no whitespace, no `data:`; ≤2048. `""` → 400 (send null) |
| description | no | yes | set to null | 1–2000; `""` or whitespace → 400 (send null) |
| address | yes | no | 400 | 1–300 |
| latitude / longitude | no (as a pair) | yes | both set to null | JSON numbers in [-90,90] / [-180,180], ≤7 decimals per JS `toString`, finite; both or neither; strings → 400 |
| whatsappNumber | yes | no | 400 | `^\+[1-9]\d{7,14}$` (E.164, no spaces or dashes), ≤16 |
| email | yes | no | 400 | lowercased; validator.js `isEmail` (TLD required); effective max 254 (DTO says 320) |
| website | no | yes | set to null | same rules as logoUrl |
| currency | yes | no | 400 | `PEN` \| `USD` |
| timeZone | yes | no | 400 | 1–64; must be accepted by `Intl.DateTimeFormat` (IANA). Stored as sent, so send canonical names (Node 24 also accepts lowercase names and offsets such as `-05:00`) |
| reservationPolicy | yes | no | 400 | 1–5000 (cannot be emptied) |
| cancellationPolicy | yes | no | 400 | 1–5000 (cannot be emptied) |
| responseTimeoutMinutes | yes | no | 400 | integer 1–1440. Numeric strings are coerced (`"15"` → 15) and `true` becomes 1; send a number |
| approvalResponsibleId | no | yes | responsible disconnected | UUID (versions 1–8, nil or max). Must be an existing, **active** user with the **OWNER** role. `""` → 400 |
| languages | yes | no | 400 | array of 1–3 unique values from `ES`/`EN`/`PT` |
| schedules | yes | no | 400 | exactly 7 items, one per day (any order), no extra keys per item |

Schedule item rules (DTO custom constraint plus DB CHECK):
- **Open day** (`isOpen: true`): `openTime` and `closeTime` are both required, as `HH:mm` from `00:00` to `23:59`, with `openTime < closeTime` (string comparison).
- **Closed day** (`isOpen: false`): `openTime`/`closeTime` must be absent or `null`. `""` → 400.
- **Not supported:**
  - closing at midnight (`00:00` → 400 because open < close fails; `24:00` → 400 because the pattern fails)
  - overnight ranges (`18:00`–`02:00`)
  - more than one time range per day
- The latest closing time that can be stored is `23:59`.

### Validation error format
- NestJS flattens nested errors and prefixes them with `schedules.<index>.`, where the index is the position in the **sent** array. Examples:
  - `schedules.4.Un día abierto requiere openTime y closeTime en formato HH:mm, con apertura anterior al cierre; un día cerrado no admite horas`
  - `schedules.4.openTime debe tener el formato HH:mm`
  - `schedules.0.property label should not exist`
- Top-level messages are class-validator defaults in English, for example:
  - `businessName should not be empty`
  - `logoUrl must be a URL address`
  - `currency must be one of the following values: PEN, USD`
  - `each value in languages must be one of the following values: ES, EN, PT`
  - `All languages's elements must be unique`
  - `schedules must contain at least 7 elements`
  - `timeZone must be a valid IANA time-zone`
  - `approvalResponsibleId must be a UUID`
  - `latitude must be a number conforming to the specified constraints`
- One custom message is Spanish: `whatsappNumber debe usar formato internacional E.164`.
- To map messages to form fields, match the leading property name (`<prop> ...` or `schedules.<i>.<...>`). It is simpler to validate on the client first using the constants in the `.ts` file.

### Approval responsible
- It is validated only at PUT time (exists, `isActive`, has OWNER). Users with OWNER plus other roles are valid.
- Nothing stops the user from being deactivated or losing OWNER later (README lists this as pending). GET will still return them, and the next PUT that keeps the same id fails with 400. The UI must show that error and let the admin pick another OWNER or clear the field.
- If the user row is deleted, the FK `ON DELETE SET NULL` makes both `approvalResponsibleId` and `approvalResponsible` null.
- Response shape: `approvalResponsible: { id, firstName, lastName, email } | null`. It contains no phone, `isActive` or roles.
- To list candidates, use `GET /users`. It is ADMIN-only, has no filters or pagination, is ordered by `createdAt desc`, and each item includes `isActive` and `roles: RoleCode[]`. Filter on the client with `isActive && roles.includes('OWNER')`. Since only ADMIN can PUT, this is enough.

### Serialization (GET and PUT responses)
- `latitude`/`longitude` are **JSON numbers**. The value is `Decimal(10,7).toNumber()`, so trailing zeros are dropped: `-12.0463740` comes back as `-12.046374`. They are `null` when unset, and always both null or both numbers (DB CHECK).
- No other Decimal exists in this module.
- `createdAt`/`updatedAt` are ISO UTC strings with milliseconds. `updatedAt` changes on every successful PUT.
- Every key is always present. These are nullable: `logoUrl`, `description`, `website`, `latitude`, `longitude`, `approvalResponsibleId`, `approvalResponsible`, and `openTime`/`closeTime` on closed days.
- A config created through PUT always has at least 1 language and exactly 7 schedules. A row inserted directly into the DB (as the integration tests do) can have `languages: []` and missing schedules. Treat a missing day as closed (the helper does this).

Example 200 body (derived from `serialize()`; values taken from the README PUT example):
```json
{
  "id": "5ded68d7-41b0-4a3c-aef5-08de01b4b6a3",
  "businessName": "Sabor Mágico Grill Restaurante",
  "logoUrl": "https://example.com/logo.png",
  "description": "Restaurante de cocina peruana y parrillas.",
  "address": "Lima, Perú",
  "whatsappNumber": "+51999999999",
  "email": "contacto@sabormagico.com",
  "website": "https://sabormagico.com",
  "currency": "PEN",
  "timeZone": "America/Lima",
  "reservationPolicy": "Las reservas están sujetas a disponibilidad.",
  "cancellationPolicy": "Las cancelaciones deben solicitarse con anticipación.",
  "responseTimeoutMinutes": 15,
  "approvalResponsibleId": "ef3458ae-3b8b-4aed-8d34-fdb4cb5ea978",
  "createdAt": "2026-09-02T12:00:00.000Z",
  "updatedAt": "2026-09-02T12:00:00.000Z",
  "approvalResponsible": { "id": "ef3458ae-3b8b-4aed-8d34-fdb4cb5ea978", "firstName": "Olivia", "lastName": "Responsable", "email": "owner@eyaqsystems.com" },
  "latitude": -12.046374,
  "longitude": -77.042793,
  "languages": ["ES", "EN"],
  "schedules": [
    { "dayOfWeek": "MONDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "TUESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "WEDNESDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "THURSDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "FRIDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "SATURDAY", "isOpen": true, "openTime": "11:00", "closeTime": "23:00" },
    { "dayOfWeek": "SUNDAY", "isOpen": false, "openTime": null, "closeTime": null }
  ]
}
```

### Concurrency and idempotency
- PUT runs in a single `Serializable` transaction:
  1. validate the responsible
  2. upsert the row
  3. delete and re-insert schedules
  4. delete and re-insert languages
  5. re-read the row
- It is atomic: when it fails, nothing is partially saved.
- It retries up to 3 times on P2034, then returns 409.
- PUT is idempotent in effect: the same body gives the same state, apart from `updatedAt`.
- **Last write wins.** Two admins editing different sections overwrite each other.
- Mitigation is client-side only: re-GET before saving, and warn if `updatedAt` changed.

### Side effects on other modules
- **The config must exist before `POST /reservation-requests` and `POST /reservations` will work.** Without it they return 409 `Configura el restaurante antes de crear solicitudes o reservas`. The 404 empty state should therefore be shown prominently to ADMIN.
- `currency` is the default currency snapshot for new reservation requests that have `quotedPrice` but no `currency`, and for some PATCH cases. Existing records keep their snapshot when the config currency changes (covered by an e2e test).
- `timeZone` sets the **year** in generated codes: `RES-YYYY-NNNNNN` for requests and `R-YYYY-NNNNNN` for reservations. The backend returns UTC instants and the frontend must render them in `config.timeZone`. Note that these code formats differ from the mockup's `SOL-xxxx`/`RES-xxxx`; that belongs to the reservation modules.
- `schedules` are **informational only**. No backend module checks reservation times against opening hours.
- `responseTimeoutMinutes` is persisted only. No timer, reminder or escalation uses it yet.
- No audit event is emitted. `RESTAURANT_CONFIG_CREATED/UPDATED` is a TODO in the service.

### Edge cases worth guarding in the form
- A latitude or longitude with `0 < |v| < 1e-6` (JS prints it as `1e-7`) makes class-validator throw, which returns **500**. Use `normalizeCoordinate()`, which rounds to 7 decimals and turns such values into 0.
- Float noise such as `0.30000000000000004` exceeds 7 decimals and returns 400. Round before sending.
- Display-formatted phone numbers (`+57 300 123 4567`) return 400. Strip everything except `+` and digits.
- Dev logo URLs on `http://localhost:...` return 400 because a TLD is required. Use an IP host or a real domain.

---

## (d) Gap analysis vs mockup

| UI need | Support | Backend field / endpoint | Gap / proposal |
| --- | --- | --- | --- |
| Empresa: logo upload area | **partial** | `logoUrl` (http/https URL, ≤2048) in PUT | No upload endpoint exists (no multer/FileInterceptor in the codebase). For now: a URL input, or an external host. Proposal: an ADMIN-only `POST /restaurant-config/logo` (multipart, size and type limits) that stores to object storage and returns `{ logoUrl }`; or presigned uploads. |
| Empresa: Nombre comercial | full | `businessName` (1–150) | none |
| Empresa: Moneda "COP · Peso colombiano" | **partial** | `currency`: `PEN` \| `USD` only | `COP` is rejected with 400. Proposal: migration `ALTER TYPE "CurrencyCode" ADD VALUE 'COP'`; the DTO picks it up through the enum. Needs a market decision (examples, seeds and the default time zone are Peruvian). |
| Empresa: Descripción | full | `description` (nullable, 1–2000) | Send `null` when empty. |
| Empresa: Dirección | full | `address` (1–300) | none |
| Empresa: WhatsApp del negocio | full | `whatsappNumber` (E.164) | Strip formatting before sending. |
| Empresa: Correo | full | `email` | none |
| Empresa: Página web | full | `website` (nullable URL) | Send `null` when empty. |
| Empresa: Idiomas de atención | full | `languages` (1–3 of ES/EN/PT) | Other languages are not supported. |
| Fields PUT requires but the mockup does not show (`timeZone`, `latitude`/`longitude`) | **partial** | `timeZone` required, coordinates optional | They must be carried over from GET or they are cleared or rejected. Proposal: a time-zone select in Empresa (or hidden carry-over); coordinates as hidden carry-over or a map picker. |
| Horarios: 7 days, toggle, open/close | **partial** | `schedules[7]` with `isOpen`, `openTime`, `closeTime` | Works for same-day ranges. **"Viernes 12:00 a 00:00" is rejected with 400**; the workaround is `23:59`. Overnight ranges and split shifts are unsupported. Proposal: accept `24:00` as end of day, or allow `closeTime <= openTime` meaning the next day. Either needs DTO regex and coherence changes **and** an update to the DB CHECK `restaurant_schedules_time_coherence_check`. |
| Políticas: reserva / cancelación | full | `reservationPolicy`, `cancellationPolicy` (1–5000, required) | They cannot be saved empty, so validate as required. |
| Samanta > Responsable de aprobación (OWNER) | full (ADMIN) | `approvalResponsibleId` (PUT), `approvalResponsible` (GET); candidates from `GET /users` filtered by OWNER and active | OWNER/OPERATOR can see the current responsible but cannot list users. The responsible can become stale (see (c)). |
| Samanta > WhatsApp personal del responsable | **none** | nothing (User has no phone; RestaurantConfig has no field; no env var) | The README plans "teléfono personal en `User`". Your request mentions an env var for the owner's number. Proposal: `User.whatsappNumber` (E.164), or env `OWNER_WHATSAPP_NUMBER`. Needs a decision. |
| Samanta > Tiempo máximo de respuesta (min) | **partial** | `responseTimeoutMinutes` (1–1440) | Stored and validated, but no backend logic acts on it. |
| Samanta > "Si no responde" (e.g. "Recordar y avisar al operador") | **none** | none | Proposal: an enum field in RestaurantConfig (e.g. `approvalTimeoutAction`) plus the job that executes it. Values must come from the cronograma. |
| Samanta > Canales donde atiende (WhatsApp/Facebook/Instagram/Web) | **none** | none in this module. Only deployment env `WHATSAPP_ENABLED` (needs `MESSAGING_ENABLED` and `REDIS_URL`). There is a per-conversation pause (`isAssistantPaused`, `PATCH /conversations/:id/assistant`) but no per-channel setting. | Proposal: `assistantChannels: ContactChannel[]`, a subset of `WHATSAPP`, `FACEBOOK`, `INSTAGRAM`, `WEBSITE`, in RestaurantConfig and the PUT DTO. |
| Samanta > Reglas (only active services and registered prices; transfer >20 people; propose another date if rejected; 24 h reminder) | **none** | none | Proposal: boolean flags (plus `largeGroupThreshold`, default 20) in RestaurantConfig or a dedicated assistant-settings resource. Your request defines several of these as fixed core flow, so confirm whether the toggles are editable or display-only. |
| 404 empty or create state | full | GET 404 `Configuración del restaurante no encontrada` | ADMIN: show a "Configurar restaurante" form (pre-fill `currency: 'PEN'`, `timeZone: 'America/Lima'`, 7 closed days, `languages: ['ES']`) and save with PUT. OWNER/OPERATOR: read-only notice that the admin has not configured it yet. |
| Role-based Ajustes | full | GET: ADMIN, OWNER, OPERATOR; PUT: ADMIN | OWNER/OPERATOR see read-only forms. SUPPORT gets 403, so hide these sections. |
| Saving one section without clobbering others | **partial** | PUT full replacement, no locking | Use the single store plus `toPutRestaurantConfigRequest()` and re-GET before saving. Proposal: `PATCH` per section, or an `If-Match`/`version` check. |

---

## (e) Open questions

1. **Currency:** the mockup shows COP but the backend only has PEN/USD, and the examples, seeds and default time zone are Peruvian. Should COP be added, or should the mockup use PEN?
2. **Midnight close or overnight hours:** should "12:00–00:00" be stored as `23:59`, or should the backend accept `24:00` or overnight ranges? The latter needs a DTO change and a DB CHECK migration.
3. **Owner's personal WhatsApp:** should it be a per-user field (as the README plans), a RestaurantConfig field, or an environment variable (as your request says: "número del dueño")?
4. **"Si no responde" behavior:** which options does the cronograma define, and who executes them? There is no scheduler for `responseTimeoutMinutes` today.
5. **Samanta > Canales and Reglas:** are these persisted, editable settings or fixed behavior shown for information? If persisted, where: RestaurantConfig or a new resource?
6. **OWNER permissions:** the seed describes OWNER as "Responsable de validación y configuración", but only ADMIN can PUT. Should OWNER be able to edit Horarios/Políticas?
7. **Time zone field:** should the UI expose `timeZone` (required by PUT, absent from the mockup), or keep it fixed at `America/Lima`?
8. **Logo:** is an upload endpoint in scope for the current phase, or is a URL field acceptable until the integrations phase?

### Cross-check with docs and tests (discrepancies)
- README, unit/controller specs and the e2e closure test agree with the code: roles, 200 on PUT, 404 when missing, null-clearing, 7 days, the responsible rules, and numeric lat/lon (`expect(result.latitude).toBe(-12.046374)`).
- README "Pruebas rápidas" #7 claims coordinates, days and so on all return 400. True, but those come as DTO array messages, not the service's single-string messages.
- The DTO allows `email` up to 320 characters, but validator.js caps it at 254. The effective limit is 254.
- The global note says Decimal is usually a string. In this module lat/lon are explicitly **numbers**.
- `docs/reservations-postman.md` says to "present the date in `RestaurantConfig.timeZone`". That is consistent with this report.
