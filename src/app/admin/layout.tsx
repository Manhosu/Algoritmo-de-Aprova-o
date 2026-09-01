import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/server/auth/guards";

/**
 * A casca do painel administrativo.
 *
 * ⚠️ O `requireAdmin()` AQUI NÃO SUBSTITUI o de cada página.
 *
 * Um layout do App Router não é atravessado a cada navegação: em transições de
 * cliente o Next reaproveita o layout já montado e busca só o segmento novo.
 * Guardar apenas aqui deixaria uma janela em que a página renderiza sem que a
 * permissão tenha sido conferida naquela requisição. Este `requireAdmin` existe
 * para que a NAVEGAÇÃO não apareça a quem não deve vê-la; a guarda de verdade
 * continua sendo a de cada `page.tsx`, e o `proxy.ts` fecha por cima das duas.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-dvh bg-background">
      <AdminNav />
      {children}
    </div>
  );
}
