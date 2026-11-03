# bk-crm contracts: commercial catalog and customers

This is a read-only analysis of `D:\Proyectos\Eyaq Systems\CRM-RS\bk-crm` (NestJS 11.1.28, Prisma 7.9.1, class-validator 0.15.1, class-transformer 0.5.1). The exact types are in `catalog-customers.ts`, next to this file. That file is standalone and type-checks with `tsc --strict`.

## 0. Global facts that matter for these modules

- **Base URL:** there is no global prefix. The default port is 3000. CORS is not enabled, so the frontend must call through a Next.js server-side proxy, route handler or rewrite. The Next.js dev server also defaults to port 3000, so one of the two ports has to change.
- **Auth:** send `Authorization: Bearer <accessToken>`. Guards run before pipes, so a 401 or 403 is returned before any 400 validation error.
- **Validation:** the global ValidationPipe uses `whitelist + forbidNonWhitelisted + transform` without implicit conversion.
  - Any undeclared body or query key returns 400.
  - Empty query params (`?search=`, `?limit=`, `?isActive=`) are rejected with 400, so omit them instead of sending them empty.
- **Errors:** HttpExceptions return `{statusCode, message, error?}`.
  - Validation errors return `message: string[]`. Nested errors use paths such as `variants.0.price must ...`.
  - Business errors return a single Spanish string.
  - Passport 401 returns `{statusCode:401, message:"Unauthorized"}` with no `error` key.
  - Other errors return a 500 body: `{statusCode:500, message:"Ocurrió un error interno", path, method, timestamp}`.
- **Dates:** ISO UTC strings with milliseconds and `Z`. Catalog and customer columns are `timestamp(3)` without a time zone, and Prisma reads them as UTC.
- **Money:** `Decimal(10,2)` is serialized with `toFixed(2)` as a string ("25.90", "7.00") or `null`. Request bodies must also send money as strings; a JSON number returns 400.
- **Success codes:** POST returns 201, except `POST /customers/:id/interests`, which returns **200**. GET and PATCH return 200. `DELETE` on an interest returns **204** with no body. No entity in these modules can be physically deleted.
- **SUPPORT role:** receives 403 on every endpoint below.

---

## 1. Endpoint tables

### 1.1 Commercial categories

| Method | Path | Roles | OK | Body / Query | Main errors |
|---|---|---|---|---|---|
| POST | `/commercial-categories` | ADMIN | 201 `CommercialCategory` | `CreateCommercialCategoryRequest` | 400 validation or no name; 409 "Ya existe una categoría comercial con ese nombre" |
| GET | `/commercial-categories` | ADMIN, OWNER, OPERATOR | 200 `CommercialCategory[]` (plain array) | none (query ignored) | 401/403 |
| GET | `/commercial-categories/:id` | ADMIN, OWNER, OPERATOR | 200 `CommercialCategory` | none | 400 uuid; 404 "Categoría comercial no encontrada" |
| PATCH | `/commercial-categories/:id` | ADMIN | 200 `CommercialCategory` | `UpdateCommercialCategoryRequest` | 400; 404; 409. Empty `{}` returns **200 no-op** (see §7) |
| PATCH | `/commercial-categories/:id/status` | ADMIN | 200 `CommercialCategory` | `{isActive: boolean}` | 400; 404 |

The category list includes **inactive** categories. It is ordered by `displayOrder asc`, then `nameEs asc nulls last`, then `nameEn asc nulls last`. There is no pagination and no filtering.

Name uniqueness is normalized: accents, case and whitespace are ignored. It is also enforced across languages, so a new `nameEs` cannot equal any existing `nameEn`.

### 1.2 Commercial items ("servicios")

