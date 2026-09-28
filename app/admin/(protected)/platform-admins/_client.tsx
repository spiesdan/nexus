"use client";
import { DBAOnlyNotice } from "@/components/admin/platform-admins/DBAOnlyNotice";
import {
  PlatformAdminsTable,
  PlatformAdminsTableSkeleton,
} from "@/components/admin/platform-admins/PlatformAdminsTable";
import { useAdminPlatformAdmins } from "@/hooks/useAdminPlatformAdmins";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { useT } from "@/hooks/i18n/useT";

export function PlatformAdminsClient() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useAdminPlatformAdmins();

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title={t("Platform Admins")}
        subtitle={t("Administradores com acesso privilegiado à plataforma")}
      />

      {/* T-04 Notice — proeminente, antes da tabela */}
      <DBAOnlyNotice />

      {/* Table */}
      {isLoading ? (
        <PlatformAdminsTableSkeleton />
      ) : isError ? (
        <NexusErrorState
          description={t("Erro ao carregar platform admins. Tente recarregar.")}
          onRetry={() => void refetch()}
        />
      ) : (
        <PlatformAdminsTable data={data ?? []} />
      )}
    </div>
  );
}
