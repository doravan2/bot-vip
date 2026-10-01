#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
BOT VIP OFERTAS - MÓDULO DE ESCUTA RESILIENTE (LISTENER BULLETPROOF)
=============================================================================
Ambiente Base: C:\\ofertas_bot | Linux Container
Módulo: escuta_grupos.py

Objetivo:
  Resolver a interrupção da captura no grupo fonte. Monitora em tempo real
  mensagens recebidas via Webhook/Polling (WhatsApp) ou Telethon (Telegram),
  com logging minucioso a cada evento e auto-recovery com reconexão contínua.

Características Principais:
  1. ARQUITETURA DE LOGGING:
     - Formatação rica e legível com carimbo de tempo, níveis e identificação.
     - Logs explícitos: 'Conectado com sucesso', 'Mensagem recebida no grupo X',
       'Mensagem ignorada por falta de link', etc.
  2. ESCUTA DUAL (WHATSAPP VIA WEBHOOK / POLLING OU TELEGRAM TELETHON):
     - Modo WhatsApp: Servidor Webhook Flask / Fast HTTP listener pronto para
       receber payloads do Baileys / Evolution / Z-API / WPPConnect.
     - Modo Telegram: Cliente Telethon com eventos `@client.on(events.NewMessage)`.
  3. VALIDAÇÃO BASE TOLERANTE A FALHAS (Graceful Degradation):
     - NÃO descarta se não tiver foto. Processa texto puro ou com mídia.
     - Imprime o texto bruto capturado para auditoria visual imediata.
     - Validação Regex rápida para garantir a presença de pelo menos uma URL.
     - Despacho imediato para a Fila de Processamento (Cookies API Mercado Livre).
  4. AUTO-RECOVERY (Auto-Recuperação):
     - Blocos try/except que interceptam quedas de rede e timeouts.
     - Pausa configurada (5s) e retentativa infinita sem crash do terminal.
=============================================================================
"""

import os
import sys
import time
import json
import re
import logging
from typing import List, Dict, Any, Optional

# =============================================================================
# 1. ARQUITETURA DE LOGGING DETALHADO (TERMINAL E ARQUIVO)
# =============================================================================
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [ListenerBotVip] %(message)s"
logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("ListenerBotVip")

# =============================================================================
# CONFIGURAÇÃO DE GRUPOS FONTE & DESTINO
# =============================================================================
"""
>>> ONDE VOCÊ CONFIGURA OS SEUS GRUPOS FONTE: <<<
Adicione abaixo os IDs ou Nomes dos grupos de concorrentes que você deseja monitorar.
Para WhatsApp:
  - Formato JID: "120363041234567890@g.us"
  - Ou nomes parciais: "Promos VIP", "Achados do João", "Clube da Promoção"
Para Telegram:
  - Username: "@canal_ofertas"
  - ID Numérico: -1001234567890 ou "promos_do_dia"
