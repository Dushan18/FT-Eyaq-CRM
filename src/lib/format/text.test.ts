import { describe, expect, it } from "vitest";
import { initials } from "./text";

describe("initials", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(initials("Ana Quispe")).toBe("AQ");
    expect(initials("María Fernández")).toBe("MF");
    expect(initials("Grupo Empresarial Tauro")).toBe("GE");
    expect(initials("  carlos  ")).toBe("C");
  });

  it("ignora la arroba inicial de un usuario de Instagram", () => {
    expect(initials("@dushan1812")).toBe("D");
    expect(initials("@ana.q")).toBe("A");
    // Solo la del inicio de cada palabra; una palabra que es solo «@» no cuenta.
    expect(initials("@ ana")).toBe("A");
    expect(initials("ana@correo.pe")).toBe("A");
  });

  it("sin letras ni números devuelve «?»", () => {
    expect(initials(null)).toBe("?");
    expect(initials("")).toBe("?");
    expect(initials("@")).toBe("?");
    expect(initials("+ —")).toBe("?");
  });
});
