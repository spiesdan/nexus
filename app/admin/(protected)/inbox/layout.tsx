import type { ReactNode } from "react";

import { AdminInboxShell } from "./_components/AdminInboxShell";

/**
 * 3 colunas no desktop: lista (360 px) | fio (flex) | painel (320 px, ≥ xl).
 * No celular é uma coluna por vez — a regra vive em `AdminInboxShell`.
 */
export default function AdminInboxLayout({ children }: { children: ReactNode }) {
  return <AdminInboxShell>{children}</AdminInboxShell>;
}
