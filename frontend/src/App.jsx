import React from 'react';
import Sidebar from './components/Sidebar';
import Viewport3D from './components/Viewport3D';
import useStore from './store/useStore';

const emptyTranslations = {
  en: {
    title: 'No Model Loaded',
    desc: 'Import an STL file to begin cutting channels.'
  },
  de: {
    title: 'Kein Modell geladen',
    desc: 'Importieren Sie eine STL-Datei, um Kanäle zu schneiden.'
  },
  hu: {
    title: 'Nincs betöltött modell',
    desc: 'Importáljon egy STL fájlt a fúrási csatornák elhelyezéséhez.'
  }
};

function App() {
  const { activeModelId, darkMode, language } = useStore();
  const t = emptyTranslations[language] || emptyTranslations.en;
  
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
            <h2 style={{ color: 'var(--text-primary)' }}>{t.title}</h2>
            <p>{t.desc}</p>
          </div>
        )}
        {activeModelId && <Viewport3D />}
      </div>
    </div>
  );
}

export default App;
