import assert from 'node:assert/strict'
import test from 'node:test'
import { createMaterialPanel } from '../src/debug/panels/MaterialPanel.js'
import { createLegoMaterial, syncLegoStudShading } from '../src/materials/tsl/legoMaterial.js'
import { normalizeStudShadingConfig, STUD_SHADING_DEFAULTS, STUD_SHADING_RANGES } from '../src/materials/tsl/legoStudsConfig.js'
import { worldConfig } from '../src/world/WorldConfig.js'
import WorldMaterials from '../src/world/WorldMaterials.js'

const studLayout = { deckY: 0.101053, pitch: 0.1, originX: -0.05, originZ: -0.05, radius: 0.0302 }

function assertUniforms(material, settings) {
  for (const [key, value] of Object.entries(settings))
    assert.equal(material.userData.studs[key].value, key === 'enabled' ? Number(value) : value, key)
}

test('stud detail defaults preserve the existing appearance and use an independent world config', () => {
  assert.deepEqual(normalizeStudShadingConfig(), STUD_SHADING_DEFAULTS)
  assert.deepEqual(worldConfig.terrain.studShading, STUD_SHADING_DEFAULTS)
  assert.notEqual(worldConfig.terrain.studShading, STUD_SHADING_DEFAULTS)
  const material = createLegoMaterial({ studs: studLayout })
  assert.ok(material.colorNode)
  assert.ok(material.normalNode)
  assertUniforms(material, STUD_SHADING_DEFAULTS)
  material.dispose()
})

test('stud settings clamp invalid values and maintain an ordered Nyquist-safe fade interval', () => {
  const settings = normalizeStudShadingConfig({
    enabled: false,
    strength: -1,
    radiusScale: Infinity,
    shadow: 2,
    shadowWidth: -1,
    rimWidth: 0,
    tilt: NaN,
    fadeStart: 10,
    fadeEnd: -1,
  })
  assert.equal(settings.enabled, false)
  assert.equal(settings.strength, 0)
  assert.equal(settings.radiusScale, 1)
  assert.equal(settings.shadow, 1)
  assert.equal(settings.shadowWidth, 0)
  assert.equal(settings.rimWidth, 0.005)
  assert.equal(settings.tilt, 1.3)
  assert.ok(settings.fadeEnd > settings.fadeStart)
  assert.ok(settings.fadeEnd <= 0.5)
  for (const [key, { min, max }] of Object.entries(STUD_SHADING_RANGES))
    assert.ok(settings[key] >= min && settings[key] <= max, key)
})

test('changing every stud parameter updates existing uniforms without replacing nodes or recompiling', () => {
  const material = createLegoMaterial({ studs: studLayout })
  const uniforms = { ...material.userData.studs }
  const { colorNode, normalNode, version } = material
  const settings = {
    enabled: false,
    strength: 0.7,
    radiusScale: 1.2,
    topBrighten: 0.12,
    shadow: 0.8,
    shadowWidth: 0.18,
    rimWidth: 0.1,
    tilt: 1.2,
    fadeStart: 0.15,
    fadeEnd: 0.35,
  }
  assert.deepEqual(syncLegoStudShading(material, settings), settings)
  assertUniforms(material, settings)
  for (const [key, node] of Object.entries(uniforms))
    assert.equal(material.userData.studs[key], node)
  assert.equal(material.colorNode, colorNode)
  assert.equal(material.normalNode, normalNode)
  assert.equal(material.version, version)
  syncLegoStudShading(material, { ...settings, enabled: true, strength: 0 })
  assert.equal(material.userData.studs.enabled.value, 1)
  assert.equal(material.userData.studs.strength.value, 0)
  material.dispose()
})

test('WorldMaterials forwards authored stud settings while non-terrain materials remain unchanged', () => {
  const settings = { ...STUD_SHADING_DEFAULTS, radiusScale: 0.8, shadowWidth: 0.2 }
  const materials = new WorldMaterials({ config: { terrain: { studShading: settings } }, studLayout })
  assertUniforms(materials.legoMaterial, settings)
  materials.dispose()
  const prefabMaterial = createLegoMaterial()
  assert.equal(prefabMaterial.userData.studs, undefined)
  assert.equal(prefabMaterial.colorNode, null)
  assert.equal(prefabMaterial.normalNode, null)
  prefabMaterial.dispose()
})

function createDebug() {
  const bindings = []
  const buttons = []
  function folder(path) {
    return {
      addFolder: ({ title }) => folder([...path, title]),
      addBinding(target, key, options) {
        const binding = { target, key, options, path }
        bindings.push(binding)
        return { on: (event, callback) => { binding[event] = callback } }
      },
      addButton(options) {
        const button = { options, path }
        buttons.push(button)
        return { on: (event, callback) => { button[event] = callback } }
      },
    }
  }
  return { bindings, buttons, addFolder: ({ title }) => folder([title]), ui: { refresh() {} } }
}

test('Stud Detail panel exposes all controls, updates the shared material live and resets defaults', () => {
  const debug = createDebug()
  const config = { terrain: {}, water: { enableWater: true } }
  const material = createLegoMaterial({ studs: studLayout })
  const version = material.version
  let regenerations = 0
  createMaterialPanel(debug, config, { legoMaterial: material }, () => { regenerations++ })
  const bindings = debug.bindings.filter(binding => binding.path.at(-1) === 'Stud Detail')
  assert.deepEqual(bindings.map(binding => binding.key), Object.keys(STUD_SHADING_DEFAULTS))
  for (const binding of bindings) {
    assert.equal(binding.target, config.terrain.studShading)
    if (binding.key !== 'enabled')
      assert.equal(binding.options.min, STUD_SHADING_RANGES[binding.key].min)
    const value = binding.key === 'enabled' ? false : STUD_SHADING_RANGES[binding.key].min
    binding.target[binding.key] = value
    binding.change({ value })
    assertUniforms(material, normalizeStudShadingConfig(config.terrain.studShading))
  }
  const reset = debug.buttons.find(button => button.options.title === 'Reset defaults')
  reset.click()
  assert.deepEqual(config.terrain.studShading, STUD_SHADING_DEFAULTS)
  assertUniforms(material, STUD_SHADING_DEFAULTS)
  assert.equal(regenerations, 0)
  assert.equal(material.version, version)
  material.dispose()
})

test('Stud Detail panel is absent when no stud layout is available', () => {
  const debug = createDebug()
  const material = createLegoMaterial()
  createMaterialPanel(debug, { water: {} }, { legoMaterial: material })
  assert.ok(debug.bindings.every(binding => binding.path.at(-1) !== 'Stud Detail'))
  material.dispose()
})
