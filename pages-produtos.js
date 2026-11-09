import { crudPage } from './crud.js';
import { badge, brl } from './ui.js';

export const render = root => crudPage(root, {
  table: 'produtos', singular: 'produto', exportavel: true, order: 'nome', asc: true,
  search: ['nome', 'sku'],
  columns: [
    { key: 'nome', label: 'Produto' },
    { key: 'sku', label: 'SKU' },
    { label: 'Preço', cls: 'num', render: r => brl(r.preco) },
    { label: 'Estoque', cls: 'num', render: r => r.estoque == null ? '—' : r.estoque <= 0 ? badge('0', 'err') : r.estoque },
    { label: 'Status', render: r => r.ativo ? badge('ativo', 'ok') : badge('inativo') },
  ],
  fields: [
    { name: 'nome', label: 'Nome', required: true, full: true },
    { name: 'sku', label: 'SKU' },
    { name: 'preco', label: 'Preço (R$)', type: 'number', step: '0.01', min: 0, required: true, default: 0 },
    { name: 'estoque', label: 'Estoque (vazio = não controla)', type: 'number', step: '1' },
    { name: 'ativo', label: 'Produto ativo', type: 'checkbox' },
  ],
});
