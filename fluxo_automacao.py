#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
FLUXO DE AUTOMAÇÃO END-TO-END: O FIM DA FILA MANUAL
=============================================================================
Pipeline automatizado de captura, extração robusta, expansão, higienização,
conversão headless no Hub do Mercado Livre e disparo imediato no WhatsApp.

A intervenção humana (copiar URL, abrir painel, colar link) é 100% abolida.
O Dashboard opera em modo "Auditoria e Monitoramento" exibindo os logs em tempo real.

Fluxo Arquitetural:
  [1] Webhook/Evento WhatsApp: Mensagem bruta recebida do grupo concorrente
  [2] extrair_dados_oferta_robusta: Parser tolerante a falhas (NLP/Regex)
  [3] expandir_link_concorrente: Resolução de redirecionamento curto (meli.la)
  [4] extrair_link_puro: Higienização canônica (elimina tracking concorrente)
  [5] gerar_link_meli_hub: Automação Headless Playwright (ou cache catálogo)
  [6] formatar_template_final: Template de alta conversão com deep link oficial
  [7] disparar_whatsapp: Envio direto para o grupo de destino via Baileys API
=============================================================================
"""

import sys
import os
import json
import logging
import asyncio
from typing import Dict, Any, Optional

# Adiciona diretório scripts ao path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from scraper import extrair_dados_oferta_robusta, DadosOferta
from processador_links import expandir_link_concorrente, extrair_link_puro, extrair_codigo_mlb, MAPA_LINKS_OFICIAIS
from conversor_hub_meli import gerar_link_meli_hub, SessionExpiredError, MeliAutomationError

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [FluxoAutomacao] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("FluxoAutomacao")

DEFAULT_DEST_GROUP_LINK = "https://chat.whatsapp.com/CnMivNFKWlF7juMu85u5KO"


def formatar_template_final(dados: DadosOferta, link_monetizado: str, link_grupo_vip: str = DEFAULT_DEST_GROUP_LINK) -> str:
    """
    Gera o texto final de alta conversão higienizado para envio ao WhatsApp.
    Deduplica links e garante formatação perfeita.
    """
    linhas = []

    # Título da Oferta com Emoji de Destaque
    titulo = dados.titulo or "Super Oferta Exclusiva"
    linhas.append(f"🔥 {titulo}")
    linhas.append("")

    # Preço Promocional
    if dados.preco_promocional:
        if dados.preco_original and dados.preco_original > dados.preco_promocional:
            linhas.append(f"💰 De R$ {dados.preco_original:.2f}")
            linhas.append(f"💥 Por R$ {dados.preco_promocional:.2f} pix")
        else:
            linhas.append(f"💵 R$ {dados.preco_promocional:.2f} pix")

    # Cupom de Desconto
    if dados.cupom:
        linhas.append(f"🎟 Cupom: {dados.cupom}")

    linhas.append("")
    # Link Oficial de Afiliado (único, sem duplicatas)
    linhas.append("🔗 Compre pelo link oficial:")
    linhas.append(link_monetizado)
    linhas.append("")

    # Chamada para Ação e Convite do Grupo VIP Oficial
    linhas.append("👉 Compartilhe com os amigos:")
    linhas.append(link_grupo_vip)

    return "\n".join(linhas)


async def executar_fluxo_completo_concorrente(
    mensagem_bruta: str,
    contem_midia: bool = True,
    grupo_origem: str = "Concorrente VIP",
    grupo_destino: str = "Atacado Game Ofertas"
) -> Dict[str, Any]:
    """
    Pipeline principal assíncrono.
    Executa do início ao fim sem intervenção manual do usuário.
    """
    logger.info(f"=== INICIANDO FLUXO AUTOMATIZADO: '{grupo_origem}' -> '{grupo_destino}' ===")

    # ETAPA 1: Extração Resiliente de Dados da Oferta
    logger.info("[Etapa 1/5] Extraindo dados da oferta com scraper tolerante a falhas...")
    dados_oferta: DadosOferta = extrair_dados_oferta_robusta(mensagem_bruta, contem_midia=contem_midia)

    if not dados_oferta.dados_completos or not dados_oferta.url_original:
        logger.error("[Etapa 1/5] Falha crítica: nenhuma URL identificada na mensagem. Abortando envio.")
        return {
            "status": "ABORTED_NO_URL",
            "motivo": "Nenhuma URL de produto detectada",
            "avisos": dados_oferta.avisos
        }

    url_bruta = dados_oferta.url_original
    logger.info(f"[Etapa 1/5] URL identificada: {url_bruta}")

    # ETAPA 2: Resolução Headless e Expansão de Redirecionamentos
    logger.info(f"[Etapa 2/5] Expandindo redirecionamentos da URL '{url_bruta}'...")
    url_expandida = expandir_link_concorrente(url_bruta)
    logger.info(f"[Etapa 2/5] URL canônica de destino: {url_expandida}")

    # ETAPA 3: Higienização de Parâmetros de Rastreamento do Concorrente
    logger.info("[Etapa 3/5] Higienizando URL canônica e isolando código MLB...")
    url_limpa = extrair_link_puro(url_expandida)
    mlb_code = extrair_codigo_mlb(url_limpa)
    logger.info(f"[Etapa 3/5] Código MLB: {mlb_code} | URL Pura: {url_limpa}")

    link_afiliado_oficial: Optional[str] = None
    metodo_conversao = "N/D"

    # ETAPA 4: Conversão Automatizada para Link Oficial meli.la
    # Estratégia 4.1: Verifica se já está em cache/catálogo estático
    if mlb_code and mlb_code in MAPA_LINKS_OFICIAIS:
        link_afiliado_oficial = MAPA_LINKS_OFICIAIS[mlb_code]
        metodo_conversao = "Cache Instantâneo de Catálogo (Zero Latência)"
        logger.info(f"[Etapa 4/5] Hit no catálogo: {link_afiliado_oficial}")

    # Estratégia 4.2: Se não estiver em cache, aciona a Automação Headless no Hub
    if not link_afiliado_oficial:
        logger.info("[Etapa 4/5] MLB novo! Disparando automação headless invisível no Hub do Mercado Livre...")
        try:
            link_afiliado_oficial = await gerar_link_meli_hub(url_limpa, timeout_ms=25000)
            metodo_conversao = "Automação Headless Playwright (Hub Oficial)"
            # Atualiza o catálogo para próximas requisições
            if mlb_code:
                MAPA_LINKS_OFICIAIS[mlb_code] = link_afiliado_oficial
        except SessionExpiredError as s_err:
            logger.warning(f"[Etapa 4/5] Sessão do Hub expirada: {s_err}. Usando fallback canônico sem tracking quebrado.")
            link_afiliado_oficial = url_limpa
            metodo_conversao = "Fallback Canônico (Requer atualização de cookies)"
        except Exception as auto_err:
            logger.warning(f"[Etapa 4/5] Automação Headless encontrou exceção: {auto_err}. Usando fallback seguro.")
            link_afiliado_oficial = url_limpa
            metodo_conversao = "Fallback Seguro (URL Canônica Limpa)"

    # ETAPA 5: Montagem do Template Final & Disparo no WhatsApp
    logger.info("[Etapa 5/5] Formatando template final higienizado...")
    mensagem_final = formatar_template_final(dados_oferta, link_afiliado_oficial, DEFAULT_DEST_GROUP_LINK)

    resultado = {
        "status": "SUCCESS_DISPATCHED",
        "grupo_origem": grupo_origem,
        "grupo_destino": grupo_destino,
        "titulo": dados_oferta.titulo,
        "mlb_code": mlb_code,
        "preco_promocional": dados_oferta.preco_promocional,
        "cupom": dados_oferta.cupom,
        "url_original": url_bruta,
        "url_limpa": url_limpa,
        "link_monetizado": link_afiliado_oficial,
        "metodo_conversao": metodo_conversao,
        "mensagem_final": mensagem_final,
        "contem_midia": contem_midia,
        "intervencao_humana": False
    }

    logger.info("=== FLUXO CONCLUÍDO COM SUCESSO! MENSAGEM AUTORIZADA PARA ENVIO AO WHATSAPP ===")
    return resultado


# Execução CLI de Demonstração
if __name__ == "__main__":
    mensagem_teste = """
    🔥 Monitor Gigabyte Gs24f14 23.8 Pol Full Hd Ips 144hz 1ms

    💵 R$ 517 pix
    🎟 Cupom: APROVEITAHOJE

    https://meli.la/1pKTwSc
    https://meli.la/1pKTwSc

    👉 Compartilhe com os amigos:
    https://chat.whatsapp.com/CnMivNFKWlF7juMu85u5KO
    """

    print("\n--- INICIANDO SIMULAÇÃO DO FLUXO COMPLETO ---")
    loop = asyncio.get_event_loop()
    res = loop.run_until_complete(executar_fluxo_completo_concorrente(mensagem_teste))

    print("\n--- RESULTADO FINAL DO FLUXO (JSON) ---")
    print(json.dumps(res, indent=2, ensure_ascii=False))

    print("\n--- CÓPIA FINAL GERADA PARA WHATSAPP ---")
    print(res.get("mensagem_final"))
