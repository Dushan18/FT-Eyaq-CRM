/** Rutas simuladas de clientes e intereses (Parte 03). */
import { CUSTOMER_STATUSES } from "@/lib/api/types";
import {
  BodyCheck,
  CHANNELS,
  READERS,
  WRITERS,
  customerMatches,
  enumParam,
  fail,
  json,
  pageParams,
  paginate,
  readQuery,
  requireSomeField,
  searchParam,
  uuidParam,
  type Route,
} from "../http";
import { checkPhone, isSupportedCountry, normalizedPhone } from "../phone";
import { iso, uuid, type MockCustomer, type MockStore } from "../store";
import { customerDetailOut, customerOut, interestOut } from "../views";

const CONTACT_REQUIRED = "Proporciona un email válido o un teléfono internacional; para un número nacional indica phoneCountry";
const DUPLICATE_CONTACT = "Ya existe un cliente con ese teléfono o correo";

function findCustomer(store: MockStore, id: string, message = "Cliente no encontrado"): MockCustomer {
  const c = store.customers.find((x) => x.id === id);
  if (!c) fail(404, message);
  return c;
}

/** Campos del DTO de alta y edición. undefined = no se envió; null = borrar. */
function readCustomerBody(body: Record<string, unknown>, mode: "create" | "update") {
  const check = new BodyCheck();
  check.only(body, ["sourceChannel", "firstName", "lastName", "phone", "phoneCountry", "email", "notes"]);
  const sourceChannel = check.enumOf("sourceChannel", body.sourceChannel, CHANNELS, mode === "create" ? { required: true } : { nullable: false });
  const firstName = check.text("firstName", body.firstName, 100);
  const lastName = check.text("lastName", body.lastName, 100);
  const phone = check.text("phone", body.phone, 80);
  let phoneCountry: string | null | undefined;
  if (body.phoneCountry === null) phoneCountry = null;
  else if (body.phoneCountry !== undefined) {
    if (typeof body.phoneCountry !== "string") check.add("phoneCountry must match /^[A-Z]{2}$/ regular expression", "phoneCountry must be a string");
    else {
      const t = body.phoneCountry.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(t)) phoneCountry = t;
      else check.add("phoneCountry must match /^[A-Z]{2}$/ regular expression");
    }
  }
  const email = check.email("email", body.email);
  const notes = check.text("notes", body.notes, 5000);
  check.done();
  return { sourceChannel, firstName, lastName, phone, phoneCountry, email, notes };
}

/** Reglas de contacto en el orden de bk-crm. Devuelve el teléfono normalizado (E.164) o null. */
function checkContact(phone: string | null, country: string | null, validatePhone: boolean): string | null {
  if (country !== null && !isSupportedCountry(country)) fail(400, "phoneCountry debe ser un país ISO válido");
  if (country !== null && phone === null) fail(400, "phoneCountry requiere un teléfono");
  if (phone === null) return null;
  if (!validatePhone) return normalizedPhone(phone, country);
  const r = checkPhone(phone, country);
  if (!r.ok) fail(400, r.message);
  return r.e164;
}

function assertUniqueContact(store: MockStore, e164: string | null, email: string | null, selfId: string | null) {
  const clash = store.customers.some(
    (c) => c.id !== selfId && ((e164 !== null && normalizedPhone(c.phone, c.phoneCountry) === e164) || (email !== null && c.email === email)),
  );
  if (clash) fail(409, DUPLICATE_CONTACT);
}

