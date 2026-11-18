"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/**
 * As cidades que o seletor oferece — vêm do banco, não da página carregada.
 *
 * `staleTime` de um minuto: cadastro novo não precisa aparecer no seletor no
 * mesmo segundo, e a lista é pequena. Evita uma chamada por tecla digitada no
 * filtro (a query key não muda com os outros filtros).
 */
export function useContactCities() {
  return useQuery({
    queryKey: ["contact-cities"],
    queryFn: async () => {
      const r = await apiClient.get<{ data: string[] }>("/api/v1/contacts/cidades");
      return r.data ?? [];
    },
    staleTime: 60_000,
  });
}
