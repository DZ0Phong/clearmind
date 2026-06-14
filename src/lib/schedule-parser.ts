/* ----------------------------------------------------------------
   Schedule parser — converts text / HTML / ICS into ParsedClass[]
   Tolerant heuristics; user previews + edits before import.
   ---------------------------------------------------------------- */

import { SUBJECT_CODE_PATTERN as SUBJECT_CODE_RE } from "@/lib/utils";

export interface ParsedClass {
  /** Stable id within an import batch, used for editing in preview. */
  id: string;
  subject: string;
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  dayOfWeek: number;
  /** "HH:MM" 24-hour */
  startTime: string;
  endTime?: string;
  location?: string;
  teacher?: string;
  notes?: string;
  /** First-occurrence date (YYYY-MM-DD). If absent, we'll compute next upcoming weekday. */
  startDate?: string;
  /** Last-occurrence date — used to set recurrenceEndAt on the created task. */
  endDate?: string;
  /**
   * Cell was marked "(attended)" / "đã điểm danh" → student already showed up;
   * skipped from import by default.
   */
  attended?: boolean;
  /**
   * One-off event (sports match, single meeting, calendar invite) — NOT a
   * recurring weekly class. When true, the import creates a non-recurring
   * task with the exact deadline `startDate + startTime`.
   */
  oneOff?: boolean;
  /** Source line for debugging/preview. */
  raw?: string;
}

// ---- Day-of-week patterns (Vietnamese + English) -------------------------

const DAY_PATTERNS: Array<[RegExp, number]> = [
  [/\b(?:chu\s*nhat|chu\s*nhật|cn|sunday|sun)\b/i, 0],
  [/\b(?:thu\s*2|thứ\s*2|thứ\s*hai|t2|monday|mon)\b/i, 1],
  [/\b(?:thu\s*3|thứ\s*3|thứ\s*ba|t3|tuesday|tue)\b/i, 2],
  [/\b(?:thu\s*4|thứ\s*4|thứ\s*tu|thứ\s*tư|t4|wednesday|wed)\b/i, 3],
  [/\b(?:thu\s*5|thứ\s*5|thứ\s*năm|t5|thursday|thurs|thu)\b/i, 4],
  [/\b(?:thu\s*6|thứ\s*6|thứ\s*sáu|thứ\s*sau|t6|friday|fri)\b/i, 5],
  [/\b(?:thu\s*7|thứ\s*7|thứ\s*bảy|thứ\s*bay|t7|saturday|sat)\b/i, 6],
];

function detectDay(text: string): number | null {
  for (const [re, dow] of DAY_PATTERNS) {
    if (re.test(text)) return dow;
  }
  return null;
}

// ---- Time / room / date patterns -----------------------------------------

const TIME_RANGE_RE =
  /(\d{1,2})\s*[:hg](?:iờ|ờ)?\s*(\d{2})?\s*[-–—~]\s*(\d{1,2})\s*[:hg](?:iờ|ờ)?\s*(\d{2})?/;
const TIME_SINGLE_RE = /(\d{1,2})\s*[:hg](?:iờ|ờ)?\s*(\d{2})/;
// Room codes — preferred patterns have an EXPLICIT separator (dot, dash, or
// "lab" prefix) to distinguish them from subject codes that look similar.
// Matches: A1.404, B2-305, Lab C3.501, BE-207, AL-L307, H6-301
const ROOM_SEP_RE =
  /\b((?:lab\s+)?[A-Z]{1,4}\d*[.-][A-Z]?\d+(?:[.-]\d+)*[A-Za-z]?)\b/i;
// Fallback for bare patterns like P401, P305 (single leading letter avoids
// matching subject codes like PRU213 which are 3+ letters).
const ROOM_BARE_RE = /\b([A-Z]\d{3,4}[A-Za-z]?|P\d{2,4})\b/;
// Vietnamese explicit-prefix room: "Phòng EXE 1", "Phòng A205", "Phòng E3".
// Captures the room descriptor that follows — used as a high-confidence
// match when no separator-room pattern hits (space-separated room names).
const ROOM_VN_RE = /\b(?:phòng|phong)\s+([A-Z][A-Za-z0-9]*(?:\s+\d{1,3})?)/i;
// Subject code: see SUBJECT_CODE_PATTERN re-imported as SUBJECT_CODE_RE at
// the top of the file — typical FPT codes (3-4 letters + 3-4 digits, optional
// lowercase variant suffix). Examples: PRU213, PRN222, SWD392, EXE101g.
// Date pattern — require slash or dash separator only (not period — too
// noisy with room codes like A1.404), refuse matches preceded by a letter.
const DATE_RE = /(?<![A-Za-z])\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;

