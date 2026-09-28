"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AssistenteAvatar } from "./AssistenteAvatar";
import { AssistenteChat, type ContextoDaPagina } from "./AssistenteChat";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Orquestra avatar + chat no canto inferior direito da ÁREA LOGADA.
 *
 * Montado no `AppShell` (só `/app/*`), então login, onboarding e landing
 * nunca o veem. `Esc` fecha o chat; o estado vive aqui para o avatar reagir
 * visualmente (boca aberta) enquanto o chat está aberto.
 *
 * Copilot §33: deriva de onde chamam (pathname; contato quando a URL
 * carrega um UUID de contato) e entrega ao chat — o resumo real cola
 * no servidor, nunca dado do client.
 */
export function AssistenteFlutuante() {
  const [aberto, setAberto] = useState(false);
  const alternar = useCallback(() => setAberto((v) => !v), []);
  const fechar = useCallback(() => setAberto(false), []);
  const pathname = usePathname();

  const contexto: ContextoDaPagina = useMemo(() => {
    const partes = (pathname ?? "").split("/").filter(Boolean);
    // /app/contacts/<uuid> — o único id de contato que a URL carrega.
    const contato =
      partes[0] === "app" && partes[1] === "contacts" && partes[2] && UUID.test(partes[2])
        ? partes[2]
        : undefined;
    return contato ? { pagina: pathname ?? "/app", contact_id: contato } : { pagina: pathname ?? "/app" };
  }, [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto, fechar]);

  // `bottom-24 md:bottom-5`: o dock mobile é fixo e cobriria o avatar.
  return (
    <div
      className="fixed right-5 bottom-24 z-40 flex flex-col items-end gap-3 md:bottom-5 print:hidden"
      data-assistente="flutuante"
    >
      <AssistenteChat aberto={aberto} onFechar={fechar} contexto={contexto} />
      <AssistenteAvatar aberto={aberto} onToggle={alternar} />
    </div>
  );
}
