import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONTACT_CHANNELS } from "@/lib/api/types";
import { BRAND_ICONS } from "./brand-icons";
import { ChannelDot } from "./channel-icon";
import { Avatar } from "./primitives";

describe("indicador de canal", () => {
  it.each(CONTACT_CHANNELS)("%s tiene nombre accesible y un icono", (channel) => {
    const { container } = render(<ChannelDot channel={channel} />);
    const dot = container.querySelector(`[data-channel="${channel}"]`);
    expect(dot).toHaveAttribute("role", "img");
    expect(dot?.querySelector("svg")).not.toBeNull();
  });

  it("usa el logotipo oficial en WhatsApp, Facebook e Instagram", () => {
    render(
      <>
        <ChannelDot channel="WHATSAPP" />
        <ChannelDot channel="FACEBOOK" />
        <ChannelDot channel="INSTAGRAM" />
      </>,
    );
    for (const [name, key] of [["WhatsApp", "WHATSAPP"], ["Facebook", "FACEBOOK"], ["Instagram", "INSTAGRAM"]] as const) {
      const path = screen.getByRole("img", { name }).querySelector("path");
      expect(path).toHaveAttribute("d", BRAND_ICONS[key].path);
    }
  });

  it("sin canal muestra «Otro»", () => {
    render(<ChannelDot channel={null} />);
    expect(screen.getByRole("img", { name: "Otro" })).toBeInTheDocument();
  });

  it("en el avatar va con aro blanco y un poco más grande", () => {
    const { container } = render(<Avatar text="DW" size={40} badge="INSTAGRAM" />);
    const badge = container.querySelector('[data-channel="INSTAGRAM"]');
    expect(badge).toHaveClass("border-2", "border-white");
    expect(badge).toHaveStyle({ width: "18px", height: "18px" });
  });
});
