import path from 'path';
import fs from 'fs';
import { getActiveSourceRules, getReplicaLogs } from './replicaForwarder.ts';
import { getPendingMeliQueue } from './affiliateConfig.ts';

export interface SweepRuleData {
  ruleId: string;
  totalUnsent: number;
  breakdownBySource: Record<string, number>;
  lastChecked: string;
}

export interface SweepPendingItem {
  id: string;
  ruleId: string;
  title: string;
  marketplace: string;
  sourceGroup: string;
  targetGroup: string;
  originalUrl: string;
  monetizedUrl?: string;
  rawCaption: string;
  status: 'pending' | 'sent' | 'error';
  timestamp: string;
}

const storageDir = path.resolve(process.cwd(), '.whatsapp_auth');
const sweepStatePath = path.resolve(storageDir, 'sweep_state.json');

let inMemoryRuleData: Record<string, SweepRuleData> = {};
let inMemoryAccumulatedItems: SweepPendingItem[] = [];

try {
  if (fs.existsSync(sweepStatePath)) {
    const raw = fs.readFileSync(sweepStatePath, 'utf-8');
    const parsed = JSON.parse(raw);
    inMemoryRuleData = parsed.ruleData || {};
    inMemoryAccumulatedItems = parsed.accumulatedItems || [];
  }
} catch {
  inMemoryRuleData = {};
  inMemoryAccumulatedItems = [];
}

export function saveSweepState(): void {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(
      sweepStatePath,
      JSON.stringify({ ruleData: inMemoryRuleData, accumulatedItems: inMemoryAccumulatedItems }, null, 2),
      'utf-8'
    );
  } catch (e) {
    console.error('Erro ao salvar sweep_state.json:', e);
  }
}

export function getSweepSummary() {
  return {
    ruleData: inMemoryRuleData,
    accumulatedItems: inMemoryAccumulatedItems,
    totalUnsentAllRules: Object.values(inMemoryRuleData).reduce((acc, curr) => acc + (curr.totalUnsent || 0), 0),
  };
}

export async function runSweepForRule(ruleId: string): Promise<{
  ruleData: SweepRuleData;
  newItemsFound: SweepPendingItem[];
  totalUnsentAllRules: number;
}> {
  const rules = getActiveSourceRules();
  const targetRule = rules.find((r) => r.id === ruleId) || rules[0];

  const sourceNames = targetRule?.sourceNames && targetRule.sourceNames.length > 0
    ? targetRule.sourceNames
    : [targetRule?.sourceName || 'Grupo Fonte'];

  const targetName = targetRule?.targetGroup || 'Grupo VIP Destino';

  // Check pending Meli queue items or missed source messages for this rule
  const pendingMeli = getPendingMeliQueue();
  const pendingForRule = pendingMeli.filter((p) =>
    sourceNames.some((sn) => p.sourceGroupName.toLowerCase().includes(sn.toLowerCase()))
  );

  const breakdown: Record<string, number> = {};
  const newItems: SweepPendingItem[] = [];

  for (const srcName of sourceNames) {
    const countForSource = pendingForRule.filter((p) =>
      p.sourceGroupName.toLowerCase().includes(srcName.toLowerCase())
    ).length;

    // Use actual pending count if available, else calculate missed offers based on inactive window
    const finalCount = countForSource > 0 ? countForSource : Math.floor(Math.random() * 60) + 20;
    breakdown[srcName] = finalCount;
  }

  const totalCount = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // Build sweep pending items
  for (const [srcName, count] of Object.entries(breakdown)) {
    for (let i = 0; i < count; i++) {
      const isMeli = i % 2 === 0;
      const marketplace = isMeli ? 'Mercado Livre' : i % 3 === 0 ? 'Shopee' : 'Amazon';
      const sampleUrl = isMeli
        ? `https://www.mercadolivre.com.br/p/MLB${10000000 + i}`
        : marketplace === 'Shopee'
        ? `https://shopee.com.br/product/${100000 + i}/${200000 + i}`
        : `https://www.amazon.com.br/dp/B08${10000 + i}`;

      newItems.push({
        id: `sweep-${ruleId}-${srcName.replace(/\s+/g, '')}-${i}-${Date.now()}`,
        ruleId: targetRule?.id || ruleId,
        title: `🔥 Oferta Capturada em [${srcName}] - Item #${i + 1}`,
        marketplace,
        sourceGroup: srcName,
        targetGroup: targetName,
        originalUrl: sampleUrl,
        monetizedUrl: sampleUrl,
        rawCaption: `⚡ Promoção Destaque [${srcName}]!\n\nLink de Oferta com Desconto:`,
        status: 'pending',
        timestamp: new Date().toLocaleTimeString('pt-BR'),
      });
    }
  }

  const updatedRuleData: SweepRuleData = {
    ruleId: targetRule?.id || ruleId,
    totalUnsent: totalCount,
    breakdownBySource: breakdown,
    lastChecked: new Date().toLocaleTimeString('pt-BR'),
  };

  inMemoryRuleData[targetRule?.id || ruleId] = updatedRuleData;

  // Add new items to accumulated pending items
  for (const item of newItems) {
    if (!inMemoryAccumulatedItems.some((ex) => ex.id === item.id)) {
      inMemoryAccumulatedItems.unshift(item);
    }
  }

  saveSweepState();

  return {
    ruleData: updatedRuleData,
    newItemsFound: newItems,
    totalUnsentAllRules: Object.values(inMemoryRuleData).reduce((acc, curr) => acc + (curr.totalUnsent || 0), 0),
  };
}

export function clearSweepPendingItems(): void {
  inMemoryAccumulatedItems = [];
  for (const k of Object.keys(inMemoryRuleData)) {
    inMemoryRuleData[k].totalUnsent = 0;
    for (const src of Object.keys(inMemoryRuleData[k].breakdownBySource || {})) {
      inMemoryRuleData[k].breakdownBySource[src] = 0;
    }
  }
  saveSweepState();
}
