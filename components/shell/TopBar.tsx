"use client";
import { NotificationCenter } from "./NotificationCenter";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";

export function TopBar() {
  return (
    <>
      {/* `shrink-0`: a casca agora tem altura fixa (`h-screen`) e o `main`
          rola por dentro — sem isso a barra seria espremida quando o espaço
          aperta. O `sticky` fica como segunda rede nas páginas que ainda rolam
          no body (banners acima da casca). */}
      {/* Fundo sólido, sem `backdrop-blur`: um filtro de fundo num elemento
          `sticky` dentro de uma casca com rolagem própria é a combinação que,
          em Chrome/Windows, deixa o conteúdo sem pintar até uma interação
          forçar o repaint. A barra é opaca de qualquer forma, então o blur não
          tinha o que mostrar. */}
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 md:gap-4 md:px-6 print:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <MobileSidebar />
          <TenantSwitcher />
        </div>
        <div className="flex min-w-0 flex-1 justify-center md:max-w-md">
          <SearchTrigger />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <NotificationCenter />
          <UserMenu />
        </div>
      </header>
    </>
  );
}
