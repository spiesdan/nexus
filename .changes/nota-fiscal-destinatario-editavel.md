---
impacto: capacidade_nova
secao: adicionado
titulo: Emitir nota fiscal com o destinatário conferido campo por campo
---
A emissão usava o cadastro do cliente sem mostrar o que iria para a SEFAZ. Quando
o CPF estava só no cadastro do Mercos e não na ficha, a nota saía sem documento —
e o erro só aparecia na rejeição.

Agora a tela de emissão tem dois passos:

- **Destinatário editável** — nome, CPF/CNPJ, inscrição estadual e endereço
  podem ser ajustados na hora da emissão, sem alterar o cadastro do cliente.
- **Conferir a nota campo por campo** — a prévia mostra exatamente o que será
  transmitido antes de consumir número da SEFAZ, e a confirmação final nomeia o
  destinatário, o documento e o total.

O último erro da SEFAZ também passou a aparecer na porta do módulo fiscal: antes
ele era lido do banco e nunca renderizado, e a tela dizia "tudo certo" com a
última sincronização recusada.
