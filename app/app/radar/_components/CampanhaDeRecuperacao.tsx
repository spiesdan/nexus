"use client";

import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ClienteInativo } from "@/lib/comercial/inatividade";

/** O mesmo teto da prospecção: a rotação anti-ban tem 1..5 variações. */
const MENSAGENS_MAX = 5;

interface Janela {
  inicio: string;
  fim: string;
}

const JANELAS_PADRAO: Janela[] = [
  { inicio: "07:00", fim: "12:00" },
  { inicio: "13:00", fim: "19:00" },
];

function diaIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * CRIAR CAMPANHA DE RECUPERAÇÃO a partir do radar.
 *
 * A lista do radar é o público: clientes que já compraram e pararam. O
 * formulário é a AGENDA da campanha — as mesmas janelas, período, variações de
 * mensagem e cota da prospecção, porque o motor do tick é o MESMO
 * (`lib/prospeccao/agendado.ts`): uma mensagem por minuto, dentro da janela, no
 * período, respeitando a cota da campanha E a do número (warm-up), até a lista
 * acabar.
 *
 * O que NÃO existe aqui é o que não faz sentido para cliente: categoria e
 * cidade. A audiência são contatos que já compraram — não há recorte a fazer.
 *
 * Só entra quem tem telefone no cadastro: contato sem telefone é uma linha que
 * o tick pularia em silêncio, e a tela diz quantos ficaram de fora em vez de
 * prometer uma lista que não vai sair.
 */
export function CampanhaDeRecuperacao({ contatos }: { contatos: ClienteInativo[] }) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [nome, setNome] = React.useState("");
  const [mensagens, setMensagens] = React.useState<string[]>([""]);
  const [janelas, setJanelas] = React.useState<Janela[]>(JANELAS_PADRAO);
  const [inicio, setInicio] = React.useState("");
  const [fim, setFim] = React.useState("");
  const [cota, setCota] = React.useState("50");
  const [salvando, setSalvando] = React.useState(false);

  const comFone = React.useMemo(
    () => contatos.filter((c) => (c.telefone ?? "").trim() !== ""),
    [contatos],
  );
  const semFone = contatos.length - comFone.length;

  // As datas entram na ABERTURA, não no estado inicial: o componente é
  // renderizado no servidor antes de existir no navegador, e `new Date()` nos
  // dois lados dá horas diferentes — é o mesmo #418 que a lista de pedidos já
  // pagou para aprender.
  function abrir() {
    const hoje = new Date();
    const depois = new Date(hoje);
    depois.setDate(depois.getDate() + 5);
    setNome(`${t("Recuperação")} — ${comFone.length} ${t("clientes")}`);
    setMensagens([""]);
    setJanelas(JANELAS_PADRAO);
    setInicio(diaIso(hoje));
    setFim(diaIso(depois));
    setCota("50");
    setAberto(true);
  }

  const mensagensValidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");
  const podeSalvar =
    !salvando &&
    nome.trim().length >= 2 &&
    comFone.length > 0 &&
    mensagensValidas.length > 0 &&
    (!inicio || !fim || fim >= inicio);

  async function criar() {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await apiClient.post("/api/v1/prospecting/campaigns/recuperacao", {
        nome: nome.trim(),
        contato_ids: comFone.map((c) => c.contact_id),
        mensagens: mensagensValidas,
        janelas: janelas.filter((j) => j.inicio && j.fim && j.inicio < j.fim),
        data_inicio: inicio || null,
        data_fim: fim || null,
        limite_diario: Number(cota) > 0 ? Number(cota) : undefined,
      });
      toast.success(t("Campanha de recuperação agendada. Ela aparece na aba Campanhas da prospecção."));
      setAberto(false);
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={abrir} disabled={comFone.length === 0}>
        {t("Criar campanha de recuperação")}
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Campanha de recuperação")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("Vai falar com")} <strong>{comFone.length}</strong>{" "}
              {t("clientes que pararam de comprar, uma mensagem por minuto, dentro das janelas abaixo.")}
              {semFone > 0 ? ` ${semFone} ${t("ficaram de fora por não ter telefone no cadastro.")}` : ""}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="rec-nome">{t("Nome da campanha")}</Label>
              <Input
                id="rec-nome"
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
                <Label htmlFor="rec-inicio">{t("Começa em")}</Label>
                <Input
                  id="rec-inicio"
                  type="date"
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-fim">{t("Termina em")}</Label>
                <Input
                  id="rec-fim"
                  type="date"
                  value={fim}
                  onChange={(e) => setFim(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-cota">{t("Máximo por dia")}</Label>
                <Input
                  id="rec-cota"
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
                "O WhatsApp da empresa também tem um limite diário próprio (o aquecimento do número). Vale o menor dos dois — a campanha nunca acelera por cima do número.",
              )}
            </p>
            {inicio && fim && fim < inicio && (
              <p className="text-xs text-destructive">
                {t("A data final não pode ser anterior à inicial.")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={salvando}>
              {t("Cancelar")}
            </Button>
            <Button onClick={() => void criar()} disabled={!podeSalvar}>
              {salvando ? t("Agendando…") : t("Agendar campanha")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
