import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTaskCommands } from "@/components/task-commands";
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Timer,
  TrendingUp,
  Settings,
  Command,
  Sparkles,
  Mic,
  Bell,
  Repeat,
  Tag,
  Download,
  Upload,
  MousePointerClick,
  Hourglass,
  ArrowRight,
  Keyboard,
  Lightbulb,
  MapPin,
  Flame,
  GraduationCap,
  CalendarPlus,
} from "lucide-react";
import { Logo } from "@/components/logo";

type Feature = {
  icon: typeof LayoutDashboard;
  title: string;
  desc: string;
  to?: string;
  accent: string;
};

const FEATURES: Feature[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    desc: "Trang chính — gom Today's Focus, Due Soon, lịch tuần và Quick Capture vào một chỗ.",
    to: "/dashboard",
    accent: "text-primary bg-primary/10",
  },
  {
    icon: Calendar,
    title: "Calendar",
    desc: "Xem deadline theo tuần / tháng. Kéo task từ Dashboard thả vào calendar để xếp lịch.",
    to: "/calendar",
    accent: "text-blue-500 bg-blue-500/10",
  },
  {
    icon: CheckSquare,
    title: "Tasks",
    desc: "Toàn bộ task, gom nhóm theo Overdue / Today / This week / Later. Tìm theo title, tag, mô tả.",
    to: "/tasks",
    accent: "text-emerald-500 bg-emerald-500/10",
  },
  {
    icon: Timer,
    title: "Focus (Pomodoro)",
    desc: "Chọn 1 task, chạy 25 phút focus + 5 phút nghỉ. Mỗi phiên cộng phút vào task.",
    to: "/focus",
    accent: "text-orange-500 bg-orange-500/10",
  },
  {
    icon: TrendingUp,
    title: "Weekly Review",
    desc: "Bạn đã done bao nhiêu task tuần này, streak mấy ngày, focus mấy giờ, còn bao nhiêu việc quá hạn.",
    to: "/review",
    accent: "text-violet-500 bg-violet-500/10",
  },
  {
    icon: CalendarPlus,
    title: "Import lịch học",
    desc: "Paste timetable từ web trường, dùng bookmarklet 1-click, hoặc upload file .ics. Tự thành lớp lặp tuần.",
    to: "/import",
    accent: "text-pink-500 bg-pink-500/10",
  },
  {
    icon: Settings,
    title: "Settings",
    desc: "Theme, notifications, phím tắt, export sang Google Calendar (.ics), backup JSON.",
    to: "/settings",
    accent: "text-muted-foreground bg-muted",
  },
];

const QUICK_STEPS = [
  {
    icon: Command,
    title: "Mở Quick Capture",
    desc: "Bấm ⌘K (hoặc Ctrl+K) ở bất kỳ trang nào để bật form tạo task nhanh.",
  },
  {
    icon: Tag,
    title: "Điền title — phần còn lại tự đoán",
    desc: 'Gõ "Thi Toán cuối kỳ thứ 5 lúc 14h" → Clearmind tự nhận loại "academic", priority "high", và đoán deadline.',
  },
  {
    icon: MapPin,
    title: "Thêm vị trí / phòng",
    desc: "Nhập phòng học, phòng thi (VD: A1.404, lab E3). Sẽ hiển thị ở Dashboard và Calendar.",
  },
  {
    icon: MousePointerClick,
    title: "Kéo task lên Calendar",
    desc: "Ở Dashboard, kéo task từ panel phải thả vào lịch để đặt giờ. Kéo trong lịch để dời.",
  },
  {
    icon: Hourglass,
    title: "Chạy phiên Focus",
    desc: "Vào /focus, chọn task, bấm Bắt đầu. Mỗi 25 phút sẽ được cộng vào tổng focus của task.",
  },
  {
    icon: TrendingUp,
    title: "Cuối tuần ghé Review",
    desc: "Xem mình done bao nhiêu, streak mấy ngày, còn việc nào quá hạn để dọn.",
  },
];

