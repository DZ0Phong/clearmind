import { useSearchParams } from "react-router-dom";
import { CalendarView } from "@/components/calendar/calendar-view";

export function CalendarPage() {
  const [params] = useSearchParams();
  const initialDate = params.get("date") || undefined;

  // Responsive height strategy:
  //   - Desktop (md+): page locks to viewport via `md:h-full md:min-h-0`,
  //     card body fills via `md:flex-1`, FullCalendar inside engages its
  //     own internal scroll. Sticky chrome (view tabs + filter) stays
  //     pinned at the top of the card.
  //   - Mobile: page flows naturally via `flex flex-col gap-3 pb-6` (no
  //     h-full lock), card body sizes to its content, main-layout's
  //     `cm-mobile-content-pad` reserves the bottom-tab clearance. FC
  //     switches to `height="auto"` (see calendar-view.tsx) so it sizes
  //     to its content + the main element handles the page scroll.
  //
  // Earlier passes used h-full everywhere (broke mobile cut-off) OR no
  // h-full at all (collapsed FC height on desktop). This responsive
  // split picks the right strategy per viewport.
  // The calendar's own unified toolbar now carries the period title, so the
  // standalone "Lịch" page heading was pure duplication eating a row of
  // vertical space above the grid. Dropped — the card fills the viewport.
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-card rounded-2xl border shadow-sm flex flex-col overflow-hidden flex-1 min-h-0">
        <CalendarView initialDate={initialDate} />
      </div>
    </div>
  );
}
