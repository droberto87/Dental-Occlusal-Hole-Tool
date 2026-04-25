import * as THREE from 'three';

/**
 * Parses a binary STL file and preserves the 80-byte header and 2-byte face attributes.
 */
export function parseSTLWithAttributes(arrayBuffer) {
  const dataView = new DataView(arrayBuffer);
  
  // Read header (80 bytes)
  const headerBytes = new Uint8Array(arrayBuffer, 0, 80);
  
  // Read triangle count
  const numTriangles = dataView.getUint32(80, true);
  
  // Create arrays for BufferGeometry
  const positions = new Float32Array(numTriangles * 3 * 3); // 3 vertices per triangle, 3 coords per vertex
  const normals = new Float32Array(numTriangles * 3 * 3);
  const attributes = new Uint16Array(numTriangles * 3); // 1 attribute per vertex (same for all 3 in a face)
  
  let offset = 84;
  let pIdx = 0;
  let nIdx = 0;
  let aIdx = 0;

  for (let i = 0; i < numTriangles; i++) {
    // Normal
    const nx = dataView.getFloat32(offset, true);
    const ny = dataView.getFloat32(offset + 4, true);
    const nz = dataView.getFloat32(offset + 8, true);
    offset += 12;

    // V1
    const v1x = dataView.getFloat32(offset, true);
    const v1y = dataView.getFloat32(offset + 4, true);
    const v1z = dataView.getFloat32(offset + 8, true);
    offset += 12;

    // V2
    const v2x = dataView.getFloat32(offset, true);
    const v2y = dataView.getFloat32(offset + 4, true);
    const v2z = dataView.getFloat32(offset + 8, true);
    offset += 12;

    // V3
    const v3x = dataView.getFloat32(offset, true);
    const v3y = dataView.getFloat32(offset + 4, true);
    const v3z = dataView.getFloat32(offset + 8, true);
    offset += 12;

    // Attribute (2 bytes)
    const attr = dataView.getUint16(offset, true);
    offset += 2;

    // Store positions
    positions[pIdx++] = v1x; positions[pIdx++] = v1y; positions[pIdx++] = v1z;
    positions[pIdx++] = v2x; positions[pIdx++] = v2y; positions[pIdx++] = v2z;
    positions[pIdx++] = v3x; positions[pIdx++] = v3y; positions[pIdx++] = v3z;

    // Store normals
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;
    normals[nIdx++] = nx; normals[nIdx++] = ny; normals[nIdx++] = nz;

    // Store attributes (per vertex so Three.js handles it, though it's logically per face)
    attributes[aIdx++] = attr;
    attributes[aIdx++] = attr;
    attributes[aIdx++] = attr;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('stl_attribute', new THREE.BufferAttribute(attributes, 1));
  
  // We don't merge vertices by default because STL colors are per-face and merging might blend them.
  // We'll rely on the CSG library to handle unmerged geometry, or we might need to merge and track face colors differently if CSG fails.

  return { geometry, headerBytes };
}

/**
 * Exports a BufferGeometry back to a binary STL, retaining the original header and attributes if possible.
 */
export function exportSTLWithAttributes(geometry, originalHeaderBytes) {
  // Ensure we are working with un-indexed geometry so each face has 3 distinct vertices
  let nonIndexedGeo = geometry;
  if (geometry.index) {
    nonIndexedGeo = geometry.toNonIndexed();
  }

  const positions = nonIndexedGeo.getAttribute('position').array;
  const normals = nonIndexedGeo.getAttribute('normal')?.array;
  const attributes = nonIndexedGeo.getAttribute('stl_attribute')?.array;

  const numTriangles = positions.length / 9;
  const bufferSize = 80 + 4 + (numTriangles * 50);
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const dataView = new DataView(arrayBuffer);

  // Write Header
  const headerDest = new Uint8Array(arrayBuffer, 0, 80);
  if (originalHeaderBytes) {
    headerDest.set(originalHeaderBytes);
  } else {
    // Default empty header
    for (let i = 0; i < 80; i++) headerDest[i] = 0;
  }

  // Write Triangle Count
  dataView.setUint32(80, numTriangles, true);

  let offset = 84;
  let pIdx = 0;
  let nIdx = 0;
  let aIdx = 0;

  for (let i = 0; i < numTriangles; i++) {
    // Normal (calculate if missing or use existing)
    if (normals) {
      dataView.setFloat32(offset, normals[nIdx], true);
      dataView.setFloat32(offset + 4, normals[nIdx + 1], true);
      dataView.setFloat32(offset + 8, normals[nIdx + 2], true);
      nIdx += 9; // Skip next 2 vertices' normals
    } else {
      // Basic normal calculation could go here, for now write 0s
      dataView.setFloat32(offset, 0, true);
      dataView.setFloat32(offset + 4, 0, true);
      dataView.setFloat32(offset + 8, 0, true);
    }
    offset += 12;

    // V1
    dataView.setFloat32(offset, positions[pIdx++], true);
    dataView.setFloat32(offset + 4, positions[pIdx++], true);
    dataView.setFloat32(offset + 8, positions[pIdx++], true);
    offset += 12;

    // V2
    dataView.setFloat32(offset, positions[pIdx++], true);
    dataView.setFloat32(offset + 4, positions[pIdx++], true);
    dataView.setFloat32(offset + 8, positions[pIdx++], true);
    offset += 12;

    // V3
    dataView.setFloat32(offset, positions[pIdx++], true);
    dataView.setFloat32(offset + 4, positions[pIdx++], true);
    dataView.setFloat32(offset + 8, positions[pIdx++], true);
    offset += 12;

    // Attribute
    let attr = 0;
    if (attributes) {
      attr = attributes[aIdx];
      aIdx += 3; // Skip next 2 vertices
    }
    dataView.setUint16(offset, attr, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'application/octet-stream' });
}
