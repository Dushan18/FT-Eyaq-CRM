// @vitest-environment node
/**
 * Rutas del backend simulado que replican bk-crm (docs/frontend-api-completo.md): usuarios, catálogo,
 * clientes, solicitudes, reservas, envío por Messenger y borradores de Samanta. Se llama a
 * handleMockRequest como lo hace el BFF, con el token del login simulado.
 */
import { TZDate } from "@date-fns/tz";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  CommercialCategory,
  CommercialItem,
  Conversation,
  Customer,
  CustomerDetail,
  CustomerInterest,
  Message,
  Paginated,
  Reservation,
  ReservationDetail,
  ReservationNote,
  ReservationRequest,
  ReservationRequestApproval,
  ReservationRequestDetail,
  RestaurantConfig,
  SamantaDraft,
  SamantaDraftListResponse,
  User,
} from "@/lib/api/types";
import { SAMANTA_USER_ID } from "@/lib/api/types";
import { buildSeed } from "./seed";
import { handleMockRequest, mockStore } from "./server";
import { runSimulator } from "./simulator";
import { resetStore } from "./store";

const TZ = "America/Lima";

interface Call {
  token?: string;
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Respuesta de una ruta que puede devolver el recurso o un error. */
type OrError<T> = T & Partial<ErrorBody>;

async function api<T = ErrorBody>(
  method: string,
  path: string,
  call: Call = {},
): Promise<{ status: number; body: T }> {
  const res = await handleMockRequest({
    method,
    path,
    search: call.query ? `?${new URLSearchParams(call.query).toString()}` : "",
    headers: {
      ...(call.token ? { authorization: `Bearer ${call.token}` } : {}),
      ...(call.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...call.headers,
    },
    body: call.body !== undefined ? JSON.stringify(call.body) : null,
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

async function login(email: string): Promise<{ token: string; id: string }> {
  const res = await api<{ accessToken: string; user: { id: string } }>(
    "POST",
    "/auth/login",
    { body: { email, password: "demo1234" } },
  );
  expect(res.status).toBe(201);
  return { token: res.body.accessToken, id: res.body.user.id };
}

function futureAt(daysAhead: number, hour: number): string {
  const today = new TZDate(Date.now(), TZ);
  return new TZDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + daysAhead,
    hour,
    0,
    0,
    0,
    TZ,
  ).toISOString();
}

const pastAt = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
/** Las respuestas devuelven los instantes en UTC. */
const utc = (value: string) => new Date(value).toISOString();

/** Elemento activo y APPROVED del seed. */
function bookableItem() {
  return mockStore().items.find(
    (i) => i.isActive && i.approvalStatus === "APPROVED",
  )!;
}

function whatsappConversation(
  texto = "Hola, quiero reservar una mesa para el sábado a las 8, somos 4",
): string {
  return (
    runSimulator({
      accion: "entrante",
      texto,
      canal: "WHATSAPP",
      nombre: "Prueba Borrador",
    }) as { conversationId: string }
  ).conversationId;
}

async function lastMessage(
  token: string,
  conversationId: string,
): Promise<Message> {
  return (
    await api<Paginated<Message>>(
      "GET",
      `/conversations/${conversationId}/messages`,
      { token, query: { limit: "1" } },
    )
  ).body.data[0]!;
}

let admin: { token: string; id: string };
let operator: { token: string; id: string };

beforeEach(async () => {
  resetStore(() => buildSeed());
  admin = await login("frank@eyaqsystems.com");
  operator = await login("camila@sabormagico.pe");
});

describe("usuarios", () => {
  it("POST /users valida como class-validator (roles vacíos, email inválido, campos no declarados)", async () => {
    const base = {
      firstName: "Lucía",
      lastName: "Quispe",
      email: "lucia.quispe@example.com",
      password: "Temporal-Lima-26",
    };
    const noRoles = await api("POST", "/users", {
      token: admin.token,
      body: { ...base, roles: [] },
    });
    expect(noRoles.status).toBe(400);
    expect(noRoles.body.message).toEqual([
      "roles must contain at least 1 elements",
    ]);

    const badEmail = await api("POST", "/users", {
      token: admin.token,
      body: { ...base, email: "x", roles: ["OPERATOR"], confirmPassword: "x" },
    });
    expect(badEmail.body.message).toEqual([
      "property confirmPassword should not exist",
      "email must be an email",
    ]);

    const created = await api<User>("POST", "/users", {
      token: admin.token,
      body: { ...base, roles: ["OPERATOR"] },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      isActive: true,
      lastLoginAt: null,
      roles: ["OPERATOR"],
    });
  });

  it("GET y PATCH /users/:id: detalle, edición parcial, body vacío, 404 y email duplicado", async () => {
    const detail = await api<User>("GET", `/users/${operator.id}`, {
      token: admin.token,
    });
    expect(detail.body).toMatchObject({
      id: operator.id,
      email: "camila@sabormagico.pe",
    });
    expect(detail.body).not.toHaveProperty("password");

    const edited = await api<User>("PATCH", `/users/${operator.id}`, {
      token: admin.token,
      body: { firstName: "  Camila Andrea ", email: "camila.t@sabormagico.pe" },
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      firstName: "Camila Andrea",
      email: "camila.t@sabormagico.pe",
    });

    expect(
      (
        await api("PATCH", `/users/${operator.id}`, {
          token: admin.token,
          body: {},
        })
      ).body.message,
    ).toBe("Debes proporcionar al menos un campo para actualizar");
    const dup = await api("PATCH", `/users/${operator.id}`, {
      token: admin.token,
      body: { email: "frank@eyaqsystems.com" },
    });
    expect(dup).toMatchObject({
      status: 409,
      body: { message: "Ya existe un usuario registrado con este correo" },
    });
    const extra = await api("PATCH", `/users/${operator.id}`, {
      token: admin.token,
      body: { roles: ["ADMIN"], firstName: null },
    });
    expect(extra.body.message).toEqual([
      "property roles should not exist",
      "firstName must be shorter than or equal to 100 characters",
      "firstName no puede contener solo espacios",
      "firstName must be a string",
    ]);
    expect(
      (
        await api("GET", "/users/7c9e6679-7425-40de-944b-e07fc1f90ae7", {
          token: admin.token,
        })
      ).body.message,
    ).toBe("Usuario no encontrado");
    expect(
      (await api("GET", `/users/${operator.id}`, { token: operator.token }))
        .status,
    ).toBe(403);
  });
});

describe("catálogo", () => {
  it("categorías: alta, nombre único normalizado, detalle, edición y estado (que llega al resumen de sus elementos)", async () => {
    const created = await api<CommercialCategory>(
      "POST",
      "/commercial-categories",
      {
        token: admin.token,
        body: { nameEs: "  Bebidas ", nameEn: "Drinks", displayOrder: "7" },
      },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      nameEs: "Bebidas",
      nameEn: "Drinks",
      displayOrder: 7,
      isActive: true,
      descriptionEs: null,
    });

    const dup = await api("POST", "/commercial-categories", {
      token: admin.token,
      body: { nameEn: "bébidas" },
    });
    expect(dup).toMatchObject({
      status: 409,
      body: { message: "Ya existe una categoría comercial con ese nombre" },
    });
    expect(
      (
        await api("POST", "/commercial-categories", {
          token: admin.token,
          body: {},
        })
      ).body.message,
    ).toBe("La categoría debe tener al menos un nombre en español o inglés");
    expect(
      (
        await api("POST", "/commercial-categories", {
          token: admin.token,
          body: { nameEs: "X", isActive: true },
        })
      ).body.message,
    ).toEqual(["property isActive should not exist"]);

    const id = created.body.id;
    expect(
      (
        await api<CommercialCategory>("GET", `/commercial-categories/${id}`, {
          token: operator.token,
        })
      ).body.nameEs,
    ).toBe("Bebidas");
    expect(
      (
        await api("PATCH", `/commercial-categories/${id}`, {
          token: admin.token,
          body: {},
        })
      ).body.message,
    ).toBe("Debes proporcionar al menos un campo para actualizar");
    const patched = await api<CommercialCategory>(
      "PATCH",
      `/commercial-categories/${id}`,
      { token: admin.token, body: { nameEn: null, descriptionEs: "Frías" } },
    );
    expect(patched.body).toMatchObject({
      nameEn: null,
      descriptionEs: "Frías",
    });

    const item = mockStore().items[0]!;
    const off = await api<CommercialCategory>(
      "PATCH",
      `/commercial-categories/${item.categoryId}/status`,
      { token: admin.token, body: { isActive: false } },
    );
    expect(off.body.isActive).toBe(false);
    expect(
      (
        await api<CommercialItem>("GET", `/commercial-items/${item.id}`, {
          token: admin.token,
        })
      ).body.category.isActive,
    ).toBe(false);
    expect(
      (
        await api(
          "GET",
          "/commercial-categories/7c9e6679-7425-40de-944b-e07fc1f90ae7",
          { token: admin.token },
        )
      ).body.message,
    ).toBe("Categoría comercial no encontrada");
  });

  it("elementos: alta con el DTO completo, regla de precio, edición que vuelve a DRAFT y arrays que reemplazan la lista", async () => {
    const categoryId = mockStore().categories.find((c) => c.isActive)!.id;
    const created = await api<CommercialItem>("POST", "/commercial-items", {
      token: admin.token,
      body: {
        type: "DISH",
        categoryId,
        nameEs: "Anticuchos de corazón",
        conditions: "Sujeto a disponibilidad del día.",
        variants: [
          { nameEs: "Porción personal", price: "25" },
          { nameEs: "Porción para compartir", price: "45.00" },
        ],
        images: [
          { url: "https://cdn.example.com/anticuchos.jpg", isPrimary: true },
        ],
        faqs: [
          { questionEs: "¿Es picante?", answerEs: "El ají se sirve aparte." },
        ],
        schedules: [
          { dayOfWeek: "SUNDAY", isAvailable: false },
          {
            dayOfWeek: "FRIDAY",
            isAvailable: true,
            startTime: "18:00",
            endTime: "23:30",
          },
        ],
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      approvalStatus: "DRAFT",
      isActive: true,
      basePrice: null,
      promotionDetail: null,
    });
    expect(created.body.variants.map((v) => [v.price, v.displayOrder])).toEqual(
      [
        ["25.00", 0],
        ["45.00", 1],
      ],
    );
    expect(created.body.schedules.map((s) => s.dayOfWeek)).toEqual([
      "FRIDAY",
      "SUNDAY",
    ]);

    const both = await api("POST", "/commercial-items", {
      token: admin.token,
      body: {
        type: "DISH",
        categoryId,
        nameEs: "Doble",
        basePrice: "10",
        variants: [{ nameEs: "A", price: "5" }],
      },
    });
    expect(both.body.message).toBe(
      "Un plato o bebida debe tener un precio base o variantes activas, pero no ambos",
    );
    const nested = await api("POST", "/commercial-items", {
      token: admin.token,
      body: {
        type: "SERVICE",
        categoryId,
        nameEs: "Mal",
        variants: [{ nameEs: "A", price: 5, id: "x" }],
      },
    });
    expect(nested.body.message).toEqual([
      "variants.0.property id should not exist",
      "variants.0.price debe ser una cadena decimal no negativa con máximo dos decimales",
      "variants.0.price must be a string",
    ]);

    const id = created.body.id;
    await api("PATCH", `/commercial-items/${id}/approval`, {
      token: admin.token,
      body: { approvalStatus: "APPROVED" },
    });
    const edited = await api<CommercialItem>(
      "PATCH",
      `/commercial-items/${id}`,
      {
        token: admin.token,
        body: { displayOrder: 3, variants: [{ nameEs: "Única", price: "30" }] },
      },
    );
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      approvalStatus: "DRAFT",
      displayOrder: 3,
    });
    expect(edited.body.variants).toHaveLength(1);
    expect(edited.body.variants[0]!.id).not.toBe(created.body.variants[0]!.id);
    expect(edited.body.faqs).toHaveLength(1);

    expect(
      (
        await api("PATCH", `/commercial-items/${id}`, {
          token: admin.token,
          body: {},
        })
      ).body.message,
    ).toBe("Debes proporcionar al menos un campo para actualizar");
    expect(
      (
        await api("PATCH", `/commercial-items/${id}`, {
          token: admin.token,
          body: { type: "SERVICE" },
        })
      ).body.message,
    ).toEqual(["property type should not exist"]);
    expect(
      (
        await api("PATCH", `/commercial-items/${id}`, {
          token: admin.token,
          body: { variants: [] },
        })
      ).body.message,
    ).toBe(
      "Un plato o bebida debe tener un precio base o variantes activas, pero no ambos",
    );
    expect(
      (
        await api<CommercialItem>("GET", `/commercial-items/${id}`, {
          token: operator.token,
        })
      ).body.variants[0]!.nameEs,
    ).toBe("Única");
  });
});

describe("clientes", () => {
  it("alta con regla de contacto, duplicados normalizados, edición, enum de estado e intereses", async () => {
    const created = await api<Customer>("POST", "/customers", {
      token: operator.token,
      body: {
        sourceChannel: "PHONE",
        firstName: " Carlos ",
        lastName: "Quispe",
        phone: "987 654 321",
        phoneCountry: "pe",
        email: " Carlos.Quispe@Example.com ",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      firstName: "Carlos",
      phone: "987 654 321",
      phoneCountry: "PE",
      email: "carlos.quispe@example.com",
      status: "NEW",
    });
    expect(created.body.firstContactAt).toBe(created.body.lastContactAt);
    expect(created.body).not.toHaveProperty("interests");

    // Mismo teléfono en formato internacional: 409.
    const dup = await api("POST", "/customers", {
      token: operator.token,
      body: { sourceChannel: "WHATSAPP", phone: "+51987654321" },
    });
    expect(dup).toMatchObject({
      status: 409,
      body: { message: "Ya existe un cliente con ese teléfono o correo" },
    });
    expect(
      (
        await api("POST", "/customers", {
          token: operator.token,
          body: { sourceChannel: "PHONE", phone: "987654321" },
        })
      ).body.message,
    ).toBe(
      "Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry",
    );
    expect(
      (
        await api("POST", "/customers", {
          token: operator.token,
          body: {
            sourceChannel: "PHONE",
            phone: "987654321",
            phoneCountry: "US",
          },
        })
      ).body.message,
    ).toBe("El teléfono no es válido para el país indicado");
    expect(
      (
        await api("POST", "/customers", {
          token: operator.token,
          body: { sourceChannel: "PHONE", phoneCountry: "PE", email: "a@b.pe" },
        })
      ).body.message,
    ).toBe("phoneCountry requiere un teléfono");
    expect(
      (
        await api("POST", "/customers", {
          token: (await login("ricardo@sabormagico.pe")).token,
          body: { sourceChannel: "PHONE", email: "z@z.pe" },
        })
      ).status,
    ).toBe(403);

    const id = created.body.id;
    const edited = await api<Customer>("PATCH", `/customers/${id}`, {
      token: operator.token,
      body: { firstName: "Carlos Alberto", notes: "Prefiere correo" },
    });
    expect(edited.body).toMatchObject({
      firstName: "Carlos Alberto",
      notes: "Prefiere correo",
      status: "NEW",
    });
    expect(
      (
        await api("PATCH", `/customers/${id}`, {
          token: operator.token,
          body: {},
        })
      ).body.message,
    ).toBe("Debes proporcionar al menos un campo para actualizar");
    // phone sin phoneCountry: el país no se hereda y el número nacional deja de estar normalizado (queda el email).
    const national = await api<Customer>("PATCH", `/customers/${id}`, {
      token: operator.token,
      body: { phone: "912 345 678" },
    });
    expect(national.body).toMatchObject({
      phone: "912 345 678",
      phoneCountry: null,
    });
    expect(
      (
        await api("PATCH", `/customers/${id}`, {
          token: operator.token,
          body: { email: null },
        })
      ).body.message,
    ).toBe(
      "Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry",
    );

    const badStatus = await api("PATCH", `/customers/${id}/status`, {
      token: operator.token,
      body: { status: "VIP" },
    });
    expect(badStatus.body.message).toEqual([
      "status must be one of the following values: NEW, INTERESTED, IN_CONVERSATION, REQUESTED_RESERVATION, CONFIRMED, REJECTED, LOST, RECURRENT",
    ]);

    const item = bookableItem();
    const first = await api<CustomerInterest>(
      "POST",
      `/customers/${id}/interests`,
      {
        token: operator.token,
        body: { commercialItemId: item.id, notes: "Consultó precio" },
      },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      notes: "Consultó precio",
      commercialItem: { id: item.id },
    });
    await new Promise((r) => setTimeout(r, 5));
    const again = await api<CustomerInterest>(
      "POST",
      `/customers/${id}/interests`,
      { token: operator.token, body: { commercialItemId: item.id } },
    );
    expect(again.body).toMatchObject({
      id: first.body.id,
      firstInterestedAt: first.body.firstInterestedAt,
      notes: "Consultó precio",
    });
    expect(again.body.lastInterestedAt > first.body.lastInterestedAt).toBe(
      true,
    );
    const detail = await api<CustomerDetail>("GET", `/customers/${id}`, {
      token: operator.token,
    });
    expect(detail.body.lastContactAt).toBe(again.body.lastInterestedAt);
    expect(detail.body.interests).toHaveLength(1);

    const removed = await api(
      "DELETE",
      `/customers/${id}/interests/${item.id}`,
      { token: operator.token },
    );
    expect(removed).toEqual({ status: 204, body: null });
    expect(
      (
        await api("DELETE", `/customers/${id}/interests/${item.id}`, {
          token: operator.token,
        })
      ).body.message,
    ).toBe("Interés no encontrado");
    expect(
      (
        await api("DELETE", `/customers/${id}/interests/no-es-uuid`, {
          token: operator.token,
        })
      ).body.message,
    ).toBe("Validation failed (uuid is expected)");
  });

  it("una identidad de Messenger no cambia de canal ni necesita contacto", async () => {
    const messenger = mockStore().customers.find(
      (c) => c.messengerPsid && !c.phone && !c.email,
    )!;
    expect(
      (
        await api("PATCH", `/customers/${messenger.id}`, {
          token: admin.token,
          body: { sourceChannel: "WHATSAPP" },
        })
      ).body.message,
    ).toBe("No se puede cambiar el canal de una identidad de Messenger");
    const named = await api<Customer>("PATCH", `/customers/${messenger.id}`, {
      token: admin.token,
      body: { notes: "Pregunta por estacionamiento" },
    });
    expect(named.status).toBe(200);
  });
});

describe("solicitudes de reserva", () => {
  it("alta con estado calculado, moneda del restaurante y reglas de fecha, elemento y precio", async () => {
    const customerId = mockStore().customers[0]!.id;
    const item = bookableItem();
    const ready = await api<ReservationRequest>(
      "POST",
      "/reservation-requests",
      {
        token: operator.token,
        body: {
          customerId,
          sourceChannel: "PHONE",
          commercialItemId: item.id,
          reservationAt: futureAt(3, 20),
          numberOfPeople: 4,
          quotedPrice: "150.5",
        },
      },
    );
    expect(ready.status).toBe(201);
    expect(ready.body).toMatchObject({
      status: "READY_TO_SEND",
      quotedPrice: "150.50",
      currency: "PEN",
      commercialItem: { id: item.id },
    });
    expect(ready.body.code).toMatch(/^RES-\d{4}-\d{6}$/);

    const incomplete = await api<ReservationRequest>(
      "POST",
      "/reservation-requests",
      {
        token: operator.token,
        body: { customerId, sourceChannel: "WHATSAPP" },
      },
    );
    expect(incomplete.body).toMatchObject({
      status: "INCOMPLETE_DATA",
      reservationAt: null,
      currency: null,
    });

    const errors = async (body: Record<string, unknown>) =>
      (
        await api("POST", "/reservation-requests", {
          token: operator.token,
          body: { customerId, sourceChannel: "PHONE", ...body },
        })
      ).body.message;
    expect(await errors({ reservationAt: pastAt() })).toBe(
      "La fecha de reserva debe ser válida y futura",
    );
    expect(await errors({ currency: "USD" })).toBe(
      "El precio y la moneda deben estar presentes juntos",
    );
    expect(await errors({ quotedPrice: "10", currency: null })).toBe(
      "El precio y la moneda deben estar presentes juntos",
    );
    const draftItem = mockStore().items.find(
      (i) => i.approvalStatus === "DRAFT",
    )!;
    expect(await errors({ commercialItemId: draftItem.id })).toBe(
      "El elemento comercial debe estar activo y aprobado",
    );
    expect(
      await errors({ numberOfPeople: "4", status: "READY_TO_SEND" }),
    ).toEqual([
      "property status should not exist",
      "numberOfPeople must not be greater than 2147483647",
      "numberOfPeople must not be less than 1",
      "numberOfPeople must be an integer number",
    ]);
    expect(await errors({ reservationAt: "2026-12-24T20:00" })).toEqual([
      String.raw`reservationAt must match /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/ regular expression`,
    ]);

    mockStore().config = null;
    expect(await errors({})).toBe(
      "Configura el restaurante antes de crear solicitudes o reservas",
    );
  });

  it("edición: recalcula el estado, conserva la moneda y solo se permite en INCOMPLETE_DATA y READY_TO_SEND", async () => {
    const customerId = mockStore().customers[0]!.id;
    const created = await api<ReservationRequest>(
      "POST",
      "/reservation-requests",
      {
        token: operator.token,
        body: {
          customerId,
          sourceChannel: "PHONE",
          reservationAt: futureAt(4, 13),
          quotedPrice: "80",
          currency: "USD",
        },
      },
    );
    const id = created.body.id;
    const ready = await api<ReservationRequest>(
      "PATCH",
      `/reservation-requests/${id}`,
      { token: operator.token, body: { numberOfPeople: 5, quotedPrice: "90" } },
    );
    expect(ready.body).toMatchObject({
      status: "READY_TO_SEND",
      numberOfPeople: 5,
      quotedPrice: "90.00",
      currency: "USD",
    });
    const back = await api<ReservationRequest>(
      "PATCH",
      `/reservation-requests/${id}`,
      {
        token: operator.token,
        body: { reservationAt: null, quotedPrice: null },
      },
    );
    expect(back.body).toMatchObject({
      status: "INCOMPLETE_DATA",
      reservationAt: null,
      quotedPrice: null,
      currency: null,
    });
    expect(
      (
        await api("PATCH", `/reservation-requests/${id}`, {
          token: operator.token,
          body: {},
        })
      ).body.message,
    ).toBe("Proporciona al menos un campo para actualizar");

    await api("PATCH", `/reservation-requests/${id}/status`, {
      token: operator.token,
      body: { status: "CANCELLED" },
    });
    const locked = await api("PATCH", `/reservation-requests/${id}`, {
      token: operator.token,
      body: { comments: "Tarde" },
    });
    expect(locked).toMatchObject({
      status: 409,
      body: {
        message: "La solicitud no admite modificaciones en su estado actual",
      },
    });
  });

  it("historial: solo cambios reales de estado; cancelar con motivo es idempotente y el detalle trae su forma completa", async () => {
    const customerId = mockStore().customers[0]!.id;
    const created = await api<ReservationRequest>("POST", "/reservation-requests", {
      token: operator.token,
      body: { customerId, sourceChannel: "PHONE", reservationAt: futureAt(4, 13) },
    });
    expect(created.body).toMatchObject({ status: "INCOMPLETE_DATA", externalReference: null, conversationId: null });
    expect(created.body).not.toHaveProperty("statusHistory");
    const id = created.body.id;
    // INCOMPLETE_DATA → READY_TO_SEND deja una entrada USER; una edición sin cambio de estado, ninguna.
    await api("PATCH", `/reservation-requests/${id}`, { token: operator.token, body: { numberOfPeople: 2 } });
    await api("PATCH", `/reservation-requests/${id}`, { token: operator.token, body: { comments: "Ventana" } });

    const cancel = (body: Record<string, unknown>) =>
      api<OrError<ReservationRequest>>("PATCH", `/reservation-requests/${id}/status`, { token: operator.token, body });
    expect((await cancel({ status: "CANCELLED", reason: "   " })).body.message).toEqual(["reason should not be empty"]);
    expect((await cancel({ status: "CANCELLED", reason: "x".repeat(1001) })).body.message).toEqual([
      "reason must be shorter than or equal to 1000 characters",
    ]);
    expect((await cancel({ status: "CANCELLED", foo: 1 })).body.message).toEqual(["property foo should not exist"]);
    const cancelled = await cancel({ status: "CANCELLED", reason: "  El cliente reservó por teléfono  " });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body).not.toHaveProperty("statusHistory");
    const again = await cancel({ status: "CANCELLED", reason: "Otro motivo" });
    expect(again).toMatchObject({ status: 200, body: { status: "CANCELLED", updatedAt: cancelled.body.updatedAt } });

    const detail = await api<ReservationRequestDetail>("GET", `/reservation-requests/${id}`, { token: admin.token });
    expect(Object.keys(detail.body).sort()).toEqual(
      [
        ...Object.keys(created.body),
        "statusHistory",
        "reservation",
        "ownerMessage",
        "customerNoticeMessage",
        "customerNoticeError",
      ].sort(),
    );
    expect(detail.body).toMatchObject({ reservation: null, ownerMessage: null, customerNoticeMessage: null, customerNoticeError: null });
    expect(detail.body.statusHistory).toHaveLength(2);
    expect(detail.body.statusHistory[0]).toMatchObject({
      previousStatus: "INCOMPLETE_DATA",
      newStatus: "READY_TO_SEND",
      actorType: "USER",
      actorId: operator.id,
      reason: null,
      actor: { id: operator.id, firstName: "Camila", lastName: "Torres" },
    });
    expect(Object.keys(detail.body.statusHistory[0]!).sort()).toEqual(
      ["id", "previousStatus", "newStatus", "actorType", "actorId", "reason", "createdAt", "actor"].sort(),
    );
    expect(Object.keys(detail.body.statusHistory[0]!.actor!).sort()).toEqual(["firstName", "id", "lastName"]);
    expect(detail.body.statusHistory[1]).toMatchObject({
      previousStatus: "READY_TO_SEND",
      newStatus: "CANCELLED",
      actorType: "USER",
      reason: "El cliente reservó por teléfono",
    });
  });

  it("aprobar: ADMIN u OWNER; crea una reserva CONFIRMED, es idempotente y responde los 409 en orden", async () => {
    const owner = await login("ricardo@sabormagico.pe");
    const customerId = mockStore().customers[0]!.id;
    const item = bookableItem();
    const create = async (body: Record<string, unknown> = {}) =>
      (
        await api<ReservationRequest>("POST", "/reservation-requests", {
          token: operator.token,
          body: {
            customerId,
            sourceChannel: "PHONE",
            commercialItemId: item.id,
            reservationAt: futureAt(5, 20),
            numberOfPeople: 4,
            specialRequirements: "Silla para bebé",
            ...body,
          },
        })
      ).body.id;
    const approve = (id: string, token = owner.token) =>
      api<OrError<ReservationRequestApproval>>("POST", `/reservation-requests/${id}/approve`, { token });

    const id = await create();
    expect((await approve(id, operator.token)).body).toMatchObject({ statusCode: 403, message: "No tienes permisos para realizar esta acción" });
    const before = mockStore().reservations.length;
    const ok = await approve(id);
    expect(ok.status).toBe(200);
    expect(ok.body.request).toMatchObject({ id, status: "ACCEPTED" });
    expect(ok.body.request).not.toHaveProperty("statusHistory");
    expect(ok.body.reservation).toMatchObject({
      reservationRequestId: id,
      customerId,
      commercialItemId: item.id,
      numberOfPeople: 4,
      status: "CONFIRMED",
      notes: "Silla para bebé",
      assignedUserId: null,
      assignedUser: null,
    });
    expect(ok.body.reservation.code).toMatch(/^R-\d{4}-\d{6}$/);
    // Idempotente: la misma reserva, sin escribir nada.
    const again = await approve(id, admin.token);
    expect(again.status).toBe(200);
    expect(again.body.reservation.id).toBe(ok.body.reservation.id);
    expect(again.body.request.updatedAt).toBe(ok.body.request.updatedAt);
    expect(mockStore().reservations.length).toBe(before + 1);
    // En el CRM no hay aviso automático al cliente.
    const detail = await api<ReservationRequestDetail>("GET", `/reservation-requests/${id}`, { token: admin.token });
    expect(detail.body).toMatchObject({
      reservation: { id: ok.body.reservation.id, code: ok.body.reservation.code, status: "CONFIRMED" },
      customerNoticeMessage: null,
      customerNoticeError: null,
    });
    expect(detail.body.statusHistory.at(-1)).toMatchObject({ previousStatus: "READY_TO_SEND", newStatus: "ACCEPTED", actorType: "USER", actorId: owner.id });
    // Una aprobada no se rechaza ni se cancela.
    expect((await api("POST", `/reservation-requests/${id}/reject`, { token: owner.token, body: {} })).body).toMatchObject({
      statusCode: 409,
      message: "La solicitud ya fue aprobada: cancela su reserva desde el calendario",
    });
    expect((await api("PATCH", `/reservation-requests/${id}/status`, { token: operator.token, body: { status: "CANCELLED" } })).status).toBe(409);

    // 409 por estado.
    const incomplete = await create({ numberOfPeople: null });
    expect((await approve(incomplete)).body).toMatchObject({
      statusCode: 409,
      message: "Completa la fecha y el número de personas antes de aprobar la solicitud",
    });
    const cancelled = await create();
    await api("PATCH", `/reservation-requests/${cancelled}/status`, { token: operator.token, body: { status: "CANCELLED" } });
    expect((await approve(cancelled)).body.message).toBe("La solicitud no se puede aprobar en su estado actual");
    const rejected = await create();
    await api("POST", `/reservation-requests/${rejected}/reject`, { token: owner.token, body: {} });
    expect((await approve(rejected)).body.message).toBe("La solicitud no se puede aprobar en su estado actual");
    // Fecha pasada (antes que el elemento): 409.
    const past = await create();
    const pastRow = mockStore().requests.find((r) => r.id === past)!;
    pastRow.reservationAt = pastAt();
    item.isActive = false;
    expect((await approve(past)).body).toMatchObject({ statusCode: 409, message: "La fecha de la solicitud ya pasó: edítala antes de aprobarla" });
    // Elemento que dejó de estar activo: 400.
    pastRow.reservationAt = futureAt(6, 20);
    expect((await approve(past)).body).toMatchObject({ statusCode: 400, message: "El elemento comercial debe estar activo y aprobado" });
    item.isActive = true;
    // Sin configuración: 409.
    mockStore().config = null;
    expect((await approve(past)).body).toMatchObject({ statusCode: 409, message: "Configura el restaurante antes de crear solicitudes o reservas" });
    expect((await approve("8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f")).body).toMatchObject({ statusCode: 404, message: "Solicitud de reserva no encontrada" });
  });

  it("aprobar y rechazar: aceptan SENT_TO_OWNER y WAITING_RESPONSE; MODIFICATION_REQUESTED responde 409", async () => {
    const owner = await login("ricardo@sabormagico.pe");
    const byStatus = (status: string) => mockStore().requests.find((r) => r.status === status)!;
    const sent = byStatus("SENT_TO_OWNER");
    const approved = await api<ReservationRequestApproval>("POST", `/reservation-requests/${sent.id}/approve`, { token: admin.token });
    expect(approved.body.request.status).toBe("ACCEPTED");
    const waiting = byStatus("WAITING_RESPONSE");
    const rejected = await api<ReservationRequest>("POST", `/reservation-requests/${waiting.id}/reject`, {
      token: owner.token,
      body: { reason: "No hay mesas libres ese día" },
    });
    expect(rejected.body.status).toBe("REJECTED");
    const modification = byStatus("MODIFICATION_REQUESTED");
    expect((await api("POST", `/reservation-requests/${modification.id}/approve`, { token: owner.token })).body.message).toBe(
      "La solicitud no se puede aprobar en su estado actual",
    );
    expect((await api("POST", `/reservation-requests/${modification.id}/reject`, { token: owner.token, body: {} })).body.message).toBe(
      "La solicitud no se puede rechazar en su estado actual",
    );
    expect((await api("PATCH", `/reservation-requests/${modification.id}`, { token: operator.token, body: { comments: "x" } })).body.message).toBe(
      "La solicitud no admite modificaciones en su estado actual",
    );
  });

  it("rechazar: con motivo opcional, idempotente y con sus 400, 403 y 409", async () => {
    const owner = await login("ricardo@sabormagico.pe");
    const customerId = mockStore().customers[0]!.id;
    const create = async () =>
      (
        await api<ReservationRequest>("POST", "/reservation-requests", {
          token: operator.token,
          body: { customerId, sourceChannel: "PHONE" },
        })
      ).body.id;
    const reject = (id: string, body: unknown, token = owner.token) =>
      api<OrError<ReservationRequest>>("POST", `/reservation-requests/${id}/reject`, { token, body });
    const id = await create();
    expect((await reject(id, {}, operator.token)).status).toBe(403);
    expect((await reject(id, { reason: "", foo: true })).body.message).toEqual(["property foo should not exist", "reason should not be empty"]);
    expect((await reject(id, { reason: 5 })).body.message).toEqual([
      "reason must be shorter than or equal to 1000 characters",
      "reason must be a string",
    ]);
    // Desde INCOMPLETE_DATA.
    const ok = await reject(id, { reason: " Sin cupo " });
    expect(ok).toMatchObject({ status: 200, body: { status: "REJECTED" } });
    const again = await reject(id, { reason: "Otro" });
    expect(again).toMatchObject({ status: 200, body: { updatedAt: ok.body.updatedAt } });
    const detail = await api<ReservationRequestDetail>("GET", `/reservation-requests/${id}`, { token: owner.token });
    expect(detail.body.statusHistory).toEqual([
      expect.objectContaining({ previousStatus: "INCOMPLETE_DATA", newStatus: "REJECTED", actorType: "USER", actorId: owner.id, reason: "Sin cupo" }),
    ]);
    // Una rechazada no se cancela; una cancelada no se rechaza.
    expect((await api("PATCH", `/reservation-requests/${id}/status`, { token: operator.token, body: { status: "CANCELLED" } })).status).toBe(409);
    const cancelled = await create();
    await api("PATCH", `/reservation-requests/${cancelled}/status`, { token: operator.token, body: { status: "CANCELLED" } });
    expect((await reject(cancelled, {})).body).toMatchObject({ statusCode: 409, message: "La solicitud no se puede rechazar en su estado actual" });
    // Sin body también vale.
    const noBody = await create();
    expect((await api<ReservationRequest>("POST", `/reservation-requests/${noBody}/reject`, { token: admin.token })).body.status).toBe("REJECTED");
  });

  it("conversación vinculada: filtro conversationId y reglas de alta y edición", async () => {
    const store = mockStore();
    const linked = store.requests.find((r) => r.conversationId !== null)!;
    const list = await api<Paginated<ReservationRequest>>("GET", "/reservation-requests", {
      token: admin.token,
      query: { conversationId: linked.conversationId! },
    });
    expect(list.body.data.map((r) => r.id)).toEqual(store.requests.filter((r) => r.conversationId === linked.conversationId).map((r) => r.id));
    expect(list.body.data[0]).toMatchObject({ conversationId: linked.conversationId });
    expect((await api("GET", "/reservation-requests", { token: admin.token, query: { conversationId: "abc" } })).body.message).toEqual([
      "conversationId must be a UUID",
    ]);

    const conv = store.conversations.find((c) => c.customerId !== linked.customerId)!;
    const create = (body: Record<string, unknown>) =>
      api<ReservationRequest>("POST", "/reservation-requests", { token: operator.token, body: { sourceChannel: "PHONE", ...body } });
    expect((await create({ customerId: conv.customerId, conversationId: "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f" })).body).toMatchObject({
      statusCode: 404,
      message: "Conversación no encontrada",
    });
    expect((await create({ customerId: linked.customerId, conversationId: conv.id })).body).toMatchObject({
      statusCode: 400,
      message: "La conversación pertenece a otro cliente",
    });
    const own = await create({ customerId: conv.customerId, conversationId: conv.id });
    expect(own.body).toMatchObject({ status: "INCOMPLETE_DATA", conversationId: conv.id });
    // Cambiar el cliente con la conversación actual de otro cliente: 400; con conversationId null, válido.
    const patch = (body: Record<string, unknown>) =>
      api<OrError<ReservationRequest>>("PATCH", `/reservation-requests/${own.body.id}`, { token: operator.token, body });
    expect((await patch({ customerId: linked.customerId })).body.message).toBe("La conversación pertenece a otro cliente");
    expect((await patch({ customerId: linked.customerId, conversationId: null })).body).toMatchObject({
      customerId: linked.customerId,
      conversationId: null,
    });
    expect((await patch({ conversationId: linked.conversationId })).body.conversationId).toBe(linked.conversationId);
  });
});

describe("configuración del restaurante (M9.1)", () => {
  /** Body del PUT a partir del GET, sin los campos de solo lectura. */
  async function putBody(): Promise<Record<string, unknown>> {
    const current = (await api<RestaurantConfig>("GET", "/restaurant-config", { token: admin.token })).body;
    const { id: _id, approvalResponsible: _r, createdAt: _c, updatedAt: _u, ...body } = current;
    void _id;
    void _r;
    void _c;
    void _u;
    return body;
  }
  const put = (body: Record<string, unknown>) => api<OrError<RestaurantConfig>>("PUT", "/restaurant-config", { token: admin.token, body });

  it("ownerWhatsappNumber: omitirlo conserva, null lo borra; E.164 y distinto de whatsappNumber", async () => {
    const body = await putBody();
    expect(body.ownerWhatsappNumber).toMatch(/^\+[1-9]\d{7,14}$/);
    const stored = body.ownerWhatsappNumber;
    const { ownerWhatsappNumber: _o, ...withoutOwner } = body;
    void _o;
    expect((await put(withoutOwner)).body.ownerWhatsappNumber).toBe(stored);
    expect((await put({ ...body, ownerWhatsappNumber: " +51911222333 " })).body.ownerWhatsappNumber).toBe("+51911222333");
    expect((await put({ ...body, ownerWhatsappNumber: null })).body.ownerWhatsappNumber).toBeNull();
    expect((await put(withoutOwner)).body.ownerWhatsappNumber).toBeNull();

    const bad = await put({ ...body, ownerWhatsappNumber: "987 654 321" });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toContain("ownerWhatsappNumber debe usar formato internacional E.164");
    expect((await put({ ...body, ownerWhatsappNumber: body.whatsappNumber })).body).toMatchObject({
      statusCode: 400,
      message: "ownerWhatsappNumber debe ser distinto de whatsappNumber",
    });
  });

  it("approvalResponsibleId: omitido lo borra; debe existir, estar activo y tener OWNER", async () => {
    const body = await putBody();
    const ownerId = body.approvalResponsibleId as string;
    expect(ownerId).toBeTruthy();
    const { approvalResponsibleId: _a, ...withoutResponsible } = body;
    void _a;
    expect((await put(withoutResponsible)).body).toMatchObject({ approvalResponsibleId: null, approvalResponsible: null });
    expect((await put({ ...body, approvalResponsibleId: "8d2f4b6a-0c1e-4a3b-9d5f-7e9a1b3c5d7f" })).body).toMatchObject({
      statusCode: 400,
      message: "El responsable de aprobación no existe",
    });
    expect((await put({ ...body, approvalResponsibleId: admin.id })).body).toMatchObject({
      statusCode: 400,
      message: "El responsable de aprobación debe tener el rol OWNER",
    });
    mockStore().users.find((u) => u.id === ownerId)!.isActive = false;
    expect((await put(body)).body).toMatchObject({ statusCode: 400, message: "El responsable de aprobación debe estar activo" });
    mockStore().users.find((u) => u.id === ownerId)!.isActive = true;
    expect((await put(body)).body).toMatchObject({ approvalResponsibleId: ownerId, approvalResponsible: { id: ownerId } });
    expect((await put({ ...body, approvalResponsibleId: "" })).body.message).toEqual(["approvalResponsibleId must be a UUID"]);
  });
});

describe("reservas", () => {
  it("alta manual (solo ADMIN): nace CONFIRMED, sin solicitud ni responsable y con código R-<año>-<secuencia>", async () => {
    const customerId = mockStore().customers[0]!.id;
    const body = {
      customerId,
      reservationAt: futureAt(5, 20),
      numberOfPeople: 4,
      notes: "Ventana",
    };
    expect(
      (await api("POST", "/reservations", { token: operator.token, body }))
        .status,
    ).toBe(403);
    const created = await api<Reservation>("POST", "/reservations", {
      token: admin.token,
      body,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      status: "CONFIRMED",
      reservationRequestId: null,
      assignedUserId: null,
      assignedUser: null,
      notes: "Ventana",
    });
    expect(created.body.code).toMatch(/^R-\d{4}-\d{6}$/);
    expect(
      (
        await api("POST", "/reservations", {
          token: admin.token,
          body: { ...body, reservationAt: pastAt() },
        })
      ).body.message,
    ).toBe("La fecha de reserva debe ser válida y futura");
    expect(
      (
        await api("POST", "/reservations", {
          token: admin.token,
          body: { ...body, reservationRequestId: null },
        })
      ).body.message,
    ).toEqual(["property reservationRequestId should not exist"]);
  });

  it("edición y reprogramación: otro instante deja RESCHEDULED con historial; el mismo instante no cambia nada", async () => {
    const customerId = mockStore().customers[0]!.id;
    const created = await api<Reservation>("POST", "/reservations", {
      token: admin.token,
      body: { customerId, reservationAt: futureAt(5, 20), numberOfPeople: 2 },
    });
    const id = created.body.id;

    const edited = await api<Reservation>("PATCH", `/reservations/${id}`, {
      token: operator.token,
      body: { reservationAt: futureAt(6, 21), numberOfPeople: 3 },
    });
    expect(edited.body).toMatchObject({
      status: "RESCHEDULED",
      numberOfPeople: 3,
      reservationAt: utc(futureAt(6, 21)),
    });
    expect(edited.body).not.toHaveProperty("rescheduleHistory");
    let detail = (
      await api<ReservationDetail>("GET", `/reservations/${id}`, {
        token: operator.token,
      })
    ).body;
    expect(detail.rescheduleHistory).toHaveLength(1);
    expect(detail.rescheduleHistory[0]).toMatchObject({
      previousReservationAt: utc(futureAt(5, 20)),
      newReservationAt: utc(futureAt(6, 21)),
      reason: null,
      changedBy: { id: operator.id },
    });

    // Mismo instante con otro offset: 200 sin cambios ni historial.
    const sameInstant = utc(futureAt(6, 21));
    const same = await api<Reservation>(
      "PATCH",
      `/reservations/${id}/reschedule`,
      {
        token: operator.token,
        body: { reservationAt: sameInstant, reason: "Ignorado" },
      },
    );
    expect(same.body.updatedAt).toBe(edited.body.updatedAt);
    const moved = await api<Reservation>(
      "PATCH",
      `/reservations/${id}/reschedule`,
      {
        token: operator.token,
        body: { reservationAt: futureAt(7, 19), reason: " Pidió otro día " },
      },
    );
    expect(moved.body).toMatchObject({
      status: "RESCHEDULED",
      reservationAt: utc(futureAt(7, 19)),
    });
    detail = (
      await api<ReservationDetail>("GET", `/reservations/${id}`, {
        token: operator.token,
      })
    ).body;
    expect(detail.rescheduleHistory.map((h) => h.reason)).toEqual([
      null,
      "Pidió otro día",
    ]);

    const note = await api<ReservationNote>(
      "POST",
      `/reservations/${id}/notes`,
      {
        token: operator.token,
        body: { content: "  Mesa cerca de la ventana " },
      },
    );
    expect(note.status).toBe(201);
    expect(note.body).toMatchObject({
      reservationId: id,
      authorUserId: operator.id,
      content: "Mesa cerca de la ventana",
      author: { id: operator.id, firstName: "Camila" },
    });
    expect(
      (
        await api("POST", `/reservations/${id}/notes`, {
          token: operator.token,
          body: {},
        })
      ).body.message,
    ).toEqual([
      "content must be shorter than or equal to 5000 characters",
      "content should not be empty",
      "content must be a string",
    ]);

    await api("PATCH", `/reservations/${id}/status`, {
      token: operator.token,
      body: { status: "CANCELLED" },
    });
    expect(
      (
        await api("PATCH", `/reservations/${id}`, {
          token: operator.token,
          body: { notes: "x" },
        })
      ).body.message,
    ).toBe("La reserva no admite edición o reprogramación en su estado actual");
    // Las observaciones se admiten también en estados finales.
    expect(
      (
        await api("POST", `/reservations/${id}/notes`, {
          token: operator.token,
          body: { content: "Canceló por teléfono" },
        })
      ).status,
    ).toBe(201);
  });

  it("responsable: el OPERATOR solo toma una libre o libera la suya; elegibilidad y estados finales", async () => {
    const customerId = mockStore().customers[0]!.id;
    const id = (
      await api<Reservation>("POST", "/reservations", {
        token: admin.token,
        body: { customerId, reservationAt: futureAt(5, 20), numberOfPeople: 2 },
      })
    ).body.id;
    const OPERATOR_RULE =
      "Un operador solo puede tomar una reserva libre o gestionar su propia asignación";

    const taken = await api<Reservation>(
      "PATCH",
      `/reservations/${id}/assignee`,
      { token: operator.token, body: { assignedUserId: operator.id } },
    );
    expect(taken.body).toMatchObject({
      assignedUserId: operator.id,
      assignedUser: { id: operator.id, isEligible: true },
    });
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: operator.token,
          body: { assignedUserId: admin.id },
        })
      ).body,
    ).toMatchObject({
      statusCode: 403,
      message: OPERATOR_RULE,
    });
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: operator.token,
          body: { assignedUserId: null },
        })
      ).status,
    ).toBe(200);

    await api("PATCH", `/reservations/${id}/assignee`, {
      token: admin.token,
      body: { assignedUserId: admin.id },
    });
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: operator.token,
          body: { assignedUserId: null },
        })
      ).body.message,
    ).toBe(OPERATOR_RULE);
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: operator.token,
          body: { assignedUserId: operator.id },
        })
      ).body.message,
    ).toBe(OPERATOR_RULE);

    const owner = mockStore().users.find((u) => u.roles.includes("OWNER"))!;
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: admin.token,
          body: { assignedUserId: owner.id },
        })
      ).body.message,
    ).toBe("El responsable debe estar activo y tener rol OPERATOR o ADMIN");
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: admin.token,
          body: {},
        })
      ).body.message,
    ).toEqual(["assignedUserId must be a UUID"]);

    await api("PATCH", `/reservations/${id}/status`, {
      token: admin.token,
      body: { status: "CANCELLED" },
    });
    expect(
      (
        await api("PATCH", `/reservations/${id}/assignee`, {
          token: admin.token,
          body: { assignedUserId: null },
        })
      ).body,
    ).toMatchObject({
      statusCode: 409,
      message: "No se modifica el responsable de una reserva finalizada",
    });
  });
});

