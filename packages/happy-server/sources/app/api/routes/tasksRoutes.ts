import { eventRouter, buildNewTaskUpdate, buildUpdateTaskUpdate, buildDeleteTaskUpdate } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { Fastify } from "../types";
import { z } from "zod";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateUserSeq } from "@/storage/seq";
import { log } from "@/utils/log";
import * as privacyKit from "privacy-kit";

/**
 * Task CRUD routes following the Artifact pattern.
 * Tasks capture work items (bugs, features) with encrypted header/body.
 * Task state is derived client-side from linked sessions.
 */
export function tasksRoutes(app: Fastify) {
    // GET /v1/tasks - List all tasks for the account (header-only)
    app.get('/v1/tasks', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.array(z.object({
                    id: z.string(),
                    header: z.string(),
                    headerVersion: z.number(),
                    dataEncryptionKey: z.string(),
                    seq: z.number(),
                    createdAt: z.number(),
                    updatedAt: z.number()
                })),
                500: z.object({
                    error: z.literal('Failed to get tasks')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;

        try {
            const tasks = await db.task.findMany({
                where: { accountId: userId },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    header: true,
                    headerVersion: true,
                    dataEncryptionKey: true,
                    seq: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            return reply.send(tasks.map(t => ({
                id: t.id,
                header: privacyKit.encodeBase64(t.header),
                headerVersion: t.headerVersion,
                dataEncryptionKey: privacyKit.encodeBase64(t.dataEncryptionKey),
                seq: t.seq,
                createdAt: t.createdAt.getTime(),
                updatedAt: t.updatedAt.getTime()
            })));
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get tasks: ${error}`);
            return reply.code(500).send({ error: 'Failed to get tasks' });
        }
    });

    // GET /v1/tasks/:id - Get single task with full body
    app.get('/v1/tasks/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            }),
            response: {
                200: z.object({
                    id: z.string(),
                    header: z.string(),
                    headerVersion: z.number(),
                    body: z.string(),
                    bodyVersion: z.number(),
                    dataEncryptionKey: z.string(),
                    seq: z.number(),
                    createdAt: z.number(),
                    updatedAt: z.number()
                }),
                404: z.object({
                    error: z.literal('Task not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get task')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const task = await db.task.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!task) {
                return reply.code(404).send({ error: 'Task not found' });
            }

            return reply.send({
                id: task.id,
                header: privacyKit.encodeBase64(task.header),
                headerVersion: task.headerVersion,
                body: privacyKit.encodeBase64(task.body),
                bodyVersion: task.bodyVersion,
                dataEncryptionKey: privacyKit.encodeBase64(task.dataEncryptionKey),
                seq: task.seq,
                createdAt: task.createdAt.getTime(),
                updatedAt: task.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get task: ${error}`);
            return reply.code(500).send({ error: 'Failed to get task' });
        }
    });

    // POST /v1/tasks - Create new task (idempotent by id)
    app.post('/v1/tasks', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                id: z.string().uuid(),
                header: z.string(),
                body: z.string(),
                dataEncryptionKey: z.string()
            }),
            response: {
                200: z.object({
                    id: z.string(),
                    header: z.string(),
                    headerVersion: z.number(),
                    body: z.string(),
                    bodyVersion: z.number(),
                    dataEncryptionKey: z.string(),
                    seq: z.number(),
                    createdAt: z.number(),
                    updatedAt: z.number()
                }),
                409: z.object({
                    error: z.literal('Task with this ID already exists for another account')
                }),
                500: z.object({
                    error: z.literal('Failed to create task')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, header, body, dataEncryptionKey } = request.body;

        try {
            const existingTask = await db.task.findUnique({
                where: { id }
            });

            if (existingTask) {
                if (existingTask.accountId !== userId) {
                    return reply.code(409).send({
                        error: 'Task with this ID already exists for another account'
                    });
                }

                // Idempotent: return existing
                return reply.send({
                    id: existingTask.id,
                    header: privacyKit.encodeBase64(existingTask.header),
                    headerVersion: existingTask.headerVersion,
                    body: privacyKit.encodeBase64(existingTask.body),
                    bodyVersion: existingTask.bodyVersion,
                    dataEncryptionKey: privacyKit.encodeBase64(existingTask.dataEncryptionKey),
                    seq: existingTask.seq,
                    createdAt: existingTask.createdAt.getTime(),
                    updatedAt: existingTask.updatedAt.getTime()
                });
            }

            const task = await db.task.create({
                data: {
                    id,
                    accountId: userId,
                    header: privacyKit.decodeBase64(header),
                    headerVersion: 1,
                    body: privacyKit.decodeBase64(body),
                    bodyVersion: 1,
                    dataEncryptionKey: privacyKit.decodeBase64(dataEncryptionKey),
                    seq: 0
                }
            });

            const updSeq = await allocateUserSeq(userId);
            const newTaskPayload = buildNewTaskUpdate(task, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: newTaskPayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                id: task.id,
                header: privacyKit.encodeBase64(task.header),
                headerVersion: task.headerVersion,
                body: privacyKit.encodeBase64(task.body),
                bodyVersion: task.bodyVersion,
                dataEncryptionKey: privacyKit.encodeBase64(task.dataEncryptionKey),
                seq: task.seq,
                createdAt: task.createdAt.getTime(),
                updatedAt: task.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create task: ${error}`);
            return reply.code(500).send({ error: 'Failed to create task' });
        }
    });

    // POST /v1/tasks/:id - Update task with version control (OCC)
    app.post('/v1/tasks/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            }),
            body: z.object({
                header: z.string().optional(),
                expectedHeaderVersion: z.number().int().min(0).optional(),
                body: z.string().optional(),
                expectedBodyVersion: z.number().int().min(0).optional()
            }),
            response: {
                200: z.union([
                    z.object({
                        success: z.literal(true),
                        headerVersion: z.number().optional(),
                        bodyVersion: z.number().optional()
                    }),
                    z.object({
                        success: z.literal(false),
                        error: z.literal('version-mismatch'),
                        currentHeaderVersion: z.number().optional(),
                        currentBodyVersion: z.number().optional(),
                        currentHeader: z.string().optional(),
                        currentBody: z.string().optional()
                    })
                ]),
                404: z.object({
                    error: z.literal('Task not found')
                }),
                500: z.object({
                    error: z.literal('Failed to update task')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { header, expectedHeaderVersion, body, expectedBodyVersion } = request.body;

        try {
            const currentTask = await db.task.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!currentTask) {
                return reply.code(404).send({ error: 'Task not found' });
            }

            const headerMismatch = header !== undefined && expectedHeaderVersion !== undefined &&
                                   currentTask.headerVersion !== expectedHeaderVersion;
            const bodyMismatch = body !== undefined && expectedBodyVersion !== undefined &&
                                 currentTask.bodyVersion !== expectedBodyVersion;

            if (headerMismatch || bodyMismatch) {
                return reply.send({
                    success: false,
                    error: 'version-mismatch',
                    ...(headerMismatch && {
                        currentHeaderVersion: currentTask.headerVersion,
                        currentHeader: privacyKit.encodeBase64(currentTask.header)
                    }),
                    ...(bodyMismatch && {
                        currentBodyVersion: currentTask.bodyVersion,
                        currentBody: privacyKit.encodeBase64(currentTask.body)
                    })
                });
            }

            const updateData: any = {
                updatedAt: new Date()
            };

            let headerUpdate: { value: string; version: number } | undefined;
            let bodyUpdate: { value: string; version: number } | undefined;

            if (header !== undefined && expectedHeaderVersion !== undefined) {
                updateData.header = privacyKit.decodeBase64(header);
                updateData.headerVersion = expectedHeaderVersion + 1;
                headerUpdate = {
                    value: header,
                    version: expectedHeaderVersion + 1
                };
            }

            if (body !== undefined && expectedBodyVersion !== undefined) {
                updateData.body = privacyKit.decodeBase64(body);
                updateData.bodyVersion = expectedBodyVersion + 1;
                bodyUpdate = {
                    value: body,
                    version: expectedBodyVersion + 1
                };
            }

            updateData.seq = currentTask.seq + 1;

            await db.task.update({
                where: { id },
                data: updateData
            });

            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildUpdateTaskUpdate(id, updSeq, randomKeyNaked(12), headerUpdate, bodyUpdate);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                success: true,
                ...(headerUpdate && { headerVersion: headerUpdate.version }),
                ...(bodyUpdate && { bodyVersion: bodyUpdate.version })
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to update task: ${error}`);
            return reply.code(500).send({ error: 'Failed to update task' });
        }
    });

    // DELETE /v1/tasks/:id - Delete task
    app.delete('/v1/tasks/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            }),
            response: {
                200: z.object({
                    success: z.literal(true)
                }),
                404: z.object({
                    error: z.literal('Task not found')
                }),
                500: z.object({
                    error: z.literal('Failed to delete task')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const task = await db.task.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!task) {
                return reply.code(404).send({ error: 'Task not found' });
            }

            await db.task.delete({
                where: { id }
            });

            const updSeq = await allocateUserSeq(userId);
            const deletePayload = buildDeleteTaskUpdate(id, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: deletePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to delete task: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete task' });
        }
    });
}
