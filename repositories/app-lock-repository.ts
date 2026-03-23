// Keep the historical key name so existing installs can read and migrate old values in place.
const APP_LOCK_PIN_HASH_KEY = 'app_lock_pin_hash_v1';
const PIN_HASH_VERSION = 'v2';
const PIN_HASH_SALT_BYTES = 16;
const PIN_HASH_ROUNDS = 512;

export const MIN_APP_LOCK_PIN_LENGTH = 6;

type PinHashPayload = {
  version: typeof PIN_HASH_VERSION;
  rounds: number;
  saltHex: string;
  hashHex: string;
};

function getCryptoModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-crypto');
  } catch {
    throw new Error('expo-crypto is not installed.');
  }
}

function getSecureStoreModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-secure-store');
  } catch {
    throw new Error('expo-secure-store is not installed.');
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

function serializePinHash(payload: PinHashPayload): string {
  return `${payload.version}$${payload.rounds}$${payload.saltHex}$${payload.hashHex}`;
}

function parsePinHash(serialized: string): PinHashPayload | null {
  const [version, rounds, saltHex, hashHex] = serialized.split('$');
  const parsedRounds = Number.parseInt(rounds || '', 10);

  if (
    version !== PIN_HASH_VERSION ||
    !Number.isFinite(parsedRounds) ||
    parsedRounds < 1 ||
    !saltHex ||
    !hashHex
  ) {
    return null;
  }

  return {
    version: PIN_HASH_VERSION,
    rounds: parsedRounds,
    saltHex,
    hashHex,
  };
}

async function hashPinLegacy(pin: string): Promise<string> {
  const Crypto = getCryptoModule();
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

async function derivePinHash(pin: string, saltHex: string, rounds: number): Promise<string> {
  const Crypto = getCryptoModule();
  let current = `${PIN_HASH_VERSION}:${saltHex}:${pin}`;

  for (let round = 0; round < rounds; round += 1) {
    current = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${round}:${saltHex}:${pin}:${current}`,
    );
  }

  return current;
}

async function createPinHash(pin: string): Promise<string> {
  const Crypto = getCryptoModule();
  const saltBytes = await Crypto.getRandomBytesAsync(PIN_HASH_SALT_BYTES);
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await derivePinHash(pin, saltHex, PIN_HASH_ROUNDS);

  return serializePinHash({
    version: PIN_HASH_VERSION,
    rounds: PIN_HASH_ROUNDS,
    saltHex,
    hashHex,
  });
}

export async function savePinHash(pin: string): Promise<void> {
  const SecureStore = getSecureStoreModule();
  const hash = await createPinHash(pin);
  await SecureStore.setItemAsync(APP_LOCK_PIN_HASH_KEY, hash);
}

export async function hasPinHash(): Promise<boolean> {
  try {
    const SecureStore = getSecureStoreModule();
    const value = await SecureStore.getItemAsync(APP_LOCK_PIN_HASH_KEY);
    return !!value;
  } catch {
    return false;
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  try {
    const SecureStore = getSecureStoreModule();
    const storedHash = await SecureStore.getItemAsync(APP_LOCK_PIN_HASH_KEY);
    if (!storedHash) return false;

    const parsed = parsePinHash(storedHash);
    if (parsed) {
      const derivedHash = await derivePinHash(pin, parsed.saltHex, parsed.rounds);
      return timingSafeEqual(derivedHash, parsed.hashHex);
    }

    const legacyHash = await hashPinLegacy(pin);
    const isMatch = timingSafeEqual(legacyHash, storedHash);

    if (isMatch) {
      try {
        await savePinHash(pin);
      } catch (error) {
        console.warn('Failed to migrate app lock PIN hash to v2 format:', error);
      }
    }

    return isMatch;
  } catch {
    return false;
  }
}

export async function clearPinHash(): Promise<void> {
  try {
    const SecureStore = getSecureStoreModule();
    await SecureStore.deleteItemAsync(APP_LOCK_PIN_HASH_KEY);
  } catch {
    // Ignore missing secure storage; app lock simply stays cleared.
  }
}
