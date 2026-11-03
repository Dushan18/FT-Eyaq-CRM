/** Cada vista carga sin errores y cada rol ve solo lo que el backend le permite. */
import { expect, test } from "@playwright/test";
import { collectConsoleErrors, loginAs, PASSWORD, USERS } from "./helpers";

const VIEWS = [
  "/bandeja",
  "/solicitudes",
  "/calendario",
  "/estadisticas",
  "/clientes",
  "/ajustes/empresa",
  "/ajustes/horarios",
  "/ajustes/servicios",
  "/ajustes/politicas",
  "/ajustes/samanta",
  "/ajustes/usuarios",
];

for (const path of VIEWS) {
  test(`${path} carga sin errores para el administrador`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await loginAs(page, USERS.admin);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
    // Ningún "no se pudo cargar": todas las fuentes respondieron.
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("sin sesión, una vista lleva al inicio de sesión y vuelve a ella al ingresar", async ({ page }) => {
  await page.goto("/calendario");
  await expect(page).toHaveURL(/\/login\?next=%2Fcalendario/);
  await page.getByLabel("Correo").fill(USERS.operator);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/calendario/);
  await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible();

  await page.getByRole("button", { name: /Cuenta de/ }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/bandeja");
  await expect(page).toHaveURL(/\/login/);
});

test("una contraseña incorrecta muestra un error claro", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(USERS.admin);
  await page.getByLabel("Contraseña").fill("incorrecta123");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
});

test("el propietario lee la Bandeja sin poder responder ni cambiar el modo", async ({ page }) => {
  await loginAs(page, USERS.owner);
  await page.goto("/bandeja");
  await expect(page.getByRole("heading", { name: "Bandeja" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensaje" })).toBeDisabled();
  await expect(page.getByText("Tu rol puede leer esta conversación, pero no responder.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pasar a humano" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pausar" })).toHaveCount(0);
});

test("el propietario no entra a Usuarios", async ({ page }) => {
  await loginAs(page, USERS.owner);
  await page.goto("/ajustes/usuarios");
  await expect(page.getByText(/Sin acceso/)).toBeVisible();
});

test("Soporte EYAQ no tiene vistas de negocio", async ({ page }) => {
  await loginAs(page, USERS.support);
  await page.goto("/bandeja");
  await expect(page.getByText("Tu rol no tiene vistas habilitadas")).toBeVisible();
});
