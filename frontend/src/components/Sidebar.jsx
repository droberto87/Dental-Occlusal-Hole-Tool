import React, { useRef, useState } from 'react';
import useStore from '../store/useStore';
import { Upload, Download, Undo, Redo, Plus, MousePointerClick, Trash2 } from 'lucide-react';
import { parseSTLWithAttributes, exportSTLWithAttributes } from '../utils/stlParser';
import { processCSG } from '../utils/csgProcessor';

export default function Sidebar() {
  const { 
    models, activeModelId, activeChannelId,
    defaultDiameter, setDefaultDiameter, 
    setIsEditing, placementStep, isEditing, 
    undo, redo, historyIndex, history,
    updateChannel, removeChannel
  } = useStore();

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
      console.log('Importing file:', file.name);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { geometry, headerBytes } = parseSTLWithAttributes(arrayBuffer);
        
        // Generate a unique ID for the model
        const modelId = `model-${Date.now()}`;
        
        // Add to store
        useStore.getState().setModel(modelId, geometry, headerBytes);
        
      } catch (error) {
        console.error("Failed to parse STL:", error);
        alert("Failed to parse STL file.");
      }
    }
  };

  const handleExportClick = async () => {
    const activeModel = models.find(m => m.id === activeModelId);
    if (!activeModel) return;

    setIsExporting(true);
    try {
      // 1. Process CSG
      const finalGeometry = await processCSG(activeModel.geometry, activeModel.channels);
      
      // 2. Export to STL
      const blob = exportSTLWithAttributes(finalGeometry, activeModel.originalStlData);
      
      // 3. Trigger Download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cut_model_${Date.now()}.stl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export model.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="sidebar glass-panel">
      <div className="sidebar-header">
        <h1>Occulsa</h1>
        <p>Hole Tool for CAM Models</p>
      </div>

      <div className="control-group">
        <button className="btn btn-primary" onClick={handleImportClick}>
          <Upload size={16} /> Import STL
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".stl"
          onChange={handleFileChange}
        />
        
        <button className="btn" disabled={!activeModelId || isExporting} onClick={handleExportClick}>
          <Download size={16} /> {isExporting ? 'Exporting...' : 'Export STL'}
        </button>
      </div>

      {activeModelId && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />
          
          <div className="control-group">
            <button 
              className={`btn ${isEditing ? '' : 'btn-primary'}`} 
              onClick={() => setIsEditing(!isEditing)}
              style={{ background: isEditing ? 'rgba(255,255,255,0.1)' : undefined }}
            >
              {isEditing ? (
                <><MousePointerClick size={16} /> Click on Model to Pierce</>
              ) : (
                <><Plus size={16} /> Add Channel</>
              )}
            </button>
          </div>

          <div className="control-group">
            <label>Diameter ({currentDiameter.toFixed(1)} mm){activeChannel ? ' — active channel' : ' — new channels'}</label>
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

          <div className="control-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569' }}>Holes ({activeModel.channels.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
              {activeModel.channels.map((ch, idx) => {
                const isActive = activeChannelId === ch.id;
                return (
                  <div 
                    key={ch.id} 
                    onClick={() => useStore.setState({ activeChannelId: ch.id })}
                    style={{
                      padding: '10px', 
                      borderRadius: '8px', 
                      border: `2px solid ${isActive ? '#3b82f6' : '#e2e8f0'}`,
                      backgroundColor: isActive ? '#eff6ff' : '#f8fafc',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: isActive ? '#1e40af' : '#334155' }}>
                        Hole #{idx + 1}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
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
                        cursor: 'pointer', padding: '6px', borderRadius: '4px' 
                      }}
                      title="Delete hole"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-row" style={{ marginTop: 'auto', paddingTop: '12px' }}>
            <button className="btn" style={{ flex: 1 }} onClick={undo} disabled={historyIndex <= 0}>
              <Undo size={16} /> Undo
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={redo} disabled={historyIndex >= history.length - 1}>
              <Redo size={16} /> Redo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
