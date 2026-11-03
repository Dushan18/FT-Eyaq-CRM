# Reservations and reservation requests: HTTP contract and gap analysis

Backend: `bk-crm` (NestJS 11, Prisma 7, Express 5). I only read files and never opened `.env`. The types are in `reservations.ts`, which sits next to this file.

Sources: the controllers, services, `reservation-rules.ts`, `reservation.select.ts`, `reservation-support.service.ts`, the DTOs, `schema.prisma`, the migrations `20260916055653` and `20260922052135` (which add the SQL CHECK constraints), the docs `reservations-postman.md`, `reservation-calendar-postman.md`, `sprint-2-demo.md` and `sprint-2-closure.md`, the e2e suites, and the DTO and rules specs.

---

## 1. Global conventions

| Topic | Fact |
|---|---|
| Base URL | `http://localhost:3000`. There is no global prefix and no CORS, so the Next.js app must call through a server-side proxy or route handlers. |
| Auth | Every route needs `Authorization: Bearer <accessToken>`. The JWT has to point to an active session and an active user. |
| Role resolution | A method-level `@Roles` overrides the class-level one. If a user has several roles, holding any one of the allowed roles is enough. |
| Check order | 401 (token) → 403 (role) → 400 (DTO or `ParseUUIDPipe`) → service checks (400, 404 or 409, in each endpoint's own order). |
| Unknown keys | Any key that is not declared returns **400**, in the body and in the query. This includes `code`, `status` on create, `reservationRequestId`, `authorUserId`, `changedByUserId`, `sort` and `orderBy`. |
| Response keys | Every key is always present. A nullable value comes back as `null` and is never omitted. |
| Dates out | UTC ISO strings with milliseconds, for example `"2026-10-17T01:00:00.000Z"`. The client must convert them to `RestaurantConfig.timeZone` (`GET /restaurant-config`, readable by ADMIN, OWNER and OPERATOR; the default is `America/Lima`). |
| Dates in | `YYYY-MM-DDTHH:mm:ss[.SSS](Z\|±HH:MM)`. Seconds and an explicit zone are required. In a query string, a `+` must be encoded as `%2B`. Sending `Date#toISOString()` is the safest choice. |
| Money | `quotedPrice` goes in as a **string** matching `^(0\|[1-9]\d{0,7})(\.\d{1,2})?$` and comes back as a string with 2 decimals (`"150.00"`). Reservations have no money fields at all. |
| IDs | UUID strings. A malformed `:id` returns 400 with `"Validation failed (uuid is expected)"`. |
| Error body | `{statusCode, message, error?}`. DTO errors put an array of English class-validator messages in `message`; service errors use a single Spanish string (exact strings in `RESERVATION_ERROR_MESSAGES`). A token missing or invalid returns `{statusCode:401,message:"Unauthorized"}`. Anything else unexpected returns `500 {statusCode, message:"Ocurrió un error interno", path, method, timestamp}`. |
| Concurrency | Every write runs in a Serializable transaction with up to 3 attempts. If they are exhausted the response is 409 `"Conflicto concurrente; vuelve a intentarlo"`. There is no optimistic version or ETag. |
| Deletion | No DELETE endpoint exists in either module. |

### Codes

* A request code is `RES-{yyyy}-{seq}` and a reservation code is `R-{yyyy}-{seq}`.
* `seq` is a global Postgres sequence padded to at least 6 digits (it can be longer). It can have gaps and does not reset each year.
* `yyyy` is the **creation** year in the restaurant time zone, not the year of the reserved date.
* A code never changes, including after a reschedule.
* If the configured time zone is invalid, create returns 503.

---

## 2. Endpoints

### 2.1 `/reservation-requests` (Solicitudes)

| Method | Path | Roles | OK | Body / Query | Response |
|---|---|---|---|---|---|
| GET | `/reservation-requests` | ADMIN, OWNER, OPERATOR | 200 | `ReservationRequestListQuery` | `{data: ReservationRequest[], pagination}` |
| GET | `/reservation-requests/:id` | ADMIN, OWNER, OPERATOR | 200 | – | `ReservationRequest` |
| POST | `/reservation-requests` | ADMIN, OPERATOR | 201 | `CreateReservationRequestBody` | `ReservationRequest` |
| PATCH | `/reservation-requests/:id` | ADMIN, OPERATOR | 200 | `UpdateReservationRequestBody` | `ReservationRequest` |
| PATCH | `/reservation-requests/:id/status` | ADMIN, OPERATOR | 200 | `{status:"CANCELLED"}` | `ReservationRequest` |

The `ReservationRequest` response has these keys:

* `id`, `code`, `customerId`
* `commercialItemId|null`
* `sourceChannel`
* `reservationAt|null`, `numberOfPeople|null`
* `quotedPrice: "x.xx"|null`, `currency|null`
* `comments|null`, `specialRequirements|null`
* `status`, `createdAt`, `updatedAt`
* `customer {id, firstName|null, lastName|null, phone|null, email|null}`
* `commercialItem {id, nameEs|null, nameEn|null, type, isActive, approvalStatus}|null`

It does **not** include: the linked reservation, any owner or responder, per-status timestamps, or a conversation id.

**Create** (`POST`):
* Required: `customerId`, `sourceChannel`.
* Optional, and `null` is allowed: `commercialItemId`, `reservationAt` (must be in the future), `numberOfPeople` (integer ≥ 1), `quotedPrice`, `currency`, `comments`, `specialRequirements`.
* `status` is computed: it is `READY_TO_SEND` when both `reservationAt` and `numberOfPeople` are set, and `INCOMPLETE_DATA` otherwise.
* A price sent without a currency takes the restaurant currency. A currency sent without a price returns 400.
* The commercial item must exist (404 otherwise) and be active and APPROVED (400 otherwise).
* Customer not found: 404. No restaurant config: 409.
* Creating a request does not change the customer's status.

**Patch:**
* Omitting a key keeps its value. `null` clears it, except for `customerId` and `sourceChannel`, where `null` returns 400.
* `{}` returns 400.
* Only allowed while the status is `INCOMPLETE_DATA` or `READY_TO_SEND`; otherwise 409.
* After the merge, the status is recomputed. Clearing the date or the number of people sends it back to `INCOMPLETE_DATA`.
* `reservationAt` must be in the future whenever it is sent. If the key is omitted, a past date already stored is kept.
* Price and currency:
  * `quotedPrice:null` without a `currency` key also clears the currency.
  * `currency:null` while a price remains returns 400.
  * The currency stored with an existing quote is kept even if the restaurant currency changes later.
* The commercial item is only re-validated when it changes. An item that was deactivated later stays linked.

**Cancel:**
* Only `CANCELLED` is accepted. Any other value, including `ACCEPTED`, `REJECTED`, `READY_TO_SEND` or `RENEGOTIATING`, returns 400.
* Allowed from `INCOMPLETE_DATA` and `READY_TO_SEND`.
* If the request is already `CANCELLED`, the response is 200 with no change (same `updatedAt`).
* From any other status the response is 409.
* `CANCELLED` is terminal: any later PATCH returns 409.

### 2.2 `/reservations` (Reservas and calendar)

| Method | Path | Roles | OK | Body / Query | Response |
|---|---|---|---|---|---|
| GET | `/reservations` | ADMIN, OWNER, OPERATOR | 200 | `ReservationListQuery` | `{data: Reservation[], pagination}` |
| GET | `/reservations/:id` | ADMIN, OWNER, OPERATOR | 200 | – | `ReservationDetail` (adds `noteHistory[]` and `rescheduleHistory[]`) |
| POST | `/reservations` | **ADMIN only** | 201 | `CreateReservationBody` | `Reservation` (`CONFIRMED`) |
| PATCH | `/reservations/:id` | ADMIN, OPERATOR | 200 | `UpdateReservationBody` | `Reservation` |
| PATCH | `/reservations/:id/status` | ADMIN, OPERATOR | 200 | `{status}` | `Reservation` |
| PATCH | `/reservations/:id/assignee` | ADMIN, OPERATOR | 200 | `{assignedUserId: uuid\|null}` (the key is required) | `Reservation` |
| POST | `/reservations/:id/notes` | ADMIN, OPERATOR | 201 | `{content}` | `ReservationNote` (**not** a reservation) |
| PATCH | `/reservations/:id/reschedule` | ADMIN, OPERATOR | 200 | `{reservationAt, reason?}` | `Reservation` |

The `Reservation` response has these keys:

* `assignedUserId|null`
* `assignedUser {id, firstName, lastName, isActive, isEligible}|null`
* `id`, `code`
* `reservationRequestId|null`
* `customerId`, `commercialItemId|null`
* `reservationAt`, `numberOfPeople`, `status`
* `notes|null`
* `createdAt`, `updatedAt`
* `customer {…}`, `commercialItem {…}|null` (same embeds as the request)

It has **no** channel, zone or area, price, "prepared" flag or request embed. Every mutation returns this list shape **without** the histories, so the UI has to call `GET /:id` again to refresh them.

`ReservationNote` has these keys:

* `id`, `reservationId`
* `authorUserId` (taken from the JWT)
* `content`, `createdAt`
* `author {id, firstName, lastName}`

`ReservationRescheduleEntry` has these keys:

* `id`
* `previousReservationAt`, `newReservationAt`
* `reason|null`
* `changedByUserId`, `createdAt`
* `changedBy {id, firstName, lastName}`

Both histories are ordered by `createdAt ASC, id ASC` and are not paginated.

**Patch:**
* `{}` returns 400.
* Only allowed in `CONFIRMED`, `UPCOMING` or `RESCHEDULED`; otherwise 409.
* `customerId`, `reservationAt` and `numberOfPeople` cannot be `null` (400). `commercialItemId` and `notes` can be cleared with `null`.
* `reservationAt`:
  * It must be in the future, otherwise 400.
  * A **different** instant writes a history row (with `reason:null`) and sets the status to **RESCHEDULED**.
  * The same instant, even with a different offset, writes nothing.

**Reschedule:**
* Check order: 404 → 409 (status not editable) → 400 (date in the past).
* A different instant writes a history row with the reason and sets `RESCHEDULED`.
* The same instant returns 200 and changes nothing (`updatedAt` is not bumped and the reason is dropped).

**Assignee:**
* Check order: 404 reservation → 409 if the reservation is `COMPLETED`, `CANCELLED` or `NO_SHOW` → 403 for the OPERATOR rules below → 404 if the user does not exist → 400 if the user is inactive or lacks ADMIN or OPERATOR → 200 with no change if the value is the same.
* An OPERATOR who is not ADMIN can only assign themselves to a reservation with no assignee, or unassign themselves.
* An ADMIN can make any valid assignment.
* `isEligible` is recomputed on every read, for example it becomes `false` after the user is deactivated.

**Notes:**
* Allowed in any status, including terminal ones.
* Every call adds a new note (not idempotent). Notes cannot be edited or deleted.
* The content is trimmed and must be 1 to 5000 characters.

---

## 3. Filters and pagination

| Param | Requests | Reservations | Notes |
|---|---|---|---|
| `page` | 1..1 000 000, default 1 | same | 400 for `0`, `1.5`, `abc`, `""` or `1e30` |
| `limit` | 1..100, default 20 | same | `101` returns 400 |
| `customerId` | ✓ | ✓ | UUID |
| `dateFrom` / `dateTo` | ✓ on **`reservationAt`** | ✓ on `reservationAt` | Half-open `[from, to)`. Each bound is optional. `from >= to` returns 400. Strict ISO with a zone. Requests with a null date never match. |
| `status` | single `ReservationRequestStatus` | single `ReservationStatus` (including `RESCHEDULED`) | There is no multi-value form: a repeated key arrives as an array and returns 400. |
| `channel` | ✓ (filters `sourceChannel`) | ✗ (400) | |
| `commercialItemId` | ✓ | ✓ | |
| `assignedUserId` | ✗ | ✓ | There is no "unassigned" filter. |
| `excludeCancelled` | ✗ | `"true"`/`"false"` only | `true` together with `status=CANCELLED` returns 400. If `status` is given, `excludeCancelled` is ignored. |
| `search` | ✓ | ✓ | See below. |
| Sort | `createdAt DESC, id ASC` (fixed) | `reservationAt ASC, id ASC` (fixed) | There is no sort param (400). |

How `search` works:
* The value is trimmed and must be 1 to 200 characters.
* It matches `code` (case-insensitive), the customer's first name or last name (case-insensitive), the raw `phone`, and the `normalizedPhone` digits.
* A full name such as "Carlos Demo" matches nothing.
* A code search also matches any phone that contains the code's digits.

Neither module has a filter on `createdAt` or `updatedAt`, a count or aggregate endpoint, or a group-by.

---

## 4. State machines

### 4.1 ReservationRequest

```
POST ─► INCOMPLETE_DATA ◄──(PATCH clears date/people)──► READY_TO_SEND   (computed on every POST/PATCH)
             │                                                  │
             └──────── PATCH /:id/status {CANCELLED} ───────────┴──► CANCELLED (terminal; re-cancel = 200 no-op)

Not wired to any endpoint today: SENT_TO_OWNER, WAITING_RESPONSE, ACCEPTED, REJECTED,
MODIFICATION_REQUESTED, RENEGOTIATING. In those statuses: PATCH → 409, cancel → 409.
```

The database enforces these rules with CHECK constraints:
* `READY_TO_SEND` requires both a date and a number of people.
* `INCOMPLETE_DATA` requires at least one of them to be missing.
* A price and a currency must be present together, and the price must be ≥ 0.

The service code ends with a TODO: *"La aceptación futura debe actualizar la solicitud y crear su reserva en una sola transacción."* No owner approval flow exists. OWNER is read-only everywhere.

### 4.2 Reservation (`PATCH /:id/status`)

| From \ To | CONFIRMED | UPCOMING | IN_SERVICE* | COMPLETED | CANCELLED | NO_SHOW* |
|---|---|---|---|---|---|---|
| CONFIRMED | no-op | ✓ | ✓ | 409 | ✓ | ✓ |
| UPCOMING | **409** | no-op | ✓ | 409 | ✓ | ✓ |
| RESCHEDULED | ✓ | ✓ | ✓ | 409 | ✓ | ✓ |
| IN_SERVICE | 409 | 409 | no-op | ✓ | 409 | 409 |
| COMPLETED / CANCELLED / NO_SHOW | 409 | 409 | 409 | 409 / no-op | 409 / no-op | 409 / no-op |

\* `IN_SERVICE` and `NO_SHOW` return 409 while `reservationAt > now`. There is no tolerance window.

Other rules:
* The target `RESCHEDULED`, or any unknown value, returns **400** from the DTO.
* `RESCHEDULED` is only entered through a real change of date (PATCH or reschedule), and this can happen from `CONFIRMED`, `UPCOMING` or `RESCHEDULED`.
* Moving to the same status returns 200 with no change. The time check is skipped in that case.

### 4.3 400 vs 409 summary

* **400** covers four cases:
  * The DTO shape or format: an unknown key, a bad enum, a bad ISO date, a price regex mismatch, a text that is empty after trimming, a non-integer number of people, or an empty PATCH.
  * Business validation of the values: a date in the past, an inverted range, a price and currency that are not both present, a commercial item that is inactive or not approved, an assignee who is not eligible.
  * `excludeCancelled` combined with `status=CANCELLED`.
  * Status values that are not enabled, such as `RESCHEDULED` or the approval statuses on a request.
* **409** covers four cases:
  * The current state forbids the operation: request not editable, reservation not editable or reschedulable, a forbidden transition, `IN_SERVICE` or `NO_SHOW` too early, a reassignment on a finished reservation.
  * No restaurant config on create.
  * A unique-key violation (P2002).
  * Serializable retries exhausted.
* **404**: the resource or a related id is not found (customer, item, assignee).
* **403**: the role is not allowed, or an OPERATOR tried to assign someone else.

---

## 5. Date and time zone recipe (calendar)

1. Load `timeZone` once from `GET /restaurant-config`.
2. Compute each period boundary as local midnight in that zone, converted to a UTC instant: day `[D 00:00, D+1 00:00)`, week `[Mon 00:00, next Mon 00:00)`, month `[1st 00:00, next 1st 00:00)`.
3. Send `dateFrom` and `dateTo` as `instant.toISOString()`. Using `Z` avoids the `%2B` problem.
4. Render `reservationAt` with `Intl.DateTimeFormat('es-PE', {timeZone, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})` to get "Vie 16 oct · 20:00".
5. Bucket rows by day using the local date in the restaurant time zone, never the UTC date. A 20:00 dinner in Lima is the next day in UTC.

---

## 6. Gap analysis against the frontend needs

Legend: **FULL** means available today. **PARTIAL** means derivable with workarounds or caveats. **NONE** means it needs a backend change.

### 6.1 Solicitudes view

| Need | Coverage | How / Proposal |
|---|---|---|
| Table: code | FULL | `code` |
| Customer name + channel | FULL | `customer.firstName/lastName` (both nullable, so fall back to `phone`, then `email`) and `sourceChannel` |
| Date "Vie 16 oct · 20:00" | FULL | `reservationAt` (nullable while `INCOMPLETE_DATA`, so show "—"), formatted in the restaurant time zone |
| People | FULL | `numberOfPeople` (nullable) |
| Service | FULL | `commercialItem?.nameEs ?? commercialItem?.nameEn` (nullable) |
| Status pill | FULL (mapping) | `REQUEST_STATUS_TO_UI`, see 6.2 |
| Tabs Todas / Aceptadas / Rechazadas | FULL | No filter, `status=ACCEPTED`, `status=REJECTED` |
| Tab "Esperando" | PARTIAL | It needs `SENT_TO_OWNER` **and** `WAITING_RESPONSE`, but `status` takes a single value. Workaround: two queries merged client-side by `createdAt` desc, which breaks server-side pagination. **Proposal:** accept a comma-separated list or a repeated `status` (an `@IsEnum({each:true})` array). |
| KPI counts (waiting, accepted, rejected) | FULL (cheap) | One `GET ?status=X&limit=1` per status and read `pagination.total` (waiting is the sum of two calls). They cannot be restricted to a creation period, because date filters apply to `reservationAt`. **Proposal:** `GET /reservation-requests/stats?createdFrom&createdTo`. |
| KPI owner average response time | **NONE** | There is no `sentToOwnerAt`, `respondedAt` or responder field and no status history. **Proposal:** add `sentToOwnerAt`, `ownerRespondedAt`, `respondedByUserId`, `cancelledBy (CUSTOMER\|STAFF\|OWNER)` and `cancellationReason` to `ReservationRequest` (or a `reservation_request_status_history` table), plus a stats endpoint. |
| "Respuesta" column ("Esperando 2 min", "En 13 min", "Por el cliente") | **NONE** (rough approximation only) | Because PATCH is blocked (409) in `SENT_TO_OWNER` and `WAITING_RESPONSE`, `now − updatedAt` approximates the waiting time *if* future flows only touch the row on status changes. "En X min" and "Por el cliente" cannot be derived: there is no send time, no response time and no cancel actor. Same proposal as above. `RestaurantConfig.responseTimeoutMinutes` exists and can mark an overdue wait once the timestamps exist. |
| "Chat" button | PARTIAL (cross-module) | No conversation id on the request. Since `Conversation` is unique per `(customerId, channel)`, use `GET /conversations?customerId={customerId}&channel={sourceChannel}&limit=1` and take `data[0]?.id` (ADMIN, OWNER and OPERATOR can read it). |
| Inbox card: code, status, date, people, service | FULL | As above |
| Inbox card: notes | FULL | `comments` and `specialRequirements` |
| 3-step timeline (Samanta negotiates → Sent to owner → result) | PARTIAL | The step can be derived from the status (`REQUEST_STATUS_TO_TIMELINE_STEP`). Only step 1 has a timestamp (`createdAt`); steps 2 and 3 have none (`updatedAt` is only the last change). Same timestamp proposal. |
| Link from an accepted request to its reservation | NONE | There is no `reservation` embed and no `reservationRequestId` filter on `/reservations`. **Proposal:** embed `reservation {id, code, status}` in the request select. |

### 6.2 Status mapping and reachability

| ReservationRequestStatus | UI state | Reachable via HTTP today? |
|---|---|---|
| INCOMPLETE_DATA | negociando | Yes, computed on POST and PATCH |
| READY_TO_SEND | negociando (complete data, not yet sent) | Yes, computed on POST and PATCH |
| SENT_TO_OWNER | esperando al dueño | **No** |
| WAITING_RESPONSE | esperando al dueño | **No** |
| ACCEPTED | aceptada | **No**, only test fixtures |
| REJECTED | rechazada | **No**, only test fixtures (the demo doc explicitly says not to invent an API for it) |
| MODIFICATION_REQUESTED | negociando | **No** |
| RENEGOTIATING | negociando | **No** |
| CANCELLED | cancelada | Yes, `PATCH /:id/status`, only from INCOMPLETE_DATA or READY_TO_SEND |

**Practical consequence:** on real data today, the Esperando, Aceptadas and Rechazadas tabs and KPIs are always **0**. No messaging or WhatsApp code writes `ReservationRequest`; the only reference outside the module is a TODO in `customers.service`.

### 6.3 Calendar (accepted reservations only)

| Need | Coverage | How / Proposal |
|---|---|---|
| Only accepted reservations | FULL | `GET /reservations` never returns requests. Use `excludeCancelled=true`. To also hide `NO_SHOW` or `COMPLETED`, filter client-side: there is no `status IN` and no "not in" besides cancelled. |
| Day, week and month queries | FULL | `GET /reservations?dateFrom=<startUTC>&dateTo=<endUTC>&excludeCancelled=true&limit=100&page=N`. The order is fixed at `reservationAt ASC`. `search` and `assignedUserId` are optional. |
| Month counts | PARTIAL | No aggregate endpoint. Cheapest option: fetch page 1 with `limit=100`, read `totalPages`, fetch the remaining pages in parallel, then bucket by local day. That is ⌈n/100⌉ calls, so 1 call for 100 or fewer per month. If only counts are needed at high volume, use 28 to 31 parallel per-day calls with `limit=1` and read `total`. **Proposal:** `GET /reservations/calendar-summary?dateFrom&dateTo&tz` returning `[{date, count, people}]`. |
| Card: time, customer, people | FULL | `reservationAt`, `customer`, `numberOfPeople` |
| Card or detail: zone (Salón, Terraza, Barra, Salón privado) | **NONE** | No zone, area or table field anywhere (the docs say tables and availability are not implemented). **Proposal:** a nullable enum column `zone` (`MAIN_HALL`, `TERRACE`, `BAR`, `PRIVATE_ROOM`) on `Reservation`, and on `ReservationRequest` so the assistant can capture it, plus DTO, select and a `zone` filter. In the meantime show "—". Encoding it in `notes` is not recommended. |
| Detail: code, customer, date, time, people, service, notes | FULL | `GET /reservations/:id`. Notes means `notes` plus the authored `noteHistory`. |
| Detail: channel | **NONE** in the reservation payload | The reservation has no channel, and the customer embed does not include `sourceChannel`. Workarounds cost one extra call: `GET /reservation-requests/{reservationRequestId}` (but that id is always null today), or `GET /customers/{customerId}`, which gives the customer's *acquisition* channel, not the reservation's. **Proposal:** embed `reservationRequest {id, code, sourceChannel, status}` in `reservationSelect`, or add `sourceChannel` to `Reservation`. |
| Pill "Aceptada por el dueño" | PARTIAL | Today every reservation is created manually by ADMIN (`reservationRequestId` is always null). Either show it as a static label for non-cancelled reservations, or more honestly show "Aceptada por el dueño" only when `reservationRequestId != null` and "Registrada manualmente" otherwise. |
| Toggle "Marcar como preparada" | PARTIAL, one-way only | No prepared field or endpoint. The closest is `status=UPCOMING`, which is manual with no cron. You can switch it **on** with `PATCH /:id/status {status:"UPCOMING"}` from `CONFIRMED` or `RESCHEDULED`. You **cannot switch it off**, because `UPCOMING → CONFIRMED` returns 409. Side effects: from `RESCHEDULED` the "rescheduled" marker is lost, and any later change of date moves it back to `RESCHEDULED` (preparation lost). OWNER gets 403. **Least invasive fix:** add `'CONFIRMED'` to `allowed.UPCOMING` in `reservation-rules.ts`, a one-line change that makes the toggle reversible. This needs product agreement because UPCOMING is documented as "próxima", not "preparada". **Clean fix:** `preparedAt` and `preparedByUserId` plus `PATCH /reservations/:id/prepared {prepared:boolean}`. |
| Chat from a reservation | PARTIAL | `GET /conversations?customerId=…` (sorted by `lastMessageAt desc`). With no channel on the reservation, pick the most recent conversation. |

### 6.4 Statistics

| Metric | Coverage | Method |
|---|---|---|
| Total requests | FULL | `GET /reservation-requests?limit=1` and read `total` (all time). By creation period: page through results (sorted by `createdAt desc`) and stop once `createdAt < periodStart`. |
| Accepted requests, rejected requests | FULL technically, always 0 today | `status=ACCEPTED` or `status=REJECTED` with `limit=1`. |
| Acceptance rate | FULL (derived) | `accepted / (accepted + rejected)` or `accepted / total`, a product choice. |
| Owner average response time | **NONE** | Needs the timestamps proposed in 6.1. |
| Accepted reservations per day or week (by reserved date) | FULL (client-side) | Page through `/reservations?dateFrom&dateTo&excludeCancelled=true` and bucket by local day or week. |
| Reservations per day by *creation* date | PARTIAL | There is no `createdAt` filter, so page through everything and bucket by `createdAt`. |
| Per channel (requests) | FULL | `channel=X&limit=1` per channel (7 calls), which can be combined with `status`. |
| Per channel (reservations) | **NONE** | The reservation has no channel. N+1 calls through the customer give the acquisition channel only. Same embed proposal as 6.3. |
| Per service (requests and reservations) | FULL | Group client-side by `commercialItem.id`, or one `commercialItemId=X&limit=1` count per item (item list from `/commercial-items`). |
| People served per period | FULL (client-side) | Sum `numberOfPeople` over the paged reservations. |

---

## 7. Open questions for the backend and product

1. **Owner approval flow:** which endpoint or process moves a request to SENT_TO_OWNER, WAITING_RESPONSE, ACCEPTED or REJECTED, and who calls it (the owner from the CRM, WhatsApp buttons, the assistant)? Will acceptance create the `Reservation` atomically, as the TODO says? Until that exists, three of the four Solicitudes KPIs are always 0.
2. **Response-time data:** can we add `sentToOwnerAt` and `ownerRespondedAt`, plus `cancelledBy` and a reason, or a status history table? Without them, "Respuesta" and the average-time KPI cannot be built.
3. **Meaning of "preparada":** should it reuse `UPCOMING` (then allow `UPCOMING → CONFIRMED`), or get its own `preparedAt` field?
4. **Zone:** is it a fixed enum (Salón, Terraza, Barra, Salón privado) or a configurable list? Does it belong on the request, the reservation, or both?
5. **Channel on the reservation:** should the reservation embed its request (`sourceChannel`), and what should manual ADMIN reservations show?
6. **Multi-status filter** for the "Esperando" tab, and a `createdFrom`/`createdTo` filter for period KPIs.
7. **Aggregate endpoints** (request stats, calendar summary), to avoid paging at 100 rows per call.
8. **CORS:** none is configured. Should the Next.js app proxy through route handlers, or should the backend enable CORS for the frontend origin?
9. Does "accepted reservations only" in the calendar also exclude `NO_SHOW` and `COMPLETED`? (Server-side filtering only supports `excludeCancelled` or a single status.)
10. `quotedPrice` is not shown in the Solicitudes design. Confirm it is intentionally hidden.

## 8. Notable quirks

* `PATCH /reservations/:id` with a new `reservationAt` silently changes the status to `RESCHEDULED`, including from `UPCOMING`.
* All mutations return the list shape. Only `GET /:id` includes the histories.
* `POST /reservations/:id/notes` returns the note, not the reservation.
* The query uses `channel` while the body and response use `sourceChannel`.
* `excludeCancelled` only accepts the literal strings `true` and `false`.
* `search` with digits also matches normalized phone numbers. Full-name search does not work.
* OPERATOR can create requests but **not** reservations (403). OWNER is read-only and SUPPORT has no access.
* Request date-range filters apply to `reservationAt`, not `createdAt`.
* The request and reservation lists are not read in a snapshot, so `total` can drift between pages.
