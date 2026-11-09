import { crudPage } from './crud.js';
import { sb } from './api.js';
import { $, brl, dt, esc, badge, openModal, closeModal, toast, msgErro } from './ui.js';

const KIND = { aberto: 'warn', faturado: 'info', entregue: 'ok', cancelado: 'err' };

export const render = root => crudPage(root, {
  table: 'pedidos', singular: 'pedido', select: '*, clientes(nome)', exportavel: true,
  noEdit: true, noDelete: true,
  columns: [
    { label: 'Nº', render: r => '#' + r.numero },
    { label: 'Cliente', render: r => esc(r.clientes?.nome || '-') },
    { label: 'Data', render: r => dt(r.criado_em) },
    { label: 'Status', render: r => badge(r.status, KIND[r.status]) },
    { label: 'Total', cls: 'num', render: r => brl(r.total) },
  ],
  onNew: novoPedido,
  rowActions: [{ label: 'Abrir', fn: verPedido }],
});

/* ---------- detalhe ---------- */
async function verPedido(p, reload) {
  const { data: itens, error } = await sb.from('pedido_itens')
    .select('descricao,quantidade,preco_unit,subtotal').eq('pedido_id', p.id).order('descricao');
  if (error) return toast(msgErro(error), 'erro');

  const cancelado = p.status === 'cancelado';
  const body = openModal(`Pedido #${p.numero}`, `
    <p class="muted">${esc(p.clientes?.nome)} · ${dt(p.criado_em)} ${p.observacao ? '· ' + esc(p.observacao) : ''}</p>
    <div class="card table-wrap"><table>
      <thead><tr><th>Item</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Subtotal</th></tr></thead>
      <tbody>${itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="num">${i.quantidade}</td>
        <td class="num">${brl(i.preco_unit)}</td><td class="num">${brl(i.subtotal)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="total-line"><span>Total</span><b>${brl(p.total)}</b></div>
    <div class="form-actions" style="display:flex;gap:8px;justify-content:flex-end">
      ${cancelado ? badge('cancelado', 'err') : `
        <select id="st" style="width:auto">
          ${['aberto', 'faturado', 'entregue'].map(s => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn primary" id="salvar">Atualizar status</button>
        <button class="btn danger" id="cancelar">Cancelar pedido</button>`}
    </div>`);

  if (cancelado) return;
  $('#salvar', body).onclick = async () => {
    const { error } = await sb.from('pedidos').update({ status: $('#st', body).value }).eq('id', p.id);
    if (error) return toast(msgErro(error), 'erro');
    toast('Status atualizado'); closeModal(); reload();
  };
  $('#cancelar', body).onclick = async () => {
    if (!confirm('Cancelar o pedido e devolver os itens ao estoque?')) return;
    const { error } = await sb.rpc('cancelar_pedido', { p_id: p.id });
    if (error) return toast(msgErro(error), 'erro');
    toast('Pedido cancelado'); closeModal(); reload();
  };
}

/* ---------- novo pedido ---------- */
async function novoPedido(reload) {
  const [c, pr] = await Promise.all([
    sb.from('clientes').select('id,nome').eq('ativo', true).order('nome').limit(1000),
    sb.from('produtos').select('id,nome,preco,estoque').eq('ativo', true).order('nome').limit(2000),
  ]);
  if (c.error || pr.error) return toast(msgErro(c.error || pr.error), 'erro');
  if (!c.data.length || !pr.data.length)
    return toast('Cadastre ao menos um cliente e um produto antes.', 'erro');

  const optProd = pr.data.map(p =>
    `<option value="${p.id}" data-preco="${p.preco}">${esc(p.nome)}${p.estoque != null ? ` (${p.estoque})` : ''}</option>`).join('');

  const body = openModal('Novo pedido', `
    <form class="form">
      <label class="full">Cliente<select name="cliente" required>
        <option value=""></option>${c.data.map(x => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select></label>
      <div class="full card table-wrap"><table class="itens"><tbody id="linhas"></tbody></table></div>
      <button type="button" class="btn sm" id="add">+ Adicionar item</button><span></span>
      <label class="full">Observação<input name="obs"></label>
      <div class="full total-line"><span>Total</span><b id="total">${brl(0)}</b></div>
      <div class="form-actions"><button type="button" class="btn" data-cancel>Cancelar</button>
        <button class="btn primary">Criar pedido</button></div>
    </form>`);

  const linhas = $('#linhas', body), form = $('form', body);

  const recalc = () => {
    let t = 0;
    linhas.querySelectorAll('tr').forEach(tr => {
      const s = Number($('.q', tr).value || 0) * Number($('.p', tr).value || 0);
      $('.s', tr).textContent = brl(s); t += s;
    });
    $('#total', body).textContent = brl(t);
  };
  const addLinha = () => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="width:46%"><select class="prod"><option value=""></option>${optProd}</select></td>
      <td><input class="q" type="number" min="1" step="1" value="1" style="width:70px"></td>
      <td><input class="p" type="number" min="0" step="0.01" value="0" style="width:100px"></td>
      <td class="s num">${brl(0)}</td><td><button type="button" class="btn sm ghost x">✕</button></td>`;
    linhas.append(tr);
  };
  addLinha();

  $('#add', body).onclick = addLinha;
  $('[data-cancel]', body).onclick = closeModal;
  linhas.addEventListener('input', e => {
    if (e.target.classList.contains('prod')) {
      const o = e.target.selectedOptions[0];
      $('.p', e.target.closest('tr')).value = o?.dataset.preco ?? 0;
    }
    recalc();
  });
  linhas.addEventListener('click', e => {
    if (e.target.closest('.x') && linhas.rows.length > 1) { e.target.closest('tr').remove(); recalc(); }
  });

  form.onsubmit = async e => {
    e.preventDefault();
    const itens = [...linhas.querySelectorAll('tr')]
      .map(tr => ({ produto_id: $('.prod', tr).value, quantidade: +$('.q', tr).value, preco_unit: +$('.p', tr).value }))
      .filter(i => i.produto_id);
    if (!itens.length) return toast('Adicione ao menos um produto', 'erro');
    const btn = $('.primary', form); btn.disabled = true;
    const { error } = await sb.rpc('criar_pedido',
      { p_cliente: form.cliente.value, p_obs: form.obs.value.trim() || null, p_itens: itens });
    if (error) { toast(msgErro(error), 'erro'); btn.disabled = false; return; }
    toast('Pedido criado'); closeModal(); reload();
  };
}
