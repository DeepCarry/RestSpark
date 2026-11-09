import { describe, it, expect, vi, afterEach } from 'vitest'
import VersionChecker from '../app/utils/versionChecker.js'

afterEach(() => vi.unstubAllGlobals())

describe('VersionChecker', () => {
  it('fetches the release tag name from the independent Rest Spark repository', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ tag_name: 'v1.21.0' }), { status: 200 }))
    vi.stubGlobal('fetch', request)
    expect(await new VersionChecker().latest()).toBe('v1.21.0')
    expect(request).toHaveBeenCalledWith('https://api.github.com/repos/DeepCarry/RestSpark/releases/latest', {
      method: 'GET',
      headers: { 'User-Agent': 'Rest-Spark/DeepCarry' },
      mode: 'cors',
      cache: 'default'
    })
  })
})
