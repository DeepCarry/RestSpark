import { BRAND } from './brand.js'

class VersionChecker {
  async latest () {
    try {
      const response = await fetch(BRAND.releaseApi, {
        method: 'GET',
        headers: { 'User-Agent': 'Rest-Spark/DeepCarry' },
        mode: 'cors',
        cache: 'default'
      })
      // The Fork may not have a release yet. Never offer an upstream binary.
      if (!response.ok) return
      const release = await response.json()
      if (typeof release.tag_name === 'string') return release.tag_name
    } catch {
      // Offline/rate-limited clients keep their existing reminder schedule.
    }
  }
}

export default VersionChecker
