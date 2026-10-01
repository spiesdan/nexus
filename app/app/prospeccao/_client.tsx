"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LockKey, MagnifyingGlass } from "@phosphor-icons/react";
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
import { EmpresasTab } from "./_empresas";
import { MercadoTab } from "./_mercado";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";
import { ROTULO_STATUS_BUSCA } from "@/lib/schemas/prospeccao";
import { comoMoeda } from "@/lib/format/moeda";

export interface BuscaResumo {
  id: string;
  categorias: string[];
  cidade: string | null;
  estado: string | null;
  raio_km: number;
  max_empresas: number;
  status: string;
  total_celulas: number;
  celulas_processadas: number;
  encontradas: number;
  novas: number;
  duplicadas: number;
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

const STATUS_COR: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  paused: "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-muted-foreground",
};

/**
 * Normaliza qualquer formato que chegue da API/servidor para lista.
 * A API responde o envelope canônico `{ data }`, mas em erro parcial,
 * `null` ou objeto inesperado a tela NÃO pode quebrar (`buscas.some is
 * not a function`) — vira lista vazia com estado empty desenhado.
 */
export function comoListaBuscas(valor: unknown): BuscaResumo[] {
  if (Array.isArray(valor)) return valor as BuscaResumo[];
  if (valor && typeof valor === "object" && Array.isArray((valor as { data?: unknown }).data)) {
    return (valor as { data: BuscaResumo[] }).data;
  }
  return [];
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
  const [aba, setAba] = React.useState<string>(() => (temParametrosDeEmpresa(paramsUrl) ? "empresas" : "buscar"));
  React.useEffect(() => {
    // Mesma rota com query nova (Link) preserva o componente — o initializer
    // não roda de novo, então a troca reage à URL aqui.
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
  const [buscas, setBuscas] = React.useState<BuscaResumo[]>(() => comoListaBuscas(buscasIniciais));
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  const [cidade, setCidade] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [raio, setRaio] = React.useState("30");
  const [maximo, setMaximo] = React.useState("500");
  const [criando, setCriando] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: unknown }>("/api/v1/prospecting/searches");
      setBuscas(comoListaBuscas(corpo?.data));
    } catch (e) {
      showApiError(e);
    }
  }, []);

  // Polling enquanto houver busca ativa (1 tick/min no servidor; 10s aqui é
  // o meio-termo entre frescor e requisições à toa).
  // `buscas` é sempre array (estado inicial + recarregar normalizam), mas o
  // acesso defensivo aqui impede qualquer regressão futura de voltar a
  // quebrar a tela inteira.
  const listaBuscas = comoListaBuscas(buscas);
  const temAtiva = listaBuscas.some((b) => b.status === "queued" || b.status === "running");
  React.useEffect(() => {
    if (!temAtiva) return;
    const timer = setInterval(() => void recarregar(), 10000);
    return () => clearInterval(timer);
  }, [temAtiva, recarregar]);

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
      await recarregar();
      // Encontrar empresas é assíncrono: cai na aba Pesquisas para ver o
      // progresso; "Ver empresas" (com os critérios) leva aos resultados.
      setAba("pesquisas");
    } catch (e) {
      showApiError(e);
    } finally {
      setCriando(false);
    }
  }

  async function acao(id: string, acao: "pause" | "resume" | "cancel") {
    try {
      await apiClient.patch(`/api/v1/prospecting/searches/${id}`, { acao });
      await recarregar();
    } catch (e) {
      showApiError(e);
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
    <div className="space-y-6 p-6">
      <NexusPageHeader title={textos.titulo} subtitle={textos.subtitulo} />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="buscar">{textos.abaBuscar}</TabsTrigger>
          <TabsTrigger value="pesquisas">{textos.abaPesquisas}</TabsTrigger>
          <TabsTrigger value="empresas">{textos.abaEmpresas}</TabsTrigger>
          <TabsTrigger value="mercado">{textos.abaMercado}</TabsTrigger>
          <TabsTrigger value="campanhas">{textos.abaCampanhas}</TabsTrigger>
          {podeGerenciar && <TabsTrigger value="config">{textos.abaConfig}</TabsTrigger>}
        </TabsList>

        <TabsContent value="buscar" className="mt-4">
          {podeBuscar ? (
            <Card className="hover-raise space-y-4 p-4">
              <div>
                <p className="mb-2 text-sm font-medium">{textos.onde}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cidade">{textos.cidade}</Label>
                    <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder={textos.exemploCidade} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="uf">{textos.estado}</Label>
                    <Input id="uf" value={uf} onChange={(e) => setUf(e.target.value)} placeholder="SC" maxLength={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="raio">{textos.raio}</Label>
                    <Input id="raio" type="number" min={1} max={500} value={raio} onChange={(e) => setRaio(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="maximo">{textos.maximo}</Label>
                    <Input id="maximo" type="number" min={1} max={10000} value={maximo} onChange={(e) => setMaximo(e.target.value)} />
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
                  {t("Valem nos resultados — a busca encontra todas as empresas da região e estes filtros ficam aplicados ao abrir.")}
                </p>
              </div>
              <Button onClick={criar} disabled={criando}>
                {criando ? textos.buscando : textos.buscar}
              </Button>
            </Card>
          ) : (
            <NexusEmptyState
              icon={LockKey}
              headline={t("Criar busca exige papel de atendente ou superior.")}
            />
          )}
        </TabsContent>

        <TabsContent value="pesquisas" className="mt-4">
          {listaBuscas.length === 0 ? (
            <NexusEmptyState icon={MagnifyingGlass} headline={textos.vazias} />
          ) : (
            <ul className="space-y-3">
              {listaBuscas.map((b) => {
                const pct = b.total_celulas > 0 ? Math.round((b.celulas_processadas / b.total_celulas) * 100) : 0;
                const ativa = b.status === "queued" || b.status === "running";
                return (
                  <li key={b.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong>{b.categorias.join(", ")}</strong>
                      <span className="text-muted-foreground">
                        {[b.cidade, b.estado].filter(Boolean).join("/")} · {b.raio_km} km
                      </span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COR[b.status] ?? ""}`}>
                        {t(ROTULO_STATUS_BUSCA[b.status as keyof typeof ROTULO_STATUS_BUSCA] ?? b.status)}
                      </span>
                    </div>
                    {(ativa || b.total_celulas > 0) && (
                      <div className="mt-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {textos.progresso} {pct}% · {textos.encontradas} {b.encontradas} · {textos.novas} {b.novas} ·{" "}
                          {textos.duplicadas} {b.duplicadas} · {textos.erros} {b.erros} ·{" "}
                          {textos.custo}{" "}
                          {comoMoeda(b.custo_estimado_cents, "BRL")}
                        </p>
                      </div>
                    )}
                    {b.ultimo_erro && (
                      <p className="mt-1 text-xs text-destructive">{b.ultimo_erro}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={hrefEmpresas(b.id)}>{textos.verEmpresas}</Link>
                      </Button>
                      {podeBuscar && b.status === "running" && (
                        <Button size="sm" variant="outline" onClick={() => void acao(b.id, "pause")}>
                          {textos.pausar}
                        </Button>
                      )}
                      {podeBuscar && b.status === "paused" && (
                        <Button size="sm" variant="outline" onClick={() => void acao(b.id, "resume")}>
                          {textos.continuar}
                        </Button>
                      )}
                      {podeBuscar && (ativa || b.status === "paused") && (
                        <Button size="sm" variant="ghost" onClick={() => void acao(b.id, "cancel")}>
                          {textos.cancelar}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="empresas" className="mt-4">
          <EmpresasTab podeOperar={podeBuscar} usuarioId={usuarioId} />
        </TabsContent>

        <TabsContent value="mercado" className="mt-4">
          <MercadoTab />
        </TabsContent>

        <TabsContent value="campanhas" className="mt-4">
          <CampanhasTab categorias={categorias} podeOperar={podeBuscar} />
        </TabsContent>

        {podeGerenciar && (
          <TabsContent value="config" className="mt-4">
            <ConfigTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

