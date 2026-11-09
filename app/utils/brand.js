export const BRAND = Object.freeze({
  name: 'Rest Spark',
  chineseName: '元气',
  appId: 'io.github.deepcarry.restspark',
  repository: 'https://github.com/DeepCarry/RestSpark',
  releases: 'https://github.com/DeepCarry/RestSpark/releases/latest',
  releaseApi: 'https://api.github.com/repos/DeepCarry/RestSpark/releases/latest',
  issues: 'https://github.com/DeepCarry/RestSpark/issues'
})

export function displayName (locale = 'en') {
  return /^zh(?:-|$)/i.test(locale) ? BRAND.chineseName : BRAND.name
}