// Noise tokens from school portals that should never end up in subject:
// "View Materials at", "Meet URL", "(attended)", "(Not yet)", "( )",
// "(_ChangeDate)", etc.
const NOISE_RES: RegExp[] = [
  /view\s+materials?(?:\s+at)?/gi,
  /meet\s+url/gi,
  /\(\s*attended\s*\)/gi,
  /\(\s*not\s+yet\s*\)/gi,
  /\(\s*_?changedate\s*\)/gi,
  /\(\s*\)/g, // empty parens
];

function stripNoise(s: string): string {
  let out = s;
  for (const re of NOISE_RES) out = out.replace(re, " ");
  return out;
}

function detectAttended(s: string): boolean {
  return /\(\s*attended\s*\)/i.test(s);
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function parseTime(h: string, m?: string): string {
  return `${pad2(parseInt(h, 10))}:${m ? m.padStart(2, "0") : "00"}`;
}

function nextOccurrence(dow: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const diff = (dow - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 && d.getDate() === from.getDate() ? 0 : diff));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ---- Subject + Room extractor -------------------------------------------

interface SubjectAndRoom {
  subject: string;
  location?: string;
}

/**
 * Pull a subject + room from a messy cell or line. Strategy:
 *  1. Strip portal noise (View Materials at, Meet URL, attended badges...).
 *  2. Prefer rooms with explicit separators (BE-207, A1.404) — high confidence.
 *  3. Otherwise fall back to bare patterns (P401, A305).
 *  4. Detect a subject code (PRU213) — if found, use it as the title.
 *  5. Otherwise, clean residual text and use whatever is left.
 */
function extractSubjectAndRoom(input: string): SubjectAndRoom {
  let s = stripNoise(input);
  // Strip embedded time / date so they don't pollute the residue
  s = s.replace(TIME_RANGE_RE, " ").replace(TIME_SINGLE_RE, " ").replace(DATE_RE, " ");

  // 1) Room with separator first (BE-207, A1.404, Lab C3.501)
  let location: string | undefined;
  const sepMatch = s.match(ROOM_SEP_RE);
  if (sepMatch) {
    location = sepMatch[1].replace(/\s+/g, "");
    s = s.replace(sepMatch[0], " ");
  }

  // 2) Subject code (PRU213, SWD392, EXE101g) — pull this BEFORE the
  // Vietnamese "Phòng …" room sweep so the code doesn't accidentally get
  // gobbled when it sits next to the room descriptor.
  let subjectCode: string | undefined;
  const codeMatch = s.match(SUBJECT_CODE_RE);
  if (codeMatch) {
    subjectCode = codeMatch[1];
    s = s.replace(codeMatch[0], " ");
  }

  // 3a) Vietnamese explicit-prefix room ("Phòng EXE 1") — strip the "Phòng"
  // word along with its descriptor, otherwise the descriptor leaks into the
  // subject residue ("EXE 1") and the bare "Phòng" remains as location.
  if (!location) {
    const vnMatch = s.match(ROOM_VN_RE);
    if (vnMatch) {
      location = vnMatch[1].replace(/\s{2,}/g, " ").trim();
      s = s.replace(vnMatch[0], " ");
    }
  }

  // 3b) Fallback room (bare like P401)
  if (!location) {
    const bareMatch = s.match(ROOM_BARE_RE);
    if (bareMatch) {
      location = bareMatch[1];
      s = s.replace(bareMatch[0], " ");
    }
  }

  // 4) Clean residue
  let residue = s
    .replace(/\b(?:tiết|tiet)\s*\d+\s*[-–—~]?\s*\d*/gi, " ")
    .replace(/\b(?:phòng|phong|room|lớp|lop)\b[:-]?\s*/gi, " ")
    .replace(
      /(?:thầy|cô|thay|co|teacher|gv|gvgd)\s+[a-zA-ZÀ-ỹĐđ]+(?:\s+[a-zA-ZÀ-ỹĐđ]+){0,4}/gi,
      " "
    )
    .replace(/[|│·•]+/g, " ")
    .replace(/[-–—]{1,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,\-:.()]+|[\s,\-:.()]+$/g, "")
    .trim();

  // If we found a subject code, prefer it (most universities use codes as
  // the canonical subject id). Append residue as a hint if it adds info.
  let subject: string;
  if (subjectCode) {
    // Don't bother appending residue if it's too short or junk-looking
    const cleanResidue = residue.length >= 4 && /[a-zA-ZÀ-ỹĐđ]/.test(residue)
      ? residue.replace(/^[a-z]\s/i, "") // strip leading 1-letter words
      : "";
    subject = cleanResidue ? `${subjectCode} — ${cleanResidue}` : subjectCode;
  } else {
    subject = residue;
  }

  return { subject, location };
}

// ---- Text parser ---------------------------------------------------------

export function parseTimetableText(text: string): ParsedClass[] {
  if (!text || !text.trim()) return [];
  const out: ParsedClass[] = [];
  let contextDay: number | null = null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, " | ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const inlineDay = detectDay(line);
    const timeMatch = line.match(TIME_RANGE_RE);
    const singleTimeMatch = !timeMatch ? line.match(TIME_SINGLE_RE) : null;

    // pure header line: day name but no time
    if (inlineDay !== null && !timeMatch && !singleTimeMatch) {
      contextDay = inlineDay;
      continue;
    }

    if (!timeMatch && !singleTimeMatch) continue;

    const dow = inlineDay !== null ? inlineDay : contextDay;
    if (dow === null) continue;

    let startTime = "";
    let endTime: string | undefined;
    if (timeMatch) {
      startTime = parseTime(timeMatch[1], timeMatch[2]);
      endTime = parseTime(timeMatch[3], timeMatch[4]);
    } else if (singleTimeMatch) {
      startTime = parseTime(singleTimeMatch[1], singleTimeMatch[2]);
    }

    // optional start/end date if present
    const dateMatch = line.match(DATE_RE);
    let startDate: string | undefined;
    if (dateMatch) {
      const d = parseInt(dateMatch[1], 10);
      const m = parseInt(dateMatch[2], 10);
      const yRaw = dateMatch[3]
        ? parseInt(dateMatch[3].length === 2 ? "20" + dateMatch[3] : dateMatch[3], 10)
        : new Date().getFullYear();
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        startDate = `${yRaw}-${pad2(m)}-${pad2(d)}`;
      }
    }

    // Strip time + date + day name from working copy, then pull subject/room
    let working = line
      .replace(TIME_RANGE_RE, " ")
      .replace(TIME_SINGLE_RE, " ")
      .replace(DATE_RE, " ");
    for (const [re] of DAY_PATTERNS) working = working.replace(re, " ");

    const built = extractSubjectAndRoom(working);
    const subject = built.subject;
    const location = built.location;
    const attended = detectAttended(line);
    if (subject.length < 2) continue;

    out.push({
      id: makeId(),
      subject,
      dayOfWeek: dow,
      startTime,
      endTime,
      location,
      startDate,
      attended: attended || undefined,
      raw: line,
    });
  }

  return dedupeClasses(out);
}

