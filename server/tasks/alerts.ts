import type { AlertState, TaskStatus } from "../../shared/types.js";

function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getTaskAlert(
  dueDate: string | null,
  status: TaskStatus,
  dueSoonDays: number,
  now = new Date(),
): AlertState | null {
  if (!dueDate || status === "Done") return null;

  const today = startOfToday(now);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return "overdue";
  if (diffDays <= dueSoonDays) return "dueSoon";
  return null;
}
