/**
 * A CAPTURA OFFLINE — cliente, itens, total, fila.
 *
 * ─── As decisões que a tela trava ───────────────────────────────────────────
 *
 *   - Preço vem do catálogo e NÃO é editável. Preço digitado é o que o
 *     servidor recusa no sync ("Preço fora da tabela" / divergência), e aí o
 *     trabalho da viagem vira retrabalho. Desconto por item também não: mesma
 *     razão, e a regra de aprovação (`em_analise` acima do teto) roda no
 *     servidor de qualquer jeito.
 *   - Sem tabela de preço na v1: a org real tem zero tabelas. Se um dia tiver,
 *     o servidor recusa com mensagem clara e o pedido fica `rejeitado` para
 *     decidir — nunca some.
 *   - `status: "aprovado"` no payload. Rascunho pularia crédito, estoque e
 *     aprovação no sync — e um pedido que pula as travas não é pedido, é
 *     intenção. A captura offline é pedido de verdade.
 *   - Cliente é obrigatório COM `contact_id` quando escolhido da lista (o
 *     crédito é por contato). Sem contato? A API aceita `cliente_nome` avulso
 *     — e o vendedor na fazenda atende gente nova. Vale, com o nome.
 *
 * ─── O número provisório ────────────────────────────────────────────────────
 *
 * `OFF-0007`, sequência por aparelho em `meta.sequencia_off`. Não é fiscal e
 * nunca finge ser: a tela mostra "provisório" ao lado, e o definitivo chega
 * no sync.
 */

import { banco } from "@/lib/offline/db";
import { enfileirarPedido } from "@/lib/offline/outbox";
import {
  buscarContatos,
  buscarProdutos,
  contarCatalogo,
  type ContatoEmCache,
} from "@/lib/offline/catalogo";
import type { Db } from "@/lib/offline/outbox";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`elemento #${id} não existe`);
  return el;
};

function avisar(texto: string): void {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("visivel");
}

