import * as THREE from 'three';
import { Evaluator, Brush, SUBTRACTION } from 'three-bvh-csg';

/**
 * Performs CSG subtraction of channels from the model geometry.
 */
export async function processCSG(modelGeometry, channels) {
  if (!channels || channels.length === 0) return modelGeometry;

  // Initialize Evaluator
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal', 'stl_attribute']; // Important to preserve our custom attribute

  // Setup Model Brush
  const modelMaterial = new THREE.MeshStandardMaterial();
  const modelBrush = new Brush(modelGeometry, modelMaterial);
  modelBrush.updateMatrixWorld();

  let resultBrush = modelBrush;

  // Process each channel
  for (const channel of channels) {
    const { startPoint, endPoint, diameter } = channel;
    
    // Calculate cylinder geometry
    const distance = startPoint.distanceTo(endPoint);
    // Add extra length (5mm on each side) to ensure it cuts through steep morphology completely
    const cutDistance = distance + 10.0; 
    
    const cylinderGeo = new THREE.CylinderGeometry(diameter / 2, diameter / 2, cutDistance, 64);
    
    // Setup cylinder position and rotation
    const position = startPoint.clone().lerp(endPoint, 0.5);
    const direction = endPoint.clone().sub(startPoint).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    
    // Add default stl_attribute to the cylinder so the cut faces have a color (0 means no special color/default)
    const posCount = cylinderGeo.attributes.position.count;
    const attrArray = new Uint16Array(posCount);
    // Assign 0 or a specific Exocad color code if known. For now, 0.
    for(let i=0; i<posCount; i++) attrArray[i] = 0; 
    cylinderGeo.setAttribute('stl_attribute', new THREE.BufferAttribute(attrArray, 1));

    const channelBrush = new Brush(cylinderGeo, modelMaterial);
    channelBrush.position.copy(position);
    channelBrush.quaternion.copy(quaternion);
    channelBrush.updateMatrixWorld();

    // Subtract
    resultBrush = evaluator.evaluate(resultBrush, channelBrush, SUBTRACTION);
  }

  return resultBrush.geometry;
}
