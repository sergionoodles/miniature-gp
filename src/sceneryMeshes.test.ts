import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeshLambertMaterial, MeshStandardMaterial } from 'three'
import { foliageMaterial } from './sceneryMeshes'

afterEach(() => { vi.restoreAllMocks() })

describe('foliage material', () => {
  it('builds detailed foliage from partial parameters without warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const material = foliageMaterial(true, { color: 0x6a5c49, roughness: 1 })
    expect(material).toBeInstanceOf(MeshStandardMaterial)
    expect(material).toMatchObject({ roughness: 1, metalness: 0 })
    expect(warn).not.toHaveBeenCalled()
  })

  it('uses the cheaper Lambert shading in standard quality without warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(foliageMaterial(false, { color: 0x6a5c49, roughness: 1 })).toBeInstanceOf(MeshLambertMaterial)
    expect(warn).not.toHaveBeenCalled()
  })
})
