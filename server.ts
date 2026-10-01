import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  monetizeUrl,
  transformMarketplaceUrl,
  processReplicaZap,
  processReplicaZapAsync,
  resolveShortLinkToLongUrl,
  extractMlbId,
  isCompetitorShareUrl,
  isCompetitorInviteLine,
  OFFICIAL_USER_AFFILIATE_ID,
  OFFICIAL_SOURCE,
  DEFAULT_VIP_GROUP_LINK,
} from './src/utils/affiliateEngine.ts';
import {
  getAffiliateSettings,
  updateAffiliateSettings,
  setCustomMeliLink,
  removeCustomMeliLink,
  getPendingMeliQueue,
  removePendingMeliItem,
  getVipGroupLink,
  setVipGroupLink,
} from './src/server/affiliateConfig.ts';
import {
  initBaileysSocket,
  getWhatsAppState,
  disconnectWhatsApp,
  repairWhatsAppSession,
  resetWhatsAppSession,
  getRealWhatsAppGroups,
  getWhatsAppChannels,
  sendDirectReplicaDeal,
  dispatchPendingMeliOffer,
  handleIncomingTelegramMessage,
  executeReplicaPipeline,
} from './src/server/baileysService.ts';
import {
  getActiveSourceRules,
  setActiveSourceRules,
  getReplicaLogs,
  addReplicaLog,
  cleanAndMonetizeCompetitorMessage,
  ActiveSourceRule,
} from './src/server/replicaForwarder.ts';
import {
  recordConversionLog,
  getConversionLogs,
  clearConversionLogs,
} from './src/server/conversionLogger.ts';
import {
  getMarketplacesConfig,
  saveMarketplacesConfig,
  toggleMarketplace,
  testMeliSessionCookies,
  convertMeliLinkViaCookies,
} from './src/server/marketplacesService.ts';
import { fetchProductImageUrl } from './src/server/productImageService.ts';
import {
  expandir_link,
  analisar_produto_meli_com_encurtador,
  analisar_produto_meli,
  validar_link_mercadolivre,
  validarLinkMercadoLivre,
} from './src/server/meliStockValidator.ts';
import {
  converter_link_shopee,
  gerar_link_afiliado_shopee,
  GERAR_LINK_AFILIADO_SHOPEE_DECLARATION,
} from './src/server/shopeeAffiliateService.ts';
import {
  converter_link_amazon,
  testAmazonAssociateTag,
} from './src/server/amazonAffiliateService.ts';
import {
  getTelegramConfig,
  saveTelegramConfig,
  connectTelegramBot,
  disconnectTelegramBot,
  setActiveTelegramBot,
  sendTelegramMessage,
  getTelegramChannels,
  saveTelegramChannels,
  addTelegramChannel,
  removeTelegramChannel,
  cleanTelegramChatId,
  isTelegramTarget,
  resolveTelegramChatId,
  startTelegramPolling,
  stopTelegramPolling,
  isTelegramPollingRunning,
  processTelegramUpdate,
} from './src/server/telegramService.ts';
import {
  getWatermarkConfig,
  saveWatermarkConfig,
  detectWatermarkOnImage,
} from './src/server/watermarkAiService.ts';
import {
  loadChatFilterConfig,
  saveChatFilterConfig,
} from './src/server/chatFilterService.ts';

dotenv.config();

// Suppress transient Baileys Signal decryption logs and rejections
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const fullText = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  if (
    fullText.includes('Bad MAC') ||
    fullText.includes('Failed to decrypt') ||
    fullText.includes('Session error') ||
    fullText.includes('bad mac') ||
    fullText.includes('Cannot derive from empty media key') ||
    fullText.includes('empty media key')
  ) {
    return;
  }
  originalConsoleError(...args);
};

process.on('unhandledRejection', (reason: any) => {
  const msg = String(reason?.message || reason || '');
  if (
    msg.includes('Bad MAC') ||
    msg.includes('Failed to decrypt') ||
    msg.includes('Session error') ||
    msg.includes('Cannot derive from empty media key') ||
    msg.includes('empty media key')
  ) {
    return;
  }
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (err: any) => {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('Bad MAC') ||
    msg.includes('Failed to decrypt') ||
    msg.includes('Session error') ||
    msg.includes('Cannot derive from empty media key') ||
    msg.includes('empty media key')
  ) {
    return;
  }
  console.error('[Uncaught Exception]', err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '10mb' }));

// Start the real Baileys WhatsApp WebSocket on server boot
initBaileysSocket().catch((err) => {
  console.error('[Server] Erro inicial ao iniciar Baileys:', err);
});

// Start continuous Telegram group & channel listening (Telegram -> WhatsApp)
startTelegramPolling().catch((err) => {
  console.warn('[Server] Aviso ao iniciar escuta de canais do Telegram:', err);
});

// Health check route
app.get('/api/health', (_req, res) => {
  const wsState = getWhatsAppState();
  res.json({
    status: 'ok',
    system: 'BOT VIP OFERTAS',
    officialToolId: OFFICIAL_USER_AFFILIATE_ID,
    whatsappConnected: wsState.isConnected,
    timestamp: new Date().toISOString(),
  });
});

// Watermark AI Configuration & Detector Routes
app.get('/api/watermark/config', (_req, res) => {
  res.json({ success: true, config: getWatermarkConfig() });
});

app.post('/api/watermark/config', (req, res) => {
  const updated = saveWatermarkConfig(req.body || {});
  res.json({ success: true, config: updated });
});

// Chat Filter Configuration Routes
app.get('/api/chat-filter/config', (_req, res) => {
  res.json({ success: true, config: loadChatFilterConfig() });
});

app.post('/api/chat-filter/config', (req, res) => {
  const updated = saveChatFilterConfig(req.body || {});
  res.json({ success: true, config: updated });
});

app.post('/api/watermark/detect', async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body || {};
    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'base64Data é obrigatório.' });
    }
    const result = await detectWatermarkOnImage(base64Data, mimeType || 'image/jpeg');
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Erro ao analisar marca d\'água' });
  }
});

