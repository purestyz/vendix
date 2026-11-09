export const $ = (s, r = document) => r.querySelector(s);

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const dt = d => {
  if (!d) return '-';
  return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-BR');
};

export const badge = (txt, kind = '') => `<span class="badge ${kind}">${esc(txt)}</span>`;

export const debounce = (fn, ms = 300) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export function msgErro(e) {
  if (e?.code === '23503') return 'Existem registros vinculados a este item; não é possível excluir.';
  if (e?.code === '23505') return 'Já existe um registro com esses dados.';
  return e?.message || 'Erro inesperado';
}

export function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + (tipo === 'erro' ? 'erro' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

/* ---------- modal ---------- */
const dlg = () => $('#modal');
export function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  if (!dlg().open) dlg().showModal();
  return $('#modal-body');
}
export const closeModal = () => dlg().open && dlg().close();

export function initModal() {
  $('#modal-x').onclick = closeModal;
  dlg().addEventListener('click', e => { if (e.target === dlg()) closeModal(); });
}

/* ---------- formulário genérico ---------- */
function campo(f, v) {
  const val = v ?? f.default ?? '';
  const cls = f.full ? 'full' : '';
  const req = f.required ? 'required' : '';
  if (f.type === 'checkbox')
    return `<label class="check ${cls}"><input type="checkbox" name="${f.name}" ${val === '' || val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  let input;
  if (f.type === 'select') {
    input = `<select name="${f.name}" ${req}>${f.required ? '' : '<option value=""></option>'}` +
      f.opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('') +
      '</select>';
  } else if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" rows="3" ${req}>${esc(val)}</textarea>`;
  } else {
    input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${f.type === 'number' ? `step="${f.step || 'any'}" min="${f.min ?? ''}"` : ''}>`;
  }
  return `<label class="${cls}">${esc(f.label)}${input}</label>`;
}

export async function formModal({ title, fields, values = {}, onSubmit }) {
  const resolved = await Promise.all(fields.map(async f =>
    ({ ...f, opts: typeof f.options === 'function' ? await f.options() : f.options })));
  const body = openModal(title,
    `<form class="form">${resolved.map(f => campo(f, values[f.name])).join('')}
     <div class="form-actions"><button type="button" class="btn" data-cancel>Cancelar</button>
     <button class="btn primary">Salvar</button></div></form>`);
  const form = $('form', body);
  $('[data-cancel]', form).onclick = closeModal;
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('.primary', form); btn.disabled = true;
    try {
      const out = {};
      for (const f of resolved) {
        const el = form.elements[f.name];
        if (f.type === 'checkbox') out[f.name] = el.checked;
        else {
          const v = el.value.trim();
          out[f.name] = v === '' ? null : f.type === 'number' ? Number(v) : v;
        }
      }
      await onSubmit(out);
      closeModal();
    } catch (err) { toast(msgErro(err), 'erro'); btn.disabled = false; }
  };
}
