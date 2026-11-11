"use client";

import * as React from "react";
import { UsersThree } from "@phosphor-icons/react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { DIAS_UTEIS, DiasDaSemana } from "@/components/prospeccao/DiasDaSemana";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/** O mesmo teto da prospecção: a rotação anti-ban tem 1..5 variações. */
const MENSAGENS_MAX = 5;
/** As três caixas que a tela abre — o mesmo 3 do disparo e da recuperação. */
const MENSAGENS_NA_TELA = 3;

interface Janela {
  inicio: string;
  fim: string;
}

const JANELAS_PADRAO: Janela[] = [
  { inicio: "07:00", fim: "12:00" },
  { inicio: "13:00", fim: "19:00" },
];

interface CidadeOpcao {
  cidade: string;
  uf: string | null;
  total: number;
}

interface NumeroOpcao {
  id: string;
  rotulo: string;
  telefone: string | null;
}

interface LinhaDaPrevia {
  contact_id: string;
  nome: string;
  cidade: string;
  telefone_e164: string | null;
  pedidos: number;
  elegivel: boolean;
  em_campanha: boolean;
}

interface Previa {
  total: number;
  com_telefone: number;
  sem_telefone: number;
  em_campanha: number;
  elegiveis: number;
  completa: boolean;
  resumo: string;
  linhas: LinhaDaPrevia[];
}

function diaIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function chaveDaCidade(c: { cidade: string; uf: string | null }): string {
  return `${c.cidade.trim().toLocaleLowerCase("pt-BR")}|${(c.uf ?? "").trim().toUpperCase()}`;
}

/**
 * CRIAR CAMPANHA POR REGIÃO — clientes que já compraram nas cidades escolhidas.
 *
 * A tela pergunta três coisas, nesta ordem: ONDE já atendemos (cidades com
 * contagem real), DE QUAL NÚMERO sai (só os não oficiais que aceitam texto
 * livre) e QUANDO/COMO fala (janelas, período, cota, variações). O resumo da
 * prévia é a promessa verificável: quantos entram agora, quantos ficaram sem
 * telefone e quantos já estão em outra campanha.
 *
 * O envio é o motor único (`lib/prospeccao/agendado.ts`): UMA mensagem por
 * minuto, dentro da janela, no período, respeitando a cota da campanha E a do
 * número — o aquecimento do WhatsApp da empresa.
 */
