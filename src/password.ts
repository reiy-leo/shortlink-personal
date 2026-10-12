// 链接访问密码：PBKDF2-SHA256（Workers 上限 100k 次迭代），只存盐和哈希。
const enc = new TextEncoder();
const ITER = 100_000;

export interface PasswordHash { salt: string; hash: string; iter: number }

const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

async function derive(password: string, salt: Uint8Array, iter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(password, salt, ITER), iter: ITER };
}

export async function checkPassword(password: string, p: PasswordHash): Promise<boolean> {
  const got = await derive(password, fromHex(p.salt), p.iter);
  if (got.length !== p.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ p.hash.charCodeAt(i);
  return diff === 0;
}