| Method | Path | Roles | OK | Body / Query | Main errors |
|---|---|---|---|---|---|
| POST | `/commercial-items` | ADMIN | 201 `CommercialItem` (DRAFT, active) | `CreateCommercialItemRequest` | 400 (validation, category missing or inactive, price rule, detail and type mismatch, duplicate variants or images, >1 primary image, bad schedules or dates); 409 duplicate or concurrent |
| GET | `/commercial-items` | ADMIN, OWNER, OPERATOR | 200 `Paginated<CommercialItem>` | `CommercialItemListQuery` | 400 query |
| GET | `/commercial-items/:id` | ADMIN, OWNER, OPERATOR | 200 `CommercialItem` | none | 400 uuid; 404 "Elemento comercial no encontrado" |
| PATCH | `/commercial-items/:id` | ADMIN | 200 `CommercialItem` | `UpdateCommercialItemRequest` | Same as POST, plus 404. **Demotes APPROVED to DRAFT** |
| PATCH | `/commercial-items/:id/status` | ADMIN | 200 `CommercialItem` | `{isActive: boolean}` | 400; 404 |
| PATCH | `/commercial-items/:id/approval` | ADMIN | 200 `CommercialItem` | `{approvalStatus: 'DRAFT'\|'APPROVED'\|'REJECTED'}` | 400 when approving without `nameEs`, with an inactive category, or breaking the price rule; 404 |

**List query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | int 1..1,000,000 | 1 | `1e30` or `1.5` returns 400 |
| `limit` | int 1..100 | 20 | 100 is enough to load the whole seed (86 items) |
| `type` | `CommercialItemType` | none | exact enum |
| `categoryId` | uuid | none | |
| `approvalStatus` | `DRAFT\|APPROVED\|REJECTED` | none | |
| `isActive` | `"true"\|"false"` | none | any other string returns 400 |
| `search` | string 1..200 (trimmed) | none | case-insensitive `contains` on nameEs, nameEn, descriptionEs and descriptionEn. It does **not** search the category name and is not accent-insensitive |
| `sort` | `createdAt\|name\|category` | `createdAt` | `category` sorts by category.displayOrder, then item displayOrder, then nameEs, then nameEn |
| `order` | `asc\|desc` | `desc` | For menu order use `sort=category&order=asc` |

**Envelope:** `{ data: CommercialItem[], pagination: { page, limit, total, totalPages } }`.

**Item shape:** each row carries the full item, including every variant (active and inactive), images, FAQs, schedules, `promotionDetail` and `eventDetail`.

### 1.3 Customers

| Method | Path | Roles | OK | Body / Query | Main errors |
|---|---|---|---|---|---|
| POST | `/customers` | ADMIN, OPERATOR | 201 `Customer` (status NEW) | `CreateCustomerRequest` | 400 contact rules or validation; 409 "Ya existe un cliente con ese teléfono o correo" |
| GET | `/customers` | ADMIN, OWNER, OPERATOR | 200 `Paginated<Customer>` | `CustomerListQuery` | 400 query |
| GET | `/customers/:id` | ADMIN, OWNER, OPERATOR | 200 `CustomerDetail` (adds `interests[]`) | none | 400 uuid; 404 "Cliente no encontrado" |
| PATCH | `/customers/:id` | ADMIN, OPERATOR | 200 `Customer` | `UpdateCustomerRequest` | 400 (including empty `{}` and removing the last contact); 404; 409 |
| PATCH | `/customers/:id/status` | ADMIN, OPERATOR | 200 `Customer` | `{status: CustomerStatus}` | 400; 404 "Cliente o interés no encontrado" |
| POST | `/customers/:id/interests` | ADMIN, OPERATOR | **200** `CustomerInterest` | `{commercialItemId, notes?}` | 400; 404 "Cliente no encontrado" or "Elemento comercial no encontrado" |
| DELETE | `/customers/:id/interests/:commercialItemId` | ADMIN, OPERATOR | **204** | none (second param is the **item** id) | 400; 404 "Interés no encontrado" |

**List query parameters:**

| Param | Notes |
|---|---|
| `page` | int 1..1,000,000; default 1 |
| `limit` | int 1..100; default 20 |
| `search` | string 1..200 (trimmed). OR of: firstName or lastName (insensitive contains), raw `phone` contains, email (insensitive), normalizedEmail, and the digits of the search against the normalized E.164 phone. "912345678", "+51 912 345 678" and the email all match. **"Nombre Apellido" (full name) does not match.** |
| `status` | single `CustomerStatus` |
| `channel` | `ContactChannel`; filters `sourceChannel`. **The query key is `channel`**; `sourceChannel` returns 400 |
| `commercialItemId` | uuid; customers with an interest in that item |

