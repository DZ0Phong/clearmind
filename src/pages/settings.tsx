import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemePicker } from "@/components/settings/theme-picker";
import { LanguagePicker } from "@/components/settings/language-picker";
import { AccentPicker } from "@/components/settings/accent-picker";
import { TimezonePicker } from "@/components/settings/timezone-picker";
import { useT, useLocaleTag } from "@/lib/i18n";
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
  Hash,
  Database,
  SlidersHorizontal,
} from "lucide-react";
import { readErrorLog, clearErrorLog, type ErrorEntry } from "@/lib/error-log";
import { useTasks } from "@/hooks/use-tasks";
import { tagStats, cn } from "@/lib/utils";
import { useToast } from "@/components/feedback/toast";
import { useDialog } from "@/components/feedback/confirm-dialog";
import { Switch } from "@/components/ui/switch";
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

type Tab = "appearance" | "notifications" | "data" | "system" | "advanced";

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
  const { confirm } = useDialog();
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  // Read `?tab=` from the URL on mount so deep-links (e.g. the CLI status
  // badge in TopBar → /settings?tab=system) land on the right tab instead
  // of the default Appearance tab. Falls back to "appearance" for any
  // missing/unknown value.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: Tab = (() => {
    const q = searchParams.get("tab");
    return q === "notifications" || q === "data" || q === "system" || q === "advanced"
      ? q
      : "appearance";
  })();
  const [tab, setTab] = useState<Tab>(initialTab);
  const cli = isCliMode();

  // Keep the URL in sync when the user clicks a tab so the chosen tab is
  // shareable / refreshable. Replace, not push, to avoid polluting browser
  // history with every tab click.
  useEffect(() => {
    const current = searchParams.get("tab");
    if (current === tab) return;
    if (tab === "appearance" && !current) return;
    const next = new URLSearchParams(searchParams);
    if (tab === "appearance") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }, [tab, searchParams, setSearchParams]);

  // -- Toast-emitting handlers ------------------------------------------
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
    toast({
      title: t("settings.export.toastTitle"),
      description: t("settings.export.toastDesc", { n: tasks.length }),
    });
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = importJson(text);
    e.target.value = "";
    if (result.ok) {
      toast({
        title: t("settings.import.toastOkTitle"),
        description: t("settings.import.toastOkDesc", { n: result.added }),
        variant: "success",
      });
    } else {
      toast({
        title: t("settings.import.toastFailTitle"),
        description: result.error || t("settings.import.toastFailFallback"),
        variant: "destructive",
      });
    }
  };

  const handleNotify = async () => {
    if (notificationsEnabled) {
      toast({
        title: t("settings.notif.onAlreadyTitle"),
        description: t("settings.notif.onAlreadyDesc"),
      });
      return;
    }
    const ok = await requestNotifications();
    if (ok) {
      toast({
        title: t("settings.notif.grantedTitle"),
        description: t("settings.notif.grantedDesc"),
        variant: "success",
      });
    } else {
      toast({
        title: t("settings.notif.deniedTitle"),
        description: t("settings.notif.deniedDesc"),
        variant: "destructive",
      });
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: t("settings.clearAll.confirmTitle"),
      description: t("settings.clearAll.confirmBody"),
      confirmLabel: t("settings.clearAll.confirmCta"),
      variant: "destructive",
    });
    if (!ok) return;
    clearAll();
    toast({ title: t("settings.clearAll.toast"), variant: "destructive" });
  };

  // -- Tabs -------------------------------------------------------------
  const tabs: Array<{ id: Tab; label: string; icon: typeof Settings; show: boolean }> = [
    { id: "appearance", label: t("settings.tab.appearance"), icon: Settings, show: true },
    { id: "notifications", label: t("settings.tab.notifications"), icon: Bell, show: true },
    { id: "data", label: t("settings.tab.data"), icon: Database, show: true },
    { id: "system", label: t("settings.tab.system"), icon: SlidersHorizontal, show: true },
    { id: "advanced", label: t("settings.tab.advanced"), icon: Hash, show: true },
  ];

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div>
        <h2 className="text-xl sm:text-3xl font-bold tracking-tight">{t("settings.title")}</h2>
        <p className="hidden sm:block text-muted-foreground mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* Tab strip — pill nav, scrolls on narrow screens */}
      <div
        className="cm-seg-track shrink-0 w-fit max-w-full overflow-x-auto"
        role="tablist"
        aria-label={t("settings.title")}
      >
        {tabs.filter((x) => x.show).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active}
              onClick={() => setTab(id)}
              className="cm-seg-item cm-press"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {/*
        Full-width tab body. Previous layout capped at `max-w-3xl` and
        owned its own scroll container — both decisions wasted ~40% of
        the viewport at md+ and forced a nested scrollbar inside the
        already-scrolling page. Now: full width + document-level scroll
        + 2-column grid at md+ that lets short cards (Appearance,
        Shortcuts, CliStatus) sit side-by-side while long cards (Tags,
        ErrorLog, native notif, backup/recover) span the full row via
        `md:col-span-2`.
       */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 auto-rows-min items-start">
        {tab === "appearance" && <AppearanceTab />}

        {tab === "notifications" && (
          <NotificationsTab
            cli={cli}
            notificationsEnabled={notificationsEnabled}
            onEnable={handleNotify}
          />
        )}

        {tab === "data" && (
          <DataTab
            tasks={tasks}
            cli={cli}
            fileRef={fileRef}
            onExport={handleExport}
            onImportFile={handleImportFile}
            onClear={handleClear}
          />
        )}

        {tab === "system" && <SystemTab cli={cli} />}

        {tab === "advanced" && <AdvancedTab />}
      </div>
    </div>
  );
}

