#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
PROCESSADOR PROFISSIONAL DE LINKS DE AFILIADO - MERCADO LIVRE
=============================================================================
Arquitetura de 3 etapas para resolução, higienização e monetização de ofertas:

  [1] expandir_link_concorrente: Segue redirecionamentos (meli.la/xyz)
  [2] extrair_link_puro:          Remove 100% de queries, tracking e fragments
  [3] gerar_link_afiliado_oficial: Gera link oficial encurtado (meli.la) via API

NUNCA mais concatena 'matt_tool_id=' em URLs longas.
=============================================================================
"""

import os
import re
import sys
import json
import logging
from typing import Optional, Dict, Any
from urllib.parse import urlparse, urlunparse, parse_qs, unquote

# Configuração de Logs Profissional
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [ProcessadorLinks] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("ProcessadorLinks")

# =============================================================================
# 🔑 SEÇÃO DE CONFIGURAÇÃO & PLACEHOLDERS (INSIRA SUAS CREDENCIAIS AQUI)
# =============================================================================

# 1. Identificadores Oficiais do Usuário
OFFICIAL_MATT_TOOL: str = os.getenv("MELI_MATT_TOOL", "49196513")  # ID Numérico de Afiliado
OFFICIAL_MATT_WORD: str = os.getenv("MELI_MATT_WORD", "sf20250625192813")  # Tag/Nome de Campanha

# 2. Token da API do Mercado Livre ou Provedor de Afiliados (Ex: Bot do Afiliado)
# Coloque seu token na variável de ambiente MELI_AFFILIATE_API_KEY ou diretamente abaixo:
AFFILIATE_API_KEY: str = os.getenv(
    "MELI_AFFILIATE_API_KEY",
    "SEU_TOKEN_DE_API_AQUI"  # <--- [PLACEHOLDER] Substitua pelo seu token de API
)

# 3. Cookie de Sessão do Mercado Livre (Caso use automação direta pelo painel web / LinkBuilder)
# Copie os cookies 'ssid', '_csrf' ou o header Cookie completo logado em mercadolivre.com.br
MELI_SESSION_COOKIE: str = os.getenv(
    "MELI_SESSION_COOKIE",
    "SEU_COOKIE_DE_SESSAO_AQUI"  # <--- [PLACEHOLDER] Opcional: Cookie para LinkBuilder oficial
)

# 4. Cache / Mapeamento Estático de Links Oficiais já Encurtados (Precedência Imediata)
# Mapeamento do código MLB do produto para o seu link meli.la oficial já gerado:
MAPA_LINKS_OFICIAIS: Dict[str, str] = {
    # Fone Havit Gamenote Fuxi H6 Black
    "MLB53228347": "https://meli.la/1njPhaS",
    # Vestido Infantil Skye Patrulha Canina
    "MLB5237833724": "https://meli.la/2dcm9f7",
}

# Headers simulando um navegador moderno real (Anti-Bloqueio)
BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}


# =============================================================================
# [ETAPA 1] EXPANDIR LINK DO CONCORRENTE
# =============================================================================

def expandir_link_concorrente(url_curta: str, timeout: int = 12) -> str:
    """
    Segue os redirecionamentos HTTP do link do concorrente (ex: 'https://meli.la/2rycBD7')
    e descobre a URL longa final de destino.

    Utiliza 'requests' com sessão persistente e allow_redirects=True.
    Possui fallback nativo automático caso 'requests' não esteja instalado.

    Args:
        url_curta: Link encurtado (ex: https://meli.la/xyz)
        timeout: Tempo limite em segundos

    Returns:
        URL longa de destino (com ou sem parâmetros de tracking do concorrente)
    """
    if not url_curta or not isinstance(url_curta, str):
        return ""

    url_curta = url_curta.strip()
    logger.info(f"Etapa 1/3: Expandindo link de concorrente: {url_curta}")

    # Tentativa com a biblioteca requests (preferencial)
    try:
        import requests
        session = requests.Session()
        session.headers.update(BROWSER_HEADERS)

        # Realiza GET com allow_redirects=True
        resp = session.get(url_curta, timeout=timeout, allow_redirects=True)
        url_final = resp.url
        logger.info(f"Redirecionamento seguido com sucesso (Status {resp.status_code}) -> {url_final[:90]}...")
        
        # Tratamento especial 1: se for uma landing page social (ex: /social/), extrai o link do produto dentro do HTML
        if "/social/" in url_final:
            produtos = re.findall(
                r'https?://[a-zA-Z0-9.\-]+mercadolivre\.com\.br/[^\s"\'<>]+(?:/p/MLB|MLB-)[^\s"\'<>]*',
                resp.text
            )
            if produtos:
                url_produto = produtos[0].replace("&amp;", "&")
                logger.info(f"Link do produto real extraído da página social: {url_produto[:90]}...")
                return url_produto

        # Tratamento especial 2: se o ML redirecionar para gateway de verificação com ?go=
        parsed = urlparse(url_final)
        qs = parse_qs(parsed.query)
        if "go" in qs and qs["go"]:
            destino_real = unquote(qs["go"][0])
            logger.info(f"URL de destino extraída do parâmetro 'go': {destino_real[:90]}...")
            return destino_real

        return url_final

    except ImportError:
        # Fallback de alta disponibilidade com urllib (padrão Python)
        logger.warning("'requests' não instalado no ambiente. Utilizando urllib.request nativo.")
        import urllib.request
        req = urllib.request.Request(url_curta, headers=BROWSER_HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                url_final = response.geturl()
                html = response.read().decode('utf-8', errors='ignore')

                if "/social/" in url_final:
                    produtos = re.findall(
                        r'https?://[a-zA-Z0-9.\-]+mercadolivre\.com\.br/[^\s"\'<>]+(?:/p/MLB|MLB-)[^\s"\'<>]*',
                        html
                    )
                    if produtos:
                        return produtos[0].replace("&amp;", "&")

                parsed = urlparse(url_final)
                qs = parse_qs(parsed.query)
                if "go" in qs and qs["go"]:
                    return unquote(qs["go"][0])
                return url_final
        except Exception as e:
            logger.error(f"Erro ao expandir com urllib: {e}")
            return url_curta

    except Exception as err:
        logger.error(f"Falha ao expandir link '{url_curta}': {err}")
        return url_curta


# =============================================================================
# [ETAPA 2] EXTRAIR LINK PURO (HIGIENIZAÇÃO COMPLETA)
# =============================================================================

def extrair_link_puro(url_longa: str) -> str:
    """
    Utiliza urllib.parse para higienizar a URL:
    - Remove 100% de query strings (?matt_tool_id=..., ?tracking_id=..., etc.)
    - Remove fragmentos de âncora (#polycard_client=..., etc.)
    - Preserva exclusivamente: scheme + netloc + path limpo do produto.

    Exemplo:
        Entrada: https://www.mercadolivre.com.br/fone-havit/p/MLB53228347?matt_tool_id=37020034#polycard
        Saída:   https://www.mercadolivre.com.br/fone-havit/p/MLB53228347

    Args:
        url_longa: URL completa vinda do redirecionamento

    Returns:
        URL limpa, pura e canônica do produto no Mercado Livre
    """
    if not url_longa or not isinstance(url_longa, str):
        return ""

    url_longa = url_longa.strip()
    logger.info(f"Etapa 2/3: Higienizando URL: {url_longa[:90]}...")

    try:
        # Se for uma URL intermediária com parâmetro ?go=, descompacta antes de limpar
        if "go=" in url_longa:
            parsed_raw = urlparse(url_longa)
            qs = parse_qs(parsed_raw.query)
            if "go" in qs and qs["go"]:
                url_longa = unquote(qs["go"][0])

        parsed = urlparse(url_longa)

        # Reconstrói a URL zerando estritamente 'query' e 'fragment'
        # urlunparse recebe: (scheme, netloc, path, params, query, fragment)
        url_pura = urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            '',  # params
            '',  # query string (100% LIMPA)
            ''   # fragment / hash (100% LIMPO)
        ))

        # Remove eventuais barras duplas no final
        url_pura = re.sub(r'/+$', '', url_pura)

        logger.info(f"URL pura extraída com sucesso: {url_pura}")
        return url_pura

    except Exception as err:
        logger.error(f"Erro ao higienizar URL: {err}")
        return url_longa.split('?')[0].split('#')[0]


# =============================================================================
# [ETAPA 3] GERAR LINK AFILIADO OFICIAL (MERCADO LIVRE / meli.la)
# =============================================================================

def extrair_codigo_mlb(url: str) -> Optional[str]:
    """Extrai o identificador único do produto (ex: MLB53228347)."""
    match = re.search(r'MLB-?(\d+)', url, re.IGNORECASE)
    if match:
        return f"MLB{match.group(1)}"
    return None


def gerar_link_afiliado_oficial(
    url_limpa: str,
    api_key: Optional[str] = None,
    session_cookie: Optional[str] = None
) -> str:
    """
    Gera o link de afiliado oficial do usuário para o produto a partir da URL limpa.

    Fluxo de Execução:
    1. Verifica se já existe um link oficial cadastrado no mapeamento para este MLB.
    2. Se houver API Key ou Sessão configurada, faz a requisição à API oficial/conversor.
    3. Fallback Seguro: Se a API não responder ou não estiver configurada, aplica a
       parametrização oficial do Mercado Livre (matt_tool + matt_word + forceInApp)
       sem quebrar o link!

    Args:
        url_limpa: URL canônica pura do produto (ex: https://.../p/MLB53228347)
        api_key: Token da API de afiliados (opcional, usa AFFILIATE_API_KEY se omitido)
        session_cookie: Cookie de sessão para automação web (opcional)

    Returns:
        Link oficial encurtado (https://meli.la/...) ou com parâmetros oficiais corretos
    """
    if not url_limpa or not isinstance(url_limpa, str):
        return ""

    url_limpa = url_limpa.strip()
    logger.info(f"Etapa 3/3: Gerando link oficial de afiliado para: {url_limpa}")

    mlb_id = extrair_codigo_mlb(url_limpa)
    key_to_use = api_key or AFFILIATE_API_KEY
    cookie_to_use = session_cookie or MELI_SESSION_COOKIE

    # -------------------------------------------------------------------------
    # 1. Checagem em Cache / Mapeamento Estático
    # -------------------------------------------------------------------------
    if mlb_id and mlb_id in MAPA_LINKS_OFICIAIS:
        link_oficial = MAPA_LINKS_OFICIAIS[mlb_id]
        logger.info(f"🎯 Produto {mlb_id} encontrado no catálogo oficial! Link: {link_oficial}")
        return link_oficial

    # -------------------------------------------------------------------------
    # 2. Chamada à API de Encurtamento / LinkBuilder (quando token configurado)
    # -------------------------------------------------------------------------
    if key_to_use and key_to_use != "SEU_TOKEN_DE_API_AQUI":
        try:
            logger.info("Consumindo API de conversão de afiliados...")
            # Exemplo de payload para API REST de afiliados (ex: Bot do Afiliado / Meli Proxy)
            payload = {
                "urls": [url_limpa],
                "tag": OFFICIAL_MATT_WORD,
                "tool_id": OFFICIAL_MATT_TOOL
            }
            api_endpoint = "https://botdoafiliado.com/api/v1/convert-links"
            
            import requests
            headers = {
                "X-API-Key": key_to_use,
                "Content-Type": "application/json",
                "User-Agent": "BotAfiliadoPro/1.0"
            }
            resp = requests.post(api_endpoint, json=payload, headers=headers, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                # Extrai link encurtado retornado pela API
                short_url = data.get("converted_urls", [None])[0] or data.get("short_url")
                if short_url:
                    logger.info(f"Link oficial gerado pela API com sucesso: {short_url}")
                    return short_url
        except Exception as e:
            logger.warning(f"Aviso na chamada da API de afiliados: {e}. Seguindo para fallback.")

    # -------------------------------------------------------------------------
    # 3. Chamada via Sessão/Cookie Web ao LinkBuilder do Mercado Livre
    # -------------------------------------------------------------------------
    if cookie_to_use and cookie_to_use != "SEU_COOKIE_DE_SESSAO_AQUI":
        try:
            logger.info("Realizando requisição com cookie de sessão ao LinkBuilder Mercado Livre...")
            import requests
            builder_endpoint = "https://www.mercadolivre.com.br/afiliados/api/linkbuilder/generate"
            headers = {
                **BROWSER_HEADERS,
                "Cookie": cookie_to_use,
                "Content-Type": "application/json",
                "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
            }
            resp = requests.post(builder_endpoint, json={"url": url_limpa}, headers=headers, timeout=8)
            if resp.status_code == 200:
                data = resp.json()
                meli_short = data.get("short_url") or data.get("url")
                if meli_short and "meli.la" in meli_short:
                    logger.info(f"Link meli.la gerado via LinkBuilder: {meli_short}")
                    return meli_short
        except Exception as e:
            logger.warning(f"Aviso no LinkBuilder com sessão: {e}")

    # -------------------------------------------------------------------------
    # 4. Fallback Seguro & Atribuição de Comissão (Sem Quebrar o Link)
    # NUNCA insere matt_tool_id=sf... (parâmetro incorreto que gera erro)
    # Utiliza a parametrização oficial reconhecida: matt_tool + matt_word + forceInApp
    # -------------------------------------------------------------------------
    logger.info("Aplicando parametrização oficial de rastreamento Mercado Livre.")
    separador = "&" if "?" in url_limpa else "?"
    url_afiliado = (
        f"{url_limpa}{separador}"
        f"matt_tool={OFFICIAL_MATT_TOOL}&"
        f"matt_word={OFFICIAL_MATT_WORD}&"
        f"forceInApp=true"
    )
    return url_afiliado


# =============================================================================
# PIPELINE COMPLETO (ORQUESTRADOR DAS 3 ETAPAS)
# =============================================================================

def processar_link_completo(url_concorrente: str) -> Dict[str, str]:
    """
    Executa o fluxo completo de 3 etapas:
    1. Expandir link do concorrente
    2. Extrair URL pura e sem rastreio
    3. Gerar link oficial do afiliado (meli.la)

    Returns:
        Dicionário com o resultado de cada etapa
    """
    print("\n" + "="*70)
    print(f"🚀 INICIANDO PROCESSAMENTO: {url_concorrente}")
    print("="*70)

    # Etapa 1
    url_expandida = expandir_link_concorrente(url_concorrente)

    # Etapa 2
    url_pura = extrair_link_puro(url_expandida)

    # Etapa 3
    url_final_afiliado = gerar_link_afiliado_oficial(url_pura)

    resultado = {
        "url_original": url_concorrente,
        "url_expandida": url_expandida,
        "url_limpa": url_pura,
        "url_afiliado_final": url_final_afiliado,
        "codigo_mlb": extrair_codigo_mlb(url_pura) or "N/D"
    }

    print("-" * 70)
    print(f"📥 [1] Link Concorrente : {resultado['url_original']}")
    print(f"🌐 [2] Produto Puro      : {resultado['url_limpa']}")
    print(f"💰 [3] Link Afiliado Meu: {resultado['url_afiliado_final']}")
    print("="*70 + "\n")

    return resultado


# =============================================================================
# TESTES E EXECUÇÃO VIA TERMINAL (CLI)
# =============================================================================

if __name__ == "__main__":
    # Se uma URL foi passada como argumento no terminal:
    # Ex: python3 processador_links.py https://meli.la/2rycBD7
    if len(sys.argv) > 1:
        link_alvo = sys.argv[1]
        processar_link_completo(link_alvo)
    else:
        # Modo de Demonstração / Teste Unitário
        print("\n🧪 EXECUTANDO TESTES DE ARQUITETURA (MODO DEMONSTRAÇÃO):\n")

        casos_teste = [
            "https://meli.la/2rycBD7",  # Fone Havit do concorrente
            "https://meli.la/2dcm9f7",  # Vestido Skye
            "https://produto.mercadolivre.com.br/MLB-53228347-fone-de-ouvido-preto-havit-gamenote-fuxi-h6-black?matt_tool_id=37020034&concorrente=1#polycard"
        ]

        for link in casos_teste:
            processar_link_completo(link)
