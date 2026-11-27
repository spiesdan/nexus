"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LockKey, Plus } from "@phosphor-icons/react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient } from "@/lib/api/client";
import { CampanhasTab } from "./_campanhas";
import { ConfigTab } from "./_config";
import { BuscasTab } from "./_buscas";
import type { BuscaDaTela } from "./_buscas-estado";
import { EmpresasTab } from "./_empresas";
import { MercadoTab } from "./_mercado";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

/**
 * O que a página entrega à aba: o resumo da lista MAIS os campos derivados do
 * contrato Maps (`degradada`, `progresso`, `motivo_zero`, `estado_parada`…).
 * O detalhe tem os mesmos campos — a leitura fica em `_buscas-estado.ts`.
 */
export interface BuscaResumo extends BuscaDaTela {
  max_empresas: number;
  total_celulas: number;
  celulas_processadas: number;
  erros: number;
  requisicoes: number;
  custo_estimado_cents: number;
  ultimo_erro: string | null;
  created_at: string;
  finished_at: string | null;
}

interface Textos {
  titulo: string;
  subtitulo: string;
  abaBuscar: string;
  abaPesquisas: string;
  abaEmpresas: string;
  abaMercado: string;
  abaCampanhas: string;
  abaConfig: string;
  onde: string;
  tipoEmpresa: string;
  oQueEncontrar: string;
  cidade: string;
  estado: string;
  raio: string;
  maximo: string;
  buscar: string;
  buscando: string;
  progresso: string;
  encontradas: string;
  novas: string;
  duplicadas: string;
  erros: string;
  custo: string;
  verEmpresas: string;
  pausar: string;
  continuar: string;
  cancelar: string;
  vazias: string;
  buscaCriada: string;
  reutilizada: string;
  exemploCidade: string;
}

/** Parâmetros que significam "quero ver a aba Empresas" (deep-link, B1). */
function temParametrosDeEmpresa(params: URLSearchParams): boolean {
  for (const chave of [
    "busca_id",
    "busca",
    "empresa",
    "categoria",
    "cidade",
    "estado",
    "status",
    "nota_min",
    "com_telefone",
    "com_website",
    "com_whatsapp",
    "so_sem_cliente",
    "minha_fila",
  ]) {
    if (params.get(chave)) return true;
  }
  return false;
}

const ABAS = ["campanhas", "empresas", "buscar", "pesquisas", "mercado", "config"] as const;

/**
 * A aba inicial da Prospecção.
 *
 * A tela abria em "Buscar" — um formulário de Google — mesmo para quem já
 * tinha campanha. O uso real do dono é acompanhar campanha e mandar mensagem;
 * a busca é a exceção. Campanhas vira o padrão, e `?aba=` permite que a tela
 * de controle volte para a lista certa.
 */
function abaInicial(params: URLSearchParams): string {
  const pedida = params.get("aba");
  if (pedida && (ABAS as readonly string[]).includes(pedida)) return pedida;
  if (temParametrosDeEmpresa(params)) return "empresas";
  return "campanhas";
}

