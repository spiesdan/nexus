import { ChatCircle } from "@/lib/ui/icons";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export default async function AdminInboxIndexPage() {
  const { user } = await requirePlatformAdmin();
  const idioma = normalizarIdioma((user.user_metadata?.locale as string | undefined) ?? null);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      {/* Nível 1 da página. O layout do inbox é 3 colunas (lista | conversa |
          painel) e um cabeçalho visual aqui quebraria a composição; `sr-only`
          dá o ponto de pouso que o leitor de tela procura — mesma solução da
          V-02 em `/app/inbox`. Medido em 16/11: esta era a ÚNICA tela de
          `/admin/**` com `h1: []`.

          `relative` no pai não é decoração: `sr-only` é `position: absolute` e,
          sem ancestral posicionado, escapa do `overflow-hidden` do layout e
          estica o documento — a primeira versão deste `<h1>` criou **25 px de
          overflow horizontal a 390 px**. Com o pai posicionado, o absoluto é
          clipado junto. */}
      <h1 className="sr-only">{traduzir("Inbox da plataforma", idioma)}</h1>
      <ChatCircle size={40} weight="duotone" className="opacity-40" aria-hidden />
      <p className="text-sm font-medium">
        {traduzir("Selecione uma conversa para visualizar", idioma)}
      </p>
      <p className="max-w-xs text-xs opacity-70">
        {traduzir(
          "Modo somente-leitura. Use “Impersonate” para responder como atendente do tenant.",
          idioma,
        )}
      </p>
    </div>
  );
}
