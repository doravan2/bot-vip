#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
BOT VIP OFERTAS - MOTOR DE AFILIADOS VIA REQUISIÇÃO DIRETA (REQUESTS)
=============================================================================
Ambiente Base: C:\\ofertas_bot
Lógica: Conversão direta de links do Mercado Livre usando cookies de sessão.
        Zero navegadores físicos ou headless (Playwright/Selenium aposentados).

Módulos do Fluxo Rigoroso:
  1. ler_credenciais_marketplaces():
     Lê 'marketplaces_config.json' (.whatsapp_auth) com Tag e Cookies.
  2. seguir_redirects_meli_la(url_curta):
     Resolve 301/302 de concorrentes via requests.get(allow_redirects=True).
  3. extrair_url_canonica_pura(url_expandida):
     Elimina parâmetros de rastreamento (matt_tool, forceInApp, etc.) e isola MLB.
  4. converter_link_direto_hub(url_longa_limpa, tag_id, cookies_dict):
     POST direto no endpoint do Hub com cookies e headers disfarçados de navegador.
     Retorna 'https://meli.la/xxxxxx' oficial e captura 'Sessão Expirada'.
=============================================================================
"""

import os
import sys
import json
import re
import logging
from typing import Dict, Any, Optional, Tuple

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [MotorRequestsMeli] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("MotorRequestsMeli")

# Importação mandatória da biblioteca requests
try:
    import requests
except ImportError:
    logger.error("A biblioteca 'requests' é mandatória. Instale com: pip install requests")
    sys.exit(1)

# Caminhos padrão do sistema (Compatível com C:\\ofertas_bot e Linux)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, ".whatsapp_auth", "marketplaces_config.json")
LEGACY_COOKIES_PATH = os.path.join(BASE_DIR, ".whatsapp_auth", "meli_cookies.json")

USER_AGENT_OFICIAL = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

HUB_API_ENDPOINT = "https://www.mercadolivre.com.br/afiliados/linkbuilder/api/links"


class SessaoExpiradaError(Exception):
    """Exceção levantada quando os cookies estão inválidos ou desatualizados."""
    pass


# ---------------------------------------------------------------------------
# 1. LER CREDENCIAIS
# ---------------------------------------------------------------------------
def ler_credenciais_marketplaces() -> Tuple[str, Dict[str, str]]:
    """
    Acessa o Cookie de Sessão e a Tag do Afiliado configurados na aba 'Marketplaces'
    salvos no arquivo marketplaces_config.json.
    """
    tag_id = "sf20250625192813"
    cookies_dict: Dict[str, str] = {}

    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                ml = data.get("mercadoLivre", {})
                if ml.get("tagId"):
                    tag_id = ml["tagId"].strip()
                raw_cookie = ml.get("sessionCookie", "")
                if raw_cookie:
                    # Trata se for JSON do Cookie Editor
                    if raw_cookie.strip().startswith("[") or raw_cookie.strip().startswith("{"):
                        parsed_json = json.loads(raw_cookie)
                        items = parsed_json if isinstance(parsed_json, list) else [parsed_json]
                        for c in items:
                            name = c.get("name") or c.get("key")
                            val = c.get("value")
                            if name and val is not None:
                                cookies_dict[name] = str(val)
                    else:
                        # String tradicional "key=val; key2=val2"
                        for pair in raw_cookie.split(";"):
                            if "=" in pair:
                                k, v = pair.strip().split("=", 1)
                                if k:
                                    cookies_dict[k] = v
        except Exception as e:
            logger.warning(f"Aviso ao ler {CONFIG_PATH}: {e}")

    # Fallback se meli_cookies.json existir
    if not cookies_dict and os.path.exists(LEGACY_COOKIES_PATH):
        try:
            with open(LEGACY_COOKIES_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    for c in data:
                        name = c.get("name") or c.get("key")
                        val = c.get("value")
                        if name and val is not None:
                            cookies_dict[name] = str(val)
        except Exception:
            pass

    return tag_id, cookies_dict


# ---------------------------------------------------------------------------
# 2. EXPANSÃO E LIMPEZA (REGEX E REQUESTS)
# ---------------------------------------------------------------------------
def seguir_redirects_meli_la(url_curta: str, timeout: int = 10) -> str:
    """
    Segue redirects de links curtos de concorrentes (meli.la/xxx)
    e extrai a URL final limpa do produto.
    """
    url = url_curta.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"

    logger.info(f"[1/3 Expansão] Resolvendo link encurtado: {url}")
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT_OFICIAL})

    try:
        resp = session.get(url, allow_redirects=True, timeout=timeout)
        final_url = resp.url
        logger.info(f"[1/3 Expansão] Redirecionamento expandido para: {final_url}")

        # Se cair em página social/landing do Mercado Livre, extrai o link MLB do HTML
        if "/social/" in final_url or "mercadolivre.com.br" in final_url:
            matches = re.findall(r'https?://(?:www\.|produto\.)?mercadolivre\.com\.br/[^\s\"\'<>]+(?:/p/MLB\d+|MLB-?\d+)', resp.text)
            if matches:
                for m in matches:
                    candidate = m.split("?")[0].split("#")[0]
                    if "/p/MLB" in candidate:
                        logger.info(f"[1/3 Expansão] URL Canônica de produto extraída do DOM: {candidate}")
                        return candidate

        return final_url
    except Exception as e:
        logger.error(f"[1/3 Expansão] Falha ao seguir redirects: {e}")
        return url


def extrair_url_canonica_pura(url_expandida: str) -> str:
    """
    Remove query strings alienígenas (matt_tool, matt_word, forceInApp, etc.)
    e fragmentos, preservando a rota limpa canônica do produto.
    """
    if not url_expandida:
        return ""

    url_pura = url_expandida.split("?")[0].split("#")[0].strip()
    logger.info(f"[2/3 Limpeza] URL Canônica Pura: {url_pura}")
    return url_pura


# ---------------------------------------------------------------------------
# 3. CONVERSÃO OFICIAL COM HANDSHAKE CSRF (GET -> EXTRAIR TOKEN -> POST)
# ---------------------------------------------------------------------------
def obter_csrf_token_hub(session: requests.Session, timeout: int = 10) -> Optional[str]:
    """
    Passo 1 do Handshake:
    Faz um GET no painel de afiliados (LinkBuilder) para extrair o token CSRF
    do HTML e capturar novos cookies de sessão definidos pelo Mercado Livre.
    """
    url_hub = "https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
    logger.info("[Handshake 1/2] Executando GET no painel de afiliados para capturar CSRF token...")
    try:
        resp = session.get(url_hub, timeout=timeout)
        if resp.status_code in (401, 403) or "login" in resp.url.lower():
            logger.warning("[Handshake 1/2] Sessão expirada ou redirecionada para login.")
            return None

        html = resp.text

        # 1. Regex em meta tags
        meta_match = re.search(
            r'<meta[^>]+(?:name=["\']csrf-token["\'][^>]+content=["\']([^"\']+)["\']|content=["\']([^"\']+)["\'][^>]+name=["\']csrf-token["\'])',
            html,
            re.IGNORECASE
        )
        if meta_match:
            token = meta_match.group(1) or meta_match.group(2)
            logger.info(f"[Handshake 1/2] Token CSRF extraído com sucesso da meta tag: {token[:10]}...")
            return token

        # 2. Regex em inputs hidden
        input_match = re.search(r'<input[^>]+name=["\'](?:_csrf|csrf_token|csrfToken)["\'][^>]+value=["\']([^"\']+)["\']', html)
        if input_match:
            token = input_match.group(1)
            logger.info(f"[Handshake 1/2] Token CSRF extraído de input hidden: {token[:10]}...")
            return token

        # 3. Regex em JSON state
        json_match = re.search(r'["\'](?:csrfToken|csrf|_csrf)["\']\s*:\s*["\']([^"\']+)["\']', html)
        if json_match:
            token = json_match.group(1)
            logger.info(f"[Handshake 1/2] Token CSRF extraído de JSON state: {token[:10]}...")
            return token

        # 4. Cookie _csrf
        csrf_cookie = session.cookies.get("_csrf")
        if csrf_cookie:
            logger.info(f"[Handshake 1/2] Token CSRF obtido do cookie _csrf: {csrf_cookie[:10]}...")
            return csrf_cookie

        logger.info("[Handshake 1/2] Painel carregado. Prosseguindo com cookies da sessão.")
    except Exception as e:
        logger.warning(f"[Handshake 1/2] Aviso ao extrair CSRF token: {e}")

    return None


def converter_link_direto_hub(
    url_longa_limpa: str,
    tag_id: Optional[str] = None,
    cookies_dict: Optional[Dict[str, str]] = None,
    timeout: int = 12
) -> Dict[str, Any]:
    """
    Executa o Handshake de 2 passos:
      Passo 1: GET no painel de afiliados + Extração do CSRF Token
      Passo 2: POST autenticado (Cookie + CSRF + Tag) retornando o link encurtado meli.la
      Fallback: Parametrização oficial de afiliado do usuário (matt_tool/matt_word)
    """
    if not tag_id or cookies_dict is None:
        tag_id_cfg, cookies_cfg = ler_credenciais_marketplaces()
        tag_id = tag_id or tag_id_cfg
        cookies_dict = cookies_dict if cookies_dict is not None else cookies_cfg

    if not cookies_dict:
        msg_aviso = "⚠️ Nenhum cookie de sessão configurado! Atualize os cookies na aba 'Marketplaces' do Dashboard."
        logger.error(f"[3/3 Conversão] {msg_aviso}")
        # Graceful fallback: Mesmo sem cookies, aplica a tag do usuário para nunca enviar link comum!
        sep = "&" if "?" in url_longa_limpa else "?"
        fallback_track = f"{url_longa_limpa}{sep}matt_tool=49196513&matt_word={tag_id}&forceInApp=true"
        return {
            "success": True,
            "monetized_url": fallback_track,
            "canonical_url": url_longa_limpa,
            "tag_used": tag_id,
            "method": "Link Parametrizado Oficial (matt_tool/matt_word)"
        }

    # Inicializa sessão requests com os cookies e headers de navegador
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT_OFICIAL,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    session.cookies.update(cookies_dict)

    # PASSO 1: GET no painel de afiliados e extração do CSRF Token
    csrf_token = obter_csrf_token_hub(session, timeout=timeout)

    # Headers para o POST na API do Hub
    post_headers = {
        "User-Agent": USER_AGENT_OFICIAL,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://www.mercadolivre.com.br",
        "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
        "Content-Type": "application/json",
        "x-requested-with": "XMLHttpRequest"
    }

    if csrf_token:
        post_headers["x-csrf-token"] = csrf_token
        post_headers["csrf-token"] = csrf_token

    payload = {
        "urls": [url_longa_limpa],
        "tag": tag_id,
        "tag_id": tag_id,
    }
    if csrf_token:
        payload["_csrf"] = csrf_token

    session.headers.update(post_headers)

    logger.info(f"[Handshake 2/2] Disparando POST com CSRF + Cookie para tag '{tag_id}'...")

    # Endpoints do Mercado Livre a tentar
    endpoints_to_try = [
        HUB_API_ENDPOINT,
        "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
        "https://www.mercadolivre.com.br/afiliados/api/linkbuilder/generate"
    ]

    for endpoint in endpoints_to_try:
        try:
            req_body = {"url": url_longa_limpa, "tag": tag_id} if "generate" in endpoint else payload
            resp = session.post(endpoint, json=req_body, timeout=timeout)

            if resp.status_code in (401, 403) or "login" in resp.url.lower():
                logger.warning(f"[Handshake 2/2] Endpoint {endpoint} retornou 401/403 (Sessão Expirada).")
                continue

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    short_url = None
                    if isinstance(data, dict):
                        urls_list = data.get("links") or data.get("urls") or data.get("data")
                        if isinstance(urls_list, list) and len(urls_list) > 0:
                            first = urls_list[0]
                            short_url = first.get("short_url") or first.get("url") if isinstance(first, dict) else str(first)
                        elif "short_url" in data:
                            short_url = data["short_url"]
                        elif "url" in data and isinstance(data["url"], str):
                            short_url = data["url"]

                    if short_url and ("meli.la" in short_url or "mercadolivre.com.br" in short_url):
                        logger.info(f"[Handshake 2/2] 🎯 SUCESSO! Link Oficial Encurtado: {short_url}")
                        return {
                            "success": True,
                            "monetized_url": short_url,
                            "canonical_url": url_longa_limpa,
                            "tag_used": tag_id,
                            "csrf_used": bool(csrf_token),
                            "method": "Direct Cookies API com CSRF Handshake (meli.la)"
                        }
                except Exception as json_err:
                    logger.warning(f"Erro ao parsear JSON de {endpoint}: {json_err}")

        except requests.RequestException as req_err:
            logger.warning(f"Tentativa em {endpoint} falhou: {req_err}")

    # Fallback Seguro: Aplica a tag do usuário para nunca enviar um link comum desmonetizado!
    sep = "&" if "?" in url_longa_limpa else "?"
    url_afiliado_rastreado = f"{url_longa_limpa}{sep}matt_tool=49196513&matt_word={tag_id}&forceInApp=true"
    logger.info(f"[Handshake 2/2] Fallback seguro de afiliado com tag: {url_afiliado_rastreado}")
    return {
        "success": True,
        "monetized_url": url_afiliado_rastreado,
        "canonical_url": url_longa_limpa,
        "tag_used": tag_id,
        "csrf_used": bool(csrf_token),
        "method": "Link Oficial Parametrizado (matt_tool/matt_word)"
    }


def processar_link_concorrente_completo(url_concorrente: str) -> Dict[str, Any]:
    """
    Pipeline completo de 3 etapas com a nova arquitetura via Cookies API.
    """
    logger.info(f"=== PROCESSANDO OFERTA VIA COOKIES API: {url_concorrente} ===")
    url_expandida = seguir_redirects_meli_la(url_concorrente)
    url_limpa = extrair_url_canonica_pura(url_expandida)
    resultado = converter_link_direto_hub(url_limpa)
    resultado["original_url"] = url_concorrente
    return resultado


if __name__ == "__main__":
    link_entrada = sys.argv[1] if len(sys.argv) > 1 else "https://meli.la/1pKTwSc"
    try:
        res = processar_link_concorrente_completo(link_entrada)
        print("\n--- RESULTADO DA CONVERSÃO DIRETA ---")
        print(json.dumps(res, indent=2, ensure_ascii=False))
    except SessaoExpiradaError as s_err:
        print(f"\n[ALERTA DE RENOVAÇÃO] {s_err}\n")
    except Exception as exc:
        print(f"\n[ERRO] {exc}\n")
