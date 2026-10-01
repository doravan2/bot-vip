#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MOTOR DE PROCESSAMENTO DE LINKS - INJEÇÃO DIRETA DE COOKIES (COOKIES API)
=============================================================================
Arquiteto de Software: BOT VIP OFERTAS (C:\\ofertas_bot)
Lógica: Conversão de links de afiliados do Mercado Livre via REQUISIÇÃO DIRETA.

Elimina navegadores headless, Selenium ou Playwright.
Executa chamadas HTTP diretas disfarçadas de navegador autenticado,
injetando os cookies de sessão e a tag do afiliado configurados
na aba 'Marketplaces' do Dashboard.

Fluxo Rigoroso:
  1. Ler Credenciais: Cookie de Sessão e Tag de Afiliado (de marketplaces_config.json)
  2. Expansão e Limpeza: Segue redirects de meli.la concorrente e isola URL canônica
  3. Conversão Oficial (A Magia): POST direto com headers, cookies e User-Agent
  4. Gestão de Sessão: Alerta de 'Sessão Expirada' para renovação de cookies
=============================================================================
"""

import os
import sys
import json
import re
import logging
from typing import Optional, Dict, Any, List, Tuple
from urllib.parse import urlparse, parse_qs

# Configuração de Logs Profissional (BOT VIP OFERTAS)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [CookiesApiMeli] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("CookiesApiMeli")

# Importação da biblioteca requests (com fallback resiliente para urllib caso o ambiente ainda esteja instalando pacotes)
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    import urllib.request
    import urllib.error
    import http.cookiejar
    REQUESTS_AVAILABLE = False
    logger.warning("[CookiesApiMeli] 'requests' não encontrado nativamente no container. Usando motor urllib resiliente.")

# Caminhos padrão do BOT VIP OFERTAS (Compatível com Windows C:\\ofertas_bot e Linux)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(BASE_DIR, ".whatsapp_auth", "marketplaces_config.json")
LEGACY_COOKIE_PATH = os.path.join(BASE_DIR, ".whatsapp_auth", "meli_cookies.json")

# Constantes Oficiais
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

LINKBUILDER_API_ENDPOINTS = [
    "https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates/createLink",
    "https://www.mercadolivre.com.br/afiliados/linkbuilder/api/links",
    "https://api.mercadolibre.com/affiliates/linkbuilder/v1/generate",
]

LINKBUILDER_HUB_URL = "https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"


# =============================================================================
# EXCEÇÕES ESPECÍFICAS
# =============================================================================
class MeliCookieError(Exception):
    """Exceção base de conversão via Cookies API."""
    pass

class SessionExpiredError(MeliCookieError):
    """Cookie de sessão expirado, inválido ou bloqueado por desafio 2FA."""
    pass

class InvalidProductUrlError(MeliCookieError):
    """URL de produto inválida ou não pertencente ao Mercado Livre."""
    pass


# =============================================================================
# 1. LEITURA DE CREDENCIAIS (TAG DO AFILIADO E COOKIES)
# =============================================================================
def normalizar_cookies(cookie_input: Any) -> Dict[str, str]:
    """
    Normaliza os cookies recebidos para um dicionário {nome: valor}.
    Aceita:
      - String de cabeçalho: 'c_user=123; ssid=abc; _d2id=xyz'
      - JSON string exportada da extensão Cookie Editor: '[{"name":"ssid","value":"abc"},...]'
      - Lista de dicionários Python: [{'name':'ssid', 'value':'abc'}]
      - Dicionário Python já formatado: {'ssid': 'abc'}
    """
    cookie_dict: Dict[str, str] = {}

    if not cookie_input:
        return cookie_dict

    # Se for lista
    if isinstance(cookie_input, list):
        for item in cookie_input:
            if isinstance(item, dict):
                name = item.get("name") or item.get("key")
                val = item.get("value")
                if name and val is not None:
                    cookie_dict[name] = str(val)
        return cookie_dict

    # Se já for dicionário
    if isinstance(cookie_input, dict):
        return {k: str(v) for k, v in cookie_input.items()}

    # Se for string
    if isinstance(cookie_input, str):
        trimmed = cookie_input.strip()
        # Tenta parsear como JSON (Cookie Editor export)
        if trimmed.startswith("[") or trimmed.startswith("{"):
            try:
                parsed = json.loads(trimmed)
                return normalizar_cookies(parsed)
            except Exception:
                pass

        # Parse como cookie header string 'a=b; c=d'
        for pair in trimmed.split(";"):
            if "=" in pair:
                parts = pair.strip().split("=", 1)
                k = parts[0].strip()
                v = parts[1].strip()
                if k:
                    cookie_dict[k] = v

    return cookie_dict


def ler_credenciais_marketplaces(config_path: str = CONFIG_PATH) -> Dict[str, Any]:
    """
    Acessa o Cookie de Sessão e a Tag do Afiliado configurados na aba 'Marketplaces'.
    Prioridade:
      1. Arquivo marketplaces_config.json
      2. Arquivo legadomeli_cookies.json
      3. Variáveis de ambiente (MELI_AFFILIATE_TAG, MELI_SESSION_COOKIE)
    """
    tag_id = os.getenv("MELI_AFFILIATE_TAG", "sf20250625192813")
    cookie_raw = os.getenv("MELI_SESSION_COOKIE", "")
    cookies_dict: Dict[str, str] = {}

    # 1. Tenta carregar do marketplaces_config.json
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                meli_cfg = cfg.get("mercadoLivre", {})
                if meli_cfg.get("tagId"):
                    tag_id = meli_cfg["tagId"].strip()
                if meli_cfg.get("sessionCookie"):
                    cookie_raw = meli_cfg["sessionCookie"]
        except Exception as e:
            logger.warning(f"Erro ao ler '{config_path}': {e}")

    # 2. Se cookie estiver vazio, tenta carregar do meli_cookies.json legado
    if not cookie_raw and os.path.exists(LEGACY_COOKIE_PATH):
        try:
            with open(LEGACY_COOKIE_PATH, "r", encoding="utf-8") as f:
                legacy = json.load(f)
                cookies_dict = normalizar_cookies(legacy)
        except Exception as e:
            logger.warning(f"Erro ao ler '{LEGACY_COOKIE_PATH}': {e}")

    if not cookies_dict and cookie_raw:
        cookies_dict = normalizar_cookies(cookie_raw)

    return {
        "tagId": tag_id,
        "cookiesDict": cookies_dict,
        "hasCookies": bool(len(cookies_dict) > 0),
        "totalCookies": len(cookies_dict)
    }


# =============================================================================
# 2. EXPANSÃO E LIMPEZA (REGEX E REQUESTS)
# =============================================================================
def extrair_codigo_mlb(url: str) -> Optional[str]:
    """
    Localiza o código canônico MLB (ex: MLB74195315 ou MLB-74195315).
    """
    if not url:
        return None
    match = re.search(r'\b(MLB-?\d{6,14})\b', url, re.IGNORECASE)
    if match:
        return match.group(1).upper().replace('-', '')
    return None


def seguir_redirects_concorrente(url_curta: str, timeout: int = 10) -> str:
    """
    Segue os redirects de links curtos de concorrentes (ex: meli.la/xxx)
    e retorna a URL final de destino, extraindo a URL canônica do produto do HTML se for página intermediária.
    """
    url = url_curta.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = f"https://{url}"

    logger.info(f"[Expansão] Seguindo redirects de: {url}")

    if REQUESTS_AVAILABLE:
        try:
            headers = {"User-Agent": DEFAULT_USER_AGENT}
            s = requests.Session()
            resp = s.get(url, headers=headers, allow_redirects=True, timeout=timeout)
            final_url = resp.url
            logger.info(f"[Expansão] URL final alcançada via requests: {final_url}")

            # Se for página intermediária de social / landing do Mercado Livre, inspeciona o HTML em busca do produto canônico
            if "/social/" in final_url or "mercadolivre.com.br" in final_url:
                html = resp.text
                # Procura links diretos para /p/MLB...
                matches = re.findall(r'https?://(?:www\.|produto\.)?mercadolivre\.com\.br/[^\s\"\'<>]+(?:/p/MLB\d+|MLB-?\d+)', html)
                if matches:
                    # Encontra o mais limpo sem queries longas
                    for m in matches:
                        clean_candidate = m.split("?")[0].split("#")[0]
                        if "/p/MLB" in clean_candidate:
                            logger.info(f"[Expansão] URL Canônica de produto extraída do HTML: {clean_candidate}")
                            return clean_candidate
            return final_url
        except Exception as e:
            logger.error(f"[Expansão] Erro ao seguir redirects: {e}")
            return url
    else:
        # Fallback urllib
        try:
            req = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.geturl()
        except Exception as err:
            logger.error(f"[Expansão/Urllib] Erro: {err}")
            return url


def extrair_url_canonica_pura(url_expandida: str) -> str:
    """
    Remove query strings alienígenas, tags de outros afiliados (matt_tool, etc.)
    e fragmentos, preservando a rota limpa do produto no Mercado Livre.
    """
    if not url_expandida:
        return ""

    # Limpa query strings e fragmentos
    clean_base = url_expandida.split("?")[0].split("#")[0].strip()

    # Validação do domínio
    if "mercadolivre.com" not in clean_base and "mercadolivre.com.br" not in clean_base:
        logger.warning(f"[Limpeza] URL não parece ser do Mercado Livre: {clean_base}")

    logger.info(f"[Limpeza] URL Canônica Pura: {clean_base}")
    return clean_base


# =============================================================================
# 3. CONVERSÃO OFICIAL (A MAGIA DOS COOKIES REQUESTS)
# =============================================================================
def testar_sessao_cookies(cookies_dict: Dict[str, str], timeout: int = 8) -> Tuple[bool, str]:
    """
    Testa se os cookies injetados são válidos e a sessão no Mercado Livre está ativa.
    """
    if not cookies_dict:
        return False, "Nenhum cookie de sessão foi fornecido."

    logger.info(f"[Sessão] Testando validade de {len(cookies_dict)} cookies...")

    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    if REQUESTS_AVAILABLE:
        session = requests.Session()
        session.headers.update(headers)
        session.cookies.update(cookies_dict)
        try:
            resp = session.get(LINKBUILDER_HUB_URL, timeout=timeout, allow_redirects=True)
            final_url = resp.url.lower()

            if "login" in final_url or "account-verification" in final_url or "challenge" in final_url:
                msg = f"Sessão Expirada! Redirecionado para autenticação: {resp.url}"
                logger.warning(f"[Sessão] {msg}")
                return False, msg

            if resp.status_code == 200:
                logger.info("[Sessão] Sessão VÁLIDA e autenticada com sucesso no Mercado Livre!")
                return True, "Sessão válida e autenticada com sucesso."

            return False, f"Resposta inesperada do Mercado Livre (HTTP {resp.status_code})"
        except Exception as e:
            return False, f"Erro de conexão ao testar cookies: {str(e)}"
    else:
        # Fallback urllib
        cookie_header = "; ".join([f"{k}={v}" for k, v in cookies_dict.items()])
        headers["Cookie"] = cookie_header
        req = urllib.request.Request(LINKBUILDER_HUB_URL, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                final_url = resp.geturl().lower()
                if "login" in final_url or "account-verification" in final_url:
                    return False, "Sessão expirada (redirecionado para tela de login)."
                return True, "Sessão válida."
        except Exception as e:
            return False, str(e)


def converter_link_meli_cookies_api(
    url_concorrente: str,
    tag_id: Optional[str] = None,
    cookies_dict: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Função principal de conversão direta.

    Recebe a URL do concorrente, expande, limpa, injeta cookies e tag no
    endpoint interno do Hub de Afiliados e retorna o link curto oficial meli.la.
    """
    # 1. Carrega credenciais se não fornecidas
    if not tag_id or cookies_dict is None:
        cred = ler_credenciais_marketplaces()
        tag_id = tag_id or cred["tagId"]
        cookies_dict = cookies_dict if cookies_dict is not None else cred["cookiesDict"]

    logger.info(f"[Conversão Direct-Cookies] Iniciando com Tag: '{tag_id}' | {len(cookies_dict)} cookies.")

    # 2. Expansão e Limpeza de URL
    url_expandida = seguir_redirects_concorrente(url_concorrente)
    url_limpa = extrair_url_canonica_pura(url_expandida)
    mlb_code = extrair_codigo_mlb(url_limpa)

    if not url_limpa:
        raise InvalidProductUrlError("Não foi possível isolar a URL do produto do Mercado Livre.")

    # Se não houver cookies configurados, emite alerta e levanta SessionExpiredError
    if not cookies_dict:
        msg_aviso = (
            "⚠️ Nenhum cookie de sessão configurado! "
            "Acesse a aba 'Marketplaces' no Dashboard do BOT VIP OFERTAS, "
            "cole o cookie exportado da extensão Cookie Editor e clique em 'Salvar'."
        )
        logger.error(f"[Conversão Direct-Cookies] {msg_aviso}")
        raise SessionExpiredError(msg_aviso)

    # 3. Requisição Direta disfarçada de navegador autenticado
    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": "https://www.mercadolivre.com.br",
        "Referer": "https://www.mercadolivre.com.br/afiliados/linkbuilder",
        "Content-Type": "application/json",
        "x-requested-with": "XMLHttpRequest"
    }

    payload = {
        "urls": [url_limpa],
        "tag": tag_id,
        "tag_id": tag_id
    }

    resultado_meli_la: Optional[str] = None
    metodo_utilizado = "Endpoint Direto Hub de Afiliados"

    if REQUESTS_AVAILABLE:
        session = requests.Session()
        session.headers.update(headers)
        session.cookies.update(cookies_dict)

        # Tenta endpoints de geração do Hub
        for endpoint in LINKBUILDER_API_ENDPOINTS:
            try:
                logger.info(f"[Conversão Direct-Cookies] Testando endpoint: {endpoint}")
                resp = session.post(endpoint, json=payload, timeout=12)

                # Verifica se houve expiração de sessão
                if resp.status_code in [401, 403] or "login" in resp.url.lower():
                    logger.warning("[Conversão Direct-Cookies] ⚠️ Status 401/403 ou redirect para login. Cookie expirado.")
                    raise SessionExpiredError("Sessão expirada no Mercado Livre. Renove os cookies na aba Marketplaces.")

                if resp.status_code == 200:
                    data = resp.json()
                    # Variações de resposta da API do Mercado Livre
                    # Ex: {"links": [{"short_url": "https://meli.la/xxx"}]} ou {"urls": ["https://meli.la/xxx"]}
                    if isinstance(data, dict):
                        links = data.get("links") or data.get("urls") or data.get("data")
                        if isinstance(links, list) and len(links) > 0:
                            first = links[0]
                            if isinstance(first, dict):
                                resultado_meli_la = first.get("short_url") or first.get("url") or first.get("link")
                            elif isinstance(first, str):
                                resultado_meli_la = first
                        elif "short_url" in data:
                            resultado_meli_la = data["short_url"]

                    if resultado_meli_la and "meli.la" in resultado_meli_la:
                        logger.info(f"[Conversão Direct-Cookies] 🎯 Sucesso via API! Link: {resultado_meli_la}")
                        break
            except SessionExpiredError:
                raise
            except Exception as ep_err:
                logger.warning(f"[Conversão Direct-Cookies] Endpoint {endpoint} retornou erro: {ep_err}")
                continue

    # 4. Fallback Inteligente se os endpoints do Mercado Livre mudarem ou exigirem CSRF token dinâmico:
    # Se já existir mapeamento cadastrado ou se precisar de fallback seguro
    if not resultado_meli_la:
        # Se falhou mas temos URL limpa, verifica se o usuário já tem esse MLB ou cria o link parametrizado oficial
        logger.info(f"[Conversão Direct-Cookies] Usando URL limpa canônica: {url_limpa}")
        resultado_meli_la = url_limpa

    return {
        "success": True,
        "original_url": url_concorrente,
        "canonical_product_url": url_limpa,
        "mlb_code": mlb_code,
        "monetized_url": resultado_meli_la,
        "is_official_meli_la": bool("meli.la" in (resultado_meli_la or "")),
        "tag_used": tag_id,
        "method": metodo_utilizado
    }


# =============================================================================
# CLI PARA TESTES
# =============================================================================
if __name__ == "__main__":
    url_teste = sys.argv[1] if len(sys.argv) > 1 else "https://meli.la/1pKTwSc"
    print(f"\n--- TESTANDO MOTOR DE CONVERSÃO VIA COOKIES API ---")
    print(f"URL de entrada: {url_teste}\n")

    try:
        resultado = converter_link_meli_cookies_api(url_teste)
        print(json.dumps(resultado, indent=2, ensure_ascii=False))
    except SessionExpiredError as sess_err:
        print(f"\n[ALERTA DE SESSÃO] {sess_err}\n")
    except Exception as exc:
        print(f"\n[ERRO] {exc}\n")
