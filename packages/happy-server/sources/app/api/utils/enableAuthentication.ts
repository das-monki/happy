import { Fastify } from "../types";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";
import { db } from "@/storage/db";

export function enableAuthentication(app: Fastify) {
    app.decorate('authenticate', async function (request: any, reply: any) {
        try {
            const authHeader = request.headers.authorization;
            log({ module: 'auth-decorator' }, `Auth check - path: ${request.url}, has header: ${!!authHeader}, header start: ${authHeader?.substring(0, 50)}...`);
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                log({ module: 'auth-decorator' }, `Auth failed - missing or invalid header`);
                return reply.code(401).send({ error: 'Missing authorization header' });
            }

            const token = authHeader.substring(7);
            const verified = await auth.verifyToken(token);
            if (!verified) {
                log({ module: 'auth-decorator' }, `Auth failed - invalid token`);
                return reply.code(401).send({ error: 'Invalid token' });
            }

            // Verify account still exists in database (e.g. after DB wipe)
            const account = await db.account.findUnique({ where: { id: verified.userId }, select: { id: true } });
            if (!account) {
                log({ module: 'auth-decorator' }, `Auth failed - account not found for user: ${verified.userId}. Client must re-authenticate.`);
                return reply.code(401).send({ error: 'Account not found. Please log out and log in again.' });
            }

            log({ module: 'auth-decorator' }, `Auth success - user: ${verified.userId}`);
            request.userId = verified.userId;
        } catch (error) {
            return reply.code(401).send({ error: 'Authentication failed' });
        }
    });
}