**Order:** fixed at `lastContactAt desc, id asc`. There are **no** sort params, and sending `sort` returns 400.

---

## 2. Response shapes (summary; exact types are in the .ts file)

**`CommercialItem`** has these fields:
- `id`, `type`, `categoryId`, `nameEs|null`, `nameEn|null`, `descriptionEs|null`, `descriptionEn|null`
- `basePrice: "x.xx"|null`, `displayOrder`, `isActive`, `approvalStatus`
- `conditions|null`, `internalNotes|null`, `availabilityNote|null`, `createdAt`, `updatedAt`
- `category {id, nameEs, nameEn, isActive, displayOrder}`
- `variants[] {id, nameEs, nameEn, descriptionEs, descriptionEn, price:"x.xx", isActive, displayOrder, createdAt, updatedAt}`
- `images[] {id, url, altTextEs, altTextEn, isPrimary, displayOrder, createdAt}`
- `faqs[] {id, questionEs, questionEn, answerEs, answerEn, displayOrder, createdAt, updatedAt}`
- `schedules[] {id, dayOfWeek, isAvailable, startTime, endTime}`
- `promotionDetail {id, validFrom, validUntil, promotionalPrice:"x.xx"|null, createdAt, updatedAt} | null`
- `eventDetail {id, startAt, endAt, capacity, createdAt, updatedAt} | null`

`sourceKey` and `normalizedName` are never exposed.

**`CommercialCategory`** has: `id, nameEs|null, nameEn|null, descriptionEs|null, descriptionEn|null, isActive, displayOrder, createdAt, updatedAt`.

**`Customer`** has: `id, firstName|null, lastName|null, phone|null, phoneCountry|null, email|null, sourceChannel, status, firstContactAt, lastContactAt, notes|null, createdAt, updatedAt`. `normalizedPhone` and `normalizedEmail` are hidden.

**`CustomerDetail`** is `Customer` plus `interests[]`. Each interest is `{id, firstInterestedAt, lastInterestedAt, notes, commercialItem}`, ordered by `lastInterestedAt desc`. `commercialItem` is `{id, nameEs, nameEn, type, isActive, approvalStatus}`. The detail does not include conversations, reservations or counts.

**How other modules embed the commercial item:** `ReservationRequest.commercialItem` and `Reservation.commercialItem` use the same compact embed as `CustomerInterest.commercialItem`, or `null`: `{id, nameEs, nameEn, type, isActive, approvalStatus}`. It has **no price, category or description**. Reservation requests carry their own `quotedPrice` ("x.xx" or null) and `currency` (`PEN|USD|null`).

**How other modules embed the customer:** reservation requests, reservations and conversations use `{id, firstName, lastName, phone, email}`. That embed has no status, sourceChannel or dates.

---

## 3. Business rules

### 3.1 Catalog

- **Price rule (DISH and BEVERAGE only):** an item needs a `basePrice` **xor** at least one variant with `isActive=true`. Having neither or both returns 400 "Un plato o bebida debe tener un precio base o variantes activas, pero no ambos".
  - The rule is checked on create, on update (against the resulting state) and when approving.
  - SERVICE, PROMOTION and EVENT items are free; they may have no price at all.
- **Creation:**
  - Items are always created with `isActive=true` and `approvalStatus=DRAFT`.
  - `isActive` and `approvalStatus` cannot be sent on POST or PATCH; they have their own endpoints.
  - `type` is immutable.