// ---- HTML parser (DOMParser path) ----------------------------------------

export function parseTimetableHTML(html: string): ParsedClass[] {
  if (!html || typeof DOMParser === "undefined") return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return [];
  }

  // Strategy: run the day-column parser on EVERY table in the document and
  // pick whichever yields the most classes. This is robust against pages
  // that wrap the real timetable in an outer container table (FPT/FAP),
  // because the wrapper will yield 0 classes while the nested real table
  // yields the actual list. No fragile scoring needed.
  const tables = Array.from(doc.querySelectorAll("table"));
  let best: ParsedClass[] = [];
  let bestTable: HTMLTableElement | null = null;
  for (const t of tables) {
    const parsed = parseTableByDayColumns(t as HTMLTableElement);
    if (parsed.length > best.length) {
      best = parsed;
      bestTable = t as HTMLTableElement;
    }
  }
  if (best.length > 0) return dedupeClasses(best);

  // Fallback: if no day-column table worked, try the largest plain-text candidate
  const fallbackSource = bestTable || pickLargestTable(tables) || doc.body;
  return parseTimetableText(fallbackSource?.textContent || "");
}

function pickLargestTable(tables: Element[]): Element | null {
  let best: Element | null = null;
  let bestLen = 0;
  for (const t of tables) {
    const len = (t.textContent || "").length;
    if (len > bestLen) {
      bestLen = len;
      best = t;
    }
  }
  return best;
}

interface HeaderInfo {
  rowIndex: number;
  /** raw cell idx → day-of-week */
  colToDay: Map<number, number>;
  /** day-of-week (0..6) → ISO date "YYYY-MM-DD"; populated only if inline dates found */
  dateByDow: Map<number, string>;
}

function extractDateFromText(text: string, yearHint: number): string | null {
  const m = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = m[3]
    ? parseInt(m[3].length === 2 ? "20" + m[3] : m[3], 10)
    : yearHint;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function findDayHeaderRow(
  rows: HTMLTableRowElement[],
  yearHint: number
): HeaderInfo | null {
  let best: HeaderInfo | null = null;
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = Array.from(rows[r].querySelectorAll("th,td"));
    const colToDay = new Map<number, number>();
    const dateByDow = new Map<number, string>();
    cells.forEach((c, idx) => {
      const text = c.textContent || "";
      const dow = detectDay(text);
      if (dow !== null) {
        colToDay.set(idx, dow);
        // Same cell may carry an inline date ("Mon<br>08/06")
        const inlineDate = extractDateFromText(text, yearHint);
        if (inlineDate) dateByDow.set(dow, inlineDate);
      }
    });
    if (colToDay.size > (best?.colToDay.size ?? 0)) {
      best = { rowIndex: r, colToDay, dateByDow };
    }
  }
  return best && best.colToDay.size >= 5 ? best : null;
}

