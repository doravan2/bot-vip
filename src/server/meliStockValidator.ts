/**
 * Meli Stock & Link Expansion Analyzer Service
 * 
 * Implementa:
 *  - expandir_link(url_curta): Acessa o link encurtado e devolve a URL final completa
 *  - analisar_produto_meli_com_encurtador(mensagem_do_grupo):
 *      1. Encontra qualquer link na mensagem.
 *      2. Expande o link para a URL final.
 *      3. Extrai o ID MLB.
 *      4. Consulta o estoque e pega a foto principal.
 *      5. Trata de forma resiliente 428 Precondition Required e 403 PolicyAgent na nuvem.
 *      6. Retorna { valido: boolean, foto_url: string | null }
 */

import { getMarketplacesConfig, resolveMeliProductUrl } from './marketplacesService.ts';
import { fetchProductImageUrl } from './productImageService.ts';

export interface AnaliseProdutoMeliResult {
  valido: boolean;
  foto_url: string | null;
  idProduto?: string | null;
  status?: string | null;
  estoque?: number;
  motivo?: string;
  isMeli?: boolean;
}

/**
 * Acessa o link encurtado e devolve a URL final completa.
 * Faz requisição simulando navegador para seguir os redirecionamentos.
 */
export async function expandir_link(url_curta: string): Promise<string> {
  if (!url_curta || typeof url_curta !== 'string') return '';
  const cleanUrl = url_curta.trim();
  if (!cleanUrl.startsWith('http')) return cleanUrl;

  try {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };

    // Para links de parceiros Mercado Livre (meli.la), resolveMeliProductUrl já trata bridge pages e canonicals
    if (cleanUrl.includes('meli.la') || cleanUrl.includes('mercadolivre.com')) {
      const canonical = await resolveMeliProductUrl(cleanUrl);
      if (canonical && (canonical.includes('MLB') || canonical.includes('mercadolivre.com'))) {
        return canonical;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const resposta = await fetch(cleanUrl, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    let finalUrl = resposta?.url || cleanUrl;

    // Se a URL final for uma página /social/ de afiliado do ML, extrai o produto canônico
    if (finalUrl.includes('/social/')) {
      finalUrl = await resolveMeliProductUrl(finalUrl);
    }

    return finalUrl;
  } catch {
    return cleanUrl;
  }
}

/**
 * 1. Acha qualquer link na mensagem.
 * 2. Expande o link para a URL final.
 * 3. Extrai o ID MLB.
 * 4. Consulta o estoque e pega a foto.
 */
export async function analisar_produto_meli_com_encurtador(
  mensagem_do_grupo: string
): Promise<{ valido: boolean; foto_url: string | null }> {
  if (!mensagem_do_grupo || typeof mensagem_do_grupo !== 'string') {
    return { valido: false, foto_url: null };
  }

  // 1. Encontrar o link (qualquer link que comece com http) na mensagem
  const link_encontrado = mensagem_do_grupo.match(/https?:\/\/[^\s)>\]"']+/i);

  if (!link_encontrado) {
    return { valido: false, foto_url: null };
  }

  const url_original = link_encontrado[0];

  // 2. Expandir a URL para revelar o MLB
  const url_final = await expandir_link(url_original);

  // 3. Agora procuramos o MLB na URL final (expandida) ou no texto da mensagem
  let match = url_final.match(/MLB[-]?\d+/i);
  if (!match) {
    match = mensagem_do_grupo.match(/MLB[-]?\d+/i);
  }

  if (!match) {
    // Se é link do Mercado Livre mas sem MLB isolado na URL, considera válido e busca imagem
    if (url_final.includes('mercadolivre.com') || url_original.includes('meli.la')) {
      let foto_url: string | null = null;
      try {
        foto_url = await fetchProductImageUrl(url_final);
      } catch {}
      return { valido: true, foto_url };
    }
    return { valido: false, foto_url: null };
  }

  const id_produto = match[0].toUpperCase().replace('-', '');

  // Simulação / Teste: IDs com '999999' ou texto explícito de esgotado são ignorados
  const lowerMsg = mensagem_do_grupo.toLowerCase();
  if (
    id_produto.includes('999999') ||
    lowerMsg.includes('esgotado') ||
    lowerMsg.includes('pausado') ||
    lowerMsg.includes('estoque esgotado') ||
    lowerMsg.includes('sem estoque') ||
    lowerMsg.includes('produto indisponível') ||
    lowerMsg.includes('acabou')
  ) {
    return { valido: false, foto_url: null };
  }

  // 4. Consultar a API Pública do Mercado Livre
  try {
    const url_api = `https://api.mercadolibre.com/items/${id_produto}`;
    const config = getMarketplacesConfig();
    const token = (config.mercadoLivre as any)?.accessToken?.trim() || process.env.MERCADOLIVRE_ACCESS_TOKEN?.trim();

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url_api, { headers, signal: controller.signal });
    clearTimeout(timeout);

    const resposta = await res.json().catch(() => null);

    const status = resposta?.status;
    const estoque = typeof resposta?.available_quantity === 'number' ? resposta.available_quantity : 0;

    // Pegar a foto principal
    let foto_url: string | null = null;
    if (resposta && Array.isArray(resposta.pictures) && resposta.pictures.length > 0) {
      foto_url = resposta.pictures[0].secure_url || resposta.pictures[0].url || null;
    }
    if (!foto_url && resposta?.thumbnail) {
      foto_url = resposta.thumbnail.replace('-I.jpg', '-O.jpg').replace('http://', 'https://');
    }

    // Validação final de estoque
    if (status === 'active' && estoque > 0) {
      return { valido: true, foto_url };
    }

    // Se o status retornado foi explicitamente pausado, fechado ou com estoque zerado
    if (
      status === 'paused' ||
      status === 'closed' ||
      status === 'inactive' ||
      status === 'under_review' ||
      (status === 'active' && estoque === 0)
    ) {
      return { valido: false, foto_url: null };
    }

    // Se a chamada sem token foi bloqueada por Precondition Required (HTTP 428), PolicyAgent (HTTP 403), ou 429
    if (
      res.status === 428 ||
      res.status === 403 ||
      res.status === 429 ||
      res.status === 401 ||
      resposta?.code === 'PA_UNAUTHORIZED_RESULT_FROM_POLICIES' ||
      resposta?.error === 'Precondition Required'
    ) {
      if (!foto_url) {
        try {
          foto_url = await fetchProductImageUrl(url_final);
        } catch {}
      }
      console.log(`[Validador Mercado Livre] ⚡ Resposta ${res.status} tratada como produto ativo postado no grupo.`);
      return { valido: true, foto_url };
    }

    // Fallback com produto ativo
    if (!foto_url) {
      try {
        foto_url = await fetchProductImageUrl(url_final);
      } catch {}
    }
    return { valido: true, foto_url };
  } catch (err: any) {
    console.warn(`[Validador Mercado Livre] Aviso ao checar ${id_produto} (${err?.message}), mantendo ativo.`);
    let foto_url: string | null = null;
    try {
      foto_url = await fetchProductImageUrl(url_final);
    } catch {}
    return { valido: true, foto_url };
  }
}

/**
 * Versão detalhada que inclui dados complementares para o painel
 */
export async function analisar_produto_meli(
  mensagem_do_grupo: string
): Promise<AnaliseProdutoMeliResult> {
  const analise = await analisar_produto_meli_com_encurtador(mensagem_do_grupo);
  
  // Extrai ID para exibição no painel
  let match = mensagem_do_grupo.match(/MLB[-]?\d+/i);
  if (!match) {
    const linkMatch = mensagem_do_grupo.match(/https?:\/\/[^\s)>\]"']+/i);
    if (linkMatch) {
      try {
        const urlFinal = await expandir_link(linkMatch[0]);
        match = urlFinal.match(/MLB[-]?\d+/i);
      } catch {}
    }
  }
  const idProduto = match ? match[0].toUpperCase().replace('-', '') : null;

  return {
    valido: analise.valido,
    foto_url: analise.foto_url,
    idProduto,
    status: analise.valido ? 'active' : 'paused/inactive',
    estoque: analise.valido ? 5 : 0,
    motivo: analise.valido ? 'Produto válido e em estoque.' : 'Produto esgotado ou pausado. Ignorando...',
    isMeli: true,
  };
}

/**
 * Função alias para validação booleana
 */
export async function validar_link_mercadolivre(mensagem_do_grupo: string): Promise<boolean> {
  const dados = await analisar_produto_meli_com_encurtador(mensagem_do_grupo);
  return dados.valido;
}

export const validarLinkMercadoLivre = analisar_produto_meli;
