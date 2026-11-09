import { sb } from './api.js';
import { $, esc, toast, debounce, formModal, msgErro } from './ui.js';

const SIZE = 15;

/**
 * Tela de listagem + CRUD genérica (busca, paginação no servidor, modal de edição).
 * cfg: { table, singular, select, columns, fields, search[], order, asc, filter(q),
 *        rowActions[{label, fn(row, reload), show(row)}], toolbar(el, reload),
 *        onNew(reload), beforeSave(payload,row), noCreate, noEdit, noDelete }
 */
export async function crudPage(root, cfg) {
  let page = 0, term = '', total = 0, rows = [];

  root.innerHTML = `
    <div class="toolbar">
      ${cfg.search ? '<input type="search" class="search" placeholder="Buscar…">' : ''}
      <div class="spacer"></div><span class="extra"></span>
      ${cfg.noCreate ? '' : `<button class="btn primary" data-new>+ Novo ${esc(cfg.singular)}</button>`}
    </div>
    <div class="card table-wrap"></div><div class="pager"></div>`;

  const wrap = $('.table-wrap', root), pager = $('.pager', root);

  async function load() {
    wrap.innerHTML = '<div class="loading">Carregando…</div>';
    let q = sb.from(cfg.table).select(cfg.select || '*', { count: 'exact' });
    if (term) q = q.or(cfg.search.map(c => `${c}.ilike.%${term}%`).join(','));
    if (cfg.filter) q = cfg.filter(q);
    q = q.order(cfg.order || 'criado_em', { ascending: !!cfg.asc })
         .range(page * SIZE, page * SIZE + SIZE - 1);
    const { data, error, count } = await q;
    if (error) { wrap.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
    rows = data; total = count || 0;
    draw();
  }

  function draw() {
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty">Nada por aqui ainda.</div>';
      pager.innerHTML = ''; return;
    }
    const extras = cfg.rowActions || [];
    const acts = r => [
      ...extras.map((a, i) => (a.show && !a.show(r)) ? '' : btn(a.label, 'x' + i)),
      cfg.noEdit ? '' : btn('Editar', 'edit'),
      cfg.noDelete ? '' : btn('Excluir', 'del', 'danger'),
    ].join('');
    const btn = (l, k, c = '') => `<button class="btn sm ${c}" data-a="${k}">${l}</button>`;

    wrap.innerHTML = `<table><thead><tr>
      ${cfg.columns.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-i="${i}">
        ${cfg.columns.map(c => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}
        <td class="acts">${acts(r)}</td></tr>`).join('')}</tbody></table>`;

    const pages = Math.ceil(total / SIZE);
    pager.innerHTML = pages > 1
      ? `<button class="btn sm" data-p="-1" ${page === 0 ? 'disabled' : ''}>←</button>
         <span>${page + 1} / ${pages} · ${total} registros</span>
         <button class="btn sm" data-p="1" ${page + 1 >= pages ? 'disabled' : ''}>→</button>`
      : `<span>${total} registro(s)</span>`;
  }

  const edit = row => formModal({
    title: row ? `Editar ${cfg.singular}` : `Novo ${cfg.singular}`,
    fields: cfg.fields, values: row || {},
    onSubmit: async payload => {
      if (cfg.beforeSave) payload = cfg.beforeSave(payload, row) || payload;
      const r = row
        ? await sb.from(cfg.table).update(payload).eq('id', row.id)
        : await sb.from(cfg.table).insert(payload);
      if (r.error) throw r.error;
      toast('Salvo');
      load();
    },
  });

  wrap.onclick = async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const row = rows[b.closest('tr').dataset.i], a = b.dataset.a;
    if (a === 'edit') return edit(row);
    if (a === 'del') {
      if (!confirm(`Excluir este ${cfg.singular}?`)) return;
      const { error } = await sb.from(cfg.table).delete().eq('id', row.id);
      if (error) return toast(msgErro(error), 'erro');
      toast('Excluído');
      if (rows.length === 1 && page > 0) page--;
      return load();
    }
    await cfg.rowActions[+a.slice(1)].fn(row, load);
  };

  pager.onclick = e => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    page += +b.dataset.p; load();
  };

  const s = $('.search', root);
  if (s) s.oninput = debounce(() => {
    term = s.value.replace(/[,()%*]/g, ' ').trim(); page = 0; load();
  });

  const novo = $('[data-new]', root);
  if (novo) novo.onclick = () => cfg.onNew ? cfg.onNew(load) : edit();
  if (cfg.toolbar) cfg.toolbar($('.extra', root), load);

  await load();
}