/**
 * Try to pull dates from the row *below* the day-name row. Handles tables
 * where the day-name row has a leading `rowspan="2"` cell (FPT) — the date
 * row then has FEWER cells because the rowspan visually occupies its first
 * slot. We compute the shift from cell-count difference.
 */
function extractDateRowByDow(
  dayHeaderRow: HTMLTableRowElement,
  dateRow: HTMLTableRowElement | undefined,
  yearHint: number
): Map<number, string> {
  if (!dateRow) return new Map();
  const dayCells = Array.from(dayHeaderRow.querySelectorAll("th,td"));
  const dateCells = Array.from(dateRow.querySelectorAll("th,td"));

  // Try both alignment strategies and keep whichever yields more matches.
  // Strategy A: physical idx alignment (no rowspan in day row)
  // Strategy B: shift date cells left by the day-row's extra-prefix count
  const shiftCandidates = [0, Math.max(0, dayCells.length - dateCells.length)];
  let bestMap = new Map<number, string>();
  for (const shift of shiftCandidates) {
    const map = new Map<number, string>();
    for (let i = 0; i < dayCells.length; i++) {
      const dow = detectDay(dayCells[i].textContent || "");
      if (dow === null) continue;
      const dateIdx = i - shift;
      if (dateIdx < 0 || dateIdx >= dateCells.length) continue;
      const d = extractDateFromText(dateCells[dateIdx].textContent || "", yearHint);
      if (d) map.set(dow, d);
    }
    if (map.size > bestMap.size) bestMap = map;
  }
  return bestMap.size >= 5 ? bestMap : new Map();
}

/**
 * Resolve the most-likely year for the timetable, defensive against pages
 * with multi-year selects (FPT FAP lists 2023..2027 in the dropdown).
 */
function detectYearHint(table: HTMLTableElement): number {
  const currentYear = new Date().getFullYear();
  // 1) Look up the document for a selected year option
  const doc = table.ownerDocument;
  if (doc) {
    const selected = doc.querySelectorAll("option[selected]");
    for (const opt of Array.from(selected)) {
      const txt = (opt.textContent || "").trim();
      const m = txt.match(/^(20\d{2})$/);
      if (m) return parseInt(m[1], 10);
      // Sometimes the year is in the value attribute
      const valAttr = (opt as HTMLOptionElement).value || "";
      const vm = valAttr.match(/^(20\d{2})$/);
      if (vm) return parseInt(vm[1], 10);
    }
  }
  // 2) Pick the year mention closest to the current year
  const matches = (table.textContent || "").match(/\b(20\d{2})\b/g);
  if (matches && matches.length) {
    let best = currentYear;
    let bestDist = Infinity;
    for (const ym of matches) {
      const y = parseInt(ym, 10);
      const dist = Math.abs(y - currentYear);
      if (dist < bestDist) {
        bestDist = dist;
        best = y;
      }
    }
    return best;
  }
  // 3) Fallback
  return currentYear;
}

/** Most-frequent value in a list, or `fallback` if list is empty. */
function mode(nums: number[], fallback: number): number {
  if (!nums.length) return fallback;
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  let best = fallback;
  let bestFreq = 0;
  for (const [v, f] of counts) {
    if (f > bestFreq) {
      bestFreq = f;
      best = v;
    }
  }
  return best;
}

