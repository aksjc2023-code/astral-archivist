import { useState } from 'react';

export function App() {
  const [activeTab, setActiveTab] = useState<'recorder' | 'vault' | 'editor'>('recorder');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0d14', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Bar */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#6366f1', boxShadow: '0 0 10px #6366f1' }} />
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '0.05em' }}>THE ASTRAL ARCHIVIST</h1>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: '#312e81', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 600 }}>Tauri Desktop</span>
        </div>
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
              color: activeTab === 'recorder' ? '#ffffff' : '#94a3b8'
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
              color: activeTab === 'vault' ? '#ffffff' : '#94a3b8'
            }}
          >
            Vault (B3)
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
              color: activeTab === 'editor' ? '#ffffff' : '#94a3b8'
            }}
          >
            Editor & Export (B4-B5)
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {activeTab === 'recorder' && (
          <div style={{ maxWidth: '800px', margin: '0 auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Capture Console</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 20px 0' }}>
              Desktop screen, application window, microphone audio and webcam picture-in-picture recording pipeline.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div style={{ padding: '16px', border: '1px solid #334155', borderRadius: '8px', background: '#1e293b' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Display Source</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Screen or Application Window</p>
              </div>
              <div style={{ padding: '16px', border: '1px solid #334155', borderRadius: '8px', background: '#1e293b' }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '15px' }}>Audio & Webcam</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Microphone + Toggleable PIP</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button style={{ padding: '10px 20px', borderRadius: '8px', background: '#e11d48', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                Start Recording
              </button>
              <button style={{ padding: '10px 20px', borderRadius: '8px', background: '#334155', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                Invisible Notes (A3)
              </button>
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>Persistent Archive Vault</h2>
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>App-Data Native Vault</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              <div style={{ border: '1px dashed #334155', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                No recordings in vault yet. Complete a recording session to archive.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'editor' && (
          <div style={{ maxWidth: '1100px', margin: '0 auto', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '20px', margin: '0 0 12px 0' }}>Editor & Concat Pipeline</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 20px 0' }}>
              Non-destructive trimming, clip re-ordering, mute controls, word-level ripple editing, and native FFmpeg export.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
export default App;
