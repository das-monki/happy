import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { TaskHeader, TaskBody } from '../taskTypes';
import { AES256Encryption } from './encryptor';
import * as Random from 'expo-crypto';

export class TaskEncryption {
    private encryptor: AES256Encryption;

    constructor(dataEncryptionKey: Uint8Array) {
        this.encryptor = new AES256Encryption(dataEncryptionKey);
    }

    /**
     * Generate a new data encryption key for a task
     */
    static generateDataEncryptionKey(): Uint8Array {
        return Random.getRandomBytes(32); // 256 bits for AES-256
    }

    /**
     * Encrypt task header
     */
    async encryptHeader(header: TaskHeader): Promise<string> {
        const encrypted = await this.encryptor.encrypt([header]);
        return encodeBase64(encrypted[0], 'base64');
    }

    /**
     * Decrypt task header
     */
    async decryptHeader(encryptedHeader: string): Promise<TaskHeader | null> {
        try {
            const encryptedData = decodeBase64(encryptedHeader, 'base64');
            const decrypted = await this.encryptor.decrypt([encryptedData]);
            if (!decrypted[0]) {
                return null;
            }
            const header = decrypted[0] as any;
            if (typeof header !== 'object' || header === null) {
                return null;
            }
            return {
                title: typeof header.title === 'string' ? header.title : null,
                description: typeof header.description === 'string' ? header.description : null,
                agentKey: typeof header.agentKey === 'string' ? header.agentKey : null,
                ...(header.status && { status: header.status })
            };
        } catch (error) {
            console.error('Failed to decrypt task header:', error);
            return null;
        }
    }

    /**
     * Encrypt task body
     */
    async encryptBody(body: TaskBody): Promise<string> {
        const encrypted = await this.encryptor.encrypt([body]);
        return encodeBase64(encrypted[0], 'base64');
    }

    /**
     * Decrypt task body
     */
    async decryptBody(encryptedBody: string): Promise<TaskBody | null> {
        try {
            const encryptedData = decodeBase64(encryptedBody, 'base64');
            const decrypted = await this.encryptor.decrypt([encryptedData]);
            if (!decrypted[0]) {
                return null;
            }
            const body = decrypted[0] as any;
            if (typeof body !== 'object' || body === null) {
                return null;
            }
            return {
                notes: typeof body.notes === 'string' ? body.notes : null,
                result: typeof body.result === 'string' ? body.result : null
            };
        } catch (error) {
            console.error('Failed to decrypt task body:', error);
            return null;
        }
    }
}