function parseTableByDayColumns(table: HTMLTableElement): ParsedClass[] {
  const out: ParsedClass[] = [];
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return out;

  // Year hint resolution (FPT dropdown has 2023..2027 — regex would pick the
  // first which is 2023, putting deadlines 3 years in the past):
  //   1) any <option selected> whose text is a 4-digit year
  //   2) closest 20xx year mentioned in the table to today's year
  //   3) current year
  const yearHint = detectYearHint(table);

  // 1) Find which row contains the day-of-week header (also pulls inline dates)
  const header = findDayHeaderRow(rows as HTMLTableRowElement[], yearHint);
  if (!header) return out;
  const { rowIndex: headerIdx, colToDay } = header;
  let dateByDow = header.dateByDow;

  // 2) If we didn't get dates inline, check the row right below for "08/06 09/06 ..."
  if (dateByDow.size === 0) {
    dateByDow = extractDateRowByDow(
      rows[headerIdx] as HTMLTableRowElement,
      rows[headerIdx + 1] as HTMLTableRowElement | undefined,
      yearHint
    );
  }
  const dataStart = headerIdx + (dateByDow.size > 0 && !header.dateByDow.size ? 2 : 1);

  // 3) Determine data-row column offset using MODE of cell counts (robust to
  // empty divider rows like "Slot 0 - - - - - - -" that may collapse via
  // colspan or have fewer cells than real data rows).
  const headerCellCount = Array.from(
    rows[headerIdx].querySelectorAll("th,td")
  ).length;
  const dataRowCellCounts: number[] = [];
  for (let r = dataStart; r < rows.length; r++) {
    const c = Array.from(rows[r].querySelectorAll("th,td")).length;
    // Only consider rows with at least as many cells as the header — these
    // are plausible "real" data rows. Smaller rows are likely dividers.
    if (c >= headerCellCount) dataRowCellCounts.push(c);
  }
  const modalCellCount = mode(dataRowCellCounts, headerCellCount);
  const offset = Math.max(0, modalCellCount - headerCellCount);

  // 4) Process data rows with the offset applied
  for (let r = dataStart; r < rows.length; r++) {
    const cells = Array.from(rows[r].querySelectorAll("th,td"));
    if (cells.length < modalCellCount) continue; // skip dividers / collapsed rows

    // rowLabel may carry time info ("Tiết 1-3", "07:00 - 09:30")
    const rowLabel = offset > 0 ? (cells[0]?.textContent?.trim() || "") : "";
    const timeMatch =
      rowLabel.match(TIME_RANGE_RE) || rowLabel.match(TIME_SINGLE_RE);

    cells.forEach((c, idx) => {
      // Skip the leading label cell(s) when data has extra columns
      if (idx < offset) return;
      // Map data idx → header idx by subtracting the offset
      const headerColIdx = idx - offset;
      const day = colToDay.get(headerColIdx);
      if (day === undefined) return;
      const text = (c.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text === "-") return;

      // try to extract per-cell time too (some schools embed time in cell)
      const cellTimeRange = text.match(TIME_RANGE_RE);
      const cellTimeSingle = !cellTimeRange ? text.match(TIME_SINGLE_RE) : null;
      let startTime = "";
      let endTime: string | undefined;
      if (cellTimeRange) {
        startTime = parseTime(cellTimeRange[1], cellTimeRange[2]);
        endTime = parseTime(cellTimeRange[3], cellTimeRange[4]);
      } else if (cellTimeSingle) {
        startTime = parseTime(cellTimeSingle[1], cellTimeSingle[2]);
      } else if (timeMatch) {
        startTime = parseTime(timeMatch[1], timeMatch[2]);
        if (timeMatch.length >= 5 && timeMatch[3]) {
          endTime = parseTime(timeMatch[3], timeMatch[4]);
        }
      }
      if (!startTime) return;

      const built = extractSubjectAndRoom(text);
      const subject = built.subject;
      const location = built.location;
      const attended = detectAttended(text);
      if (subject.length < 2) return;

      // Prefer the actual date if we identified it (inline or sub-row)
      const startDate = dateByDow.get(day);

      out.push({
        id: makeId(),
        subject,
        dayOfWeek: day,
        startTime,
        endTime,
        location,
        startDate,
        attended: attended || undefined,
        raw: text,
      });
    });
  }
  return out;
}

// ---- ICS parser ----------------------------------------------------------

const ICS_DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export function parseICS(ics: string): ParsedClass[] {
  if (!ics || !ics.includes("BEGIN:VEVENT")) return [];
  // unfold continuation lines per RFC 5545
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const out: ParsedClass[] = [];
  const blocks = unfolded.split(/BEGIN:VEVENT/);
  for (const blk of blocks.slice(1)) {
    const body = blk.split(/END:VEVENT/)[0];
    const get = (key: string): string | undefined => {
      const re = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, "im");
      const m = body.match(re);
      return m ? m[1].trim() : undefined;
    };
    const summary = get("SUMMARY") || "";
    const location = get("LOCATION");
    const description = get("DESCRIPTION");
    const dtstart = get("DTSTART");
    const dtend = get("DTEND");
    const rrule = get("RRULE");

    if (!summary || !dtstart) continue;

    const start = parseIcsDate(dtstart);
    if (!start) continue;
    const end = dtend ? parseIcsDate(dtend) : null;

    let dow: number;
    if (rrule) {
      const byDayM = rrule.match(/BYDAY=([A-Z,]+)/);
      if (byDayM) {
        const first = byDayM[1].split(",")[0].slice(-2).toUpperCase();
        dow = ICS_DAY_MAP[first] ?? start.getDay();
      } else {
        dow = start.getDay();
      }
    } else {
      dow = start.getDay();
    }

    const untilM = rrule?.match(/UNTIL=([^;]+)/);
    const endDate = untilM ? formatIcsDateOnly(parseIcsDate(untilM[1])) : undefined;

    out.push({
      id: makeId(),
      subject: summary,
      dayOfWeek: dow,
      startTime: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
      endTime: end
        ? `${pad2(end.getHours())}:${pad2(end.getMinutes())}`
        : undefined,
      location: location || undefined,
      notes: description?.replace(/\\n/g, "\n").replace(/\\,/g, ",") || undefined,
      startDate: formatIcsDateOnly(start),
      endDate,
      // No RRULE = one-off event (Google Calendar invite, single meeting…)
      oneOff: !rrule || undefined,
      raw: summary,
    });
  }
  return dedupeClasses(out);
}