/* ============================================================
   Tab content components
   ============================================================ */

/**
 * Appearance — Linear/Things-style flat preferences list. Each setting
 * is a description-control row inside a single card so related controls
 * stay visually unified, repeating "Settings" icons aren't shown 4×,
 * and the wider picker (TimezonePicker) doesn't have to cram into a
 * 558px tile.
 *
 * Row layout: title + hint take ~40% of the row on the left, the
 * control sits on the right with breathing room. At narrower widths
 * the row stacks vertically so the picker keeps its full width.
 */
function AppearanceTab() {
  const t = useT();
  return (
    <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          {t("settings.appearance")}
        </CardTitle>
        <CardDescription>{t("settings.appearance.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <PrefRow
          title={t("settings.theme.label")}
          hint={t("settings.theme.hint")}
        >
          <ThemePicker />
        </PrefRow>
        <PrefRow
          title={t("settings.accent.label")}
          hint={t("settings.accent.hint")}
        >
          <AccentPicker />
        </PrefRow>
        <PrefRow
          title={t("settings.language.label")}
          hint={t("settings.language.hint")}
        >
          <LanguagePicker />
        </PrefRow>
        <PrefRow
          title={t("settings.tz.label")}
          hint={t("settings.tz.hint")}
          last
        >
          <TimezonePicker />
        </PrefRow>
      </CardContent>
    </Card>
  );
}

/**
 * Single preference row — title+hint on the left in a fixed-width
 * description column, control on the right. Border-bottom separates
 * rows; the `last` row drops its border so the card edge handles the
 * outline. Stacks vertically on narrow viewports so the picker keeps
 * its full horizontal canvas instead of squeezing into half a row.
 */
function PrefRow({
  title,
  hint,
  last,
  children,
}: {
  title: string;
  hint?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6",
        "px-5 py-4",
        !last && "border-b border-border/40"
      )}
    >
      <div className="lg:w-[40%] lg:shrink-0 min-w-0">
        <h3 className="font-medium text-sm">{title}</h3>
        {hint && (
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
            {hint}
          </p>
        )}
      </div>
      <div className="lg:ml-auto flex-1 min-w-0 flex lg:justify-end">
        {children}
      </div>
    </div>
  );
}

