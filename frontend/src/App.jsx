import React from 'react';
import Sidebar from './components/Sidebar';
import Viewport3D from './components/Viewport3D';
import useStore from './store/useStore';

function App() {
  const { activeModelId } = useStore();
  return (
    <>
      <Sidebar />
      <div className="viewport-container">
        {!activeModelId && (
          <div className="empty-state">
            <h2>No Model Loaded</h2>
            <p>Import an STL file to begin cutting channels.</p>
          </div>
        )}
        {activeModelId && <Viewport3D />}
      </div>
    </>
  );
}

export default App;
