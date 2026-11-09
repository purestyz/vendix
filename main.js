import { sb } from './api.js';
import { SUPABASE_URL } from './config.js';
import { $, esc, toast, initModal } from './ui.js';

const ROTAS = {
  dashboard:   ['Painel',       './pages-dashboard.js'],
  pedidos:     ['Pedidos',      './pages-pedidos.js'],
  clientes:    ['Clientes',     './pages-clientes.js'],
  produtos:    ['Produtos',     './pages-produtos.js'],
  assinaturas: ['Assinaturas',  './pages-assinaturas.js'],
};

let token = 0;
async function rota() {
  const chave = location.hash.replace('#/', '') || 'dashboard';
  const [titulo, arquivo] = ROTAS[chave] || ROTAS.dashboard;
  const t = ++token, view = $('#view');

  $('#titulo').textContent = titulo;
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('on', a.getAttribute('href') === '#/' + chave));
  $('.sidebar').classList.remove('open');
  view.innerHTML = '<div class="loading">Carregando…</div>';

  try {
    const mod = await import(arquivo);       // carrega só a página aberta
    if (t !== token) return;
    const box = document.createElement('div');
    view.replaceChildren(box);
    await mod.render(box);
  } catch (e) {
    if (t === token) view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

const mostrar = logado => { $('#auth').hidden = logado; $('#app').hidden = !logado; };

function ligarAuth() {
  const form = $('#login');
  const cred = () => ({ email: form.email.value.trim(), password: form.senha.value });

  form.onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword(cred());
    if (error) toast('E-mail ou senha inválidos', 'erro');
  };
  $('#criar-conta').onclick = async () => {
    if (!form.reportValidity()) return;
    const { data, error } = await sb.auth.signUp(cred());
    if (error) return toast(error.message, 'erro');
    if (!data.session) toast('Conta criada! Confirme o e-mail para entrar.');
  };
  $('#sair').onclick = () => sb.auth.signOut();
  $('#menu').onclick = () => $('.sidebar').classList.toggle('open');
}

async function iniciar() {
  initModal();
  ligarAuth();
  window.addEventListener('hashchange', rota);

  if (SUPABASE_URL.includes('SEU-PROJETO')) {
    $('#auth').hidden = false; $('#aviso').hidden = false; return;
  }
  const { data: { session } } = await sb.auth.getSession();
  mostrar(!!session);
  if (session) rota();

  sb.auth.onAuthStateChange((_ev, s) => {
    const estava = !$('#app').hidden;
    mostrar(!!s);
    if (s && !estava) rota();
  });
}
iniciar();
