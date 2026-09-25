import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { GraphicsQuality } from './graphicsQuality'

const MAX_PIXEL_RATIO = 1.5
const MSAA_SAMPLES = 4
const EXPOSURE = 1
const BLOOM_RADIUS = 0.55
// Above sunlit white paint, so only emissive signals and specular glints bloom.
const BLOOM_THRESHOLD = 1.5
// Ambient occlusion radius is in scene units: about half a car length, enough to seat trees,
// stands and cars on the ground without darkening open lawns.
const AO_PARAMETERS = { radius: 1.6, distanceExponent: 1.4, thickness: 2.5, scale: 1.15, samples: 8 }
const AO_DENOISE = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 }
// Tilt-shift blur at the top and bottom of the frame sells the miniature scale; the band
// around the centre stays sharp so the field stays readable.
const TILT_FOCUS_HALF_HEIGHT = 0.2
const TILT_BLUR_SHARE = 0.0032
const VIGNETTE = 0.26
const SATURATION = 1.08
const CONTRAST = 1.04

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    blurPixels: { value: 0 },
    focusHalfHeight: { value: TILT_FOCUS_HALF_HEIGHT },
    vignette: { value: VIGNETTE },
    saturation: { value: SATURATION },
    contrast: { value: CONTRAST },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float blurPixels;
    uniform float focusHalfHeight;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    const int TAPS = 10;
    void main() {
      vec4 color = texture2D( tDiffuse, vUv );
      float outOfFocus = smoothstep( 0.0, 0.5 - focusHalfHeight, abs( vUv.y - 0.5 ) - focusHalfHeight );
      float radius = blurPixels * outOfFocus;
      if ( radius > 0.35 ) {
        vec4 sum = color;
        for ( int index = 0; index < TAPS; index++ ) {
          float angle = float( index ) * 2.39996;
          float distance = sqrt( ( float( index ) + 0.5 ) / float( TAPS ) ) * radius;
          sum += texture2D( tDiffuse, vUv + vec2( cos( angle ), sin( angle ) ) * distance / resolution );
        }
        color = sum / float( TAPS + 1 );
      }
      float luminance = dot( color.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      color.rgb = max( mix( vec3( luminance ), color.rgb, saturation ), 0.0 );
      color.rgb = pow( color.rgb, vec3( contrast ) );
      vec2 centred = ( vUv - 0.5 ) * vec2( resolution.x / resolution.y, 1.0 );
      color.rgb *= 1.0 - vignette * smoothstep( 0.45, 1.25, length( centred ) );
      gl_FragColor = color;
    }`,
}

// A soft outdoor sky for image-based lighting: glossy paint, wet asphalt and water reflect a
// bright horizon instead of the black void a scene without an environment gives them.
function createSkyEnvironment(renderer: THREE.WebGLRenderer) {
  const generator = new THREE.PMREMGenerator(renderer)
  const sky = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(10, 48, 24)
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize( position );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        float height = vDirection.y;
        vec3 zenith = vec3( 0.32, 0.52, 0.86 );
        vec3 horizon = vec3( 1.05, 1.08, 1.1 );
        vec3 ground = vec3( 0.22, 0.24, 0.2 );
        vec3 sky = mix( horizon, zenith, pow( smoothstep( 0.0, 1.0, height ), 0.6 ) );
        vec3 color = height > 0.0 ? sky : mix( horizon * 0.6, ground, smoothstep( 0.0, -0.25, height ) );
        gl_FragColor = vec4( color, 1.0 );
      }`,
  })
  sky.add(new THREE.Mesh(geometry, material))
  const { texture } = generator.fromScene(sky, 0.02)
  generator.dispose()
  geometry.dispose()
  material.dispose()
  return texture
}

export type FrameLook = { bloom: number; polarAngle: number }
// Standard quality renders straight to the canvas: no shadow maps, ambient occlusion, bloom,
// tilt-shift or high-precision buffers, at the native pixel ratio.
const STANDARD_PIXEL_RATIO = 1
// Photos render at twice the CSS resolution, capped so a large display stays within GPU texture limits.
const PHOTO_PIXEL_RATIO = 2
const MAX_PHOTO_EDGE = 4096