// Real WhatsApp Status & QR Code endpoint
app.get('/api/whatsapp/status', async (_req, res) => {
  const wsState = getWhatsAppState();
  if (!wsState.isConnected && !wsState.qrDataUrl) {
    // If not connected and no QR yet, kickstart socket
    initBaileysSocket().catch(console.error);
  }
  return res.json({
    success: true,
    isConnected: wsState.isConnected,
    phoneNumber: wsState.phoneNumber,
    qrDataUrl: wsState.qrDataUrl,
    statusText: wsState.statusText,
    lastUpdated: wsState.lastUpdated,
  });
});

// Fetch QR Code directly
app.get('/api/whatsapp/qr', async (_req, res) => {
  const wsState = getWhatsAppState();
  if (!wsState.isConnected && !wsState.qrDataUrl) {
    await initBaileysSocket().catch(console.error);
  }
  return res.json({
    success: true,
    isConnected: wsState.isConnected,
    phoneNumber: wsState.phoneNumber,
    qrDataUrl: wsState.qrDataUrl,
    statusText: wsState.statusText,
    lastUpdated: wsState.lastUpdated,
  });
});

// Fetch real WhatsApp groups from the authenticated account
app.get('/api/whatsapp/groups', async (_req, res) => {
  try {
    const realGroups = await getRealWhatsAppGroups();
    return res.json({
      success: true,
      groups: realGroups,
      count: realGroups.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao buscar grupos reais do WhatsApp' });
  }
});

// Fetch real WhatsApp channels (@newsletter) from the authenticated account
app.get('/api/whatsapp/canais', async (_req, res) => {
  try {
    const channels = await getWhatsAppChannels();
    return res.json({
      success: true,
      channels,
      count: channels.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao buscar canais do WhatsApp' });
  }
});

// Disconnect WhatsApp session
app.post('/api/whatsapp/disconnect', async (_req, res) => {
  await disconnectWhatsApp();
  await initBaileysSocket().catch(console.error);
  return res.json({ success: true, message: 'Sessão desconectada. Novo QR Code será gerado.' });
});

// Repair WhatsApp cryptographic sessions (cleans desynced sender-keys / Bad MAC files while keeping login)
app.post('/api/whatsapp/repair-session', async (_req, res) => {
  const result = await repairWhatsAppSession();
  return res.json(result);
});

// Reset WhatsApp session completely (cleans all auth files and generates fresh QR Code)
app.post('/api/whatsapp/reset-session', async (_req, res) => {
  const result = await resetWhatsAppSession();
  return res.json(result);
});

// Affiliate multi-marketplace settings endpoints
app.get('/api/affiliate/settings', (_req, res) => {
  return res.json({
    success: true,
    settings: getAffiliateSettings(),
  });
});

app.post('/api/affiliate/settings', (req, res) => {
  const newSettings = req.body;
  if (!newSettings || typeof newSettings !== 'object') {
    return res.status(400).json({ error: 'Configurações inválidas' });
  }
  const updated = updateAffiliateSettings(newSettings);
  return res.json({
    success: true,
    settings: updated,
  });
});

// Dedicated VIP Group Invite Link endpoint
app.get('/api/settings/vip-link', (_req, res) => {
  return res.json({
    success: true,
    vipGroupLink: getVipGroupLink(),
  });
});

app.post('/api/settings/vip-link', (req, res) => {
  const { vipGroupLink } = req.body;
  if (typeof vipGroupLink !== 'string') {
    return res.status(400).json({ error: 'vipGroupLink deve ser uma string' });
  }
  const saved = setVipGroupLink(vipGroupLink);
  return res.json({
    success: true,
    vipGroupLink: saved,
    message: 'Link de convite do grupo VIP salvo com sucesso!',
  });
});

// Resolve short-links to long canonical product URLs endpoint (uses Headless Browser Python engine)
app.get('/api/resolve-link', async (req, res) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'URL é obrigatória' });
    }
    const longUrl = await resolveShortLinkToLongUrl(rawUrl);
    return res.json({
      success: true,
      originalUrl: rawUrl,
      canonicalLongUrl: longUrl,
      longUrl,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao resolver URL' });
  }
});

// Multi-marketplace link monetization & conversion endpoint (resolves short links automatically)
app.post('/api/monetize', async (req, res) => {
  const { url, toolId, source, shopeeAffiliateId, amazonTag, sheinAffiliateId, sheinUniversalLink, aliAppKey, aliTrackingId, temuCode, temuLink } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL é obrigatória' });
  }

  const settings = getAffiliateSettings();
  const mpConfig = getMarketplacesConfig();

  // Resolve short-links (e.g. s.click.aliexpress.com, meli.la, amzn.to, shope.ee) to canonical long product URL first!
  const longUrl = await resolveShortLinkToLongUrl(url);

  const conversion = transformMarketplaceUrl(longUrl, {
    mlToolId: toolId?.trim() || settings.mercadoLivre.toolId,
    mlSource: source?.trim() || settings.mercadoLivre.source,
    mattTool: settings.mercadoLivre.mattTool || '49196513',
    mattWord: settings.mercadoLivre.mattWord || settings.mercadoLivre.toolId || 'sf20250625192813',
    shopeeAffiliateId: shopeeAffiliateId?.trim() || settings.shopee.affiliateId,
    amazonTag: amazonTag?.trim() || settings.amazon.associateTag || mpConfig.amazon?.associateTag,
    sheinAffiliateId: sheinAffiliateId?.trim() || mpConfig.shein?.affiliateId,
    sheinUniversalLink: sheinUniversalLink?.trim() || mpConfig.shein?.affiliateLink,
    aliAppKey: aliAppKey?.trim() || mpConfig.aliexpress?.appKey,
    aliTrackingId: aliTrackingId?.trim() || mpConfig.aliexpress?.trackingId,
    temuCode: temuCode?.trim() || mpConfig.temu?.referralCode,
    temuLink: temuLink?.trim() || mpConfig.temu?.universalLink,
    customMeliLinks: settings.mercadoLivre.customMeliLinks,
    enabledMarketplaces: {
      mercadolivre: mpConfig.mercadoLivre?.enabled !== false,
      shopee: mpConfig.shopee?.enabled !== false,
      amazon: mpConfig.amazon?.enabled !== false,
      shein: mpConfig.shein?.enabled !== false,
      aliexpress: mpConfig.aliexpress?.enabled !== false,
      temu: mpConfig.temu?.enabled !== false,
    },
  });

  return res.json({
    success: true,
    originalUrl: url,
    canonicalLongUrl: longUrl,
    monetizedUrl: conversion.monetizedUrl,
    marketplace: conversion.marketplace,
    platformLabel: conversion.platformLabel,
    trackingIdUsed: conversion.trackingIdUsed,
    methodUsed: conversion.methodUsed,
  });
});

