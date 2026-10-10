---
impacto: nada_mudou
secao: corrigido
titulo: Importar da SEFAZ mostra o erro nomeado em vez de "sidecar inalcançável"
---

Três defeitos pequenos que juntos quebravam o botão Importar sem dizer o porquê:

**O sidecar montava o config com a chave errada.** A biblioteca fiscal exige
`schemes` no plural; o código mandava `scheme` no singular e a validação
derrubava tudo antes de falar com a SEFAZ.

**Exceção fora do try virava página de erro.** Quando a montagem falhava, o
PHP devolvia HTML em vez de resposta, e o aplicativo traduzia isso como
"sidecar inalcançável" — apontando para rede quando o problema era
configuração. Agora a falha volta nomeada com o motivo.

**A UF faltante não era pedida.** A biblioteca exige a sigla do estado, e a
tela só pedia CNPJ e certificado. Agora a verificação pede os três de uma vez,
em português, antes de chamar a SEFAZ.