function parseIcsDate(value: string): Date | null {
  if (!value) return null;
  // ICS forms: YYYYMMDD, YYYYMMDDTHHMMSS, YYYYMMDDTHHMMSSZ
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/
  );
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const hh = m[4] ? parseInt(m[4], 10) : 0;
  const mm = m[5] ? parseInt(m[5], 10) : 0;
  const ss = m[6] ? parseInt(m[6], 10) : 0;
  const isUtc = value.endsWith("Z");
  return isUtc
    ? new Date(Date.UTC(y, mo, d, hh, mm, ss))
    : new Date(y, mo, d, hh, mm, ss);
}

function formatIcsDateOnly(d: Date | null): string | undefined {
  if (!d) return undefined;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ---- Utility -------------------------------------------------------------

function dedupeClasses(items: ParsedClass[]): ParsedClass[] {
  const seen = new Set<string>();
  const out: ParsedClass[] = [];
  for (const c of items) {
    // One-off events: dedupe by exact date+time+title (different days are
    // different events even if same slot signature). Weekly classes: dedupe
    // by recurring slot signature (date doesn't matter — it's the SAME class).
    const k = c.oneOff
      ? `e|${c.startDate || ""}|${c.startTime}|${c.subject.toLowerCase()}|${(c.location || "").toLowerCase()}`
      : `w|${c.dayOfWeek}|${c.startTime}|${c.subject.toLowerCase()}|${(c.location || "").toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

export function computeFirstOccurrenceISO(
  c: ParsedClass,
  from: Date = new Date()
): string {
  let dateStr = c.startDate;
  // One-off events trust their explicit date unconditionally — a sports
  // fixture last week is real history, not "scraped from an old term".
  // Recurring classes need the stale-date guard below.
  if (!c.oneOff && dateStr) {
    const parsed = new Date(`${dateStr}T00:00:00`);
    const oneWeekAgo = new Date(from);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (Number.isNaN(parsed.getTime()) || parsed < oneWeekAgo) {
      dateStr = undefined;
    }
  }
  dateStr = dateStr ?? nextOccurrence(c.dayOfWeek, from);
  return `${dateStr}T${c.startTime}:00`;
}

// DOW_LABEL_VI was deprecated then removed — all consumers now use i18n
// keys `review.dow.{sun|mon|tue|...}` via useT().

// ---- Event-list parser (one-off events) -----------------------------------
// Universal format: one line = one event with date + time + title (+ optional
// location). Covers WC fixtures, Google Calendar copy-paste, conference
// agendas, anything that ISN'T a recurring weekly grid.
//   30/06/2026 21:00 Vietnam vs Thailand · Mỹ Đình
//   01/07 23:30 Brazil vs Argentina @ Maracana
//   02-07 15:00 — Pháp vs Bồ Đào Nha (Sân Wembley)
//   Mon 30 Jun 21:00 Final match, Lusail Stadium
// Month names → number (English full + abbreviation). Vietnamese months are
// numeric ("tháng 6") so they're handled by DATE_VN_RE below.
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_WORD =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// Date forms recognised anywhere in a line (event lists / sports fixtures):
const DATE_ISO_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/; //              2026-06-30
const DATE_VN_RE = /\b(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})\b(?:\s*(?:năm\s*)?(\d{4}))?/i; // 13 tháng 6 [năm 2026]
const DATE_DMONTH_RE = new RegExp(`\\b(\\d{1,2})\\s+${MONTH_WORD}\\b(?:,?\\s+(\\d{4}))?`, "i"); // 13 June [2026]
const DATE_MONTHD_RE = new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2})\\b(?:,?\\s+(\\d{4}))?`, "i"); // June 13[, 2026]
// Numeric slash/dot date (NOT bare dash — that collides with time ranges
// "08:15-09:45" and team separators "Brazil - Ma Rốc"). Trailing ":" allowed
// so "ngày 12/6: …" is recognised; trailing digit blocked.
const DATE_NUM_RE = /(?<!\d)(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?!\d)/;
// Dash form only when an explicit 4-digit year disambiguates it ("30-06-2026").
const DATE_NUMDASH_RE = /(?<![\d-])(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/;

// 12-hour am/pm ("6pm", "8:30 pm", "12am") — tried BEFORE 24h so "1pm" wins
// over a parenthetical "(19:00 GMT)" on the same line.
const TIME_AMPM_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s?m\.?\b/i;
// 24-hour ("21:00", "21h00").
const TIME_24_EVENT_RE = /(?<!\d)(\d{1,2})\s*[:h]\s*(\d{2})\b/;
// Timezone abbreviations + parenthetical clocks scrubbed from event titles.
const TZ_RE = /\b(?:GMT|UTC|EST|EDT|CST|CDT|MST|MDT|PST|PDT|AEST|AEDT|BST|CET|CEST|ET|CT|MT|PT)\b/g;
const PAREN_CLOCK_RE = /\(\s*\d{1,2}[:h]\d{2}\s*[A-Za-z ]*\)/g;
// Venue split — STRONG separators only (en/em dash, @, |, ·, tại, ở). Plain
// " - " and "vs" are intentionally excluded so two-team titles stay intact.
const EVENT_VENUE_SPLIT = /^(.+?)\s*(?:\s[–—]\s|\s@\s|\s[|·]\s|\s(?:tại|ở)\s)\s*(.+?)$/i;

interface EventDate { y: number; m: number; d: number; explicitYear: boolean; match: string; }
interface EventTime { hh: number; mm: number; match: string; }

/** First calendar date found anywhere in a line (ISO, month-name, numeric). */
function extractEventDate(line: string): EventDate | null {
  let mm: RegExpMatchArray | null;
  if ((mm = line.match(DATE_ISO_RE))) {
    const m = +mm[2], d = +mm[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return { y: +mm[1], m, d, explicitYear: true, match: mm[0] };
  }
  if ((mm = line.match(DATE_VN_RE))) {
    const d = +mm[1], m = +mm[2];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return { y: mm[3] ? +mm[3] : 0, m, d, explicitYear: !!mm[3], match: mm[0] };
  }
  if ((mm = line.match(DATE_DMONTH_RE))) {
    const d = +mm[1], m = MONTHS[mm[2].toLowerCase()];
    if (m && d >= 1 && d <= 31)
      return { y: mm[3] ? +mm[3] : 0, m, d, explicitYear: !!mm[3], match: mm[0] };
  }
  if ((mm = line.match(DATE_MONTHD_RE))) {
    const m = MONTHS[mm[1].toLowerCase()], d = +mm[2];
    if (m && d >= 1 && d <= 31)
      return { y: mm[3] ? +mm[3] : 0, m, d, explicitYear: !!mm[3], match: mm[0] };
  }
  if ((mm = line.match(DATE_NUMDASH_RE))) {
    const d = +mm[1], m = +mm[2];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      return { y: +mm[3], m, d, explicitYear: true, match: mm[0] };
  }
  if ((mm = line.match(DATE_NUM_RE))) {
    const d = +mm[1], m = +mm[2];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const y = mm[3] ? (mm[3].length === 2 ? 2000 + +mm[3] : +mm[3]) : 0;
      return { y, m, d, explicitYear: !!mm[3], match: mm[0] };
    }
  }
  return null;
}

/**
 * First time-of-day found anywhere in a line. We take the LEFT-MOST time so a
 * range ("9:00 – 11:00pm") yields its start, and a kickoff before a
 * parenthetical conversion ("1pm CST (19:00 GMT)") yields the local time. On a
 * tie (same position, e.g. "8:30pm") the am/pm reading wins so the meridiem
 * applies.
 */
function extractEventTime(line: string): EventTime | null {
  const ap = line.match(TIME_AMPM_RE);
  const t24 = line.match(TIME_24_EVENT_RE);

  let apTime: EventTime | null = null;
  if (ap) {
    let hh = +ap[1];
    const min = ap[2] ? +ap[2] : 0;
    if (hh >= 1 && hh <= 12 && min < 60) {
      const pm = ap[3].toLowerCase() === "p";
      if (pm && hh !== 12) hh += 12;
      if (!pm && hh === 12) hh = 0;
      apTime = { hh, mm: min, match: ap[0] };
    }
  }
  let t24Time: EventTime | null = null;
  if (t24) {
    const hh = +t24[1], min = +t24[2];
    if (hh < 24 && min < 60) t24Time = { hh, mm: min, match: t24[0] };
  }

  if (apTime && t24Time) {
    // left-most wins; tie → am/pm (it carries the meridiem)
    return (ap!.index ?? 0) <= (t24!.index ?? 0) ? apTime : t24Time;
  }
  return apTime || t24Time;
}

/** Strip date/time/tz/markers from a line, then split a trailing venue. */
function eventTitleAndVenue(
  line: string,
  dateStr: string | null,
  timeStr: string
): { title: string; location?: string } {
  let s = line.replace(PAREN_CLOCK_RE, " ").replace(timeStr, " ");
  if (dateStr) s = s.replace(dateStr, " ");
  // scrub a surviving second clock (e.g. the GMT value), tz tokens, weekday
  s = s.replace(TIME_AMPM_RE, " ").replace(TIME_24_EVENT_RE, " ").replace(TZ_RE, " ");
  for (const [re] of DAY_PATTERNS) s = s.replace(re, " ");
  s = s
    .replace(/\b(?:ngày|lúc|vào|giờ|at|on|kickoff|ko)\b/gi, " ")
    .replace(/^[\s•·*\-–—\d.):,\]]+/, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  let title = s;
  let location: string | undefined;
  const split = title.match(EVENT_VENUE_SPLIT);
  if (split) {
    title = split[1].trim();
    location = split[2].trim() || undefined;
  }
  title = title.replace(/^[\s,\-–—:·@()]+|[\s,\-–—:·@()]+$/g, "").trim();
  return { title, location };
}

/**
 * Parse a list of one-off events (sports fixtures, calendar invites, single
 * meetings, deadline dumps). Handles two structures:
 *   (A) self-contained — "30/06 21:00 Vietnam vs Thailand · Mỹ Đình"
 *   (B) date-grouped   — a date header ("Saturday, June 13" / "ngày 13/6")
 *       carried forward to the time-only lines beneath it.
 */
export function parseEventList(text: string): ParsedClass[] {
  if (!text || !text.trim()) return [];
  const out: ParsedClass[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Carries a date header forward to following time-only lines.
  let ctx: { y: number; m: number; d: number } | null = null;

  const resolveYear = (dh: EventDate) => {
    let y = dh.explicitYear && dh.y ? dh.y : currentYear;
    if (!dh.explicitYear) {
      // No year given: if the date is >1 month in the past, it's next year's
      // (e.g. importing a fixture list in December for a June tournament).
      if (new Date(y, dh.m - 1, dh.d) < monthAgo) y += 1;
    }
    return y;
  };

  for (const line of lines) {
    const dateHit = extractEventDate(line);
    const timeHit = extractEventTime(line);

    // Date but no time → a header; remember it for the lines that follow.
    if (dateHit && !timeHit) {
      ctx = { y: resolveYear(dateHit), m: dateHit.m, d: dateHit.d };
      continue;
    }
    if (!timeHit) continue; // nothing actionable

    let y: number, m: number, d: number;
    if (dateHit) {
      y = resolveYear(dateHit);
      m = dateHit.m;
      d = dateHit.d;
    } else if (ctx) {
      ({ y, m, d } = ctx);
    } else {
      continue; // a time with no date anywhere — can't place it
    }

    const { title, location } = eventTitleAndVenue(line, dateHit?.match ?? null, timeHit.match);
    if (title.length < 2) continue;

    const date = new Date(y, m - 1, d);
    out.push({
      id: makeId(),
      subject: title,
      dayOfWeek: date.getDay(),
      startTime: `${pad2(timeHit.hh)}:${pad2(timeHit.mm)}`,
      startDate: `${y}-${pad2(m)}-${pad2(d)}`,
      location,
      oneOff: true,
      raw: line,
    });
  }
  return out;
}

/**
 * Heuristic: looks like a list of one-off events if it carries at least one
 * concrete calendar date AND at least one time, with most lines being date-
 * or time-bearing. The concrete date is the key signal: a weekly timetable
 * has weekday headers + times but NO specific calendar dates, so it returns
 * false here and falls through to the timetable parser.
 */
function looksLikeEventList(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 1) return false;
  let dated = 0;
  let timed = 0;
  let useful = 0;
  for (const line of lines) {
    const hasDate = extractEventDate(line) !== null;
    const hasTime = extractEventTime(line) !== null;
    if (hasDate) dated++;
    if (hasTime) timed++;
    if (hasDate || hasTime) useful++;
  }
  return dated >= 1 && timed >= 1 && useful / lines.length >= 0.5;
}

/**
 * Detect what kind of input the user pasted; helps route to right parser.
 */
export function detectKind(
  input: string
): "ics" | "html" | "event-list" | "text" {
  const trimmed = input.trim();
  if (trimmed.startsWith("BEGIN:VCALENDAR") || /BEGIN:VEVENT/.test(trimmed))
    return "ics";
  if (/<table[\s\S]*<\/table>/i.test(trimmed) || /<tr[\s>]/i.test(trimmed))
    return "html";
  if (looksLikeEventList(trimmed)) return "event-list";
  return "text";
}

export function parseAny(input: string): ParsedClass[] {
  const kind = detectKind(input);
  if (kind === "ics") return parseICS(input);
  if (kind === "html") return parseTimetableHTML(input);
  if (kind === "event-list") return parseEventList(input);
  return parseTimetableText(input);
}
