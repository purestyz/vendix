import { crudPage } from './crud.js';
import { badge } from './ui.js';

export const render = root => crudPage(root, {
  table: 'clientes', singular: 'cliente', exportavel: true, order: 'nome', asc: true,
  search: ['nome', 'email', 'documento', 'telefone'],
  columns: [
    { key: 'nome', label: 'Nome' },
    { key: 'documento', label: 'CPF/CNPJ' },
    { key: 'email', label: 'E-mail' },
    { key: 'telefone', label: 'Telefone' },
    { label: 'Status', render: r => r.ativo ? badge('ativo', 'ok') : badge('inativo') },
  ],
  fields: [
    { name: 'nome', label: 'Nome', required: true, full: true },
    { name: 'documento', label: 'CPF/CNPJ' },
    { name: 'telefone', label: 'Telefone' },
    { name: 'email', label: 'E-mail', type: 'email', full: true },
    { name: 'endereco', label: 'Endereço', full: true },
    { name: 'ativo', label: 'Cliente ativo', type: 'checkbox' },
  ],
});
