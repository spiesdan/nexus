# 78 — Alvos pequenos: um defeito de componente, não 90 de tela

A fatia 90-100 mediu 10 telas × 4 combinações. Antes das correções, **10/10 telas** tinham alvo < 44 e `/settings/notifications` tinha 2 violações `color-contrast (serious)` no escuro. O número grande não era 90 defeitos independentes: vinha de poucos componentes compartilhados e de **falso positivo do instrumento**.

## Componentes corrigidos na origem

| Componente | Antes | Depois |
| --- | --- | --- |
| `components/ui/switch.tsx` | ROOT era a pista, 36×20 | ROOT 44×44, pista visual intacta |
| `components/ui/input.tsx` | `h-10` (40) | `h-11` no toque, `lg:h-10` no mouse |
| `components/nexus-ui/forms/rodape-de-salvamento.tsx` | "Salvar" `h-10` | `h-11` |
| `components/ui/tabs.tsx` | `TabsTrigger` ~38 | `min-h-11` |
| `components/shell/MobileSidebar.tsx` | hambúrguer 42×44 | `min-w-11` |
| `components/shell/SidebarNotice.tsx` | dispensar 16×16 | 44×44 |
| `app/app/settings/notifications/page.tsx` | `text-muted-foreground` em 2 `<p>` (axe serious no escuro) | `text-text` |

## Instrumento ajustado (falso positivo, com motivo)

- `radio`/`checkbox`/`color` **dentro de `<label>`**: o alvo é o rótulo, não o quadrado de 16 px — medir o `input` cru inflava cada tela.
- **1440 é mouse**: o design system usa `lg:h-8`/`lg:h-9` de propósito; exigir 44 px ali reprovava a tela inteira por um critério de toque que não se aplica. No desktop vale o piso WCAG de 24 px (ainda pega o botão 16×16 de verdade).
- Devtools do TanStack (40×40) só existem em `next dev` — não são UI do produto.
- `h1` em `/settings/canal-oficial` → redirect para `/app/connections?aba=oficial`: medido 8,5 s na primeira compilação e 2,1 s depois. **Não era defeito de UI**: o timeout de 3 s do instrumento foi subido para 15 s.

## Antes/depois (mesma fatia, mesma régua)

| | antes | depois |
| --- | --- | --- |
| telas com alvo < 44 | **10/10** | **3/10** (`devices`, `marca`, `profile` — selects e inputs ainda com 36/40 px) |
| telas 100% limpas | 0/10 | **7/10** |
| `color-contrast` serious | 2 (notifications dark) | **0** |
| medições válidas | 39/40 | **40/40** |

Evidência: `capturas/varredura-app/varredura-90-100-antes.json` e `varredura-90-100.json`. Matriz: 7 linhas marcadas `aplicado` (medidas limpas), 3 ficam `pendente` com o defeito escrito. Medição inválida não foi anotada como achado.