- **Category check:** `categoryId` must exist **and be active**. A missing category returns 400, not 404.
- **Names:** at least one of `nameEs` or `nameEn` is required. Approval additionally requires `nameEs` (also enforced by a DB CHECK).
- **PATCH semantics:**
  - An omitted field is kept; `null` clears a nullable field.
  - An empty string returns 400 (`IsNotEmpty` runs after trimming).
  - `displayOrder` and `categoryId` cannot be null (400). The arrays `variants`, `images`, `faqs` and `schedules` cannot be null either (400); send `[]` instead.
  - An array that is present **fully replaces** the existing one, so child ids are regenerated. Do not rely on stable variant ids.
  - `promotionDetail` or `eventDetail` as an object upserts all three fields (any omitted field becomes null). As `null`, it deletes the detail.
  - These details are only allowed for PROMOTION and EVENT items respectively (otherwise 400).
- **Approval lifecycle:**
  - Any successful content PATCH turns APPROVED into DRAFT. REJECTED stays REJECTED.
  - `PATCH /status` never changes approval.
  - `PATCH /approval` allows any transition. Moving to APPROVED checks `nameEs`, that the category is active, and the price rule. It does **not** require `isActive`.
- **Variants:**
  - Names are unique within the item after normalization.
  - Max 50 variants. `isActive` defaults to true and `displayOrder` defaults to the array index.
  - `price` is required and must be a MoneyInput string.
- **Images:**
  - Only http(s) URLs with a TLD are accepted (`localhost` is rejected), up to 2048 characters.
  - Max 20 images, no duplicate URLs, and at most one `isPrimary`.
  - There is no upload endpoint.
- **Schedules:**
  - At most 7, one per `dayOfWeek`.
  - `isAvailable=true` requires different `HH:mm` start and end times (crossing midnight is allowed).
  - `isAvailable=false` requires no times.
- **What Samanta (the assistant) may offer:** the internal method `CommercialItemsService.findAvailableForAssistant` returns items matching `item.isActive && approvalStatus === 'APPROVED' && category.isActive`, limited to 100 items. It returns only active variants and omits `internalNotes`.
  - **There is no HTTP endpoint and no Samanta integration in the backend.** The docs say so explicitly: "No se añadió Samanta ni un endpoint para asistentes".
  - The query has no `category.isActive` filter. To mirror the rule over HTTP, call `GET /commercial-items?isActive=true&approvalStatus=APPROVED` and drop rows where `category.isActive=false` on the client. Pagination totals will then be off.
- **Reservation requests and reservations:** linking an item requires the item to be active and APPROVED, but the category's state is **not** checked. This is looser than the Samanta rule.
- **Deactivating a category** keeps its items and their status. New or moved items cannot use it, and approving items in it is blocked.

### 3.2 Customers

- **Contact identity** (`src/common/contact-normalization.ts`):
  - Email is trimmed, lower-cased and validated.
  - A phone may contain only `+`, digits, spaces, `( ) . -`, with 6 to 15 digits and up to 80 characters.
  - If the phone starts with `+`, or `phoneCountry` (ISO alpha-2, upper-cased) is given, it is validated with libphonenumber-js and normalized to E.164, which becomes the identity.
  - Otherwise the phone is stored as typed but is **not** an identity, and is only accepted when a valid email is also present.
  - Peru is never assumed: "987654321" alone returns 400.
- **Deduplication:** a matching normalized phone or email returns 409, whatever the formatting.
  - This applies to create and PATCH.
  - The public API cannot merge customers.
  - The internal ingestion path (`findOrCreateByContact`) reuses a match, or returns 409 if the contacts point to different customers.
- **PATCH /customers/:id:**
  - The resulting contact must still be usable.
  - `phoneCountry` is not inherited when the phone changes. Clearing the phone also clears its country.
  - The edit does not touch `firstContactAt` or `lastContactAt`.
  - An empty `{}` returns 400.
- **Status:** the 8 values can be changed freely through `PATCH /status`. **No automatic transitions exist yet**: inbound messages, requests and reservations do not change the status (TODO in the code).
- **lastContactAt** is set on creation and advanced (never moved back) by:
  - `POST /interests`;
  - **inbound message ingestion**, since `MessagesService` calls `findOrCreateByContact` and creates WhatsApp customers with `phone: "+<digits>"`, `sourceChannel: WHATSAPP` and **no names**.

  It is not advanced by outbound messages, PATCH or status changes.
