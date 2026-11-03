import { describe, expect, it } from "vitest";
import { settingsTabFromPath, settingsTabLink, visibleSettingsTabs } from "./settings-tabs";

describe("pestañas de Ajustes", () => {
  it("reconoce la pestaña de la ruta", () => {
    expect(settingsTabFromPath("/ajustes/horarios")).toBe("horarios");
    expect(settingsTabFromPath("/ajustes/servicios/nuevo")).toBe("servicios");
    expect(settingsTabFromPath("/ajustes")).toBeNull();
    expect(settingsTabFromPath("/ajustes/otra")).toBeNull();
    expect(settingsTabFromPath("/clientes/empresa")).toBeNull();
  });

  it("lista las pestañas del mockup en orden y Usuarios solo para ADMIN", () => {
    expect(visibleSettingsTabs(["ADMIN"]).map((t) => t.label)).toEqual([
      "Empresa",
      "Horarios",
      "Servicios",
      "Políticas",
      "Samanta",
      "Usuarios",
    ]);
    expect(visibleSettingsTabs(["OWNER"]).map((t) => t.key)).not.toContain("usuarios");
    expect(visibleSettingsTabs(["OPERATOR"])).toHaveLength(5);
    expect(visibleSettingsTabs(["OWNER", "ADMIN"])).toHaveLength(6);
    expect(visibleSettingsTabs(["SUPPORT"])).toEqual([]);
  });

  it("cada pestaña tiene su ruta", () => {
    expect(settingsTabLink("politicas")).toEqual({ key: "politicas", label: "Políticas", href: "/ajustes/politicas" });
  });
});
