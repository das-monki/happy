import { AuthCredentials } from '@/auth/tokenStorage';
import { backoff } from '@/utils/time';
import { getServerUrl } from './serverConfig';
import { Task, TaskCreateRequest, TaskUpdateRequest, TaskUpdateResponse } from './taskTypes';

/**
 * Fetch all tasks for the account (header-only)
 */
export async function fetchTasks(credentials: AuthCredentials): Promise<Task[]> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/tasks`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch tasks: ${response.status}`);
        }

        const data = await response.json() as Task[];
        return data;
    });
}

/**
 * Fetch a single task with full body
 */
export async function fetchTask(credentials: AuthCredentials, taskId: string): Promise<Task> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/tasks/${taskId}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Task not found');
            }
            throw new Error(`Failed to fetch task: ${response.status}`);
        }

        const data = await response.json() as Task;
        return data;
    });
}

/**
 * Create a new task
 */
export async function createTask(
    credentials: AuthCredentials,
    request: TaskCreateRequest
): Promise<Task> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 409) {
                throw new Error('Task ID already exists');
            }
            throw new Error(`Failed to create task: ${response.status}`);
        }

        const data = await response.json() as Task;
        return data;
    });
}

/**
 * Update an existing task
 */
export async function updateTask(
    credentials: AuthCredentials,
    taskId: string,
    request: TaskUpdateRequest
): Promise<TaskUpdateResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/tasks/${taskId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Task not found');
            }
            throw new Error(`Failed to update task: ${response.status}`);
        }

        const data = await response.json() as TaskUpdateResponse;
        return data;
    });
}

/**
 * Delete a task
 */
export async function deleteTask(
    credentials: AuthCredentials,
    taskId: string
): Promise<void> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/tasks/${taskId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Task not found');
            }
            throw new Error(`Failed to delete task: ${response.status}`);
        }
    });
}

/**
 * Fetch version history for an artifact
 */
export async function fetchArtifactVersions(
    credentials: AuthCredentials,
    artifactId: string
): Promise<Array<{ version: number; createdAt: number }>> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts/${artifactId}/versions`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Artifact not found');
            }
            throw new Error(`Failed to fetch artifact versions: ${response.status}`);
        }

        return await response.json() as Array<{ version: number; createdAt: number }>;
    });
}

/**
 * Fetch a specific version snapshot of an artifact
 */
export async function fetchArtifactVersion(
    credentials: AuthCredentials,
    artifactId: string,
    version: number
): Promise<{ version: number; header: string; body: string; createdAt: number }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/artifacts/${artifactId}/versions/${version}`, {
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Version not found');
            }
            throw new Error(`Failed to fetch artifact version: ${response.status}`);
        }

        return await response.json() as { version: number; header: string; body: string; createdAt: number };
    });
}
