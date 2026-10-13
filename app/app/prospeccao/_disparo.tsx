"use client";

/**
 * DISPARO EM LOTE — a mesma mensagem para as empresas marcadas.
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
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
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
  por_motivo: Array<{ motivo: string; rotulo: string; total: number }>;
  recusas: Array<{ nome: string; motivo: string }>;
}

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
  const [mensagem, setMensagem] = React.useState("");
  const [limite, setLimite] = React.useState("50");
  const [espaco, setEspaco] = React.useState("1200");
  const [plano, setPlano] = React.useState<Plano | null>(null);
  const [resultado, setResultado] = React.useState<ResultadoDoEnvio | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function chamar(dryRun: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = (await apiClient.post<{ data?: { plano?: Plano; resultado?: ResultadoDoEnvio } }>(
        "/api/v1/prospecting/prospects/disparar",
        {
          prospect_ids: ids,
          mensagem,
          limite: Number(limite) || 50,
          espaco_ms: Number(espaco) || 1200,
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
          <div className="space-y-1.5">
            <Label htmlFor="disparo-mensagem">{t("Mensagem padrão")}</Label>
            <textarea
              id="disparo-mensagem"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={5}
              placeholder={t("Ola! Somos do escritório X. Podemos ajudar com o quê?")}
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t("A mesma mensagem para todas. Quem responde entra na conversa no Inbox.")}
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
              <Label htmlFor="disparo-espaco">{t("Intervalo (ms)")}</Label>
              <Input
                id="disparo-espaco"
                type="number"
                min={0}
                max={60000}
                value={espaco}
                onChange={(e) => setEspaco(e.target.value)}
              />
            </div>
          </div>

          {!plano && !resultado && (
            <Button size="sm" disabled={mensagem.trim() === "" || ocupado} onClick={() => void chamar(true)}>
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
