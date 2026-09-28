"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { MagnifyingGlass } from "@/lib/ui/icons";
import {
  buscarEntidades,
  MINIMO_DE_LETRAS,
  telasQueCasam,
  type ItemDeBusca,
  type SecaoDeBusca,
} from "@/lib/busca/global";
import { NAV_GROUPS, searchable, type NavDestination } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

/**
 * Paleta ⌘K — a porta da Global Search (§17).
 *
 * Sem `cmdk`: o projeto já tem Dialog e Input, e uma lista filtrada com setas e
 * Enter são poucas linhas. Uma dependência mais para isso seria peso sem ganho.
 *
 * Varre NAVEGAÇÃO (destinos do registry) + as seis entidades do
 * `lib/busca/global` — o mesmo motor da página `/app/busca`, para os dois
 * lugares nunca divergirem sobre o que o termo achou.
 *
 * O destaque é UM índice sobre a lista achatada (telas primeiro, depois as
 * seções na ordem do motor): setas e Enter atravessam as seções inteiras, sem
 * exceção — um item só alcançável pelo mouse seria meia busca.
 */

const ROTULO_GRUPO = new Map(NAV_GROUPS.map((g) => [g.id, g.label]));

type Linha =
  | { tipo: "tela"; destino: NavDestination }
  | { tipo: "entidade"; item: ItemDeBusca };

