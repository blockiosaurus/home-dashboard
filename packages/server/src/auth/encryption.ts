import _sodium from 'libsodium-wrappers'

const ready = _sodium.ready.then(() => _sodium)

export const deriveKey = async (machineId: string, salt: string): Promise<Uint8Array> => {
  const sodium = await ready
  const input = `${machineId}::${salt}`
  return sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, input)
}

export interface Encryptor {
  encrypt: (plaintext: string) => string
  decrypt: (cipherB64: string) => string
}

export const createEncryptor = async (key: Uint8Array): Promise<Encryptor> => {
  const sodium = await ready
  return {
    encrypt: (plaintext) => {
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
      const cipher = sodium.crypto_secretbox_easy(plaintext, nonce, key)
      const combined = new Uint8Array(nonce.length + cipher.length)
      combined.set(nonce, 0)
      combined.set(cipher, nonce.length)
      return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
    },
    decrypt: (cipherB64) => {
      const combined = sodium.from_base64(cipherB64, sodium.base64_variants.ORIGINAL)
      const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
      const cipher = combined.slice(sodium.crypto_secretbox_NONCEBYTES)
      const opened = sodium.crypto_secretbox_open_easy(cipher, nonce, key)
      return sodium.to_string(opened)
    },
  }
}
