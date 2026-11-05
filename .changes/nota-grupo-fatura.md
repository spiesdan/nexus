---
impacto: nada_mudou
secao: corrigido
titulo: Nota a prazo: o grupo Fatura passou a ser emitido e a SEFAZ não recusa mais (905)
---

Nota com pagamento **a prazo** (duas ou mais parcelas) era recusada pela SEFAZ com **905 — "Campos do grupo Fatura não informados"**, mesmo com as duplicatas certas no XML. O grupo `<fat>` (fatura) é opcional no leiaute — o XML passava na validação de esquema —, mas a SEFAZ aplica uma regra de negócio por cima: pagamento a prazo exige a fatura.

Medido em 05/11/2026 nesta instalação: a nota **4587** (R$ 650,00 em 2×, primeiro vencimento 23/11) parou nessa recusa. Com o grupo Fatura emitido antes das duplicatas (número da nota, valor original e líquido iguais ao total, desconto zero), a mesma nota foi autorizada como **4588**, protocolo `242260530117471`.

O gate `tests/unit/fiscal-sidecar-emissao.test.ts` passa a cobrar a ordem — `<fat>` antes de `<dup>` — e os campos que a fatura precisa ter.
