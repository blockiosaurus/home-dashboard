import { type Dirent, existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'])

const isImage = (name: string) => {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return IMAGE_EXT.has(name.slice(dot).toLowerCase())
}

const walk = async (root: string, sub: string): Promise<string[]> => {
  const abs = sub ? join(root, sub) : root
  let entries: Dirent[]
  try {
    entries = await readdir(abs, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const rel = sub ? `${sub}/${e.name}` : e.name
    if (e.isDirectory()) {
      out.push(...(await walk(root, rel)))
    } else if (e.isFile() && isImage(e.name)) {
      out.push(rel)
    }
  }
  return out
}

/**
 * Recursively list image files (jpg/jpeg/png/webp/avif/gif) under `root`.
 * Returns forward-slash relative paths. Skips dotfiles. Returns [] if root
 * doesn't exist.
 */
export const listLocalPhotos = async (root: string): Promise<string[]> => {
  if (!existsSync(root)) return []
  return walk(root, '')
}