// In high quality the race scene goes through the post chain; the overlay (labels, markers,
// ghosts) is always drawn afterwards straight to the canvas so text stays crisp and exact in colour.
export function createSceneRenderer(scene: THREE.Scene, overlay: THREE.Scene, camera: THREE.Camera, quality: GraphicsQuality) {
  const isHigh = quality === 'high'
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: isHigh ? 'high-performance' : 'default' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isHigh ? MAX_PIXEL_RATIO : STANDARD_PIXEL_RATIO))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = EXPOSURE
  renderer.shadowMap.enabled = isHigh
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.info.autoReset = false
  const environment = createSkyEnvironment(renderer)
  scene.environment = environment
  const post = isHigh ? createPostChain(renderer, scene, camera) : null

  let size = { width: 1, height: 1 }
  const setSize = (width: number, height: number) => {
    size = { width, height }
    renderer.setSize(width, height)
    post?.setSize(width, height)
  }
  const render = (look: FrameLook) => {
    renderer.info.reset()
    if (post) post.render(look)
    else renderer.render(scene, camera)
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.render(overlay, camera)
    renderer.autoClear = true
  }
  // The drawing buffer is only readable until the frame is presented, so the photo frame is
  // rendered and copied in one go, then the screen resolution is restored and redrawn.
  const capture = (look: FrameLook) => {
    const screenPixelRatio = renderer.getPixelRatio()
    const pixelRatio = Math.min(PHOTO_PIXEL_RATIO, MAX_PHOTO_EDGE / Math.max(size.width, size.height))
    renderer.setPixelRatio(pixelRatio)
    setSize(size.width, size.height)
    render(look)
    const image = document.createElement('canvas')
    image.width = renderer.domElement.width
    image.height = renderer.domElement.height
    const context = image.getContext('2d')
    if (!context) throw new Error('The photo canvas could not be created.')
    context.drawImage(renderer.domElement, 0, 0)
    renderer.setPixelRatio(screenPixelRatio)
    setSize(size.width, size.height)
    render(look)
    return { image, pixelRatio }
  }
  const dispose = () => {
    post?.dispose()
    environment.dispose()
    renderer.dispose()
  }
  return { renderer, canvas: renderer.domElement, setSize, render, capture, dispose }
}

function createPostChain(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: MSAA_SAMPLES })
  const composer = new EffectComposer(renderer, target)
  composer.addPass(new RenderPass(scene, camera))
  const occlusion = new GTAOPass(scene, camera)
  occlusion.updateGtaoMaterial(AO_PARAMETERS)
  occlusion.updatePdMaterial(AO_DENOISE)
  // Flat decals (contact shadows) add draw calls to the normal pass without shaping any AO.
  const renderOcclusion = occlusion.render.bind(occlusion)
  occlusion.render = (...args) => {
    const hidden: THREE.Object3D[] = []
    scene.traverseVisible((object) => { if (object.userData.skipsAmbientOcclusion) hidden.push(object) })
    hidden.forEach((object) => { object.visible = false })
    renderOcclusion(...args)
    hidden.forEach((object) => { object.visible = true })
  }
  composer.addPass(occlusion)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, BLOOM_RADIUS, BLOOM_THRESHOLD)
  composer.addPass(bloom)
  const lens = new ShaderPass(LensShader)
  composer.addPass(lens)
  composer.addPass(new OutputPass())
  const setSize = (width: number, height: number) => {
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(width, height)
    lens.uniforms.resolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio())
  }
  const render = ({ bloom: bloomStrength, polarAngle }: FrameLook) => {
    bloom.strength = bloomStrength
    bloom.enabled = bloomStrength > 0.01
    const resolution: THREE.Vector2 = lens.uniforms.resolution.value
    // Looking straight down there is no depth to fake, so the blur fades in as the view tilts.
    lens.uniforms.blurPixels.value = resolution.y * TILT_BLUR_SHARE * THREE.MathUtils.smoothstep(polarAngle, 0.08, 0.6)
    composer.render()
  }
  const dispose = () => {
    composer.passes.forEach((pass) => pass.dispose())
    composer.dispose()
  }
  return { setSize, render, dispose }
}
