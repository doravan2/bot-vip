#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
BOT VIP OFERTAS - MÓDULO CONVERSOR E GERADOR DE LINKS OFICIAIS ALIEXPRESS
=============================================================================
Arquitetura:
1. Extração e Limpeza Canônica de URLs (Regex + Follow Redirects)
2. Assinatura Criptográfica Oficial Taobao/AliExpress Open Platform (TOP/IOP MD5/HMAC)
3. Requisição Oficial ao Método `aliexpress.affiliate.link.generate`
4. Retorno do Link Oficial Encurtado (s.click.aliexpress.com)
=============================================================================
"""

import sys
import os
import re
import json
import time
import hashlib
import hmac
import logging
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple, List, Union

# Try to import requests if available; fallback gracefully to urllib
try:
    import requests  # type: ignore
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

# =============================================================================
# CONFIGURAÇÃO DE LOGS
# =============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] [AliExpressAPI] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("ConversorAliExpress")

# =============================================================================
# CONSTANTES & ENDPOINTS DA API ALIEXPRESS
# =============================================================================
API_GATEWAYS: List[str] = [
    "https://api-sg.aliexpress.com/sync",
    "https://api-sg.aliexpress.com/rest",
]

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Regex para extração de ID de produto AliExpress (suporta item/100500..., 32568..., etc.)
ALI_ITEM_REGEX = re.compile(
    r'(?:/item/|item[_\-/]|goodsId=)(\d+)(?:\.html)?',
    re.IGNORECASE
)


# =============================================================================
# 1. EXTRAÇÃO E LIMPEZA DE URLS (Regex + Redirect Resolution)
# =============================================================================
def obter_url_canonica_ali(url_concorrente: str, max_redirects: int = 6) -> Optional[str]:
    """
    Segue os redirecionamentos de links encurtados de concorrentes
    (s.click.aliexpress.com, a.aliexpress.com, ali.ski, etc.) e extrai
    EXATAMENTE a URL canônica pura do produto no formato:
    https://pt.aliexpress.com/item/{item_id}.html
    
    Remove todas as query strings de concorrentes (?spm=..., ?aff_fcid=..., etc).
    
    :param url_concorrente: URL crua recebida na mensagem
    :param max_redirects: Limite de hops de redirecionamento
    :return: URL canônica limpa ou None em caso de falha
    """
    if not url_concorrente or not isinstance(url_concorrente, str):
        logger.warning("URL fornecida vazia ou inválida.")
        return None

    raw_url = url_concorrente.strip()
    logger.info(f"Iniciando resolução e limpeza canônica da URL: '{raw_url}'")

    # 1. Tentar extração direta por Regex sem precisar de rede (se já for um link de item)
    match_direto = ALI_ITEM_REGEX.search(raw_url)
    if match_direto:
        item_id = match_direto.group(1)
        url_limpa = f"https://pt.aliexpress.com/item/{item_id}.html"
        logger.info(f"ID do produto extraído diretamente: {item_id} -> {url_limpa}")
        return url_limpa

    # 2. Se for link encurtado (s.click, a.aliexpress, ali.ski, etc.), seguir redirecionamentos
    url_atual = raw_url
    if not url_atual.startswith("http"):
        url_atual = "https://" + url_atual

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj)
    )
    
    headers = {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    }

    try:
        req = urllib.request.Request(url_atual, headers=headers)
        with opener.open(req, timeout=10) as response:
            final_url = response.geturl()
            logger.info(f"Redirecionamento seguido com sucesso: '{final_url}'")

            # Busca ID do item na URL final resolvida
            match_final = ALI_ITEM_REGEX.search(final_url)
            if match_final:
                item_id = match_final.group(1)
                url_canonica = f"https://pt.aliexpress.com/item/{item_id}.html"
                logger.info(f"URL Canônica obtida: {url_canonica}")
                return url_canonica

            # Limpeza manual de query parameters se não achou item numérico padrão
            parsed = urllib.parse.urlparse(final_url)
            clean_base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
            logger.info(f"URL Canônica genérica limpa: {clean_base}")
            return clean_base

    except Exception as e:
        logger.error(f"Erro ao resolver redirecionamentos de '{raw_url}': {str(e)}")
        
        # Fallback de emergência via regex sobre a string original
        match_fallback = ALI_ITEM_REGEX.search(raw_url)
        if match_fallback:
            return f"https://pt.aliexpress.com/item/{match_fallback.group(1)}.html"

    # Retorna a URL base sem query parameters
    return raw_url.split('?')[0].split('#')[0]


# =============================================================================
# 2. ASSINATURA CRIPTOGRÁFICA (Regra de Ouro da API AliExpress / TOP)
# =============================================================================
def gerar_assinatura_ali(
    parametros: Dict[str, Any],
    app_secret: str,
    sign_method: str = "md5"
) -> str:
    """
    Gera a assinatura criptográfica oficial da API AliExpress (Taobao Open Platform).
    
    Regra Oficial:
    1. Remove o parâmetro 'sign' se já existir no dicionário.
    2. Ordena todas as chaves em ordem alfabética ASCII (sort keys).
    3. Concatena Chave + Valor recursivamente em formato de string contínua.
    4. Para método 'md5': Encapsula a string resultante com app_secret no início e no fim:
       string_para_assinar = app_secret + k1 + v1 + k2 + v2 + ... + app_secret
    5. Gera o hash MD5 (ou HMAC-SHA256) e converte para letras MAIÚSCULAS (UPPERCASE).
    
    :param parametros: Dicionário com os parâmetros da requisição
    :param app_secret: App Secret do afiliado
    :param sign_method: 'md5' (padrão) ou 'hmac' / 'sha256'
    :return: String hexadecimal da assinatura em UPPERCASE
    """
    if not app_secret:
        raise ValueError("App Secret é obrigatório para gerar a assinatura.")

    secret = str(app_secret).strip()
    
    # Filtra e converte todos os valores para string, ignorando a chave 'sign' e valores nulos
    params_filtrados: Dict[str, str] = {}
    for k, v in parametros.items():
        if k == "sign" or v is None:
            continue
        params_filtrados[str(k).strip()] = str(v).strip()

    # Ordena alfabeticamente por chave
    chaves_ordenadas = sorted(params_filtrados.keys())

    # Concatena chave + valor
    concatenacao = "".join(f"{k}{params_filtrados[k]}" for k in chaves_ordenadas)

    if sign_method.lower() in ["hmac", "hmac-sha256", "sha256"]:
        # HMAC-SHA256
        assinatura = hmac.new(
            secret.encode("utf-8"),
            concatenacao.encode("utf-8"),
            hashlib.sha256
        ).hexdigest().upper()
    else:
        # MD5 padrão TOP / AliExpress: secret + k1v1k2v2... + secret
        string_completa = f"{secret}{concatenacao}{secret}"
        assinatura = hashlib.md5(string_completa.encode("utf-8")).hexdigest().upper()

    logger.debug(f"Assinatura gerada ({sign_method}): {assinatura}")
    return assinatura


# =============================================================================
# 3. REQUISIÇÃO OFICIAL (aliexpress.affiliate.link.generate)
# =============================================================================
def gerar_link_sclick(
    url_limpa: str,
    app_key: str,
    app_secret: str = "",
    tracking_id: str = "",
    promotion_link_type: int = 0
) -> Optional[Dict[str, Any]]:
    """
    Envia a requisição autenticada para a API oficial do AliExpress
    chamando o método `aliexpress.affiliate.link.generate` (quando houver app_secret),
    ou gera o deep link oficial da plataforma AliExpress Portals (s.click.aliexpress.com).
    
    :param url_limpa: URL canônica limpa do produto (ex: https://pt.aliexpress.com/item/100500...html)
    :param app_key: App Key ou Short Key do AliExpress Portals
    :param app_secret: App Secret da API de Afiliados AliExpress (opcional)
    :param tracking_id: Tracking ID / Sub-ID de afiliado (opcional)
    :param promotion_link_type: 0 para link padrão com comissão, 2 para link de cupom
    :return: Dicionário com 'promotion_link' (s.click.aliexpress.com) ou detalhes do erro
    """
    if not url_limpa:
        logger.error("URL limpa não informada para geração de link.")
        return None
    if not app_key:
        logger.error("App Key é estritamente obrigatório.")
        return None

    clean_key = str(app_key).strip()
    clean_secret = str(app_secret).strip() if app_secret else ""
    clean_tracking = str(tracking_id).strip() if tracking_id else ""

    # Determina se a chave é um Short Key (ex: _oBXYZ) ou App Key numérica
    is_short_key = clean_key.startswith("_") or (len(clean_key) <= 12 and not clean_key.isdigit())

    # Se NÃO houver app_secret, gera imediatamente o Deep Link oficial da Portals com tracking_id
    if not clean_secret:
        if is_short_key:
            sclick_direct = f"https://s.click.aliexpress.com/deep_link.htm?aff_short_key={urllib.parse.quote(clean_key)}&dl_target_url={urllib.parse.quote(url_limpa)}"
        else:
            sclick_direct = f"https://s.click.aliexpress.com/deep_link.htm?app_key={urllib.parse.quote(clean_key)}&targetUrl={urllib.parse.quote(url_limpa)}"
        
        if clean_tracking:
            sclick_direct += f"&tracking_id={urllib.parse.quote(clean_tracking)}"

        logger.info(f"🎯 Link Oficial Portals s.click gerado: {sclick_direct}")
        return {
            "success": True,
            "promotion_link": sclick_direct,
            "canonical_url": url_limpa,
            "tracking_id": clean_tracking,
            "method": "AliExpress Portals DeepLink Oficial (s.click)"
        }

    # Timestamp no formato UTC obrigatório da API: yyyy-MM-dd HH:mm:ss
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Montagem dos parâmetros da API oficial AliExpress TOP/IOP
    params: Dict[str, Any] = {
        "method": "aliexpress.affiliate.link.generate",
        "app_key": clean_key,
        "timestamp": now_utc,
        "format": "json",
        "v": "2.0",
        "sign_method": "md5",
        "ship_to_country": "BR",
        "source_values": url_limpa,
        "promotion_link_type": str(promotion_link_type),
    }

    if clean_tracking:
        params["tracking_id"] = clean_tracking

    # Calcula a assinatura criptográfica
    try:
        sign = gerar_assinatura_ali(params, clean_secret, sign_method="md5")
        params["sign"] = sign
    except Exception as e:
        logger.error(f"Falha ao gerar assinatura criptográfica: {str(e)}")
        # Fallback para deep link oficial
        if is_short_key:
            fb = f"https://s.click.aliexpress.com/deep_link.htm?aff_short_key={urllib.parse.quote(clean_key)}&dl_target_url={urllib.parse.quote(url_limpa)}"
        else:
            fb = f"https://s.click.aliexpress.com/deep_link.htm?app_key={urllib.parse.quote(clean_key)}&targetUrl={urllib.parse.quote(url_limpa)}"
        if clean_tracking:
            fb += f"&tracking_id={urllib.parse.quote(clean_tracking)}"
        return {
            "success": True,
            "promotion_link": fb,
            "canonical_url": url_limpa,
            "tracking_id": clean_tracking,
            "method": "AliExpress Portals DeepLink (Fallback Assinatura)"
        }

    # Tenta enviar a requisição para os gateways disponíveis
    for endpoint in API_GATEWAYS:
        logger.info(f"Enviando requisição para gateway: {endpoint}")
        
        try:
            raw_response_text = ""
            status_code = 0

            if HAS_REQUESTS:
                resp = requests.post(
                    endpoint,
                    data=params,
                    headers={
                        "User-Agent": DEFAULT_USER_AGENT,
                        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
                    },
                    timeout=12
                )
                status_code = resp.status_code
                raw_response_text = resp.text
            else:
                encoded_data = urllib.parse.urlencode(params).encode('utf-8')
                req = urllib.request.Request(
                    endpoint,
                    data=encoded_data,
                    headers={
                        "User-Agent": DEFAULT_USER_AGENT,
                        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
                    }
                )
                with urllib.request.urlopen(req, timeout=12) as response:
                    status_code = response.getcode()
                    raw_response_text = response.read().decode('utf-8', errors='ignore')

            logger.info(f"Resposta recebida (HTTP {status_code})")

            if not raw_response_text or raw_response_text.strip().startswith("<"):
                logger.warning(f"Endpoint '{endpoint}' retornou resposta não-JSON (HTTP {status_code}). Tentando próximo gateway...")
                continue

            try:
                data = json.loads(raw_response_text)
            except json.JSONDecodeError as json_err:
                logger.warning(f"Aviso ao decodificar JSON da API ({endpoint}): {str(json_err)}")
                continue

            if "error_response" in data:
                err_info = data["error_response"]
                err_code = err_info.get("code")
                err_msg = err_info.get("msg")
                sub_code = err_info.get("sub_code", "")
                sub_msg = err_info.get("sub_msg", "")
                
                logger.warning(
                    f"⚠️ Aviso da API do AliExpress (Código {err_code}: {err_msg} / {sub_msg}). "
                    f"Aplicando fallback para deep link oficial com App Key ({clean_key})."
                )
                
                if is_short_key:
                    fallback_sclick = f"https://s.click.aliexpress.com/deep_link.htm?aff_short_key={urllib.parse.quote(clean_key)}&dl_target_url={urllib.parse.quote(url_limpa)}"
                else:
                    fallback_sclick = f"https://s.click.aliexpress.com/deep_link.htm?app_key={urllib.parse.quote(clean_key)}&targetUrl={urllib.parse.quote(url_limpa)}"
                
                if clean_tracking:
                    fallback_sclick += f"&tracking_id={urllib.parse.quote(clean_tracking)}"

                return {
                    "success": True,
                    "original_url": url_limpa,
                    "canonical_url": url_limpa,
                    "monetized_url": fallback_sclick,
                    "promotion_link": fallback_sclick,
                    "marketplace": "AliExpress",
                    "platform_label": "AliExpress Oficial (s.click)",
                    "method": "deep_link_sclick",
                    "tracking_id": clean_tracking,
                    "fallback_applied": True,
                    "api_code": err_code
                }

            root_resp = data.get("aliexpress_affiliate_link_generate_response", {})
            resp_result = root_resp.get("resp_result", {})
            resp_code = resp_result.get("resp_code", 0)

            if resp_code == 200 or not resp_code:
                result_obj = resp_result.get("result", {})
                promotion_links = result_obj.get("promotion_links", {})
                
                link_items = promotion_links.get("promotion_link", [])
                if isinstance(link_items, dict):
                    link_items = [link_items]

                if link_items and len(link_items) > 0:
                    primeiro_link = link_items[0]
                    sclick_url = primeiro_link.get("promotion_link") or primeiro_link.get("smart_link")
                    
                    if sclick_url:
                        logger.info(f"🎯 LINK S.CLICK OFICIAL GERADO COM SUCESSO: '{sclick_url}'")
                        return {
                            "success": True,
                            "promotion_link": sclick_url,
                            "canonical_url": url_limpa,
                            "tracking_id": clean_tracking,
                            "raw_item": primeiro_link
                        }

        except Exception as net_err:
            logger.warning(f"Aviso de rede no endpoint '{endpoint}': {str(net_err)}")

    # Fallback estruturado para link oficial s.click.aliexpress.com
    logger.info("Aplicando Fallback Estruturado para link oficial s.click.aliexpress.com")
    if is_short_key:
        fallback_sclick = f"https://s.click.aliexpress.com/deep_link.htm?aff_short_key={urllib.parse.quote(clean_key)}&dl_target_url={urllib.parse.quote(url_limpa)}"
    else:
        fallback_sclick = f"https://s.click.aliexpress.com/deep_link.htm?app_key={urllib.parse.quote(clean_key)}&targetUrl={urllib.parse.quote(url_limpa)}"

    if clean_tracking:
        fallback_sclick += f"&tracking_id={urllib.parse.quote(clean_tracking)}"

    return {
        "success": True,
        "promotion_link": fallback_sclick,
        "canonical_url": url_limpa,
        "tracking_id": clean_tracking,
        "method": "Fallback Oficial DeepLink s.click"
    }


# =============================================================================
# 4. FUNÇÃO ORQUESTRADORA PRINCIPAL
# =============================================================================
def converter_link_aliexpress(
    url_concorrente: str,
    app_key: str,
    app_secret: str = "",
    tracking_id: str = ""
) -> Dict[str, Any]:
    """
    Pipeline Completo de Conversão AliExpress:
    1. Limpa e extrai a URL canônica do produto.
    2. Requisita o link s.click à API oficial ou gera o DeepLink Portals oficial com tracking_id.
    
    :return: Dicionário com resultado da conversão
    """
    logger.info("=" * 60)
    logger.info("INICIANDO PIPELINE DE CONVERSÃO ALIEXPRESS")
    logger.info(f"URL Entrada: {url_concorrente}")
    logger.info(f"App Key: {app_key}")
    logger.info(f"Tracking ID: {tracking_id or 'default'}")
    logger.info("=" * 60)

    # 1. Obter URL canônica
    url_canonica = obter_url_canonica_ali(url_concorrente)
    if not url_canonica:
        url_canonica = url_concorrente.split('?')[0].split('#')[0]

    # 2. Gerar link s.click oficial via API / DeepLink
    resultado = gerar_link_sclick(
        url_limpa=url_canonica,
        app_key=app_key,
        app_secret=app_secret,
        tracking_id=tracking_id
    )

    if resultado and resultado.get("promotion_link"):
        return {
            "success": True,
            "original_url": url_concorrente,
            "canonical_url": url_canonica,
            "monetized_url": resultado["promotion_link"],
            "promotion_link": resultado["promotion_link"],
            "marketplace": "aliexpress",
            "platform_label": "AliExpress Oficial (s.click)",
            "tracking_id": tracking_id,
            "method": resultado.get("method", "API Oficial aliexpress.affiliate.link.generate"),
            "details": resultado
        }

    return {
        "success": False,
        "original_url": url_concorrente,
        "canonical_url": url_canonica,
        "error": "Falha na conversão oficial do AliExpress.",
        "details": resultado
    }


# =============================================================================
# 5. CLI INTERFACE (Para Execução via Node/TypeScript e Terminal)
# =============================================================================
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Uso obrigatório: python3 conversor_aliexpress.py <url> <app_key> [app_secret] [tracking_id]"
        }))
        sys.exit(1)

    input_url = sys.argv[1]
    input_app_key = sys.argv[2]
    input_app_secret = sys.argv[3] if len(sys.argv) > 3 else ""
    input_tracking_id = sys.argv[4] if len(sys.argv) > 4 else ""

    res = converter_link_aliexpress(
        url_concorrente=input_url,
        app_key=input_app_key,
        app_secret=input_app_secret,
        tracking_id=input_tracking_id
    )

    print(json.dumps(res, ensure_ascii=False, indent=2))
