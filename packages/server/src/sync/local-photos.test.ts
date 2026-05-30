import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listLocalPhotos } from './local-photos'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'photos-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('listLocalPhotos', () => {
  it('returns empty array when directory is empty', async () => {
    expect(await listLocalPhotos(dir)).toEqual([])
  })

  it('returns empty array when directory does not exist', async () => {
    expect(await listLocalPhotos(join(dir, 'missing'))).toEqual([])
  })

  it('returns only image files, recursively, as forward-slash relative paths', async () => {
    writeFileSync(join(dir, 'a.jpg'), 'x')
    writeFileSync(join(dir, 'b.PNG'), 'x')
    writeFileSync(join(dir, 'readme.txt'), 'x')
    mkdirSync(join(dir, 'trip'))
    writeFileSync(join(dir, 'trip', 'c.jpeg'), 'x')
    writeFileSync(join(dir, 'trip', 'd.webp'), 'x')

    const out = await listLocalPhotos(dir)
    expect(out.sort()).toEqual(['a.jpg', 'b.PNG', 'trip/c.jpeg', 'trip/d.webp'])
  })

  it('skips dotfiles and dot-directories', async () => {
    writeFileSync(join(dir, '.DS_Store'), 'x')
    writeFileSync(join(dir, 'visible.jpg'), 'x')
    mkdirSync(join(dir, '.hidden'))
    writeFileSync(join(dir, '.hidden', 'inside.jpg'), 'x')

    expect(await listLocalPhotos(dir)).toEqual(['visible.jpg'])
  })
})
