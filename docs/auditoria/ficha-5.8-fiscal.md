# Ficha 5.8 — Fiscal

> **Régua:** `docs/auditoria/PROMPT-MESTRE-AAA.md` §5. Recorte de **estado/UX**.
> **Nenhuma regra fiscal foi alterada** — nem emissão, nem cancelamento, nem
> inutilização, nem tributação. `lib/fiscal` foi apenas lido.
>
> Medido em 18/11/2026 contra `aa4020a3` + as correções desta ficha.

## 1. Propósito

O módulo é a **vida da nota**: emitir a NF-e do pedido, acompanhar o retorno da
SEFAZ, cancelar com motivo, inutilizar numeração, registrar eventos e
manifestações, importar as **notas de entrada** (compras de fornecedor) e gerar
SPED/relatórios. É a área onde erro tem consequência legal — por isso o desenho
do produto é conservador: nada transmite sozinho, e o estado da nota é sempre
visível.

Quem usa: `agent` (emite e acompanha), `manager` (configura, manifesta, importa),
`admin`/dono (política da organização e do provedor).

## 2. Rotas e telas

| Rota | Tela | Papel mínimo |
| --- | --- | --- |
| `/app/notas` (abas: notas, entradas, SPED) | lista de notas, notas de entrada, SPED | `agent` emite; `manager` configura (`page.tsx:64-70`) |
| `/app/fiscal` | Visão Geral (sincronizar, status do provedor) | — |
| `/app/fiscal/notas` · `/app/fiscal/notas/[id]` | acervo da SEFAZ e detalhe | — |
| `/app/fiscal/pendentes` | notas de entrada pendentes de conferência | — |
| `/app/fiscal/eventos` · `/manifestacoes` | eventos e manifestação do destinatário | `manager` |
| `/app/fiscal/xml` · `/resumos` · `/relatorios` | XMLs, resumos, relatórios | — |
| `/app/fiscal/produtos` · `/fornecedores` · `/sincronizacoes` | cadastro e histórico de sincronização | `manager` |
| `/app/fiscal/configuracoes` | provedor, série, ambiente | `manager` |

Componentes centrais: `app/app/notas/_components/GradeNotas.tsx` (grade,
filtros, chips por status, ações por linha, detalhe expansível),
`EntradasFiscais.tsx`, `CorrigirNota.tsx`, `EmitirNota.tsx`,
`app/app/fiscal/_components/TabelaDeEntradas.tsx` (lista única de entradas usada
por quatro subtelas).

## 3. Estados — o que existe, onde, e o que faltava

| Estado | Notas (saída) | Entradas | Fiscal (visão geral etc.) |
| --- | --- | --- | --- |
| **carregando** | dados do servidor + `loading.tsx` do segmento; `EmitirNota` mostra "Emitindo…" | skeleton (`EntradasFiscais.tsx:237-240`) | dados do servidor por subtela |
| **erro** | `SegmentError` do segmento; toast para ação (`showApiError`) | **faltava**: falha de leitura caía no vazio (§6.2) | erro de sincronização vem no corpo da resposta |
| **vazio** | "Nenhuma nota ainda" (sem saída) e "Nenhuma nota com esse filtro" + **Limpar filtros** (`GradeNotas.tsx:568-572`) | "Nenhuma nota de entrada ainda" **sem ação** → agora com **Buscar na SEFAZ** | `TabelaDeEntradas`: "Nenhuma nota com esse filtro" e vazio sem ação → agora com link para a Visão Geral |
| **permissão** | `podeEmitir` (agent+) esconde Emitir/Corrigir/Tentar de novo; `podeConfigurar` (manager+) esconde config | `podeSincronizar` esconde o botão | idem |
| **retry** | reemissão idempotente (job aberto devolve 200) | agora com **Tentar de novo** | sincronizar é a ação |
| **offline** | ações via `apiClient` (toast de erro; leitura é server-side) | idem | idem |

## 4. Regras de negócio observadas (não inventadas)

1. **A nota nasce de pedido em estado comercial**: `faturado`, `expedido` ou
   `entregue` (`lib/schemas/fiscal.ts:574-580`). A tela não cria nota do nada.
2. **Reemitir usa o MESMO job aberto** quando a nota está `em_emissao`: passado
   o teto de processamento o job volta a `pendente` por CAS em
   status+`updated_at`; antes disso a rota responde **409 "aguarde"**. Nota em
   `erro` é dead-letter e ganha job novo (`app/api/v1/invoices/[id]/reemitir/route.ts:1-14`).
3. **Reemissão é idempotente**: job já pendente devolve 200 `ja_na_fila`, e dois
   cliques caem na unique de job aberto (`route.ts:9-11`). Por isso a guarda de
   UI desta ficha é de **feedback**, não de integridade.
4. **Cancelar nota em emissão interrompe a tentativa** e apaga o erro registrado
   — a confirmação diz isso antes (`GradeNotas.tsx:401-416`).
