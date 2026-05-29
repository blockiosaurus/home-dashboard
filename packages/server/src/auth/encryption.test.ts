import { beforeAll, describe, expect, it } from 'vitest'
import { createEncryptor, deriveKey } from './encryption'

let key: Uint8Array

beforeAll(async () => {
  key = await deriveKey('machine-id-fixture', 'salt-fixture')
})

describe('encryption', () => {
  it('round-trips a string', async () => {
    const enc = await createEncryptor(key)
    const cipher = enc.encrypt('hello world')
    expect(cipher).not.toBe('hello world')
    expect(enc.decrypt(cipher)).toBe('hello world')
  })

  it('produces different ciphertext on repeat (nonce)', async () => {
    const enc = await createEncryptor(key)
    const a = enc.encrypt('x')
    const b = enc.encrypt('x')
    expect(a).not.toBe(b)
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const enc = await createEncryptor(key)
    const cipher = enc.encrypt('x')
    const tampered = `${cipher.slice(0, -2)}AA`
    expect(() => enc.decrypt(tampered)).toThrow()
  })
})
