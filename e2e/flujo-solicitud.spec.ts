/**
 * Flujo central (reglas 1 a 8) de punta a punta en el navegador. El simulador hace de cliente, de
 * Samanta y del dueño; todo lo demás es la interfaz real contra el backend simulado.
 */
import { expect, test, type Page } from "@playwright/test";
import { limaDay, loginAs, simulate, uniqueName, USERS } from "./helpers";

const chat = (page: Page) => page.getByRole("log", { name: "Mensajes" });
const sidePanel = (page: Page) => page.getByRole("complementary", { name: "Datos del cliente" });

test("mensaje → solicitud esperando al dueño → el dueño acepta → reserva en el calendario", async ({ page, request }) => {
  const name = uniqueName("Elena Prueba");
  await loginAs(page, USERS.admin);

  // 1. Llega un mensaje por WhatsApp y aparece en la Bandeja.
  const { conversationId } = await simulate<{ conversationId: string }>(request, {
    accion: "entrante",
    texto: "Hola, quiero reservar para 4 personas",
    canal: "WHATSAPP",
    nombre: name,
  });
  await page.goto(`/bandeja?c=${conversationId}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(sidePanel(page).getByText("Aún no hay solicitud.", { exact: false })).toBeVisible();

  // 2–3. Samanta confirma los datos y crea la solicitud: queda esperando al dueño.
  const day = limaDay(2);
  const { requestId, code } = await simulate<{ requestId: string; code: string }>(request, {
    accion: "solicitud",
    conversationId,
    fecha: `${day}T20:00:00-05:00`,
    personas: 4,
    notas: "Terraza",
  });
  await page.reload();
  await expect(sidePanel(page).getByText(code)).toBeVisible();
  await expect(sidePanel(page).getByText("Esperando al dueño")).toBeVisible();
  await expect(chat(page).getByText("envié tu solicitud", { exact: false })).toBeVisible();

  await page.goto("/solicitudes?tab=esperando");
  await expect(page.getByText(code)).toBeVisible();

  // 4–5. El dueño responde ACEPTAR por WhatsApp: solo entonces entra al calendario.
  await simulate(request, { accion: "dueno", requestId, decision: "ACEPTAR" });
  await page.goto(`/calendario?vista=dia&fecha=${day}`);
  await expect(page.getByText(name).first()).toBeVisible();

  await page.goto(`/bandeja?c=${conversationId}`);
  await expect(sidePanel(page).getByText("Aceptada por el dueño")).toBeVisible();
  await expect(chat(page).getByText("¡Confirmado!", { exact: false })).toBeVisible();
});

test("si el dueño rechaza, no entra al calendario y Samanta propone otra fecha u hora", async ({ page, request }) => {
  const name = uniqueName("Raúl Rechazo");
  await loginAs(page, USERS.admin);
  const { conversationId } = await simulate<{ conversationId: string }>(request, { accion: "entrante", texto: "Mesa para 2", nombre: name });
  const day = limaDay(3);
  const { requestId, code } = await simulate<{ requestId: string; code: string }>(request, {
    accion: "solicitud",
    conversationId,
    fecha: `${day}T21:00:00-05:00`,
    personas: 2,
  });
  await simulate(request, { accion: "dueno", requestId, decision: "RECHAZAR" });

  await page.goto("/solicitudes?tab=rechazadas");
  await expect(page.getByText(code)).toBeVisible();

  await page.goto(`/calendario?vista=dia&fecha=${day}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible();
  // La ausencia solo vale si el calendario terminó de cargar sin errores.
  await expect(page.getByText(/Cargando/)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(name)).toHaveCount(0);

  await page.goto(`/bandeja?c=${conversationId}`);
  await expect(chat(page).getByText("otra fecha u hora", { exact: false })).toBeVisible();
  await expect(sidePanel(page).getByText("Rechazada por el dueño")).toBeVisible();
});

test("un grupo de más de 20 personas pasa a una persona (Samanta queda en pausa)", async ({ page, request }) => {
  const name = uniqueName("Empresa Grande");
  await loginAs(page, USERS.admin);
  const { conversationId } = await simulate<{ conversationId: string }>(request, { accion: "entrante", texto: "Cena para 40", nombre: name });
  const result = await simulate<{ transferidaAHumano?: boolean }>(request, {
    accion: "solicitud",
    conversationId,
    fecha: `${limaDay(9)}T20:00:00-05:00`,
    personas: 40,
  });
  expect(result.transferidaAHumano).toBe(true);

  await page.goto(`/bandeja?c=${conversationId}`);
  await expect(page.getByText("En pausa", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reanudar" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(name) }).getByText("Requiere humano")).toBeVisible();
});

test("el operador que escribe toma el control y luego la devuelve a Samanta", async ({ page, request }) => {
  const name = uniqueName("Toma Control");
  const { conversationId } = await simulate<{ conversationId: string }>(request, { accion: "entrante", texto: "¿Tienen mesa hoy?", nombre: name });
  await loginAs(page, USERS.operator);
  await page.goto(`/bandeja?c=${conversationId}`);
  await expect(page.getByText("Samanta está respondiendo. Si escribes, la conversación pasa a tu cargo.")).toBeVisible();

  await page.getByRole("textbox", { name: "Mensaje" }).fill("Hola, te atiende Camila.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByRole("button", { name: "Devolver a Samanta" })).toBeVisible();
  await expect(chat(page).getByText("Hola, te atiende Camila.")).toBeVisible();
  await expect(chat(page).getByText(/Tú · \d{2}:\d{2}/)).toBeVisible();

  await page.getByRole("button", { name: "Devolver a Samanta" }).click();
  await expect(page.getByRole("button", { name: "Pasar a humano" })).toBeVisible();
  await expect(page.getByText("Samanta está respondiendo. Si escribes, la conversación pasa a tu cargo.")).toBeVisible();
});