export function CriarCampanhaPorRegiao({
  aberto,
  aoMudar,
  aoCriar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoCriar: () => void;
}) {
  const t = useT();
  const [cidades, setCidades] = React.useState<CidadeOpcao[] | null>(null);
  const [busca, setBusca] = React.useState("");
  const [selecionadas, setSelecionadas] = React.useState<CidadeOpcao[]>([]);
  const [previa, setPrevia] = React.useState<Previa | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = React.useState(false);
  const [numeros, setNumeros] = React.useState<NumeroOpcao[] | null>(null);
  const [sessionId, setSessionId] = React.useState("");
  const [nome, setNome] = React.useState(() => t("Campanha por região"));
  const [mensagens, setMensagens] = React.useState<string[]>(() =>
    Array.from({ length: MENSAGENS_NA_TELA }, () => ""),
  );
  const [janelas, setJanelas] = React.useState<Janela[]>(JANELAS_PADRAO);
  const [dias, setDias] = React.useState<number[]>(DIAS_UTEIS);
  const [inicio, setInicio] = React.useState(() => diaIso(new Date()));
  const [fim, setFim] = React.useState(() => {
    const depois = new Date();
    depois.setDate(depois.getDate() + 5);
    return diaIso(depois);
  });
  const [cota, setCota] = React.useState("50");
  const [salvando, setSalvando] = React.useState(false);

  // Opções e números: as duas leituras são independentes e a tela abre com as
  // duas prontas. O número já vem pré-selecionado quando há só um. O diálogo é
  // MONTADO a cada abertura (`criando && <...>`), então o estado nasce limpo
  // sem um efeito de reset — e não há render em cascata.
  React.useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    void Promise.all([
      apiClient.get<{ data?: { cidades?: CidadeOpcao[] } }>(
        "/api/v1/prospecting/campaigns/regiao/cidades",
      ),
      apiClient.get<{ data?: { numeros?: NumeroOpcao[] } }>(
        "/api/v1/prospecting/campaigns/numeros?tipo=texto",
      ),
    ])
      .then(([resCidades, resNumeros]) => {
        if (cancelado) return;
        setCidades(resCidades?.data?.cidades ?? []);
        const lista = resNumeros?.data?.numeros ?? [];
        setNumeros(lista);
        setSessionId(lista[0]?.id ?? "");
      })
      .catch((e) => {
        if (!cancelado) showApiError(e);
      });
    return () => {
      cancelado = true;
    };
  }, [aberto]);

  // A prévia acompanha a seleção. Cada troca de cidade recalcula o público com
  // a MESMA função do POST — a tela não promete o que a criação recusa. O
  // "carregando" é ligado no evento (`alternar`), não no efeito: setState
  // síncrono em efeito é render em cascata.
  React.useEffect(() => {
    if (!aberto || selecionadas.length === 0) return;
    let cancelado = false;
    void apiClient
      .post<{ data?: Previa }>("/api/v1/prospecting/campaigns/regiao/preview", {
        cidades: selecionadas.map((c) => ({
          cidade: c.cidade,
          ...(c.uf ? { estado: c.uf } : {}),
        })),
      })
      .then((r) => {
        if (!cancelado) setPrevia(r?.data ?? null);
      })
      .catch((e) => {
        if (!cancelado) {
          setPrevia(null);
          showApiError(e);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregandoPrevia(false);
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, selecionadas]);

  const cidadesFiltradas = React.useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return cidades ?? [];
    return (cidades ?? []).filter((c) =>
      `${c.cidade} ${c.uf ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo),
    );
  }, [cidades, busca]);

  const mensagensValidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");
  const podeSalvar =
    !salvando &&
    nome.trim().length >= 2 &&
    selecionadas.length > 0 &&
    sessionId !== "" &&
    (previa?.elegiveis ?? 0) > 0 &&
    mensagensValidas.length > 0 &&
    dias.length > 0 &&
    (!inicio || !fim || fim >= inicio);

  /**
   * Marca/desmarca uma cidade e já invalida a prévia anterior.
   *
   * O `carregandoPrevia` nasce AQUI, no evento, e não no efeito que busca: um
   * `setState` síncrono no corpo do efeito é render em cascata (a regra do
   * React 19). Enquanto a nova prévia não chega, `previa` fica `null` — a tela
   * mostra "Calculando o público…" em vez do número da seleção anterior, que
   * já não vale e faria o botão de criar parecer liberado por engano.
   */
  function alternar(cidade: CidadeOpcao) {
    const chave = chaveDaCidade(cidade);
    setPrevia(null);
    setCarregandoPrevia(true);
    setSelecionadas((atual) => {
      const existe = atual.some((c) => chaveDaCidade(c) === chave);
      // Desmarcar a última cidade não tem prévia para buscar: o efeito sai
      // cedo e o "carregando" seria uma promessa que ninguém cumpre.
      if (existe && atual.length === 1) setCarregandoPrevia(false);
      if (existe) return atual.filter((c) => chaveDaCidade(c) !== chave);
      return [...atual, cidade];
    });
  }

  async function criar() {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      const resposta = await apiClient.post<{
        data?: { id: string; contatos: number; sem_telefone: number };
      }>("/api/v1/prospecting/campaigns/regiao", {
        nome: nome.trim(),
        cidades: selecionadas.map((c) => ({
          cidade: c.cidade,
          ...(c.uf ? { estado: c.uf } : {}),
        })),
        session_id: sessionId,
        mensagens: mensagensValidas,
        janelas: janelas
          .filter((j) => j.inicio && j.fim && j.inicio < j.fim)
          .map((j) => ({ ...j, dias })),
        data_inicio: inicio || null,
        data_fim: fim || null,
        limite_diario: Number(cota) > 0 ? Number(cota) : undefined,
      });
      const contatos = resposta?.data?.contatos ?? 0;
      toast.success(
        `${t("Campanha criada")} — ${contatos} ${contatos === 1 ? t("cliente") : t("clientes")} ${t("na fila, uma mensagem por minuto.")}`,
      );
      aoMudar(false);
      aoCriar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && aoMudar(false)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Campanha por região")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {t(
              "Vai falar com quem já comprou nas cidades escolhidas, uma mensagem por minuto, por um número não oficial.",
            )}
          </p>

          <div className="space-y-2">
            <Label>{t("Cidades onde já atendemos")}</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar cidade")}
            />
            <div className="max-h-44 overflow-y-auto rounded-md border p-2">
              {cidades === null ? (
                <p className="p-2 text-sm text-muted-foreground">{t("Carregando cidades…")}</p>
              ) : cidadesFiltradas.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  {t("Nenhuma cidade com cliente e telefone.")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {cidadesFiltradas.map((c) => {
                    const marcada = selecionadas.some(
                      (s) => chaveDaCidade(s) === chaveDaCidade(c),
                    );
                    return (
                      <button
                        key={chaveDaCidade(c)}
                        type="button"
                        aria-pressed={marcada}
                        onClick={() => alternar(c)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                          marcada
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted",
                        )}
                      >
                        {c.cidade}
                        {c.uf ? `/${c.uf}` : ""}
                        <span className="text-xs opacity-70">({c.total})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {selecionadas.length === 0 ? (
              <p className="text-muted-foreground">{t("Escolha ao menos uma cidade para ver quem entra.")}</p>
            ) : carregandoPrevia ? (
              <p className="text-muted-foreground">{t("Calculando o público…")}</p>
            ) : previa ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-medium">
                  <UsersThree className="size-4" aria-hidden />
                  {previa.resumo}
                </p>
                <p className="text-muted-foreground">
                  {previa.sem_telefone} {t("sem telefone")} · {previa.em_campanha}{" "}
                  {t("já em outra campanha")}
                  {previa.completa ? "" : ` · ${t("varredura parcial (teto de pedidos)")}`}
                </p>
                {previa.linhas.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {previa.linhas
                      .slice(0, 5)
                      .map((l) => l.nome)
                      .join(", ")}
                    {previa.linhas.length > 5 ? ` ${t("e outros")}` : ""}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">{t("Não foi possível calcular o público.")}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regiao-numero">{t("Número que vai enviar")}</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger id="regiao-numero">
                <SelectValue placeholder={t("Escolha o número")} />
              </SelectTrigger>
              <SelectContent>
                {(numeros ?? []).map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.rotulo}
                    {n.telefone ? ` · ${n.telefone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {numeros !== null && numeros.length === 0 && (
              <p className="text-xs text-destructive">
                {t("Nenhum número não oficial conectado. Conecte um número por QR em Conexões.")}
              </p>
            )}
            {numeros !== null && numeros.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Só números por QR aparecem aqui: a campanha envia texto livre, e o número oficial exige modelo aprovado.",
                )}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regiao-nome">{t("Nome da campanha")}</Label>
            <Input
              id="regiao-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("Mensagens (giram nesta ordem, uma por minuto)")}</Label>
            {mensagens.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <Textarea
                  value={m}
                  rows={2}
                  maxLength={4000}
                  placeholder={t("Escreva a mensagem")}
                  onChange={(e) =>
                    setMensagens((atual) =>
                      atual.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                />
                {mensagens.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMensagens((atual) => atual.filter((_, j) => j !== i))}
                  >
                    {t("Remover")}
                  </Button>
                )}
              </div>
            ))}
            {mensagens.length < MENSAGENS_MAX && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMensagens((atual) => [...atual, ""])}
              >
                {t("+ Variação")}
              </Button>
            )}
          </div>

          <DiasDaSemana dias={dias} onChange={setDias} idPrefixo="regiao" />

          <div className="space-y-2">
            <Label>{t("Janelas de envio")}</Label>
            {janelas.map((j, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="time"
                  className="w-32"
                  value={j.inicio}
                  onChange={(e) =>
                    setJanelas((atual) =>
                      atual.map((v, k) => (k === i ? { ...v, inicio: e.target.value } : v)),
                    )
                  }
                />
                <span className="text-sm text-muted-foreground">{t("até")}</span>
                <Input
                  type="time"
                  className="w-32"
                  value={j.fim}
                  onChange={(e) =>
                    setJanelas((atual) =>
                      atual.map((v, k) => (k === i ? { ...v, fim: e.target.value } : v)),
                    )
                  }
                />
                {janelas.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setJanelas((atual) => atual.filter((_, k) => k !== i))}
                  >
                    {t("Remover")}
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setJanelas((atual) => [...atual, { inicio: "19:00", fim: "21:00" }])}
            >
              {t("+ Janela")}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="regiao-inicio">{t("Começa em")}</Label>
              <Input
                id="regiao-inicio"
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regiao-fim">{t("Termina em")}</Label>
              <Input
                id="regiao-fim"
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regiao-cota">{t("Máximo por dia")}</Label>
              <Input
                id="regiao-cota"
                type="number"
                min={1}
                max={500}
                value={cota}
                onChange={(e) => setCota(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t(
              "O WhatsApp do número também tem um limite diário próprio (o aquecimento). Vale o menor dos dois — a campanha nunca acelera por cima do número.",
            )}
          </p>
          {inicio && fim && fim < inicio && (
            <p className="text-xs text-destructive">
              {t("A data final não pode ser anterior à inicial.")}
            </p>
          )}
          {selecionadas.length > 0 && previa?.elegiveis === 0 && (
            <p className="text-xs text-destructive">
              {t("Nenhum cliente destas cidades pode receber agora. Ajuste a seleção.")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => aoMudar(false)} disabled={salvando}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => void criar()} disabled={!podeSalvar}>
            {salvando ? t("Agendando…") : t("Agendar campanha")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
