/**
 * Single source of truth for the record-visibility invariant.
 *
 * Every query that returns team-owned records (tasks, meetings, and anything
 * derived from them) must enforce two things:
 *
 *   1. Team scope: the row's `team_id` matches the caller's team. This is
 *      applied by each query with an explicit `... .team_id = ?` clause and a
 *      bound `teamId` parameter. It is not abstracted away here because the
 *      correct table alias and parameter position are query-specific.
 *
 *   2. Private-record visibility: a row flagged `private = 1` is visible only
 *      to its creator. This clause is identical everywhere it appears, so it
 *      lives here to prevent the copies from drifting apart.
 *
 * Binding contract: `visibleRecordCondition` returns a fragment containing a
 * single positional `?`. The caller MUST bind the current user's id at the
 * matching position. Keep the fragment and its bound `userId` together.
 *
 * This module centralizes the *definition* of the invariant. It does not (yet)
 * make it structurally impossible to forget the clause at a call site; that
 * would require a repository/query-builder layer and is tracked as a larger
 * follow-up. The unit test in tests/server/scoping.test.ts pins the fragment
 * so an accidental change fails loudly.
 */

/** Table aliases that carry the `private` / `created_by_user_id` columns. */
export type ScopedRecordTable = "tasks" | "meetings";

/**
 * SQL fragment restricting visibility of private records to their creator.
 * Contains exactly one `?` placeholder — bind the current user's id for it.
 */
export function visibleRecordCondition(table: ScopedRecordTable): string {
  return `(${table}.private = 0 OR ${table}.created_by_user_id = ?)`;
}

/**
 * Whether `userId` is allowed to mark a record private. A record can be made
 * private by its creator, or when it has no recorded creator (legacy rows).
 */
export function canMakePrivate(createdByUserId: number | null, userId: number): boolean {
  return createdByUserId === null || createdByUserId === userId;
}