// Mercado Livre Affiliate Hub & Conversion API
app.get('/api/meli/status', (_req, res) => {
  const settings = getAffiliateSettings();
  return res.json({
    success: true,
    hubUrl: 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user',
    linkBuilderUrl: 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
    mandatoryConversionActive: true,
    mercadoLivre: {
      toolId: settings.mercadoLivre.toolId,
      mattTool: settings.mercadoLivre.mattTool || '49196513',
      mattWord: settings.mercadoLivre.mattWord || 'sf20250625192813',
      customMeliLinks: settings.mercadoLivre.customMeliLinks || {},
      sessionCookieConfigured: !!settings.mercadoLivre.sessionCookie,
      botDoAfiliadoApiKeyConfigured: !!settings.mercadoLivre.botDoAfiliadoApiKey,
    },
  });
});

app.post('/api/meli/links', (req, res) => {
  const { mlbId, meliUrl } = req.body;
  if (!mlbId || !meliUrl) {
    return res.status(400).json({ error: 'Código MLB e Link Oficial meli.la são obrigatórios' });
  }
  const cleanUrl = meliUrl.trim();
  if (!cleanUrl.includes('meli.la') && !cleanUrl.includes('mercadolivre.com.br')) {
    return res.status(400).json({ error: 'O link deve ser um link oficial meli.la ou do Mercado Livre' });
  }
  const updated = setCustomMeliLink(mlbId, cleanUrl);
  return res.json({
    success: true,
    message: `Link oficial cadastrado para ${mlbId}!`,
    customMeliLinks: updated.mercadoLivre.customMeliLinks,
  });
});

app.delete('/api/meli/links/:mlbId', (req, res) => {
  const { mlbId } = req.params;
  const updated = removeCustomMeliLink(mlbId);
  return res.json({
    success: true,
    message: `Mapeamento ${mlbId} removido`,
    customMeliLinks: updated.mercadoLivre.customMeliLinks,
  });
});

// Pending Meli conversion queue endpoints
app.get('/api/meli/pending', (_req, res) => {
  return res.json({
    success: true,
    pending: getPendingMeliQueue(),
  });
});

app.post('/api/meli/approve-pending', async (req, res) => {
  try {
    const { id, meliUrl } = req.body;
    if (!id || !meliUrl) {
      return res.status(400).json({ error: 'ID da oferta e Link Oficial meli.la são obrigatórios' });
    }
    const result = await dispatchPendingMeliOffer(id, meliUrl);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao aprovar oferta pendente' });
  }
});

app.delete('/api/meli/pending/:id', (req, res) => {
  const { id } = req.params;
  removePendingMeliItem(id);
  return res.json({ success: true, message: 'Oferta pendente removida da fila' });
});

app.get('/api/meli/logs', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  return res.json({
    success: true,
    logs: getConversionLogs(limit),
  });
});

app.delete('/api/meli/logs', (_req, res) => {
  clearConversionLogs();
  return res.json({
    success: true,
    message: 'Logs de auditoria da API limpos com sucesso.',
  });
});

