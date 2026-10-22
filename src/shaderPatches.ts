import * as THREE from 'three'

type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void

// A material has a single onBeforeCompile hook, so patches chain onto it to let independent
// effects (hover isolation, cloud shadows, facade scaling) share one material.
export function addShaderPatch(material: THREE.Material, key: string, patch: ShaderPatch) {
  const previousPatch = material.onBeforeCompile.bind(material)
  const previousKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previousPatch(shader, renderer)
    patch(shader)
  }
  material.customProgramCacheKey = () => `${previousKey()}|${key}`
}

export function sceneMaterials(scene: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) return
    const values = Array.isArray(object.material) ? object.material : [object.material]
    values.forEach((material: THREE.Material) => materials.add(material))
  })
  return materials
}

const CLOUD_SCALE = 0.012
const CLOUD_SOFTNESS = 0.12
const CLOUD_SHADOW_DEPTH = 0.62
// Real-time drift in scene units per second, so the sky stays alive while the replay is paused.
const CLOUD_DRIFT = new THREE.Vector2(1.6, 0.7)
const MAX_FRAME_SECONDS = 0.1

const CLOUD_NOISE = /* glsl */ `
uniform vec2 cloudOffset;
uniform float cloudCover;
uniform float cloudShadowStrength;
varying vec2 vCloudPosition;
float cloudHash( vec2 point ) { return fract( sin( dot( point, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cloudNoise( vec2 point ) {
  vec2 cell = floor( point );
  vec2 local = fract( point );
  vec2 blend = local * local * ( 3.0 - 2.0 * local );
  return mix( mix( cloudHash( cell ), cloudHash( cell + vec2( 1.0, 0.0 ) ), blend.x ), mix( cloudHash( cell + vec2( 0.0, 1.0 ) ), cloudHash( cell + vec2( 1.0, 1.0 ) ), blend.x ), blend.y );
}
float cloudShade( vec2 position ) {
  vec2 point = ( position + cloudOffset ) * ${CLOUD_SCALE};
  float density = cloudNoise( point ) * 0.55 + cloudNoise( point * 2.3 + 17.0 ) * 0.3 + cloudNoise( point * 5.1 + 3.0 ) * 0.15;
  float threshold = 1.0 - cloudCover;
  return 1.0 - cloudShadowStrength * smoothstep( threshold - ${CLOUD_SOFTNESS}, threshold + ${CLOUD_SOFTNESS}, density );
}
`

// Drifting cloud shadows dim only direct sunlight, so shaded patches keep their sky fill.
export function createCloudShadows() {
  const uniforms = { cloudOffset: { value: new THREE.Vector2() }, cloudCover: { value: 0 }, cloudShadowStrength: { value: 0 } }
  const applyTo = (materials: Iterable<THREE.Material>) => {
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshLambertMaterial)) continue
      addShaderPatch(material, 'cloud-shadows-v1', (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = `varying vec2 vCloudPosition;\n${shader.vertexShader}`.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vec4 cloudPosition = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            cloudPosition = instanceMatrix * cloudPosition;
          #endif
          vCloudPosition = ( modelMatrix * cloudPosition ).xz;`)
        shader.fragmentShader = `${CLOUD_NOISE}\n${shader.fragmentShader}`.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          float sunThroughClouds = cloudShade( vCloudPosition );
          reflectedLight.directDiffuse *= sunThroughClouds;
          reflectedLight.directSpecular *= sunThroughClouds;`)
      })
    }
  }
  // Broken cloud casts the most distinct shadows; a full overcast is already a uniformly dim sun.
  const update = (cloudCover: number, deltaSeconds: number) => {
    uniforms.cloudCover.value = cloudCover
    uniforms.cloudShadowStrength.value = CLOUD_SHADOW_DEPTH * Math.sin(Math.PI * THREE.MathUtils.clamp(cloudCover, 0, 1))
    uniforms.cloudOffset.value.addScaledVector(CLOUD_DRIFT, THREE.MathUtils.clamp(deltaSeconds, 0, MAX_FRAME_SECONDS))
  }
  return { applyTo, update }
}
