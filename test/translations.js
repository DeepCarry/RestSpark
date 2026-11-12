import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'path'
import { expect } from 'vitest'

const jsonDirectory = join(__dirname, '../app/locales')

function getJsonFiles (dir) {
  return readdirSync(dir).filter(file => file.endsWith('.json'))
}

describe('Translations files', () => {
  const jsonFiles = getJsonFiles(jsonDirectory)

  jsonFiles.forEach(file => {
    it(`${file} is valid`, () => {
      const filePath = join(jsonDirectory, file)
      const data = readFileSync(filePath, 'utf8')

      expect(() => {
        JSON.parse(data)
      }).not.toThrow()
    })
  })
})

it('provides Traditional Chinese strings for Rest Spark settings, onboarding and break actions', () => {
  const english = JSON.parse(readFileSync(join(jsonDirectory, 'en.json'), 'utf8'))
  const traditional = JSON.parse(readFileSync(join(jsonDirectory, 'zh-TW.json'), 'utf8'))
  for (const section of ['settingsV1', 'scheduleV2', 'prd11']) {
    expect(Object.keys(traditional[section] ?? {}).sort()).toEqual(Object.keys(english[section]).sort())
    for (const [key, text] of Object.entries(english[section])) {
      expect(traditional[section][key].match(/{{[^}]+}}/g) ?? []).toEqual(text.match(/{{[^}]+}}/g) ?? [])
    }
  }
})
