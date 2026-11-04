---
impacto: nada_mudou
secao: corrigido
titulo: Cancelar nota volta a falar com a SEFAZ (e a carta de correção também)
---

Cancelar uma nota autorizada respondia **422** com *"SEFAZ recusou o cancelamento
(Arquivo de certificado não legível no volume /certs.)"* — e a SEFAZ nunca era
consultada. O app mandava ao serviço fiscal só o **nome** do arquivo de
certificado (`certificado.pfx`), e o serviço abre o arquivo pelo caminho: não
achava nada, desistia, e o erro aparecia como recusa do fisco.

A emissão nunca sofreu disso porque já mandava o caminho completo. Agora
**cancelamento, carta de correção e inutilização de numeração** mandam o mesmo
caminho da emissão.

Quem já instalou: **não precisa fazer nada** — o certificado que está no disco
continua valendo, nada muda de lugar.
