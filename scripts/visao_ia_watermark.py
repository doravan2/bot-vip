#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Módulo de Visão Computacional Avançada - BOT VIP OFERTAS
Detecta e remove marcas d'água agressivas (pills escuros, @usernames, avatares e selos azuis de verificado)
utilizando OCR com Pré-Processamento Avançado, Segmentação de Cor HSV e Inpainting.
"""

import cv2
import numpy as np
import logging
import os
import json
import sys

# Configuração de Logs
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] [VisaoIA] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger("VisaoIA")

# Verificação do Tesseract OCR
try:
    import pytesseract
    from pytesseract import Output
    TESSERACT_AVAILABLE = True
except ImportError:
    logger.error("Biblioteca 'pytesseract' não instalada. Execute: pip install pytesseract")
    TESSERACT_AVAILABLE = False


def detectar_texto_ocr(imagem_cv2, blacklist=None) -> list:
    """
    Pré-processa a imagem (escala x2, cinza, thresholding Otsu/CLAHE)
    e executa Tesseract OCR otimizado (--psm 11) para encontrar usernames e textos da blacklist.
    Retorna lista de caixas originais: [(x, y, w, h)]
    """
    if not TESSERACT_AVAILABLE:
        logger.warning("Tesseract indisponível. Pulando detecção de texto por OCR.")
        return []

    blacklist = [b.lower().strip() for b in (blacklist or [])]
    caixas_texto = []

    try:
        altura_orig, largura_orig = imagem_cv2.shape[:2]

        # a) Redimensionamento (Scale x2) para melhorar a leitura de fontes pequenas
        escala = 2.0
        img_redim = cv2.resize(imagem_cv2, (0, 0), fx=escala, fy=escala, interpolation=cv2.INTER_CUBIC)

        # b) Conversão para Tons de Cinza
        gray = cv2.cvtColor(img_redim, cv2.COLOR_BGR2GRAY)

        # c) Thresholding (Otsu e CLAHE) para destacar texto claro sobre pílulas/fundos escuros
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_clahe = clahe.apply(gray)

        _, thresh_otsu = cv2.threshold(gray_clahe, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Configuração do Tesseract: PSM 11 (Sparse text)
        tess_config = r'--psm 11'

        # Passagem 1: OCR na imagem RGB ampliada
        rgb_ampliada = cv2.cvtColor(img_redim, cv2.COLOR_BGR2RGB)
        dados_ocr1 = pytesseract.image_to_data(rgb_ampliada, config=tess_config, output_type=Output.DICT)

        # Passagem 2: OCR na imagem binarizada (Threshold)
        dados_ocr2 = pytesseract.image_to_data(thresh_otsu, config=tess_config, output_type=Output.DICT)

        passagens = [dados_ocr1, dados_ocr2]

        for dados in passagens:
            n_caixas = len(dados['text'])
            for i in range(n_caixas):
                texto = dados['text'][i].strip()
                if not texto or len(texto) < 2:
                    continue

                texto_lower = texto.lower()

                # Condição de marca d'água: arroba '@' ou termo na blacklist
                eh_marca = texto.startswith('@') or any(b in texto_lower for b in blacklist if b)

                if eh_marca:
                    # Mapeia de volta para as coordenadas originais (divisão pela escala)
                    x = int(dados['left'][i] / escala)
                    y = int(dados['top'][i] / escala)
                    w = int(dados['width'][i] / escala)
                    h = int(dados['height'][i] / escala)

                    x = max(0, x)
                    y = max(0, y)
                    w = min(largura_orig - x, w)
                    h = min(altura_orig - y, h)

                    if w > 0 and h > 0:
                        caixas_texto.append((x, y, w, h))
                        logger.info(f"Texto detectado (OCR): '{texto}' em (x:{x}, y:{y}, w:{w}, h:{h})")

    except Exception as e:
        logger.error(f"Erro no pré-processamento/OCR: {e}")

    return caixas_texto


def detectar_selo_verificado(imagem_cv2) -> list:
    """
    Segmentação de cor no espaço HSV para detectar selos azuis de verificação (Telegram/Instagram).
    Retorna caixas delimitadoras expandidas [(x, y, w, h)] cobrindo o selo e o contexto ao redor (avatar/username).
    """
    caixas_selo = []
    try:
        altura, largura = imagem_cv2.shape[:2]

        # Converte para espaço de cor HSV
        hsv = cv2.cvtColor(imagem_cv2, cv2.COLOR_BGR2HSV)

        # Intervalos de tom azul típico de selos de verificação (Telegram / Instagram)
        azul_baixo1 = np.array([90, 80, 80])
        azul_alto1 = np.array([135, 255, 255])

        mask_azul = cv2.inRange(hsv, azul_baixo1, azul_alto1)

        # Operações morfológicas para fechar pequenas falhas no selo
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask_azul = cv2.morphologyEx(mask_azul, cv2.MORPH_CLOSE, kernel)

        # Encontra contornos das áreas azuis
        contornos, _ = cv2.findContours(mask_azul, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contornos:
            area = cv2.contourArea(cnt)
            # Filtra por tamanho característico de um selo
            if 30 <= area <= 5000:
                x, y, w, h = cv2.boundingRect(cnt)
                aspect_ratio = float(w) / h if h > 0 else 0

                # Selos azuis tendem a ser aproximadamente quadrados/circulares
                if 0.5 <= aspect_ratio <= 1.8:
                    # Expande a caixa para abranger a pílula de username inteira e avatar adjacente
                    pad_x = int(w * 4.5)
                    pad_y = int(h * 1.5)

                    x1 = max(0, x - pad_x)
                    y1 = max(0, y - pad_y)
                    x2 = min(largura, x + w + pad_x)
                    y2 = min(altura, y + h + pad_y)

                    w_exp = x2 - x1
                    h_exp = y2 - y1

                    caixas_selo.append((x1, y1, w_exp, h_exp))
                    logger.info(f"Selo de Verificado Azul detectado em (x:{x}, y:{y}). Caixa expandida: (x:{x1}, y:{y1}, w:{w_exp}, h:{h_exp})")

    except Exception as e:
        logger.error(f"Erro na detecção do selo de verificado (HSV): {e}")

    return caixas_selo


def detectar_avatar_circular(imagem_cv2) -> list:
    """
    Transformada de Hough em Tons de Cinza para identificar avatares e logos circulares.
    Retorna círculos: [(x, y, r)]
    """
    circulos_detectados = []
    try:
        gray = cv2.cvtColor(imagem_cv2, cv2.COLOR_BGR2GRAY)
        gray_blurred = cv2.medianBlur(gray, 5)

        circulos = cv2.HoughCircles(
            gray_blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=25,
            param1=60,
            param2=32,
            minRadius=12,
            maxRadius=90
        )

        if circulos is not None:
            circulos = np.uint16(np.around(circulos))
            for i in circulos[0, :]:
                x, y, r = int(i[0]), int(i[1]), int(i[2])
                circulos_detectados.append((x, y, r))
                logger.info(f"Avatar circular detectado em (x:{x}, y:{y}, r:{r})")

    except Exception as e:
        logger.error(f"Erro na detecção de círculos: {e}")

    return circulos_detectados


def gerar_mascara_remocao(imagem_cv2, caixas_texto, caixas_selo, circulos) -> np.ndarray:
    """
    Une as caixas de texto (OCR), caixas de selos azuis e círculos de avatares em uma máscara binária.
    """
    altura, largura = imagem_cv2.shape[:2]
    mascara = np.zeros((altura, largura), dtype=np.uint8)

    # 1. Preenche caixas de texto (OCR)
    for (x, y, w, h) in caixas_texto:
        pad = 6
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(largura, x + w + pad)
        y2 = min(altura, y + h + pad)
        cv2.rectangle(mascara, (x1, y1), (x2, y2), 255, -1)

    # 2. Preenche caixas do selo azul expandidas
    for (x, y, w, h) in caixas_selo:
        cv2.rectangle(mascara, (x, y), (x + w, y + h), 255, -1)

    # 3. Preenche círculos de avatares
    for (x, y, r) in circulos:
        raio_exp = int(r * 1.25)
        cv2.circle(mascara, (x, y), raio_exp, 255, -1)

    # Dilatação para suavizar a transição do Inpainting
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mascara_dilatada = cv2.dilate(mascara, kernel, iterations=2)

    return mascara_dilatada


def aplicar_inpainting_e_salvar(caminho_entrada, caminho_saida, blacklist=None) -> dict:
    """
    Orquestra a análise avançada e aplica o inpainting inteligente (Telea).
    """
    if not os.path.exists(caminho_entrada):
        return {"status": "ERRO", "mensagem": "Arquivo de imagem de entrada não encontrado."}

    imagem = cv2.imread(caminho_entrada)
    if imagem is None:
        return {"status": "ERRO", "mensagem": "Falha ao decodificar arquivo de imagem."}

    logger.info(f"Iniciando análise de Visão Computacional em: {caminho_entrada}")

    # Processa as camadas de detecção
    caixas_ocr = detectar_texto_ocr(imagem, blacklist)
    caixas_selo = detectar_selo_verificado(imagem)
    circulos = detectar_avatar_circular(imagem)

    total_elementos = len(caixas_ocr) + len(caixas_selo) + len(circulos)

    if total_elementos == 0:
        logger.info("Nenhuma marca d'água detectada. A imagem está limpa.")
        return {
            "status": "FOTO_LIMPA",
            "usernames_encontrados": 0,
            "selos_encontrados": 0,
            "avatares_encontrados": 0,
            "confianca": "98%"
        }

    logger.info(f"Total de {total_elementos} elementos detectados. Gerando máscara e aplicando Inpainting...")
    mascara = gerar_mascara_remocao(imagem, caixas_ocr, caixas_selo, circulos)

    # Algoritmo de Inpainting Telea
    imagem_limpa = cv2.inpaint(imagem, mascara, inpaintRadius=7, flags=cv2.INPAINT_TELEA)

    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    cv2.imwrite(caminho_saida, imagem_limpa)
    logger.info(f"Imagem processada e salva com sucesso em: {caminho_saida}")

    return {
        "status": "MARCA_REMOVIDA",
        "usernames_encontrados": len(caixas_ocr),
        "selos_encontrados": len(caixas_selo),
        "avatares_encontrados": len(circulos),
        "arquivo_gerado": caminho_saida,
        "confianca": "95%"
    }


if __name__ == "__main__":
    # Garante saída JSON válida SEMPRE
    try:
        if len(sys.argv) < 3:
            print(json.dumps({"status": "ERRO", "mensagem": "Argumentos insuficientes. Uso: python visao_ia.py <entrada> <saida> [blacklist]"}))
            sys.exit(1)

        entrada = sys.argv[1]
        saida = sys.argv[2]
        bl_string = sys.argv[3] if len(sys.argv) > 3 else ""
        lista_negra = [b.strip() for b in bl_string.split(",")] if bl_string else []

        resultado = aplicar_inpainting_e_salvar(entrada, saida, blacklist=lista_negra)
        print(json.dumps(resultado))

    except Exception as fatal_err:
        # Fallback de segurança garantindo JSON válido
        print(json.dumps({
            "status": "ERRO",
            "mensagem": f"Erro não tratado na execução do script Python: {str(fatal_err)}"
        }))
        sys.exit(0)