const POWER_TIPS = [
  {
    icon: GraduationCap,
    title: "Lịch học hàng tuần",
    desc: 'Tạo task "Học Giải tích 2", chọn Lặp lại = "Hàng tuần" + giờ + phòng. Mỗi lần xong sẽ tự sinh phiên tuần kế.',
  },
  {
    icon: Flame,
    title: "Đánh dấu việc gấp",
    desc: 'Đặt Mức ưu tiên = "Cao" → task có viền đỏ + icon lửa khắp Dashboard / Calendar, không thể bỏ sót.',
  },
  {
    icon: Mic,
    title: "Voice capture",
    desc: "Trong dialog tạo task, bấm icon mic để nhập tiêu đề bằng giọng nói tiếng Việt.",
  },
  {
    icon: Bell,
    title: "Nhắc trước deadline",
    desc: "Bật ở Settings → Notifications. Mỗi task chọn nhắc 5p / 15p / 1h / 1d trước.",
  },
  {
    icon: Repeat,
    title: "Recurrence cho việc lặp",
    desc: "Daily / Ngày làm việc / Hàng tuần / Hàng tháng. Tự spawn phiên mới khi đánh done.",
  },
  {
    icon: Download,
    title: "Backup bằng Export JSON",
    desc: "Settings → Export. Dữ liệu lưu LocalStorage trình duyệt, nên export định kỳ.",
  },
  {
    icon: Upload,
    title: "Import / merge",
    desc: "Merge từ file JSON cũ. Task trùng id bị bỏ qua, không ghi đè cái hiện tại.",
  },
];

const SHORTCUTS: [string, string][] = [
  ["⌘ K / Ctrl K", "Mở Command Palette / Quick Capture"],
  ["↑ ↓", "Di chuyển trong palette"],
  ["Enter", "Chọn / lưu"],
  ["Esc", "Đóng dialog / palette"],
];

export function GuidePage() {
  const { openCreate } = useTaskCommands();

  return (
    <div className="h-full flex flex-col gap-8">
      {/* Hero */}
      <div className="shrink-0 relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-background to-accent/20 p-8 md:p-12">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-8 opacity-30 pointer-events-none hidden md:block">
          <Logo className="h-40 w-40" />
        </div>
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Sparkles className="h-3.5 w-3.5" /> Hướng dẫn nhanh
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
            <Logo className="h-10 w-10 md:hidden" />
            Chào mừng đến với <span className="text-primary">Clearmind</span>
          </h1>
          <p className="text-muted-foreground mt-3 text-base md:text-lg leading-relaxed">
            Bộ não phụ của bạn — gom task, deadline, lịch học, lịch thi, focus session
            và review tuần vào một nơi. Ghé trang này bất cứ lúc nào nếu quên cái gì.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => openCreate()} className="gap-2">
              <Command className="h-4 w-4" /> Tạo task đầu tiên
            </Button>
            <Button variant="outline" asChild>
              <Link to="/dashboard" className="gap-2">
                Mở Dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features grid */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Các trang chính</h2>
            <p className="text-sm text-muted-foreground mt-1">
              6 khu vực — bấm vào card để mở thẳng.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc, to, accent }) => {
            const inner = (
              <Card className="h-full hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 cursor-pointer bg-card">
                <CardHeader className="pb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base mt-3">{title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {desc}
                  </CardDescription>
                </CardHeader>
                {to && (
                  <CardContent className="pt-0">
                    <span className="text-xs font-medium text-primary inline-flex items-center gap-1">
                      Mở <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardContent>
                )}
              </Card>
            );
            return to ? (
              <Link key={title} to={to} className="block">
                {inner}
              </Link>
            ) : (
              <div key={title}>{inner}</div>
            );
          })}
        </div>
      </section>

      {/* Quick start steps */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">Bắt đầu trong 5 bước</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Đi từ task đầu tiên đến review tuần — tổng ~30 giây.
          </p>
        </div>
        <Card className="bg-card">
          <CardContent className="pt-6">
            <ol className="space-y-4">
              {QUICK_STEPS.map(({ icon: Icon, title, desc }, i) => (
                <li
                  key={title}
                  className="flex gap-4 p-3 rounded-xl border bg-background/50"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center">
                      {i + 1}
                    </div>
                    {i < QUICK_STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <h3 className="font-medium">{title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Power tips */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-orange-500" />
          <h2 className="text-xl font-semibold tracking-tight">Mẹo nâng cao</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {POWER_TIPS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="p-4 rounded-xl border bg-card hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <h3 className="font-medium text-sm">{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shortcuts */}
      <section className="pb-4">
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-tight">Phím tắt</h2>
        </div>
        <Card className="bg-card">
          <CardContent className="pt-6">
            <div className="grid sm:grid-cols-2 gap-3">
              {SHORTCUTS.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                >
                  <span className="text-sm">{v}</span>
                  <kbd className="text-xs border rounded px-1.5 py-0.5 font-mono bg-muted">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
