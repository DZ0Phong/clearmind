import type { Task, RecurrenceRule } from "@/hooks/use-tasks";

/* ----------------------------------------------------------------
   ICS / iCalendar export — RFC 5545 compatible enough for
   Google Calendar / Apple Calendar / Outlook.
   ---------------------------------------------------------------- */

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}

function toIcsLocalDate(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    return `${pad4(d.getFullYear())}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }
  return `${pad4(d.getFullYear())}${pad2(d.getMonth() + 1)}${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function toIcsUtc(d: Date): string {
  return `${pad4(d.getUTCFullYear())}${pad2(d.getUTCMonth() + 1)}${pad2(
    d.getUTCDate()
  )}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(
    d.getUTCSeconds()
  )}Z`;
}

const RRULE_BY_RULE: Record<RecurrenceRule, string> = {
  daily: "FREQ=DAILY",
  weekday: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};

const DOW_TO_ICS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Escape text per RFC 5545 (commas, semicolons, newlines). */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Fold long lines at 73 octets per RFC. */
function fold(line: string): string {
  if (line.length <= 73) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + 73);
    out.push(i === 0 ? chunk : " " + chunk);
    i += 73;
  }
  return out.join("\r\n");
}

function eventLines(task: Task, dtstamp: string): string[] {
  if (!task.deadline) return [];
  const allDay = !task.deadline.includes("T");
  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:clearmind-${task.id}@clearmind.local`);
  lines.push(`DTSTAMP:${dtstamp}`);
  lines.push(
    allDay
      ? `DTSTART;VALUE=DATE:${toIcsLocalDate(task.deadline, true)}`
      : `DTSTART:${toIcsLocalDate(task.deadline, false)}`
  );

  // 1-hour default duration for timed events
  if (!allDay) {
    const d = new Date(task.deadline);
    const end = new Date(d.getTime() + 60 * 60 * 1000);
    const endIso = end.toISOString();
    lines.push(`DTEND:${toIcsLocalDate(endIso, false)}`);
  }

  lines.push(`SUMMARY:${escapeText(task.title)}`);
  if (task.description)
    lines.push(`DESCRIPTION:${escapeText(task.description)}`);
  if (task.location) lines.push(`LOCATION:${escapeText(task.location)}`);

  // Priority: ICS uses 1 (high) .. 9 (low); 5 is normal.
  if (task.priority === "high") lines.push("PRIORITY:1");
  else if (task.priority === "low") lines.push("PRIORITY:7");
  else lines.push("PRIORITY:5");

  // Recurrence
  if (task.recurrence) {
    let rrule = RRULE_BY_RULE[task.recurrence];
    if (task.recurrence === "weekly") {
      // anchor BYDAY to the start day
      const dow = new Date(task.deadline).getDay();
      rrule += `;BYDAY=${DOW_TO_ICS[dow]}`;
    }
    if (task.recurrenceEndAt) {
      const end = new Date(task.recurrenceEndAt);
      // UNTIL must be UTC per RFC
      rrule += `;UNTIL=${toIcsUtc(end)}`;
    }
    lines.push(`RRULE:${rrule}`);
  }

  // Categories from type + tags
  const cats = [task.type, ...(task.tags || [])].join(",");
  if (cats) lines.push(`CATEGORIES:${escapeText(cats)}`);

  // Status
  if (task.status === "done") lines.push("STATUS:COMPLETED");

  lines.push("END:VEVENT");
  return lines;
}

export function tasksToICS(tasks: Task[], calName = "Clearmind"): string {
  const now = new Date();
  const dtstamp = toIcsUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clearmind//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
  ];
  for (const t of tasks) {
    if (!t.deadline) continue;
    lines.push(...eventLines(t, dtstamp));
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** Trigger a browser download of the calendar. */
export function downloadICS(tasks: Task[], filename?: string) {
  const content = tasksToICS(tasks);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = filename || `clearmind-${stamp}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
