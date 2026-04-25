import React, { useRef, useState } from 'react';
import useStore from '../store/useStore';
import { Upload, Download, Undo, Redo, Plus, MousePointerClick, Trash2, Sun, Moon, Languages } from 'lucide-react';
import { parseSTLWithAttributes, exportSTLWithAttributes } from '../utils/stlParser';
import { processCSG } from '../utils/csgProcessor';

const translations = {
  en: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD Hole Visualization',
    import: 'Import STL',
    export: 'Export STL',
    exporting: 'Exporting...',
    pierce: 'Click on Model to Pierce',
    addChannel: 'Add Channel',
    diameter: 'Diameter',
    holes: 'Holes List',
    hole: 'Hole',
    undo: 'Undo',
    redo: 'Redo',
    version: 'v1.0.2 Stable',
    disclaimer: 'Dental visualization tool. Always verify final STL model before production!',
    errorImport: 'Failed to read STL file.',
    errorExport: 'Failed to export model.'
  },
  de: {
    title: 'Dental Okklusal-Loch-Tool',
    subtitle: 'CAD-Loch-Visualisierung',
    import: 'STL Importieren',
    export: 'STL Exportieren',
    exporting: 'Exportiere...',
    pierce: 'Klicken Sie zum Durchstechen',
    addChannel: 'Kanal hinzufügen',
    diameter: 'Durchmesser',
    holes: 'Loch-Liste',
    hole: 'Loch',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    version: 'v1.0.2 Stabil',
    disclaimer: 'Dentales Visualisierungstool. Vor der Produktion immer das finale STL-Modell prüfen!',
    errorImport: 'STL-Datei konnte nem gelesen werden.',
    errorExport: 'Export fehlgeschlagen.'
  },
  hu: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD fúrás vizualizáció',
    import: 'STL Importálása',
    export: 'Kész modell letöltése',
    exporting: 'Exportálás...',
    pierce: 'Kattintson a modellre',
    addChannel: 'Új furat elhelyezése',
    diameter: 'Átmérő',
    holes: 'Furatok listája',
    hole: 'Furat',
    undo: 'Vissza',
    redo: 'Előre',
    version: 'v1.0.2 Stabil',
    disclaimer: 'Fogászati vizualizációs segédeszköz. Gyártás előtt mindig ellenőrizze a végleges STL modellt!',
    errorImport: 'Hiba történt az STL beolvasása során.',
    errorExport: 'Hiba történt az exportálás során.'
  }
};

export default function Sidebar() {
  const { 
    models, activeModelId, activeChannelId,
    defaultDiameter, setDefaultDiameter, 
    setIsEditing, isEditing, 
    undo, redo, historyIndex, history,
    updateChannel, removeChannel,
    darkMode, toggleDarkMode,
    language, setLanguage
  } = useStore();

  const t = translations[language] || translations.en;
  const activeModel = models.find(m => m.id === activeModelId);
  const activeChannel = activeModel?.channels?.find(c => c.id === activeChannelId);
  const currentDiameter = activeChannel ? activeChannel.diameter : defaultDiameter;
  const fileInputRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { geometry, headerBytes } = parseSTLWithAttributes(arrayBuffer);
        const modelId = `model-${Date.now()}`;
        useStore.getState().setModel(modelId, geometry, headerBytes);
      } catch (error) {
        console.error("Import error:", error);
        alert(t.errorImport);
      }
    }
  };

  const handleExportClick = async () => {
    const activeModel = models.find(m => m.id === activeModelId);
    if (!activeModel) return;

    setIsExporting(true);
    try {
      const finalGeometry = await processCSG(activeModel.geometry, activeModel.channels);
      const blob = exportSTLWithAttributes(finalGeometry, activeModel.originalStlData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dental_model_${Date.now()}.stl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert(t.errorExport);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="sidebar" style={{
      width: '320px',
      backgroundColor: 'var(--panel-bg)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px',
      boxSizing: 'border-box',
      zIndex: 10
    }}>
      <div className="sidebar-header" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {t.title}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {t.subtitle}
            </p>
          </div>
          <button 
            onClick={toggleDarkMode}
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-secondary)', 
              cursor: 'pointer', padding: '8px', borderRadius: '50%'
            }}
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Language Picker */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          {['en', 'de', 'hu'].map(lang => (
            <button 
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: language === lang ? 'var(--accent-color)' : 'var(--text-secondary)',
                padding: '4px 8px',
                borderRadius: '4px',
                backgroundColor: language === lang ? 'var(--card-active-bg)' : 'transparent',
                textTransform: 'uppercase'
              }}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button className="btn" onClick={handleImportClick} style={{ width: '100%' }}>
          <Upload size={16} /> {t.import}
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".stl"
          onChange={handleFileChange}
        />
        
        <button className="btn" disabled={!activeModelId || isExporting} onClick={handleExportClick} style={{ width: '100%' }}>
          <Download size={16} /> {isExporting ? t.exporting : t.export}
        </button>
      </div>

      {activeModelId && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />
          
          <div style={{ marginBottom: '20px' }}>
            <button 
              className="btn" 
              onClick={() => setIsEditing(!isEditing)}
              style={{ 
                width: '100%',
                backgroundColor: isEditing ? 'var(--text-secondary)' : 'var(--accent-color)',
              }}
            >
              {isEditing ? (
                <><MousePointerClick size={16} /> {t.pierce}</>
              ) : (
                <><Plus size={16} /> {t.addChannel}</>
              )}
            </button>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: 'var(--text-secondary)' }}>
              {t.diameter}: {currentDiameter.toFixed(1)} mm
            </label>
            <input 
              type="range" 
              min="1.0" 
              max="10.0" 
              step="0.1" 
              value={currentDiameter}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (activeChannel) {
                  updateChannel(activeModelId, activeChannelId, { diameter: val }, false);
                } else {
                  setDefaultDiameter(val);
                }
              }}
              onPointerUp={() => { if (activeChannel) useStore.getState()._saveHistory(); }}
            />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text-primary)' }}>
              {t.holes} ({activeModel.channels.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
              {activeModel.channels.map((ch, idx) => {
                const isActive = activeChannelId === ch.id;
                return (
                  <div 
                    key={ch.id} 
                    onClick={() => useStore.setState({ activeChannelId: ch.id })}
                    style={{
                      padding: '12px', 
                      borderRadius: '10px', 
                      border: `2px solid ${isActive ? 'var(--card-active-border)' : 'var(--border-color)'}`,
                      backgroundColor: isActive ? 'var(--card-active-bg)' : 'var(--card-bg)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: isActive ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                        {t.hole} #{idx + 1}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Ø {ch.diameter.toFixed(1)} mm
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeChannel(activeModelId, ch.id);
                      }}
                      style={{ 
                        background: 'none', border: 'none', color: '#ef4444', 
                        cursor: 'pointer', padding: '6px', opacity: 0.8
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <button className="btn" style={{ flex: 1, backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }} 
                    onClick={undo} disabled={historyIndex <= 0}>
              <Undo size={14} /> {t.undo}
            </button>
            <button className="btn" style={{ flex: 1, backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }} 
                    onClick={redo} disabled={historyIndex >= history.length - 1}>
              <Redo size={14} /> {t.redo}
            </button>
          </div>
        </>
      )}

      {/* Footer / Disclaimer */}
      <div style={{ marginTop: 'auto', paddingTop: '24px', fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t.version}</div>
        <p style={{ margin: 0, lineHeight: '1.4' }}>
          {t.disclaimer}
        </p>
      </div>
    </div>
  );
}
