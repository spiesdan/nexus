---
impacto: nada_mudou
secao: corrigido
titulo: Seletor de empresa com nome acessível em 82 rotas
---

O seletor de empresa (`tenant-switcher`) aparecia para leitores de tela como um
controle sem nome: o rótulo visível não iniciava o nome acessível e a inicial era
`aria-hidden`, mas ainda entrava no `textContent`. Foram **163 violações sérias em
82 rotas**, medida **6 → 0** depois do conserto.

O nome acessível agora começa pelo rótulo visível e a inicial decorativa sai do
`textContent`. Nenhuma regra de negócio mudou.

**Nada a fazer na VPS.**
