import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { isFutureIso, isoToZonedInputs, zonedInputsToIso } from "@/lib/format/date-inputs";

describe("fecha y hora del formulario en la zona del restaurante", () => {
  it("convierte día y hora de Lima a un instante con zona", () => {
    const iso = zonedInputsToIso({ day: "2026-11-07", time: "20:00" }, "America/Lima");
    expect(iso).not.toBeNull();
    expect(new Date(iso!).toISOString()).toBe("2026-11-08T01:00:00.000Z");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  });

  it("rechaza campos vacíos, mal formados o fechas que no existen", () => {
    expect(zonedInputsToIso({ day: "", time: "20:00" }, "America/Lima")).toBeNull();
    expect(zonedInputsToIso({ day: "2026-11-07", time: "8pm" }, "America/Lima")).toBeNull();
    expect(zonedInputsToIso({ day: "2026-02-30", time: "10:00" }, "America/Lima")).toBeNull();
  });

  it("muestra un instante UTC como día y hora de la zona del restaurante", () => {
    expect(isoToZonedInputs("2026-11-08T01:00:00.000Z", "America/Lima")).toEqual({ day: "2026-11-07", time: "20:00" });
    expect(isoToZonedInputs(null, "America/Lima")).toEqual({ day: "", time: "" });
  });

  it("isFutureIso compara con el reloj indicado", () => {
    expect(isFutureIso("2026-11-08T01:00:00.000Z", Date.parse("2026-11-08T00:59:59.000Z"))).toBe(true);
    expect(isFutureIso("2026-11-08T01:00:00.000Z", Date.parse("2026-11-08T01:00:00.000Z"))).toBe(false);
    expect(isFutureIso(null)).toBe(false);
  });
});

function Harness({ onClose, busy = false }: { onClose: () => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <Dialog
        open={open}
        busy={busy}
        title="Nueva reserva"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        footer={<button type="button">Guardar</button>}
      >
        <input aria-label="Personas" data-autofocus />
      </Dialog>
    </>
  );
}

describe("diálogo modal", () => {
  it("enfoca el campo marcado, cierra con Escape y devuelve el foco al botón que lo abrió", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Nueva reserva" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Personas")).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("mientras guarda no se cierra con Escape ni con el botón Cerrar", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} busy />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sin campo marcado enfoca el primer campo del contenido, no el botón Cerrar", () => {
    render(
      <Dialog open title="Editar" onClose={vi.fn()}>
        <input aria-label="Nombre" />
      </Dialog>,
    );
    expect(screen.getByLabelText("Nombre")).toHaveFocus();
  });

  it("Tab desde el último elemento vuelve al primero", () => {
    render(<Harness onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog");
    const save = screen.getByRole("button", { name: "Guardar" });
    save.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
  });
});