- **Interests:**
  - Each customer–item pair is unique, and adding the same pair again is an upsert returning 200 with the same `id` and `firstInterestedAt`.
  - Omitting `notes` keeps the previous note; `null` clears it.
  - Interests are allowed on inactive, DRAFT or REJECTED items.
  - Deleting an interest removes only the link.
- **Display name:** the backend has no display name. Proposed fallback (`customerDisplayName` in the .ts file): `[firstName, lastName].join(' ')`, then `phone`, then `email`, then "Cliente sin nombre".

---

## 4. Related endpoints needed by these screens (other modules; row shapes are in the .ts file)

| Need | Endpoint | Roles | Notes |
|---|---|---|---|
| Customer → conversation | `GET /conversations?customerId=<id>` | ADMIN, OWNER, OPERATOR | One conversation per (customer, channel). Ordered by `lastMessageAt desc nulls last`; default limit 50 |
| Request history | `GET /reservation-requests?customerId=<id>&limit=..` | ADMIN, OWNER, OPERATOR | Ordered by `createdAt desc`. `code` looks like "RES-2026-000012" |
| Reservation history | `GET /reservations?customerId=<id>&limit=..` | ADMIN, OWNER, OPERATOR | Ordered by **`reservationAt asc`**, so sort client-side for a "latest first" view. `code` looks like "R-2026-000001" |
| Currency for prices | `GET /restaurant-config` (`.currency`: PEN or USD) | ADMIN, OWNER, OPERATOR | Items have no currency. The config is not seeded and must be set with PUT |

---

## 5. Gap analysis against the frontend needs

### 5.1 Ajustes > Servicios y precios

| Need | Coverage | How or proposal |
|---|---|---|
| Name | Full | `nameEs ?? nameEn`. 9 seed items have only an English name: TEQUEÑOS, the 6 fruit juices, HOT CHOCOLATE and WHITE OR RED. Many others have only a Spanish name |
| Short description | Partial | Only `descriptionEs` and `descriptionEn` (up to 5000 characters; many are null in the seed). Truncate client-side |
| Category name | Full | Embedded `item.category.nameEs ?? nameEn`. 4 seed categories have only an English name |
| Price | Partial | `basePrice` (string), or variants for 17 seed items, which have `basePrice=null` (show "desde S/ 14.00" or list the variants). PROMOTION items can use `promotionDetail.promotionalPrice`. Currency comes from `/restaurant-config` |
| Active toggle per row | Full (ADMIN only) | `PATCH /commercial-items/:id/status {isActive}`, which returns the full item. OWNER and OPERATOR should see it read-only |
| "Nuevo servicio" button | Full (ADMIN only) | `POST /commercial-items`. Needs `GET /commercial-categories` for the selector; only active categories are valid. The new item is created as DRAFT |
| Caption "Samanta solo ofrece servicios activos" | Partial and inaccurate | The real rule is active **and APPROVED and an active category**. **All 86 seed items are DRAFT**, so by that rule Samanta would offer nothing. Proposals: change the caption to "...activos y aprobados", add an approval badge plus an "Aprobar" action (`PATCH /approval`), or have the backend expose an `assistantAvailable` flag or filter |
| Filters (type, category, approval, active, search) and pagination | Full | See §1.2. Use `limit=100&sort=category&order=asc` for menu order |
| Types | Note | The UI says "servicios", but the seed contains only DISH (48) and BEVERAGE (38); there are 0 SERVICE items. Show every type, or filter with `type` |

### 5.2 Clientes

