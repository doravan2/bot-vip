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

  // Helper to ensure groups have 100% unique IDs and names
  const deduplicateGroups = (list: GroupChannel[]): GroupChannel[] => {
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const result: GroupChannel[] = [];
    for (const g of list) {
      if (!g || !g.name) continue;
      const cleanId = String(g.id || '').trim();
      const cleanName = String(g.name || '').trim().toLowerCase();
      if (cleanId && seenIds.has(cleanId)) continue;
      if (cleanName && seenNames.has(cleanName)) continue;
      if (cleanId) seenIds.add(cleanId);
      if (cleanName) seenNames.add(cleanName);
      result.push(g);
    }
    return result;
  };

  // Groups list (persisted in localStorage)
  const [groups, setGroups] = useState<GroupChannel[]>(() => {
    try {
      const saved = localStorage.getItem('bot_vip_groups');
      const parsed = saved ? JSON.parse(saved) : [];
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const result: GroupChannel[] = [];
      for (const g of parsed) {
        if (!g || !g.name) continue;
        const cleanId = String(g.id || '').trim();
        const cleanName = String(g.name || '').trim().toLowerCase();
        if (cleanId && seenIds.has(cleanId)) continue;
        if (cleanName && seenNames.has(cleanName)) continue;
        if (cleanId) seenIds.add(cleanId);
        if (cleanName) seenNames.add(cleanName);
        result.push(g);
      }
      return result;
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
            const cleanPrev = prev.filter(
              (g) => g.platform !== 'Telegram' || (!g.name.toLowerCase().includes('_bot') && !g.id.startsWith('tg-bot-'))
            );
            const nonTg = cleanPrev.filter((g) => g.platform !== 'Telegram');
            return [...nonTg, ...tgList];
          });
        }
      })
      .catch(() => {});
  }, []);

  // Save sources to localStorage and sync with server for live background listener
  useEffect(() => {
    try {
      localStorage.setItem('bot_vip_sources', JSON.stringify(sourceGroups));
      fetch('/api/replica/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: sourceGroups }),
      }).catch(() => {});
    } catch {}
  }, [sourceGroups]);

  // On mount, if local storage is empty, check if backend has rules
  useEffect(() => {
    if (sourceGroups.length === 0) {
      fetch('/api/replica/rules')
        .then((res) => res.json())
        .then((data) => {
          if (data.rules && Array.isArray(data.rules) && data.rules.length > 0) {
            setSourceGroups(data.rules);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Sync WhatsApp Connection Status with Server
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
      const res = await fetch('/api/whatsapp/groups');
      if (res.ok) {
        const data = await res.json();
        if (data.groups && Array.isArray(data.groups) && data.groups.length > 0) {
          setGroups((prev) => {
            const combined: GroupChannel[] = [...prev];
            for (const realGrp of data.groups) {
              combined.push({
                id: realGrp.id || `grp-${Date.now()}-${Math.random()}`,
                instanceId: targetInstId,
                name: realGrp.name,
                platform: 'WhatsApp',
                inviteLink: realGrp.inviteLink || 'https://chat.whatsapp.com/',
                membersCount: realGrp.membersCount || 1,
                maxCapacity: 1024,
                isActive: true,
                autoRotate: true,
                dispatchesToday: 0,
              });
            }
            return deduplicateGroups(combined);
          });
        }
      }

      // 2. Sync WhatsApp Channels (Newsletters)
      const resChan = await fetch('/api/whatsapp/canais');
      if (resChan.ok) {
        const dataChan = await resChan.json();
        if (dataChan.channels && Array.isArray(dataChan.channels) && dataChan.channels.length > 0) {
          setGroups((prev) => {
            const combined: GroupChannel[] = [...prev];
            for (const realChan of dataChan.channels) {
              combined.push({
                id: realChan.id || `chan-${Date.now()}-${Math.random()}`,
                instanceId: targetInstId,
                name: realChan.name,
                platform: 'WhatsApp',
                type: 'channel',
                inviteLink: realChan.inviteLink || 'https://whatsapp.com/channel/',
                membersCount: realChan.membersCount || 1000,
                maxCapacity: 1000000,
                isActive: true,
                autoRotate: false,
                dispatchesToday: 0,
              });
            }
            return deduplicateGroups(combined);
          });
        }
      }
    } catch (e) {
      console.error('Erro ao sincronizar grupos e canais:', e);
    }
  };

  // Group Actions
  const handleToggleGroupActive = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, isActive: !g.isActive } : g))
    );
  };

  const handleToggleAutoRotate = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, autoRotate: !g.autoRotate } : g))
    );
  };

  const handleDeleteGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handleAddGroup = (newGrp: GroupChannel) => {
    setGroups((prev) => deduplicateGroups([...prev, newGrp]));
  };

  const handleAddGroups = (newGrps: GroupChannel[]) => {
    setGroups((prev) => deduplicateGroups([...prev, ...newGrps]));
  };

  // Source Group Actions
  const handleAddSourceGroup = (newSource: SourceGroup) => {
    setSourceGroups((prev) => [...prev, newSource]);
  };

  const handleUpdateSourceGroup = (updatedSource: SourceGroup) => {
    setSourceGroups((prev) =>
      prev.map((sg) => (sg.id === updatedSource.id ? updatedSource : sg))
    );
  };

  const handleToggleSourceGroupStatus = (id: string) => {
    setSourceGroups((prev) =>
      prev.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              status: sg.status === 'monitoring' ? 'paused' : 'monitoring',
              autoForward: sg.status !== 'monitoring',
            }
          : sg
      )
    );
  };

  const handleDeleteSourceGroup = (id: string) => {
    setSourceGroups((prev) => prev.filter((sg) => sg.id !== id));
  };

  const handleToggleAutoPhoto = (id: string) => {
    setSourceGroups((prev) =>
      prev.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              autoFetchProductImage: sg.autoFetchProductImage === false ? true : false,
            }
          : sg
      )
    );
  };

  const handleToggleMeliStock = (id: string) => {
    setSourceGroups((prev) =>
      prev.map((sg) =>
        sg.id === id
          ? {
              ...sg,
              validateMeliStock: sg.validateMeliStock === false ? true : false,
            }
          : sg
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#0e0f11] text-neutral-100 flex font-sans selection:bg-[#FF5722]/30">
      {/* Desktop Sidebar (Permanent) */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        isWhatsAppConnected={isWhatsAppConnected}
        isAutomationRunning={true}
        className="hidden lg:flex"
      />

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative w-72 bg-[#121214] h-full z-10 flex flex-col shadow-2xl">
            <div className="p-4 flex justify-between items-center border-b border-[#22242a]">
              <span className="font-extrabold text-white text-base">Menu • chat bot</span>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white"
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

          {/* TAB 3: Conexões */}
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

          {/* TAB 4: Fontes */}
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

          {/* TAB 5: Replica Chat */}
          {currentTab === 'replica-chat' && (
            <ReplicaChatPanel
              groups={groups}
              vipGroupLink={vipGroupLink}
              onUpdateVipGroupLink={handleUpdateVipGroupLink}
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
