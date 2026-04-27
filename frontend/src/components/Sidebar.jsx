import React, { useRef, useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { Upload, Download, Undo, Redo, Plus, MousePointerClick, Trash2, Sun, Moon, Languages, HelpCircle, X, Scissors, RotateCcw, Eraser, AlertTriangle } from 'lucide-react';
import { parseSTLWithAttributes, exportSTLWithAttributes } from '../utils/stlParser';
import { processCSG } from '../utils/csgProcessor';
import { translations, wikiContent } from '../locales/translations';
import './Sidebar.css';

export default function Sidebar() {
  const { 
    models, activeModelId, activeChannelId,
    defaultDiameter, setDefaultDiameter, 
    setIsEditing, isEditing, 
    undo, redo, historyIndex, history,
    updateChannel, removeChannel,
    darkMode, toggleDarkMode,
    language, setLanguage,
    hasSeenWiki, setHasSeenWiki,
    isSectionView, toggleSectionView, sectionPlaneAngle, setSectionPlaneAngle,
    clearChannels, resetApp,
    showConfirmClear, showConfirmReset, setShowConfirmClear, setShowConfirmReset
  } = useStore();

  const t = translations[language] || translations.en;
  const activeModel = models.find(m => m.id === activeModelId);
  const activeChannel = activeModel?.channels?.find(c => c.id === activeChannelId);
  const currentDiameter = activeChannel ? activeChannel.diameter : defaultDiameter;
  const fileInputRef = useRef(null);
  const wheelTimeoutRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(!hasSeenWiki);
  const [confirmModal, setConfirmModal] = useState(null); // 'clear' | 'reset' | null
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // S key shortcut for section view
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 's' || e.key === 'S') {
        if (document.activeElement.tagName === 'INPUT') return;
        toggleSectionView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSectionView]);

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
        const { geometry } = parseSTLWithAttributes(arrayBuffer);
        const modelId = `model-${Date.now()}`;
        useStore.getState().setModel(modelId, geometry, arrayBuffer, file.name);
      } catch (error) {
        console.error("Import error:", error);
        alert(t.errorImport);
      } finally {
        e.target.value = '';
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
      const baseName = activeModel.name ? activeModel.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, "_") : "dental_model";
      const timestamp = new Date().toLocaleTimeString('hu-HU', { hour12: false }).replace(/:/g, '');
      const fileName = `${baseName}_CUT_${timestamp}.stl`;
      
      const file = new File([blob], fileName, { type: 'application/octet-stream' });
      const url = URL.createObjectURL(file);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      
      console.log(`[Export] Triggering download for: ${fileName}`);
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      console.error("Export error:", error);
      alert(t.errorExport);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearRequest = () => {
    if (!showConfirmClear) {
      clearChannels();
      return;
    }
    setConfirmModal('clear');
    setDontShowAgain(false);
  };

  const handleResetRequest = () => {
    if (!showConfirmReset) {
      resetApp();
      return;
    }
    setConfirmModal('reset');
    setDontShowAgain(false);
  };

  const executeConfirmedAction = () => {
    if (confirmModal === 'clear') {
      clearChannels();
      if (dontShowAgain) setShowConfirmClear(false);
    } else if (confirmModal === 'reset') {
      resetApp();
      if (dontShowAgain) setShowConfirmReset(false);
    }
    setConfirmModal(null);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <div>
            <h2 className="sidebar-title">{t.title}</h2>
            <p className="sidebar-subtitle">{t.subtitle}</p>
          </div>
          <div className="sidebar-actions">
            <button 
              onClick={() => setIsHelpOpen(true)}
              className="icon-btn"
              title={t.help}
            >
              <HelpCircle size={18} />
            </button>
            <button 
              onClick={toggleDarkMode}
              className="icon-btn"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>

        <div className="language-picker">
          {['en', 'de', 'hu'].map(lang => (
            <button 
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`lang-btn ${language === lang ? 'active' : ''}`}
            >
              {lang}
            </button>
          ))}
        </div>
      </div>

      <div className="main-actions">
        <button className="btn" onClick={handleImportClick}>
          <Upload size={16} /> {t.import}
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          style={{ display: 'none' }}
          accept=".stl"
          onChange={handleFileChange}
        />
        
        <div className="main-actions-group">
          <button className="btn" style={{ flex: 1 }} disabled={!activeModelId || isExporting} onClick={handleExportClick}>
            <Download size={16} /> {isExporting ? t.exporting : t.export}
          </button>
        </div>
      </div>

      {activeModelId && (
        <>
          <hr className="sidebar-divider" />
          
          <div className="section-controls">
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

          <div className="section-controls">
            <button
              id="btn-section-view"
              className="btn"
              disabled={!activeChannelId}
              onClick={toggleSectionView}
              title="S"
              style={{
                width: '100%',
                backgroundColor: isSectionView ? '#fbbf24' : 'var(--border-color)',
                color: isSectionView ? '#1e1e1e' : 'var(--text-primary)',
                opacity: activeChannelId ? 1 : 0.4,
              }}
            >
              <Scissors size={16} />
              {t.sectionView}
            </button>
          </div>

          {isSectionView && (
            <div className="section-controls">
              <label className="control-label">
                {t.sectionAngle}: {Math.round((sectionPlaneAngle * 180) / Math.PI)}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={Math.round((sectionPlaneAngle * 180) / Math.PI)}
                onChange={(e) => setSectionPlaneAngle((parseFloat(e.target.value) * Math.PI) / 180)}
                className="w-full"
              />
              <div className="section-hint">
                {t.sectionHint}
              </div>
            </div>
          )}

          <div className="section-controls">
            <label className="control-label">
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
              className="w-full"
            />
          </div>

          <div className="holes-container">
            <h4 className="holes-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t.holes} ({activeModel.channels.length})</span>
              {activeModel.channels.length > 0 && (
                <button 
                  onClick={handleClearRequest} 
                  className="icon-btn" 
                  title={t.clearHoles}
                  style={{ padding: '2px', color: 'var(--text-secondary)' }}
                >
                  <Eraser size={14} />
                </button>
              )}
            </h4>
            <div className="holes-list">
              {activeModel.channels.map((ch, idx) => {
                const isActive = activeChannelId === ch.id;
                return (
                  <div 
                    key={ch.id} 
                    onClick={() => useStore.setState({ activeChannelId: ch.id })}
                    className={`hole-item ${isActive ? 'active' : ''}`}
                  >
                    <div>
                      <div className="hole-name">
                        {t.hole} #{idx + 1}
                      </div>
                      <div className="hole-info">
                        Ø {ch.diameter.toFixed(1)} mm
                      </div>
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        removeChannel(activeModelId, ch.id);
                      }}
                      className="delete-btn"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="history-controls">
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

      <div className="sidebar-footer">
        <div className="sidebar-footer-top" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
          <div className="version-tag">{t.version}</div>
          {activeModelId && (
            <button 
              className="icon-btn btn-danger" 
              onClick={handleResetRequest} 
              title={t.resetApp}
              style={{ padding: '2px', opacity: 0.6 }}
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
        <div style={{ fontSize: '10px', marginBottom: '8px', opacity: 0.8 }}>
          {t.copyright}
        </div>
        <p className="disclaimer-text">
          {t.disclaimer}
        </p>
      </div>

      {confirmModal && (
        <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#ef4444' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0 }}>{confirmModal === 'clear' ? t.clearHoles : t.resetApp}</h3>
            </div>
            
            <p style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '20px' }}>
              {confirmModal === 'clear' ? t.confirmClear : t.confirmReset}
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', marginBottom: '24px', userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={dontShowAgain} 
                onChange={(e) => setDontShowAgain(e.target.checked)}
              />
              {t.dontShowAgain}
            </label>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn" onClick={() => setConfirmModal(null)} style={{ flex: 1, backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                {t.cancel}
              </button>
              <button className="btn" onClick={executeConfirmedAction} style={{ flex: 1, backgroundColor: '#ef4444', color: 'white' }}>
                {t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {isHelpOpen && (
        <div className="modal-overlay" onClick={closeHelp}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button 
              onClick={closeHelp}
              className="modal-close-btn"
            >
              <X size={20} />
            </button>
            <h2 className="modal-title">
              {t.help}
            </h2>
            <div className="modal-body" dangerouslySetInnerHTML={{ __html: wikiContent[language] || wikiContent.en }} />
            <button className="btn" onClick={closeHelp} style={{ marginTop: '24px', width: '100%' }}>
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