export function ProspeccaoClient({
  buscasIniciais,
  categorias,
  podeBuscar,
  podeGerenciar,
  usuarioId,
  textos,
}: {
  buscasIniciais: BuscaResumo[];
  categorias: MacroCategoria[];
  podeBuscar: boolean;
  podeGerenciar: boolean;
  usuarioId: string;
  textos: Textos;
}) {
  const t = useT();
  const paramsUrl = useSearchParams();
  // Abas controladas (B1): quem decide a aba é o estado + a URL — "Ver
  // empresas" troca de aba mesmo sem recarregar a página.
  const [aba, setAba] = React.useState<string>(() => abaInicial(paramsUrl));
  const router = useRouter();
  const pathname = usePathname();
  /**
   * Trocar de aba ESCREVE a aba na URL.
   *
   * O estado sozinho não sobrevive a uma remontagem (e a tela remonta quando a
   * URL muda por baixo — era o que acontecia com o filtro das Empresas). Com
   * `?aba=` na URL, a aba clicada é a aba que a tela reabre, e o link
   * compartilhado abre no mesmo lugar. Era o que o comentário acima prometia e
   * o código não fazia (F-27).
   */
  const trocarAba = React.useCallback(
    (valor: string) => {
      setAba(valor);
      const qs = new URLSearchParams(paramsUrl.toString());
      qs.set("aba", valor);
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
    },
    [paramsUrl, pathname, router],
  );
  React.useEffect(() => {
    // Mesma rota com query nova (Link) preserva o componente — o initializer
    // não roda de novo, então a troca reage à URL aqui. `?aba=` tem precedência
    // porque é o retorno explícito da tela de controle.
    const pedida = paramsUrl.get("aba");
    if (pedida && (ABAS as readonly string[]).includes(pedida)) {
      setAba(pedida);
      return;
    }
    if (temParametrosDeEmpresa(paramsUrl)) setAba("empresas");
  }, [paramsUrl]);
  // "O que você quer encontrar?" (§36) — critérios da busca vêm junto no
  // "Ver empresas": a descoberta não filtra (o provider devolve a região
  // inteira), então a intenção do vendedor é aplicada nos resultados.
  const [criterios, setCriterios] = React.useState({
    novos: false,
    comTelefone: false,
    comWhatsapp: false,
    soSemCliente: false,
  });
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  const [cidade, setCidade] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [raio, setRaio] = React.useState("30");
  const [maximo, setMaximo] = React.useState("500");
  const [criando, setCriando] = React.useState(false);

  function alternar(busca: string) {
    setMarcadas((m) => (m.includes(busca) ? m.filter((x) => x !== busca) : [...m, busca]));
  }

  async function criar() {
    // Deduplica: "Ótica" existe em dois macros e marcaria o mesmo termo duas
    // vezes, inflando a grade e o custo estimado.
    const categorias = [...new Set(marcadas)];
    if (categorias.length === 0) {
      toast.error(t("Escolha ao menos 1 categoria."));
      return;
    }
    if (!cidade.trim()) {
      toast.error(t("Informe a cidade."));
      return;
    }
    setCriando(true);
    try {
      const corpo = await apiClient.post<{ data: { id?: string; reutilizada?: string } | null }>(
        "/api/v1/prospecting/searches",
        {
          categorias,
          cidade: cidade.trim(),
          ...(uf.trim() ? { estado: uf.trim().toUpperCase() } : {}),
          raio_km: Number(raio) || 30,
          max_empresas: Number(maximo) || 500,
        },
      );
      const r = corpo?.data ?? {};
      toast.success(r.reutilizada ? textos.reutilizada : textos.buscaCriada);
      setMarcadas([]);
      // Encontrar empresas é assíncrono: cai na aba Pesquisas para ver o
      // progresso; "Ver empresas" (com os critérios) leva aos resultados.
      trocarAba("pesquisas");
    } catch (e) {
      showApiError(e);
    } finally {
      setCriando(false);
    }
  }

  /** "Ver empresas" desta busca já filtrado pelos critérios escolhidos (B1: uuid vira busca_id, nunca texto). */
  function hrefEmpresas(buscaId: string): string {
    const qs = new URLSearchParams();
    qs.set("busca_id", buscaId);
    if (criterios.novos) qs.set("status", "novo");
    if (criterios.comTelefone) qs.set("com_telefone", "true");
    if (criterios.comWhatsapp) qs.set("com_whatsapp", "true");
    if (criterios.soSemCliente) qs.set("so_sem_cliente", "true");
    return `/app/prospeccao?${qs.toString()}`;
  }

  return (
    <div className="min-h-full space-y-4 p-4 sm:p-6">
      {/* `headingLevel={2}`: esta tela é SUBTELA de `/app/campanhas`, que já
          desenha o `h1` da página. Sem isso a rota tinha dois títulos de nível 1
          — medido em produção em 16/11/2026 (`h1-em-producao.json`): "Campanha"
          e "Prospecção" na mesma árvore de acessibilidade. */}
      <NexusPageHeader
        headingLevel={2}
        title={textos.titulo}
        subtitle={textos.subtitulo}
        actions={
          podeBuscar ? (
            <Button asChild>
              <Link href="/app/prospeccao/nova">
                <Plus size={16} aria-hidden />
                {t("Criar campanha")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs value={aba} onValueChange={trocarAba}>
        {/*
          DUAS SUPERFÍCIES, NÃO SEIS ABAS.
          A tela tinha seis abas do mesmo peso — criar campanha, buscar, ver
          pesquisas, ver empresas, mercado e configurar — e quem abria não sabia
          por onde começar. O trabalho do dia é Campanhas (o que está rodando) e
          Empresas (quem existe). As outras quatro são ferramentas: ficam ao
          lado, menores, sem competir com o que se usa todo dia.
        */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="campanhas">{textos.abaCampanhas}</TabsTrigger>
            <TabsTrigger value="empresas">{textos.abaEmpresas}</TabsTrigger>
          </TabsList>

          <nav
            aria-label={t("Ferramentas da prospecção")}
            className="flex flex-wrap items-center gap-1"
          >
            <Button
              type="button"
              size="sm"
              variant={aba === "buscar" ? "secondary" : "ghost"}
              aria-current={aba === "buscar" ? "page" : undefined}
              onClick={() => trocarAba("buscar")}
            >
              {textos.abaBuscar}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={aba === "pesquisas" ? "secondary" : "ghost"}
              aria-current={aba === "pesquisas" ? "page" : undefined}
              onClick={() => trocarAba("pesquisas")}
            >
              {textos.abaPesquisas}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={aba === "mercado" ? "secondary" : "ghost"}
              aria-current={aba === "mercado" ? "page" : undefined}
              onClick={() => trocarAba("mercado")}
            >
              {textos.abaMercado}
            </Button>
            {podeGerenciar && (
              <Button
                type="button"
                size="sm"
                variant={aba === "config" ? "secondary" : "ghost"}
                aria-current={aba === "config" ? "page" : undefined}
                onClick={() => trocarAba("config")}
              >
                {textos.abaConfig}
              </Button>
            )}
          </nav>
        </div>

        <TabsContent value="buscar" className="mt-4">
          {podeBuscar ? (
            <Card className="hover-raise space-y-4 p-4">
              <div>
                <p className="mb-2 text-sm font-medium">{textos.onde}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cidade">{textos.cidade}</Label>
                    <Input
                      id="cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      placeholder={textos.exemploCidade}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf">{textos.estado}</Label>
                    <Input
                      id="uf"
                      value={uf}
                      onChange={(e) => setUf(e.target.value)}
                      placeholder="SC"
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="raio">{textos.raio}</Label>
                    <Input
                      id="raio"
                      type="number"
                      min={1}
                      max={500}
                      value={raio}
                      onChange={(e) => setRaio(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maximo">{textos.maximo}</Label>
                    <Input
                      id="maximo"
                      type="number"
                      min={1}
                      max={10000}
                      value={maximo}
                      onChange={(e) => setMaximo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{textos.tipoEmpresa}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {categorias.map((m) => (
                    <fieldset key={m.macro} className="rounded-lg border p-3">
                      <legend className="px-1 text-sm font-medium">{m.macro}</legend>
                      <div className="flex flex-wrap gap-2">
                        {m.subcategorias.map((s) => (
                          <label
                            key={s.busca}
                            className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                              marcadas.includes(s.busca)
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={marcadas.includes(s.busca)}
                              onChange={() => alternar(s.busca)}
                            />
                            {s.rotulo}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{textos.oQueEncontrar}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["novos", t("Novos clientes")],
                      ["comTelefone", t("Com telefone")],
                      ["comWhatsapp", t("Com WhatsApp")],
                      ["soSemCliente", t("Que ainda não são clientes")],
                    ] as const
                  ).map(([campo, rotulo]) => (
                    <Button
                      key={campo}
                      type="button"
                      size="sm"
                      variant={criterios[campo] ? "default" : "outline"}
                      aria-pressed={criterios[campo]}
                      onClick={() => setCriterios((c) => ({ ...c, [campo]: !c[campo] }))}
                    >
                      {rotulo}
                    </Button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t(
                    "Valem nos resultados — a busca encontra todas as empresas da região e estes filtros ficam aplicados ao abrir.",
                  )}
                </p>
              </div>
              {/* A BUSCA EM RODAPÉ FIXO. O botão ficava no fim de ~10 grupos de
                  categorias — mais de 1.000px de rolagem entre escolher a
                  cidade e poder buscar. Agora ele acompanha a rolagem, com a
                  contagem do que está marcado ao lado.

                  O botão fica à ESQUERDA de propósito: o canto inferior direito
                  é do avatar do assistente, que é fixo e cobre qualquer ação
                  ali. O `pr-20 md:pr-24` é a folga dele. */}
              <div className="sticky bottom-0 -mb-4 flex items-center gap-3 border-t border-border bg-card py-3 pr-20 md:pr-24 md:after:absolute md:after:inset-x-0 md:after:top-full md:after:h-6 md:after:bg-card md:after:content-['']">
                <Button onClick={criar} disabled={criando}>
                  {criando ? textos.buscando : textos.buscar}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {marcadas.length === 0
                    ? t("Todas as categorias")
                    : `${marcadas.length} ${marcadas.length === 1 ? t("categoria") : t("categorias")}`}
                </p>
              </div>
            </Card>
          ) : (
            <NexusEmptyState
              icon={LockKey}
              headline={t("Criar busca exige papel de atendente ou superior.")}
            />
          )}
        </TabsContent>

        <TabsContent value="pesquisas" className="mt-4">
          <BuscasTab
            iniciais={buscasIniciais}
            podeOperar={podeBuscar}
            podeGerenciar={podeGerenciar}
            hrefEmpresas={hrefEmpresas}
            aoIrParaBuscar={() => trocarAba("buscar")}
          />
        </TabsContent>

        <TabsContent value="empresas" className="mt-4">
          <EmpresasTab podeOperar={podeBuscar} usuarioId={usuarioId} />
        </TabsContent>

        <TabsContent value="mercado" className="mt-4">
          <MercadoTab />
        </TabsContent>

        <TabsContent value="campanhas" className="mt-4">
          {/* A aba Prospecção lista a garimpagem de empresa — e só ela. A
              recuperação é criada e listada no Radar; a campanha por região
              fica na subtela Campanha. */}
          <CampanhasTab podeOperar={podeBuscar} origem="prospeccao" />
        </TabsContent>

        {podeGerenciar && (
          <TabsContent value="config" className="mt-4">
            <ConfigTab categorias={categorias} podeGerenciar={podeGerenciar} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
