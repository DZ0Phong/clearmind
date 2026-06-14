import { useSearchParams } from "react-router-dom";
import { CalendarView } from "@/components/calendar/calendar-view";
import { useT } from "@/lib/i18n";

export function CalendarPage() {
  const [params] = useSearchParams();
  const initialDate = params.get("date") || undefined;
  const t = useT();

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
  return (
    <div className="flex flex-col gap-3 pb-6 md:h-full md:pb-0 md:min-h-0">
      <div className="shrink-0">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{t("nav.calendar")}</h2>
      </div>
      <div className="bg-card rounded-2xl border shadow-sm flex flex-col overflow-hidden md:flex-1 md:min-h-0">
        <CalendarView initialDate={initialDate} />
      </div>
    </div>
  );
}
