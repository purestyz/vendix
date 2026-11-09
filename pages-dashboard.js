import { sb } from './api.js';
import { brl, dt, esc, badge } from './ui.js';

const KIND = { aberto: 'warn', faturado: 'info', entregue: 'ok', cancelado: 'err',
               pendente: 'warn', atrasada: 'err', paga: 'ok' };

export async function render(root) {
  const [res, ped, fat] = await Promise.all([
    sb.rpc('dashboard_resumo'),
    sb.from('pedidos').select('numero,total,status,criado_em,clientes(nome)')
      .order('criado_em', { ascending: false }).limit(6),
    sb.from('faturas').select('valor,vencimento,status,assinaturas(clientes(nome))')
      .in('status', ['pendente', 'atrasada']).order('vencimento').limit(6),
  ]);

  if (res.error) {
    root.innerHTML = `<div class="empty">${esc(res.error.message)}<br>Você já rodou o <code>schema.sql</code> no Supabase?</div>`;
    return;
  }
  const d = res.data;
  const stat = (l, v) => `<div class="card stat"><small>${l}</small><b>${v}</b></div>`;

  const linhas = (arr, fn) => arr?.length
    ? `<table><tbody>${arr.map(fn).join('')}</tbody></table>`
    : '<div class="empty">Nada por aqui.</div>';

  root.innerHTML = `
    <div class="stats">
      ${stat('Vendas no mês', brl(d.vendas_mes))}
      ${stat('Pedidos no mês', d.pedidos_mes)}
      ${stat('Clientes ativos', d.clientes)}
      ${stat('Assinaturas ativas', d.assinaturas_ativas)}
      ${stat('Receita recorrente (MRR)', brl(d.mrr))}
      ${stat('A receber', brl(d.a_receber))}
    </div>
    <div class="grid2">
      <div class="card"><h2>Últimos pedidos</h2>
        ${linhas(ped.data, p => `<tr><td>#${p.numero}</td><td>${esc(p.clientes?.nome)}</td>
          <td>${badge(p.status, KIND[p.status])}</td><td class="num">${brl(p.total)}</td></tr>`)}
      </div>
      <div class="card"><h2>Faturas em aberto ${d.faturas_atrasadas ? badge(d.faturas_atrasadas + ' atrasada(s)', 'err') : ''}</h2>
        ${linhas(fat.data, f => `<tr><td>${dt(f.vencimento)}</td>
          <td>${esc(f.assinaturas?.clientes?.nome)}</td>
          <td>${badge(f.status, KIND[f.status])}</td><td class="num">${brl(f.valor)}</td></tr>`)}
      </div>
    </div>`;
}
