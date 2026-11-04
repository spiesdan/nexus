---
impacto: nada_mudou
secao: corrigido
titulo: NF-e manda o responsável técnico — a SEFAZ recusava sem ele (rejeição 972)
---

A primeira emissão real depois do IBS/CBS **chegou à SEFAZ** e voltou com:

```
SEFAZ_972: Rejeicao: Obrigatoria as informacoes do responsavel tecnico
```

O grupo `infRespTec` é exigido pela NT 2018.005 e não existia no nosso XML. Ele
identifica quem responde pelo **software**, não pela empresa que emite — por
isso o CNPJ não pode ser o mesmo do emitente (rejeição 776) e o dado vive no
ambiente do sidecar, não no cadastro fiscal:

- `FISCAL_RESP_TEC_CNPJ`
- `FISCAL_RESP_TEC_CONTATO`
- `FISCAL_RESP_TEC_EMAIL`
- `FISCAL_RESP_TEC_FONE`

Sem CNPJ válido a emissão é recusada **antes** de consumir número, com a
mensagem dizendo qual variável falta.
