/**
 * Conflict-free merge for continuous cross-device sync (the polling milestone).
 *
 * Each device holds its full task list plus a tombstone map (id → deletedAt).
 * The cloud relay only ever stores an opaque ENCRYPTED blob of this state, so
 * merging happens entirely on the client. The rules are intentionally simple +
 * commutative enough for eventual consistency between any number of devices:
 *
 *   - For a given task id, the version with the newest `updatedAt` wins.
 *   - A tombstone suppresses a task ONLY if the delete happened at/after that
 *     task's last edit. If the task was edited/re-created AFTER the delete, the
 *     task wins and the stale tombstone is dropped (so re-adds aren't eaten).
 *   - Tombstones union by latest `deletedAt`; old ones are pruned after a TTL.
 *
 * Because every client re-pushes whenever a pull changes its local state, the
 * fleet converges: a stale device that overwrites the relay with old data gets
 * corrected the moment any up-to-date device pulls + re-pushes.
 */
import type { Task } from "@/hooks/use-tasks";

export interface SyncState {
  tasks: Task[];
  deletions: Record<string, string>; // id → ISO deletedAt
}

function ms(s?: string): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : 0;
}

/** Most-recent edit stamp for a task (falls back to createdAt for old tasks). */
function taskTime(t: Task): number {
  return ms(t.updatedAt || t.createdAt);
}

/** Merge two sync states. Pure — no clocks, no mutation of the inputs. */
export function mergeState(a: SyncState, b: SyncState): SyncState {
  // Union tombstones, keeping the latest deletedAt per id.
  const deletions: Record<string, string> = { ...(a.deletions || {}) };
  for (const [id, when] of Object.entries(b.deletions || {})) {
    if (!deletions[id] || ms(when) > ms(deletions[id])) deletions[id] = when;
  }

  // Pick the newest version of each task by id.
  const byId = new Map<string, Task>();
  for (const t of [...(a.tasks || []), ...(b.tasks || [])]) {
    if (!t || !t.id) continue;
    const cur = byId.get(t.id);
    if (!cur || taskTime(t) > taskTime(cur)) byId.set(t.id, t);
  }

  // Apply tombstones: drop a task if it was deleted at/after its last edit;
  // otherwise the task wins and we drop the now-stale tombstone.
  const tasks: Task[] = [];
  for (const t of byId.values()) {
    const del = deletions[t.id];
    if (del && ms(del) >= taskTime(t)) continue;
    if (del) delete deletions[t.id];
    tasks.push(t);
  }

  // Newest-first by creation, matching addTask's prepend convention so the
  // list order stays stable + predictable after a merge.
  tasks.sort((x, y) => ms(y.createdAt) - ms(x.createdAt));
  return { tasks, deletions };
}

/** Order-insensitive structural equality — lets the engine skip a no-op push
 *  (and avoid an infinite push⇄pull loop) when a merge changed nothing. */
export function sameState(a: SyncState, b: SyncState): boolean {
  const norm = (s: SyncState) => {
    const tasks = [...(s.tasks || [])].sort((x, y) => x.id.localeCompare(y.id));
    const delKeys = Object.keys(s.deletions || {}).sort();
    const deletions = delKeys.map((k) => `${k}:${s.deletions[k]}`);
    return JSON.stringify({ tasks, deletions });
  };
  return norm(a) === norm(b);
}

// Tombstones older than this have long since propagated to every device, so we
// drop them to keep the synced blob from growing forever.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Drop tombstones older than the TTL. `now` is injected (pure + testable). */
export function pruneDeletions(
  deletions: Record<string, string>,
  now: number
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, when] of Object.entries(deletions || {})) {
    if (now - ms(when) < TOMBSTONE_TTL_MS) out[id] = when;
  }
  return out;
}