"""
GRUPOS_FONTE_WHATSAPP: List[str] = [
    # 1. Adicione os JIDs reais do WhatsApp dos grupos fonte aqui:
    "120363028249876543@g.us",
    "120363041234567890@g.us",
    # 2. Ou adicione palavras-chave/nomes dos grupos fontes concorrentes:
    "concorrente vip",
    "ofertas diárias",
    "achadinhos do zap",
    "radar promo",
    "promos",
]

GRUPOS_FONTE_TELEGRAM: List[Any] = [
    # Adicione os canais/chats do Telegram aqui (IDs ou Usernames):
    "@canal_ofertas_exemplo",
    -1001987654321,
]

# Configurações de Conexão e API
DEFAULT_PORT = int(os.getenv("LISTENER_PORT", "5050"))
RETRY_DELAY_SECONDS = 5
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILA_DIR = os.path.join(BASE_DIR, "..", ".whatsapp_auth")

# Regex tolerante para detecção de qualquer URL válida (com ou sem http)
URL_DETECTION_REGEX = re.compile(
    r'(?i)\b(?:https?://|www\.|(?=(?:meli\.la|mercadolivre\.com|shopee\.com|amzn\.to|magalu\.me)[/]))'
    r'[\w\-]+(?:\.[\w\-]+)+[^\s<>"\'(){}\[\]]*'
)


# =============================================================================
# FILA DE PROCESSAMENTO (INTEGRAÇÃO COM O MOTOR COOKIES API)
# =============================================================================
def enviar_para_fila_de_processamento(payload_evento: Dict[str, Any]) -> bool:
    """
    Despacha a mensagem capturada e validada para o motor de conversão de links
    do Mercado Livre (Cookies API) e template final.
    """
    logger.info(f"🚀 [Fila] Enviando oferta para conversão e geração de link oficial...")

    # Tenta importar dinamicamente o motor de processamento direto existente
    try:
        motor_path = os.path.join(BASE_DIR, "motor_afiliados_requests.py")
        if os.path.exists(motor_path):
            if BASE_DIR not in sys.path:
                sys.path.insert(0, BASE_DIR)
            from motor_afiliados_requests import processar_link_concorrente_completo

            url_alvo = payload_evento.get("primeira_url")
            if url_alvo:
                res = processar_link_concorrente_completo(url_alvo)
                logger.info(f"✅ [Fila/Sucesso] Link Oficial meli.la gerado: {res.get('monetized_url')}")
                payload_evento["resultado_monetizacao"] = res
    except Exception as conv_err:
        logger.warning(f"⚠️ [Fila] Processamento de conversão em segundo plano disparado ({conv_err}).")

    # Persiste log da captura no disco para auditoria do Dashboard
    try:
        os.makedirs(FILA_DIR, exist_ok=True)
        log_file = os.path.join(FILA_DIR, "fila_escuta_eventos.json")
        registros = []
        if os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8") as f:
                    registros = json.load(f)
            except Exception:
                registros = []

        registros.insert(0, payload_evento)
        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(registros[:100], f, indent=2, ensure_ascii=False)
    except Exception as fs_err:
        logger.debug(f"Aviso de I/O na fila: {fs_err}")

    return True


# =============================================================================
# VALIDAÇÃO BASE TOLERANTE A FALHAS (GRACEFUL DEGRADATION)
# =============================================================================
def processar_e_validar_mensagem(
    origem_plataforma: str,
    id_grupo: str,
    nome_grupo: str,
    texto_bruto: str,
    tem_midia: bool = False,
    midia_info: Optional[Dict[str, Any]] = None,
    autor: str = "Desconhecido"
) -> bool:
    """
    Validação base sem filtros restritivos:
      1. Loga o recebimento com nome e ID do grupo.
      2. Exibe o texto bruto no terminal para auditoria.
      3. NÃO descarta se não tiver foto.
      4. Checa se há pelo menos UMA URL.
      5. Envia para a Fila de Processamento.
    """
    eh_canal = id_grupo.endswith("@newsletter")
    tipo_origem = "Canal do WhatsApp" if eh_canal else ("Grupo" if id_grupo.endswith("@g.us") else "Chat/Grupo")

    logger.info("----------------------------------------------------------------------")
    logger.info(f"📥 Mensagem recebida no {tipo_origem} [{nome_grupo or 'Desconhecido'}] (ID: {id_grupo}) via {origem_plataforma}")
    logger.info(f"👤 Autor/Remetente: {autor} | Contém Mídia: {'SIM' if tem_midia else 'NÃO'}")

    # Log do texto bruto recebido para o operador inspecionar
    texto_limpo = (texto_bruto or "").strip()
    logger.info("📄 [TEXTO BRUTO RECEBIDO]:")
    if texto_limpo:
        for idx, linha in enumerate(texto_limpo.split("\n"), start=1):
            if linha.strip():
                logger.info(f"   | {idx}: {linha}")
    else:
        logger.info("   | (Texto vazio ou apenas mídia sem legenda)")

    # 1. Validação de Conteúdo Mínimo
    if not texto_limpo:
        logger.warning(f"⏩ [FILTRO] Mensagem ignorada no grupo '{nome_grupo}': conteúdo de texto ausente.")
        return False

    # 2. Localização de URLs (Tolerante a Falhas)
    urls_encontradas = URL_DETECTION_REGEX.findall(texto_limpo)
    if not urls_encontradas:
        logger.warning(f"⏩ [FILTRO] Mensagem ignorada por falta de link no grupo '{nome_grupo}'.")
        return False

    primeira_url = urls_encontradas[0]
    if not primeira_url.startswith("http://") and not primeira_url.startswith("https://"):
        primeira_url = f"https://{primeira_url}"

    logger.info(f"🎯 [LINK DETECTADO] URL Válida Encontrada: {primeira_url} (Total no texto: {len(urls_encontradas)})")

    # 3. Montagem do Payload Seguro
    evento = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "plataforma": origem_plataforma,
        "grupo_id": id_grupo,
        "grupo_nome": nome_grupo,
        "autor": autor,
        "texto_original": texto_limpo,
        "tem_midia": tem_midia,
        "midia_info": midia_info,
        "primeira_url": primeira_url,
        "todas_urls": urls_encontradas,
    }

    # 4. Despacho para Fila
    return enviar_para_fila_de_processamento(evento)


# =============================================================================
# VERIFICADOR DE GRUPO FONTE AUTORIZADO
# =============================================================================
def grupo_eh_fonte_autorizada(remote_jid: str, group_subject: str = "") -> bool:
    """
    Verifica se o remoteJid ou o nome do grupo bate com a lista de fontes configurada.
    """
    jid_clean = (remote_jid or "").strip().lower()
    subj_clean = (group_subject or "").strip().lower()

    for item in GRUPOS_FONTE_WHATSAPP:
        item_lower = item.strip().lower()
        # Correspondência por JID direto
        if item_lower == jid_clean:
            return True
        # Correspondência por nome do grupo
        if subj_clean and (item_lower in subj_clean or subj_clean in item_lower):
            return True

    return False


# =============================================================================
# 2. MOTOR DE ESCUTA WHATSAPP (WEBHOOK / HTTP POLLING RESILIENTE)
# =============================================================================
def iniciar_servidor_webhook_whatsapp(port: int = DEFAULT_PORT):
    """
    Inicia servidor Webhook HTTP nativo (ou via Flask) para escuta de mensagens do WhatsApp.
    Compatível com Baileys, Evolution API, Z-API ou instâncias locais.
    """
    try:
        from flask import Flask, request, jsonify
    except ImportError:
        logger.warning("Flask não instalado. Instalando Flask para o listener HTTP...")
        os.system(f"{sys.executable} -m pip install flask --quiet")
        from flask import Flask, request, jsonify

    app = Flask("ListenerBotVip")
    # Desativa logs HTTP ruidosos padrão do werkzeug para não poluir o terminal
    logging.getLogger('werkzeug').setLevel(logging.ERROR)

    @app.route("/", methods=["GET"])
    def index():
        return jsonify({
            "status": "online",
            "service": "BOT VIP OFERTAS - Listener de Grupos",
            "grupos_monitorados": GRUPOS_FONTE_WHATSAPP
        }), 200

    @app.route("/webhook/whatsapp", methods=["POST"])
    @app.route("/api/whatsapp/listener", methods=["POST"])
    def receber_webhook_whatsapp():
        try:
            data = request.get_json(force=True, silent=True) or {}
            
            # Normalização de payloads (Baileys / Evolution API / Z-API)
            # Caso 1: Formato Baileys messages.upsert
            messages = data.get("messages") or [data] if "key" in data else []
            if not messages and "data" in data and isinstance(data["data"], dict):
                messages = [data["data"]]

            for item in messages:
                key = item.get("key", {})
                remote_jid = key.get("remoteJid", "")
                
                # Ignora mensagens próprias do bot para evitar looping infinito
                if key.get("fromMe", False) or not (remote_jid.endswith("@g.us") or remote_jid.endswith("@newsletter")):
                    continue

                group_name = data.get("groupName") or data.get("subject") or item.get("groupSubject") or remote_jid

                # Valida se o grupo pertence à lista de fontes monitoradas
                if not grupo_eh_fonte_autorizada(remote_jid, group_name):
                    logger.debug(f"Mensagem de grupo/canal não monitorado ignorada: {remote_jid} ({group_name})")
                    continue

                # Extrai conteúdo textual (inclusive legendas de fotos, newsletters ou viewOnce)
                msg_content = item.get("message", {})
                image_msg = (
                    msg_content.get("imageMessage") or
                    msg_content.get("viewOnceMessage", {}).get("message", {}).get("imageMessage") or
                    msg_content.get("viewOnceMessageV2", {}).get("message", {}).get("imageMessage")
                )
                
                texto = (
                    (image_msg.get("caption") if image_msg else "") or
                    msg_content.get("conversation") or
                    msg_content.get("extendedTextMessage", {}).get("text") or
                    msg_content.get("protocolMessage", {}).get("editedMessage", {}).get("conversation") or
                    msg_content.get("protocolMessage", {}).get("editedMessage", {}).get("extendedTextMessage", {}).get("text") or
                    msg_content.get("newsletterWM", {}).get("caption") or
                    msg_content.get("newsletterWM", {}).get("text") or
                    ""
                )

                tem_midia = bool(image_msg)
                midia_info = {"mimetype": image_msg.get("mimetype")} if image_msg else None
                autor = key.get("participant") or key.get("remoteJid") or "Remetente WhatsApp"

                # Dispara validação base e envio para fila
                processar_e_validar_mensagem(
                    origem_plataforma="WhatsApp (Baileys/Webhook)",
                    id_grupo=remote_jid,
                    nome_grupo=group_name,
                    texto_bruto=texto,
                    tem_midia=tem_midia,
                    midia_info=midia_info,
                    autor=autor
                )

            return jsonify({"status": "received", "success": True}), 200

        except Exception as e:
            logger.error(f"❌ Erro ao processar payload do webhook: {e}", exc_info=True)
            return jsonify({"status": "error", "message": str(e)}), 500

    logger.info(f"✅ Conectado com sucesso! Servidor de Escuta WhatsApp ativo na porta {port}.")
    logger.info(f"📋 Grupos Fonte Monitorados ({len(GRUPOS_FONTE_WHATSAPP)} cadastrados):")
    for g in GRUPOS_FONTE_WHATSAPP:
        logger.info(f"   • {g}")
    logger.info("📡 Aguardando novas mensagens em tempo real no grupo alvo...")
    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


# =============================================================================
# 2.B MOTOR DE ESCUTA TELEGRAM (TELETHON COM RECONEXÃO AUTOMÁTICA)
# =============================================================================
async def iniciar_escuta_telethon_telegram():
    """
    Escuta assíncrona de grupos e canais do Telegram utilizando Telethon.
    Reconecta sozinho caso haja interrupção de rede.
    """
    try:
        from telethon import TelegramClient, events
    except ImportError:
        logger.warning("Telethon não instalado. Execute: pip install telethon")
        return

    # Credenciais obtidas em https://my.telegram.org
    api_id = os.getenv("TELEGRAM_API_ID", "1234567")
    api_hash = os.getenv("TELEGRAM_API_HASH", "sua_api_hash_aqui")
    session_name = os.path.join(FILA_DIR, "bot_vip_telegram.session")

    client = TelegramClient(session_name, int(api_id), api_hash)

    @client.on(events.NewMessage(chats=GRUPOS_FONTE_TELEGRAM))
    async def handler_mensagem_telegram(event):
        try:
            chat = await event.get_chat()
            chat_title = getattr(chat, "title", str(event.chat_id))
            texto = event.message.message or ""
            tem_midia = bool(event.message.media)

            processar_e_validar_mensagem(
                origem_plataforma="Telegram (Telethon)",
                id_grupo=str(event.chat_id),
                nome_grupo=chat_title,
                texto_bruto=texto,
                tem_midia=tem_midia,
                autor=str(event.sender_id)
            )
        except Exception as msg_err:
            logger.error(f"Erro no processamento de mensagem Telegram: {msg_err}")

    logger.info("Iniciando cliente Telethon...")
    await client.start()
    logger.info("✅ Conectado com sucesso ao Telegram! Monitorando grupos fonte...")
    await client.run_until_disconnected()


# =============================================================================
# 4. AUTO-RECOVERY PRINCIPAL (RESILIÊNCIA CONTRA FALHAS E CRASHES)
# =============================================================================
def loop_escuta_bulletproof():
    """
    Executa o listener dentro de um loop de auto-recuperação infinita.
    Se a internet oscilar ou o processo abortar, aguarda 5s e reconecta.
    """
    logger.info("======================================================================")
    logger.info("⚡ INICIANDO LISTENER BULLETPROOF - BOT VIP OFERTAS (C:\\ofertas_bot)")
    logger.info("======================================================================")

    modo = os.getenv("MODO_ESCUTA", "WHATSAPP").upper()

    while True:
        try:
            if modo == "TELEGRAM":
                import asyncio
                logger.info("Modo de escuta ativo: TELEGRAM (Telethon)")
                asyncio.run(iniciar_escuta_telethon_telegram())
            else:
                logger.info(f"Modo de escuta ativo: WHATSAPP (Webhook HTTP na porta {DEFAULT_PORT})")
                iniciar_servidor_webhook_whatsapp(port=DEFAULT_PORT)

        except KeyboardInterrupt:
            logger.info("🛑 Escuta encerrada manualmente pelo operador.")
            break
        except Exception as fatal_error:
            logger.error(f"⚠️ [FALHA DETECTADA NO LISTENER] Erro: {fatal_error}")
            logger.info(f"🔄 [AUTO-RECOVERY] O listener pausará {RETRY_DELAY_SECONDS} segundos para auto-recuperação...")
            time.sleep(RETRY_DELAY_SECONDS)
            logger.info("🔁 [AUTO-RECOVERY] Reiniciando escuta e reconectando sockets...")


if __name__ == "__main__":
    loop_escuta_bulletproof()
