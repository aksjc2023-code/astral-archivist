import { useState, useEffect, useCallback } from 'react';
import { checkPreflight, listVaultItems, PermissionPreflight, VaultItem } from './services/tauriClient';
import { CaptureConsole } from './components/CaptureConsole';
import { VaultGallery } from './components/VaultGallery';
import { EditorWorkspace } from './components/EditorWorkspace';

export function App() {
  const [activeTab, setActiveTab] = useState<'recorder' | 'vault' | 'editor'>('recorder');
  const [preflight, setPreflight] = useState<PermissionPreflight | null>(null);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [selectedEditorItem, setSelectedEditorItem] = useState<VaultItem | null>(null);

  const refreshVault = useCallback(async () => {
    try {
      const items = await listVaultItems();
      setVaultItems(items);
    } catch (err) {
      console.warn('[App] Failed to load vault items:', err);
    }
  }, []);

  useEffect(() => {
    checkPreflight()
      .then((data) => setPreflight(data))
      .catch((e) => console.warn('[App] Preflight failed:', e));
    refreshVault();
  }, [refreshVault]);

  const handleSelectForEdit = (item: VaultItem) => {
    setSelectedEditorItem(item);
    setActiveTab('editor');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#0a0d14',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid #1e293b',
          background: '#0f172a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#6366f1',
              boxShadow: '0 0 10px #6366f1',
            }}
          />
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '0.05em' }}>
            THE ASTRAL ARCHIVIST
          </h1>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#312e81',
              color: '#a5b4fc',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Tauri Desktop v2
          </span>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('recorder')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              background: activeTab === 'recorder' ? '#4f46e5' : '#1e293b',
              color: activeTab === 'recorder' ? '#ffffff' : '#94a3b8',
            }}
          >
            Recorder (B1-B2)
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              background: activeTab === 'vault' ? '#4f46e5' : '#1e293b',
              color: activeTab === 'vault' ? '#ffffff' : '#94a3b8',
            }}
          >
            Vault ({vaultItems.length}) (B3)
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              background: activeTab === 'editor' ? '#4f46e5' : '#1e293b',
              color: activeTab === 'editor' ? '#ffffff' : '#94a3b8',
            }}
          >
            Editor & Export (B4-B5)
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        {activeTab === 'recorder' && (
          <CaptureConsole
            preflight={preflight}
            onSessionArchived={() => {
              refreshVault();
              setActiveTab('vault');
            }}
          />
        )}

        {activeTab === 'vault' && (
          <VaultGallery
            items={vaultItems}
            onRefresh={refreshVault}
            onSelectForEdit={handleSelectForEdit}
          />
        )}

        {activeTab === 'editor' && (
          <EditorWorkspace selectedItem={selectedEditorItem} />
        )}
      </main>
    </div>
  );
}

export default App;
