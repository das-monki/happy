import { eventRouter, buildNewArtifactUpdate, buildUpdateArtifactUpdate, buildDeleteArtifactUpdate } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { Fastify } from "../types";
import { z } from "zod";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateUserSeq } from "@/storage/seq";
import { log } from "@/utils/log";
import * as privacyKit from "privacy-kit";

export function artifactsRoutes(app: Fastify) {
    // GET /v1/artifacts - List all artifacts for the account
    app.get('/v1/artifacts', {
        preHandler: app.authenticate,
        schema: {
            querystring: z.object({
                taskId: z.string().optional()
            }).optional(),
            response: {
                200: z.array(z.object({
                    id: z.string(),
                    header: z.string(),
                    headerVersion: z.number(),
                    kind: z.string(),
                    taskId: z.string().nullable(),
                    sourceSessionId: z.string().nullable(),
                    dataEncryptionKey: z.string(),
                    seq: z.number(),
                    createdAt: z.number(),
                    updatedAt: z.number()
                })),
                500: z.object({
                    error: z.literal('Failed to get artifacts')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const taskId = request.query?.taskId;

        try {
            const where: any = { accountId: userId };
            if (taskId) {
                where.taskId = taskId;
            }

            const artifacts = await db.artifact.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    header: true,
                    headerVersion: true,
                    kind: true,
                    taskId: true,
                    sourceSessionId: true,
                    dataEncryptionKey: true,
                    seq: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            return reply.send(artifacts.map(a => ({
                id: a.id,
                header: privacyKit.encodeBase64(a.header),
                headerVersion: a.headerVersion,
                kind: a.kind,
                taskId: a.taskId,
                sourceSessionId: a.sourceSessionId,
                dataEncryptionKey: privacyKit.encodeBase64(a.dataEncryptionKey),
                seq: a.seq,
                createdAt: a.createdAt.getTime(),
                updatedAt: a.updatedAt.getTime()
            })));
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifacts: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifacts' });
        }
    });

    // GET /v1/artifacts/:id - Get single artifact with full body
    app.get('/v1/artifacts/:id', {
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
                    kind: z.string(),
                    taskId: z.string().nullable(),
                    sourceSessionId: z.string().nullable(),
                    dataEncryptionKey: z.string(),
                    seq: z.number(),
                    createdAt: z.number(),
                    updatedAt: z.number()
                }),
                404: z.object({
                    error: z.literal('Artifact not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const artifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            return reply.send({
                id: artifact.id,
                header: privacyKit.encodeBase64(artifact.header),
                headerVersion: artifact.headerVersion,
                body: privacyKit.encodeBase64(artifact.body),
                bodyVersion: artifact.bodyVersion,
                kind: artifact.kind,
                taskId: artifact.taskId,
                sourceSessionId: artifact.sourceSessionId,
                dataEncryptionKey: privacyKit.encodeBase64(artifact.dataEncryptionKey),
                seq: artifact.seq,
                createdAt: artifact.createdAt.getTime(),
                updatedAt: artifact.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifact' });
        }
    });

    // GET /v1/artifacts/:id/versions - List version history
    app.get('/v1/artifacts/:id/versions', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            }),
            response: {
                200: z.array(z.object({
                    version: z.number(),
                    createdAt: z.number()
                })),
                404: z.object({
                    error: z.literal('Artifact not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get artifact versions')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const artifact = await db.artifact.findFirst({
                where: { id, accountId: userId },
                select: { id: true }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            const versions = await db.artifactVersion.findMany({
                where: { artifactId: id },
                orderBy: { version: 'desc' },
                select: {
                    version: true,
                    createdAt: true
                }
            });

            return reply.send(versions.map(v => ({
                version: v.version,
                createdAt: v.createdAt.getTime()
            })));
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifact versions: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifact versions' });
        }
    });

    // GET /v1/artifacts/:id/versions/:version - Get specific version snapshot
    app.get('/v1/artifacts/:id/versions/:version', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string(),
                version: z.coerce.number().int().min(1)
            }),
            response: {
                200: z.object({
                    version: z.number(),
                    header: z.string(),
                    body: z.string(),
                    createdAt: z.number()
                }),
                404: z.object({
                    error: z.literal('Version not found')
                }),
                500: z.object({
                    error: z.literal('Failed to get artifact version')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, version } = request.params;

        try {
            // Verify artifact belongs to user
            const artifact = await db.artifact.findFirst({
                where: { id, accountId: userId },
                select: { id: true }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Version not found' });
            }

            const versionRecord = await db.artifactVersion.findUnique({
                where: {
                    artifactId_version: {
                        artifactId: id,
                        version
                    }
                }
            });

            if (!versionRecord) {
                return reply.code(404).send({ error: 'Version not found' });
            }

            return reply.send({
                version: versionRecord.version,
                header: privacyKit.encodeBase64(versionRecord.header),
                body: privacyKit.encodeBase64(versionRecord.body),
                createdAt: versionRecord.createdAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to get artifact version: ${error}`);
            return reply.code(500).send({ error: 'Failed to get artifact version' });
        }
    });

    // POST /v1/artifacts - Create new artifact
    app.post('/v1/artifacts', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                id: z.string().uuid(),
                header: z.string(),
                body: z.string(),
                dataEncryptionKey: z.string(),
                kind: z.string().optional(),
                taskId: z.string().optional(),
                sourceSessionId: z.string().optional()
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
                    error: z.literal('Artifact with this ID already exists for another account')
                }),
                500: z.object({
                    error: z.literal('Failed to create artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, header, body, dataEncryptionKey, kind, taskId, sourceSessionId } = request.body;

        try {
            // Check if artifact exists
            const existingArtifact = await db.artifact.findUnique({
                where: { id }
            });

            if (existingArtifact) {
                // If exists for another account, return conflict
                if (existingArtifact.accountId !== userId) {
                    return reply.code(409).send({
                        error: 'Artifact with this ID already exists for another account'
                    });
                }

                // If exists for same account, return existing (idempotent)
                log({ module: 'api', artifactId: id, userId }, 'Found existing artifact');
                return reply.send({
                    id: existingArtifact.id,
                    header: privacyKit.encodeBase64(existingArtifact.header),
                    headerVersion: existingArtifact.headerVersion,
                    body: privacyKit.encodeBase64(existingArtifact.body),
                    bodyVersion: existingArtifact.bodyVersion,
                    dataEncryptionKey: privacyKit.encodeBase64(existingArtifact.dataEncryptionKey),
                    seq: existingArtifact.seq,
                    createdAt: existingArtifact.createdAt.getTime(),
                    updatedAt: existingArtifact.updatedAt.getTime()
                });
            }

            // Create new artifact
            log({ module: 'api', artifactId: id, userId }, 'Creating new artifact');
            const artifact = await db.artifact.create({
                data: {
                    id,
                    accountId: userId,
                    header: privacyKit.decodeBase64(header),
                    headerVersion: 1,
                    body: privacyKit.decodeBase64(body),
                    bodyVersion: 1,
                    dataEncryptionKey: privacyKit.decodeBase64(dataEncryptionKey),
                    kind: kind || 'artifact',
                    taskId: taskId || null,
                    sourceSessionId: sourceSessionId || null,
                    seq: 0
                }
            });

            // Emit new-artifact event
            const updSeq = await allocateUserSeq(userId);
            const newArtifactPayload = buildNewArtifactUpdate(artifact, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: newArtifactPayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                id: artifact.id,
                header: privacyKit.encodeBase64(artifact.header),
                headerVersion: artifact.headerVersion,
                body: privacyKit.encodeBase64(artifact.body),
                bodyVersion: artifact.bodyVersion,
                dataEncryptionKey: privacyKit.encodeBase64(artifact.dataEncryptionKey),
                seq: artifact.seq,
                createdAt: artifact.createdAt.getTime(),
                updatedAt: artifact.updatedAt.getTime()
            });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to create artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to create artifact' });
        }
    });

    // POST /v1/artifacts/:id - Update artifact with version control
    // Auto-snapshots previous content into ArtifactVersion before applying update
    app.post('/v1/artifacts/:id', {
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
                    error: z.literal('Artifact not found')
                }),
                500: z.object({
                    error: z.literal('Failed to update artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { header, expectedHeaderVersion, body, expectedBodyVersion } = request.body;

        try {
            // Get current artifact for version check
            const currentArtifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!currentArtifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            // Check version mismatches
            const headerMismatch = header !== undefined && expectedHeaderVersion !== undefined &&
                                   currentArtifact.headerVersion !== expectedHeaderVersion;
            const bodyMismatch = body !== undefined && expectedBodyVersion !== undefined &&
                                 currentArtifact.bodyVersion !== expectedBodyVersion;

            if (headerMismatch || bodyMismatch) {
                return reply.send({
                    success: false,
                    error: 'version-mismatch',
                    ...(headerMismatch && {
                        currentHeaderVersion: currentArtifact.headerVersion,
                        currentHeader: privacyKit.encodeBase64(currentArtifact.header)
                    }),
                    ...(bodyMismatch && {
                        currentBodyVersion: currentArtifact.bodyVersion,
                        currentBody: privacyKit.encodeBase64(currentArtifact.body)
                    })
                });
            }

            // Auto-version: snapshot current content before applying update
            const snapshotVersion = Math.max(currentArtifact.headerVersion, currentArtifact.bodyVersion);
            if (snapshotVersion > 0) {
                await db.artifactVersion.upsert({
                    where: {
                        artifactId_version: {
                            artifactId: id,
                            version: snapshotVersion
                        }
                    },
                    create: {
                        artifactId: id,
                        version: snapshotVersion,
                        header: currentArtifact.header,
                        body: currentArtifact.body
                    },
                    update: {} // Already exists, no-op
                });
            }

            // Build update data
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

            // Increment seq
            updateData.seq = currentArtifact.seq + 1;

            // Update artifact
            await db.artifact.update({
                where: { id },
                data: updateData
            });

            // Emit update-artifact event
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildUpdateArtifactUpdate(id, updSeq, randomKeyNaked(12), headerUpdate, bodyUpdate);
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
            log({ module: 'api', level: 'error' }, `Failed to update artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to update artifact' });
        }
    });

    // DELETE /v1/artifacts/:id - Delete artifact
    app.delete('/v1/artifacts/:id', {
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
                    error: z.literal('Artifact not found')
                }),
                500: z.object({
                    error: z.literal('Failed to delete artifact')
                })
            }
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            // Check if artifact exists and belongs to user
            const artifact = await db.artifact.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!artifact) {
                return reply.code(404).send({ error: 'Artifact not found' });
            }

            // Delete artifact (versions cascade-deleted via relation)
            await db.artifact.delete({
                where: { id }
            });

            // Emit delete-artifact event
            const updSeq = await allocateUserSeq(userId);
            const deletePayload = buildDeleteArtifactUpdate(id, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: deletePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'api', level: 'error' }, `Failed to delete artifact: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete artifact' });
        }
    });
}
