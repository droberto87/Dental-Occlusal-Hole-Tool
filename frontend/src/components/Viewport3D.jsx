import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import * as THREE from 'three';

// BVH-accelerated raycasting (patched once at module level)
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Silence deprecation warnings
const _origWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && (
    args[0].includes('THREE.Clock') ||
    args[0].includes('THREE.Color: Unknown color')
  )) return;
  _origWarn.apply(console, args);
};

import useStore from '../store/useStore';
let _activeControls = null;
const _liveChannels = new Map();

// ─── Geometry helpers (in-place buffer updates) ───────────────────────────────

function fillLateralGeo(geo, ep, xp) {
  const n = ep.length;
  const count = n * 6;
  let attr = geo.attributes.position;
  if (!attr || attr.count !== count) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    attr = geo.attributes.position;
  }
  const a = attr.array;
  let i2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const e0 = ep[i], e1 = ep[j], x0 = xp[i], x1 = xp[j];
    a[i2++]=e0.x; a[i2++]=e0.y; a[i2++]=e0.z;
    a[i2++]=x0.x; a[i2++]=x0.y; a[i2++]=x0.z;
    a[i2++]=e1.x; a[i2++]=e1.y; a[i2++]=e1.z;
    a[i2++]=e1.x; a[i2++]=e1.y; a[i2++]=e1.z;
    a[i2++]=x0.x; a[i2++]=x0.y; a[i2++]=x0.z;
    a[i2++]=x1.x; a[i2++]=x1.y; a[i2++]=x1.z;
  }
  attr.needsUpdate = true;
  geo.computeVertexNormals();
}

function fillLineGeo(geo, pts) {
  const count = pts.length + 1;
  let attr = geo.attributes.position;
  if (!attr || attr.count !== count) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    attr = geo.attributes.position;
  }
  const a = attr.array;
  let i2 = 0;
  for (const p of pts) { a[i2++]=p.x; a[i2++]=p.y; a[i2++]=p.z; }
  a[i2++]=pts[0].x; a[i2++]=pts[0].y; a[i2++]=pts[0].z;
  attr.needsUpdate = true;
}

function fillCapGeo(geo, pts) {
  const n = pts.length;
  const count = n * 3; // fan from centroid
  let attr = geo.attributes.position;
  if (!attr || attr.count !== count) {
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    attr = geo.attributes.position;
  }
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= n; cy /= n; cz /= n;
  const a = attr.array;
  let i2 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a[i2++]=cx;       a[i2++]=cy;       a[i2++]=cz;
    a[i2++]=pts[i].x; a[i2++]=pts[i].y; a[i2++]=pts[i].z;
    a[i2++]=pts[j].x; a[i2++]=pts[j].y; a[i2++]=pts[j].z;
  }
  attr.needsUpdate = true;
}

// ─── BVH raycast computation ──────────────────────────────────────────────────

const _rc = new THREE.Raycaster();

function computeTrimmedCylinder(bvhMesh, start, end, radius, segments = 96) {
  const axis = end.clone().sub(start).normalize();
  const negAxis = axis.clone().negate();
  const arb = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  const u = new THREE.Vector3().crossVectors(arb, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const BIG = 500;
  const ep = [], xp = [];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const radial = u.clone().multiplyScalar(Math.cos(theta))
      .addScaledVector(v, Math.sin(theta)).multiplyScalar(radius);

    _rc.set(start.clone().add(radial).addScaledVector(axis, -BIG), axis);
    const eh = _rc.intersectObject(bvhMesh);
    if (eh.length > 0) {
      const best = eh.reduce((a, b) => a.point.distanceTo(start) < b.point.distanceTo(start) ? a : b);
      ep.push(best.point.clone());
    } else {
      ep.push(start.clone().add(radial));
    }

    _rc.set(end.clone().add(radial).addScaledVector(axis, BIG), negAxis);
    const xh = _rc.intersectObject(bvhMesh);
    if (xh.length > 0) {
      const best = xh.reduce((a, b) => a.point.distanceTo(end) < b.point.distanceTo(end) ? a : b);
      xp.push(best.point.clone());
    } else {
      xp.push(end.clone().add(radial));
    }
  }
  return { ep, xp };
}

// ─── SceneControls ───────────────────────────────────────────────────────────

