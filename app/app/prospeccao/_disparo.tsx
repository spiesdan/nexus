"use client";

/**
 * DISPARO EM LOTE — até 3 variações de mensagem, alternadas 1→2→3→1, com
 * ritmo anti-ban (60s entre um envio e outro).
 *
 * ═══ POR QUE TRÊS MENSAGENS, E NÃO UMA ═══════════════════════════════════
 *
 * Mensagem idêntica 50 vezes seguidas para números que nunca falaram com a
 * gente é o padrão exato que o WhatsApp reconhece como spam — o dano não
 * aparece como erro, aparece como número banido semanas depois. Alternar três
 * textos quebra essa assinatura sem mudar o que o cliente recebe.
 *
 * Os campos são três OPÇÕES, não três envios: quem recebe recebe UMA. O 1º
 * pega a 1ª, o 2º a 2ª, o 3º a 3ª, e o 4º volta para a 1ª. Só a primeira é
 * obrigatória — quem quer mandar um texto único continua preenchendo um campo.
 *
 * ═══ POR QUE A SIMULAÇÃO VEM ANTES DO BOTÃO DE ENVIAR ═══════════════════
 *
 * Não é etapa de confirmação, é o que segura a tela. Enviar mensagem de
 * WhatsApp é das poucas coisas em que o erro não aparece como erro: o número
 * é banido e o dano só se vê semanas depois. Então o botão de enviar só
 * EXISTE depois que a simulação voltou, e vem com os números da simulação
 * escritos nele — "Enviar para 312 empresas" — porque um botão que promete
 * uma quantidade genérica é um botão que o operador clica sem ler.
 *
 * E a simulação é o que responde se dá para mandar AGORA: com o número de
 * WhatsApp desconectado, o resultado é "312 prontos, mas não há sessão
 * conectada" — e o botão fica desabilitado, com o motivo escrito embaixo.
 * Sem isso o operador descobre que mandou 300 mensagens para lugar nenhum
 * depois.
 *
 * A simulação também mostra a ROTAÇÃO (`rotacao`): qual das opções cada um
 * dos primeiros recebe. Três caixas de texto sem isso são uma promessa que o
 * operador não tem como conferir.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { ESPACO_ANTIBAN_MS } from "@/lib/prospeccao/disparo";
import { useT } from "@/hooks/i18n/useT";

/** O que a rota devolve na simulação. Espelha `resumo` do `route.ts`. */
interface Plano {
  simulacao: boolean;
  pode_enviar: boolean;
  bloqueio: string | null;
  selecionados: number;
  encontrados: number;
  serao_enviados: number;
  serao_recusados: number;
  estouraram_a_cota: number;
  ja_enviados_hoje: number;
  limite: number;
  espaco_ms: number;
  duracao_prevista_ms: number;
  /** Quantas variações estão em rotação (1 = texto único). */
  variacoes: number;
  /** Os primeiros envios, cada um com o número da opção (1, 2, 3…). */
  rotacao: number[];
  por_motivo: Array<{ motivo: string; rotulo: string; total: number }>;
  recusas: Array<{ nome: string; motivo: string }>;
}

/**
 * Quantas caixas de mensagem a tela oferece — o pedido do produto: três
 * opções. É a TELA que limita a três, não a API (que aceita até
 * `MENSAGENS_POR_DISPARO_MAX`): quem usa a tela quer o caso simples e
 * repetível, não uma matriz de textos.
 */
const OPCOES_DE_MENSAGEM = 3;

/** O padrão do campo de intervalo, em segundos — a fonte é o anti-ban. */
const SEGUNDOS_PADRAO = ESPACO_ANTIBAN_MS / 1000;

interface ResultadoDoEnvio {
  enviados: number;
  falhas: number;
  detalhe_falhas: Array<{ nome: string; erro: string }>;
}

