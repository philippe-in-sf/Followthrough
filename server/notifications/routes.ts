import { Router } from "express";
import { z } from "zod";
import type { AppDatabase } from "../db/database.js";
import { badRequest, notFound } from "../errors.js";
import { parseBody } from "../validation.js";

const pushSubscriptionInputSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

type AssignmentNotificationRow = {
  id: number;
  task_public_id: string;
  task_description: string;
  triggered_by_name: string | null;
  created_at: string;
};

function publicVapidKey() {
  return process.env.WEB_PUSH_PUBLIC_KEY ?? null;
}

export function notificationRoutes(db: AppDatabase) {
  const router = Router();

  router.get("/config", (_req, res) => {
    res.json({ publicVapidKey: publicVapidKey() });
  });

  router.post("/push-subscriptions", (req, res, next) => {
    try {
      const input = parseBody(req, pushSubscriptionInputSchema);
      const userId = req.user?.id;
      if (!userId) throw badRequest("Sign in before enabling notifications");

      db.prepare(
        `INSERT INTO user_push_subscriptions
         (user_id, endpoint, p256dh, auth, user_agent)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           user_agent = excluded.user_agent,
           updated_at = CURRENT_TIMESTAMP`,
      ).run(
        userId,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        req.get("user-agent") ?? null,
      );

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.delete("/push-subscriptions", (req, res, next) => {
    try {
      const endpoint = String(req.query.endpoint ?? "");
      if (!endpoint) throw badRequest("Subscription endpoint is required");

      db.prepare("DELETE FROM user_push_subscriptions WHERE user_id = ? AND endpoint = ?").run(
        req.user?.id ?? 0,
        endpoint,
      );
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/task-assignments", (req, res) => {
    const afterId = Number(req.query.afterId ?? 0);
    const rows = db
      .prepare(
        `SELECT task_assignment_notifications.id,
                tasks.public_id AS task_public_id,
                tasks.description AS task_description,
                users.name AS triggered_by_name,
                task_assignment_notifications.created_at
         FROM task_assignment_notifications
         JOIN tasks ON tasks.id = task_assignment_notifications.task_id
         LEFT JOIN users ON users.id = task_assignment_notifications.triggered_by_user_id
         WHERE task_assignment_notifications.user_id = ?
         AND task_assignment_notifications.id > ?
         AND task_assignment_notifications.read_at IS NULL
         ORDER BY task_assignment_notifications.id ASC`,
      )
      .all(req.user?.id ?? 0, afterId) as AssignmentNotificationRow[];

    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        taskPublicId: row.task_public_id,
        taskDescription: row.task_description,
        triggeredByName: row.triggered_by_name,
        createdAt: row.created_at,
      })),
    });
  });

  router.post("/task-assignments/:id/read", (req, res, next) => {
    try {
      const result = db
        .prepare(
          `UPDATE task_assignment_notifications
           SET read_at = CURRENT_TIMESTAMP
           WHERE id = ?
           AND user_id = ?
           AND read_at IS NULL`,
        )
        .run(Number(req.params.id), req.user?.id ?? 0);

      if (result.changes === 0) throw notFound("Notification not found");
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
