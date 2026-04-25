import { create } from 'zustand';
import * as THREE from 'three';

const useStore = create((set, get) => ({
  models: [],
  activeModelId: null,
  activeChannelId: null,
  modelCenter: new THREE.Vector3(0, 0, 0),
  _controls: null, // vanilla ArcballControls reference, set by SceneControls
  isEditing: false, 
  placementStep: 0, 
  tempStartPoint: null,
  tempEndPoint: null,
  defaultDiameter: 3.0,
  
  history: [],
  historyIndex: -1,

  _saveHistory: () => {
    const { models, history, historyIndex } = get();
    const snap = models.map(m => ({
      ...m,
      channels: m.channels.map(c => ({
        ...c,
        startPoint: c.startPoint.clone(),
        endPoint: c.endPoint.clone()
      }))
    }));

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snap);
    if (newHistory.length > 50) newHistory.shift();

    set({ 
      history: newHistory, 
      historyIndex: newHistory.length - 1 
    });
  },

  // This was renamed, fixing it back to setModel to match Sidebar.jsx
  setModel: (id, geometry, originalStlData) => {
    const newModel = { id, geometry, originalStlData, channels: [] };
    set((state) => ({ 
      models: [...state.models, newModel],
      activeModelId: id,
      history: [], // Reset history for new model session
      historyIndex: -1
    }));
    get()._saveHistory(); // Initial state in history
  },

  setModelCenter: (center) => set({ modelCenter: center }),

  setActiveModel: (id) => set({ activeModelId: id }),

  addChannel: (modelId, channel) => {
    set((state) => ({
      activeChannelId: channel.id,
      models: state.models.map(m => 
        m.id === modelId 
          ? { ...m, channels: [...m.channels, channel] }
          : m
      )
    }));
    get()._saveHistory();
  },

  updateChannel: (modelId, channelId, updates, saveHistoryFlag = true) => {
    set((state) => ({
      models: state.models.map(m => 
        m.id === modelId 
          ? {
              ...m,
              channels: m.channels.map(c => 
                c.id === channelId ? { ...c, ...updates } : c
              )
            }
          : m
      )
    }));
    if (saveHistoryFlag) get()._saveHistory();
  },

  removeChannel: (modelId, channelId) => {
    set((state) => {
      const model = state.models.find(m => m.id === modelId);
      if (!model) return state;
      
      const newChannels = model.channels.filter(c => c.id !== channelId);
      let newActiveId = state.activeChannelId;
      
      if (state.activeChannelId === channelId) {
        newActiveId = newChannels.length > 0 ? newChannels[newChannels.length - 1].id : null;
      }
      
      return {
        activeChannelId: newActiveId,
        models: state.models.map(m => 
          m.id === modelId 
            ? { ...m, channels: newChannels }
            : m
        )
      };
    });
    get()._saveHistory();
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const snap = history[prevIndex];
      set((state) => ({
        historyIndex: prevIndex,
        models: state.models.map((m, i) => {
          const snapModel = snap.find(sm => sm.id === m.id);
          return {
            ...m,
            channels: snapModel ? snapModel.channels.map(c => ({
              ...c,
              startPoint: c.startPoint.clone(),
              endPoint: c.endPoint.clone()
            })) : []
          };
        })
      }));
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const snap = history[nextIndex];
      set((state) => ({
        historyIndex: nextIndex,
        models: state.models.map((m, i) => {
          const snapModel = snap.find(sm => sm.id === m.id);
          return {
            ...m,
            channels: snapModel ? snapModel.channels.map(c => ({
              ...c,
              startPoint: c.startPoint.clone(),
              endPoint: c.endPoint.clone()
            })) : []
          };
        })
      }));
    }
  },

  setPlacementStep: (step) => set({ placementStep: step }),
  setTempStartPoint: (pt) => set({ tempStartPoint: pt }),
  setTempEndPoint: (pt) => set({ tempEndPoint: pt }),
  setIsEditing: (val) => set({ 
    isEditing: val, 
    placementStep: val ? 1 : 0,
    tempStartPoint: val ? null : get().tempStartPoint,
    tempEndPoint: val ? null : get().tempEndPoint,
  }),
  setDefaultDiameter: (d) => set({ defaultDiameter: d }),
}));

export default useStore;
