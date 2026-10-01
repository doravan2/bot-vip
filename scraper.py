#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
SCRAPER ROBUSTO DE OFERTAS (REGEX AVANÇADO & HEURÍSTICAS NLP)
=============================================================================
Módulo de extração tolerante a falhas projetado para processar mensagens
de grupos concorrentes (WhatsApp, Telegram) com layout inconsistente,
ausência de mídia, preços em múltiplos formatos e cupons variáveis.

Princípio de Design: GRACEFUL DEGRADATION
- NUNCA quebra ou lança exceções não tratadas por falta de campos.
- Emite avisos no log e preenche campos com valores seguros.
- Prioriza o menor valor numérico como preço promocional quando há faixa (De/Por).
- Normaliza URLs incompletas (ex: meli.la/xxx -> https://meli.la/xxx).
=============================================================================
"""

import re
import sys
import json
import logging
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any, Tuple

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [ScraperOfertas] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("ScraperOfertas")


@dataclass
class DadosOferta:
    """Estrutura formal de dados de uma oferta extraída."""
    titulo: Optional[str] = None
    url_original: Optional[str] = None
    url_normalizada: Optional[str] = None
    preco_promocional: Optional[float] = None
    preco_original: Optional[float] = None
    cupom: Optional[str] = None
    contem_midia: bool = True
    dados_completos: bool = False
    marketplace_detectado: Optional[str] = None
    avisos: List[str] = field(default_factory=list)
    linhas_originais: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# =============================================================================
# REGEX & HEURÍSTICAS TOLERANTES A FALHAS
# =============================================================================

# 1. Regex de URLs tolerante: detecta links com/sem protocolo, meli.la, shopee, amzn, magalu
URL_PATTERN = re.compile(
    r"""
    (?i)\b(?:https?://|www\.|(?=(?:meli\.la|mercadolivre\.com|shopee\.com|amzn\.to|amazon\.com|magazineluiza\.com)[/]))
    [a-z0-9]+(?:[\-\.][a-z0-9]+)*\.[a-z]{2,}
    (?:/[^\s<>"'(){}\[\]]*[^\s<>"'(){}\[\].,;:])?
    """,
    re.VERBOSE
)

# 2. Regex de Valores Monetários em Português
# Captura "R$ 100", "R$1.299,90", "por apenas 517", "120 pix", "de 150 por 99"
PRICE_PATTERNS = [
    # Ex: De R$ 150 por R$ 99 / De 150 por apenas 99
    re.compile(r'(?i)\bde\s*(?:R\$\s*)?([\d\.,]+)\s*por\s*(?:R\$\s*)?([\d\.,]+)'),
    # Ex: R$ 517 / R$517,00 / R$ 1.250,90
    re.compile(r'(?i)R\$\s*([\d\.,]+)'),
    # Ex: Por apenas 517 / apenas 517 pix / por 99,90
    re.compile(r'(?i)(?:por|apenas|s[oó]|valor|pix|pre[çc]o)[:\s]+(?:R\$\s*)?([\d\.,]+)'),
    # Ex: 517 pix / 99 à vista
    re.compile(r'(?i)([\d\.,]+)\s*(?:pix|reais|\`a\s*vista|a\s*vista)\b'),
]

# 3. Regex de Cupons Promocionais
COUPON_PATTERNS = [
    re.compile(r'(?i)(?:cupom|c[oó]digo|use\s+o\s+cupom|aplique\s+o\s+cupom|voucher)[:\s*]+([A-Z0-9_\-]+)'),
    re.compile(r'🎟\s*(?:Cupom:?)?\s*([A-Z0-9_\-]+)'),
    re.compile(r'(?i)\bcupom\s+([A-Z0-9_\-]{4,20})\b'),
]

# Palavras que parecem cupons mas são ruído ou termos de oferta
BLACKLIST_COUPONS = {
    "PIX", "OFF", "FRETE", "GRATIS", "GRÁTIS", "SIM", "NAO", "NÃO", "LINK",
    "AQUI", "COMPRE", "OFERTA", "PROMO", "DESCONTO", "VALOR", "AVISTA",
    "TODOS", "HOJE", "NOVO", "APP", "VER", "MAIS"
}

# Regex de Cabeçalhos e Rodapés de Concorrentes para Limpeza
COMPETITOR_JUNK_PATTERNS = [
    re.compile(r'(?i)👉\s*(?:compartilhe|entre|participe|acesse|junte-se|canal|grupo).*'),
    re.compile(r'(?i)\[?(?:canal|grupo|achados|ofertas|clube|dicas)\s+d[eao]\s+[^\]\n]+\]?'),
    re.compile(r'(?i)https?://(?:t\.me|chat\.whatsapp\.com|achadinho\.pro|linktr\.ee|beacons\.ai)[^\s]*'),
    re.compile(r'@[A-Za-z0-9_.]+'),
]


def normalizar_preco(texto_valor: str) -> Optional[float]:
    """
    Converte strings monetárias brasileiras ou internacionais para float Python.
    Ex: '1.299,90' -> 1299.90, '517' -> 517.0, '517,00' -> 517.0
    """
    if not texto_valor:
        return None
    val = texto_valor.strip().rstrip(".,;:")
    try:
        # Se contiver pontos como separadores de milhar e vírgula como decimal (padrão BR: 1.250,90)
        if "." in val and "," in val:
            val = val.replace(".", "").replace(",", ".")
        elif "," in val:
            # Padrão BR com apenas decimal: 99,90 ou 517,00
            val = val.replace(",", ".")
        # Se tiver mais de um ponto (ex: 1.250.000)
        elif val.count(".") > 1:
            val = val.replace(".", "")

        num = float(val)
        # Filtro de sanidade (preços entre R$ 1,00 e R$ 100.000,00)
        if 0.50 <= num <= 200000.0:
            return round(num, 2)
    except Exception:
        pass
    return None


def extrair_todas_urls(texto: str) -> List[str]:
    """Extrai todas as URLs do texto, com normalização de protocolo https."""
    urls = []
    for match in URL_PATTERN.finditer(texto):
        url = match.group(0).strip(".,;:)[]{}'\"")
        # Ignora links de convite de grupos de concorrentes
        if any(bad in url.lower() for bad in ["chat.whatsapp.com", "t.me/", "telegram.me", "achadinho.pro", "linktr.ee"]):
            continue
        if not url.startswith("http://") and not url.startswith("https://"):
            url = f"https://{url}"
        if url not in urls:
            urls.append(url)
    return urls


def extrair_cupom(texto: str) -> Optional[str]:
    """Extrai código de cupom com verificação de blacklist."""
    for pattern in COUPON_PATTERNS:
        matches = pattern.finditer(texto)
        for m in matches:
            cupom = m.group(1).strip().upper()
            if cupom not in BLACKLIST_COUPONS and len(cupom) >= 3 and not cupom.isdigit():
                return cupom
    return None


def extrair_precos(texto: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Extrai preços (promocional e original).
    Garante que preco_promocional é sempre o menor valor e preco_original o maior (se houver).
    """
    todos_precos: List[float] = []

    # 1. Verifica padrão explícito "De X por Y"
    de_por_match = PRICE_PATTERNS[0].search(texto)
    if de_por_match:
        p_de = normalizar_preco(de_por_match.group(1))
        p_por = normalizar_preco(de_por_match.group(2))
        if p_de and p_por:
            return (min(p_de, p_por), max(p_de, p_por))

    # 2. Varre outros padrões de preço
    for pat in PRICE_PATTERNS[1:]:
        for m in pat.finditer(texto):
            val = normalizar_preco(m.group(1))
            if val is not None and val not in todos_precos:
                todos_precos.append(val)

    if not todos_precos:
        return (None, None)

    if len(todos_precos) == 1:
        return (todos_precos[0], None)

    # Se múltiplos preços forem detectados, ordena: menor = promocional
    todos_precos.sort()
    return (todos_precos[0], todos_precos[-1])


def extrair_titulo_produto(linhas: List[str]) -> Optional[str]:
    """
    Heurística NLP para isolar o título do produto em mensagens de concorrentes.
    Analisa a primeira linha com conteúdo descritivo relevante.
    """
    for linha in linhas:
        l = linha.strip()
        if not l:
            continue
        # Remove emojis do início
        l_limpa = re.sub(r'^[^\w\s]+', '', l).strip()
        # Ignora se for linha de preço, cupom, link ou chamada de ação
        if re.search(r'(?i)(?:R\$|cupom|link|de\s+\d+|por\s+\d+|compartilhe|participe|https?:)', l_limpa):
            continue
        if len(l_limpa) >= 6:
            # Limita tamanho máximo para título
            return l_limpa[:140].strip()
    return None


def detectar_marketplace(url: Optional[str]) -> str:
    """Detecta o marketplace de destino a partir da URL."""
    if not url:
        return "desconhecido"
    u = url.lower()
    if "meli.la" in u or "mercadolivre" in u:
        return "mercadolivre"
    if "shopee.com" in u or "shp.ee" in u:
        return "shopee"
    if "amazon.com" in u or "amzn.to" in u:
        return "amazon"
    if "magazineluiza.com" in u or "magalu.me" in u:
        return "magalu"
    return "outro"


def extrair_dados_oferta_robusta(texto_bruto: str, contem_midia: bool = True) -> DadosOferta:
    """
    Função principal de extração resiliente de dados de ofertas de concorrentes.

    Args:
        texto_bruto: Mensagem crua recebida do WhatsApp/Telegram
        contem_midia: Indica se a mensagem veio acompanhada de foto/vídeo

    Returns:
        DadosOferta com campos estruturados e avisos de degradação suave.
    """
    if not texto_bruto or not isinstance(texto_bruto, str):
        logger.warning("[Scraper] Mensagem de entrada vazia recebida.")
        return DadosOferta(
            contem_midia=contem_midia,
            dados_completos=False,
            avisos=["Mensagem vazia ou sem texto."]
        )

    linhas = [linha.strip() for linha in texto_bruto.split("\n") if linha.strip()]
    avisos: List[str] = []

    # 1. Extração de URLs (tolerante e com normalização)
    urls = extrair_todas_urls(texto_bruto)
    url_principal = urls[0] if urls else None

    if not url_principal:
        msg_aviso = "Nenhuma URL de produto detectada na mensagem."
        logger.warning(f"[Scraper/GracefulDegradation] {msg_aviso}")
        avisos.append(msg_aviso)
    else:
        logger.info(f"[Scraper] URL principal extraída: {url_principal}")

    # 2. Extração de Preço
    preco_promo, preco_orig = extrair_precos(texto_bruto)
    if preco_promo is None:
        msg_aviso = "Nenhum preço monetário detectado na mensagem."
        logger.warning(f"[Scraper/GracefulDegradation] {msg_aviso}")
        avisos.append(msg_aviso)
    else:
        logger.info(f"[Scraper] Preço promocional detectado: R$ {preco_promo:.2f}")

    # 3. Extração de Cupom
    cupom = extrair_cupom(texto_bruto)
    if cupom:
        logger.info(f"[Scraper] Cupom promocional identificado: {cupom}")

    # 4. Extração de Título
    titulo = extrair_titulo_produto(linhas)
    if not titulo:
        titulo = "Super Oferta Imperdível"
        avisos.append("Título do produto inferido automaticamente por ausência de linha descritiva.")

    # 5. Detecção do Marketplace
    mkt = detectar_marketplace(url_principal)

    # 6. Avaliação de Completude
    # Uma oferta é considerada pronta se tiver pelo menos a URL (o dado mais crucial)
    dados_completos = bool(url_principal is not None)

    if not contem_midia:
        avisos.append("Mensagem sem imagem anexada (envio ocorrerá em modo somente texto).")

    return DadosOferta(
        titulo=titulo,
        url_original=url_principal,
        url_normalizada=url_principal,
        preco_promocional=preco_promo,
        preco_original=preco_orig,
        cupom=cupom,
        contem_midia=contem_midia,
        dados_completos=dados_completos,
        marketplace_detectado=mkt,
        avisos=avisos,
        linhas_originais=linhas
    )


# Execução CLI para Testes e Diagnóstico
if __name__ == "__main__":
    exemplo_concorrente = """
    🔥 Monitor Gigabyte Gs24f14 23.8 Pol Full Hd Ips 144hz 1ms

    💵 De R$ 680 por apenas R$ 517 pix
    🎟 Cupom: APROVEITAHOJE

    https://meli.la/1pKTwSc
    https://meli.la/1pKTwSc

    👉 Compartilhe com os amigos:
    https://chat.whatsapp.com/CnMivNFKWlF7juMu85u5KO
    """

    texto = sys.argv[1] if len(sys.argv) > 1 else exemplo_concorrente
    dados = extrair_dados_oferta_robusta(texto, contem_midia=True)

    print("\n--- RESULTADO DA EXTRAÇÃO ROBUSTA ---")
    print(json.dumps(dados.to_dict(), indent=2, ensure_ascii=False))
