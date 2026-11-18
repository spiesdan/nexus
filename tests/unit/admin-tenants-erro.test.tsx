/**
 * FALHA NO ADMIN NÃO É "NENHUM TENANT".
 *
 * Os cinco clientes de lista do /admin (tenants, audit, incidentes, LGPD e
 * usuários) renderizavam a tabela vazia quando a consulta falhava. Num painel
 * de plataforma isso é pior que nos outros módulos: "nenhum tenant" pode ser
 * lido como perda de dados. O teste cobra o contrato de um deles: erro com
 * retry, e o vazio real continua existindo quando a consulta responde vazia.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useAdminTenants", () => ({
  useAdminTenants: () => ({
    data: estado.isError ? undefined : { pages: [{ data: [] }] },
    isLoading: false,
    isError: estado.isError,
    refetch: estado.refetch,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));

import { TenantsClient } from "@/app/admin/(protected)/tenants/_client";

beforeEach(() => {
  estado.isError = false;
  estado.refetch.mockReset();
});

afterEach(cleanup);

describe("Admin — lista de tenants", () => {
  it("erro mostra retry e não a mensagem de lista vazia", () => {
    estado.isError = true;
    render(<TenantsClient />);

    expect(screen.queryByText("Nenhum tenant encontrado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(estado.refetch).toHaveBeenCalledTimes(1);
  });

  it("consulta vazia de verdade continua mostrando o vazio da tabela", () => {
    render(<TenantsClient />);
    expect(screen.getByText("Nenhum tenant encontrado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
  });
});