describe("borradores de Samanta", () => {
  const key = (n: number) =>
    `clave-prueba-${String(n).padStart(4, "0")}-abcdef`;

  it("ciclo completo: generar → editar → aprobar crea el OUTBOUND con autor e idempotencia", async () => {
    const conversationId = whatsappConversation();
    const source = await lastMessage(admin.token, conversationId);
    const path = `/conversations/${conversationId}/assistant-drafts`;

    expect(
      (
        await api("POST", path, {
          token: operator.token,
          body: { sourceMessageId: source.id },
        })
      ).body.message,
    ).toBe("Idempotency-Key inválida (16 a 80 caracteres)");
    const generated = await api<SamantaDraft>("POST", path, {
      token: operator.token,
      headers: { "idempotency-key": key(1) },
      body: { sourceMessageId: source.id },
    });
    expect(generated.status).toBe(201);
    const draft = generated.body;
    expect(draft).toMatchObject({
      status: "READY",
      revision: 1,
      sourceMessageId: source.id,
      baselineSequence: source.sequence,
      createdById: operator.id,
      intent: "RESERVATION",
      requiresHuman: true,
      model: "mock-samanta",
      promptVersion: "samanta-drafts-v1",
      outboundMessageId: null,
    });
    expect(draft.content).toContain("Sabor Mágico Grill");
    expect(draft.content).not.toContain("Prueba");
    expect(draft.knowledgeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Date.parse(draft.expiresAt) - Date.parse(draft.createdAt)).toBe(
      15 * 60 * 1000,
    );

    // Misma clave y mismos datos: el mismo borrador. Con otro usuario: 409.
    const replay = await api<SamantaDraft>("POST", path, {
      token: operator.token,
      headers: { "idempotency-key": key(1) },
      body: { sourceMessageId: source.id },
    });
    expect(replay).toMatchObject({ status: 201, body: { id: draft.id } });
    expect(
      (
        await api("POST", path, {
          token: admin.token,
          headers: { "idempotency-key": key(1) },
          body: { sourceMessageId: source.id },
        })
      ).body.message,
    ).toBe("Idempotency-Key utilizada con otros datos");

    const edited = await api<SamantaDraft>("PATCH", `${path}/${draft.id}`, {
      token: operator.token,
      body: { revision: 1, content: "¡Hola! ¿Para qué hora sería?" },
    });
    expect(edited.body).toMatchObject({
      revision: 2,
      editedById: operator.id,
      content: "¡Hola! ¿Para qué hora sería?",
      originalContent: draft.content,
      status: "READY",
    });
    expect(
      (
        await api("POST", `${path}/${draft.id}/approve`, {
          token: operator.token,
          body: { revision: 1 },
        })
      ).body,
    ).toMatchObject({
      statusCode: 409,
      message: "El borrador cambió; vuelve a revisarlo",
    });

    const approved = await api<SamantaDraft>(
      "POST",
      `${path}/${draft.id}/approve`,
      { token: operator.token, body: { revision: 2 } },
    );
    expect(approved.status).toBe(202);
    expect(approved.body).toMatchObject({
      status: "APPROVED",
      reviewedById: operator.id,
    });
    const outbound = await lastMessage(operator.token, conversationId);
    expect(outbound).toMatchObject({
      id: approved.body.outboundMessageId,
      direction: "OUTBOUND",
      status: "QUEUED",
      authorUserId: operator.id,
      content: "¡Hola! ¿Para qué hora sería?",
    });

    // Repetir la aprobación no duplica el mensaje; otra persona recibe 409.
    expect(
      (
        await api<SamantaDraft>("POST", `${path}/${draft.id}/approve`, {
          token: operator.token,
          body: { revision: 2 },
        })
      ).status,
    ).toBe(202);
    expect(
      (
        await api("POST", `${path}/${draft.id}/approve`, {
          token: admin.token,
          body: { revision: 2 },
        })
      ).body.message,
    ).toBe("El borrador no está disponible para revisión");
    expect(
      mockStore().messages.filter(
        (m) =>
          m.conversationId === conversationId && m.direction === "OUTBOUND",
      ),
    ).toHaveLength(1);

    const list = await api<SamantaDraftListResponse>("GET", path, {
      token: (await login("ricardo@sabormagico.pe")).token,
    });
    expect(list.body.data.map((d) => d.id)).toEqual([draft.id]);
  });

  it("queda STALE con un mensaje nuevo o en pausa, y rechazar deja constancia", async () => {
    const conversationId = whatsappConversation(
      "¿Cuál es su horario del domingo?",
    );
    const path = `/conversations/${conversationId}/assistant-drafts`;
    const source = await lastMessage(admin.token, conversationId);
    const first = (
      await api<SamantaDraft>("POST", path, {
        token: admin.token,
        headers: { "idempotency-key": key(2) },
        body: { sourceMessageId: source.id },
      })
    ).body;
    expect(first).toMatchObject({
      intent: "GENERAL",
      requiresHuman: false,
      missingFields: [],
    });

    runSimulator({
      accion: "entrante",
      conversationId,
      texto: "¿Y el sábado?",
    });
    const stale = await api<SamantaDraft>("GET", `${path}/${first.id}`, {
      token: admin.token,
    });
    expect(stale.body.status).toBe("STALE");
    expect(
      (
        await api("POST", `${path}/${first.id}/approve`, {
          token: admin.token,
          body: { revision: 1 },
        })
      ).body.message,
    ).toBe("Borrador desactualizado o fallido; genera uno nuevo");
    // El origen ya no es el último mensaje.
    expect(
      (
        await api("POST", path, {
          token: admin.token,
          headers: { "idempotency-key": key(3) },
          body: { sourceMessageId: source.id },
        })
      ).body.message,
    ).toBe(
      "Selecciona el último mensaje entrante de texto (máximo 4096 caracteres)",
    );

    const newest = await lastMessage(admin.token, conversationId);
    const second = (
      await api<SamantaDraft>("POST", path, {
        token: admin.token,
        headers: { "idempotency-key": key(4) },
        body: { sourceMessageId: newest.id },
      })
    ).body;
    const rejected = await api<SamantaDraft>(
      "POST",
      `${path}/${second.id}/reject`,
      { token: admin.token, body: { revision: 1 } },
    );
    expect(rejected.body).toMatchObject({
      status: "REJECTED",
      reviewedById: admin.id,
      outboundMessageId: null,
    });

    const third = (
      await api<SamantaDraft>("POST", path, {
        token: admin.token,
        headers: { "idempotency-key": key(5) },
        body: { sourceMessageId: newest.id },
      })
    ).body;
    await api("PATCH", `/conversations/${conversationId}/assistant`, {
      token: admin.token,
      body: { paused: true },
    });
    const list = (
      await api<SamantaDraftListResponse>("GET", path, { token: admin.token })
    ).body.data;
    expect(list.map((d) => [d.id, d.status])).toEqual([
      [third.id, "STALE"],
      [second.id, "REJECTED"],
      [first.id, "STALE"],
    ]);
    expect(
      (
        await api("POST", path, {
          token: admin.token,
          headers: { "idempotency-key": key(6) },
          body: { sourceMessageId: newest.id },
        })
      ).body.message,
    ).toBe("Samanta está pausada en esta conversación");
  });

  it("también en Messenger, y un OPERATOR no actúa en una conversación asignada a otra persona", async () => {
    const messenger = mockStore().conversations.find(
      (c) => c.channel === "FACEBOOK" && !c.isAssistantPaused,
    )!;
    const lastFb = await lastMessage(admin.token, messenger.id);
    const viaMessenger = await api<{ status?: string; message?: string }>(
      "POST",
      `/conversations/${messenger.id}/assistant-drafts`,
      {
        token: admin.token,
        headers: { "idempotency-key": key(7) },
        body: { sourceMessageId: lastFb.id },
      },
    );
    expect(viaMessenger.status).toBe(201);
    expect(["GENERATING", "READY"]).toContain(viaMessenger.body.status);

    const conversationId = whatsappConversation();
    const source = await lastMessage(admin.token, conversationId);
    await api("PATCH", `/conversations/${conversationId}/assignee`, {
      token: admin.token,
      body: { assignedUserId: admin.id },
    });
    const denied = await api(
      "POST",
      `/conversations/${conversationId}/assistant-drafts`,
      {
        token: operator.token,
        headers: { "idempotency-key": key(8) },
        body: { sourceMessageId: source.id },
      },
    );
    expect(denied).toMatchObject({
      status: 403,
      body: { message: "Conversación asignada a otro operador" },
    });
    // Leer sí puede.
    expect(
      (
        await api("GET", `/conversations/${conversationId}/assistant-drafts`, {
          token: operator.token,
        })
      ).status,
    ).toBe(200);
  });
});

