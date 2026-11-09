/**
 * Credenciales para iniciar sesión sin conexión en este dispositivo.
 * Nunca se guarda la contraseña: solo un hash PBKDF2-SHA256 con sal aleatoria, junto con el
 * último token y perfil obtenidos en línea. Caduca a los 7 días del último inicio en línea.
 */
import { User } from '../models';

const STORAGE_KEY = 'fs_offline_auth';
const ITERATIONS = 150000;
export const OFFLINE_LOGIN_DAYS = 7;

interface StoredCredential { salt: string; hash: string; token: string; user: User; savedAt: string; }

const encode = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, 256);
  return encode(bits);
}

function readAll(): Record<string, StoredCredential> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export async function rememberCredential(email: string, password: string, token: string, user: User): Promise<void> {
  if (!crypto?.subtle) return;  // Requiere HTTPS
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const all = readAll();
  all[email.trim().toLowerCase()] = { salt: encode(salt), hash: await derive(password, salt), token, user, savedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function updateRememberedSession(email: string | undefined, token: string, user: User): void {
  if (!email) return;
  const all = readAll();
  const entry = all[email.trim().toLowerCase()];
  if (entry) { all[email.trim().toLowerCase()] = { ...entry, token, user }; localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); }
}

export async function verifyOfflineCredential(email: string, password: string): Promise<{ token: string; user: User }> {
  const entry = readAll()[email.trim().toLowerCase()];
  if (!entry || !crypto?.subtle) {
    throw new Error('Sin conexión: este usuario aún no inició sesión con internet en este dispositivo.');
  }
  const ageDays = (Date.now() - new Date(entry.savedAt).getTime()) / 86400000;
  if (!(ageDays <= OFFLINE_LOGIN_DAYS)) {
    throw new Error(`Sin conexión: pasaron más de ${OFFLINE_LOGIN_DAYS} días desde tu último inicio de sesión en línea. Conéctate para continuar.`);
  }
  if (await derive(password, decode(entry.salt)) !== entry.hash) {
    throw new Error('Sin conexión: correo o contraseña incorrectos.');
  }
  return { token: entry.token, user: entry.user };
}

export function forgetOfflineCredential(email: string): void {
  const all = readAll();
  delete all[email.trim().toLowerCase()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
