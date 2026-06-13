import { useSearchParams } from "react-router-dom";
import { CalendarView } from "@/components/calendar-view";
import { useT } from "@/lib/i18n";

export function CalendarPage() {
  const [params] = useSearchParams();
  const initialDate = params.get("date") || undefined;
  const t = useT();

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="shrink-0">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{t("nav.calendar")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t("calendar.subtitle")}</p>
      </div>
      <div className="flex-1 min-h-0 bg-card rounded-2xl border shadow-sm flex flex-col overflow-hidden">
        <CalendarView initialDate={initialDate} />
      </div>
    </div>
  );
}
