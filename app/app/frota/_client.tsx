"use client";

import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { MotoristaDaFrota, VeiculoDaFrota } from "@/lib/schemas/frota";

/**
 * Cadastro da frota — veículos e motoristas.
 *
 * A tela edita no lugar (a lista é curta e o operador está no galpão, não numa
 * tela de formulário): clicar em "Editar" transforma a linha em campos, salvar
 * faz PATCH e devolve a linha atualizada. Criar é uma linha nova no topo.
 *
 * Capacidade é a única informação aqui que muda decisão de rota. Por isso o
 * campo vazio é mostrado como "não informada" e não como 0: veículo sem
 * capacidade declarada continua podendo rodar, e o otimizador declara a
 * restrição como não aplicada em vez de recusar a carga inteira.
 */
export function FrotaClient({
  inicialVeiculos,
  inicialMotoristas,
  podeEditar,
}: {
  inicialVeiculos: VeiculoDaFrota[];
  inicialMotoristas: MotoristaDaFrota[];
  podeEditar: boolean;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const [veiculos, setVeiculos] = React.useState(inicialVeiculos);
  const [motoristas, setMotoristas] = React.useState(inicialMotoristas);

  return (
    <Tabs defaultValue="veiculos" className="min-w-0">
      <TabsList>
        <TabsTrigger value="veiculos">{t("Veículos")}</TabsTrigger>
        <TabsTrigger value="motoristas">{t("Motoristas")}</TabsTrigger>
      </TabsList>

      <TabsContent value="veiculos" className="mt-4">
        <Veiculos
          veiculos={veiculos}
          setVeiculos={setVeiculos}
          podeEditar={podeEditar}
          confirmar={confirmar}
        />
      </TabsContent>

      <TabsContent value="motoristas" className="mt-4">
        <Motoristas
          motoristas={motoristas}
          setMotoristas={setMotoristas}
          podeEditar={podeEditar}
          confirmar={confirmar}
        />
      </TabsContent>
    </Tabs>
  );
}

// ─── Veículos ────────────────────────────────────────────────────────────────

type RascunhoVeiculo = {
  placa: string;
  veiculo_tipo: string;
  capacidade_kg: string;
  capacidade_m3: string;
};

const VAZIO_VEICULO: RascunhoVeiculo = {
  placa: "",
  veiculo_tipo: "",
  capacidade_kg: "",
  capacidade_m3: "",
};

function paraRascunho(v: VeiculoDaFrota): RascunhoVeiculo {
  return {
    placa: v.placa,
    veiculo_tipo: v.veiculo_tipo ?? "",
    // 0 no banco é "não informada" no cadastro — o default da coluna. Mostrar
    // "0" faria o operador achar que o veículo só leva zero quilo.
    capacidade_kg: v.capacidade_kg > 0 ? String(v.capacidade_kg) : "",
    capacidade_m3: v.capacidade_m3 > 0 ? String(v.capacidade_m3) : "",
  };
}

function corpoDoVeiculo(r: RascunhoVeiculo) {
  return {
    placa: r.placa,
    veiculo_tipo: r.veiculo_tipo.trim() === "" ? null : r.veiculo_tipo.trim(),
    capacidade_kg: r.capacidade_kg.trim() === "" ? 0 : Number(r.capacidade_kg),
    capacidade_m3: r.capacidade_m3.trim() === "" ? 0 : Number(r.capacidade_m3),
  };
}

function Veiculos({
  veiculos,
  setVeiculos,
  podeEditar,
  confirmar,
}: {
  veiculos: VeiculoDaFrota[];
  setVeiculos: React.Dispatch<React.SetStateAction<VeiculoDaFrota[]>>;
  podeEditar: boolean;
  confirmar: ReturnType<typeof useConfirmar>;
}) {
  const t = useT();
  const [novo, setNovo] = React.useState<RascunhoVeiculo>(VAZIO_VEICULO);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState<RascunhoVeiculo>(VAZIO_VEICULO);
  const [salvando, setSalvando] = React.useState(false);

  async function criar() {
    setSalvando(true);
    try {
      const { data } = await apiClient.post<{ data: VeiculoDaFrota }>(
        "/api/v1/fleet/vehicles",
        corpoDoVeiculo(novo),
      );
      setVeiculos((atual) => [data, ...atual]);
      setNovo(VAZIO_VEICULO);
      toast.success(t("Veículo cadastrado."));
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(id: string) {
    setSalvando(true);
    try {
      const { data } = await apiClient.patch<{ data: VeiculoDaFrota }>(
        `/api/v1/fleet/vehicles/${id}`,
        corpoDoVeiculo(rascunho),
      );
      setVeiculos((atual) => atual.map((v) => (v.id === id ? data : v)));
      setEditando(null);
      toast.success(t("Veículo atualizado."));
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(v: VeiculoDaFrota) {
    try {
      const { data } = await apiClient.patch<{ data: VeiculoDaFrota }>(
        `/api/v1/fleet/vehicles/${v.id}`,
        { ativo: !v.ativo },
      );
      setVeiculos((atual) => atual.map((x) => (x.id === v.id ? data : x)));
    } catch (e) {
      showApiError(e);
    }
  }

  async function apagar(v: VeiculoDaFrota) {
    const ok = await confirmar({
      title: t("Apagar veículo?"),
      description: t(
        "O histórico de rotas já confirmadas continua intacto. Para tirar da operação sem apagar, use Desativar.",
      ),
      confirmLabel: t("Apagar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/api/v1/fleet/vehicles/${v.id}`);
      setVeiculos((atual) => atual.filter((x) => x.id !== v.id));
      toast.success(t("Veículo apagado."));
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <form
          className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_1fr_140px_140px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
        >
          <Campo rotulo={t("Placa")}>
            <Input
              value={novo.placa}
              onChange={(e) => setNovo({ ...novo, placa: e.target.value })}
              placeholder="ABC1D23"
              required
            />
          </Campo>
          <Campo rotulo={t("Tipo")}>
            <Input
              value={novo.veiculo_tipo}
              onChange={(e) => setNovo({ ...novo, veiculo_tipo: e.target.value })}
              placeholder={t("caminhão, van, carro")}
            />
          </Campo>
          <Campo rotulo={t("Capacidade (kg)")}>
            <Input
              type="number"
              min={0}
              step="1"
              value={novo.capacidade_kg}
              onChange={(e) => setNovo({ ...novo, capacidade_kg: e.target.value })}
              placeholder={t("não informada")}
            />
          </Campo>
          <Campo rotulo={t("Capacidade (m³)")}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={novo.capacidade_m3}
              onChange={(e) => setNovo({ ...novo, capacidade_m3: e.target.value })}
              placeholder={t("não informada")}
            />
          </Campo>
          <div className="flex items-end">
            <Button type="submit" disabled={salvando}>
              {t(salvando ? "Salvando…" : "Cadastrar")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Só quem administra a organização pode cadastrar veículos.")}
        </p>
      )}

      {veiculos.length === 0 ? (
        <p className="rounded-2xl border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("Nenhum veículo cadastrado. Sem frota, o otimizador usa o veículo da própria carga.")}
        </p>
      ) : (
        <div className="rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Placa")}</TableHead>
                <TableHead>{t("Tipo")}</TableHead>
                <TableHead>{t("Capacidade")}</TableHead>
                <TableHead>{t("Situação")}</TableHead>
                {podeEditar ? <TableHead className="w-[1%]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {veiculos.map((v) => {
                const emEdicao = editando === v.id;
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          value={rascunho.placa}
                          onChange={(e) => setRascunho({ ...rascunho, placa: e.target.value })}
                          aria-label={t("Placa")}
                        />
                      ) : (
                        <span className="font-medium">{v.placa}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          value={rascunho.veiculo_tipo}
                          onChange={(e) =>
                            setRascunho({ ...rascunho, veiculo_tipo: e.target.value })
                          }
                          aria-label={t("Tipo")}
                        />
                      ) : (
                        (v.veiculo_tipo ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min={0}
                            value={rascunho.capacidade_kg}
                            onChange={(e) =>
                              setRascunho({ ...rascunho, capacidade_kg: e.target.value })
                            }
                            aria-label={t("Capacidade em kg")}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={rascunho.capacidade_m3}
                            onChange={(e) =>
                              setRascunho({ ...rascunho, capacidade_m3: e.target.value })
                            }
                            aria-label={t("Capacidade em m³")}
                          />
                        </div>
                      ) : (
                        <span className="text-sm">
                          {v.capacidade_kg > 0 ? `${v.capacidade_kg} kg` : t("peso não informado")}
                          {" · "}
                          {v.capacidade_m3 > 0
                            ? `${v.capacidade_m3} m³`
                            : t("volume não informado")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.ativo ? "success" : "neutral"}>
                        {t(v.ativo ? "Ativo" : "Inativo")}
                      </Badge>
                    </TableCell>
                    {podeEditar ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {emEdicao ? (
                            <>
                              <Button size="sm" disabled={salvando} onClick={() => void salvar(v.id)}>
                                {t("Salvar")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditando(null)}
                              >
                                {t("Cancelar")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditando(v.id);
                                  setRascunho(paraRascunho(v));
                                }}
                              >
                                {t("Editar")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void alternarAtivo(v)}
                              >
                                {t(v.ativo ? "Desativar" : "Ativar")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void apagar(v)}>
                                {t("Apagar")}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Motoristas ─────────────────────────────────────────────────────────────

type RascunhoMotorista = {
  nome: string;
  telefone: string;
  capacidade_jornada_min: string;
};

const VAZIO_MOTORISTA: RascunhoMotorista = {
  nome: "",
  telefone: "",
  capacidade_jornada_min: "480",
};

function paraRascunhoMotorista(m: MotoristaDaFrota): RascunhoMotorista {
  return {
    nome: m.nome,
    telefone: m.telefone ?? "",
    capacidade_jornada_min: String(m.capacidade_jornada_min),
  };
}

function corpoDoMotorista(r: RascunhoMotorista) {
  return {
    nome: r.nome,
    telefone: r.telefone.trim() === "" ? null : r.telefone.trim(),
    capacidade_jornada_min: Number(r.capacidade_jornada_min),
  };
}

function Motoristas({
  motoristas,
  setMotoristas,
  podeEditar,
  confirmar,
}: {
  motoristas: MotoristaDaFrota[];
  setMotoristas: React.Dispatch<React.SetStateAction<MotoristaDaFrota[]>>;
  podeEditar: boolean;
  confirmar: ReturnType<typeof useConfirmar>;
}) {
  const t = useT();
  const [novo, setNovo] = React.useState<RascunhoMotorista>(VAZIO_MOTORISTA);
  const [editando, setEditando] = React.useState<string | null>(null);
  const [rascunho, setRascunho] = React.useState<RascunhoMotorista>(VAZIO_MOTORISTA);
  const [salvando, setSalvando] = React.useState(false);

  async function criar() {
    setSalvando(true);
    try {
      const { data } = await apiClient.post<{ data: MotoristaDaFrota }>(
        "/api/v1/fleet/drivers",
        corpoDoMotorista(novo),
      );
      setMotoristas((atual) => [data, ...atual]);
      setNovo(VAZIO_MOTORISTA);
      toast.success(t("Motorista cadastrado."));
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function salvar(id: string) {
    setSalvando(true);
    try {
      const { data } = await apiClient.patch<{ data: MotoristaDaFrota }>(
        `/api/v1/fleet/drivers/${id}`,
        corpoDoMotorista(rascunho),
      );
      setMotoristas((atual) => atual.map((m) => (m.id === id ? data : m)));
      setEditando(null);
      toast.success(t("Motorista atualizado."));
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(m: MotoristaDaFrota) {
    try {
      const { data } = await apiClient.patch<{ data: MotoristaDaFrota }>(
        `/api/v1/fleet/drivers/${m.id}`,
        { ativo: !m.ativo },
      );
      setMotoristas((atual) => atual.map((x) => (x.id === m.id ? data : x)));
    } catch (e) {
      showApiError(e);
    }
  }

  async function apagar(m: MotoristaDaFrota) {
    const ok = await confirmar({
      title: t("Apagar motorista?"),
      description: t(
        "O histórico de rotas continua intacto. Para tirar da operação sem apagar, use Desativar.",
      ),
      confirmLabel: t("Apagar"),
      danger: true,
    });
    if (!ok) return;
    try {
      await apiClient.delete(`/api/v1/fleet/drivers/${m.id}`);
      setMotoristas((atual) => atual.filter((x) => x.id !== m.id));
      toast.success(t("Motorista apagado."));
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {podeEditar ? (
        <form
          className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_180px_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
        >
          <Campo rotulo={t("Nome")}>
            <Input
              value={novo.nome}
              onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
              required
            />
          </Campo>
          <Campo rotulo={t("Telefone")}>
            <Input
              value={novo.telefone}
              onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
              placeholder={t("opcional")}
            />
          </Campo>
          <Campo rotulo={t("Jornada (min)")}>
            <Input
              type="number"
              min={30}
              max={1440}
              value={novo.capacidade_jornada_min}
              onChange={(e) =>
                setNovo({ ...novo, capacidade_jornada_min: e.target.value })
              }
            />
          </Campo>
          <div className="flex items-end">
            <Button type="submit" disabled={salvando}>
              {t(salvando ? "Salvando…" : "Cadastrar")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Só quem administra a organização pode cadastrar motoristas.")}
        </p>
      )}

      {motoristas.length === 0 ? (
        <p className="rounded-2xl border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("Nenhum motorista cadastrado. A distribuição por veículo usa a jornada daqui.")}
        </p>
      ) : (
        <div className="rounded-2xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Nome")}</TableHead>
                <TableHead>{t("Telefone")}</TableHead>
                <TableHead>{t("Jornada")}</TableHead>
                <TableHead>{t("Situação")}</TableHead>
                {podeEditar ? <TableHead className="w-[1%]" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {motoristas.map((m) => {
                const emEdicao = editando === m.id;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          value={rascunho.nome}
                          onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                          aria-label={t("Nome")}
                        />
                      ) : (
                        <span className="font-medium">{m.nome}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          value={rascunho.telefone}
                          onChange={(e) => setRascunho({ ...rascunho, telefone: e.target.value })}
                          aria-label={t("Telefone")}
                        />
                      ) : (
                        (m.telefone ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          type="number"
                          min={30}
                          max={1440}
                          value={rascunho.capacidade_jornada_min}
                          onChange={(e) =>
                            setRascunho({
                              ...rascunho,
                              capacidade_jornada_min: e.target.value,
                            })
                          }
                          aria-label={t("Jornada em minutos")}
                        />
                      ) : (
                        t("{min} min").replace("{min}", String(m.capacidade_jornada_min))
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.ativo ? "success" : "neutral"}>
                        {t(m.ativo ? "Ativo" : "Inativo")}
                      </Badge>
                    </TableCell>
                    {podeEditar ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {emEdicao ? (
                            <>
                              <Button size="sm" disabled={salvando} onClick={() => void salvar(m.id)}>
                                {t("Salvar")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                                {t("Cancelar")}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditando(m.id);
                                  setRascunho(paraRascunhoMotorista(m));
                                }}
                              >
                                {t("Editar")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void alternarAtivo(m)}
                              >
                                {t(m.ativo ? "Desativar" : "Ativar")}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => void apagar(m)}>
                                {t("Apagar")}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      {children}
    </div>
  );
}
