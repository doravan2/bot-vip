import React, { useState, useEffect } from 'react';
import { NavigationTab, WhatsAppInstance, GroupChannel, SourceGroup } from './types/index.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { ReplicaZapModal } from './components/ReplicaZapModal.tsx';
import { MarketplacesPanel } from './components/panels/MarketplacesPanel.tsx';
import { GruposPanel } from './components/panels/GruposPanel.tsx';
import { CanaisPanel } from './components/panels/CanaisPanel.tsx';
import { ConexoesPanel } from './components/panels/ConexoesPanel.tsx';
import { FontesPanel } from './components/panels/FontesPanel.tsx';
import { ReplicaChatPanel } from './components/panels/ReplicaChatPanel.tsx';
import { ConfiguracoesPanel } from './components/panels/ConfiguracoesPanel.tsx';
import {
  OFFICIAL_USER_AFFILIATE_ID,
  OFFICIAL_SOURCE,
  DEFAULT_VIP_GROUP_LINK,
} from './utils/affiliateEngine.ts';
import { X } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('marketplaces');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isReplicaModalOpen, setIsReplicaModalOpen] = useState(false);

  // Global settings
  const [toolId, setToolId] = useState(OFFICIAL_USER_AFFILIATE_ID);
  const [source, setSource] = useState(OFFICIAL_SOURCE);
  const [vipGroupLink, setVipGroupLink] = useState(() => {
    try {
      const saved = localStorage.getItem('bot_vip_link');
      return saved && saved.trim() ? saved.trim() : DEFAULT_VIP_GROUP_LINK;
    } catch {
      return DEFAULT_VIP_GROUP_LINK;
    }
  });

  const handleUpdateVipGroupLink = (link: string) => {
    const cleanLink = link.trim() || DEFAULT_VIP_GROUP_LINK;
    setVipGroupLink(cleanLink);
    try {
      localStorage.setItem('bot_vip_link', cleanLink);
      fetch('/api/settings/vip-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipGroupLink: cleanLink }),
      }).catch(() => {});
    } catch {}
  };

  // Fetch persisted VIP Group Link from Server on Mount
  useEffect(() => {
    fetch('/api/settings/vip-link')
      .then((res) => res.json())
      .then((data) => {
        if (data.vipGroupLink && typeof data.vipGroupLink === 'string') {
          setVipGroupLink(data.vipGroupLink);
          try {
            localStorage.setItem('bot_vip_link', data.vipGroupLink);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Multi-Instance WhatsApp Manager
  const [instances, setInstances] = useState<WhatsAppInstance[]>([
    {
      id: 'inst-1',
      name: 'instancia 1',
      status: 'desconectada',
      createdAt: 'Agora',
    },
  ]);

  // Helper to ensure groups have 100% unique IDs (without dropping groups that share the same display name)
  const deduplicateGroups = (list: GroupChannel[]): GroupChannel[] => {
    const map = new Map<string, GroupChannel>();
    for (const g of list) {
      if (!g || !g.name) continue;
      const key = `${g.platform || 'WhatsApp'}_${String(g.id || g.chatId || g.name).trim()}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, g);
      } else {
        map.set(key, { ...existing, ...g });
      }
    }
    return Array.from(map.values());
  };

  // Groups list (persisted in localStorage)
  const [groups, setGroups] = useState<GroupChannel[]>(() => {
    try {
      const saved = localStorage.getItem('bot_vip_groups');
      const parsed = saved ? JSON.parse(saved) : [];
      return deduplicateGroups(parsed);
    } catch {
      return [];
    }
  });

  // Source Groups for monitoring & forwarding (persisted in localStorage)
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>(() => {
    try {
      const saved = localStorage.getItem('bot_vip_sources');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save groups to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bot_vip_groups', JSON.stringify(groups));
    } catch {}
  }, [groups]);

  // Sync registered Telegram channels with groups state
  useEffect(() => {
    fetch('/api/telegram/channels')
      .then((res) => res.json())
      .then((data) => {
        if (data.channels && Array.isArray(data.channels)) {
          const tgList: GroupChannel[] = data.channels.map((tc: any) => ({
            id: tc.id,
            name: tc.name || tc.chatId,
            platform: 'Telegram',
            chatId: tc.chatId,
            inviteLink: tc.inviteLink || (tc.chatId?.startsWith('@') ? `https://t.me/${tc.chatId.replace(/^@/, '')}` : 'https://t.me/'),
            membersCount: 1500,
            maxCapacity: 200000,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
          }));

          setGroups((prev) => {
            const nonTg = prev.filter((g) => g.platform !== 'Telegram');
            return deduplicateGroups([...nonTg, ...tgList]);
          });
        }
      })
      .catch(() => {});
  }, []);

  // Sync registered rules with sourceGroups state
  useEffect(() => {
    fetch('/api/rules')
      .then((res) => res.json())
      .then((data) => {
        if (data.rules && Array.isArray(data.rules)) {
          const mapped: SourceGroup[] = data.rules.map((r: any) => ({
            id: r.id,
            sourceName: r.sourceName,
            sourceNames: r.sourceNames || [r.sourceName],
            platform: r.platform || 'WhatsApp',
            sourcePlatforms: r.sourcePlatforms || [r.platform || 'WhatsApp'],
            targetGroup: r.targetGroup,
            targetGroups: r.targetGroups || [r.targetGroup],
            targetPlatforms: r.targetPlatforms || ['WhatsApp'],
            targetChatIds: r.targetChatIds || [],
            autoForward: r.autoForward,
            filterCompetitorNames: r.filterCompetitorNames,
            autoFetchProductImage: r.autoFetchProductImage !== false,
            validateMeliStock: r.validateMeliStock !== false,
            onlyMeliDeals: !!r.onlyMeliDeals,
            status: r.status,
            dealsCapturedToday: 0,
            createdAt: 'Agora',
          }));
          setSourceGroups(mapped);
          try {
            localStorage.setItem('bot_vip_sources', JSON.stringify(mapped));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Save sourceGroups to localStorage and sync with backend
  useEffect(() => {
    try {
      localStorage.setItem('bot_vip_sources', JSON.stringify(sourceGroups));
    } catch {}

    if (Array.isArray(sourceGroups) && sourceGroups.length > 0) {
      fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: sourceGroups }),
      }).catch((e) => console.warn('Erro ao sincronizar regras com backend:', e));
    }
  }, [sourceGroups]);

  // Real WhatsApp Connection Status Polling
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          if (data.isConnected) {
            setInstances((prev) =>
              prev.map((inst, index) =>
                index === 0
                  ? {
                      ...inst,
                      status: 'conectada',
                      phoneNumber: data.phoneNumber || '+55 (WhatsApp Conectado)',
                    }
                  : inst
              )
            );
          }
        }
      } catch {}
    };
    checkStatus();
  }, []);

  // Telegram Connection Status Polling
  const [isTelegramConnected, setIsTelegramConnected] = useState(false);
  const [telegramBotUsername, setTelegramBotUsername] = useState('');

  const checkTelegramStatus = async () => {
    try {
      const res = await fetch('/api/telegram/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          const isConn = data.config.status === 'connected';
          setIsTelegramConnected(isConn);
          if (data.config.botInfo?.username) {
            setTelegramBotUsername(data.config.botInfo.username);
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkTelegramStatus();
    const interval = setInterval(checkTelegramStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const isWhatsAppConnected = instances.some((inst) => inst.status === 'conectada');

  // Instance Actions
  const handleAddInstance = () => {
    const nextNumber = instances.length + 1;
    const newInst: WhatsAppInstance = {
      id: `inst-${Date.now()}`,
      name: `instancia ${nextNumber}`,
      status: 'desconectada',
      createdAt: 'Agora',
    };
    setInstances([...instances, newInst]);
  };

  const handleDeleteInstance = (id: string) => {
    setInstances(instances.filter((inst) => inst.id !== id));
    setGroups(groups.filter((g) => g.instanceId !== id));
  };

  const handleUpdateInstance = (id: string, updates: Partial<WhatsAppInstance>) => {
    setInstances((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, ...updates } : inst))
    );
  };

  // Batch Sync All Groups and WhatsApp Channels from Connected Account
  const handleSyncAllGroups = async () => {
    try {
      const targetInstId = instances.find((i) => i.status === 'conectada')?.id || 'inst-1';

      // 1. Sync WhatsApp Groups
      const res = await fetch('/api/whatsapp/groups?force=true');
      if (res.ok) {
        const data = await res.json();
        if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
          const newGroups: GroupChannel[] = data.groups.map((rg: any) => ({
            id: rg.id,
            instanceId: targetInstId,
            name: rg.name,
            platform: 'WhatsApp',
            inviteLink: rg.inviteLink || (rg.id ? `https://chat.whatsapp.com/${rg.id}` : ''),
            membersCount: rg.membersCount || 1,
            maxCapacity: rg.maxCapacity || 1024,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
            type: 'group',
          }));

          setGroups((prev) => {
            const currentNonWaGroups = prev.filter((g) => g.platform !== 'WhatsApp' || g.type === 'channel');
            return deduplicateGroups([...currentNonWaGroups, ...newGroups]);
          });
        }
      }

      // 2. Sync WhatsApp Channels (@newsletter)
      const resChannels = await fetch('/api/whatsapp/canais?force=true');
      if (resChannels.ok) {
        const dataC = await resChannels.json();
        if (dataC.channels && Array.isArray(dataC.channels) && dataC.channels.length > 0) {
          const newChannels: GroupChannel[] = dataC.channels.map((ch: any) => ({
            id: ch.id,
            instanceId: targetInstId,
            name: ch.name,
            platform: 'WhatsApp',
            chatId: ch.id,
            inviteLink: ch.inviteLink || `https://whatsapp.com/channel/${ch.id}`,
            membersCount: ch.subscribersCount || 1,
            maxCapacity: 1000000,
            isActive: true,
            autoRotate: false,
            dispatchesToday: 0,
            type: 'channel',
            subscribersCount: ch.subscribersCount,
          }));

          setGroups((prev) => {
            const otherItems = prev.filter((g) => !(g.platform === 'WhatsApp' && g.type === 'channel'));
            return deduplicateGroups([...otherItems, ...newChannels]);
          });
        }
      }
    } catch (err) {
      console.error('Erro ao sincronizar grupos e canais:', err);
    }
  };

  // Group Channel Actions
  const handleToggleGroupActive = (id: string) => {
    setGroups(
      groups.map((g) => (g.id === id ? { ...g, isActive: !g.isActive } : g))
    );
  };

  const handleToggleAutoRotate = (id: string) => {
    setGroups(
      groups.map((g) => (g.id === id ? { ...g, autoRotate: !g.autoRotate } : g))
    );
  };

  const handleDeleteGroup = (id: string) => {
    setGroups(groups.filter((g) => g.id !== id));
  };

  const handleAddGroup = (group: GroupChannel) => {
    setGroups(deduplicateGroups([...groups, group]));
  };

  const handleAddGroups = (newGroupsList: GroupChannel[]) => {
    setGroups(deduplicateGroups([...groups, ...newGroupsList]));
  };

  // Source Group Actions
  const handleAddSourceGroup = (sourceGroup: SourceGroup) => {
    setSourceGroups([...sourceGroups, sourceGroup]);
  };

  const handleUpdateSourceGroup = (sourceOrId: SourceGroup | string, updates?: Partial<SourceGroup>) => {
    if (typeof sourceOrId === 'string') {
      setSourceGroups(
        sourceGroups.map((sg) => (sg.id === sourceOrId ? { ...sg, ...(updates || {}) } : sg))
      );
    } else {
      setSourceGroups(
        sourceGroups.map((sg) => (sg.id === sourceOrId.id ? { ...sg, ...sourceOrId } : sg))
      );
    }
  };

  const handleToggleSourceGroupStatus = (id: string) => {
    setSourceGroups(
      sourceGroups.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              status: sg.status === 'monitoring' ? 'paused' : 'monitoring',
            }
          : sg
      )
    );
  };

  const handleToggleAutoPhoto = (id: string) => {
    setSourceGroups(
      sourceGroups.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              autoFetchProductImage: sg.autoFetchProductImage !== undefined ? !sg.autoFetchProductImage : false,
            }
          : sg
      )
    );
  };

  const handleToggleMeliStock = (id: string) => {
    setSourceGroups(
      sourceGroups.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              validateMeliStock: sg.validateMeliStock !== undefined ? !sg.validateMeliStock : false,
            }
          : sg
      )
    );
  };

  const handleDeleteSourceGroup = (id: string) => {
    setSourceGroups(sourceGroups.filter((sg) => sg.id !== id));
  };

  return (
    <div className="flex h-screen bg-[#0d0e11] text-[#e1e4ea] overflow-hidden font-sans antialiased">
      {/* Desktop Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        isWhatsAppConnected={isWhatsAppConnected}
        isTelegramConnected={isTelegramConnected}
        telegramBotUsername={telegramBotUsername}
        isAutomationRunning={true}
        className="hidden lg:flex"
      />

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#121214] z-10">
            <div className="absolute top-0 right-0 -mr-12 pt-4">
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-xl text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar
                currentTab={currentTab}
                onTabChange={(tab) => {
                  setCurrentTab(tab);
                  setIsMobileMenuOpen(false);
                }}
                isWhatsAppConnected={isWhatsAppConnected}
                isTelegramConnected={isTelegramConnected}
                telegramBotUsername={telegramBotUsername}
                isAutomationRunning={true}
                className="border-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onOpenReplicaModal={() => setIsReplicaModalOpen(true)}
          toolId={toolId}
          isWhatsAppConnected={isWhatsAppConnected}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* TAB 1: Marketplaces */}
          {currentTab === 'marketplaces' && <MarketplacesPanel />}

          {/* TAB 2: Grupos */}
          {currentTab === 'grupos' && (
            <GruposPanel
              groups={groups}
              instances={instances}
              onToggleGroupActive={handleToggleGroupActive}
              onToggleAutoRotate={handleToggleAutoRotate}
              onDeleteGroup={handleDeleteGroup}
              onAddGroup={handleAddGroup}
              onAddGroups={handleAddGroups}
              onSyncAllGroups={handleSyncAllGroups}
              onAddSourceGroup={handleAddSourceGroup}
              onNavigateToConexoes={() => setCurrentTab('conexoes')}
              onNavigateToFontes={() => setCurrentTab('fontes')}
            />
          )}

          {/* TAB 3: Canais */}
          {currentTab === 'canais' && (
            <CanaisPanel
              groups={groups}
              instances={instances}
              onToggleGroupActive={handleToggleGroupActive}
              onDeleteGroup={handleDeleteGroup}
              onAddGroup={handleAddGroup}
              onSyncAllGroups={handleSyncAllGroups}
              onAddSourceGroup={handleAddSourceGroup}
              onNavigateToFontes={() => setCurrentTab('fontes')}
            />
          )}

          {/* TAB 4: Conexões */}
          {currentTab === 'conexoes' && (
            <ConexoesPanel
              instances={instances}
              onAddInstance={handleAddInstance}
              onDeleteInstance={handleDeleteInstance}
              onUpdateInstance={handleUpdateInstance}
              onSyncAllGroups={handleSyncAllGroups}
              onNavigateToGrupos={() => setCurrentTab('grupos')}
              vipGroupLink={vipGroupLink}
              onUpdateVipGroupLink={handleUpdateVipGroupLink}
            />
          )}

          {/* TAB 5: Fontes */}
          {currentTab === 'fontes' && (
            <FontesPanel
              sourceGroups={sourceGroups}
              groups={groups}
              onAddSourceGroup={handleAddSourceGroup}
              onUpdateSourceGroup={handleUpdateSourceGroup}
              onToggleSourceGroupStatus={handleToggleSourceGroupStatus}
              onToggleAutoPhoto={handleToggleAutoPhoto}
              onToggleMeliStock={handleToggleMeliStock}
              onDeleteSourceGroup={handleDeleteSourceGroup}
              onNavigateToGrupos={() => setCurrentTab('grupos')}
            />
          )}

          {/* TAB 6: Replica Chat */}
          {currentTab === 'replica-chat' && (
            <ReplicaChatPanel
              groups={groups}
              vipGroupLink={vipGroupLink}
              onUpdateVipGroupLink={handleUpdateVipGroupLink}
            />
          )}

          {/* TAB 7: Configurações (Exportar/Baixar JSON de Todas as Abas) */}
          {currentTab === 'configuracoes' && (
            <ConfiguracoesPanel
              groups={groups}
              sourceGroups={sourceGroups}
              vipGroupLink={vipGroupLink}
              onUpdateVipGroupLink={handleUpdateVipGroupLink}
              onImportComplete={() => {
                checkTelegramStatus();
              }}
            />
          )}
        </main>
      </div>

      {/* Replica Zap Instant Modal */}
      <ReplicaZapModal
        isOpen={isReplicaModalOpen}
        onClose={() => setIsReplicaModalOpen(false)}
        toolId={toolId}
        vipGroupLink={vipGroupLink}
        groups={groups}
      />
    </div>
  );
}
