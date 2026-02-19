import type { Credentials } from '@/persistence';
import { encodeBase64, libsodiumEncryptForPublicKey, encryptLegacy } from './encryption';

/**
 * Seals a quota snapshot payload for upload to the server.
 *
 * Mode 0x01 (nacl_box_v1): [0x01] + libsodiumEncryptForPublicKey(jsonBytes, publicKey)
 * Mode 0x00 (legacy_secretbox_v1): [0x00] + encryptLegacy(payload, secret)
 */
export function sealQuotaSnapshot(
    credentials: Credentials,
    payload: unknown,
): { ciphertext: string; format: 'nacl_box_v1' | 'legacy_secretbox_v1' } {
    const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

    if (credentials.encryption.type === 'dataKey') {
        const encrypted = libsodiumEncryptForPublicKey(jsonBytes, credentials.encryption.publicKey);
        const bundle = new Uint8Array(1 + encrypted.length);
        bundle[0] = 0x01;
        bundle.set(encrypted, 1);
        return {
            ciphertext: encodeBase64(bundle),
            format: 'nacl_box_v1',
        };
    }

    // Legacy secretbox mode
    const encrypted = encryptLegacy(payload, credentials.encryption.secret);
    const bundle = new Uint8Array(1 + encrypted.length);
    bundle[0] = 0x00;
    bundle.set(encrypted, 1);
    return {
        ciphertext: encodeBase64(bundle),
        format: 'legacy_secretbox_v1',
    };
}