describe("envío por Messenger", () => {
  function messengerConversation(): string {
    return (
      runSimulator({
        accion: "entrante",
        texto: "Hola",
        canal: "FACEBOOK",
        nombre: "Rosa Flores",
      }) as { conversationId: string }
    ).conversationId;
  }
  const send = (conversationId: string, content: string, idem: string) =>
    api<Message>("POST", `/conversations/${conversationId}/messages`, {
      token: admin.token,
      headers: { "idempotency-key": idem },
      body: { type: "TEXT", content },
    });

  it("el cliente de Messenger no tiene teléfono y el tope es de 2000 caracteres (4096 en WhatsApp)", async () => {
    const conversationId = messengerConversation();
    const customer = mockStore().customers.find(
      (c) =>
        c.id ===
        mockStore().conversations.find((x) => x.id === conversationId)!
          .customerId,
    )!;
    expect(customer).toMatchObject({
      firstName: "Rosa Flores",
      lastName: null,
      phone: null,
      email: null,
    });

    const tooLong = await send(
      conversationId,
      "a".repeat(2001),
      "messenger-largo-0001",
    );
    expect(tooLong).toMatchObject({
      status: 400,
      body: { message: "Messenger admite hasta 2000 caracteres por respuesta" },
    });
    expect(
      (await send(conversationId, "a".repeat(2000), "messenger-justo-0001"))
        .status,
    ).toBe(202);

    const whatsapp = whatsappConversation();
    expect(
      (await send(whatsapp, "a".repeat(2001), "whatsapp-largo-00001")).status,
    ).toBe(202);
    // 2100 emojis: 2100 para el DTO, 4200 unidades UTF-16 para el canal.
    expect(
      (await send(whatsapp, "😀".repeat(2100), "whatsapp-emoji-00001")).body,
    ).toMatchObject({
      message: "WhatsApp admite hasta 4096 caracteres por respuesta",
    });
    expect(
      (await send(whatsapp, "a".repeat(4097), "whatsapp-dto-0000001")).body,
    ).toMatchObject({
      message: ["content must be shorter than or equal to 4096 characters"],
    });
  });

  it("ventana de 24 h y destinatario también en Messenger", async () => {
    const conversationId = messengerConversation();
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    for (const m of mockStore().messages)
      if (m.conversationId === conversationId) m.occurredAt = longAgo;
    expect(
      (await send(conversationId, "Hola", "messenger-ventana-01")).body,
    ).toMatchObject({
      statusCode: 409,
      message:
        "Ventana de Messenger cerrada; el cliente debe enviar un nuevo mensaje",
    });

    // Un cliente FACEBOOK sin identidad de Messenger no es destinatario.
    const other = messengerConversation();
    const conv = mockStore().conversations.find((c) => c.id === other)!;
    mockStore().customers.find((c) => c.id === conv.customerId)!.messengerPsid =
      null;
    expect(
      (await send(other, "Hola", "messenger-sin-psid-1")).body,
    ).toMatchObject({
      statusCode: 400,
      message: "Conversación sin destinatario habilitado",
    });
  });

  it("los salientes de Messenger pasan a SENT y DELIVERED, nunca a READ", async () => {
    const conversationId = messengerConversation();
    const sent = await send(
      conversationId,
      "Hola, te atiende el equipo",
      "messenger-estado-001",
    );
    expect(sent.body.status).toBe("QUEUED");
    await new Promise((r) => setTimeout(r, 2800));
    const now = await lastMessage(admin.token, conversationId);
    expect(now).toMatchObject({
      id: sent.body.id,
      status: "DELIVERED",
      providerReadAt: null,
    });
    expect(now.externalMessageId).toMatch(/^mock-mid-/);
  }, 10_000);
});

