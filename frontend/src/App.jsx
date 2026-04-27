import React from 'react';
import Sidebar from './components/Sidebar';
import Viewport3D from './components/Viewport3D';
import useStore from './store/useStore';
import { translations } from './locales/translations';

function App() {
  const { activeModelId, darkMode, language } = useStore();
  const t = translations[language] || translations.en;
  
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
            <h2 style={{ color: 'var(--text-primary)' }}>{t.emptyTitle}</h2>
            <p>{t.emptyDesc}</p>
          </div>
        )}
        {activeModelId && <Viewport3D />}
      </div>
    </div>
  );
}

export default App;
