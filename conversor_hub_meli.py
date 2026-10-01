#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
AUTOMAÇÃO HEADLESS DO HUB DE AFILIADOS - MERCADO LIVRE (PLAYWRIGHT)
=============================================================================
Módulo de automação invisível para conversão de URLs de produtos Mercado Livre
diretamente no Hub Oficial de Afiliados (LinkBuilder), eliminando a intervenção
humana (copiar, abrir navegador, gerar e colar).

Fluxo do Robô:
  1. Carrega cookies de sessão persistentes (.whatsapp_auth/meli_cookies.json)
  2. Inicializa Playwright em modo headless com perfil anti-detecção
  3. Navega até https://www.mercadolivre.com.br/afiliados/linkbuilder#hub
  4. Valida se a sessão continua ativa (sem tela de login ou verificação)
  5. Injeta a URL longa limpa no campo de entrada
  6. Seleciona a tag/etiqueta oficial do afiliado
  7. Clica em 'Gerar link' e aguarda a renderização no DOM
  8. Extrai o link encurtado oficial (https://meli.la/xxxxxx)
  9. Retorna o link para o pipeline de envio do WhatsApp
=============================================================================
"""

import os
import sys
import json
import asyncio
import logging
import re
from typing import Optional, Dict, Any, List
from pathlib import Path

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [MeliHubAutomator] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("MeliHubAutomator")

# Constantes e URLs Oficiais
HUB_LINKBUILDER_URL = "https://www.mercadolivre.com.br/afiliados/linkbuilder#hub"
DEFAULT_COOKIE_PATH = os.path.join(os.getcwd(), ".whatsapp_auth", "meli_cookies.json")
DEFAULT_TIMEOUT_MS = 30000

# Exceções Personalizadas para Gestão Robusta de Falhas
class MeliAutomationError(Exception):
    """Exceção base para automação do Mercado Livre."""
    pass

class SessionExpiredError(MeliAutomationError):
    """Sessão expirada ou redirecionamento para login/verificação de conta."""
    pass

class LinkGenerationTimeoutError(MeliAutomationError):
    """Tempo limite excedido aguardando o link meli.la ser gerado."""
    pass

class ElementNotFoundError(MeliAutomationError):
    """Elemento do DOM do LinkBuilder não encontrado."""
    pass


def carregar_cookies_sessao(caminho_cookies: str = DEFAULT_COOKIE_PATH) -> List[Dict[str, Any]]:
    """
    Carrega cookies salvos previamente em formato JSON.
    Aceita lista de dicionários padrão do Playwright/Puppeteer ou export do EditThisCookie.
    """
    p = Path(caminho_cookies)
    if not p.exists():
        logger.warning(f"Arquivo de cookies não encontrado em '{caminho_cookies}'. Tentando variáveis de ambiente...")
        env_cookie = os.getenv("MELI_SESSION_COOKIE")
        if env_cookie:
            try:
                # Tenta parsear JSON se for string JSON
                return json.loads(env_cookie)
            except Exception:
                # Se for cookie header string "key=val; key2=val2"
                cookies = []
                for pair in env_cookie.split(";"):
                    if "=" in pair:
                        k, v = pair.strip().split("=", 1)
                        cookies.append({
                            "name": k,
                            "value": v,
                            "domain": ".mercadolivre.com.br",
                            "path": "/"
                        })
                return cookies
        return []

    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                # Normaliza cookies para padrão Playwright
                norm_cookies = []
                for c in data:
                    cookie_dict = {
                        "name": c.get("name") or c.get("key"),
                        "value": c.get("value"),
                        "domain": c.get("domain", ".mercadolivre.com.br"),
                        "path": c.get("path", "/"),
                    }
                    if "secure" in c:
                        cookie_dict["secure"] = bool(c["secure"])
                    if "httpOnly" in c:
                        cookie_dict["httpOnly"] = bool(c["httpOnly"])
                    if "sameSite" in c and c["sameSite"] in ["Strict", "Lax", "None"]:
                        cookie_dict["sameSite"] = c["sameSite"]
                    if cookie_dict["name"] and cookie_dict["value"] is not None:
                        norm_cookies.append(cookie_dict)
                logger.info(f"Carregados {len(norm_cookies)} cookies de sessão de '{caminho_cookies}'.")
                return norm_cookies
    except Exception as e:
        logger.error(f"Erro ao ler arquivo de cookies: {e}")
    return []


def salvar_cookies_sessao(cookies: List[Dict[str, Any]], caminho_cookies: str = DEFAULT_COOKIE_PATH) -> bool:
    """
    Salva cookies atualizados no disco para persistência entre execuções.
    """
    try:
        p = Path(caminho_cookies)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=2, ensure_ascii=False)
        logger.info(f"Sessão persistida com sucesso em '{caminho_cookies}' ({len(cookies)} cookies).")
        return True
    except Exception as e:
        logger.error(f"Falha ao salvar cookies de sessão: {e}")
        return False


async def gerar_link_meli_hub(
    url_longa_limpa: str,
    cookies_path: str = DEFAULT_COOKIE_PATH,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    headless: bool = True,
    tag_id: Optional[str] = None
) -> str:
    """
    Automação assíncrona com Playwright que interage com o LinkBuilder do Mercado Livre.

    Args:
        url_longa_limpa: URL canônica do produto (ex: https://www.mercadolivre.com.br/item/p/MLB...)
        cookies_path: Caminho para o arquivo JSON contendo os cookies de login do Mercado Livre
        timeout_ms: Timeout em milissegundos para operações de navegação e seletores
        headless: Executar navegador em modo oculto (True para produção)
        tag_id: ID da tag/etiqueta de afiliado opcional para seleção no painel

    Returns:
        Link oficial encurtado (ex: https://meli.la/1njPhaS)

    Raises:
        SessionExpiredError: Quando a sessão não é válida ou requer login/2FA
        LinkGenerationTimeoutError: Quando o painel demora mais que o limite para gerar
        ElementNotFoundError: Quando a estrutura do DOM do LinkBuilder mudar
    """
    if not url_longa_limpa or not isinstance(url_longa_limpa, str):
        raise ValueError("URL do produto inválida para conversão no Hub.")

    url_limpa = url_longa_limpa.strip()
    logger.info(f"Iniciando conversão headless no Hub Oficial para: {url_limpa}")

    # Import dinâmico do Playwright para garantir que o script funcione ou dê erro claro
    try:
        from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
    except ImportError:
        logger.error("Playwright não instalado. Instale com: pip install playwright && playwright install chromium")
        raise MeliAutomationError(
            "Biblioteca 'playwright' não encontrada no ambiente Python. "
            "Execute: pip install playwright && playwright install chromium"
        )

    cookies = carregar_cookies_sessao(cookies_path)
    if not cookies:
        logger.warning(
            "Nenhum cookie de autenticação encontrado. "
            "A navegação pode ser barrada na tela de login."
        )

    async with async_playwright() as p:
        # Lança navegador com argumentos anti-detecção
        browser = await p.chromium.launch(
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--hide-scrollbars",
                "--mute-audio",
                "--disable-background-networking",
                "--disable-default-apps",
                "--disable-extensions",
            ]
        )

        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="pt-BR",
            timezone_id="America/Sao_Paulo",
        )

        # Injeta cookies de autenticação
        if cookies:
            try:
                await context.add_cookies(cookies)
            except Exception as e:
                logger.warning(f"Erro parcial ao adicionar cookies no contexto: {e}")

        page = await context.new_page()

        try:
            logger.info(f"Navegando para o Hub: {HUB_LINKBUILDER_URL}")
            response = await page.goto(
                HUB_LINKBUILDER_URL,
                wait_until="domcontentloaded",
                timeout=timeout_ms
            )

            # 1. Verificação de Sessão Ativa / Bloqueio
            current_url = page.url.lower()
            if "login" in current_url or "account-verification" in current_url or "gz/challenge" in current_url:
                logger.error(f"Sessão expirada ou desafio detectado! Redirecionado para: {page.url}")
                raise SessionExpiredError(
                    f"A conta do Mercado Livre exige autenticação ou desafio de segurança. "
                    f"Atualize o arquivo '{cookies_path}' com novos cookies de login."
                )

            # 2. Localização do Campo de Entrada ("Insira 1 ou mais URLs")
            # Lista de seletores resilientes para o input de links
            input_selectors = [
                'textarea[placeholder*="URL"]',
                'textarea[placeholder*="url"]',
                'input[placeholder*="URL"]',
                'input[placeholder*="http"]',
                '#link-builder-input',
                'textarea[name="urls"]',
                'textarea.andes-form-control__field',
                'textarea',
                'input[type="text"]'
            ]

            input_element = None
            for sel in input_selectors:
                try:
                    el = await page.wait_for_selector(sel, state="visible", timeout=4000)
                    if el:
                        input_element = el
                        logger.info(f"Campo de input localizado via seletor: '{sel}'")
                        break
                except Exception:
                    continue

            if not input_element:
                # Salva screenshot para diagnóstico se falhar
                dump_path = os.path.join(os.getcwd(), ".whatsapp_auth", "error_dom_linkbuilder.png")
                await page.screenshot(path=dump_path)
                logger.error(f"Screenshot da falha salvo em: {dump_path}")
                raise ElementNotFoundError("Não foi possível localizar o campo de input de URLs no LinkBuilder.")

            # Limpa e injeta a URL limpa do produto
            await input_element.fill("")
            await input_element.fill(url_limpa)
            logger.info("URL limpa injetada com sucesso no LinkBuilder.")

            # 3. Garantir seleção de Etiqueta / Tag (Se aplicável)
            if tag_id:
                try:
                    tag_selector = f'input[value="{tag_id}"], select option[value="{tag_id}"]'
                    tag_el = await page.query_selector(tag_selector)
                    if tag_el:
                        await tag_el.click()
                        logger.info(f"Tag de afiliado '{tag_id}' selecionada.")
                except Exception as tag_err:
                    logger.warning(f"Aviso ao selecionar tag: {tag_err}")

            # 4. Localizar e Clicar no Botão "Gerar" / "Criar Links"
            button_selectors = [
                'button:has-text("Gerar")',
                'button:has-text("Criar link")',
                'button:has-text("Gerar link")',
                'button[type="submit"]',
                'button.andes-button--loud',
                'button.andes-button--primary'
            ]

            generate_button = None
            for b_sel in button_selectors:
                try:
                    btn = await page.wait_for_selector(b_sel, state="visible", timeout=3000)
                    if btn:
                        generate_button = btn
                        logger.info(f"Botão de gerar localizado via: '{b_sel}'")
                        break
                except Exception:
                    continue

            if not generate_button:
                raise ElementNotFoundError("Botão 'Gerar' não encontrado na página do Hub.")

            await generate_button.click()
            logger.info("Botão 'Gerar' acionado. Aguardando processamento do DOM...")

            # 5. Aguardar resposta e extrair link meli.la gerado
            # Monitora tanto elementos visíveis quanto expressões regulares no texto da página
            resultado_meli_la = None
            tempo_inicial = asyncio.get_event_loop().time()

            while (asyncio.get_event_loop().time() - tempo_inicial) < (timeout_ms / 1000):
                # Estratégia A: Buscar por inputs ou campos de texto com meli.la
                result_inputs = await page.query_selector_all('input[value*="meli.la"], textarea:has-text("meli.la"), a[href*="meli.la"]')
                for res_el in result_inputs:
                    val = await res_el.get_attribute("value") or await res_el.get_attribute("href") or await res_el.text_content()
                    if val and "meli.la" in val:
                        match = re.search(r"https?://meli\.la/[A-Za-z0-9]+", val)
                        if match:
                            resultado_meli_la = match.group(0)
                            break

                if resultado_meli_la:
                    break

                # Estratégia B: Inspecionar o innerText do container de resultados
                content = await page.content()
                match = re.search(r"https?://meli\.la/[A-Za-z0-9]+", content)
                if match:
                    resultado_meli_la = match.group(0)
                    break

                await asyncio.sleep(0.5)

            if not resultado_meli_la:
                dump_path = os.path.join(os.getcwd(), ".whatsapp_auth", "error_timeout_meli.png")
                await page.screenshot(path=dump_path)
                raise LinkGenerationTimeoutError(
                    f"Timeout aguardando link meli.la ser gerado pelo Hub. Screenshot salvo em '{dump_path}'."
                )

            logger.info(f"Sucesso! Link meli.la gerado oficialmente pelo Hub: {resultado_meli_la}")

            # Persiste cookies atualizados após uso
            novos_cookies = await context.cookies()
            salvar_cookies_sessao(novos_cookies, cookies_path)

            return resultado_meli_la

        except PlaywrightTimeoutError as e:
            logger.error(f"Timeout na execução do Playwright: {e}")
            raise LinkGenerationTimeoutError(f"Operação cancelada por tempo limite: {e}")
        finally:
            await context.close()
            await browser.close()


# Execução CLI para Integração com Node.js / Baileys
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Uso: python3 conversor_hub_meli.py <URL_PRODUTO_LIMPA> [CAMINHO_COOKIES]"
        }))
        sys.exit(1)

    url_alvo = sys.argv[1]
    cookies_file = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_COOKIE_PATH

    try:
        loop = asyncio.get_event_loop()
        link_gerado = loop.run_until_complete(gerar_link_meli_hub(url_alvo, cookies_path=cookies_file))
        print(json.dumps({
            "success": True,
            "original_product_url": url_alvo,
            "monetized_meli_la": link_gerado,
            "source": "Mercado Livre Official Hub Automation"
        }))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
            "error_type": exc.__class__.__name__
        }))
        sys.exit(1)
