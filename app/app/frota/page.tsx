import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { COLUNAS_DO_MOTORISTA, COLUNAS_DO_VEICULO, type MotoristaDaFrota, type VeiculoDaFrota } from "@/lib/schemas/frota";
import { createClient } from "@/lib/supabase/server";

import { FrotaClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * FROTA — veículos e motoristas que o otimizador pode distribuir.
 *
 * A tela existe porque a entidade existia sem porta: a migration 0306 criou
 * `fleet_vehicles`/`fleet_drivers`, o VRPTW passou a ler as duas, e o operador
 * não tinha onde cadastrar capacidade nem jornada. Sem isso, toda distribuição
 * caía no veículo da própria carga e a restrição de capacidade virava declaração
 * de "sem dado".
 *
 * Leitura para qualquer membro (quem opera a rota precisa ver a frota);
 * escrita para `manager`, que é quem decide capacidade e jornada.
 */
export default async function FrotaPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  const podeEditar = !!org && ROLE_RANK[org.role] >= ROLE_RANK.manager;

  let veiculos: VeiculoDaFrota[] = [];
  let motoristas: MotoristaDaFrota[] = [];

  if (org) {
    const supabase = await createClient();
    const [v, m] = await Promise.all([
      supabase
        .from("fleet_vehicles")
        .select(COLUNAS_DO_VEICULO)
        .eq("organization_id", org.orgId)
        .order("ativo", { ascending: false })
        .order("placa"),
      supabase
        .from("fleet_drivers")
        .select(COLUNAS_DO_MOTORISTA)
        .eq("organization_id", org.orgId)
        .order("ativo", { ascending: false })
        .order("nome"),
    ]);
    veiculos = (v.data ?? []) as VeiculoDaFrota[];
    motoristas = (m.data ?? []) as MotoristaDaFrota[];
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="min-w-0">
        <h1 className="text-2xl font-medium tracking-tight text-text">Frota</h1>
        <p className="text-sm text-muted-foreground">
          Veículos e motoristas que a expedição pode usar. Capacidade e jornada daqui são o que o otimizador
          multi-veículo respeita.
        </p>
      </header>

      <FrotaClient inicialVeiculos={veiculos} inicialMotoristas={motoristas} podeEditar={podeEditar} />
    </div>
  );
}
