import * as THREE from 'three';

// ─── Triangle-plane intersection ─────────────────────────────────────────────

function triPlaneIntersect(A, B, C, dA, dB, dC) {
  const pts = [];
  const edges = [[A, B, dA, dB], [B, C, dB, dC], [C, A, dC, dA]];
  for (const [P, Q, dp, dq] of edges) {
    if ((dp < 0) !== (dq < 0)) {
      const t = dp / (dp - dq);
      pts.push(new THREE.Vector3().lerpVectors(P, Q, t));
    }
    if (pts.length === 2) break;
  }
  return pts.length === 2 ? pts : null;
}

// ─── Extract raw intersection segments from geometry ─────────────────────────

function extractSegments(geometry, plane) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  const segments = [];

  for (let t = 0; t < triCount; t++) {
    const ia = idx ? idx.getX(t * 3)     : t * 3;
    const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    A.fromBufferAttribute(pos, ia);
    B.fromBufferAttribute(pos, ib);
    C.fromBufferAttribute(pos, ic);
    const seg = triPlaneIntersect(
      A, B, C,
      plane.distanceToPoint(A),
      plane.distanceToPoint(B),
      plane.distanceToPoint(C)
    );
    if (seg) segments.push(seg);
  }
  return segments;
}

// ─── FIX 1: Hash-map based loop connector ────────────────────────────────────
// The old O(n²) greedy approach picked wrong neighbours when eps was too tight.
// This version snaps vertices to a grid once, builds adjacency in O(n),
// then traces loops in O(n) – no distance comparisons during tracing.

function connectSegmentsToLoops(segments, planeNormal, eps = 0.02) {
  if (segments.length === 0) return [];

  const GRID = Math.round(1 / eps);
  const key = v =>
    `${Math.round(v.x * GRID)},${Math.round(v.y * GRID)},${Math.round(v.z * GRID)}`;

  // Build adjacency: snapped_key → [(segIdx, isVertex0)]
  const adj = new Map();
  for (let i = 0; i < segments.length; i++) {
    const k0 = key(segments[i][0]), k1 = key(segments[i][1]);
    if (!adj.has(k0)) adj.set(k0, []);
    if (!adj.has(k1)) adj.set(k1, []);
    adj.get(k0).push([i, true]);  // at v0, next is v1
    adj.get(k1).push([i, false]); // at v1, next is v0
  }

  const used = new Uint8Array(segments.length);
  const loops = [];
  const _din  = new THREE.Vector3();
  const _dout = new THREE.Vector3();
  const _cross = new THREE.Vector3();

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;

    used[start] = 1;
    const [s0, s1] = segments[start];
    const loop = [s0.clone(), s1.clone()];
    const startKey = key(s0);

    let prevPt = s0;
    let curPt  = s1;

    for (let guard = 0; guard < segments.length; guard++) {
      const curKey = key(curPt);
      if (curKey === startKey) break; // loop closed

      const nbrs = adj.get(curKey);
      if (!nbrs) break;

      // Incoming direction (normalised)
      _din.subVectors(curPt, prevPt);
      const dinLen = _din.length();
      if (dinLen < 1e-10) break;
      _din.divideScalar(dinLen);

      // Angular selection: pick the most-CW turn (smallest signed CCW angle)
      // This prevents crossing edges at junctions caused by epsilon snapping.
      let bestAngle = Infinity;
      let bestIdx   = -1;
      let bestPt    = null;

      for (const [i, isV0] of nbrs) {
        if (used[i]) continue;
        const nextPt = isV0 ? segments[i][1] : segments[i][0];

        _dout.subVectors(nextPt, curPt);
        const doutLen = _dout.length();
        if (doutLen < 1e-10) continue; // degenerate
        _dout.divideScalar(doutLen);

        _cross.crossVectors(_din, _dout);
        // Signed angle in [-π, π]: negative = CW, positive = CCW
        const angle = Math.atan2(_cross.dot(planeNormal), _din.dot(_dout));

        if (angle < bestAngle) {
          bestAngle = angle;
          bestIdx   = i;
          bestPt    = nextPt;
        }
      }

      if (bestIdx === -1) break; // dead end

      used[bestIdx] = 1;
      loop.push(bestPt.clone());
      prevPt = curPt;
      curPt  = bestPt;

      // Break immediately if we just reached the start vertex
      if (key(curPt) === startKey) break;
    }

    // Remove closing duplicate if present
    if (loop.length > 1 && loop[0].distanceTo(loop[loop.length - 1]) < eps * 2)
      loop.pop();

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}


