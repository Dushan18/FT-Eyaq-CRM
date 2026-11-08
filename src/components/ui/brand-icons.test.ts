import { siFacebook, siInstagram, siWhatsapp } from "simple-icons";
import { describe, expect, it } from "vitest";
import { BRAND_ICONS } from "./brand-icons";

describe("logotipos copiados de Simple Icons", () => {
  it.each([
    ["WHATSAPP", siWhatsapp],
    ["FACEBOOK", siFacebook],
    ["INSTAGRAM", siInstagram],
  ] as const)("%s coincide con la versión instalada de simple-icons", (key, icon) => {
    expect(BRAND_ICONS[key]).toEqual({ title: icon.title, hex: `#${icon.hex}`, path: icon.path });
  });
});
