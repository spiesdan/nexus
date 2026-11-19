"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { normalizar } from "@/lib/catalogo/busca";
import { imagemDoClipboard } from "@/lib/inbox/clipboard-image";
import { comoMoeda } from "@/lib/format/moeda";
import { precoEfetivo } from "@/lib/schemas/precos";
import type { Produto } from "@/lib/schemas/produtos";
import { cn } from "@/lib/utils";
import {
  CircleNotch,
  FileText,
  ImageIcon,
  Microphone,
  Sparkle,
  UploadSimple,
  Warning,
  X,
} from "@/lib/ui/icons";
import type { ItemCasado } from "@/lib/comercial/importar-ia";

import type { PrecoDeTabela } from "./_produtos";

export interface ItemParaAdicionar {
  produto: Produto;
  quantidade: number;
}

interface ItemDeRevisao extends ItemCasado {
  produto: Produto | null;
}

interface ResultadoDaRota {
  itens: ItemCasado[];
  total_extraido: number;
}

interface ReconhecimentoDeVoz {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((evento: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function construtorDeVoz(): (new () => ReconhecimentoDeVoz) | null {
  if (typeof window === "undefined") return null;
  const janela = window as unknown as {
    SpeechRecognition?: new () => ReconhecimentoDeVoz;
    webkitSpeechRecognition?: new () => ReconhecimentoDeVoz;
  };
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null;
}

function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function precoDoProduto(produto: Produto, tabela: PrecoDeTabela | null): number {
  if (!tabela) return produto.preco_cents;
  return precoEfetivo(
    produto.preco_cents,
    tabela.desconto_pct,
    tabela.overrides.get(produto.id) ?? null,
  );
}

function produtoInicial(item: ItemCasado, produtos: Produto[]): Produto | null {
  if (!item.produto_id) return null;
  return (
    item.candidatos.find((c) => c.produto.id === item.produto_id)?.produto ??
    produtos.find((p) => p.id === item.produto_id) ??
    null
  );
}

/**
 * SELETOR DE PRODUTO DA CONFERÊNCIA — o "código ou nome" do Mercos.
 *
 * A busca do servidor já devolve até três candidatos. Aqui o vendedor pode
 * aceitar um deles ou procurar no catálogo inteiro. A lista local tem o mesmo
 * teto da tela (2.000), então o que a busca do servidor achou também está aqui.
 */
function SeletorDeProduto({
  item,
  produtos,
  tabela,
  aoEscolher,
}: {
  item: ItemDeRevisao;
  produtos: Produto[];
  tabela: PrecoDeTabela | null;
  aoEscolher: (produto: Produto | null) => void;
}) {
  const t = useT();
  const [trocando, setTrocando] = React.useState(item.produto === null);
  const [busca, setBusca] = React.useState("");

  const filtrados = React.useMemo(() => {
    const termos = normalizar(busca).split(" ").filter(Boolean);
    if (termos.length === 0) return [];
    return produtos
      .filter((p) => {
        const alvo = normalizar(`${p.nome} ${p.codigo} ${p.marca ?? ""}`);
        return termos.every((termo) => alvo.includes(termo));
      })
      .slice(0, 8);
  }, [busca, produtos]);

  if (item.produto && !trocando) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.produto.nome}</p>
          <p className="text-xs text-muted-foreground">
            {item.produto.codigo} · {comoMoeda(precoDoProduto(item.produto, tabela), item.produto.moeda)}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setTrocando(true)}>
          {t("Trocar")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {item.candidatos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.candidatos.map((c) => (
            <Button
              key={c.produto.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-auto max-w-full justify-start whitespace-normal py-1.5 text-left"
              onClick={() => {
                aoEscolher(c.produto);
                setTrocando(false);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{c.produto.nome}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {c.produto.codigo} · {Math.round(c.nota * 100)}%
                  {c.relacao === "relacionada" ? ` · ${t("acessório")}` : ""}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={t("Buscar produto por nome ou código…")}
        autoComplete="off"
      />
      {filtrados.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border bg-background">
          {filtrados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                onClick={() => {
                  aoEscolher(p);
                  setTrocando(false);
                  setBusca("");
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.nome}</span>
                  <span className="block text-xs text-muted-foreground">{p.codigo}</span>
                </span>
                <span className="shrink-0 text-xs">
                  {comoMoeda(precoDoProduto(p, tabela), p.moeda)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {item.produto && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            aoEscolher(null);
            setTrocando(false);
          }}
        >
          {t("Remover produto escolhido")}
        </Button>
      )}
    </div>
  );
}

function SeloDeConfianca({ confianca }: { confianca: ItemCasado["confianca"] }) {
  const t = useT();
  const rotulo =
    confianca === "alta"
      ? t("Encontrado")
      : confianca === "media"
        ? t("Confira")
        : confianca === "baixa"
          ? t("Escolha o produto")
          : t("Não encontrado");
  const cor =
    confianca === "alta"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      : confianca === "media"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "bg-destructive/10 text-destructive";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cor)}>{rotulo}</span>
  );
}

export function AdicionarComIa({
  aberto,
  aoFechar,
  produtos,
  tabela,
  aoAdicionar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  produtos: Produto[];
  tabela: PrecoDeTabela | null;
  aoAdicionar: (itens: ItemParaAdicionar[]) => void;
}) {
  const t = useT();
  const [etapa, setEtapa] = React.useState<"entrada" | "revisao">("entrada");
  const [texto, setTexto] = React.useState("");
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [arrastando, setArrastando] = React.useState(false);
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [itens, setItens] = React.useState<ItemDeRevisao[]>([]);
  const [ditando, setDitando] = React.useState(false);
  const reconhecimentoRef = React.useRef<ReconhecimentoDeVoz | null>(null);

  // Hidratação, não estado sincronizado: o SSR não tem `window`, o cliente
  // tem. `useSyncExternalStore` é o padrão canônico do repo para essa leitura
  // e não dispara o aviso de setState dentro de efeito.
  const podeDitar = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => construtorDeVoz() !== null,
    () => false,
  );

  React.useEffect(() => {
    return () => {
      reconhecimentoRef.current?.stop();
    };
  }, []);

  /**
   * Cada abertura começa limpa. O reset acontece no FECHAMENTO (evento), não
   * num efeito de abertura: assim o próximo `open` já encontra o estado zerado
   * e não há render em cascata.
   */
  function fechar() {
    reconhecimentoRef.current?.stop();
    reconhecimentoRef.current = null;
    setEtapa("entrada");
    setTexto("");
    setArquivo(null);
    setArrastando(false);
    setCarregando(false);
    setErro(null);
    setItens([]);
    setDitando(false);
    aoFechar();
  }

  function escolherArquivo(novo: File | null) {
    setErro(null);
    if (!novo) return;
    if (novo.size > 20 * 1024 * 1024) {
      setErro(t("O arquivo passa de 20 MB. Reduza a imagem ou o PDF e tente de novo."));
      return;
    }
    setArquivo(novo);
    setTexto("");
  }

  function aoColar(e: React.ClipboardEvent<HTMLDivElement>) {
    const imagem = imagemDoClipboard(e.clipboardData, new Date());
    if (!imagem) return; // texto colado segue o caminho normal do textarea
    e.preventDefault();
    escolherArquivo(imagem);
  }

  function ditar() {
    if (ditando) {
      reconhecimentoRef.current?.stop();
      return;
    }
    const Construtor = construtorDeVoz();
    if (!Construtor) {
      setErro(t("Este navegador não tem ditado por voz. Cole o texto ou envie uma foto."));
      return;
    }
    const reconhecimento = new Construtor();
    reconhecimento.lang = "pt-BR";
    reconhecimento.interimResults = false;
    reconhecimento.continuous = false;
    reconhecimento.onresult = (evento) => {
      const transcricao = Array.from(evento.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcricao !== "") {
        setArquivo(null);
        setTexto((atual) => (atual.trim() === "" ? transcricao : `${atual} ${transcricao}`));
      }
    };
    reconhecimento.onerror = () => {
      setDitando(false);
      setErro(t("Não consegui ouvir o microfone. Verifique a permissão do navegador."));
    };
    reconhecimento.onend = () => setDitando(false);
    reconhecimentoRef.current = reconhecimento;
    setErro(null);
    setDitando(true);
    try {
      reconhecimento.start();
    } catch {
      setDitando(false);
      setErro(t("Não consegui iniciar o ditado. Tente de novo."));
    }
  }

  async function encontrarProdutos() {
    if (!arquivo && texto.trim() === "") {
      setErro(t("Envie uma foto, um PDF, um áudio ou cole o texto do pedido."));
      return;
    }
    setCarregando(true);
    setErro(null);

    const form = new FormData();
    if (arquivo) form.append("arquivo", arquivo);
    else form.append("texto", texto.trim());

    try {
      // `fetch` direto, não `apiClient`: ele repete POST em timeout, e uma
      // segunda leitura de IA é uma segunda cobrança. Aqui, timeout é timeout.
      const resposta = await fetch("/api/v1/commercial-orders/importar-ia", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      const corpo = (await resposta.json().catch(() => null)) as
        | { data?: ResultadoDaRota; error?: { message?: string } }
        | null;
      if (!resposta.ok || !corpo?.data) {
        throw new Error(
          corpo?.error?.message ??
            t("Não consegui ler este pedido. Tente uma foto mais nítida ou cole os itens em texto."),
        );
      }

      const revisao = corpo.data.itens.map((item) => ({
        ...item,
        produto: produtoInicial(item, produtos),
      }));
      if (revisao.length === 0) {
        setErro(t("Não encontrei produtos neste pedido. Tente outra foto ou cole os itens em texto."));
        return;
      }
      setItens(revisao);
      setEtapa("revisao");
    } catch (e) {
      setErro(
        e instanceof Error && e.message !== ""
          ? e.message
          : t("Não consegui ler este pedido agora. Tente de novo em instantes."),
      );
    } finally {
      setCarregando(false);
    }
  }

  function mudarQuantidade(chave: string, valor: string) {
    const n = Number(valor);
    setItens((atuais) =>
      atuais.map((item) =>
        item.chave === chave
          ? { ...item, quantidade: Number.isFinite(n) ? Math.max(1, Math.round(n)) : 1 }
          : item,
      ),
    );
  }

  function escolherProduto(chave: string, produto: Produto | null) {
    setItens((atuais) =>
      atuais.map((item) => (item.chave === chave ? { ...item, produto } : item)),
    );
  }

  function removerItem(chave: string) {
    setItens((atuais) => atuais.filter((item) => item.chave !== chave));
  }

  function confirmar() {
    const escolhidos = itens
      .filter((item): item is ItemDeRevisao & { produto: Produto } => item.produto !== null)
      .map((item) => ({ produto: item.produto, quantidade: item.quantidade }));
    if (escolhidos.length === 0) {
      setErro(t("Escolha ao menos um produto para adicionar ao pedido."));
      return;
    }
    aoAdicionar(escolhidos);
    fechar();
  }

  const selecionados = itens.filter((item) => item.produto !== null).length;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !carregando && fechar()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle size={18} />
            {etapa === "entrada"
              ? t("Adicionar produtos com IA")
              : t("Confira os produtos encontrados")}
          </DialogTitle>
          <DialogDescription>
            {etapa === "entrada"
              ? t("Informe quais produtos devem ser adicionados ao pedido.")
              : t("Ajuste a quantidade e escolha o produto certo antes de adicionar.")}
          </DialogDescription>
        </DialogHeader>

        {etapa === "entrada" ? (
          <div className="space-y-4" onPaste={aoColar}>
            <label
              htmlFor="arquivo-do-pedido"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                arrastando ? "border-accent bg-accent/10" : "border-border hover:bg-muted/40",
                carregando && "pointer-events-none opacity-60",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                const solto = e.dataTransfer.files?.[0];
                if (solto) escolherArquivo(solto);
              }}
            >
              <UploadSimple size={28} className="text-muted-foreground" />
              <span className="text-sm font-medium">
                {t("Arraste uma foto, PDF, áudio ou planilha CSV aqui")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("ou clique para escolher · até 20 MB")}
              </span>
              <input
                id="arquivo-do-pedido"
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,application/pdf,audio/*,.csv,.txt,.tsv"
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
            </label>

            {arquivo && (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  {arquivo.type.startsWith("image/") ? (
                    <ImageIcon size={18} className="shrink-0" />
                  ) : (
                    <FileText size={18} className="shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{arquivo.name}</p>
                    <p className="text-xs text-muted-foreground">{tamanhoLegivel(arquivo.size)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("Remover arquivo")}
                  onClick={() => setArquivo(null)}
                >
                  <X size={16} />
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="texto-do-pedido">{t("Ou escreva/cole os itens")}</Label>
                {podeDitar && (
                  <Button
                    type="button"
                    size="sm"
                    variant={ditando ? "secondary" : "ghost"}
                    onClick={ditar}
                    disabled={carregando}
                  >
                    <Microphone size={15} className="mr-1.5" />
                    {ditando ? t("Ouvindo…") : t("Ditar texto")}
                  </Button>
                )}
              </div>
              <textarea
                id="texto-do-pedido"
                value={texto}
                onChange={(e) => {
                  const valor = e.target.value;
                  setTexto(valor);
                  if (valor.trim() !== "" && arquivo) setArquivo(null);
                }}
                placeholder={t("Ex.: 2 água sanitária 5L, 3 álcool 46%, 1 amaciante 5L")}
                rows={4}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {t("A IA lê o pedido e procura os produtos no seu catálogo. Você confere tudo antes de adicionar.")}
              </p>
            </div>

            {erro && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <Warning size={16} className="mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={fechar} disabled={carregando}>
                {t("Cancelar")}
              </Button>
              <Button type="button" onClick={() => void encontrarProdutos()} disabled={carregando}>
                {carregando ? (
                  <>
                    <CircleNotch size={16} className="mr-1.5 animate-spin" />
                    {t("Lendo o pedido…")}
                  </>
                ) : (
                  <>
                    <Sparkle size={16} className="mr-1.5" />
                    {t("Encontrar produtos")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {erro && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <Warning size={16} className="mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <ul className="space-y-2">
              {itens.map((item) => (
                <li key={item.chave} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">
                          {item.descricao}
                        </p>
                        <SeloDeConfianca confianca={item.confianca} />
                      </div>
                      {item.numeros_ignorados.length > 0 && (
                        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                          {t("A busca ignorou o número")} {item.numeros_ignorados.join(", ")}.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("Remover item")}
                      onClick={() => removerItem(item.chave)}
                    >
                      <X size={16} />
                    </Button>
                  </div>

                  <div className="mt-2 grid grid-cols-[84px_1fr] items-start gap-2">
                    <div className="space-y-1">
                      <Label htmlFor={`qtd-ia-${item.chave}`} className="text-xs">
                        {t("Qtd")}
                      </Label>
                      <Input
                        id={`qtd-ia-${item.chave}`}
                        type="number"
                        min={1}
                        step={1}
                        className="h-9"
                        value={item.quantidade}
                        onChange={(e) => mudarQuantidade(item.chave, e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <SeletorDeProduto
                        item={item}
                        produtos={produtos}
                        tabela={tabela}
                        aoEscolher={(produto) => escolherProduto(item.chave, produto)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setErro(null);
                  setEtapa("entrada");
                }}
              >
                {t("Voltar")}
              </Button>
              <Button type="button" onClick={confirmar} disabled={selecionados === 0}>
                {t("Adicionar ao pedido")}
                {selecionados > 0 ? ` (${selecionados})` : ""}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
