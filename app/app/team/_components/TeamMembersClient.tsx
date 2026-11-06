"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useState } from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";

import { useT } from "@/hooks/i18n/useT";
import { useTeamMembers, type TeamMember } from "@/hooks/team/useTeamMembers";
import { useChangeRole } from "@/hooks/team/useChangeRole";
import { useRevokeMember } from "@/hooks/team/useRevokeMember";
import { useMotoristaMember } from "@/hooks/team/useMotoristaMember";
import { useCanaisMember } from "@/hooks/team/useCanaisMember";
import { useChannelSessions, channelLabel } from "@/hooks/channels/useChannelSessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DESCRICAO_DO_PAPEL, PAPEIS_HUMANOS, ROTULO_DO_PAPEL, rotuloDoPapel } from "@/lib/auth/types";
import { type Role } from "@/lib/schemas/team";
import { DotsThree } from "@/lib/ui/icons";
import { SetorCell } from "./SetorCell";
import { NomeCell } from "./NomeCell";

interface Props {
  currentUserId: string;
  canManage: boolean;
}

export function TeamMembersClient({ currentUserId, canManage }: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const { data, isLoading, isError } = useTeamMembers();
  const changeRole = useChangeRole();
  const revoke = useRevokeMember();
  const motorista = useMotoristaMember();
  const canais = useCanaisMember();
  const { data: canaisDaOrg } = useChannelSessions();

  const [revokeDialog, setRevokeDialog] = useState<TeamMember | null>(null);
  const [canaisDialog, setCanaisDialog] = useState<TeamMember | null>(null);
  // `null` = todos os números; a lista = só esses. `verTodos` separa os dois
  // estados na tela, e `selecionados` guarda o rascunho até o Salvar.
  const [verTodosOsCanais, setVerTodosOsCanais] = useState(true);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  function abrirCanaisDoMembro(m: TeamMember) {
    setCanaisDialog(m);
    setVerTodosOsCanais(m.canais_permitidos == null);
    setSelecionados(m.canais_permitidos ?? []);
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">{t("Erro ao carregar membros.")}</p>;
  }
  const members = data?.data ?? [];
  if (members.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("Nenhum membro ativo.")}</p>;
  }

  const canaisDaOrgLista = canaisDaOrg ?? [];
  // Ids da allowlist que não estão mais na lista de canais ativos (arquivados).
  // Continuam marcados e removíveis: salvar sem enxergá-los os apagaria em
  // silêncio, e a permissão evaporaria na reconexão do número.
  const canaisForaDaLista = selecionados.filter(
    (id) => !canaisDaOrgLista.some((c) => c.id === id),
  );

  return (
    <>
      <div className="rounded-2xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Membro")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("Setor")}</TableHead>
                <TableHead>{t("Papel")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("Modo entregador")}</TableHead>
                <TableHead className="hidden xl:table-cell">{t("Números")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("Última atividade")}</TableHead>
                {canManage ? <TableHead className="w-[80px]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user_id}>
                  <TableCell>
                    <NomeCell
                        userId={m.user_id}
                        nome={m.full_name}
                        email={m.email}
                        podeEditar={canManage && m.user_id !== currentUserId}
                      />
                    {m.email ? (
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <SetorCell
                      userId={m.user_id}
                      nome={m.full_name ?? m.email ?? m.user_id}
                      setor={m.setor}
                      podeEditar={canManage && m.user_id !== currentUserId}
                    />
                  </TableCell>
                  <TableCell>
                    {canManage && m.user_id !== currentUserId ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          changeRole.mutate({ userId: m.user_id, role: v as Role })
                        }
                      >
                        <SelectTrigger
                          className="w-[130px]"
                          aria-label={`${t("Papel de")} ${m.full_name ?? m.email ?? m.user_id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAPEIS_HUMANOS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROTULO_DO_PAPEL[r]}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {DESCRICAO_DO_PAPEL[r]}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">{rotuloDoPapel(m.role)}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {m.motorista ? (
                      <Badge variant="outline" title={t("Entra direto na expedição, sem menu.")}>
                        {t("Entregador")}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    {m.canais_permitidos == null ? (
                      <Badge variant="outline" title={t("Enxerga todos os números da organização.")}>
                        {t("Todos")}
                      </Badge>
                    ) : m.canais_permitidos.length === 0 ? (
                      <Badge variant="outline" title={t("Não enxerga nenhum número no inbox.")}>
                        {t("Nenhum")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" title={t("Enxerga só os números liberados.")}>
                        {m.canais_permitidos.length}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.accepted_at ? (
                      <Badge variant="default">{t("Aceito")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("Pendente")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {m.last_sign_in_at
                      ? new Date(m.last_sign_in_at).toLocaleString(tagDoIdioma)
                      : "—"}
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t("Ações")}>
                            <DotsThree size={20} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/*
                            "Números que enxerga" aparece também para o PRÓPRIO
                            membro, ao contrário de papel/setor/revogar. A razão
                            é o caso que originou a 0296: a conta administrativa
                            costuma ser o único admin da empresa, e sem esta
                            linha ela não teria como se restringir aos avisos de
                            carga — precisaria criar um segundo admin só para
                            isso. Não é fronteira de segurança (o admin sempre
                            pode voltar a "todos"); é a organização do trabalho
                            dele.
                          */}
                          <DropdownMenuItem onClick={() => abrirCanaisDoMembro(m)}>
                            {t("Números que enxerga")}
                          </DropdownMenuItem>
                          {m.user_id !== currentUserId ? (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  motorista.mutate({
                                    userId: m.user_id,
                                    motorista: !m.motorista,
                                  })
                                }
                              >
                                {m.motorista
                                  ? t("Desligar modo entregador")
                                  : t("Ligar modo entregador")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setRevokeDialog(m)}
                              >
                                {t("Revogar acesso")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!canaisDialog} onOpenChange={(o) => !o && setCanaisDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Números que enxerga")}</DialogTitle>
            <DialogDescription>
              {canaisDialog?.full_name ?? canaisDialog?.email ?? canaisDialog?.user_id}{" "}
              {t(
                "vê no inbox apenas os números liberados aqui. As conversas dos demais números continuam existindo para quem tem acesso a eles.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="ver-todos-os-canais" className="text-sm">
                  {t("Todos os números")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("Desligue para escolher número por número.")}
                </p>
              </div>
              <Switch
                id="ver-todos-os-canais"
                checked={verTodosOsCanais}
                onCheckedChange={setVerTodosOsCanais}
              />
            </div>

            {!verTodosOsCanais ? (
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {canaisDaOrgLista.length === 0 && canaisForaDaLista.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Nenhum número conectado nesta organização.")}
                  </p>
                ) : null}

                {canaisDaOrgLista.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`canal-${c.id}`} className="text-sm font-normal">
                      {channelLabel(c, t)}
                    </Label>
                    <Switch
                      id={`canal-${c.id}`}
                      checked={selecionados.includes(c.id)}
                      onCheckedChange={(ligado) =>
                        setSelecionados((atual) =>
                          ligado ? [...atual, c.id] : atual.filter((id) => id !== c.id),
                        )
                      }
                    />
                  </div>
                ))}

                {canaisForaDaLista.map((id) => (
                  <div key={id} className="flex items-center justify-between gap-3">
                    <Label
                      htmlFor={`canal-fora-${id}`}
                      className="text-sm font-normal text-muted-foreground"
                    >
                      {t("Número removido")} · {id.slice(0, 8)}
                    </Label>
                    <Switch
                      id={`canal-fora-${id}`}
                      checked
                      onCheckedChange={() =>
                        setSelecionados((atual) => atual.filter((x) => x !== id))
                      }
                    />
                  </div>
                ))}

                {selecionados.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("Sem nenhum número, este membro não vê conversa alguma no inbox.")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCanaisDialog(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              disabled={canais.isPending}
              onClick={async () => {
                if (!canaisDialog) return;
                try {
                  await canais.mutateAsync({
                    userId: canaisDialog.user_id,
                    canais_permitidos: verTodosOsCanais ? null : selecionados,
                  });
                  setCanaisDialog(null);
                } catch {
                  /* showApiError já disparou no hook */
                }
              }}
            >
              {t("Salvar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeDialog} onOpenChange={(o) => !o && setRevokeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Revogar acesso")}</DialogTitle>
            <DialogDescription>
              {revokeDialog?.email ?? revokeDialog?.user_id}{" "}
              {t("perderá acesso ao tenant. Esta ação pode ser desfeita reconvidando o membro.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeDialog(null)}>
              {t("Cancelar")}
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={async () => {
                if (!revokeDialog) return;
                try {
                  await revoke.mutateAsync(revokeDialog.user_id);
                  toast.success(t("Acesso revogado."));
                  setRevokeDialog(null);
                } catch {
                  /* showApiError already triggered by the hook */
                }
              }}
            >
              {t("Revogar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