function SceneControls() {
  const { camera, gl } = useThree();
  const controlsRef = useRef(null);
  const lastFramedModelId = useRef(null);

  useEffect(() => {
    const controls = new ArcballControls(camera, gl.domElement);
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.cursorZoom = true;
    controls.adjustNearFar = false;
    controls.scaleFactor = 1.1;
    controlsRef.current = controls;
    _activeControls = controls;
    return () => { controls.dispose(); _activeControls = null; };
  }, [camera, gl]);

  const activeModelId = useStore(s => s.activeModelId);
  const activeModel = useStore(s => s.models.find(m => m.id === s.activeModelId));

  useEffect(() => {
    if (!controlsRef.current || !activeModel?.geometry) return;
    if (lastFramedModelId.current === activeModel.id) return;

    const controls = controlsRef.current;
    const geo = activeModel.geometry;
    geo.computeVertexNormals();

    if (!geo.boundsTree) {
      geo.boundsTree = new MeshBVH(geo);
    }

    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    geo.boundingBox.getCenter(center);
    geo.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const zoom = Math.min(window.innerWidth, window.innerHeight) / (maxDim * 1.6);

    controls.target.set(center.x, center.y, center.z);
    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
    camera.zoom = zoom;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();

    lastFramedModelId.current = activeModel.id;
  }, [activeModel?.id, camera]);

  useFrame(() => { controlsRef.current?.update(); });
  return null;
}

// ─── Camera Light ────────────────────────────────────────────────────────────

function CameraLight() {
  const { camera } = useThree();
  const lightRef = useRef();
  useFrame(() => { 
    if (lightRef.current) {
      lightRef.current.position.copy(camera.position);
      // Sync light target with controls target so it always shines where we look
      if (_activeControls) {
        lightRef.current.target.position.copy(_activeControls.target);
        lightRef.current.target.updateMatrixWorld();
      }
    }
  });
  return <directionalLight ref={lightRef} intensity={2.2} />;
}

// ─── Channel Visualizer ──────────────────────────────────────────────────────
// Uses local refs + useFrame for 60fps drag — never touches React state during drag

