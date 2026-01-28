import { FastifyInstance } from "fastify";
import { z } from "zod";
import { makeSql } from "@agentfs/shared/src/db/client.js";
import { authenticate, requireScope } from "../auth.js";

export async function adminEmbeddingsRoutes(app: FastifyInstance) {
  app.post("/v1/admin/embeddings/requeue", async (req, reply) => {
    const ctx = await authenticate(req);
    requireScope(ctx, "admin");

    const Body = z.object({
      status: z.enum(["failed", "queued", "running", "succeeded"]).optional().default("failed"),
      limit: z.number().int().min(1).max(1000).optional().default(100)
    });
    const body = Body.parse(req.body);

    const sql = makeSql();
    try {
      const rows = await sql`
        WITH j AS (
          SELECT version_id
          FROM embedding_jobs
          WHERE tenant_id = ${ctx.tenantId}::uuid
            AND status = ${body.status}
          ORDER BY updated_at DESC
          LIMIT ${body.limit}
        )
        UPDATE embedding_jobs ej
        SET status = 'queued', updated_at = now(), last_error = NULL
        FROM j
        WHERE ej.version_id = j.version_id
        RETURNING ej.version_id
      `;

      return reply.send({ ok: true, requeued: rows.length });
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
}

