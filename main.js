import { sb } from './api.js';
import { SUPABASE_URL } from './config.js';
import { $, esc, toast, initModal } from './ui.js';
import { carregarPlano, plano, pode, listarPlanos, conteudoCard } from './plano.js';

const ROTAS = {
  dashboard:   ['Painel',       './pages-dashboard.js'],
  pedidos:     ['Pedidos',      './pages-pedidos.js'],
  clientes:    ['Clientes',     './pages-clientes.js'],
  produtos:    ['Produtos',     './pages-produtos.js'],
  assinaturas: ['Assinaturas',  './pages-assinaturas.js'],
  plano:       ['Meu plano',    './pages-plano.js'],
};

/* ---------- plano na interface ---------- */
function atualizarPlanoUI() {
  const p = plano();
  $('#plano-chip').textContent = p ? `Plano ${p.nome}` : 'Plano';
  $('#nav a[href="#/assinaturas"]').classList.toggle('lock', !pode('modulo_assinaturas'));
}
window.addEventListener('plano-mudou', atualizarPlanoUI);

/* ---------- rotas ---------- */
let token = 0;
async function rota() {
  let chave = location.hash.replace('#/', '') || 'dashboard';
  if (!ROTAS[chave]) chave = 'dashboard';
  const [titulo, arquivo] = ROTAS[chave];
  const bloqueado = chave === 'assinaturas' && !pode('modulo_assinaturas');
  const t = ++token, view = $('#view');

  $('#titulo').textContent = titulo;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('on', a.getAttribute('href') === '#/' + chave));
  $('.sidebar').classList.remove('open');
  view.innerHTML = '<div class="loading">Carregando…</div>';

  try {
    const mod = await import(bloqueado ? './pages-plano.js' : arquivo);   // carrega só a página aberta
    if (t !== token) return;
    const box = document.createElement('div');
    view.replaceChildren(box);
    await mod.render(box, bloqueado ? { bloqueio: 'o módulo de Assinaturas' } : {});
  } catch (e) {
    if (t === token) view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

const mostrar = logado => { $('#auth').hidden = logado; $('#app').hidden = !logado; };

/* ---------- entrar / criar conta ---------- */
let planosCarregados = false;
async function carregarPlanosCadastro() {
  if (planosCarregados || SUPABASE_URL.includes('SEU-PROJETO')) return;
  const box = $('#planos-cadastro');
  try {
    const lista = await listarPlanos();
    box.innerHTML = lista.map((p, i) => `<label class="plano-card">
      <input type="radio" name="plano" value="${esc(p.codigo)}" ${i === 0 ? 'checked' : ''}>
      ${conteudoCard(p)}</label>`).join('');
    planosCarregados = true;
  } catch {
    box.innerHTML = '<p class="muted">Não foi possível carregar os planos. Rode o <code>schema-planos.sql</code> no Supabase.</p>';
  }
}

function ligarAuth() {
  const abas = document.querySelectorAll('#auth-tabs button');
  const ir = t => {
    abas.forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#form-entrar').hidden = t !== 'entrar';
    $('#form-criar').hidden = t !== 'criar';
    $('#auth-card').classList.toggle('wide', t === 'criar');
    if (t === 'criar') carregarPlanosCadastro();
  };
  $('#auth-tabs').onclick = e => { const b = e.target.closest('button'); if (b) ir(b.dataset.t); };

  $('#form-entrar').onsubmit = async e => {
    e.preventDefault();
    const f = e.target, btn = $('button[type=submit]', f);
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
    btn.disabled = false;
    if (error) toast('E-mail ou senha inválidos', 'erro');
  };

  $('#form-criar').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    if (f.senha.value !== f.confirma.value) return toast('As senhas não conferem', 'erro');
    const btn = $('button[type=submit]', f); btn.disabled = true;
    const escolhido = f.querySelector('input[name=plano]:checked');
    const { data, error } = await sb.auth.signUp({
      email: f.email.value.trim(),
      password: f.senha.value,
      options: { data: { nome: f.nome.value.trim(), plano: escolhido?.value || 'faisca' } },
    });
    btn.disabled = false;
    if (error) return toast(error.message, 'erro');
    if (!data.session) { toast('Conta criada! Confirme o e-mail para entrar.'); ir('entrar'); }
  };

  $('#sair').onclick = () => sb.auth.signOut();
  $('#menu').onclick = () => $('.sidebar').classList.toggle('open');
}

/* ---------- início ---------- */
async function entrar() {
  await carregarPlano();
  atualizarPlanoUI();
  mostrar(true);
  rota();
}

async function iniciar() {
  window.__vendixOk = true;
  $('#boot').hidden = true;
  initModal();
  ligarAuth();
  window.addEventListener('hashchange', () => { if (!$('#app').hidden) rota(); });

  if (SUPABASE_URL.includes('SEU-PROJETO')) {
    $('#auth').hidden = false; $('#aviso').hidden = false;
    window.__vendixPronto = true; return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await entrar(); else mostrar(false);

  sb.auth.onAuthStateChange((_ev, s) => {
    const estava = !$('#app').hidden;
    if (!s) return mostrar(false);
    // evita chamar o supabase dentro do próprio callback (pode travar)
    if (!estava) setTimeout(entrar, 0);
  });
  window.__vendixPronto = true;
}
iniciar();
