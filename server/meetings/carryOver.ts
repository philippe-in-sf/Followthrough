import type { AppDatabase } from "../db/database.js";

export type MeetingLinkSeed = {
  label: string;
  url: string;
  linkType: "agenda" | "work" | "reference" | "other";
};

export type SeriesMeetingContext = {
  links: MeetingLinkSeed[];
};

export function linkOpenSeriesTasksToMeeting(
  db: AppDatabase,
  seriesId: number,
  meetingId: number,
  userId: number,
) {
  const tasks = db
    .prepare(
      `SELECT id
       FROM tasks
       WHERE series_id = ?
       AND (private = 0 OR created_by_user_id = ?)
       AND status <> 'Done'
       AND archived_at IS NULL
       ORDER BY created_at ASC, id ASC`,
    )
    .all(seriesId, userId) as Array<{ id: number }>;

  for (const task of tasks) {
    db.prepare(
      "INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)",
    ).run(meetingId, task.id);
  }
}

export function getLatestSeriesMeetingContext(
  db: AppDatabase,
  seriesId: number,
  startsAt: string,
  userId: number,
): SeriesMeetingContext {
  const latestMeeting = db
    .prepare(
      `SELECT id
       FROM meetings
       WHERE series_id = ?
       AND starts_at < ?
       AND (private = 0 OR created_by_user_id = ?)
       AND archived_at IS NULL
       ORDER BY starts_at DESC, id DESC
       LIMIT 1`,
    )
    .get(seriesId, startsAt, userId) as { id: number } | undefined;

  if (!latestMeeting) return { links: [] };

  const links = db
    .prepare(
      `SELECT label, url, link_type
       FROM meeting_links
       WHERE meeting_id = ?
       ORDER BY id ASC`,
    )
    .all(latestMeeting.id) as Array<{
    label: string;
    url: string;
    link_type: MeetingLinkSeed["linkType"];
  }>;

  return {
    links: links.map((link) => ({
      label: link.label,
      url: link.url,
      linkType: link.link_type,
    })),
  };
}

export function mergeCarriedLinks(
  carriedLinks: MeetingLinkSeed[],
  newLinks: MeetingLinkSeed[],
) {
  const links: MeetingLinkSeed[] = [];
  const seen = new Set<string>();

  for (const link of [...carriedLinks, ...newLinks]) {
    const key = `${link.linkType}\n${link.url}\n${link.label}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  return links;
}
