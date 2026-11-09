import { sb } from './api.js';
import { esc, brl } from './ui.js';

let atual = null;

export const plano = () => atual;
export const pode = chave => !!atual?.[chave];
export const lim = v => v == null ? 'ilimitados' : v.toLocaleString('pt-BR');

export async function carregarPlano() {
  const { data, error } = await sb.rpc('meu_plano');
  if (error) console.warn('meu_plano:', error.message);
  atual = error ? null : data;
  return atual;
}

export async function listarPlanos() {
  const { data, error } = await sb.from('planos_sistema').select('*').order('ordem');
  if (error) throw error;
  return data;
}

export function beneficios(p) {
  const itens = [
    [true, `Clientes: ${lim(p.max_clientes)}`],
    [true, `Produtos: ${lim(p.max_produtos)}`],
    [true, `Pedidos por mês: ${lim(p.max_pedidos_mes)}`],
    [p.modulo_assinaturas, p.modulo_assinaturas
      ? `Assinaturas: ${lim(p.max_assinaturas)}` : 'Módulo de assinaturas'],
    [p.modulo_assinaturas, 'Geração manual de faturas'],
    [p.faturas_automaticas, 'Faturas automáticas'],
    [p.exportar_csv, 'Exportar dados em CSV'],
  ];
  return `<ul class="ben">${itens.map(([ok, t]) =>
    `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✕'} ${esc(t)}</li>`).join('')}</ul>`;
}

// conteúdo comum dos cartões de plano (cadastro e "Meu plano")
export function conteudoCard(p) {
  return `${p.destaque ? `<span class="badge info destaque">${esc(p.destaque)}</span>` : ''}
    <h3>${esc(p.nome)}</h3>
    <div class="preco">${p.preco > 0 ? brl(p.preco) + '<small>/mês</small>' : 'Grátis'}</div>
    <p>${esc(p.descricao)}</p>${beneficios(p)}`;
}
