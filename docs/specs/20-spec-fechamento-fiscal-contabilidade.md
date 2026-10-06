# Spec 20 — Fechamento fiscal anual e entrega à contabilidade

Status: proposta (não homologada)
Autor: bill (aprovou pedido em 06/10/2026)
Dependências: PR #32 (barra de NF-e), release v1.21.1 publicada

## Resumo

Hoje o CRM gera somente o **rascunho mensal da EFD ICMS/IPI** (SPED Fiscal,
blocos 0/C/9). A contabilidade precisa, para o ano, de um pacote pronto:
DEFIS/Simples, PGDAS-D, EFD, XMLs e um resumo executivo. Esta spec descreve
o pacote mínimo a entregar e o que construir.

## 1. O que a contabilidade recebe hoje (já existe)

| Entregável | Onde | Formato | Estado |
|---|---|---|---|
| EFD ICMS/IPI mensal | `/api/v1/sped/arquivo` | TXT (blocos 0, C, 9) | **rascunho** — CST/apuração zerados |
| XMLs autorizados/cancelados | `/app/nota/[id]/danfe`, `importar-xmls` | XML | ok |
| DANFE por nota | PDF | ok | |
| CSV de notas/itens | export CSV | ok | |

## 2. O que falta (lacunas confirmadas)

| Entregável | Observação | Paga? (responsável hoje) |
|---|---|---|
| **DEFIS anual** | Obrigatória no Simples Nacional; não gerada | contador monta na mão |
| **PGDAS-D mensal** | Apuração do DAS; não gerada | contador |
| **Bloco H (inventário/estoque)** | Falta no SPED atual | contador/separado |
| **Bloco E (apuração ICMS/IPI)** | Zero | contador |
| **Envio próximo (e-mail do contador)** | Não existe canal configurado | manual |

## 3. Proposta de escopo (MVP)

1. **`GET /api/v1/fiscal/resumo-anual?ano=YYYY`**
   - Consolidar a partir de `invoices`, `fiscal_entradas`, `fiscal_events`:
     notas autorizadas/canceladas/inutilizadas por mês, total faturado,
     total de impostos (se houver), CFOP mais usado.
   - UI simples em `Notas → Fechamento anual` mostrando a tabela 12 meses.

2. **`GET /api/v1/fiscal/pacote-anual?ano=YYYY`**
   - ZIP com: 12 EFDs mensais (reaproveitando `gerarEfd`), XMLs autorizados do
     ano, CSV consolidado, `resumo.json` + `resumo.csv`.

3. **Campo `emailContabilidade` em `fiscal_settings`**
   - Ação "Enviar à contabilidade" que dispara e-mail com o pacote (via
     provedor de e-mail já configurado no sistema).

4. Fora de escopo imediato, mas listado: geração efetiva de DEFIS/DASN-SIMEI e
   PGDAS-D (exige cruzamento oficial com e-CAC; recomendado integrar via provedor
   fiscal terceirizado em vez de reimplementar).

## 4. Critérios de aceite

- Resumo anual reflete o total das `invoices` autorizadas no banco (auditável).
- Pacote ZIP abre, EFDs validam no PVA, XMLs completos.
- Envio de e-mail não bloqueia a requisição (worker) ou usa fila já existente.
- Testes: unitário para a agregação, e2e leve para download do ZIP.

## 5. Riscos / notas

- EFD mensal continua sendo **rascunho** até completar CST/apuração — defina no
  produto se o pacote deve ir "cru" ou só espelho do que já vai hoje.
- DEFIS/PGDAS-D não devem ser "inventados" no CRM; manter como pendente até ter
  provedor fiscal confirmado.