/** Um bloco de render: telas sem rótulo; cada seção de entidade com o seu. */
interface Bloco {
  rotulo?: string;
  itens: Array<{ linha: Linha; indice: number }>;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-card border p-0">
        <DialogTitle className="sr-only">{t("Busca global")}</DialogTitle>
        {/* O miolo é um componente à parte porque o Radix o DESMONTA ao fechar:
            busca e destaque nascem zerados na próxima abertura por construção,
            sem um efeito de reset para manter em sincronia. */}
        <Resultados aoEscolher={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Resultados({ aoEscolher }: { aoEscolher: () => void }) {
  const t = useT();
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [busca, setBusca] = useState("");
  const [destacado, setDestacado] = useState(0);
  const [secoes, setSecoes] = useState<SecaoDeBusca[]>([]);

  const visiveis = useMemo(
    () => searchable(user.is_platform_admin, activeOrg?.role ?? null),
    [user.is_platform_admin, activeOrg?.role],
  );

  const telas = useMemo(() => {
    // Sem termo, abre no trabalho do dia em vez de uma tela vazia que não
    // ensina nada sobre o que dá para procurar aqui.
    if (busca.trim() === "") return visiveis.filter((d) => d.group === "atendimento");
    return telasQueCasam(visiveis, busca);
  }, [busca, visiveis]);

  // Entidades a partir de 2 letras, com debounce: a paleta vira a "Busca
  // rápida" do Mercos, não só um lançador de telas. Termo curto limpa sem
  // gastar chamada, e as seções antigas ficam até a busca nova responder —
  // piscar vazio a cada tecla faria a lista pular debaixo do dedo.
  const buscar = useDebouncedCallback((termo: string) => {
    if (termo.trim().length < MINIMO_DE_LETRAS) {
      setSecoes([]);
      return;
    }
    void buscarEntidades(termo).then(setSecoes);
  }, 300);

  useEffect(() => {
    buscar(busca);
  }, [busca, buscar]);

  /** Achatada: telas primeiro (índices 0..n), depois as seções na ordem do motor. */
  const linhas = useMemo<Linha[]>(() => {
    const saida: Linha[] = telas.map((destino) => ({ tipo: "tela", destino }));
    for (const secao of secoes) {
      for (const item of secao.itens) saida.push({ tipo: "entidade", item });
    }
    return saida;
  }, [telas, secoes]);

  /** Mesma ordem de `linhas`, com um cabeçalho por seção de entidade. */
  const blocos = useMemo<Bloco[]>(() => {
    const telasBloco: Bloco = { itens: [] };
    telas.forEach((destino, i) =>
      telasBloco.itens.push({ linha: { tipo: "tela", destino }, indice: i }),
    );
    const blocos: Bloco[] = [telasBloco];
    let indice = telas.length;
    for (const secao of secoes) {
      const bloco: Bloco = { rotulo: secao.rotulo, itens: [] };
      for (const item of secao.itens) {
        bloco.itens.push({ linha: { tipo: "entidade", item }, indice });
        indice += 1;
      }
      blocos.push(bloco);
    }
    return blocos;
  }, [telas, secoes]);

  function irPara(href: string) {
    aoEscolher();
    router.push(href);
  }

  /**
   * O destaque volta ao topo junto com a busca, no mesmo evento: mantê-lo
   * apontaria para outro item depois que a lista muda, e o Enter navegaria
   * para o lugar errado.
   */
  function aoDigitar(valor: string) {
    setBusca(valor);
    setDestacado(0);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestacado((i) => Math.min(i + 1, linhas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestacado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const alvo = linhas[destacado];
      if (alvo) irPara(alvo.tipo === "tela" ? alvo.destino.href : alvo.item.href);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4">
        <MagnifyingGlass size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="palette-resultados"
          aria-activedescendant={linhas[destacado] ? `palette-${destacado}` : undefined}
          value={busca}
          onChange={(e) => aoDigitar(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder={t("Buscar telas, clientes, conversas…")}
          className="h-12 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
      </div>

      {linhas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          {t("Nada encontrado para")} “{busca}”.
        </p>
      ) : (
        <div
          id="palette-resultados"
          role="listbox"
          aria-label={t("Resultados")}
          className="max-h-80 overflow-y-auto p-2"
        >
          {blocos.map((bloco) => (
            <div
              key={bloco.rotulo ?? "telas"}
              role={bloco.rotulo ? "group" : undefined}
              aria-label={bloco.rotulo ? t(bloco.rotulo) : undefined}
            >
              {bloco.rotulo ? (
                <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t(bloco.rotulo)}
                </p>
              ) : null}
              {bloco.itens.map(({ linha, indice }) =>
                linha.tipo === "tela" ? (
                  <TelaLinha
                    key={linha.destino.href}
                    destino={linha.destino}
                    indice={indice}
                    ativo={indice === destacado}
                    aoEntrar={() => setDestacado(indice)}
                    aoEscolher={() => irPara(linha.destino.href)}
                    rotuloGrupo={t(ROTULO_GRUPO.get(linha.destino.group) ?? "")}
                  />
                ) : (
                  <EntidadeLinha
                    key={`${linha.item.href}#${linha.item.id}`}
                    item={linha.item}
                    indice={indice}
                    ativo={indice === destacado}
                    aoEntrar={() => setDestacado(indice)}
                    aoEscolher={() => irPara(linha.item.href)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {/* A ponte para a página de resultados: 5 por seção é o teto da paleta,
          e quem quer o resto não deve ter de reinventar a URL. */}
      {busca.trim() !== "" && linhas.length > 0 ? (
        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => irPara(`/app/busca?q=${encodeURIComponent(busca.trim())}`)}
            className="row-hover interactive w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {t("Ver todos os resultados para")} “{busca.trim()}”
          </button>
        </div>
      ) : null}
    </>
  );
}

function TelaLinha({
  destino,
  indice,
  ativo,
  aoEntrar,
  aoEscolher,
  rotuloGrupo,
}: {
  destino: NavDestination;
  indice: number;
  ativo: boolean;
  aoEntrar: () => void;
  aoEscolher: () => void;
  rotuloGrupo: string;
}) {
  const t = useT();
  const Icon = destino.icon;
  return (
    <div
      role="option"
      id={`palette-${indice}`}
      aria-selected={ativo}
      data-href={destino.href}
      onMouseEnter={aoEntrar}
      onClick={aoEscolher}
      className={cn(
        "row-hover interactive flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2",
        ativo && "bg-accent text-accent-foreground",
      )}
    >
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{t(destino.label)}</span>
          <span className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {rotuloGrupo}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{t(destino.description)}</p>
      </div>
    </div>
  );
}

function EntidadeLinha({
  item,
  indice,
  ativo,
  aoEntrar,
  aoEscolher,
}: {
  item: ItemDeBusca;
  indice: number;
  ativo: boolean;
  aoEntrar: () => void;
  aoEscolher: () => void;
}) {
  return (
    <div
      role="option"
      id={`palette-${indice}`}
      aria-selected={ativo}
      data-href={item.href}
      onMouseEnter={aoEntrar}
      onClick={aoEscolher}
      className={cn(
        "row-hover interactive flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
        ativo && "bg-accent text-accent-foreground",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-sm font-medium">{item.titulo}</span>
          {item.subtitulo ? (
            <span className="truncate text-xs text-muted-foreground">{item.subtitulo}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
