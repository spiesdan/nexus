---
impacto: nada_mudou
secao: corrigido
titulo: Admin — filtros de incidentes com nome e regiões roláveis focáveis
---

Os filtros da lista de incidentes não tinham nome acessível (axe `button-name`
crítico) e as regiões roláveis da ficha (payload e auditoria) não eram
alcançáveis por teclado. Ganharam `aria-label`/`role`/`tabIndex`, e os alvos
pequenos (filtros, “Ver”, voltar, “Resolver incidente”) subiram para 40 px.
