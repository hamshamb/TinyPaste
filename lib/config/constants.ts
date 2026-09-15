/**
 * Single source of truth for product limits. Never inline these numbers.
 */

/** Maximum length of an optional paste title, in characters. */
export const MAX_TITLE_LENGTH = 120;

/** Maximum stored paste payload, in bytes (UTF-8 for plaintext, ciphertext bytes for encrypted). */
export const MAX_CONTENT_BYTES = 1_024 * 1_024; // 1 MiB

/**
 * Ciphertext is base64 so it inflates ~4/3 and AES-GCM adds a 16-byte tag.
 * The encrypted payload cap keeps the stored column within the same 1 MiB budget.
 */
export const MAX_ENCRYPTED_PAYLOAD_CHARS = Math.ceil((MAX_CONTENT_BYTES * 4) / 3) + 1_024;

/** Password bounds for server-side password protection. */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_PASSWORD_LENGTH = 200;

/** Public slug shape. 8 chars over a 57-symbol alphabet ≈ 2^46.7 keyspace. */
export const SLUG_LENGTH = 8;
export const SLUG_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const SLUG_PATTERN = new RegExp(`^[${SLUG_ALPHABET}]{4,16}$`);

/** Edit tokens carry far more entropy than slugs: 32 bytes = 256 bits. */
export const EDIT_TOKEN_BYTES = 32;

/** bcrypt work factor for paste passwords. */
export const PASSWORD_HASH_ROUNDS = 12;

/** Number of slug candidates tried before a creation attempt gives up. */
export const SLUG_COLLISION_RETRIES = 6;

/** localStorage key holding this browser's paste history + edit tokens. */
export const LOCAL_HISTORY_KEY = 'tinypaste.history.v1';
export const LOCAL_HISTORY_LIMIT = 200;

/** Theme preference key. */
export const THEME_STORAGE_KEY = 'tinypaste.theme';
