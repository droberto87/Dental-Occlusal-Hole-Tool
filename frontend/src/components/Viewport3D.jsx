import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import * as THREE from 'three';
import { computeAutoAlignAngle, buildSectionPlane, buildCappingMesh, extractContourLoops } from '../utils/sectionView';

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
let _currentSectionBasis = null; // Shared basis for constrained dragging
const _liveChannels = new Map();
const _clippableMaterials = new Set(); // materials that get clipped in section view
const _sharedClippingPlane = new THREE.Plane(); // Stable plane reference to prevent GPU desync



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

function ChannelVisualizer({ channel, sectionViewActive }) {
  const { id, startPoint, endPoint, diameter } = channel;
  const { updateChannel, activeModelId, activeChannelId, models } = useStore();
  const { camera, gl } = useThree();
  const activeModel = models.find(m => m.id === activeModelId);
  const isActive = activeChannelId === id;

  // Local drag state (bypasses React/Zustand during drag)
  const startRef = useRef(startPoint.clone());
  const endRef   = useRef(endPoint.clone());
  const diamRef  = useRef(diameter);
  const initialStart = useRef(new THREE.Vector3());
  const initialEnd = useRef(new THREE.Vector3());
  const initialHit = useRef(new THREE.Vector3());
  const isPanning = useRef(false);
  const dirty    = useRef(true);
  const isDragStart = useRef(false);
  const isDragEnd   = useRef(false);

  // Sync from props when not dragging
  useEffect(() => {
    if (!isDragStart.current && !isDragEnd.current) {
      startRef.current.copy(startPoint);
      endRef.current.copy(endPoint);
    }
    diamRef.current = diameter;
    dirty.current = true;
  }, [startPoint, endPoint, diameter]);

  // BVH-accelerated mesh (shared reference)
  const bvhMeshRef = useRef(null);
  useEffect(() => {
    if (activeModel?.geometry) {
      bvhMeshRef.current = new THREE.Mesh(
        activeModel.geometry,
        new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
      );
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
  const midMeshRef   = useRef();
  const isDragMid    = useRef(false);

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
    if (midMeshRef.current) {
      const mid = startRef.current.clone().lerp(endRef.current, 0.5);
      midMeshRef.current.position.copy(mid);
      if (sectionViewActive && _currentSectionBasis) {
        // Orient the rotation icon to face the camera or the plane normal
        midMeshRef.current.lookAt(mid.clone().add(_currentSectionBasis.normal));
      }
    }

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

  const mkDrag = (type) => ({
    onPointerDown: (e) => {
      e.stopPropagation();
      gl.domElement.setPointerCapture(e.pointerId);
      setSuspend(true);
      useStore.setState({ activeChannelId: id });
      
      // Store initial state for delta calculations
      initialStart.current.copy(startRef.current);
      initialEnd.current.copy(endRef.current);
      initialHit.current.copy(e.point);
      isPanning.current = e.ctrlKey || e.metaKey;

      if (type === 'start') isDragStart.current = true;
      else                  isDragEnd.current = true;
    },
    onPointerMove: (e) => {
      if (isDragStart.current || isDragEnd.current) {
        e.stopPropagation();
        
        let pt = null;

        if (sectionViewActive && _currentSectionBasis) {
          // Section View: Constrain drag to the cutting plane
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(e.pointer, camera);
          const planeHit = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(_currentSectionBasis.plane, planeHit)) {
            // Now snap the plane-point to the nearest model surface point (the contour)
            // We can re-use the BVH to find the closest point on the mesh
            const closest = new THREE.Vector3();
            const result = bvhMeshRef.current.geometry.boundsTree.closestPointToPoint(planeHit, { point: closest });
            
            // To be perfectly precise, the point must be in the plane AND on the surface.
            // ClosestPointToPoint is good, but we should project it back to plane if it drifted.
            _currentSectionBasis.plane.projectPoint(closest, closest);
            pt = closest;
          }
        } else {
          // Normal View: Raycast to model surface
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(e.pointer, camera);
          const hits = raycaster.intersectObject(bvhMeshRef.current);
          if (hits.length > 0) pt = hits[0].point;
        }

        if (pt) {
          if (isPanning.current || isDragMid.current) {
            // Panning: move both points together
            if (sectionViewActive && _currentSectionBasis) {
              // Section View Panning: Shift midpoint, find new surface intersections along same axis
              const delta = new THREE.Vector3().subVectors(pt, initialHit.current);
              const oldMid = initialStart.current.clone().lerp(initialEnd.current, 0.5);
              const newMid = oldMid.clone().add(delta);
              const axis = initialEnd.current.clone().sub(initialStart.current).normalize();
              
              const ray = new THREE.Raycaster();
              ray.set(newMid, axis);
              const hE = ray.intersectObject(bvhMeshRef.current);
              if (hE.length > 0) endRef.current.copy(hE[0].point);
              
              ray.set(newMid, axis.clone().negate());
              const hS = ray.intersectObject(bvhMeshRef.current);
              if (hS.length > 0) startRef.current.copy(hS[0].point);
            } else {
              // Normal Panning: Simple delta move
              const delta = new THREE.Vector3().subVectors(pt, initialHit.current);
              startRef.current.copy(initialStart.current).add(delta);
              endRef.current.copy(initialEnd.current).add(delta);
            }
          } else {
            // Single point snapping
            if (isDragStart.current) startRef.current.copy(pt);
            else                    endRef.current.copy(pt);
          }
          dirty.current = true;
        }
      }
    },
    onPointerUp: (e) => {
      e.stopPropagation();
      if (isPanning.current || isDragMid.current) {
        updateChannel(activeModelId, id, { 
          startPoint: startRef.current.clone(),
          endPoint: endRef.current.clone()
        });
      } else {
        if (isDragStart.current) {
          updateChannel(activeModelId, id, { startPoint: startRef.current.clone() });
        } else {
          updateChannel(activeModelId, id, { endPoint: endRef.current.clone() });
        }
      }
      isDragStart.current = false;
      isDragEnd.current = false;
      isDragMid.current = false;
      isPanning.current = false;
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

  // In section view the active channel wall gets a darker bluish-grey
  const wallColor = sectionViewActive && isActive
    ? '#475569'
    : isActive ? '#cbd5e1' : '#94a3b8';

  // Register lateral wall material for section-view clipping
  const lateralMatRef = useRef(new THREE.MeshStandardMaterial({
    color: wallColor, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide
  }));
  useEffect(() => {
    _clippableMaterials.add(lateralMatRef.current);
    return () => _clippableMaterials.delete(lateralMatRef.current);
  }, []);
  // Keep color in sync
  useEffect(() => { lateralMatRef.current.color.set(wallColor); }, [wallColor]);

  return (
    <group>
      <mesh geometry={lateralGeo.current} material={lateralMatRef.current} />
      
      {/* Visual rings around entry/exit points */}
      {!sectionViewActive && (
        <>
          <line geometry={entryGeo.current}>
            <lineBasicMaterial color={isActive ? "#fbbf24" : "#60a5fa"} linewidth={isActive ? 3 : 2} />
          </line>
          <line geometry={exitGeo.current}>
            <lineBasicMaterial color={isActive ? "#fbbf24" : "#60a5fa"} linewidth={isActive ? 3 : 2} />
          </line>
        </>
      )}

      {/* Markers: show always in normal view, but ONLY for active channel in section view */}
      {(!sectionViewActive || isActive) && (
        <>
          <mesh ref={startMeshRef} {...mkDrag('start')}>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshStandardMaterial 
              color={isActive ? "#fbbf24" : "#2563eb"} 
              depthTest={!sectionViewActive}
              transparent={sectionViewActive}
              opacity={sectionViewActive ? 0.8 : 1.0}
            />
          </mesh>
          <mesh ref={endMeshRef} {...mkDrag('end')}>
            <sphereGeometry args={[0.35, 16, 16]} />
            <meshStandardMaterial 
              color={isActive ? "#fbbf24" : "#2563eb"} 
              depthTest={!sectionViewActive}
              transparent={sectionViewActive}
              opacity={sectionViewActive ? 0.8 : 1.0}
            />
          </mesh>
        </>
      )}

      {/* Rotation Marker (Center) - only in Section View */}
      {sectionViewActive && isActive && (
        <group
          ref={midMeshRef}
          onPointerDown={(e) => {
            e.stopPropagation();
            gl.domElement.setPointerCapture(e.pointerId);
            setSuspend(true);
            useStore.setState({ activeChannelId: id });
            initialStart.current.copy(startRef.current);
            initialEnd.current.copy(endRef.current);
            initialHit.current.copy(e.point);
            isDragMid.current = true;
          }}
          onPointerMove={(e) => {
            if (isDragMid.current) {
              e.stopPropagation();
              if (sectionViewActive && _currentSectionBasis) {
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(e.pointer, camera);
                const planeHit = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(_currentSectionBasis.plane, planeHit)) {
                  const pt = planeHit;
                  const delta = new THREE.Vector3().subVectors(pt, initialHit.current);
                  const oldMid = initialStart.current.clone().lerp(initialEnd.current, 0.5);
                  const newMid = oldMid.clone().add(delta);
                  const axis = initialEnd.current.clone().sub(initialStart.current).normalize();
                  
                  const ray = new THREE.Raycaster();
                  ray.set(newMid, axis);
                  const hE = ray.intersectObject(bvhMeshRef.current);
                  if (hE.length > 0) endRef.current.copy(hE[0].point);
                  
                  ray.set(newMid, axis.clone().negate());
                  const hS = ray.intersectObject(bvhMeshRef.current);
                  if (hS.length > 0) startRef.current.copy(hS[0].point);
                  
                  dirty.current = true;
                }
              }
            }
          }}
          onPointerUp={(e) => {
            if (isDragMid.current) {
              e.stopPropagation();
              updateChannel(activeModelId, id, { 
                startPoint: startRef.current.clone(),
                endPoint: endRef.current.clone()
              });
              isDragMid.current = false;
              setSuspend(false);
              gl.domElement.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            if (_activeControls) _activeControls.enableZoom = false;
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            if (_activeControls) _activeControls.enableZoom = true;
          }}
          onWheel={(e) => {
            if (!_currentSectionBasis) return;
            e.stopPropagation();
            
            const delta = e.deltaY * 0.001;
            const mid = startRef.current.clone().lerp(endRef.current, 0.5);
            const axis = endRef.current.clone().sub(startRef.current).normalize();
            
            const newAxis = axis.clone().applyAxisAngle(_currentSectionBasis.normal, delta);
            const ray = new THREE.Raycaster();
            if (!bvhMeshRef.current?.geometry?.boundsTree) return;

            ray.set(mid, newAxis);
            const hE = ray.intersectObject(bvhMeshRef.current);
            if (hE.length > 0) endRef.current.copy(hE[0].point);
            
            ray.set(mid, newAxis.clone().negate());
            const hS = ray.intersectObject(bvhMeshRef.current);
            if (hS.length > 0) startRef.current.copy(hS[0].point);
            
            dirty.current = true;
            updateChannel(activeModelId, id, { 
              startPoint: startRef.current.clone(),
              endPoint: endRef.current.clone()
            }, false);
            
            if (window._rotTimeout) clearTimeout(window._rotTimeout);
            window._rotTimeout = setTimeout(() => {
              useStore.getState()._saveHistory();
            }, 300);
          }}
        >
          {/* Visible Torus Ring */}
          <mesh>
            <torusGeometry args={[0.5, 0.04, 12, 48]} />
            <meshStandardMaterial color="#fbbf24" depthTest={false} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          {/* Invisible Hit Area (fills the inside) */}
          <mesh>
            <circleGeometry args={[0.5, 32]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ─── Loop point number sprite ───────────────────────────────────────────────

function NumberSprite({ position, index }) {
  const texture = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), 32, 32);
    return new THREE.CanvasTexture(c);
  }, [index]);
  return (
    <sprite position={position} scale={[1.5, 1.5, 1.5]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

// ─── Section View Renderer ───────────────────────────────────────────────────

function SectionViewRenderer({ activeModel, activeChannel }) {
  const { gl, camera } = useThree();
  const { isSectionView, sectionPlaneAngle, setSectionPlaneAngle, cappingAlgorithm, showDebugLabels, showCappingWireframe } = useStore();

  // useState so geometry swap triggers a React re-render
  const [cappingGeo, setCappingGeo] = useState(() => new THREE.BufferGeometry());
  const cappingMat = useRef(createCappingMaterial());
  const basisRef   = useRef(null);
  const camAnimRef = useRef({ active: false, fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(), t: 0 });
  const dragRef    = useRef({ active: false, startX: 0, startAngle: 0 });

  // ── Activate / Deactivate ────────────────────────────────────────────────
  useEffect(() => {
    if (!isSectionView || !activeChannel || !activeModel?.geometry) {
      gl.localClippingEnabled = false;
      gl.clippingPlanes = [];
      // Clear clipping from all tracked materials
      _clippableMaterials.forEach(m => { m.clippingPlanes = []; m.needsUpdate = true; });
      setCappingGeo(g => { g.dispose(); return new THREE.BufferGeometry(); });
      basisRef.current = null;
      _currentSectionBasis = null;
      return;
    }

    // Per-material clipping: model + channel materials get the plane,
    // the capping mesh material gets nothing → cap is never clipped
    gl.localClippingEnabled = true;
    gl.clippingPlanes = []; // no global clipping

    const axis = activeChannel.endPoint.clone().sub(activeChannel.startPoint).normalize();
    const midpoint = activeChannel.startPoint.clone().lerp(activeChannel.endPoint, 0.5);
    const autoAngle = computeAutoAlignAngle(activeModel.geometry, axis, midpoint);
    setSectionPlaneAngle(autoAngle);

    const basis = buildSectionPlane(activeChannel, autoAngle);
    basisRef.current = basis;
    _sharedClippingPlane.copy(basis.plane);
    // Set clipping on all tracked materials (using the stable reference)
    _clippableMaterials.forEach(m => { 
      m.clippingPlanes = [_sharedClippingPlane]; 
      m.needsUpdate = true; 
    });

    const box = new THREE.Box3().setFromBufferAttribute(activeModel.geometry.attributes.position);
    const size = new THREE.Vector3(); box.getSize(size);
    const dist = Math.max(size.x, size.y, size.z) * 1.4;

    const anim = camAnimRef.current;
    anim.fromPos.copy(camera.position);
    anim.toPos.copy(midpoint).addScaledVector(basis.normal, -dist);
    anim.t = 0;
    anim.active = true;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSectionView, activeChannel?.id]);

  useEffect(() => {
    const canvas = gl.domElement;
    
    // 1. Prevent Browser Zoom (Ctrl+Wheel) AND 3D Zoom
    const onGlobalWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Crucial to block ArcballControls
        if (isSectionView && activeChannel) {
          const delta = e.deltaY * 0.001;
          setSectionPlaneAngle(useStore.getState().sectionPlaneAngle + delta);
        }
      }
    };

    // Use capture phase on window to intercept before canvas listeners
    window.addEventListener('wheel', onGlobalWheel, { capture: true, passive: false });
    
    // 2. Shift+drag plane rotation 
    const onDown = (e) => {
      if (!isSectionView || !e.shiftKey) return;
      if (_activeControls) _activeControls.enabled = false;
      dragRef.current.active = true;
      dragRef.current.startX = e.clientX;
      dragRef.current.startAngle = useStore.getState().sectionPlaneAngle;
    };
    const onMove = (e) => {
      if (!dragRef.current.active) return;
      const delta = e.clientX - dragRef.current.startX;
      setSectionPlaneAngle(dragRef.current.startAngle + delta * (Math.PI / 360));
    };
    const onUp = () => {
      if (!dragRef.current.active) return;
      dragRef.current.active = false;
      if (_activeControls) _activeControls.enabled = true;
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('wheel', onGlobalWheel, { capture: true });
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSectionView, activeChannel?.id, gl]);

  // ── Rebuild plane + capping whenever angle (or section) changes ──────────
  useEffect(() => {
    if (!isSectionView || !activeChannel || !activeModel?.geometry) return;

    const basis = buildSectionPlane(activeChannel, sectionPlaneAngle);
    basisRef.current = basis;
    _currentSectionBasis = basis;
    _sharedClippingPlane.copy(basis.plane);
    
    // Ensure all materials point to the same shared plane
    _clippableMaterials.forEach(m => {
      if (!m.clippingPlanes || m.clippingPlanes[0] !== _sharedClippingPlane) {
        m.clippingPlanes = [_sharedClippingPlane];
        m.needsUpdate = true;
      }
    });
    if (!camAnimRef.current.active) {
      const box = new THREE.Box3().setFromBufferAttribute(activeModel.geometry.attributes.position);
      const size = new THREE.Vector3(); box.getSize(size);
      const dist = Math.max(size.x, size.y, size.z) * 1.4;

      camera.position.copy(basis.midpoint).addScaledVector(basis.normal, -dist);
      camera.up.copy(basis.axis); 
      camera.lookAt(basis.midpoint);
      if (_activeControls) {
        _activeControls.target.copy(basis.midpoint);
        _activeControls.update();
      }
    }

    const geo = buildCappingMesh(activeModel.geometry, _sharedClippingPlane, basis, [activeChannel]);
    setCappingGeo(old => { old.dispose(); return geo || new THREE.BufferGeometry(); });


  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionPlaneAngle, isSectionView, activeChannel?.id]);

  // ── Camera animation & continuous sync ───────────────────────────────────
  useFrame(() => {
    const anim = camAnimRef.current;
    if (anim.active) {
      anim.t = Math.min(anim.t + 0.04, 1);
      const ease = 1 - Math.pow(1 - anim.t, 3);
      camera.position.lerpVectors(anim.fromPos, anim.toPos, ease);
      if (basisRef.current) {
        camera.up.copy(basisRef.current.axis);
        camera.lookAt(basisRef.current.midpoint);
      }
      camera.updateProjectionMatrix();
      if (_activeControls && basisRef.current) {
        _activeControls.target.copy(basisRef.current.midpoint);
        _activeControls.update();
      }
      if (anim.t >= 1) anim.active = false;
    }
  });

  // Update capping material uniforms every frame
  useFrame(() => {
    const shader = cappingMat.current.userData.shader;
    if (!shader || !activeModel || !isSectionView) return;
    const chs = activeModel.channels.filter(c => c.startPoint && c.endPoint);
    const n = Math.min(chs.length, MAX_CYL);
    shader.uniforms.uCylCount.value = n;
    for (let i = 0; i < n; i++) {
      const live = _liveChannels.get(chs[i].id);
      cappingMat.current.userData.cylStarts[i].copy(live ? live.start : chs[i].startPoint);
      cappingMat.current.userData.cylEnds[i].copy(live ? live.end : chs[i].endPoint);
      cappingMat.current.userData.cylRadii[i] = (live ? live.diameter : chs[i].diameter) / 2;
    }
  });

  if (!isSectionView) return null;

  return (
    <group>
      {cappingGeo.attributes?.position && (
        <mesh geometry={cappingGeo} material={cappingMat.current} />
      )}
    </group>
  );
}

// ─── Custom shader material: transparent inside cylinders ────────────────────

const MAX_CYL = 8;

function createCappingMaterial() {
  const cylStarts = Array.from({ length: MAX_CYL }, () => new THREE.Vector3());
  const cylEnds   = Array.from({ length: MAX_CYL }, () => new THREE.Vector3());
  const cylRadii  = new Float32Array(MAX_CYL);

  const mat = new THREE.MeshStandardMaterial({
    color: '#fbbf24', roughness: 0.45, metalness: 0.05,
    side: THREE.DoubleSide, depthTest: true,
    polygonOffset: true, 
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
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
        // Keep 5mm margin behind start, but cut infinitely towards the end point
        if (t >= -5.0 && radDist <= uCylRadii[i]) {
            discard;
        }
      }`
    );
  };

  mat.userData.cylStarts = cylStarts;
  mat.userData.cylEnds   = cylEnds;
  mat.userData.cylRadii  = cylRadii;
  return mat;
}

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
      <cylinderGeometry args={[diameter/2, diameter/2, dist, 64, 1, true]} />
      <meshStandardMaterial color="#3b82f6" transparent opacity={0.2}
        side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function ModelViewer() {
  const { camera } = useThree();
  const {
    models, activeModelId, activeChannelId,
    placementStep, setPlacementStep,
    setTempStartPoint, setTempEndPoint, tempStartPoint, tempEndPoint,
    addChannel, defaultDiameter, setIsEditing, isEditing, darkMode,
    isSectionView
  } = useStore();
  const activeModel = models.find(m => m.id === activeModelId);
  const activeChannel = activeModel?.channels?.find(c => c.id === activeChannelId);
  const matRef = useRef(createChannelMaterial());

  // Register model material for section-view clipping
  useEffect(() => {
    _clippableMaterials.add(matRef.current);
    return () => _clippableMaterials.delete(matRef.current);
  }, []);

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
        <ChannelVisualizer key={ch.id} channel={ch} sectionViewActive={isSectionView} />
      ))}
      <SectionViewRenderer activeModel={activeModel} activeChannel={activeChannel} />
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
