"use client";

import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Produto } from "@/lib/schemas/produtos";
import { precoEfetivo } from "@/lib/schemas/precos";
import { comoMoeda } from "@/lib/format/moeda";

export interface PrecoDeTabela {
  desconto_pct: number;
  overrides: Map<string, number | null>;
}

export interface UltimoPreco {
  preco_cents: number;
  em: string;
}

/**
 * A régua da busca — pura e exportada para ser MEDIDA.
 *
 * Filtrar 600 produtos a cada tecla é barato; o que não pode é a tela travar.
 * Deixar a conta dentro do componente tornava a medida refém do `waitFor` e da
 * carga da máquina (medido: 3 s num run com outros processos compilando, para
 * uma conta de microssegundos). Aqui a mesma função que a tela usa é medida
 * sem React no meio — e o teto diz respeito ao algoritmo, não ao CI.
 *
 * A ordem é a regra de identidade: código exato primeiro (o scanner), depois
 * nome/código/marca por trecho. O teto de linhas é da tela, não da busca.
 */
export function filtrarProdutos(produtos: Produto[], termo: string, limite = 8): Produto[] {
  const b = termo.trim().toLowerCase();
  if (!b) return [];
  const exato = produtos.filter((p) => p.codigo.trim().toLowerCase() === b);
  const resto = produtos.filter(
    (p) =>
      p.codigo.trim().toLowerCase() !== b &&
      (p.nome.toLowerCase().includes(b) ||
        p.codigo.toLowerCase().includes(b) ||
        (p.marca ?? "").toLowerCase().includes(b)),
  );
  return [...exato, ...resto].slice(0, limite);
}

/**
 * Busca de produto (§7–9): nome/SKU/código de barras (EAN), parcial, com debounce.
 *
 * - Código exato (o que o scanner bipa) vai para o topo e é o ÚNICO que o Enter
 *   aceita quando há mais de um resultado: digitar "CAF" e teclar Enter não pode
 *   lançar o primeiro café da lista, e bipar um EAN que não existe não pode
 *   virar item nenhum;
 * - Enter adiciona o resultado quando ele é inequívoco (código exato ou
 *   resultado único); ↑↓ escolhem explicitamente; Esc limpa;
 * - mostra preço efetivo da tabela aplicada + estoque + último preço do
 *   cliente (§19) quando houver histórico.
 *
 * ─── EAN: por que ele mora em `codigo` ────────────────────────────────────
 *
 * Não existe coluna `ean` em `catalog_products`, e criar uma segunda
 * identidade para o mesmo produto é justamente o "D — Duplicar" que a doutrina
 * DIRC proíbe: `codigo` já é a identidade do produto dentro da organização
 * (índice único `catalog_products_org_codigo_key`), é por ela que a planilha
 * reconhece "isto é o mesmo produto" e é o campo que a ficha do produto
 * preenche. Quem vende com leitor de código de barras cadastra o EAN ali.
 * O que faltava não era a coluna: era o Enter não escolher o item errado.
 */
