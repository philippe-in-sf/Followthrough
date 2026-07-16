import type { AppDatabase } from "../db/database.js";

export type MeetingLinkSeed = {
  label: string;
  url: string;
  linkType: "agenda" | "work" | "reference" | "other";
};

export type SeriesMeetingContext = {
  links: MeetingLinkSeed[];
};

type AttendeeTaskRow = {
  id: number;
  public_id: string;
  description: string;
  status: string;
  due_date: string | null;
  assignee_name: string;
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

export function getOpenAttendeeTasks(
  db: AppDatabase,
  attendeePublicIds: string[],
  userId: number,
  teamId: number,
  includePrivateTasks = false,
): AttendeeTaskRow[] {
  const uniqueAttendeeIds = [...new Set(attendeePublicIds)];
  if (uniqueAttendeeIds.length === 0) return [];

  const placeholders = uniqueAttendeeIds.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT tasks.id,
              tasks.public_id,
              tasks.description,
              tasks.status,
              tasks.due_date,
              people.name AS assignee_name
       FROM tasks
       JOIN people ON people.id = tasks.assignee_person_id
       WHERE people.public_id IN (${placeholders})
       AND people.team_id = ?
       AND people.archived_at IS NULL
       AND tasks.team_id = ?
       AND (tasks.private = 0 OR (? = 1 AND tasks.created_by_user_id = ?))
       AND tasks.status <> 'Done'
       AND tasks.archived_at IS NULL
       ORDER BY people.name COLLATE NOCASE,
                tasks.status = 'Blocked' DESC,
                tasks.due_date IS NULL,
                tasks.due_date ASC,
                tasks.created_at ASC`,
    )
    .all(
      ...uniqueAttendeeIds,
      teamId,
      teamId,
      includePrivateTasks ? 1 : 0,
      userId,
    ) as AttendeeTaskRow[];
}

export function linkOpenAttendeeTasksToMeeting(
  db: AppDatabase,
  meetingId: number,
  attendeeTasks: AttendeeTaskRow[],
) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO meeting_tasks (meeting_id, task_id) VALUES (?, ?)",
  );

  for (const task of attendeeTasks) {
    insert.run(meetingId, task.id);
  }
}

export function buildAttendeeTaskAgendaNotes(
  existingNotes: string,
  attendeeTasks: AttendeeTaskRow[],
) {
  if (attendeeTasks.length === 0) return existingNotes;

  const checkIns = attendeeTasks.map((task) => {
    const dueDate = task.due_date ? `, due ${task.due_date}` : "";
    const status = task.status === "Open" ? "" : `, ${task.status}`;
    const description = task.description.trim().replace(/\s+/g, " ");
    return `- ${task.assignee_name}: ${task.public_id} ${description}${dueDate}${status}`;
  });
  const agendaSection = ["## Things to check in on", ...checkIns].join("\n");
  const trimmedNotes = existingNotes.trim();

  return trimmedNotes ? `${trimmedNotes}\n\n${agendaSection}` : agendaSection;
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