function ChannelVisualizer({ channel }) {
  const { id, startPoint, endPoint, diameter } = channel;
  const { updateChannel, activeModelId, activeChannelId, models } = useStore();
  const { camera, gl } = useThree();
  const activeModel = models.find(m => m.id === activeModelId);
  const isActive = activeChannelId === id;

  // Local drag state (bypasses React/Zustand during drag)
  const startRef = useRef(startPoint.clone());
  const endRef   = useRef(endPoint.clone());
  const diamRef  = useRef(diameter);
  const dirty    = useRef(true);
  const isDragStart = useRef(false);
  const isDragEnd   = useRef(false);

  // Sync from props when not dragging
  useEffect(() => {
    if (!isDragStart.current) startRef.current.copy(startPoint);
    if (!isDragEnd.current)   endRef.current.copy(endPoint);
    diamRef.current = diameter;
    dirty.current = true;
  }, [startPoint, endPoint, diameter]);

  // BVH-accelerated mesh (shared reference)
  const bvhMeshRef = useRef(null);
  useEffect(() => {
    if (activeModel?.geometry) {
      bvhMeshRef.current = new THREE.Mesh(activeModel.geometry);
    }
    return () => _liveChannels.delete(id); // Cleanup
  }, [activeModel?.geometry, id]);

  // Pre-allocated geometries
  const lateralGeo  = useRef(new THREE.BufferGeometry());
  const entryGeo    = useRef(new THREE.BufferGeometry());
  const exitGeo     = useRef(new THREE.BufferGeometry());
  const entryCapGeo = useRef(new THREE.BufferGeometry());
  const exitCapGeo  = useRef(new THREE.BufferGeometry());

  // Marker mesh refs (imperatively positioned)
  const startMeshRef = useRef();
  const endMeshRef   = useRef();

  useFrame(() => {
    // Write to live cache for the shader
    _liveChannels.set(id, {
      start: startRef.current,
      end: endRef.current,
      diameter: diamRef.current
    });

    // Update marker positions imperatively (instant, no React)
    if (startMeshRef.current) startMeshRef.current.position.copy(startRef.current);
    if (endMeshRef.current)   endMeshRef.current.position.copy(endRef.current);

    if (!dirty.current || !bvhMeshRef.current) return;
    dirty.current = false;

    const dist = startRef.current.distanceTo(endRef.current);
    if (dist < 0.01) return;

    const { ep, xp } = computeTrimmedCylinder(
      bvhMeshRef.current,
      startRef.current,
      endRef.current,
      diamRef.current / 2
    );

    fillLateralGeo(lateralGeo.current, ep, xp);
    fillLineGeo(entryGeo.current, ep);
    fillLineGeo(exitGeo.current, xp);
    fillCapGeo(entryCapGeo.current, ep);
    fillCapGeo(exitCapGeo.current, xp);
  });

  const setSuspend = (val) => {
    if (_activeControls) _activeControls.enabled = !val;
  };

  const getHit = (e) => {
    if (!bvhMeshRef.current) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    const y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    _rc.setFromCamera(new THREE.Vector2(x, y), camera);
    const hits = _rc.intersectObject(bvhMeshRef.current);
    return hits.length > 0 ? hits[0].point : null;
  };

  const mkDrag = (type) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      setSuspend(true);
      useStore.setState({ activeChannelId: id });
      if (type === 'start') isDragStart.current = true;
      else                  isDragEnd.current   = true;
      gl.domElement.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      e.stopPropagation();
      const active = type === 'start' ? isDragStart.current : isDragEnd.current;
      if (!active) return;
      const pt = getHit(e);
      if (pt) {
        if (type === 'start') startRef.current.copy(pt);
        else                  endRef.current.copy(pt);
        dirty.current = true;
      }
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      if (type === 'start') {
        updateChannel(activeModelId, id, { startPoint: startRef.current.clone() });
        isDragStart.current = false;
      } else {
        updateChannel(activeModelId, id, { endPoint: endRef.current.clone() });
        isDragEnd.current = false;
      }
      setSuspend(false);
      gl.domElement.releasePointerCapture(e.pointerId);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      if (_activeControls) _activeControls.enableZoom = false;
    },
    onPointerOut: (e) => {
      e.stopPropagation();
      if (_activeControls) _activeControls.enableZoom = true;
    },
    onWheel: (e) => {
      e.stopPropagation();
      // Ensure zoom is disabled even if PointerOver wasn't triggered (e.g. immediately after creation)
      if (_activeControls) _activeControls.enableZoom = false;
      useStore.setState({ activeChannelId: id });
      
      const delta = e.deltaY > 0 ? -0.2 : 0.2; // Increase step size slightly for better scroll feel
      let newDiam = diamRef.current + delta;
      newDiam = Math.max(1.0, Math.min(10.0, newDiam));
      
      diamRef.current = newDiam;
      dirty.current = true;
      
      updateChannel(activeModelId, id, { diameter: newDiam }, false);
      
      // Debounce the history save so we don't spam the undo stack
      if (window._wheelTimeout) clearTimeout(window._wheelTimeout);
      window._wheelTimeout = setTimeout(() => {
        useStore.getState()._saveHistory();
      }, 400);
    }
  });

  return (
    <group>
      {/* Inner wall of the future hole */}
      <mesh geometry={lateralGeo.current}>
        <meshStandardMaterial color={isActive ? "#cbd5e1" : "#94a3b8"} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} />
      </mesh>
      <line geometry={entryGeo.current}>
        <lineBasicMaterial color={isActive ? "#fbbf24" : "#60a5fa"} linewidth={isActive ? 3 : 2} />
      </line>
      <line geometry={exitGeo.current}>
        <lineBasicMaterial color={isActive ? "#fbbf24" : "#60a5fa"} linewidth={isActive ? 3 : 2} />
      </line>
      <mesh ref={startMeshRef} {...mkDrag('start')}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color={isActive ? "#fbbf24" : "#2563eb"} />
      </mesh>
      <mesh ref={endMeshRef} {...mkDrag('end')}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color={isActive ? "#fbbf24" : "#2563eb"} />
      </mesh>
    </group>
  );
}

// ─── Custom shader material: transparent inside cylinders ────────────────────

const MAX_CYL = 8;

