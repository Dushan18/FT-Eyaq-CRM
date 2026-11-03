// Uso: node shot.mjs <ruta> <archivo.png> [email] [ancho] [alto] [esperaMs]
import { chromium } from "playwright";

const [, , route = "/solicitudes", out = "shot.png", email = "frank@eyaqsystems.com", w = "1440", h = "900", wait = "1500"] = process.argv;
const base = "http://localhost:5173";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, locale: "es-PE", timezoneId: "America/Lima" });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const res = await page.request.post(`${base}/api/auth/login`, { data: { email, password: "demo1234" } });
if (!res.ok()) throw new Error(`login ${res.status()}`);
await page.goto(`${base}${route}`, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: false });
console.log(JSON.stringify({ url: page.url(), errors: errors.slice(0, 10) }));
await browser.close();
