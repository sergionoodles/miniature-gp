import * as THREE from 'three'

// A three-quarter tilt that shows the circuit's relief, inside OrbitControls' 0.3π polar limit.
export const FINISH_ORBIT_POLAR = 0.78
export const FINISH_ORBIT_ZOOM = 1.15
// One turn around the circuit every two minutes.
const ORBIT_RADIANS_PER_SECOND = Math.PI * 2 / 120
// The camera eases from wherever the viewer left it into the orbit over roughly two seconds.
const SETTLE_RATE = 1.6
const SPIN_UP_SECONDS = 3
// A frame after a hidden tab would otherwise jump the camera to the end of the transition.
const MAX_STEP_SECONDS = 0.1
const CIRCUIT_CENTRE = new THREE.Vector3()

export function orbitCameraInPlace(camera: THREE.OrthographicCamera, target: THREE.Vector3, deltaSeconds: number, elapsedSeconds: number) {
  const step = Math.min(deltaSeconds, MAX_STEP_SECONDS)
  const settle = 1 - Math.exp(-SETTLE_RATE * step)
  const view = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target))
  view.phi += (FINISH_ORBIT_POLAR - view.phi) * settle
  view.theta += ORBIT_RADIANS_PER_SECOND * THREE.MathUtils.smoothstep(elapsedSeconds, 0, SPIN_UP_SECONDS) * step
  target.lerp(CIRCUIT_CENTRE, settle)
  camera.position.setFromSpherical(view).add(target)
  camera.zoom += (FINISH_ORBIT_ZOOM - camera.zoom) * settle
  camera.lookAt(target)
  camera.updateProjectionMatrix()
}
