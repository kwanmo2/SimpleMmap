// MindManager 객체 식별자(OId): 16바이트 랜덤 GUID의 base64 표현 (예: "GJjKE9wZRki07D3azGIGRQ==")
export function generateOId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function isOId(value: string): boolean {
  return /^[A-Za-z0-9+/]{22}==$/.test(value)
}