| Need | Coverage | How or proposal |
|---|---|---|
| Search | Full (with caveats) | `search` matches names, phone and email. Full-name search does not work. Proposal: also match `firstName || ' ' || lastName` |
| Status chips (8) | Filter: full. Counts: none | The `status` filter takes one value. There is no count or facet endpoint (the alternative is 8 calls with `limit=1` reading `pagination.total`). Proposal: `GET /customers/stats` |
| Name and phone | Partial | Names are nullable (always null for WhatsApp-created customers). Use the display-name fallback |
| Channel badge | Full | `sourceChannel` is the origin channel. Conversation channels can differ |
| Status pill | Full | `status` |
| Last contact (relative) | Full | `lastContactAt`, with the semantics from §3.2 (outbound replies do not update it) |
| Reservations count | None | Not in the list. Workaround: one `GET /reservations?customerId=X&limit=1` per row, reading `pagination.total`. Proposal: add `_count { reservations, reservationRequests }` to the list select |
| "Consultó" (interest) | None in the list | Only in the detail (`interests[]`). Reservation requests also carry `commercialItem`. Proposal: add `latestInterest` (take 1, ordered by `lastInterestedAt desc`) to list rows |
| Row click opens the conversation | None in the list | One `GET /conversations?customerId=X` per click, then take `data[0]`. Proposal: add `conversations {id, channel, lastMessageAt}[]` to list rows |
| Sort | Fixed | Always `lastContactAt desc`; no other sort is possible |
| Pagination | Full | `page` and `limit` (max 100) |

### 5.3 Inbox right panel

| Need | Coverage | How or proposal |
|---|---|---|
| Status, phone, email, origin channel, first contact | Full, with an extra call | The conversation's customer embed only has id, names, phone and email, so also call `GET /customers/:customerId` |
| Change status from the panel | Full (ADMIN, OPERATOR) | `PATCH /customers/:id/status` |
| History of previous requests and reservations | Partial | Two calls: `GET /reservation-requests?customerId=` and `GET /reservations?customerId=` (the latter in ascending order), merged client-side. Each row embeds the compact `commercialItem`. Proposal: `GET /customers/:id/history`, or embed both lists in the detail |
| Interests | Full | Included in `GET /customers/:id` |

### 5.4 Suggested backend changes (for the team to decide)

1. `GET /customers` rows: add `_count {reservations, reservationRequests}`, `latestInterest`, and the conversation ids and channels.
2. Add `GET /customers/stats` (counts by status, optionally by channel).
3. Make customer search match the full name.
4. Add a `GET /commercial-items` filter (`categoryIsActive` or `assistantAvailable=true`), or a computed `isOfferable` flag.
5. Fix the empty-PATCH check in both catalog services: use `Object.values(dto).some(v => v !== undefined)`, as the customers service already does.
6. Decide who may approve items. OWNER's seed description is "Responsable de validación y configuración", but the approval endpoint is ADMIN-only.
7. Automate customer status changes (IN_CONVERSATION, REQUESTED_RESERVATION, CONFIRMED). This is already a TODO.

---

## 6. Seed catalog ("Sabor Mágico Grill"; `prisma/data/commercial-catalog.data.ts`)

The seed contains **16 categories, all active, and 86 items, all `isActive=true` and `approvalStatus=DRAFT`**.
- There are 48 DISH and 38 BEVERAGE items, and no SERVICE, PROMOTION or EVENT items.
- 69 items have a base price and 17 are priced through 27 variants.
- The seed adds no images, FAQs, schedules, conditions or internal notes, and no customers.
- The source's typos are kept on purpose: DESERTS, CREAM PUMKIN, TROUT IN MUSHOOM SAUCE, SPAGGETTI, BEEF LASAGÑA.
- **9 seed items have `nameEs = null`, so they cannot be APPROVED** (approval returns 400) until someone gives them a Spanish name with PATCH. The PATCH keeps them in DRAFT.
- Prices are presumably in PEN (S/), but the currency comes from the restaurant configuration.