function dinheiro(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function uuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface ItemEscolhido {
  product_id: string;
  nome: string;
  preco_unit_cents: number;
  quantidade: number;
}

let contato: ContatoEmCache | null = null;
const itens: ItemEscolhido[] = [];

async function proximoProvisorio(db: Db): Promise<string> {
  const r = await db.query(`SELECT valor FROM meta WHERE chave = 'sequencia_off'`);
  const atual = Number(r.values?.[0]?.valor ?? 0) + 1;
  await db.execute(
    `INSERT INTO meta (chave, valor) VALUES ('sequencia_off', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
    [String(atual)],
  );
  return `OFF-${String(atual).padStart(4, "0")}`;
}

/**
 * Espia o próximo número sem consumir.
 *
 * O `proximoProvisorio` consome — e consumir para mostrar faria a sequência
 * pular toda vez que o vendedor abre a tela e desiste. Espiar mostra
 * `OFF-(atual+1)` como estimativa; a reserva real é no salvar.
 */
async function espiarProvisorio(db: Db): Promise<string> {
  const r = await db.query(`SELECT valor FROM meta WHERE chave = 'sequencia_off'`);
  const atual = Number(r.values?.[0]?.valor ?? 0) + 1;
  return `OFF-${String(atual).padStart(4, "0")}`;
}

function renderItens(): void {
  const ul = $("itens");
  ul.innerHTML = "";
  let total = 0;
  itens.forEach((it, i) => {
    total += it.preco_unit_cents * it.quantidade;
    const li = document.createElement("li");
    li.className = "linha-item";
    li.innerHTML =
      `<span><strong>${escapeHtml(it.nome)}</strong><br>` +
      `<span class="miudo">${dinheiro(it.preco_unit_cents)} cada</span></span>`;
    const qtd = document.createElement("span");
    qtd.className = "qtd";
    const menos = document.createElement("button");
    menos.type = "button";
    menos.textContent = "−";
    menos.setAttribute("aria-label", `diminuir ${it.nome}`);
    menos.onclick = () => {
      it.quantidade--;
      if (it.quantidade <= 0) itens.splice(i, 1);
      renderItens();
    };
    const num = document.createElement("span");
    num.textContent = String(it.quantidade);
    const mais = document.createElement("button");
    mais.type = "button";
    mais.textContent = "+";
    mais.setAttribute("aria-label", `aumentar ${it.nome}`);
    mais.onclick = () => {
      it.quantidade++;
      renderItens();
    };
    qtd.append(menos, num, mais);
    li.appendChild(qtd);
    ul.appendChild(li);
  });
  $("total").textContent = `Total: ${dinheiro(total)}`;
}

async function iniciar(): Promise<void> {
  const db = await banco();

  const { produtos } = await contarCatalogo(db);
  if (produtos === 0) {
    avisar("Catálogo vazio. Volte e abra o sistema uma vez com internet.");
    ($("btn-salvar") as HTMLButtonElement).disabled = true;
    return;
  }

  $("provisorio").textContent = `(provisório ${await espiarProvisorio(db)})`;

  const buscaCliente = $("busca-cliente") as HTMLInputElement;
  buscaCliente.oninput = async () => {
    const termo = buscaCliente.value.trim();
    const ul = $("clientes");
    ul.innerHTML = "";
    if (termo.length < 2) return;
    for (const c of await buscarContatos(db, termo, 8)) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${c.nome}${c.cidade ? ` — ${c.cidade}` : ""}`;
      btn.onclick = () => {
        contato = c;
        $("cliente-escolhido").textContent = `cliente: ${c.nome}`;
        ul.innerHTML = "";
        buscaCliente.value = "";
      };
      li.appendChild(btn);
      ul.appendChild(li);
    }
  };

  const buscaProduto = $("busca-produto") as HTMLInputElement;
  buscaProduto.oninput = async () => {
    const termo = buscaProduto.value.trim();
    const ul = $("produtos");
    ul.innerHTML = "";
    if (termo.length < 2) return;
    for (const p of await buscarProdutos(db, termo, 8)) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${p.nome} — ${dinheiro(p.preco_cents)}`;
      btn.onclick = () => {
        const ja = itens.find((i) => i.product_id === p.id);
        if (ja) ja.quantidade++;
        else
          itens.push({
            product_id: p.id,
            nome: p.nome,
            preco_unit_cents: p.preco_cents,
            quantidade: 1,
          });
        if (p.controla_estoque && p.quantidade != null && somaQtd(p.id) > p.quantidade) {
          avisar(
            `Atenção: ${p.nome} tem ${p.quantidade} em estoque e o pedido pede ${somaQtd(p.id)}. O servidor decide no envio — pode recusar.`,
          );
        }
        renderItens();
        ul.innerHTML = "";
        buscaProduto.value = "";
      };
      li.appendChild(btn);
      ul.appendChild(li);
    }
  };

  ($("btn-salvar") as HTMLButtonElement).onclick = () => void salvar(db);
  renderItens();
}

function somaQtd(productId: string): number {
  return itens.filter((i) => i.product_id === productId).reduce((s, i) => s + i.quantidade, 0);
}

async function salvar(db: Db): Promise<void> {
  const nomeDigitado = ($("busca-cliente") as HTMLInputElement).value.trim();
  const nome = contato?.nome ?? nomeDigitado;
  if (!nome || nome.length < 2) {
    avisar("Escolha ou digite o nome do cliente (ao menos 2 letras).");
    return;
  }
  if (itens.length === 0) {
    avisar("Adicione ao menos 1 item.");
    return;
  }
  const numero_provisorio = await proximoProvisorio(db);
  const payload = {
    cliente_nome: nome,
    contact_id: contato?.id ?? null,
    status: "aprovado",
    origem: "vendedor",
    observacoes: ($("obs") as HTMLInputElement).value.trim() || undefined,
    itens: itens.map((i) => ({
      product_id: i.product_id,
      quantidade: i.quantidade,
      preco_unit_cents: i.preco_unit_cents,
      desconto_pct: 0,
    })),
  };
  await enfileirarPedido(db, { uuid: uuid(), numero_provisorio, payload, agora: new Date().toISOString() });
  window.location.href = "./index.html";
}

void iniciar();

if (import.meta.env.DEV) {
  (window as unknown as { __offline: unknown }).__offline = { banco };
}
