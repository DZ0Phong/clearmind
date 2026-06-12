import { useSearchParams } from "react-router-dom";
import { CalendarView } from "@/components/calendar-view";

export function CalendarPage() {
  const [params] = useSearchParams();
  const initialDate = params.get("date") || undefined;

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">Calendar</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tháng · Tuần · Ngày · <b>Agenda</b> — kéo thả để dời, click ô trống để thêm.
        </p>
      </div>
      <div className="flex-1 min-h-0 bg-card rounded-2xl border shadow-sm p-3 md:p-4 flex flex-col">
        <CalendarView initialDate={initialDate} />
      </div>
    </div>
  );
}
