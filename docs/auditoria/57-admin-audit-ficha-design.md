# Admin — Ficha de auditoria (`/admin/audit/[entryId]`)

> **Escopo:** o detalhe de uma entrada de auditoria. Contraste, overflow e
> console já vinham limpos; o único alvo pequeno era o “voltar”.
> **Medido em:** 20/11/2026, produção (`next build` + `next start`), sessão
> `dono` por cookie, 1440×900 e 390×844, temas claro e escuro.
> **Nada aponta para produção.** Sem deploy.

## Antes/depois (mesma base, mesmo build)

| Medida | Antes | Depois |
|---|---:|---:|
| Alvos < 40 px — 1440 | **1** de 18 | **0** |
| Alvos < 40 px — 390 | 0 de 6 | 0 |
| Overflow horizontal | 0 px | 0 px |
| axe critical/serious | 0/0 | 0/0 |
| Erros de console | 0 | 0 |
| Contraste mínimo amostrado | 4,8:1 | 4,8:1 |

Evidência: `capturas/antes-admin/audit-entrada_*.png` e
`capturas/depois-admin/audit-entrada_*.png` + `medidas-audit-entrada.json`.

## O que mudou

O botão de voltar (“Audit Log”) media **99×32**. Ganhou `min-h-10` no
`Button` (40 px de altura), sem mudar o desenho nem a posição.

## O que NÃO foi mudado, e por quê

- O corpo da ficha (campos, JSON de evidência) não tem alvo de toque: é
  leitura. Contraste mínimo 4,8:1 nos dois temas.
- A lista `/admin/audit` é outra linha e já está `aplicado` (#703).

## Prova dirigida

`eslint` zerado; `tsc --noEmit` completo: exit 0.