export function ProductSearch({
  produtos,
  tabela,
  ultimosPrecos,
  inputRef,
  aoAdicionar,
  textos,
}: {
  produtos: Produto[];
  tabela: PrecoDeTabela | null;
  ultimosPrecos: Map<string, UltimoPreco>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  aoAdicionar: (produto: Produto, quantidade: number) => void;
  textos: { produtos: string; buscarProduto: string };
}) {
  const t = useT();
  const [busca, setBusca] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [destaque, setDestaque] = React.useState(0);
  // Acima do lote carregado (2.000), o produto existe no banco e não existe na
  // tela. A busca remota é o que impede "o produto não existe" numa carteira
  // grande — a lista local continua valendo e responde primeiro.
  const [remotos, setRemotos] = React.useState<Produto[]>([]);
  const [buscandoRemoto, setBuscandoRemoto] = React.useState(false);
  const [erroRemoto, setErroRemoto] = React.useState(false);
  // Enter com vários candidatos e nenhum código exato: a tela precisa dizer por
  // que nada foi lançado, senão o vendedor aperta Enter de novo achando que a
  // busca travou.
  const [ambiguo, setAmbiguo] = React.useState(false);
  // ↑↓ é escolha explícita: depois dela o Enter confirma o destacado mesmo com
  // vários candidatos. Sem isso, escolher com o teclado deixaria de funcionar.
  const [navegou, setNavegou] = React.useState(false);
  // O código do leitor não existe: a tela precisa dizer isso. Um EAN que casa
  // por trecho deixa UM produto na lista; sem esta mensagem, o Enter "não faz
  // nada" e o vendedor acha que a busca travou (ou pior, clica no produto).
  const [codigoInexistente, setCodigoInexistente] = React.useState(false);
  // O termo da vez, para a resposta atrasada do servidor não acusar "código não
  // encontrado" de um código que a pessoa já trocou (o await não é instantâneo).
  const termoDaVez = React.useRef("");

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(busca);
      setDestaque(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [busca]);

  React.useEffect(() => {
    const b = debounced.trim();
    if (b.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRemotos([]);
      return;
    }
    let vivo = true;
    setBuscandoRemoto(true);
    setErroRemoto(false);
    apiClient
      .get<{ data: Produto[] }>(`/api/v1/products?busca=${encodeURIComponent(b)}&limite=12`)
      .then((r) => {
        if (vivo) setRemotos(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        // Busca remota é reforço: sem rede, a lista local continua valendo —
        // mas a tela DIZ que a busca no catálogo inteiro falhou.
        if (vivo) {
          setRemotos([]);
          setErroRemoto(true);
        }
      })
      .finally(() => {
        if (vivo) setBuscandoRemoto(false);
      });
    return () => {
      vivo = false;
    };
  }, [debounced]);

  // O universo pesquisável: o lote que a página carregou (até 2.000) + o que a
  // busca remota trouxe. Inativo nunca entra no pedido — o endpoint devolve
  // inativos também (o catálogo os mostra) e a tela de venda não.
  const universo = React.useMemo(() => {
    const porId = new Map(produtos.map((p) => [p.id, p]));
    for (const p of remotos) if (p.ativo !== false) porId.set(p.id, p);
    return [...porId.values()].filter((p) => p.ativo !== false);
  }, [produtos, remotos]);

  const resultados = React.useCallback(
    (termo: string): Produto[] => filtrarProdutos(universo, termo),
    [universo],
  );

  // A lista local é filtrada com o texto ATUAL, não com o debounced: o
  // debounce existe para a consulta remota, não para a resposta da tela. Com
  // ele aqui, `Esc` limpava o campo e a lista continuava aberta por 150 ms —
  // e o Enter logo depois de digitar lia um termo que já não era o da tela.
  const filtrados = React.useMemo(() => resultados(busca), [resultados, busca]);


  function efetivo(p: Produto): { valor: number; origem: string } {
    if (!tabela) return { valor: p.preco_cents, origem: t("Base") };
    const v = precoEfetivo(p.preco_cents, tabela.desconto_pct, tabela.overrides.get(p.id) ?? null);
    if (v !== p.preco_cents) return { valor: v, origem: t("Tabela") };
    return { valor: v, origem: t("Base") };
  }

  function adicionar(p: Produto) {
    aoAdicionar(p, 1);
    setBusca("");
    setAmbiguo(false);
    setNavegou(false);
    setCodigoInexistente(false);
  }

  /**
   * O lote local é limitado (2.000 produtos). O código que o scanner bipa pode
   * estar FORA dele — e aí o Enter não pode responder "não existe" para um
   * produto que existe. Esta leitura é por chave no servidor (código exato),
   * não a busca por trecho: só aceita identidade, nunca semelhança.
   */
  async function buscarExatoNoServidor(termo: string): Promise<Produto | null> {
    try {
      const { data } = await apiClient.get<{ data: Produto[] }>(
        `/api/v1/products?busca=${encodeURIComponent(termo)}&limite=12`,
      );
      const alvo = termo.trim().toLowerCase();
      return (
        (Array.isArray(data) ? data : []).find(
          (p) => p.ativo !== false && p.codigo.trim().toLowerCase() === alvo,
        ) ?? null
      );
    } catch {
      // A busca remota é reforço: sem rede, a lista local e a mensagem
      // "nenhum produto encontrado" continuam valendo.
      return null;
    }
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setNavegou(true);
      setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setNavegou(true);
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      const termo = busca.trim();
      if (termo === "") return;
      e.preventDefault();
      // O Enter de scanner só pode lançar o que é INEQUÍVOCO. Antes ele lançava
      // `filtrados[destaque]` — o primeiro da lista — então bipar um código que
      // casa por trecho com dois produtos (ou uma busca de três letras)
      // adicionava o item errado sem ninguém ver, e o pedido saía com o preço
      // do produto errado.
      const lista = resultados(termo);
      const chave = termo.toLowerCase();
      const exato = lista.find((p) => p.codigo.trim().toLowerCase() === chave);
      if (exato) {
        adicionar(exato);
        return;
      }
      // Um leitor de código de barras digita só dígitos e aperta Enter. Nesse
      // caso, semelhança NÃO é identidade: um EAN inexistente que casa por
      // trecho com o nome de um produto não pode virar item. Só código exato
      // (local ou do servidor) entra.
      const veioDeLeitor = /^\d{8,14}$/.test(termo);
      if (lista.length === 1 && !veioDeLeitor) {
        adicionar(lista[0]!);
        return;
      }
      // Ambíguo: quem escolhe é a pessoa (↑↓ ou clique), não o primeiro da lista.
      if (navegou) {
        const destacado = filtrados[destaque];
        if (destacado) {
          adicionar(destacado);
          return;
        }
      }
      setAmbiguo(true);
      // Sem código exato no lote, o servidor ainda pode ter o produto. Só um
      // código EXATO vindo de lá é aceito — a semelhança continua exigindo
      // escolha humana.
      void buscarExatoNoServidor(termo).then((p) => {
        if (p) adicionar(p);
        // Só acusa o código que ainda está na tela: a resposta pode chegar
        // depois de a pessoa digitar outra coisa.
        else if (veioDeLeitor && termoDaVez.current.trim() === termo) setCodigoInexistente(true);
      });
    } else if (e.key === "Escape") {
      setBusca("");
      setAmbiguo(false);
      setNavegou(false);
      setCodigoInexistente(false);
      (e.target as HTMLInputElement).blur();
    }
  }



  return (
    <div className="space-y-1.5">
      <Label htmlFor="busca-produto">{textos.produtos}</Label>
      <Input
        id="busca-produto"
        ref={inputRef}
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          termoDaVez.current = e.target.value;
          setAmbiguo(false);
          setNavegou(false);
          setCodigoInexistente(false);
        }}
        onKeyDown={aoTeclar}
        placeholder={textos.buscarProduto}
        // A dica do atalho fica no `title` (mouse), não no nome acessível:
        // "/ foca" dentro do placeholder era lido em todo foco do leitor.
        title={`${textos.buscarProduto} (/ ${t("foca")})`}
        // O `<Label>` acima nomeia a SEÇÃO ("Produtos"); quem chega pelo
        // leitor de tela ou pelo Tab precisa saber que este campo BUSCA. Sem
        // o `aria-label`, o nome acessível do campo era "Produtos" — e um
        // campo chamado "Produtos" não diz que aceita nome, código ou EAN.
        aria-label={textos.buscarProduto}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={filtrados.length > 0}
        aria-controls="resultados-produto"
        aria-describedby={
          ambiguo
            ? "busca-produto-ambiguo"
            : codigoInexistente
              ? "busca-produto-codigo"
              : filtrados.length === 0 && busca.trim() !== ""
                ? "busca-produto-ajuda"
                : undefined
        }
        autoComplete="off"
      />
      {filtrados.length > 0 && (
        <ul
          id="resultados-produto"
          data-testid="produto-resultados"
          role="listbox"
          aria-label={t("Resultados da busca de produtos")}
          className="rounded-lg border bg-background shadow-sm"
        >
          {filtrados.map((p, i) => {            const ef = efetivo(p);
            const ultimo = ultimosPrecos.get(p.id);
            return (
              <li key={p.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={i === destaque}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    i === destaque ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                  onMouseEnter={() => setDestaque(i)}
                  onClick={() => adicionar(p)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.codigo}
                      {p.controla_estoque ? ` · ${t("estoque")}: ${p.quantidade}` : ""}
                      {` · ${ef.origem}`}
                    </span>
                    {ultimo && (
                      <span className="block text-xs text-muted-foreground">
                        {t("Último")}: {comoMoeda(ultimo.preco_cents, p.moeda)}
                        {ultimo.preco_cents !== ef.valor && (
                          <> ({ef.valor > ultimo.preco_cents ? "↑" : "↓"})</>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium">{comoMoeda(ef.valor, p.moeda)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Busca sem resultado não é catálogo vazio: sem esta linha, o operador
          não distingue "não existe produto com esse termo" de "a lista ainda
          não carregou" — e digita de novo achando que errou. */}
      {buscandoRemoto && busca.trim() !== "" ? (
        <p className="px-1 text-xs text-muted-foreground">{t("Buscando no catálogo…")}</p>
      ) : null}
      {erroRemoto && busca.trim() !== "" ? (
        <p role="status" className="px-1 text-xs text-muted-foreground">
          {t("Não foi possível buscar no catálogo inteiro; mostrando os produtos já carregados.")}
        </p>
      ) : null}
      {filtrados.length === 0 && busca.trim() !== "" && !buscandoRemoto && (
        <p
          id="busca-produto-ajuda"
          data-testid="produto-busca-vazia"
          className="px-1 text-xs text-muted-foreground"
        >
          {t("Nenhum produto encontrado.")}
        </p>
      )}
      {/* Enter com vários candidatos e nenhum código exato: nada é lançado, e
          a tela diz por quê. Silêncio aqui ensinaria o vendedor a apertar Enter
          de novo — ou a clicar no primeiro e vender o produto errado. */}
      {ambiguo && filtrados.length > 1 ? (
        <p
          role="status"
          id="busca-produto-ambiguo"
          className="px-1 text-xs text-orange-600"
        >
          {t("Vários produtos encontrados — escolha um na lista para não lançar o item errado.")}
        </p>
      ) : null}
      {codigoInexistente ? (
        <p role="status" id="busca-produto-codigo" className="px-1 text-xs text-orange-600">
          {t("Código não encontrado — confira o cadastro do produto.")}
        </p>
      ) : null}
    </div>
  );
}