function createChannelMaterial() {
  const cylStarts = Array.from({ length: MAX_CYL }, () => new THREE.Vector3());
  const cylEnds   = Array.from({ length: MAX_CYL }, () => new THREE.Vector3());
  const cylRadii  = new Float32Array(MAX_CYL);

  const mat = new THREE.MeshStandardMaterial({
    color: '#cbd5e1', roughness: 0.3, metalness: 0.6,
    transparent: true, side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCylCount  = { value: 0 };
    shader.uniforms.uCylStarts = { value: cylStarts };
    shader.uniforms.uCylEnds   = { value: cylEnds };
    shader.uniforms.uCylRadii  = { value: cylRadii };
    mat.userData.shader = shader;

    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>\n  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );

    const cylUniforms = `
      varying vec3 vWorldPos;
      uniform int uCylCount;
      uniform vec3 uCylStarts[${MAX_CYL}];
      uniform vec3 uCylEnds[${MAX_CYL}];
      uniform float uCylRadii[${MAX_CYL}];
    `;
    shader.fragmentShader = cylUniforms + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      for (int i = 0; i < ${MAX_CYL}; i++) {
        if (i >= uCylCount) break;
        vec3 ax = normalize(uCylEnds[i] - uCylStarts[i]);
        float axLen = length(uCylEnds[i] - uCylStarts[i]);
        vec3 toFrag = vWorldPos - uCylStarts[i];
        float t = dot(toFrag, ax);
        float radDist = length(toFrag - ax * t);
        // Extend bounds by 5mm on both ends to catch geometry curvature
        if (t >= -5.0 && t <= axLen + 5.0 && radDist <= uCylRadii[i]) {
          gl_FragColor.a = 0.08;
          break;
        }
      }`
    );
  };

  mat.userData.cylStarts = cylStarts;
  mat.userData.cylEnds   = cylEnds;
  mat.userData.cylRadii  = cylRadii;
  return mat;
}

function CylinderPreview({ start, end, diameter }) {
  const axis = end.clone().sub(start).normalize();
  const dist = start.distanceTo(end);
  if (dist < 0.01) return null;
  const mid = start.clone().lerp(end, 0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), axis);
  return (
    <mesh position={mid} quaternion={q}>
      <cylinderGeometry args={[diameter/2, diameter/2, dist, 32, 1, true]} />
      <meshStandardMaterial color="#3b82f6" transparent opacity={0.2}
        side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function ModelViewer() {
  const { camera } = useThree();
  const {
    models, activeModelId,
    placementStep, setPlacementStep,
    setTempStartPoint, setTempEndPoint, tempStartPoint, tempEndPoint,
    addChannel, defaultDiameter, setIsEditing, isEditing, darkMode
  } = useStore();
  const activeModel = models.find(m => m.id === activeModelId);
  const matRef = useRef(createChannelMaterial());

  React.useEffect(() => {
    if (matRef.current) {
      // Neutral bright grey for optimal visibility in both themes
      matRef.current.color.set('#e0e0e0');
    }
  }, []);

  // Update cylinder uniforms every frame from live cache or store
  useFrame(() => {
    const shader = matRef.current.userData.shader;
    if (!shader || !activeModel) return;
    const chs = activeModel.channels.filter(c => c.startPoint && c.endPoint);
    const n = Math.min(chs.length, MAX_CYL);
    shader.uniforms.uCylCount.value = n;
    for (let i = 0; i < n; i++) {
      const live = _liveChannels.get(chs[i].id);
      matRef.current.userData.cylStarts[i].copy(live ? live.start : chs[i].startPoint);
      matRef.current.userData.cylEnds[i].copy(live ? live.end : chs[i].endPoint);
      matRef.current.userData.cylRadii[i] = (live ? live.diameter : chs[i].diameter) / 2;
    }
  });

  if (!activeModel?.geometry) return null;

  const performHolePlacement = (e) => {
    e.stopPropagation();
    
    // Perform a robust manual raycast using the exact click ray to guarantee we find backfaces
    const bvhMesh = new THREE.Mesh(activeModel.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const rc = new THREE.Raycaster();
    rc.ray.copy(e.ray);
    
    const hits = rc.intersectObject(bvhMesh);
    if (hits.length < 2) return; // We must have at least an entry and an exit
    
    const startPoint = hits[0].point.clone();
    const endPoint = hits[hits.length - 1].point.clone(); // Furthest point on the model
    
    addChannel(activeModelId, {
      id: `ch-${Date.now()}`,
      startPoint,
      endPoint,
      diameter: defaultDiameter
    });
    setIsEditing(false);
  };

  const handleClick = (e) => {
    if (!isEditing) return;
    performHolePlacement(e);
  };

  const handleDoubleClick = (e) => {
    performHolePlacement(e);
  };

  return (
    <group>
      <mesh geometry={activeModel.geometry} material={matRef.current}
        onClick={handleClick} onDoubleClick={handleDoubleClick} castShadow receiveShadow
      />
      {activeModel.channels.map(ch => (
        <ChannelVisualizer key={ch.id} channel={ch} />
      ))}
    </group>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function Viewport3D() {
  return (
    <Canvas
      orthographic
      camera={{ position: [100, 100, 100], zoom: 50, near: -10000, far: 10000 }}
      gl={{ alpha: true, antialias: true, stencil: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <ambientLight intensity={0.6} />
      <CameraLight />
      <directionalLight position={[100, 100, 100]} intensity={0.8} />
      <Suspense fallback={null}>
        <ModelViewer />
      </Suspense>
      <SceneControls />
    </Canvas>
  );
}
