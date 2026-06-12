import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemePicker } from "@/components/theme-picker";
import { LanguagePicker } from "@/components/language-picker";
import { AccentPicker } from "@/components/accent-picker";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Settings,
  Download,
  Upload,
  Bell,
  BellOff,
  Keyboard,
  Trash2,
  CalendarRange,
  HardDrive,
  FolderOpen,
  Power,
  Save,
  RotateCcw,
  Bug,
  Copy,
} from "lucide-react";
import { readErrorLog, clearErrorLog, type ErrorEntry } from "@/lib/error-log";
import { useTasks } from "@/hooks/use-tasks";
import { tagStats } from "@/lib/utils";
import { Hash } from "lucide-react";
import { useMemo } from "react";
import { useToast } from "@/components/toast";
import { downloadICS } from "@/lib/ics";
import {
  isCliMode,
  cliHealth,
  cliBackup,
  cliOpenDataDir,
  cliSetAutostart,
  cliHistoryInfo,
  cliRecover,
  cliScheduledNotifications,
  cliTestNotification,
  type CliInfo,
  type HistorySlot,
  type ScheduledNotification,
} from "@/lib/cli-bridge";

export function SettingsPage() {
  const {
    tasks,
    exportJson,
    importJson,
    clearAll,
    notificationsEnabled,
    requestNotifications,
  } = useTasks();
  const { toast } = useToast();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `clearmind-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({ title: "Đã xuất file", description: `${tasks.length} task` });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importJson(text);
    e.target.value = "";
    if (result.ok) {
      toast({
        title: "Đã nhập file",
        description: `+${result.added} task mới`,
        variant: "success",
      });
    } else {
      toast({
        title: "Nhập file thất bại",
        description: result.error || "Không đọc được file.",
        variant: "destructive",
      });
    }
  };

  const handleNotify = async () => {
    if (notificationsEnabled) {
      toast({
        title: "Đã bật",
        description: "Notifications đang hoạt động trên trình duyệt này.",
      });
      return;
    }
    const ok = await requestNotifications();
    if (ok) {
      toast({
        title: "Đã cấp quyền",
        description: "Clearmind có thể nhắc bạn trước deadline.",
        variant: "success",
      });
    } else {
      toast({
        title: "Bị từ chối",
        description:
          "Vào address bar → site settings → Notifications để bật lại.",
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    if (!confirm("Xoá toàn bộ task? Không thể hoàn tác.")) return;
    clearAll();
    toast({ title: "Đã xoá toàn bộ", variant: "destructive" });
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold tracking-tight">{t("settings.title")}</h2>
        <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="flex-1 overflow-y-auto max-w-3xl">
        <div className="grid gap-6">
          {isCliMode() && <CliCard />}

          <Card className="border-primary/10 shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                {t("settings.appearance")}
              </CardTitle>
              <CardDescription>{t("settings.appearance.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl border bg-background/50">
                <div className="min-w-0">
                  <h3 className="font-medium">{t("settings.theme.label")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.theme.hint")}
                  </p>
                </div>
                <ThemePicker />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl border bg-background/50">
                <div className="min-w-0">
                  <h3 className="font-medium">{t("settings.accent.label")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.accent.hint")}
                  </p>
                </div>
                <AccentPicker />
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap p-4 rounded-xl border bg-background/50">
                <div className="min-w-0">
                  <h3 className="font-medium">{t("settings.language.label")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.language.hint")}
                  </p>
                </div>
                <LanguagePicker />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(notificationsEnabled || isCliMode()) ? (
                  <Bell className="h-5 w-5 text-primary" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                {t("settings.notifTitle")}
              </CardTitle>
              <CardDescription>
                {isCliMode() ? t("settings.notifDescCli") : t("settings.notifDescWeb")}
              </CardDescription>
            </CardHeader>
            {!isCliMode() && (
              <CardContent>
                <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
                  <div>
                    <h3 className="font-medium">
                      {notificationsEnabled
                        ? t("settings.notifOn")
                        : t("settings.notifOff")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.notifHint")}
                    </p>
                  </div>
                  <Button
                    variant={notificationsEnabled ? "outline" : "default"}
                    onClick={handleNotify}
                  >
                    {notificationsEnabled
                      ? t("settings.notifBtnOk")
                      : t("settings.notifBtnEnable")}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="border-primary/10 shadow-sm bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-primary" />{" "}
                {t("settings.shortcutsTitle")}
              </CardTitle>
              <CardDescription>{t("settings.shortcutsDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  ["Ctrl/⌘ + K", "Command palette"],
                  ["↑ / ↓", "Di chuyển trong palette"],
                  ["Enter", "Chọn"],
                  ["Esc", "Đóng dialog / palette"],
                ].map(([k, v]) => (
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

          <Card className="border-primary/10 shadow-sm bg-card">
            <CardHeader>
              <CardTitle>Data & Storage</CardTitle>
              <CardDescription>
                Tasks lưu trong LocalStorage của trình duyệt. Backup hoặc chuyển máy bằng export.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
                <div>
                  <h3 className="font-medium">Export tasks</h3>
                  <p className="text-sm text-muted-foreground">
                    Tải về file JSON ({tasks.length} task).
                  </p>
                </div>
                <Button variant="outline" onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" /> Export
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
                <div>
                  <h3 className="font-medium">Import tasks</h3>
                  <p className="text-sm text-muted-foreground">
                    Merge từ file JSON cũ. Task trùng id sẽ bị bỏ qua.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" /> Import
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
                <div>
                  <h3 className="font-medium">Export sang Google / Apple Calendar</h3>
                  <p className="text-sm text-muted-foreground">
                    Tải file .ics chuẩn để import vào Google Calendar, Apple
                    Calendar, Outlook…
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    downloadICS(tasks);
                    toast({
                      title: "Đã xuất file .ics",
                      description: `${tasks.filter((t) => t.deadline).length} sự kiện.`,
                    });
                  }}
                  className="gap-2"
                  disabled={!tasks.some((t) => t.deadline)}
                >
                  <CalendarRange className="h-4 w-4" /> Export .ics
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl border bg-destructive/10 border-destructive/20 text-destructive">
                <div>
                  <h3 className="font-medium">Clear All Data</h3>
                  <p className="text-sm opacity-90">
                    Xoá toàn bộ task trên trình duyệt này.
                  </p>
                </div>
                <Button variant="destructive" onClick={handleClear} className="gap-2">
                  <Trash2 className="h-4 w-4" /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          <TagsCard />
          <ErrorLogCard />
        </div>
      </div>
    </div>
  );
}

function TagsCard() {
  const { tasks, updateTask } = useTasks();
  const { toast } = useToast();
  const t = useT();
  const stats = useMemo(() => tagStats(tasks), [tasks]);

  const renameTag = (oldName: string) => {
    const raw = prompt(t("settings.tagRenamePrompt", { old: oldName }), oldName);
    const next = raw?.trim().toLowerCase();
    if (!next || next === oldName) return;
    for (const task of tasks) {
      if (!task.tags?.includes(oldName)) continue;
      const merged = Array.from(
        new Set(task.tags.map((x) => (x === oldName ? next : x)))
      );
      updateTask(task.id, { tags: merged });
    }
    toast({ title: t("settings.tagRenamedToast", { old: oldName, new: next }) });
  };

  const mergeTag = (oldName: string) => {
    const raw = prompt(t("settings.tagMergePrompt", { old: oldName }));
    const target = raw?.trim().toLowerCase();
    if (!target || target === oldName) return;
    for (const task of tasks) {
      if (!task.tags?.includes(oldName)) continue;
      const merged = Array.from(
        new Set(task.tags.map((x) => (x === oldName ? target : x)))
      );
      updateTask(task.id, { tags: merged });
    }
    toast({ title: t("settings.tagMergedToast", { old: oldName, new: target }) });
  };

  const deleteTag = (name: string) => {
    const count = stats.find((s) => s.name === name)?.count ?? 0;
    if (!confirm(t("settings.tagDeleteConfirm", { name, n: count }))) return;
    for (const task of tasks) {
      if (!task.tags?.includes(name)) continue;
      const remain = task.tags.filter((x) => x !== name);
      updateTask(task.id, { tags: remain.length ? remain : undefined });
    }
    toast({ title: t("settings.tagDeletedToast", { name }) });
  };

  return (
    <Card className="border-primary/10 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-primary" />
          {t("settings.tagsTitle")}
        </CardTitle>
        <CardDescription>{t("settings.tagsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("settings.tagsEmpty")}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {stats.map((s) => (
              <div
                key={s.name}
                className="flex items-center gap-2 p-2.5 rounded-lg border bg-background/50 hover:bg-accent/30 transition-colors group"
              >
                <span className="text-sm font-semibold tabular-nums text-muted-foreground w-10 text-right">
                  {s.count}
                </span>
                <span className="font-medium flex-1 truncate text-sm">
                  #{s.name}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => renameTag(s.name)}
                    className="h-7 text-xs"
                  >
                    {t("settings.tagRename")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mergeTag(s.name)}
                    className="h-7 text-xs"
                  >
                    {t("settings.tagMerge")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteTag(s.name)}
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    {t("settings.tagDelete")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ErrorLogCard() {
  const { toast } = useToast();
  const t = useT();
  const [entries, setEntries] = useState<ErrorEntry[]>(() => readErrorLog());

  const refresh = () => setEntries(readErrorLog());
  const clear = () => {
    clearErrorLog();
    setEntries([]);
    toast({ title: t("settings.errLogCleared") });
  };
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
      toast({ title: t("settings.copySuccess") });
    } catch {
      toast({ title: t("settings.copyFail"), variant: "destructive" });
    }
  };

  return (
    <Card className="border-primary/10 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5 text-primary" />
          {t("settings.errLogTitle")}
        </CardTitle>
        <CardDescription>
          {entries.length === 0
            ? t("settings.errLogEmpty")
            : t("settings.errLogCount", { n: entries.length })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" /> {t("settings.refresh")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            disabled={entries.length === 0}
            className="gap-2"
          >
            <Copy className="h-3.5 w-3.5" /> {t("settings.copyJson")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={entries.length === 0}
            className="gap-2 text-destructive hover:text-destructive ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("settings.clear")}
          </Button>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("settings.errLogClean")}
          </p>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {entries.map((e, i) => (
              <details
                key={i}
                className="rounded-lg border bg-background/50 p-3 group"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold">
                      <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                        {e.source}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {new Date(e.at).toLocaleString("vi-VN")}
                      </span>
                      <span className="text-muted-foreground truncate">
                        · {e.url}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1 break-words [overflow-wrap:anywhere]">
                      {e.message}
                    </p>
                  </div>
                </summary>
                {(e.stack || e.componentStack) && (
                  <pre className="mt-2 p-2 rounded bg-muted text-[10px] leading-relaxed overflow-auto max-h-60 whitespace-pre-wrap">
                    {e.stack}
                    {e.componentStack
                      ? "\n\nComponent stack:" + e.componentStack
                      : ""}
                  </pre>
                )}
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Settings card visible only when the SPA is served by the Clearmind CLI
 * (Node host). Lets the user toggle Windows auto-start, peek at where
 * data lives on disk, and trigger a manual backup snapshot.
 */
function CliCard() {
  const { toast } = useToast();
  const [info, setInfo] = useState<(CliInfo & { dataFile: string; autostart: boolean }) | null>(
    null
  );
  const [history, setHistory] = useState<HistorySlot[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [h, hist, s] = await Promise.all([
        cliHealth(),
        cliHistoryInfo(),
        cliScheduledNotifications(),
      ]);
      setInfo(h);
      setHistory(hist);
      setScheduled(s);
    } catch (e) {
      console.warn("CLI probe failed:", e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [h, hist, s] = await Promise.all([
          cliHealth(),
          cliHistoryInfo(),
          cliScheduledNotifications(),
        ]);
        if (!cancelled) { setInfo(h); setHistory(hist); setScheduled(s); }
      } catch (e) {
        console.warn("CLI probe failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTestNotification = async () => {
    try {
      await cliTestNotification();
      toast({
        title: "Đã gửi test toast",
        description:
          "Nếu không thấy popup → check Windows Focus Assist (Settings → Notifications) hoặc click Action Center (Win+N).",
      });
    } catch (e) {
      toast({
        title: "Test thất bại",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleRecover = async (version: number, count: number) => {
    if (!confirm(
      `Khôi phục từ previous-${version} (${count} task)? Data hiện tại sẽ swap sang slot này — bấm lần nữa để undo. Sau đó F5 để tải lại.`
    )) return;
    setBusy(true);
    try {
      const r = await cliRecover(version);
      if (r.ok) {
        toast({
          title: `Đã khôi phục previous-${version}`,
          description: `${r.count} task. F5 để tải lại.`,
          variant: "success",
        });
        await refresh();
      } else {
        toast({
          title: "Khôi phục thất bại",
          description: r.error || "Không có bản previous.",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAutostart = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const next = await cliSetAutostart(!info.autostart);
      setInfo({ ...info, autostart: next });
      toast({
        title: next ? "Đã bật auto-start" : "Đã tắt auto-start",
        description: next
          ? "Clearmind sẽ tự khởi động ngầm cùng Windows."
          : "Sẽ không khởi động cùng máy nữa.",
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Không đổi được auto-start",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const r = await cliBackup();
      if (r.ok) {
        toast({
          title: "Đã tạo backup",
          description: r.path,
          variant: "success",
        });
      } else {
        toast({
          title: "Backup thất bại",
          description: r.error || "Chưa rõ lý do.",
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-emerald-500/30 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Power className="h-5 w-5 text-emerald-500" />
          Chạy ngầm (CLI mode)
        </CardTitle>
        <CardDescription>
          Clearmind đang chạy như một dịch vụ ngầm trên máy. Data lưu vào ổ cứng — không phụ thuộc trình duyệt nữa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {info ? (
          <div className="grid sm:grid-cols-2 gap-2 text-xs">
            <Row label="Port" value={`localhost:${info.port}`} />
            <Row label="Version" value={info.version} />
            <Row label="Platform" value={info.platform} />
            <Row label="Data file" value={info.dataFile} mono />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Đang đọc trạng thái server…</p>
        )}

        <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              <Power className="h-4 w-4" />
              Khởi động cùng Windows
            </h3>
            <p className="text-sm text-muted-foreground">
              Tạo shortcut ẩn ở Startup folder. Boot máy là Clearmind tự sống ngầm + tray icon.
            </p>
          </div>
          <Button
            variant={info?.autostart ? "outline" : "default"}
            onClick={toggleAutostart}
            disabled={busy || !info}
          >
            {info?.autostart ? "Đang bật" : "Bật"}
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Mở thư mục dữ liệu
            </h3>
            <p className="text-sm text-muted-foreground">
              File JSON + backups timestamped (giữ 14 bản gần nhất).
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => cliOpenDataDir()}
            disabled={!info}
            className="gap-2"
          >
            <FolderOpen className="h-4 w-4" /> Mở
          </Button>
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border bg-background/50">
          <div>
            <h3 className="font-medium flex items-center gap-2">
              <Save className="h-4 w-4" />
              Tạo backup ngay
            </h3>
            <p className="text-sm text-muted-foreground">
              Snapshot vào backups/YYYY-MM-DD-HH-mm-ss.json.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleBackup}
            disabled={busy || !info}
            className="gap-2"
          >
            <HardDrive className="h-4 w-4" /> Backup
          </Button>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            Khôi phục bản trước
          </h3>
          <p className="text-sm text-muted-foreground">
            3 lớp lịch sử rolling. Bấm để swap data hiện tại với slot tương ứng; bấm lần nữa cùng slot để undo.
          </p>
          <div className="space-y-1.5">
            {history.length === 0 || history.every((s) => !s.exists) ? (
              <p className="text-xs text-muted-foreground italic">
                Chưa có bản previous (sau lần PUT đầu tiên sẽ có).
              </p>
            ) : (
              history.map((slot) => (
                <div
                  key={slot.version}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-background/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">
                      Previous-{slot.version}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({slot.version === 1 ? "mới nhất" : slot.version === 3 ? "cũ nhất" : "trung gian"})
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {slot.exists
                        ? `${slot.count ?? 0} task · ${slot.mtime ? new Date(slot.mtime).toLocaleString("vi-VN") : "—"}`
                        : "trống"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRecover(slot.version, slot.count || 0)}
                    disabled={busy || !slot.exists}
                    className="gap-1.5 shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Khôi phục
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-background/50 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Native notifications
              </h3>
              <p className="text-sm text-muted-foreground">
                {scheduled.length > 0
                  ? `${scheduled.length} toast đang chờ trong 25h tới.`
                  : "Chưa có reminder nào trong 25h tới."}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleTestNotification}
              disabled={busy || !info}
              className="gap-2"
            >
              <Bell className="h-4 w-4" /> Test
            </Button>
          </div>
          {scheduled.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto border-t pt-2">
              {scheduled.slice(0, 8).map((s) => (
                <div
                  key={s.taskId + s.fireAt}
                  className="flex items-center justify-between text-xs gap-2"
                >
                  <span className="truncate flex-1">{s.title}</span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {new Date(s.fireAt).toLocaleString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
              {scheduled.length > 8 && (
                <p className="text-[10px] text-muted-foreground">+{scheduled.length - 8} nữa</p>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Bấm <strong>Test</strong> để bắn 1 toast ngay. Nếu không bay lên — check{" "}
            <strong>Win+A</strong> (Action Center) hoặc{" "}
            <strong>Settings → System → Notifications</strong> bật cho "Clearmind", và tắt{" "}
            <strong>Focus Assist</strong>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col rounded-lg border bg-background/50 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
      <span className={mono ? "font-mono text-[11px] break-all" : "text-sm"}>
        {value}
      </span>
    </div>
  );
}