// ─── 2D signed area ───────────────────────────────────────────────────────────

function signedArea2D(loop, u, v, origin) {
  let area = 0;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = loop[i].clone().sub(origin);
    const pj = loop[j].clone().sub(origin);
    area += pi.dot(u) * pj.dot(v) - pj.dot(u) * pi.dot(v);
  }
  return area / 2;
}

// ─── Douglas-Peucker 2D simplification ───────────────────────────────────────

function dpPerpendicularDist(pt, lineA, lineB) {
  const dx = lineB.x - lineA.x;
  const dy = lineB.y - lineA.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return pt.distanceTo(lineA);
  const t = ((pt.x - lineA.x) * dx + (pt.y - lineA.y) * dy) / len2;
  return pt.distanceTo(new THREE.Vector2(lineA.x + t * dx, lineA.y + t * dy));
}

function douglasPeucker2D(pts, epsilon) {
  if (pts.length < 3) return pts;
  let maxDist = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dpPerpendicularDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > epsilon) {
    const left  = douglasPeucker2D(pts.slice(0, idx + 1), epsilon);
    const right = douglasPeucker2D(pts.slice(idx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ─── Public: extractContourLoops (debug) ─────────────────────────────────────

/**
 * Returns raw 3D loops for debug visualisation.
 * Call this with the same geometry + plane you pass to buildCappingMesh.
 */
function extractContourLoops(geometry, plane) {
  const segments = extractSegments(geometry, plane);
  return connectSegmentsToLoops(segments, plane.normal);
}

// ─── Public: computeAutoAlignAngle ───────────────────────────────────────────

function computeAutoAlignAngle(geometry, channelAxis, channelMidpoint) {
  const arb = Math.abs(channelAxis.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const perpBase = new THREE.Vector3().crossVectors(channelAxis, arb).normalize();

  let minWidth = Infinity, bestAngle = 0;

  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI;
    const normal = perpBase.clone().applyAxisAngle(channelAxis, angle);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, channelMidpoint);
    const segs = extractSegments(geometry, plane);
    if (!segs.length) continue;
    const vDir = new THREE.Vector3().crossVectors(normal, channelAxis).normalize();
    let lo = Infinity, hi = -Infinity;
    for (const [a, b] of segs) {
      const pa = a.clone().sub(channelMidpoint).dot(vDir);
      const pb = b.clone().sub(channelMidpoint).dot(vDir);
      if (pa < lo) lo = pa; if (pa > hi) hi = pa;
      if (pb < lo) lo = pb; if (pb > hi) hi = pb;
    }
    const w = hi - lo;
    if (w < minWidth) { minWidth = w; bestAngle = angle; }
  }

  return bestAngle;
}

// ─── Public: buildSectionPlane ────────────────────────────────────────────────

function buildSectionPlane(channel, angle) {
  const axis = channel.endPoint.clone().sub(channel.startPoint).normalize();
  const midpoint = channel.startPoint.clone().lerp(channel.endPoint, 0.5);
  const arb = Math.abs(axis.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const perpBase = new THREE.Vector3().crossVectors(axis, arb).normalize();
  const normal = perpBase.clone().applyAxisAngle(axis, angle);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, midpoint);
  const u = axis.clone();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return { plane, normal, axis, midpoint, u, v };
}


// ─── 2D point-in-polygon (ray casting) ───────────────────────────────────────

/*
function pointInPolygon2D(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
*/

// ─── Build BufferGeometry from 2D positions + index array + 3D transform ─────

function geo3DFromFlat(positions2D, indices, midpoint, u, v) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(positions2D.length * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < positions2D.length; i++) {
    tmp.copy(midpoint).addScaledVector(u, positions2D[i].x).addScaledVector(v, positions2D[i].y);
    arr[i * 3] = tmp.x; arr[i * 3 + 1] = tmp.y; arr[i * 3 + 2] = tmp.z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}


// ─── Algorithm 3: MIN_WEIGHT (MeshLab / Liepa 2003) ──────────────────────────
// O(n³) dynamic programming minimizing total triangle area.
// Robust for concave polygons. Based on the "optimal polygon triangulation" DP.

function triMinWeight(outerPts2D, midpoint, u, v) {
  const pts = outerPts2D;
  const n = pts.length;
  if (n < 3) return null;

  // triangleCost: area of triangle i-j-k
  const cost = (i, j, k) => {
    const ax = pts[j].x - pts[i].x, ay = pts[j].y - pts[i].y;
    const bx = pts[k].x - pts[i].x, by = pts[k].y - pts[i].y;
    return Math.abs(ax * by - ay * bx) * 0.5;
  };

  // dp[i][j] = min-cost triangulation of sub-polygon from vertex i to j
  const dp   = Array.from({ length: n }, () => new Float64Array(n));
  const prev = Array.from({ length: n }, () => new Int32Array(n).fill(-1));

  for (let len = 2; len < n; len++) {
    for (let i = 0; i + len < n; i++) {
      const j = i + len;
      dp[i][j] = Infinity;
      for (let k = i + 1; k < j; k++) {
        const val = dp[i][k] + dp[k][j] + cost(i, k, j);
        if (val < dp[i][j]) { dp[i][j] = val; prev[i][j] = k; }
      }
    }
  }

  const indices = [];
  (function reconstruct(i, j) {
    if (j <= i + 1) return;
    const k = prev[i][j];
    if (k < 0) return;
    indices.push(i, k, j);
    reconstruct(i, k);
    reconstruct(k, j);
  })(0, n - 1);

  return geo3DFromFlat(pts, indices, midpoint, u, v);
}



// ─── Public: buildCappingMesh ────────────────────────────────────────────────

function buildCappingMesh(geometry, plane, { u, v, normal, midpoint }, _unused = [], algorithm = 'EARCUT') {
  const segments = extractSegments(geometry, plane);
  const loops    = connectSegmentsToLoops(segments, normal);

  console.log(`[SectionView] segs=${segments.length}  loops=${loops.length}  alg=${algorithm}`, loops.map(l => l.length));

  if (loops.length === 0) return null;

  // Classify by winding
  const outers = [], innerHoles = [];
  for (const loop of loops) {
    (signedArea2D(loop, u, v, midpoint) > 0 ? outers : innerHoles).push(loop);
  }
  if (outers.length === 0) {
    loops.sort((a, b) =>
      Math.abs(signedArea2D(b, u, v, midpoint)) - Math.abs(signedArea2D(a, u, v, midpoint))
    );
    innerHoles.length = 0;
    outers.push(loops[0]);
    loops.slice(1).forEach(l => innerHoles.push(l));
  }

  const to2D = loop => loop.map(p => {
    const r = p.clone().sub(midpoint);
    return new THREE.Vector2(r.dot(u), r.dot(v));
  });

  // Channel bore rectangles
  /*
  const channelHolePaths = activeChannels.map(ch => {
    if (!ch.startPoint || !ch.endPoint) return null;
    const r = (ch.diameter / 2) * 1.05;
    const relS = ch.startPoint.clone().sub(midpoint);
    const relE = ch.endPoint.clone().sub(midpoint);
    const uMin = Math.min(relS.dot(u), relE.dot(u));
    const uMax = Math.max(relS.dot(u), relE.dot(u));
    const hp = new THREE.Path();
    hp.moveTo(uMin, -r); hp.lineTo(uMin, r);
    hp.lineTo(uMax, r);  hp.lineTo(uMax, -r);
    hp.closePath();
    return hp;
  }).filter(Boolean);
  */

  const DP_EPSILON = 0.005; // 5 microns - much higher precision for curved edges
  const outerPts  = douglasPeucker2D(to2D(outers[0]), DP_EPSILON);
  // eslint-disable-next-line no-unused-vars
  const holePts2D = innerHoles.map(h => douglasPeucker2D(to2D(h), DP_EPSILON));

  console.log(`[Cap] alg=${algorithm} outer=${outerPts.length}pts holes=${innerHoles.length}`);

  return triMinWeight(outerPts, midpoint, u, v);
}

export {
  extractContourLoops,
  computeAutoAlignAngle,
  buildSectionPlane,
  buildCappingMesh
};

