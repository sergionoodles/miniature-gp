import * as THREE from 'three'
import { addShaderPatch } from './shaderPatches'

// Wireframe water is a near-black surface drawn with two sets of animated lines: long wavy swell
// lines broken into drifting crests across open water, and surf lines that follow the coastline
// and roll in toward a thin shore outline. Every line fades out where its neighbours crowd closer
// than a few pixels, so distant water settles into darkness instead of shimmering.
const WATER_FILL = 0x020303
const SWELL_GREY = 0.16
const SURF_GREY = 0.26
// Kept under the bloom threshold, so the coastline stays a crisp line instead of glowing blobs.
const SHORE_GREY = 0.3
// Scene units between swell lines, and seconds the clock may advance in one frame.
const SWELL_SPACING = 3.2
const MAX_STEP_SECONDS = 0.1

const WATER_FUNCTIONS = /* glsl */ `
uniform float waterTime;
uniform vec3 waterSwell;
uniform vec3 waterSurf;
uniform vec3 waterShore;
uniform vec2 waterFade;
varying vec2 vWaterPosition;
varying float vShallowness;
// A one-pixel line on each whole value, faded out once the lines are under ~8 pixels apart.
float waterLine( float value ) {
  float width = max( fwidth( value ), 1e-4 );
  float line = 1.0 - min( abs( fract( value - 0.5 ) - 0.5 ) / width, 1.0 );
  return line * ( 1.0 - smoothstep( 0.12, 0.35, width ) );
}
`

const WATER_LINES = /* glsl */ `
  // Swell runs at an angle to the circuit grid, its lines bent by two crossing waves.
  vec2 swellPosition = mat2( 0.8, -0.6, 0.6, 0.8 ) * vWaterPosition;
  float swellValue = swellPosition.y / ${SWELL_SPACING.toFixed(2)}
    + 0.35 * sin( swellPosition.x * 0.32 + waterTime * 0.5 )
    + 0.08 * sin( swellPosition.x * 0.75 - swellPosition.y * 0.2 - waterTime * 0.8 );
  float crests = smoothstep( 0.45, 0.8, 0.5 + 0.35 * sin( swellPosition.x * 0.18 + swellPosition.y * 0.4 - waterTime * 0.35 )
    + 0.15 * sin( swellPosition.x * 0.05 + waterTime * 0.2 ) );
  float swell = waterLine( swellValue ) * crests * ( 1.0 - 0.6 * vShallowness );
  float surf = waterLine( vShallowness * 4.0 - waterTime * 0.25 ) * smoothstep( 0.05, 0.35, vShallowness );
  // The coastline is the line where the water is almost at the shore.
  float shore = 1.0 - min( abs( vShallowness - 0.9 ) / max( fwidth( vShallowness ), 1e-4 ), 1.0 );
  float waterVisibility = 1.0 - smoothstep( waterFade.x, waterFade.y, length( vWaterPosition ) );
  outgoingLight += ( waterSwell * swell + max( waterSurf * surf, waterShore * shore ) ) * waterVisibility;
`

// `fadeStart` and `fadeEnd` are distances from the circuit centre over which the lines die out.
export function createWireframeWater(fadeStart: number, fadeEnd: number) {
  const material = new THREE.MeshBasicMaterial({ color: WATER_FILL })
  const uniforms = {
    waterTime: { value: 0 },
    waterSwell: { value: new THREE.Color(SWELL_GREY, SWELL_GREY, SWELL_GREY) },
    waterSurf: { value: new THREE.Color(SURF_GREY, SURF_GREY, SURF_GREY) },
    waterShore: { value: new THREE.Color(SHORE_GREY, SHORE_GREY, SHORE_GREY) },
    waterFade: { value: new THREE.Vector2(fadeStart, fadeEnd) },
  }
  addShaderPatch(material, 'wireframe-water-v1', (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = `attribute float shallowness;\nvarying vec2 vWaterPosition;\nvarying float vShallowness;\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vWaterPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;
      vShallowness = shallowness;`)
    shader.fragmentShader = `${WATER_FUNCTIONS}\n${shader.fragmentShader}`.replace('#include <opaque_fragment>', `${WATER_LINES}
      #include <opaque_fragment>`)
  })
  const update = (deltaSeconds: number) => {
    uniforms.waterTime.value += Math.min(deltaSeconds, MAX_STEP_SECONDS)
  }
  return { material, update }
}