| # | Category (es / en) | Type | Items: name ES / EN and price |
|---|---|---|---|
| 1 | ENTRADAS / STARTERS | DISH | ENSALADA DE LA ABUELA / MIX SALAD 25.90; CAUSITA DE PALTA / CAUSITA ANDEAN WITH AVOCADO 28.90; PALTA RELLENA / STUFFED AVOCADO 25.90; CHOCLO CON QUESO ANDINO / CORN ON THE COB WITH ANDEAN CHEESE 10.00; — / TEQUEÑOS WITH GUACAMOLE 24.90 |
| 2 | SOPAS / SOUPS | DISH | CALDO DE GALLINA TRADICIONAL / TRADITIONAL CHICKEN NOODLE SOUP 28.90; CHUPE DE LANGOSTINOS / TASTY SHRIMP SOUP 30.90; CHUPE DE QUINUA / QUINUA SOUP 26.90; DIETA DE POLLO / CHICKEN SOUP 25.90; ZAPALLO / CREAM PUMKIN 23.90; CHAMPIÑÓN / CREAM MUSHROOM 23.90 |
| 3 | — / MAIN COURSE TYPICAL DISHES | DISH | CUY AL HORNO O CHACTADO / BAKED OR FRIED GUINEA PIG 79.90; AJÍ DE GALLINA TRADICIONAL 39.90; CHICHARON DE CERDO / TRADITIONAL PORK CRACKLING 44.90; MAR Y TIERRA 56.90; EL COMELON MAGICO 74.90; CHICHARRON DE LANGOSTINOS 50.90 |
| 4 | ALPACA / — | DISH | ALPACA A LA PARRILLA / GRILLED ALPACA; ALPACA EN SALSA DE CHAMPIÑONES; BROCHETA DE ALPACA; SALTADO DE ALPACA (all 49.90) |
| 5 | RES / BEEF | DISH | RES A LA PARRILLA 49.90; FETUCCINI A LA HUANCAINA CON LOMO SALTADO 50.90; LOMO SALTADO DE RES 49.90; LOMO A LO POBRE 57.90 |
| 6 | POLLO / CHICKEN | DISH | POLLO A LA PARRILLA 39.90; POLLO EN SALSA DE CHAMPIÑONES 42.90; CHICHARON DE POLLO 39.90; BROCHETA DE POLLO 39.90 |
| 7 | TRUCHA / TROUT | DISH | TRUCHA A LA PARRILLA 39.90; TRUCHA EN SALSA DE CHAMPIÑONES 42.90; TRUCHA EN SALSA DE MANTEQUILLA 41.90; CEVICHE DE TRUCHA 34.90 |
| 8 | PASTAS / — | DISH | FETUCCINI AL ALFREDO 33.90; FETUCHINI A LA HUANCAINA CON BROCHETA DE ALPACA 49.90; SPAGGETTI BOLOGNESA 35.90; LASAÑA DE CARNE / BEEF LASAGÑA 37.90 |
| 9 | — / VEGETARIAN FOOD | DISH | SOPA DE QUINOA 25.00; BROCHETA DE VERDURAS 35.90; CHAUFA DE QUINUA CON HONGOS 38.90; SALTEADO DE VERDURAS 36.90; FIDEOS DE ARROZ 37.90; ESPAGUETI SALTEADAS CON VERDURAS 37.90; CEVICHE DE HONGOS CON PALTA 37.90 |
| 10 | POSTRES / DESERTS | DISH | TORTA DE CHOCOLATE 18.00; CHEESECAKE 18.00; CREPE DE PLÁTANO CON CHOCOLATE 18.00; MAZAMORRA DE QUINOA 17.00 |
| 11 | JUGOS NATURALES / FRESH JUICES | BEVERAGE | — / ORANGE JUICE, MANGO JUICE, BANANA, PINEAPPLE, PAPAYA, STRAWBERRIES (`basePrice` null; variants "Without Milk" 14.00 and "With Milk" 17.00); JUGO MIXTO (4 OPCIONES) / COMBO JUICE (4 FRUITS) 17.00 |
| 12 | — / HOT DRINK | BEVERAGE | CAFÉ EXPRESO 10.00; CAFÉ AMERICANO 9.00; CAPUCHINO 11.00; LATTE 10.00; — / HOT CHOCOLATE 12.00; TE=MANZANILLA, MUÑA O COCA 7.00 |
| 13 | BEBIDAS FRIAS / COLD DRINKS | BEVERAGE | CHICHA MORADA, MARACUYÁ, LIMONADA, CHICHA JORA (WITH ALCOHOL) (variants JUG 22.00 and GLASS 12.00); GASEOSAS (COCA COLA, INKA KOLA, FANTA, SPRITE) 7.00; AGUA MINERAL C/S GAS 6.00 |
| 14 | — / BEER | BEVERAGE | CERVEZA CUSQUEÑA 330 ml 13.00; CERVEZA 620 ml 18.00; CERVEZA ARTESANAL 20.00; CERVEZA CORONA 18.00; CERVEZA HEINEKEN 18.00 |
| 15 | COCTELES / COCKTAILS | BEVERAGE | PISCO SOUR 20.00; MUÑA SOUR, COCA SOUR, MARACUYÁ SOUR, MOJITO DE MARACUYÁ, MACHU PICCHU, PIÑA COLADA 25.00 each |
| 16 | VINOS / WINES | BEVERAGE | INTIPALCA MALBEC (variant BOTELLA ENTERA 95.00); INTIPALCA SAUVIGNON BLANC (95.00); GRAN TINTO TACAMA ×2 (BOTELLA ENTERA 90.00; descriptions "(750ml peruano)red" and "(Peruano)red"); INTIPALCA (MEDIA BOTELLA 45.00); TACAMA (MEDIA BOTELLA 45.00); — / WHITE OR RED (variant COPA/GLASS 23.00) |

