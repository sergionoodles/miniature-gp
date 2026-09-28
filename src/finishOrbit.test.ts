import { describe, expect, it } from 'vitest'
import { OrthographicCamera, Spherical, Vector3 } from 'three'
import { FINISH_ORBIT_POLAR, FINISH_ORBIT_ZOOM, orbitCameraInPlace } from './finishOrbit'

// The viewer left the camera looking straight down at a corner, zoomed in.
function viewerCamera() {
  const camera = new OrthographicCamera()
  const target = new Vector3(40, 0, -20)
  camera.position.set(40, 240, -19.99)
  camera.zoom = 3
  return { camera, target }
}

function run(frames: number, frameSeconds: number) {
  const { camera, target } = viewerCamera()
  for (let frame = 1; frame <= frames; frame++) orbitCameraInPlace(camera, target, frameSeconds, frame * frameSeconds)
  return { camera, target, view: new Spherical().setFromVector3(camera.position.clone().sub(target)) }
}

describe('finish orbit', () => {
  it('eases from the viewer’s camera without jumping', () => {
    const { camera, target, view } = run(1, 1 / 60)
    // One frame covers under 5% of the way to the orbit pose.
    expect(view.phi).toBeLessThan(FINISH_ORBIT_POLAR * 0.05)
    expect(camera.zoom).toBeGreaterThan(3 - (3 - FINISH_ORBIT_ZOOM) * 0.05)
    expect(target.x).toBeGreaterThan(40 * 0.95)
  })

  it('settles on the circuit centre at the orbit tilt and zoom, then keeps turning', () => {
    const { camera, target, view } = run(600, 1 / 60)
    expect(target.length()).toBeLessThan(0.01)
    expect(view.phi).toBeCloseTo(FINISH_ORBIT_POLAR, 3)
    expect(view.radius).toBeCloseTo(240, 0)
    expect(camera.zoom).toBeCloseTo(FINISH_ORBIT_ZOOM, 3)
    const before = view.theta
    orbitCameraInPlace(camera, target, 1, 20)
    expect(new Spherical().setFromVector3(camera.position.clone().sub(target)).theta).not.toBeCloseTo(before, 3)
  })

  it('moves at the same pace at 30 and 60 frames a second', () => {
    const fast = run(120, 1 / 60)
    const slow = run(60, 1 / 30)
    expect(slow.view.phi).toBeCloseTo(fast.view.phi, 3)
    expect(slow.view.theta).toBeCloseTo(fast.view.theta, 2)
    expect(slow.camera.zoom).toBeCloseTo(fast.camera.zoom, 3)
  })
})
