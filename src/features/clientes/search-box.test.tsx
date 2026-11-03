import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./search-box";

/** `value` hace de la URL: cada `rerender` simula un cambio de la query. */
function setup(initial = "") {
  const onCommit = vi.fn();
  const view = render(<SearchBox value={initial} onCommit={onCommit} aria-label="Buscar" />);
  const input = screen.getByRole("searchbox", { name: "Buscar" }) as HTMLInputElement;
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const setUrl = (value: string) => view.rerender(<SearchBox value={value} onCommit={onCommit} aria-label="Buscar" />);
  const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  return { input, onCommit, type, setUrl, wait };
}

describe("SearchBox", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("espera 300 ms sin teclear y confirma el texto recortado una sola vez", () => {
    const { onCommit, type, wait } = setup();
    type("  fer");
    wait(200);
    type("  fern ");
    wait(299);
    expect(onCommit).not.toHaveBeenCalled();
    wait(1);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("fern");
  });

  it("Enter confirma de inmediato sin repetir después", () => {
    const { input, onCommit, type, wait } = setup();
    type("ana");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("ana");
    wait(1000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("no confirma si el texto recortado ya es el de la URL", () => {
    const { onCommit, type, wait } = setup("fer");
    type("fer  ");
    wait(1000);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("el eco de su propia búsqueda no pisa lo que se sigue escribiendo", () => {
    const { input, onCommit, type, setUrl, wait } = setup();
    type("fer");
    wait(300);
    expect(onCommit).toHaveBeenLastCalledWith("fer");
    type("fern");
    setUrl("fer"); // llega a la URL la búsqueda anterior
    expect(input.value).toBe("fern");
    wait(300);
    expect(onCommit).toHaveBeenLastCalledWith("fern");
    setUrl("fern");
    expect(input.value).toBe("fern");
    wait(1000);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("adopta un cambio de la URL hecho desde fuera y no vuelve a escribir el valor viejo", () => {
    const { input, onCommit, setUrl, wait } = setup("fer");
    setUrl(""); // p. ej., el enlace «Clientes» de la navegación o el botón Atrás
    expect(input.value).toBe("");
    setUrl("Paola");
    expect(input.value).toBe("Paola");
    wait(1000);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("descarta una búsqueda en curso si la URL cambia a otra cosa", () => {
    const { input, onCommit, type, setUrl, wait } = setup();
    type("abc");
    wait(300);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("abc");
    setUrl("xyz"); // otra navegación ganó antes de que la URL reflejara "abc"
    expect(input.value).toBe("xyz");
    wait(1000);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