describe("datos de ejemplo", () => {
  it("todo OUTBOUND tiene autor y cada mensaje de Samanta sale de un borrador APPROVED (MANUAL en WhatsApp o AUTO)", () => {
    const store = mockStore();
    const outbound = store.messages.filter((m) => m.direction === "OUTBOUND");
    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.every((m) => m.authorUserId !== null)).toBe(true);
    const approved = store.drafts.filter((d) => d.status === "APPROVED");
    expect(approved.length).toBeGreaterThan(0);
    for (const d of approved) {
      const m = store.messages.find((x) => x.id === d.outboundMessageId)!;
      expect(m).toMatchObject({
        direction: "OUTBOUND",
        authorUserId: d.reviewedById,
        content: d.content,
      });
      if (d.mode === "MANUAL") expect(m.channel).toBe("WHATSAPP");
      else expect(d).toMatchObject({ createdById: SAMANTA_USER_ID, reviewedById: SAMANTA_USER_ID, idempotencyKey: `auto-${d.sourceMessageId}` });
      expect(
        store.messages.find((x) => x.id === d.sourceMessageId)?.direction,
      ).toBe("INBOUND");
    }
    // Toda conversación trae el motivo de la pausa (null si no está en pausa).
    for (const c of store.conversations) {
      expect(c.assistantPauseReason === null).toBe(!c.isAssistantPaused);
      expect(c.assistantPausedAt === null).toBe(!c.isAssistantPaused);
    }
  });

  it("flujo del propietario: hay solicitudes en cada estado y la conversación del «Propietario»", async () => {
    const store = mockStore();
    const config = store.config!;
    const owner = store.users.find((u) => u.id === config.approvalResponsibleId)!;
    expect(owner).toMatchObject({ isActive: true, roles: ["OWNER"] });
    expect(config.ownerWhatsappNumber).toMatch(/^\+51\d{9}$/);
    // SAMANTA_USER_ID no es un usuario del CRM.
    const users = await api<User[]>("GET", "/users", { token: admin.token });
    expect(users.body.some((u) => u.id === SAMANTA_USER_ID)).toBe(false);

    const statuses = new Set(store.requests.map((r) => r.status));
    for (const s of ["INCOMPLETE_DATA", "READY_TO_SEND", "SENT_TO_OWNER", "WAITING_RESPONSE", "ACCEPTED", "REJECTED", "MODIFICATION_REQUESTED", "CANCELLED"]) {
      expect(statuses.has(s as never)).toBe(true);
    }
    const detail = async (id: string) => (await api<ReservationRequestDetail>("GET", `/reservation-requests/${id}`, { token: admin.token })).body;
    const details = await Promise.all(store.requests.map((r) => detail(r.id)));

    // Aceptada por el propietario: reserva, SYSTEM + SYSTEM + OWNER y aviso entregado.
    const byOwner = details.find((d) => d.status === "ACCEPTED" && d.statusHistory.some((h) => h.actorType === "OWNER"))!;
    expect(byOwner.statusHistory.map((h) => h.actorType)).toEqual(["SYSTEM", "SYSTEM", "OWNER"]);
    expect(byOwner.statusHistory[2]!.actor).toEqual({ id: owner.id, firstName: owner.firstName, lastName: owner.lastName });
    expect(byOwner.reservation).toMatchObject({ status: "CONFIRMED" });
    expect(byOwner.ownerMessage).toMatchObject({ status: "READ" });
    expect(byOwner.customerNoticeMessage).toMatchObject({ status: "DELIVERED", templateName: null, conversationId: byOwner.conversationId });
    // Aceptada en el CRM: entrada USER y sin aviso.
    const inCrm = details.find((d) => d.status === "ACCEPTED" && d.statusHistory.some((h) => h.actorType === "USER"))!;
    expect(inCrm).toMatchObject({ customerNoticeMessage: null, customerNoticeError: null, ownerMessage: null });
    expect(inCrm.reservation).not.toBeNull();
    // Rechazada por el propietario sin poder avisar (Instagram con la ventana cerrada).
    const rejected = details.find((d) => d.status === "REJECTED" && d.customerNoticeError !== null)!;
    expect(rejected).toMatchObject({ customerNoticeError: "WINDOW_CLOSED", customerNoticeMessage: null });
    expect(rejected.statusHistory.at(-1)).toMatchObject({ actorType: "OWNER", reason: "Rechazada por el propietario por WhatsApp." });
    expect(rejected.comments).toContain("CRM: no se avisó al cliente la decisión del propietario (rechazada): ");
    // Cambio propuesto: propuesta en comments y el cliente en SAMANTA_HANDOFF.
    const modification = details.find((d) => d.status === "MODIFICATION_REQUESTED")!;
    expect(modification.comments).toMatch(/CRM: propuesta del propietario \(\d{2}\/\d{2},? \d{2}:\d{2}\): /);
    expect(store.conversations.find((c) => c.id === modification.conversationId)).toMatchObject({ assistantPauseReason: "SAMANTA_HANDOFF" });
    // La plantilla falló: volvió a READY_TO_SEND; es de la web (SM-…).
    const failed = details.find((d) => d.ownerMessage?.status === "FAILED")!;
    expect(failed).toMatchObject({ status: "READY_TO_SEND", sourceChannel: "WEBSITE" });
    expect(failed.externalReference).toMatch(/^SM-\d{8}-[0-9A-F]{6}$/);
    expect(failed.statusHistory.at(-1)!.reason).toContain("No se reenvía: apruébala o recházala a mano.");
    // Las de Samanta están vinculadas y llevan su nota.
    const bySamanta = details.filter((d) => d.conversationId !== null);
    expect(bySamanta.length).toBeGreaterThanOrEqual(4);
    for (const d of bySamanta) expect(d.comments).toContain("CRM: registrada por Samanta con la confirmación del cliente en la conversación.");

    // Borradores AUTO: CREATED y ALREADY_DECIDED (firmado por Samanta).
    expect(store.drafts.some((d) => d.mode === "AUTO" && d.reservationOutcome === "CREATED")).toBe(true);
    const decided = store.drafts.find((d) => d.reservationOutcome === "ALREADY_DECIDED")!;
    expect(store.messages.find((m) => m.id === decided.outboundMessageId)).toMatchObject({ direction: "OUTBOUND", authorUserId: SAMANTA_USER_ID });
    expect(store.drafts.filter((d) => d.reservationOutcome === "PROPOSED").every((d) => d.reservationProposal !== null && d.reservationRequestId !== null)).toBe(true);

    // Contacto «Propietario» con su conversación en pausa MANUAL.
    const contact = store.customers.find((c) => c.firstName === "Propietario")!;
    expect(contact).toMatchObject({ phone: config.ownerWhatsappNumber, sourceChannel: "WHATSAPP" });
    expect(contact.notes).toMatch(/^CRM: número del propietario/);
    const ownerConv = store.conversations.find((c) => c.customerId === contact.id)!;
    expect(ownerConv).toMatchObject({ channel: "WHATSAPP", isAssistantPaused: true, assistantPauseReason: "MANUAL" });
    const ownerMessages = store.messages.filter((m) => m.conversationId === ownerConv.id);
    expect(ownerMessages.filter((m) => m.direction === "OUTBOUND").every((m) => m.authorUserId === SAMANTA_USER_ID)).toBe(true);
    expect(ownerMessages.some((m) => m.direction === "INBOUND")).toBe(true);
    // Reanudarla es posible (como en bk-crm); el siguiente mensaje del propietario la vuelve a pausar.
    const resumed = await api<Conversation>("PATCH", `/conversations/${ownerConv.id}/assistant`, { token: admin.token, body: { paused: false } });
    expect(resumed.body.isAssistantPaused).toBe(false);
    const waiting = store.requests.find((r) => r.status === "WAITING_RESPONSE")!;
    runSimulator({ accion: "dueno", requestId: waiting.id, decision: "ACEPTAR" });
    expect(store.conversations.find((c) => c.id === ownerConv.id)).toMatchObject({ isAssistantPaused: true, assistantPauseReason: "MANUAL" });
  });

  it("hay clientes de Messenger sin teléfono ni correo, con el nombre en firstName y sin nombre", () => {
    const messenger = mockStore().customers.filter(
      (c) =>
        c.sourceChannel === "FACEBOOK" &&
        c.messengerPsid &&
        !c.phone &&
        !c.email,
    );
    expect(messenger.some((c) => c.firstName && c.lastName === null)).toBe(
      true,
    );
    expect(
      messenger.some((c) => c.firstName === null && c.lastName === null),
    ).toBe(true);
  });
});
