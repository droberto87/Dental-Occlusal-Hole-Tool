import React, { useRef, useState } from 'react';
import useStore from '../store/useStore';
import { Upload, Download, Undo, Redo, Plus, MousePointerClick, Trash2, Sun, Moon, Languages, HelpCircle, X } from 'lucide-react';
import { parseSTLWithAttributes, exportSTLWithAttributes } from '../utils/stlParser';
import { processCSG } from '../utils/csgProcessor';

const translations = {
  en: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD Occlusal Hole Editor',
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
    version: 'v1.0.3 Stable',
    disclaimer: 'Professional CAD Editor. Always verify final STL model before production!',
    help: 'Help / Wiki',
    close: 'Close',
    errorImport: 'Failed to read STL file.',
    errorExport: 'Failed to export model.'
  },
  de: {
    title: 'Dental Okklusal-Loch-Tool',
    subtitle: 'CAD-Okklusal-Loch-Editor',
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
    version: 'v1.0.3 Stabil',
    disclaimer: 'Professioneller CAD-Editor. Vor der Produktion immer das finale STL-Modell prüfen!',
    help: 'Hilfe / Wiki',
    close: 'Schließen',
    errorImport: 'STL-Datei konnte nem gelesen werden.',
    errorExport: 'Export fehlgeschlagen.'
  },
  hu: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD Okkluzális Furatszerkesztő',
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
    version: 'v1.0.3 Stabil',
    disclaimer: 'Professzionális CAD szerkesztő szoftver. Gyártás előtt mindig ellenőrizze a végleges STL modellt!',
    help: 'Súgó / Wiki',
    close: 'Bezárás',
    errorImport: 'Hiba történt az STL beolvasása során.',
    errorExport: 'Hiba történt az exportálás során.'
  }
};

const wikiContent = {
  en: `
    <h3>1. Loading a Model</h3>
    <p>Click <b>Import STL</b> to load your dental model.</p>
    <h3>2. Placing Holes</h3>
    <p>Click <b>Add Channel</b> or <b>double-click</b> on the model surface. The hole will pierce the model along the camera's view axis.</p>
    <h3>3. Editing</h3>
    <p>Drag the <b>markers</b> to move endpoints. Use the <b>mouse wheel</b> over a marker to change its diameter.</p>
    <h3>4. Export</h3>
    <p>Click <b>Export STL</b> to download the final cut model.</p>
  `,
  de: `
    <h3>1. Modell laden</h3>
    <p>Klicken Sie auf <b>STL Importieren</b>, um Ihr Modell zu laden.</p>
    <h3>2. Löcher platzieren</h3>
    <p>Klicken Sie auf <b>Kanal hinzufügen</b> oder machen Sie einen <b>Doppelklick</b> auf die Modelloberfläche.</p>
    <h3>3. Bearbeiten</h3>
    <p>Ziehen Sie die <b>Marker</b>, um sie zu verschieben. Nutzen Sie das <b>Mausrad</b> über einem Marker, um den Durchmesser zu ändern.</p>
    <h3>4. Exportieren</h3>
    <p>Klicken Sie auf <b>STL Exportieren</b>, um das fertige Modell herunterzuladen.</p>
  `,
  hu: `
    <h3>1. Modell betöltése</h3>
    <p>Kattintson az <b>STL Importálása</b> gombra.</p>
    <h3>2. Furatok elhelyezése</h3>
    <p>Használja az <b>Új furat elhelyezése</b> gombot vagy a <b>dupla kattintást</b> a modell felületén. A furat a kamera nézési iránya mentén jön létre.</p>
    <h3>3. Szerkesztés</h3>
    <p>A <b>marker gömbök</b> húzásával mozgathatja a végpontokat. Az <b>egérgörgővel</b> a marker felett állva módosíthatja az átmérőt.</p>
    <h3>4. Exportálás</h3>
    <p>Kattintson a <b>Kész modell letöltése</b> gombra a mentéshez.</p>
  `
};

export default function Sidebar() {
  const { 
    models, activeModelId, activeChannelId,
    defaultDiameter, setDefaultDiameter, 
    setIsEditing, isEditing, 
    undo, redo, historyIndex, history,
    updateChannel, removeChannel,
    darkMode, toggleDarkMode,
    language, setLanguage,
    hasSeenWiki, setHasSeenWiki
  } = useStore();

  const t = translations[language] || translations.en;
  const activeModel = models.find(m => m.id === activeModelId);
  const activeChannel = activeModel?.channels?.find(c => c.id === activeChannelId);
  const currentDiameter = activeChannel ? activeChannel.diameter : defaultDiameter;
  const fileInputRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(!hasSeenWiki);

  const closeHelp = () => {
    setIsHelpOpen(false);
    if (!hasSeenWiki) setHasSeenWiki();
  };

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
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              onClick={() => setIsHelpOpen(true)}
              style={{ 
                background: 'none', border: 'none', color: 'var(--text-secondary)', 
                cursor: 'pointer', padding: '8px', borderRadius: '50%'
              }}
              title={t.help}
            >
              <HelpCircle size={18} />
            </button>
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

      {/* Wiki Modal */}
      {isHelpOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }} onClick={closeHelp}>
          <div style={{
            width: '450px', backgroundColor: 'var(--panel-bg)', borderRadius: '16px',
            padding: '32px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color)', color: 'var(--text-primary)'
          }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={closeHelp}
              style={{
                position: 'absolute', top: '16px', right: '16px',
                background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
            <h2 style={{ marginTop: 0, borderBottom: '2px solid var(--accent-color)', paddingBottom: '12px' }}>
              {t.help}
            </h2>
            <div style={{ fontSize: '14px', lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: wikiContent[language] || wikiContent.en }} />
            <button className="btn" onClick={closeHelp} style={{ marginTop: '24px', width: '100%' }}>
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
