import { crudPage } from './crud.js';
import { sb } from './api.js';
import { $, brl, dt, esc, badge, toast, msgErro } from './ui.js';

const PERIODO = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
const KIND = { ativa: 'ok', pausada: 'warn', cancelada: 'err', pendente: 'warn', atrasada: 'err', paga: 'ok' };

const opcoes = (tabela, label) => async () => {
  const { data, error } = await sb.from(tabela).select('id,nome,preco').order('nome').limit(1000);
  if (error) throw error;
  return data.map(x => [x.id, label ? label(x) : x.nome]);
};

const ABAS = {
  assinaturas: root => crudPage(root, {
    table: 'assinaturas', singular: 'assinatura',
    select: '*, clientes(nome), planos(nome,periodicidade)',
    order: 'proximo_vencimento', asc: true,
    columns: [
      { label: 'Cliente', render: r => esc(r.clientes?.nome) },
      { label: 'Plano', render: r => esc(r.planos?.nome) },
      { label: 'Valor', cls: 'num', render: r => brl(r.valor) },
      { label: 'Próx. vencimento', render: r => dt(r.proximo_vencimento) },
      { label: 'Status', render: r => badge(r.status, KIND[r.status]) },
    ],
    fields: [
      { name: 'cliente_id', label: 'Cliente', type: 'select', required: true, full: true, options: opcoes('clientes') },
      { name: 'plano_id', label: 'Plano', type: 'select', required: true, full: true,
        options: opcoes('planos', p => `${p.nome} — ${brl(p.preco)}`) },
      { name: 'valor', label: 'Valor (vazio = preço do plano)', type: 'number', step: '0.01', min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, default: 'ativa',
        options: [['ativa', 'Ativa'], ['pausada', 'Pausada'], ['cancelada', 'Cancelada']] },
      { name: 'inicio', label: 'Início', type: 'date', default: new Date().toISOString().slice(0, 10) },
      { name: 'proximo_vencimento', label: 'Próx. vencimento (vazio = início)', type: 'date' },
    ],
  }),

  planos: root => crudPage(root, {
    table: 'planos', singular: 'plano', order: 'nome', asc: true, search: ['nome'],
    columns: [
      { key: 'nome', label: 'Plano' },
      { label: 'Periodicidade', render: r => PERIODO[r.periodicidade] },
      { label: 'Preço', cls: 'num', render: r => brl(r.preco) },
      { label: 'Status', render: r => r.ativo ? badge('ativo', 'ok') : badge('inativo') },
    ],
    fields: [
      { name: 'nome', label: 'Nome', required: true, full: true },
      { name: 'preco', label: 'Preço (R$)', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'periodicidade', label: 'Periodicidade', type: 'select', required: true, default: 'mensal',
        options: Object.entries(PERIODO) },
      { name: 'descricao', label: 'Descrição', type: 'textarea', full: true },
      { name: 'ativo', label: 'Plano ativo', type: 'checkbox' },
    ],
  }),

  faturas: root => crudPage(root, {
    table: 'faturas', singular: 'fatura', select: '*, assinaturas(clientes(nome), planos(nome))',
    order: 'vencimento', asc: false, noCreate: true,
    columns: [
      { label: 'Vencimento', render: r => dt(r.vencimento) },
      { label: 'Cliente', render: r => esc(r.assinaturas?.clientes?.nome) },
      { label: 'Plano', render: r => esc(r.assinaturas?.planos?.nome) },
      { label: 'Valor', cls: 'num', render: r => brl(r.valor) },
      { label: 'Status', render: r => badge(r.status, KIND[r.status]) },
    ],
    fields: [
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true },
      { name: 'vencimento', label: 'Vencimento', type: 'date', required: true },
      { name: 'status', label: 'Status', type: 'select', required: true,
        options: [['pendente', 'Pendente'], ['paga', 'Paga'], ['atrasada', 'Atrasada'], ['cancelada', 'Cancelada']] },
    ],
    rowActions: [{
      label: 'Marcar paga',
      show: r => r.status === 'pendente' || r.status === 'atrasada',
      fn: async (r, reload) => {
        const { error } = await sb.from('faturas')
          .update({ status: 'paga', pago_em: new Date().toISOString() }).eq('id', r.id);
        if (error) return toast(msgErro(error), 'erro');
        toast('Fatura paga'); reload();
      },
    }],
    toolbar: (el, reload) => {
      el.innerHTML = '<button class="btn">Gerar faturas do ciclo</button>';
      $('button', el).onclick = async () => {
        const { data, error } = await sb.rpc('gerar_faturas');
        if (error) return toast(msgErro(error), 'erro');
        toast(data ? `${data} fatura(s) gerada(s)` : 'Nenhuma fatura a gerar agora'); reload();
      };
    },
  }),
};

export async function render(root) {
  root.innerHTML = `<div class="tabs">
      <button data-t="assinaturas">Assinaturas</button>
      <button data-t="planos">Planos</button>
      <button data-t="faturas">Faturas</button></div><div id="aba"></div>`;
  const aba = $('#aba', root);

  const abrir = t => {
    root.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    const box = document.createElement('div'); aba.replaceChildren(box);
    ABAS[t](box);
  };
  $('.tabs', root).onclick = e => { const b = e.target.closest('button'); if (b) abrir(b.dataset.t); };
  abrir('assinaturas');
}
