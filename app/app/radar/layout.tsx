import type { ReactNode } from "react";

import { contextoDoRadar } from "./_contexto";
import { RadarShell } from "./_shell";

export const dynamic = "force-dynamic";

/**
 * O CASCO DO RADAR — cabeçalho, navegação e o recorte, uma vez para as seis telas.
 *
 * Layout (e não componente repetido em cada `page.tsx`) por uma razão concreta:
 * o recorte e os dados vivem no provider, e provider montado na página
 * remontaria a cada troca de aba. No layout ele sobrevive à navegação — a
 * pessoa filtrou uma cidade, clicou em Oportunidades e o filtro continua lá.
 */
export default async function RadarLayout({ children }: { children: ReactNode }) {
  const contexto = await contextoDoRadar();
  return <RadarShell {...contexto}>{children}</RadarShell>;
}
