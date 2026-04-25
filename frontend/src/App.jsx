import React from 'react';
import Sidebar from './components/Sidebar';
import Viewport3D from './components/Viewport3D';
import useStore from './store/useStore';

function App() {
  const { activeModelId, darkMode } = useStore();
  
  // We use 'light' explicitly to override system dark mode preference
  return (
    <div className={`app-container ${darkMode ? 'dark' : 'light'}`}>
      <Sidebar />
      <div className="viewport-container" style={{ flex: 1, position: 'relative' }}>
        {!activeModelId && (
          <div className="empty-state" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'var(--text-secondary)'
          }}>
            <h2 style={{ color: 'var(--text-primary)' }}>Nincs betöltött modell</h2>
            <p>Importáljon egy STL fájlt a fúrási csatornák elhelyezéséhez.</p>
          </div>
        )}
        {activeModelId && <Viewport3D />}
      </div>
    </div>
  );
}

export default App;