**Mock data tips:**
- `displayOrder` is 1..n within each category, and categories are ordered 1..16.
- Mock `createdAt` and `updatedAt` as the seed time, and `category` as the embed above.
- For realistic customers, mix WhatsApp-created rows (names null, `phone` "+519XXXXXXXX", `sourceChannel` WHATSAPP, status NEW) with manually created ones (names, email, `phoneCountry` "PE").

---

## 7. Discrepancies and surprises found (code vs docs and tests)

1. **An empty PATCH on the catalog is accepted.**
   - What happens: `CommercialCategoriesService.update` and `CommercialItemsService.update` reject `{}` with `Object.keys(dto).length === 0`. With `target: ES2023`, the compiled DTOs declare class fields (confirmed in `dist/src/dto/*.js`), so every DTO instance already has all its keys set to `undefined` and the check never fires.
   - Result: `PATCH {}` returns 200. On an **APPROVED item it silently demotes the item to DRAFT**.
   - Why tests miss it: the unit specs pass plain objects, and the e2e matrix accepts 200, 400 or 404.
   - Confidence: this is inferred from code and was not executed.
2. **`docs/customers-postman.md` is out of date.** It says customers are not yet connected to WhatsApp or conversations. Since Sprint 3, inbound messages call `findOrCreateByContact`, which creates customers and advances `lastContactAt`.
3. **There is no Samanta integration or assistant endpoint.** The rule exists only as an internal service method.
4. **Reservation requests and reservations** accept an APPROVED, active item even when its category is inactive, which differs from the assistant rule.
5. **The status 404 message differs:** `PATCH /customers/:id/status` returns "Cliente o interés no encontrado", while other routes return "Cliente no encontrado".
6. **`GET /commercial-categories` silently ignores query params.** It cannot filter to active categories, so filter client-side for the "Nuevo servicio" selector.
7. **Customer and catalog timestamps are `timestamp` without a time zone,** while reservations use `timestamptz`. This is documented debt. Both serialize as UTC `Z` strings.
8. **The catalog list returns full child collections per row,** with no lightweight list projection.

## 8. Open questions

- Should "Servicios y precios" list every item type (the seed is food and drinks only) or only SERVICE?
- Should the row toggle mean "offered by Samanta", which needs active **and approved**? Should approval be a separate control? Should OWNER be allowed to approve? Today only ADMIN can.
- Who sets `restaurant-config.currency`? The seed does not, and prices need it for display.
- Will the backend add the list enrichments (counts, latest interest, conversation link, status counts), or should the frontend do N+1 calls for now?
- Is the frontend expected to set customer status manually (no automation exists), and from which screens?
- Should the empty-PATCH bug in the catalog be fixed before the frontend relies on "save" with unchanged forms? Sending only the changed fields avoids an accidental DRAFT reset, but any edit still demotes an approved item.