app.post('/api/meli/convert', async (req, res) => {
  const startTime = Date.now();
  const { url, text } = req.body;
  const targetInput = (url || text || '').trim();

  if (!targetInput) {
    const errorEntry = recordConversionLog({
      durationMs: Date.now() - startTime,
      inputType: 'single_url',
      input: '',
      httpStatus: 400,
      overallStatus: 'ERROR',
      isOfficialMeliShort: false,
      errorMessage: 'URL ou texto da oferta é obrigatório',
      steps: {
        step1_expansion: { status: 'failed', detail: 'Nenhuma entrada fornecida' },
        step2_cleaning: { status: 'skipped' },
        step3_monetization: { status: 'skipped' },
      },
      rawApiResponse: { success: false, error: 'URL ou texto da oferta é obrigatório' },
    });
    return res.status(400).json({ error: 'URL ou texto da oferta é obrigatório', logId: errorEntry.id });
  }

  const settings = getAffiliateSettings();

  try {
    // A) If whole message copy was passed
    if (text || targetInput.includes('\n')) {
      const step1Start = Date.now();
      const result = await cleanAndMonetizeCompetitorMessage(
        targetInput,
        settings.mercadoLivre.toolId,
        DEFAULT_VIP_GROUP_LINK
      );
      const durationMs = Date.now() - startTime;

      const overallStatus = result.isOfficialMeliShort
        ? 'CONVERTED_MELI_LA'
        : result.isMeli
        ? 'PENDING_CATALOG_MAPPING'
        : 'CONVERTED_OTHER_MARKETPLACE';

      const responsePayload = {
        success: true,
        type: 'message' as const,
        durationMs,
        status: overallStatus,
        cleanedCopy: result.cleanedCopy,
        originalUrl: result.originalUrl || '',
        monetizedUrl: result.monetizedUrl || '',
        marketplace: result.marketplace || '',
        methodUsed: result.methodUsed || '',
        isMeli: result.isMeli,
        isOfficialMeliShort: result.isOfficialMeliShort,
        mlbCode: result.mlbId || 'N/D',
        pureProductUrl: result.pureProductUrl || '',
        // Provide step fields so the UI preview doesn't break
        step1_original: result.originalUrl || targetInput,
        step1_expanded: result.pureProductUrl || result.originalUrl || '',
        step2_pureProduct: result.pureProductUrl || '',
        step3_monetized: result.monetizedUrl || '',
        hubUrl: 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user',
        linkBuilderUrl: 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
        steps: {
          step1_expansion: {
            status: 'success' as const,
            detail: 'Expansão de links na cópia da mensagem',
            value: result.originalUrl,
            durationMs: Date.now() - step1Start,
          },
          step2_cleaning: {
            status: 'success' as const,
            detail: 'Remoção de rastreamento e isolamento de MLB',
            value: result.pureProductUrl,
          },
          step3_monetization: {
            status: (result.isOfficialMeliShort ? 'success' : 'pending') as 'success' | 'pending',
            detail: result.methodUsed,
            value: result.monetizedUrl,
          },
        },
      };

      const log = recordConversionLog({
        durationMs,
        inputType: 'deal_message',
        input: targetInput.substring(0, 180),
        httpStatus: 200,
        overallStatus,
        mlbCode: result.mlbId,
        originalUrl: result.originalUrl,
        pureProductUrl: result.pureProductUrl,
        monetizedUrl: result.monetizedUrl,
        isOfficialMeliShort: result.isOfficialMeliShort,
        methodUsed: result.methodUsed,
        trackingIdUsed: settings.mercadoLivre.toolId,
        steps: responsePayload.steps,
        rawApiResponse: responsePayload,
      });

      return res.json({ ...responsePayload, logId: log.id });
    }

    // B) Single URL 3-step conversion:
    if (isCompetitorShareUrl(targetInput)) {
      return res.status(400).json({
        error: 'O link informado pertence a um grupo/canal concorrente ou agregador social (linktr.ee/whatsapp/telegram), e não a um produto de marketplace.',
        isCompetitorShare: true,
      });
    }

    const step1Start = Date.now();
    const resolution = await resolveShortLinkToLongUrl(targetInput);
    const step1Duration = Date.now() - step1Start;

    if (isCompetitorShareUrl(resolution)) {
      return res.status(400).json({
        error: 'O link informado redireciona para um grupo/canal concorrente ou agregador social, e não para um produto de marketplace.',
        isCompetitorShare: true,
      });
    }

    const pureUrl = resolution.split('?')[0].split('#')[0];
    const mlbId = extractMlbId(pureUrl) || extractMlbId(targetInput) || '';

    const conversion = transformMarketplaceUrl(resolution, {
      mlToolId: settings.mercadoLivre.toolId,
      mattTool: settings.mercadoLivre.mattTool || '49196513',
      mattWord: settings.mercadoLivre.mattWord || 'sf20250625192813',
      customMeliLinks: settings.mercadoLivre.customMeliLinks,
    });

    const isMeli = targetInput.includes('meli.la') || resolution.includes('mercadolivre.com.br');
    let finalMonetizedUrl = conversion.monetizedUrl;
    let finalMethodUsed = conversion.methodUsed;
    let isOfficialMeliShort = finalMonetizedUrl.includes('meli.la');

    // Executa o Handshake de 2 Passos (GET CSRF + POST) se for Mercado Livre e ainda não tiver meli.la do usuário
    if (isMeli && !isOfficialMeliShort) {
      try {
        const directRes = await convertMeliLinkViaCookies(targetInput);
        if (directRes?.monetized_url) {
          finalMonetizedUrl = directRes.monetized_url;
          finalMethodUsed = directRes.method || finalMethodUsed;
          isOfficialMeliShort = directRes.is_official_meli_la || finalMonetizedUrl.includes('meli.la');
          if (mlbId && isOfficialMeliShort) {
            setCustomMeliLink(mlbId, finalMonetizedUrl);
          }
        }
      } catch (directErr) {
        console.warn('[Server] Falha na conversão direta com cookies:', directErr);
      }
    }

    const durationMs = Date.now() - startTime;

    const overallStatus = isOfficialMeliShort
      ? 'CONVERTED_MELI_LA'
      : isMeli
      ? 'PENDING_CATALOG_MAPPING'
      : 'CONVERTED_OTHER_MARKETPLACE';

    const steps = {
      step1_expansion: {
        status: 'success' as const,
        detail: resolution === targetInput ? 'URL direta (sem redirecionamentos)' : 'Redirecionamento expandido com sucesso',
        value: resolution,
        durationMs: step1Duration,
      },
      step2_cleaning: {
        status: 'success' as const,
        detail: mlbId ? `Produto identificado: ${mlbId}` : 'URL limpa sem parâmetros de rastreamento',
        value: pureUrl,
      },
      step3_monetization: {
        status: (isOfficialMeliShort ? 'success' : 'pending') as 'success' | 'pending',
        detail: finalMethodUsed,
        value: finalMonetizedUrl,
      },
    };

    const responsePayload = {
      success: true,
      type: 'url' as const,
      durationMs,
      status: overallStatus,
      step1_original: targetInput,
      step1_expanded: resolution,
      step2_pureProduct: pureUrl,
      step3_monetized: finalMonetizedUrl,
      mlbCode: mlbId || 'N/D',
      isMeli,
      isOfficialMeliShort,
      methodUsed: finalMethodUsed,
      trackingIdUsed: conversion.trackingIdUsed,
      hubUrl: 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true#menu-user',
      linkBuilderUrl: 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub',
      steps,
    };

    const log = recordConversionLog({
      durationMs,
      inputType: 'single_url',
      input: targetInput,
      httpStatus: 200,
      overallStatus,
      mlbCode: mlbId || undefined,
      originalUrl: targetInput,
      pureProductUrl: pureUrl,
      monetizedUrl: finalMonetizedUrl,
      isOfficialMeliShort,
      methodUsed: finalMethodUsed,
      trackingIdUsed: conversion.trackingIdUsed,
      steps,
      rawApiResponse: responsePayload,
    });

    return res.json({ ...responsePayload, logId: log.id });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err?.message || 'Falha ao converter link do Mercado Livre';

    const log = recordConversionLog({
      durationMs,
      inputType: 'single_url',
      input: targetInput,
      httpStatus: 500,
      overallStatus: 'ERROR',
      isOfficialMeliShort: false,
      errorMessage: errorMsg,
      steps: {
        step1_expansion: { status: 'failed', detail: errorMsg, durationMs },
        step2_cleaning: { status: 'skipped' },
        step3_monetization: { status: 'skipped' },
      },
      rawApiResponse: { success: false, error: errorMsg, durationMs },
    });

    return res.status(500).json({
      success: false,
      error: errorMsg,
      durationMs,
      status: 'ERROR',
      logId: log.id,
    });
  }
});

