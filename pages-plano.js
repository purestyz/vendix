import { sb } from './api.js';
import { $, brl, esc, toast, msgErro } from './ui.js';
import { carregarPlano, plano, listarPlanos, conteudoCard, lim } from './plano.js';

export async function render(root, opts = {}) {
  root.innerHTML = '<div class="loading">Carregando…</div>';
  let lista;
  try { [lista] = await Promise.all([listarPlanos(), carregarPlano()]); }
  catch (e) { root.innerHTML = `<div class="empty">${esc(e.message)}<br>Você rodou o <code>schema-planos.sql</code>?</div>`; return; }

  const atual = plano();
  if (!atual) {
    root.innerHTML = '<div class="empty">Não encontrei seu plano. Rode o <code>schema-planos.sql</code> no Supabase.</div>';
    return;
  }
  window.dispatchEvent(new Event('plano-mudou'));

  const uso = [
    ['Clientes', atual.uso.clientes, atual.max_clientes],
    ['Produtos', atual.uso.produtos, atual.max_produtos],
    ['Pedidos neste mês', atual.uso.pedidos_mes, atual.max_pedidos_mes],
    ...(atual.modulo_assinaturas ? [['Assinaturas ativas', atual.uso.assinaturas, atual.max_assinaturas]] : []),
  ];
  const barra = ([l, u, m]) => `<div class="uso">
    <div class="uso-top"><span>${l}</span><b>${u} / ${m == null ? '∞' : m}</b></div>
    ${m == null ? '' : `<progress value="${Math.min(u, m)}" max="${m}"></progress>`}</div>`;

  const rotulo = p => p.codigo === atual.codigo ? 'Plano atual'
    : p.ordem > atual.ordem ? 'Fazer upgrade' : 'Mudar para este';

  root.innerHTML = `
    ${opts.bloqueio ? `<div class="aviso" style="margin-bottom:14px">Seu plano <b>${esc(atual.nome)}</b> não inclui ${esc(opts.bloqueio)}. Escolha um plano abaixo para liberar.</div>` : ''}
    <div class="card pad">
      <div class="uso-head">
        <div><small class="muted">Seu plano</small><h2>${esc(atual.nome)}</h2></div>
        <b>${atual.preco > 0 ? brl(atual.preco) + '/mês' : 'Grátis'}</b>
      </div>
      ${uso.map(barra).join('')}
    </div>
    <h2 class="sec">Planos disponíveis</h2>
    <div class="planos-grid">${lista.map(p => `
      <div class="card plano-card ${p.codigo === atual.codigo ? 'atual' : ''}">
        ${conteudoCard(p)}
        <button class="btn ${p.codigo === atual.codigo ? '' : 'primary'}" data-c="${esc(p.codigo)}"
          ${p.codigo === atual.codigo ? 'disabled' : ''}>${rotulo(p)}</button>
      </div>`).join('')}
    </div>
    <p class="muted small" style="margin-top:14px">A cobrança ainda não está integrada: a troca de plano é imediata e sem pagamento.</p>`;

  root.onclick = async e => {
    const b = e.target.closest('button[data-c]'); if (!b || b.disabled) return;
    const alvo = lista.find(p => p.codigo === b.dataset.c);
    if (!confirm(`Mudar para o plano ${alvo.nome}?`)) return;
    b.disabled = true;
    const { error } = await sb.rpc('trocar_plano', { p_codigo: alvo.codigo });
    if (error) { toast(msgErro(error), 'erro'); b.disabled = false; return; }
    toast(`Agora você está no plano ${alvo.nome}`);
    render(root);
  };
}