function NotificationsTab({
  cli,
  notificationsEnabled,
  onEnable,
}: {
  cli: boolean;
  notificationsEnabled: boolean;
  onEnable: () => void;
}) {
  const t = useT();
  return (
    <>
      <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {notificationsEnabled || cli ? (
              <Bell className="h-5 w-5 text-primary" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            {t("settings.notifTitle")}
          </CardTitle>
          <CardDescription>
            {cli ? t("settings.notifDescCli") : t("settings.notifDescWeb")}
          </CardDescription>
        </CardHeader>
        {!cli && (
          <CardContent>
            <RowItem
              title={
                notificationsEnabled
                  ? t("settings.notifOn")
                  : t("settings.notifOff")
              }
              hint={t("settings.notifHint")}
            >
              <Button
                variant={notificationsEnabled ? "outline" : "default"}
                onClick={onEnable}
              >
                {notificationsEnabled
                  ? t("settings.notifBtnOk")
                  : t("settings.notifBtnEnable")}
              </Button>
            </RowItem>
          </CardContent>
        )}
      </Card>

      {cli && <CliNativeNotifCard />}
    </>
  );
}

function DataTab({
  tasks,
  cli,
  fileRef,
  onExport,
  onImportFile,
  onClear,
}: {
  tasks: ReturnType<typeof useTasks>["tasks"];
  cli: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  return (
    <>
      <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            {t("settings.data.title")}
          </CardTitle>
          <CardDescription>{t("settings.data.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RowItem
            title={t("settings.export.title")}
            hint={t("settings.export.hint", { n: tasks.length })}
          >
            <Button variant="outline" onClick={onExport} className="gap-2">
              <Download className="h-4 w-4" /> {t("settings.export.button")}
            </Button>
          </RowItem>

          <RowItem
            title={t("settings.import.title")}
            hint={t("settings.import.hint")}
          >
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4" /> {t("settings.import.button")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportFile}
            />
          </RowItem>

          <RowItem
            title={t("settings.icsExport.title")}
            hint={t("settings.icsExport.hint")}
          >
            <Button
              variant="outline"
              onClick={() => {
                downloadICS(tasks);
                toast({
                  title: t("settings.icsExport.toastTitle"),
                  description: t("settings.icsExport.toastDesc", {
                    n: tasks.filter((x) => x.deadline).length,
                  }),
                });
              }}
              className="gap-2"
              disabled={!tasks.some((x) => x.deadline)}
            >
              <CalendarRange className="h-4 w-4" />
              {t("settings.icsExport.button")}
            </Button>
          </RowItem>

          <div className="flex items-center justify-between p-4 rounded-xl border bg-destructive/10 border-destructive/20 text-destructive">
            <div>
              <h3 className="font-medium">{t("settings.clearAll.title")}</h3>
              <p className="text-sm opacity-90">{t("settings.clearAll.hint")}</p>
            </div>
            <Button
              variant="destructive"
              onClick={onClear}
              className="gap-2 shrink-0"
              data-testid="settings-clear-all"
            >
              <Trash2 className="h-4 w-4" /> {t("settings.clearAll.button")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {cli && <CliBackupRecoverCard />}
    </>
  );
}

function SystemTab({ cli }: { cli: boolean }) {
  const t = useT();
  return (
    <>
      {cli && <CliStatusCard />}

      <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            {t("settings.shortcutsTitle")}
          </CardTitle>
          <CardDescription>{t("settings.shortcutsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              ["Ctrl/⌘ + K", t("settings.shortcut.palette")],
              ["↑ / ↓", t("settings.shortcut.nav")],
              ["Enter", t("settings.shortcut.select")],
              ["Esc", t("settings.shortcut.escape")],
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
    </>
  );
}

function AdvancedTab() {
  return (
    <>
      <TagsCard />
      <ErrorLogCard />
    </>
  );
}

/* ============================================================
   Generic row item — title + hint on the left, control on the right.
   Used by every settings card so visual rhythm stays consistent.
   ============================================================ */

function RowItem({
  title,
  hint,
  icon: Icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: typeof Settings;
  children: React.ReactNode;
}) {
  // Single-row layout always — title + hint shrink (truncate hint to
  // 2 lines via line-clamp), the action stays on the right same row.
  // The previous `flex-wrap` made every button drop to its own line on
  // mobile, even when the row was a single tiny Switch or icon-button;
  // that produced a visual ladder of stacked half-empty rows on
  // 375px-wide phones. Linear / Things 3 keep description + action on
  // one row by default, only wrap when REALLY tight (gap-3 keeps the
  // minimum reading width visible).
  return (
    <div className="flex items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border bg-background/50">
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-sm sm:text-base flex items-center gap-2">
          {Icon && (
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </h3>
        {hint && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {hint}
          </p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

/* ============================================================
   Tags / Error log (Advanced tab)
   ============================================================ */

function TagsCard() {
  const { tasks, updateTask } = useTasks();
  const { toast } = useToast();
  const { confirm, prompt } = useDialog();
  const t = useT();
  const stats = useMemo(() => tagStats(tasks), [tasks]);

  const renameTag = async (oldName: string) => {
    const raw = await prompt({
      title: t("settings.tagRenameTitle", { old: oldName }),
      description: t("settings.tagRenameDesc"),
      defaultValue: oldName,
      placeholder: t("settings.tagRenamePlaceholder"),
      confirmLabel: t("settings.tagRenameCta"),
    });
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

  const mergeTag = async (oldName: string) => {
    const raw = await prompt({
      title: t("settings.tagMergeTitle", { old: oldName }),
      description: t("settings.tagMergeDesc"),
      placeholder: t("settings.tagMergePlaceholder"),
      confirmLabel: t("settings.tagMergeCta"),
    });
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

  const deleteTag = async (name: string) => {
    const count = stats.find((s) => s.name === name)?.count ?? 0;
    const ok = await confirm({
      title: t("settings.tagDeleteTitle", { name }),
      description: t("settings.tagDeleteDesc", { name, n: count }),
      confirmLabel: t("settings.tagDeleteCta"),
      variant: "destructive",
    });
    if (!ok) return;
    for (const task of tasks) {
      if (!task.tags?.includes(name)) continue;
      const remain = task.tags.filter((x) => x !== name);
      updateTask(task.id, { tags: remain.length ? remain : undefined });
    }
    toast({ title: t("settings.tagDeletedToast", { name }) });
  };

  return (
    <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
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
                    size="xs"
                    onClick={() => renameTag(s.name)}
                  >
                    {t("settings.tagRename")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => mergeTag(s.name)}
                  >
                    {t("settings.tagMerge")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => deleteTag(s.name)}
                    className="text-destructive hover:text-destructive"
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
  const localeTag = useLocaleTag();
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
    <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
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
                        {new Date(e.at).toLocaleString(localeTag)}
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

/* ============================================================
   CLI cards — split into three so they slot into the right tabs:
     CliStatusCard      → System tab (port/version/autostart/open folder)
     CliBackupRecoverCard → Data tab (backup + recover)
     CliNativeNotifCard → Notifications tab (test + scheduled list)
   All three share the same polling state via `useCliState()`.
   ============================================================ */

function useCliState() {
  const [info, setInfo] = useState<
    (CliInfo & { dataFile: string; autostart: boolean }) | null
  >(null);
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
        if (!cancelled) {
          setInfo(h);
          setHistory(hist);
          setScheduled(s);
        }
      } catch (e) {
        console.warn("CLI probe failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { info, setInfo, history, scheduled, busy, setBusy, refresh };
}

function CliStatusCard() {
  const t = useT();
  const { toast } = useToast();
  const { info, setInfo, busy, setBusy } = useCliState();

  const toggleAutostart = async (nextWanted?: boolean) => {
    if (!info) return;
    setBusy(true);
    try {
      const target = nextWanted ?? !info.autostart;
      const next = await cliSetAutostart(target);
      setInfo({ ...info, autostart: next });
      toast({
        title: next
          ? t("settings.cli.autostart.toastOnTitle")
          : t("settings.cli.autostart.toastOffTitle"),
        description: next
          ? t("settings.cli.autostart.toastOnDesc")
          : t("settings.cli.autostart.toastOffDesc"),
        variant: "success",
      });
    } catch (e) {
      toast({
        title: t("settings.cli.autostart.toastFailTitle"),
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="md:col-span-2 border-emerald-500/30 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Power className="h-5 w-5 text-emerald-500" />
          {t("settings.cli.title")}
        </CardTitle>
        <CardDescription>{t("settings.cli.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* KV strip — was a sm:grid-cols-2 block that hugged the left
            corner of the (now wider) card. Switching to a flex-wrap
            row spreads the chips left-to-right so the card's full
            width carries real content instead of empty whitespace. */}
        {info ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs px-3 py-2.5 rounded-lg bg-background/50 border">
            <KVChip label={t("settings.cli.row.port")} value={`localhost:${info.port}`} />
            <KVChip label={t("settings.cli.row.version")} value={info.version} />
            <KVChip label={t("settings.cli.row.platform")} value={info.platform} />
            <KVChip label={t("settings.cli.row.dataFile")} value={info.dataFile} mono className="min-w-0 flex-1" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("settings.cli.statusReading")}
          </p>
        )}

        <RowItem
          title={t("settings.cli.autostart.title")}
          hint={t("settings.cli.autostart.hint")}
          icon={Power}
        >
          <Switch
            checked={!!info?.autostart}
            onCheckedChange={toggleAutostart}
            disabled={busy || !info}
            aria-label={t("settings.cli.autostart.title")}
            data-testid="settings-autostart-switch"
          />
        </RowItem>

        <RowItem
          title={t("settings.cli.openFolder.title")}
          hint={t("settings.cli.openFolder.hint")}
          icon={FolderOpen}
        >
          <Button
            variant="outline"
            onClick={() => cliOpenDataDir()}
            disabled={!info}
            className="gap-2"
          >
            <FolderOpen className="h-4 w-4" />
            {t("settings.cli.openFolder.button")}
          </Button>
        </RowItem>
      </CardContent>
    </Card>
  );
}

/**
 * Compact inline KV chip used by CliStatusCard. Label is small caps,
 * value sits below — both share one chip cell so the row reads as a
 * sequence of `LABEL\nvalue` blocks separated by gap. `mono` switches
 * the value to tabular font (used for file paths).
 */
function KVChip({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70 leading-none">
        {label}
      </p>
      <p
        className={cn(
          "text-xs font-medium mt-1 leading-tight truncate",
          mono && "font-mono tabular-nums"
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function CliBackupRecoverCard() {
  const t = useT();
  const localeTag = useLocaleTag();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const { info, history, busy, setBusy, refresh } = useCliState();

  const handleBackup = async () => {
    setBusy(true);
    try {
      const r = await cliBackup();
      if (r.ok) {
        toast({
          title: t("settings.cli.backup.toastOkTitle"),
          description: r.path,
          variant: "success",
        });
      } else {
        toast({
          title: t("settings.cli.backup.toastFailTitle"),
          description: r.error || t("settings.cli.backup.toastFailFallback"),
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRecover = async (version: number, count: number) => {
    const ok = await confirm({
      title: t("settings.cli.recover.confirmTitle", { n: version }),
      description: t("settings.cli.recover.confirmBody", { n: version, count }),
      confirmLabel: t("settings.cli.recover.confirmCta", { n: version }),
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await cliRecover(version);
      if (r.ok) {
        toast({
          title: t("settings.cli.recover.toastOkTitle", { n: version }),
          description: t("settings.cli.recover.toastOkDesc", { n: r.count ?? 0 }),
          variant: "success",
        });
        await refresh();
      } else {
        toast({
          title: t("settings.cli.recover.toastFailTitle"),
          description: r.error || t("settings.cli.recover.toastFailFallback"),
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const slotKindLabel = (v: number) =>
    v === 1
      ? t("settings.cli.recover.slotNewest")
      : v === 3
      ? t("settings.cli.recover.slotOldest")
      : t("settings.cli.recover.slotMiddle");

  return (
    <Card className="md:col-span-2 border-amber-500/20 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Save className="h-5 w-5 text-amber-600" />
          {t("settings.cli.backup.title")}
        </CardTitle>
        <CardDescription>{t("settings.cli.recover.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <RowItem
          title={t("settings.cli.backup.title")}
          hint={t("settings.cli.backup.hint")}
          icon={HardDrive}
        >
          <Button
            variant="outline"
            onClick={handleBackup}
            disabled={busy || !info}
            className="gap-2"
          >
            <HardDrive className="h-4 w-4" />
            {t("settings.cli.backup.button")}
          </Button>
        </RowItem>

        <div className="p-4 rounded-xl border bg-background/50 space-y-2">
          <h3 className="font-medium flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            {t("settings.cli.recover.title")}
          </h3>
          <div className="space-y-1.5">
            {history.length === 0 || history.every((s) => !s.exists) ? (
              <p className="text-xs text-muted-foreground italic">
                {t("settings.cli.recover.empty")}
              </p>
            ) : (
              history.map((slot) => (
                <div
                  key={slot.version}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">
                      {t("settings.cli.recover.slotLabel", { n: slot.version })}{" "}
                      <span className="text-muted-foreground font-normal">
                        ({slotKindLabel(slot.version)})
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {slot.exists
                        ? t("settings.cli.recover.slotMeta", {
                            n: slot.count ?? 0,
                            time: slot.mtime
                              ? new Date(slot.mtime).toLocaleString(localeTag)
                              : "—",
                          })
                        : t("settings.cli.recover.slotEmpty")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleRecover(slot.version, slot.count || 0)
                    }
                    disabled={busy || !slot.exists}
                    className="gap-1.5 shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("settings.cli.recover.button")}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CliNativeNotifCard() {
  const t = useT();
  const localeTag = useLocaleTag();
  const { toast } = useToast();
  const { info, scheduled, busy } = useCliState();

  const handleTest = async () => {
    try {
      await cliTestNotification();
      toast({
        title: t("settings.cli.notif.testOkTitle"),
        description: t("settings.cli.notif.testOkDesc"),
      });
    } catch (e) {
      toast({
        title: t("settings.cli.notif.testFailTitle"),
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="md:col-span-2 border-primary/10 shadow-sm bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          {t("settings.cli.notif.title")}
        </CardTitle>
        <CardDescription>
          {scheduled.length > 0
            ? t("settings.cli.notif.scheduledN", { n: scheduled.length })
            : t("settings.cli.notif.empty")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={busy || !info}
            className="gap-2"
          >
            <Bell className="h-4 w-4" />
            {t("settings.cli.notif.testButton")}
          </Button>
        </div>
        {scheduled.length > 0 && (
          <div className="space-y-1 max-h-32 overflow-y-auto rounded-lg border bg-background/50 p-2">
            {scheduled.slice(0, 8).map((s) => (
              <div
                key={s.taskId + s.fireAt}
                className="flex items-center justify-between text-xs gap-2"
              >
                <span className="truncate flex-1">{s.title}</span>
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {new Date(s.fireAt).toLocaleString(localeTag, {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
            {scheduled.length > 8 && (
              <p className="text-[10px] text-muted-foreground">
                {t("settings.cli.notif.moreN", { n: scheduled.length - 8 })}
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("settings.cli.notif.tipPrefix")}{" "}
          <strong>{t("settings.cli.notif.testButton")}</strong>{" "}
          {t("settings.cli.notif.tipSuffix")}
        </p>
      </CardContent>
    </Card>
  );
}