// Replica Zap processing endpoint (resolves short-links and converts via Cookies API)
app.post('/api/replica-zap', async (req, res) => {
  try {
    const { input, toolId, vipGroupLink } = req.body;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Texto ou link é obrigatório' });
    }

    const tid = toolId?.trim() || OFFICIAL_USER_AFFILIATE_ID;
    const groupLink = vipGroupLink?.trim() || getVipGroupLink() || DEFAULT_VIP_GROUP_LINK;

    const processed = await cleanAndMonetizeCompetitorMessage(input, tid, groupLink);

    return res.json({
      success: true,
      shouldForward: processed.shouldForward,
      blockReason: processed.blockReason,
      deal: {
        title: input.split('\n')[0] || 'Produto em Oferta',
        currentPrice: '0,00',
        productUrl: processed.monetizedUrl || processed.originalUrl,
        vipGroupLink: groupLink,
      },
      formattedCopy: processed.cleanedCopy,
      competitorDetected: processed.originalUrl,
      linkResult: {
        originalUrl: processed.originalUrl,
        monetizedUrl: processed.monetizedUrl,
        marketplace: processed.marketplace,
        platformLabel: processed.marketplace,
        trackingIdUsed: tid,
        methodUsed: processed.methodUsed,
      },
      toolId: tid,
    });
  } catch (error: any) {
    console.error('Erro no processamento do Replica Zap:', error);
    return res.status(500).json({ error: 'Falha interna ao processar oferta' });
  }
});

// Get active source monitoring rules
app.get('/api/replica/rules', (_req, res) => {
  return res.json({
    success: true,
    rules: getActiveSourceRules(),
  });
});

// Update / sync active source monitoring rules
app.post('/api/replica/rules', (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Array de regras é obrigatório' });
  }
  setActiveSourceRules(rules);
  return res.json({
    success: true,
    rules: getActiveSourceRules(),
  });
});

// Get automated replica logs
app.get('/api/replica/logs', (_req, res) => {
  return res.json({
    success: true,
    logs: getReplicaLogs(),
  });
});

// Simulate incoming deal from either WhatsApp or Telegram source
app.post('/api/replica/simulate-incoming', async (req, res) => {
  try {
    const { sourceName, rawText, imageUrl } = req.body || {};
    const rules = getActiveSourceRules();
    const cleanSrcName = (sourceName || '').toLowerCase().trim();

    const matchedRule = rules.find((r) => {
      const candidates = [r.sourceName, ...(Array.isArray(r.sourceNames) ? r.sourceNames : [])]
        .flatMap((s) => s.split(','))
        .map((s) => s.trim().toLowerCase());
      return candidates.some((c) => c === cleanSrcName || c.includes(cleanSrcName) || cleanSrcName.includes(c));
    }) || rules[0];

    if (!matchedRule) {
      return res.status(400).json({ success: false, error: 'Nenhuma regra de monitoramento encontrada.' });
    }

    const isTelegramSource =
      matchedRule.platform === 'Telegram' ||
      matchedRule.sourcePlatforms?.includes('Telegram') ||
      cleanSrcName.includes('telegram') ||
      cleanSrcName.startsWith('@');

    let imageBuffer: Buffer | null = null;
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          imageBuffer = Buffer.from(ab);
        }
      } catch {}
    }

    if (isTelegramSource) {
      const result = await handleIncomingTelegramMessage({
        rawText: rawText || '🔥 Oferta Teste Telegram: https://www.mercadolivre.com.br/p/MLB12345678',
        imageBuffer,
        chatId: matchedRule.sourceJid || '@telegram_fonte',
        chatTitle: sourceName || matchedRule.sourceName,
      });
      return res.json(result);
    } else {
      const result = await executeReplicaPipeline({
        matchedRule,
        rawCaption: rawText || '🔥 Oferta Teste WhatsApp: https://www.mercadolivre.com.br/p/MLB12345678',
        imageBuffer,
        sourceDisplayTitle: sourceName || matchedRule.sourceName,
        sourcePlatform: 'WhatsApp',
      });
      return res.json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao simular mensagem de entrada.' });
  }
});

// Marketplaces Credentials & Direct Cookies API
app.get('/api/marketplaces/config', (_req, res) => {
  return res.json({
    success: true,
    config: getMarketplacesConfig(),
  });
});

app.post('/api/marketplaces/config', (req, res) => {
  try {
    const updated = saveMarketplacesConfig(req.body);
    if (req.body?.amazon?.associateTag || req.body?.amazon?.tagId) {
      const amzTag = (req.body.amazon.associateTag || req.body.amazon.tagId).trim();
      updateAffiliateSettings({
        amazon: {
          ...getAffiliateSettings().amazon,
          associateTag: amzTag,
          enabled: req.body.amazon.enabled !== false,
        },
      });
    }
    return res.json({
      success: true,
      message: 'Configurações de Marketplaces salvas com sucesso!',
      config: updated,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao salvar configurações' });
  }
});

app.post('/api/marketplaces/toggle', (req, res) => {
  try {
    const { marketplace, enabled } = req.body;
    if (!marketplace || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Marketplace e status enabled (boolean) são obrigatórios' });
    }
    const updated = toggleMarketplace(marketplace, enabled);
    return res.json({
      success: true,
      marketplace,
      enabled,
      config: updated,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao alternar status do marketplace' });
  }
});

app.post('/api/marketplaces/test-meli', async (_req, res) => {
  try {
    const result = await testMeliSessionCookies();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err?.message || 'Erro ao testar cookies do Mercado Livre',
      cookieCount: 0,
    });
  }
});

app.post('/api/marketplaces/convert-direct', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL do produto é obrigatória' });
  }

  try {
    const result = await convertMeliLinkViaCookies(url.trim());
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha na conversão direta via cookies' });
  }
});

