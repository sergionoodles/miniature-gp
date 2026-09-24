import { expect, it } from 'vitest'
import { MeshStandardMaterial, WebGLRenderer, type WebGLProgramParametersWithUniforms } from 'three'
import { addShaderPatch } from './shaderPatches'

const compile = (material: MeshStandardMaterial) => {
  const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' } as unknown as WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as WebGLRenderer)
  return shader
}

it('keeps earlier shader patches when another effect patches the same material', () => {
  const material = new MeshStandardMaterial()
  addShaderPatch(material, 'first', (shader) => { shader.fragmentShader = `// first\n${shader.fragmentShader}` })
  addShaderPatch(material, 'second', (shader) => { shader.fragmentShader = `// second\n${shader.fragmentShader}` })
  expect(compile(material).fragmentShader).toBe('// second\n// first\nvoid main() {}')
})

it('gives each combination of patches its own program cache key', () => {
  const single = new MeshStandardMaterial()
  const double = new MeshStandardMaterial()
  addShaderPatch(single, 'first', () => {})
  addShaderPatch(double, 'first', () => {})
  addShaderPatch(double, 'second', () => {})
  expect(double.customProgramCacheKey()).toContain('first')
  expect(double.customProgramCacheKey()).toContain('second')
  expect(double.customProgramCacheKey()).not.toBe(single.customProgramCacheKey())
})