/**
 * O componente NASCE do zero a cada abertura — quem abre passa um `key` novo.
 *
 * Não é detalhe: o plano simulado é de uma SELEÇÃO. Sobreviver para a próxima
 * abertura faria a tela dizer "vão receber 312" sobre uma lista que não
 * está mais marcada, e o númeroMentiria sem parecer errado. Remontar é mais
 * barato e mais honesto que sincronizar estado dentro de efeito.
 */
export function DialogoDisparo({
  ids,
  aberto,
  onFechar,
  onConcluido,
}: {
  ids: string[];
  aberto: boolean;
  onFechar: () => void;
  onConcluido: () => void;
}) {
  const t = useT();
  // As opções de texto. Só a primeira é obrigatória: campo vazio é opção que
  // não existe, e some da rotação antes de sair daqui.
  const [mensagens, setMensagens] = React.useState<string[]>(() =>
    Array.from({ length: OPCOES_DE_MENSAGEM }, () => ""),
  );
  const [limite, setLimite] = React.useState("50");
  // 60s, não 1,2s. O espaçamento curto é o da CONVERSA (a automação responde
  // na hora); disparo frio em massa é outra coisa, e é aqui que o número
  // queima. Quem quiser mais rápido muda o campo — mas o padrão seguro é o
  // que sai da caixa.
  const [espaco, setEspaco] = React.useState(String(SEGUNDOS_PADRAO));
  const [plano, setPlano] = React.useState<Plano | null>(null);
  const [resultado, setResultado] = React.useState<ResultadoDoEnvio | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // O que de fato vai como `mensagens`: sem vazios, sem espaço nas pontas.
  const preenchidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");

  // A tela fala em SEGUNDOS (é assim que se pensa em ritmo); a API, em ms. O
  // campo vazio volta ao padrão seguro em vez de virar 0 — e um 0 digitado de
  // propósito continua valendo, porque é a saída de emergência de quem está
  // testando.
  const segundos = espaco.trim() === "" ? SEGUNDOS_PADRAO : Number(espaco);
  const espacoMs = Number.isFinite(segundos)
    ? Math.min(60000, Math.max(0, Math.round(segundos * 1000)))
    : 60000;

  function trocarMensagem(i: number, valor: string) {
    setMensagens((atual) => atual.map((m, j) => (j === i ? valor : m)));
  }

  async function chamar(dryRun: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = (await apiClient.post<{ data?: { plano?: Plano; resultado?: ResultadoDoEnvio } }>(
        "/api/v1/prospecting/prospects/disparar",
        {
          prospect_ids: ids,
          mensagens: preenchidas,
          limite: Number(limite) || 50,
          espaco_ms: espacoMs,
          dry_run: dryRun,
        },
      )) as { data?: { plano?: Plano; resultado?: ResultadoDoEnvio } };
      const p = r?.data?.plano ?? null;
      // A rota devolve 409 com o plano quando não há sessão. O `apiClient`
      // lança nesse caso; aqui o que importa é o que foi lido.
      setPlano(p);
      if (!dryRun) {
        setResultado(r?.data?.resultado ?? null);
        onConcluido();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("Não foi possível montar o disparo.");
      setErro(msg);
    } finally {
      setOcupado(false);
    }
  }

  const minutos = plano ? Math.ceil(plano.duracao_prevista_ms / 60000) : 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`Enviar mensagem para ${ids.length} empresas`)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="disparo-mensagem-0">{t("Mensagem 1 (sai primeiro)")}</Label>
              <textarea
                id="disparo-mensagem-0"
                value={mensagens[0] ?? ""}
                onChange={(e) => trocarMensagem(0, e.target.value)}
                rows={4}
                placeholder={t("Ola! Somos do escritório X. Podemos ajudar com o quê?")}
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </div>

            {[1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Label htmlFor={`disparo-mensagem-${i}`}>{t(`Mensagem ${i + 1} (opcional)`)}</Label>
                <textarea
                  id={`disparo-mensagem-${i}`}
                  value={mensagens[i] ?? ""}
                  onChange={(e) => trocarMensagem(i, e.target.value)}
                  rows={3}
                  placeholder={t("Outra forma de dizer a mesma coisa")}
                  className="w-full rounded-lg border bg-background p-3 text-sm"
                />
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              {preenchidas.length > 1
                ? t(
                    `As ${preenchidas.length} mensagens se alternam: a 1ª no primeiro envio, a 2ª no segundo, e assim por diante, voltando à 1ª. Cada empresa recebe UMA. Quem responde entra na conversa no Inbox.`,
                  )
                : t("A mesma mensagem para todas. Quem responde entra na conversa no Inbox.")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="disparo-limite">{t("Máx. por dia")}</Label>
              <Input
                id="disparo-limite"
                type="number"
                min={1}
                max={500}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>
            <div className="w-40 space-y-1.5">
              <Label htmlFor="disparo-espaco">{t("Intervalo (s)")}</Label>
              <Input
                id="disparo-espaco"
                type="number"
                min={0}
                max={60}
                value={espaco}
                onChange={(e) => setEspaco(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t(
              "Espera esse tempo entre uma mensagem e a seguinte. 60s é o ritmo que não queima o número — apertar aqui é mais rápido hoje e mais curto amanhã.",
            )}
          </p>

          {!plano && !resultado && (
            <Button size="sm" disabled={preenchidas.length === 0 || ocupado} onClick={() => void chamar(true)}>
              {t("Simular envio")}
            </Button>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {plano && (
            <div className="space-y-3 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <span>
                  <strong>{plano.serao_enviados}</strong> {t("vão receber")}
                </span>
                <span>
                  <strong>{plano.serao_recusados}</strong> {t("não vão")}
                </span>
                {minutos > 0 && (
                  <span>
                    {t("duração")} <strong>{minutos}</strong> {t("min")}
                  </span>
                )}
              </div>

              {!plano.pode_enviar && (
                <p className="rounded-lg bg-amber-500/15 p-2 text-xs">
                  {t(
                    "Não há número de WhatsApp conectado. Escaneie o QR Code em Conexões para liberar o envio.",
                  )}
                </p>
              )}

              {plano.ja_enviados_hoje > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("Já saíram hoje nesta instalação:")} {plano.ja_enviados_hoje}
                </p>
              )}

              {plano.variacoes > 1 && (
                <div className="text-xs">
                  <p className="mb-1 font-medium">
                    {t(`${plano.variacoes} mensagens alternando`)}
                  </p>
                  <p className="text-muted-foreground">
                    {t("A ordem dos primeiros envios será:")}{" "}
                    <strong>{plano.rotacao.join(" → ")}</strong>
                    {plano.serao_enviados > plano.rotacao.length ? " → …" : ""}
                  </p>
                </div>
              )}

              {plano.por_motivo.length > 0 && (
                <div className="text-xs">
                  <p className="mb-1 font-medium">{t("Por que não vão:")}</p>
                  <ul className="space-y-0.5">
                    {plano.por_motivo.map((m) => (
                      <li key={m.motivo} className="text-muted-foreground">
                        {m.rotulo}: <strong>{m.total}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {resultado && (
            <div className="space-y-1 rounded-xl border p-3 text-sm">
              <p>
                {t("Enviadas")}: <strong>{resultado.enviados}</strong> · {t("Falhas")}:{" "}
                <strong>{resultado.falhas}</strong>
              </p>
              {resultado.detalhe_falhas.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {resultado.detalhe_falhas.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      {f.nome}: {f.erro}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {plano?.pode_enviar && !resultado && (
            <Button disabled={ocupado} onClick={() => void chamar(false)}>
              {t(`Enviar para ${plano.serao_enviados} empresas`)}
            </Button>
          )}
          <Button variant="outline" onClick={onFechar}>
            {resultado ? t("Fechar") : t("Cancelar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