// Extract product image URL directly from any product link
app.post('/api/replica/extract-image', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL do produto é obrigatória' });
  }

  try {
    const imageUrl = await fetchProductImageUrl(url.trim());
    return res.json({
      success: !!imageUrl,
      imageUrl: imageUrl || null,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha ao extrair imagem do produto' });
  }
});

// Endpoint unificado para análise de produto Mercado Livre (Estoque + Foto)
app.post('/api/replica/analisar-produto-meli', async (req, res) => {
  try {
    const text = req.body?.text || req.body?.mensagem || req.body?.caption || '';
    const result = await analisar_produto_meli(text);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ valido: false, foto_url: null, error: err?.message });
  }
});

// Alias para compatibilidade com interface existente
app.post('/api/replica/validate-meli-stock', async (req, res) => {
  try {
    const text = req.body?.text || req.body?.mensagem || '';
    const result = await analisar_produto_meli(text);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ valido: false, foto_url: null, error: err?.message });
  }
});

// Endpoint para expandir qualquer link encurtado (meli.la, bit.ly, etc.)
app.post('/api/replica/expandir-link', async (req, res) => {
  try {
    const url = req.body?.url || req.body?.link || '';
    const urlFinal = await expandir_link(url);
    return res.json({ urlOriginal: url, urlFinal });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

// Endpoint para análise de produto Mercado Livre com expansão automática de encurtador
app.post('/api/replica/analisar-produto-meli-com-encurtador', async (req, res) => {
  try {
    const text = req.body?.text || req.body?.mensagem || '';
    const result = await analisar_produto_meli_com_encurtador(text);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ valido: false, foto_url: null, error: err?.message });
  }
});

// Endpoint para conversão oficial Shopee GraphQL (SHA-256)
app.post('/api/marketplaces/shopee/convert', async (req, res) => {
  try {
    const url = req.body?.url || req.body?.url_produto || '';
    if (!url) {
      return res.status(400).json({ error: 'URL do produto é obrigatória' });
    }
    const shortLink = await converter_link_shopee(url);
    if (shortLink) {
      return res.json({ success: true, shortLink, originalUrl: url });
    } else {
      return res.status(400).json({ success: false, error: 'Falha ao gerar link oficial na Shopee' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Endpoint para conversão oficial Amazon SiteStripe (ASIN + Tag)
app.post('/api/marketplaces/amazon/convert', async (req, res) => {
  try {
    const url = req.body?.url || req.body?.url_produto || '';
    const tag = req.body?.tag || req.body?.associateTag || '';
    if (!url) {
      return res.status(400).json({ error: 'URL do produto é obrigatória' });
    }
    const result = await converter_link_amazon(url, tag);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Endpoint para testar Tag da Amazon Associates
app.post('/api/marketplaces/test-amazon', async (req, res) => {
  try {
    const tag = req.body?.tag || req.body?.associateTag || '';
    const result = await testAmazonAssociateTag(tag);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message });
  }
});

// ============================================================================
// TELEGRAM BOT API ENDPOINTS (@BotFather Integration)
// ============================================================================

app.get('/api/telegram/config', (_req, res) => {
  try {
    const config = getTelegramConfig();
    return res.json({ success: true, config });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/config', (req, res) => {
  try {
    const { botToken, defaultChatId } = req.body;
    const updated = saveTelegramConfig({
      ...(typeof botToken === 'string' ? { botToken: botToken.trim() } : {}),
      ...(typeof defaultChatId === 'string' ? { defaultChatId: defaultChatId.trim() } : {}),
    });
    return res.json({ success: true, config: updated, message: 'Configuração do Telegram salva!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/connect', async (req, res) => {
  try {
    const { botToken, defaultChatId } = req.body;
    if (!botToken || typeof botToken !== 'string') {
      return res.status(400).json({ success: false, error: 'Token do BotFather é obrigatório.' });
    }
    const result = await connectTelegramBot(botToken, defaultChatId);
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao conectar bot do Telegram.' });
  }
});

app.post('/api/telegram/disconnect', (req, res) => {
  try {
    const { botId } = req.body || {};
    const updated = disconnectTelegramBot(botId);
    return res.json({ success: true, config: updated, message: botId ? 'Bot desconectado com sucesso.' : 'Todos os bots desconectados.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/set-active-bot', (req, res) => {
  try {
    const { botId } = req.body || {};
    if (!botId) {
      return res.status(400).json({ success: false, error: 'botId é obrigatório.' });
    }
    const updated = setActiveTelegramBot(botId);
    return res.json({ success: true, config: updated, message: 'Bot ativo atualizado com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/test-send', async (req, res) => {
  try {
    const { chatId, text, imageUrl } = req.body;
    const messageText = text || '🚀 Teste de conexão do BOT VIP OFERTAS com Telegram!';
    const result = await sendTelegramMessage(chatId, messageText, imageUrl);
    if (result.success) {
      return res.json({ success: true, message: 'Mensagem de teste enviada com sucesso ao Telegram!', result });
    } else {
      return res.status(400).json({ success: false, error: result.error || 'Falha ao enviar mensagem de teste no Telegram.' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao enviar mensagem para o Telegram.' });
  }
});

// Channels endpoints (Matches Image 2 in Grupos tab)
app.get('/api/telegram/channels', (_req, res) => {
  try {
    const channels = getTelegramChannels();
    return res.json({ success: true, channels });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/channels', (req, res) => {
  try {
    const { channels } = req.body;
    if (!Array.isArray(channels)) {
      return res.status(400).json({ success: false, error: 'channels deve ser um array.' });
    }
    const saved = saveTelegramChannels(channels);
    return res.json({ success: true, channels: saved, message: 'Canais do Telegram salvos com sucesso!' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

app.post('/api/telegram/channels/add', async (req, res) => {
  try {
    const { input, name } = req.body;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ success: false, error: 'ID ou @username do grupo/canal é obrigatório.' });
    }
    const result = await addTelegramChannel(input, name);
    if (result.success) {
      return res.json({ success: true, channel: result.channel, channels: getTelegramChannels(), message: 'Canal do Telegram adicionado com sucesso!' });
    } else {
      return res.status(400).json({ success: false, error: result.error || 'Falha ao adicionar canal do Telegram.' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao adicionar canal.' });
  }
});

app.delete('/api/telegram/channels/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updated = removeTelegramChannel(id);
    return res.json({ success: true, channels: updated, message: 'Canal do Telegram removido com sucesso.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Telegram Polling Listener status & controls
app.get('/api/telegram/polling-status', (_req, res) => {
  const status = isTelegramPollingRunning();
  const config = getTelegramConfig();
  return res.json({
    success: true,
    ...status,
    botConnected: config.status === 'connected',
    activeBotUsername: config.botInfo?.username,
  });
});

app.post('/api/telegram/polling/start', async (_req, res) => {
  await startTelegramPolling();
  return res.json({ success: true, message: 'Escuta de mensagens do Telegram iniciada com sucesso!' });
});

app.post('/api/telegram/polling/stop', (_req, res) => {
  stopTelegramPolling();
  return res.json({ success: true, message: 'Escuta de mensagens do Telegram pausada.' });
});

// Telegram Official Webhook receiver (optional alternative to polling)
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const update = req.body;
    const result = await processTelegramUpdate(update);
    return res.json(result);
  } catch (err: any) {
    console.error('[Telegram Webhook] Erro ao processar:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Simulate Telegram message incoming (Telegram -> WhatsApp manual test)
app.post('/api/telegram/simulate-incoming', async (req, res) => {
  try {
    const { rawText, chatTitle, chatId, chatUsername, imageUrl } = req.body || {};
    let imageBuffer: Buffer | null = null;

    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      try {
        const fetchRes = await fetch(imageUrl);
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          imageBuffer = Buffer.from(ab);
        }
      } catch (imgErr) {
        console.warn('[Telegram Simulate] Aviso ao baixar imagem de teste:', imgErr);
      }
    }

    const result = await handleIncomingTelegramMessage({
      rawText: rawText || '🔥 Oferta Teste Telegram: https://www.mercadolivre.com.br/p/MLB12345678',
      imageBuffer,
      chatId: chatId || '@atacadogameofertas',
      chatTitle: chatTitle || 'Atacado Game Ofertas',
      chatUsername: chatUsername || 'atacadogameofertas',
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Endpoint Tool Calling para Google AI Studio / Gemini
app.post('/api/tools/gerar-link-afiliado-shopee', async (req, res) => {
  try {
    const url_produto = req.body?.url_produto || req.body?.url || '';
    const result = await gerar_link_afiliado_shopee({ url_produto });
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ erro: err?.message || 'Falha na conversão, cancele a postagem' });
  }
});

// Endpoint para retornar o schema da ferramenta no AI Studio
app.get('/api/tools/shopee-declaration', (req, res) => {
  return res.json(GERAR_LINK_AFILIADO_SHOPEE_DECLARATION);
});

// Direct test send to destination group with optional image
app.post('/api/replica/send-test', async (req, res) => {
  const { targetGroup, copy, imageUrl, autoFetchImage } = req.body;
  if (!targetGroup || !copy) {
    return res.status(400).json({ error: 'Grupo de destino e texto são obrigatórios' });
  }

  const result = await sendDirectReplicaDeal({
    targetGroupNameOrJid: targetGroup,
    copy,
    imageUrl,
    autoFetchImage: autoFetchImage !== false,
  });

  if (result.success) {
    return res.json(result);
  } else {
    return res.status(400).json(result);
  }
});

// Simulate incoming message to test automated pipeline
app.post('/api/replica/simulate-incoming', async (req, res) => {
  try {
    const { sourceName, rawText, imageUrl } = req.body;
    const allRules = getActiveSourceRules();
    let rules = allRules.filter((r) => r.status === 'monitoring' && r.autoForward);
    if (rules.length === 0 && allRules.length > 0) {
      rules = allRules;
    }

    const matchedRule = rules.find((r) => {
      if (!sourceName) return true;
      const cleanRule = r.sourceName.replace(/^\[FONTE\]\s*/i, '').trim().toLowerCase();
      const cleanIn = sourceName.trim().toLowerCase();
      return cleanIn.includes(cleanRule) || cleanRule.includes(cleanIn);
    }) || rules[0];

    if (!matchedRule) {
      return res.status(400).json({
        error: 'Nenhuma regra de fonte ativa encontrada. Crie uma fonte primeiro na aba Grupos!',
      });
    }

    // =========================================================
    // CHECAGEM ÚNICA (ESTOQUE + FOTO) - analisar_produto_meli
    // =========================================================
    const mensagem_veio_com_foto = !!imageUrl;
    let foto_para_enviar: string | null = imageUrl || null;

    const isMeliMessage =
      /MLB[-]?\d+/i.test(rawText || '') ||
      /meli\.la/i.test(rawText || '') ||
      /mercadolivre\.com\.br/i.test(rawText || '');

    if (matchedRule.validateMeliStock !== false && (isMeliMessage || matchedRule.onlyMeliDeals)) {
      // 1. Fazemos a checagem única (Estoque + Foto)
      const dados_produto = await analisar_produto_meli(rawText || '');

      // 2. Verifica se é lixo/esgotado
      if (!dados_produto.valido) {
        console.log("Produto esgotado ou pausado. Ignorando...");
        addReplicaLog({
          id: `sim-skip-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          sourceGroupName: matchedRule.sourceName,
          targetGroupName: matchedRule.targetGroup,
          originalText: rawText || '',
          finalCaption: '',
          hasImage: !!imageUrl,
          imageSource: 'none',
          status: 'error',
          errorMessage: dados_produto.motivo || 'Produto esgotado ou pausado. Ignorando...',
        });
        return res.json({
          success: false,
          skipped: true,
          reason: 'Produto esgotado ou pausado. Ignorando...',
          message: dados_produto.motivo || 'Produto esgotado ou pausado. Ignorando...',
        });
      }

      // 3. A regra da Foto
      if (mensagem_veio_com_foto) {
        console.log("O grupo já mandou com foto. Vamos usar a foto original deles.");
        foto_para_enviar = imageUrl;
      } else {
        console.log("O grupo mandou só texto! Pegando a foto limpa direto do Mercado Livre...");
        foto_para_enviar = dados_produto.foto_url;
      }

      console.log(`Pronto para postar! Foto a ser usada: ${foto_para_enviar || 'nenhuma'}`);
    }

    const targetInviteLink = req.body?.vipGroupLink?.trim() || getVipGroupLink() || DEFAULT_VIP_GROUP_LINK;

    const processed =
      await cleanAndMonetizeCompetitorMessage(
        rawText || '',
        OFFICIAL_USER_AFFILIATE_ID,
        targetInviteLink
      );

    if (!processed.shouldForward) {
      addReplicaLog({
        id: `sim-skip-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: matchedRule.sourceName,
        targetGroupName: matchedRule.targetGroup,
        originalText: rawText || '',
        finalCaption: '',
        hasImage: !!imageUrl,
        imageSource: 'none',
        originalUrl: processed.originalUrl,
        monetizedUrl: '',
        marketplace: processed.marketplace || 'Desconhecido',
        methodUsed: 'Filtro de Conexões Ativas',
        status: 'skipped',
        errorMessage: processed.blockReason || 'Marketplace desativado nas conexões.',
      });
      return res.json({
        success: false,
        skipped: true,
        reason: processed.blockReason || 'Marketplace desativado nas conexões.',
        message: processed.blockReason || 'Marketplace desativado nas conexões.',
      });
    }

    const { cleanedCopy, originalUrl, monetizedUrl, marketplace, methodUsed } = processed;

    // Quando o produto NÃO tiver imagem original:
    // Faz toda a conversão e antes de enviar a mensagem espera ele carregar por si só a imagem que o próprio link gera!
    if (!mensagem_veio_com_foto && !foto_para_enviar) {
      const candidateUrl = monetizedUrl || originalUrl;
      if (candidateUrl) {
        console.log(`[Replica Zap] ⏳ Produto sem imagem original. Conversão concluída! Aguardando o próprio link gerar e carregar a imagem: "${candidateUrl}"...`);
        await new Promise((resolve) => setTimeout(resolve, 1800));
        try {
          const loadedImg = await fetchProductImageUrl(candidateUrl);
          if (loadedImg) {
            foto_para_enviar = loadedImg;
            console.log(`[Replica Zap] 📸 Imagem gerada pelo próprio link carregada com sucesso: ${foto_para_enviar}`);
          }
        } catch (err) {
          console.warn('[Replica Zap] Falha ao aguardar imagem gerada pelo link:', err);
        }
      }
    }

    let allTargets: string[] = [];
    if (Array.isArray(matchedRule.targetGroups) && matchedRule.targetGroups.length > 0) {
      allTargets = matchedRule.targetGroups;
    } else if (matchedRule.targetGroup) {
      allTargets = matchedRule.targetGroup.split(',').map((s) => s.trim()).filter(Boolean);
    }

    let atLeastOneSuccess = false;
    const sendResults: string[] = [];

    for (let i = 0; i < allTargets.length; i++) {
      const tgt = allTargets[i];
      if (!tgt) continue;
      const platformHint = matchedRule.targetPlatforms?.[i];
      const isTelegram = isTelegramTarget(tgt, platformHint);

      if (isTelegram) {
        try {
          const directChatId = matchedRule.targetChatIds?.[i];
          const resolvedChat = directChatId || resolveTelegramChatId(tgt);
          console.log(`[Replica Zap] ✈️ Disparando para Telegram: "${tgt}" -> Chat ID: ${resolvedChat}`);
          const tgRes = await sendTelegramMessage(resolvedChat, cleanedCopy, foto_para_enviar || undefined);
          if (tgRes.success) {
            atLeastOneSuccess = true;
            sendResults.push(`Telegram: ${tgt} (${resolvedChat})`);
          } else {
            sendResults.push(`Telegram (${tgt} -> ${resolvedChat}) erro: ${tgRes.error}`);
          }
        } catch (tgErr: any) {
          sendResults.push(`Telegram erro: ${tgErr?.message}`);
        }
      } else {
        const waResult = await sendDirectReplicaDeal({
          targetGroupNameOrJid: tgt,
          copy: cleanedCopy,
          imageUrl: foto_para_enviar || undefined,
          autoFetchImage: matchedRule.autoFetchProductImage !== false,
        });
        if (waResult.success) {
          atLeastOneSuccess = true;
          sendResults.push(`WhatsApp: ${waResult.targetSubject || tgt}`);
        } else {
          sendResults.push(`WhatsApp (${tgt}): ${waResult.message}`);
        }
      }
    }

    if (atLeastOneSuccess) {
      matchedRule.dealsCapturedToday = (matchedRule.dealsCapturedToday || 0) + 1;
      setActiveSourceRules(getActiveSourceRules());

      addReplicaLog({
        id: `sim-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroupName: matchedRule.sourceName,
        targetGroupName: allTargets.join(', '),
        originalText: rawText || '',
        finalCaption: cleanedCopy,
        hasImage: !!imageUrl || !!foto_para_enviar,
        imageSource: imageUrl ? 'source-media' : (foto_para_enviar ? 'auto-link-photo' : 'none'),
        originalUrl,
        monetizedUrl,
        status: 'success',
      });
    }

    return res.json({
      success: atLeastOneSuccess,
      message: `Disparo simulado com sucesso para [${allTargets.join(', ')}]!`,
      targetGroup: allTargets.join(', '),
      cleanedCopy,
      hasImage: !!imageUrl || !!foto_para_enviar,
      details: sendResults,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Falha na simulação' });
  }
});

// Endpoint para testar validação de estoque de link/mensagem do Mercado Livre
app.post('/api/replica/validate-meli-stock', async (req, res) => {
  try {
    const { text } = req.body;
    const resultado = await validarLinkMercadoLivre(text || '');
    return res.json(resultado);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Erro ao validar link' });
  }
});

// Vite middleware for development or static serving for production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BOT VIP OFERTAS Server running on http://0.0.0.0:${PORT}`);
});
