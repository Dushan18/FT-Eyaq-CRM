import type { ReactNode } from "react";
import { CrmShell } from "@/components/shell/crm-shell";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <CrmShell>{children}</CrmShell>;
}
