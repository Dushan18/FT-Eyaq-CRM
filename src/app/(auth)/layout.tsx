import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-4">
      <div className="w-full max-w-100 rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(20,27,45,.06)] sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-9.5 shrink-0 place-items-center rounded-full"
            style={{ background: "conic-gradient(#f26a1b 0 30%,#1f9d55 0 55%,#2b55e6 0 100%)" }}
          >
            <div className="size-4 rounded-full bg-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-ink">CRM Inteligente</div>
            <div className="text-xs text-subtle">EYAQ Systems</div>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