export const customerRoutes: Route[] = [
  {
    method: "GET",
    pattern: "/customers",
    access: READERS,
    handler: (ctx) => {
      readQuery(ctx, ["page", "limit", "search", "status", "channel", "commercialItemId"]);
      const { page, limit } = pageParams(ctx, 20);
      const search = searchParam(ctx);
      const status = enumParam(ctx, "status", CUSTOMER_STATUSES);
      const channel = enumParam(ctx, "channel", CHANNELS);
      const itemId = uuidParam(ctx, "commercialItemId");
      const rows = ctx.store.customers
        .filter(
          (c) =>
            (!search || customerMatches(c, search)) &&
            (!status || c.status === status) &&
            (!channel || c.sourceChannel === channel) &&
            (!itemId || c.interests.some((i) => i.commercialItemId === itemId)),
        )
        .sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt) || a.id.localeCompare(b.id))
        .map(customerOut);
      return json(200, paginate(rows, page, limit));
    },
  },
  {
    method: "POST",
    pattern: "/customers",
    access: WRITERS,
    handler: (ctx) => {
      const input = readCustomerBody(ctx.body, "create");
      const phone = input.phone ?? null;
      const country = input.phoneCountry ?? null;
      const email = input.email ?? null;
      const e164 = checkContact(phone, country, true);
      if (!email && !e164) fail(400, CONTACT_REQUIRED);
      assertUniqueContact(ctx.store, e164, email, null);
      const now = iso(Date.now());
      const customer: MockCustomer = {
        id: uuid(),
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        phone,
        phoneCountry: country,
        email,
        sourceChannel: input.sourceChannel!,
        status: "NEW",
        firstContactAt: now,
        lastContactAt: now,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
        interests: [],
        messengerPsid: null,
      };
      ctx.store.customers.push(customer);
      return json(201, customerOut(customer));
    },
  },
  {
    method: "GET",
    pattern: "/customers/:id",
    access: READERS,
    handler: (ctx) => json(200, customerDetailOut(ctx.store, findCustomer(ctx.store, ctx.params.id!))),
  },
  {
    method: "PATCH",
    pattern: "/customers/:id",
    access: WRITERS,
    handler: (ctx) => {
      const input = readCustomerBody(ctx.body, "update");
      requireSomeField(ctx.body, "Debes proporcionar al menos un campo para actualizar");
      const c = findCustomer(ctx.store, ctx.params.id!);
      const messenger = Boolean(c.messengerPsid);
      if (messenger && input.sourceChannel && input.sourceChannel !== "FACEBOOK") fail(400, "No se puede cambiar el canal de una identidad de Messenger");

      // phoneCountry no se hereda: si llega phone sin país, el país queda en null.
      const phoneSent = input.phone !== undefined;
      const countrySent = input.phoneCountry !== undefined;
      const phone = phoneSent ? input.phone! : c.phone;
      let country = phoneSent ? (input.phoneCountry ?? null) : countrySent ? input.phoneCountry! : c.phoneCountry;
      const clearingPhoneWithCountry = phoneSent && phone === null && country !== null;
      if (clearingPhoneWithCountry) country = null;
      const email = input.email !== undefined ? input.email : c.email;

      if (country !== null && !isSupportedCountry(country)) fail(400, "phoneCountry debe ser un país ISO válido");
      if (!phoneSent && countrySent && country !== null && phone === null) fail(400, "phoneCountry requiere un teléfono");
      const e164 = checkContact(phone, country, phoneSent || countrySent);
      if (!messenger && !email && !e164) fail(400, CONTACT_REQUIRED);
      if (clearingPhoneWithCountry) fail(400, "phoneCountry requiere un teléfono");
      assertUniqueContact(ctx.store, e164, email, c.id);

      if (input.sourceChannel) c.sourceChannel = input.sourceChannel;
      if (input.firstName !== undefined) c.firstName = input.firstName;
      if (input.lastName !== undefined) c.lastName = input.lastName;
      if (input.notes !== undefined) c.notes = input.notes;
      c.phone = phone;
      c.phoneCountry = phone === null ? null : country;
      c.email = email;
      c.updatedAt = iso(Date.now());
      return json(200, customerOut(c));
    },
  },
  {
    method: "PATCH",
    pattern: "/customers/:id/status",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["status"]);
      const status = check.enumOf("status", ctx.body.status, CUSTOMER_STATUSES, { required: true });
      check.done();
      const c = findCustomer(ctx.store, ctx.params.id!, "Cliente o interés no encontrado");
      c.status = status!;
      c.updatedAt = iso(Date.now());
      return json(200, customerOut(c));
    },
  },
  {
    method: "POST",
    pattern: "/customers/:id/interests",
    access: WRITERS,
    handler: (ctx) => {
      const check = new BodyCheck();
      check.only(ctx.body, ["commercialItemId", "notes"]);
      const itemId = check.uuid("commercialItemId", ctx.body.commercialItemId, { required: true });
      const notes = check.text("notes", ctx.body.notes, 5000);
      check.done();
      const c = findCustomer(ctx.store, ctx.params.id!);
      // Se aceptan elementos inactivos o sin aprobar.
      if (!ctx.store.items.some((i) => i.id === itemId)) fail(404, "Elemento comercial no encontrado");
      const now = iso(Date.now());
      let interest = c.interests.find((i) => i.commercialItemId === itemId);
      if (interest) {
        interest.lastInterestedAt = now;
        if (notes !== undefined) interest.notes = notes;
      } else {
        interest = { id: uuid(), commercialItemId: itemId!, firstInterestedAt: now, lastInterestedAt: now, notes: notes ?? null };
        c.interests.push(interest);
      }
      // Registrar una consulta cuenta como contacto.
      if (now > c.lastContactAt) c.lastContactAt = now;
      c.updatedAt = now;
      return json(200, interestOut(ctx.store, interest));
    },
  },
  {
    method: "DELETE",
    pattern: "/customers/:id/interests/:commercialItemId",
    access: WRITERS,
    handler: (ctx) => {
      const c = findCustomer(ctx.store, ctx.params.id!);
      const index = c.interests.findIndex((i) => i.commercialItemId === ctx.params.commercialItemId);
      if (index < 0) fail(404, "Interés no encontrado");
      c.interests.splice(index, 1);
      return json(204, undefined);
    },
  },
];