5. **Cancelar nota autorizada exige motivo** (`GradeNotas.tsx:391-396`).
6. **O motivo do erro exibido é o do servidor** (`n.erro`, escrito pelo worker a
   partir do retorno da SEFAZ) — a tela não traduz nem resume.

## 5. Riscos

| Risco | Por que importa | Situação |
| --- | --- | --- |
| Nota `em_emissao` sem explicação | "Emitindo" para sempre parece travamento sem saída | **corrigido** (§6.1) |
| Reemissão sem feedback de envio | duplo clique em ação fiscal parece "não fez nada" | **corrigido** (§6.1) |
| Falha de leitura virando "nenhuma entrada" | operador conclui que o fornecedor não emitiu | **corrigido** (§6.2) |
| Emissão/cancelamento | consequência legal | **não tocado** (regra fiscal) |
| `erro` do servidor pode ser técnico | é o texto da SEFAZ; esconder seria pior | observado — mantido de propósito |

## 6. O que foi corrigido nesta ficha (com prova)

### 6.1 `em_emissao` e reemissão em curso — `GradeNotas.tsx`

- **A dica estava só no `title` do botão** ("Só depois de 15 minutos em Emitindo
  sem mudar"). `title` não aparece no toque nem no teclado. Agora, na própria
  célula de status: *"Processando. Se ficar assim por mais de 15 minutos, use
  'Tentar de novo'."* — o estado explica o que está acontecendo **e a saída**.
- **A reemissão não tinha estado de envio**: o botão continuava clicável durante
  o POST. Agora a linha guarda `reemitindoId` e o botão desabilita enquanto a
  chamada está em curso (o servidor já é idempotente — §4.3; isto é feedback).

Prova: revisão de código + `eslint`/build; o comportamento de rede é o mesmo da
rota testada em `app/api/v1/invoices/[id]/reemitir/route.test.ts` (não tocado).

### 6.2 Falha de leitura virava "nenhuma nota de entrada" — `EntradasFiscais.tsx`

`recarregar` só chamava `showApiError` (toast de 4 s) e seguia. Com a lista
vazia, a tela caía no vazio — o operador conclui que o fornecedor não emitiu,
quando o problema foi a leitura. Mesma classe da V-22/V-43.

Agora: erro sem dados → **estado de erro com "Tentar de novo"**; erro com dados
na tela → faixa `role="alert"` acima da tabela, com retry (mantém o que já
estava carregado). A mensagem passa por `mensagemDeErro` (ficha 5.6): rede vira
frase em português, nunca "Failed to fetch".

### 6.3 Vazios com próximo passo — `EntradasFiscais.tsx` e `TabelaDeEntradas.tsx`

- Entradas (aba de `/app/notas`): o vazio mandava "Clique em Buscar na SEFAZ" e
  **não oferecia o botão**. Agora a ação é o próprio `sincronizar()` quando há
  permissão;
- `TabelaDeEntradas` (quatro subtelas de `/app/fiscal`): o vazio mandava "use
  Sincronizar na Visão Geral" sem caminho. Agora tem link **"Abrir a Visão
  Geral"** (`/app/fiscal`) — navegação, não POST: quem sincroniza é a Visão
  Geral, e isso é regra observada (§2), não convite a mudar;
- Grade de notas sem nenhuma nota: ganhou **"Ver pedidos"** (`/app/pedidos`),
  que é de onde a nota nasce (§4.1).

Prova: `tests/unit/entradas-fiscais-vazio-tem-saida.test.tsx` (2 casos: vazio
oferece o link certo; filtro sem resultado não é confundido com "nada ainda").

## 7. O que não foi tocado, e por quê

- **Regra fiscal**: emissão, cancelamento, inutilização, manifestação, CAS do
  job, idempotência e tributação — nada. `lib/fiscal` só foi lido.
- **Textos do `erro`**: o motivo vem da SEFAZ e é exibido como veio. Traduzir ou
  resumir um motivo fiscal seria inventar.
- **`podeEmitir`/`podeConfigurar`**: RBAC continua a fonte.
- **Tokens/design global**: nenhum; os estados usam `EmptyState`,
  `NexusErrorState` e `mensagemDeErro`.

## 8. Pendências que exigem decisão

1. **"Emitindo" com hora de início**: a grade mostra `created_at`, não o início
   do processamento. Mostrar "processando há X min" exige campo próprio (ou
   `updated_at` do job) — decisão de dados, não de tela.
2. **Reemissão em lote** para várias notas em `erro`: hoje é uma por linha.
3. **Ação de sincronizar nas abas de entradas**: hoje a sincronização mora na
   Visão Geral; duplicar o POST ali é decisão de produto (e de custo de SEFAZ).
4. **Unificar a mensagem de falha**: esta ficha traz um `mensagemDaFalha` local
   (6 linhas) porque o helper compartilhado `lib/ui/erros.ts` chega com a fatia
   5.6, ainda em PR. Quando as duas estiverem na main, o local sai — a regra é a
   mesma (rede vira frase em português, resto mantém a mensagem).
