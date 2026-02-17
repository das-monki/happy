/**
 * Encrypted task from API
 */
export interface Task {
    id: string;
    header: string; // Base64 encoded encrypted JSON { title, description, agentKey }
    headerVersion: number;
    body?: string; // Base64 encoded encrypted JSON { notes, result } - only in full fetch
    bodyVersion?: number; // Only in full fetch
    dataEncryptionKey: string; // Base64 encoded encryption key (encrypted with user key)
    seq: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * Decrypted task header
 */
export interface TaskHeader {
    title: string | null;
    description: string | null;
    agentKey: string | null; // KV key for agent definition (agent:{uuid})
    machineId?: string | null; // Preferred machine to run on
    directory?: string | null; // Working directory on the machine
    status?: 'completed' | 'failed'; // Explicitly set by user
}

/**
 * Decrypted task body
 */
export interface TaskBody {
    notes: string | null;
    result: string | null;
}

/**
 * Derived task state computed client-side from linked sessions
 */
export type TaskState = 'pending' | 'running' | 'waiting_input' | 'completed' | 'failed';

/**
 * Decrypted task for UI
 */
export interface DecryptedTask {
    id: string;
    title: string | null;
    description: string | null;
    agentKey: string | null;
    machineId?: string | null;
    directory?: string | null;
    status?: 'completed' | 'failed';
    notes?: string | null; // Only loaded when viewing full task
    result?: string | null; // Only loaded when viewing full task
    headerVersion: number;
    bodyVersion?: number;
    seq: number;
    createdAt: number;
    updatedAt: number;
    isDecrypted: boolean;
}

/**
 * Request to create a new task
 */
export interface TaskCreateRequest {
    id: string; // UUID generated client-side
    header: string; // Base64 encoded encrypted header
    body: string; // Base64 encoded encrypted body
    dataEncryptionKey: string; // Base64 encoded encryption key (encrypted with user key)
}

/**
 * Request to update an existing task
 */
export interface TaskUpdateRequest {
    header?: string; // Base64 encoded encrypted header
    expectedHeaderVersion?: number;
    body?: string; // Base64 encoded encrypted body
    expectedBodyVersion?: number;
}

/**
 * Response from update operation
 */
export type TaskUpdateResponse =
    | {
        success: true;
        headerVersion?: number;
        bodyVersion?: number;
    }
    | {
        success: false;
        error: 'version-mismatch';
        currentHeaderVersion?: number;
        currentBodyVersion?: number;
        currentHeader?: string;
        currentBody?: string;
    };
