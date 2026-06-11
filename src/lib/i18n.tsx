/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";

export type Lang = "vi" | "en";

const LANG_STORAGE_KEY = "clearmind_lang";

/* ----------------------------------------------------------------
 * Dictionary — flat keys grouped by area. Khi thêm key mới phải
 * cập nhật CẢ hai ngôn ngữ để tránh fallback. Nếu key thiếu, hàm
 * t() trả thẳng key ra cho dễ phát hiện.
 * ---------------------------------------------------------------- */
type Dict = Record<string, string>;

const VI: Dict = {
  // Nav
  "nav.dashboard": "Tổng quan",
  "nav.calendar": "Lịch",
  "nav.tasks": "Task",
  "nav.focus": "Tập trung",
  "nav.review": "Tổng kết",
  "nav.import": "Import lịch học",
  "nav.guide": "Hướng dẫn",
  "nav.settings": "Cài đặt",
  "nav.quickCapture": "Thêm nhanh",
  "nav.tags": "Tags",

  // Topbar
  "topbar.searchPlaceholder": "Tìm task, lệnh, điều hướng…",
  "topbar.overdue": "{n} quá hạn",
  "topbar.add": "Thêm",
  "topbar.dashboardTooltip": "Về Dashboard",

  // Status + Type + Priority
  "status.todo": "Chưa làm",
  "status.inProgress": "Đang làm",
  "status.done": "Đã xong",
  "type.academic": "Học tập",
  "type.work": "Công việc",
  "type.personal": "Cá nhân",
  "type.other": "Khác",
  "priority.high": "Cao",
  "priority.medium": "Vừa",
  "priority.low": "Thấp",
  "priority.urgent": "Gấp",

  // Common
  "common.save": "Lưu",
  "common.cancel": "Huỷ",
  "common.delete": "Xoá",
  "common.edit": "Sửa",
  "common.close": "Đóng",
  "common.done": "Xong",
  "common.confirm": "Đồng ý",
  "common.search": "Tìm kiếm",
  "common.all": "Tất cả",
  "common.today": "Hôm nay",
  "common.tomorrow": "Mai",
  "common.thisWeek": "Tuần này",
  "common.nextWeek": "Tuần sau",
  "common.weekend": "Cuối tuần",
  "common.allDay": "Cả ngày",
  "common.undo": "Hoàn tác",
  "common.restore": "Khôi phục",
  "common.loading": "Đang tải…",
  "common.empty": "Trống",

  // Tasks page
  "tasks.viewTasks": "Việc cần làm",
  "tasks.viewSchedule": "Lịch học",
  "tasks.viewAll": "Tất cả",
  "tasks.filterAll": "Tất cả",
  "tasks.filterTodo": "Chưa xong",
  "tasks.filterDone": "Đã xong",
  "tasks.subtitleCount": "{n} task · nhóm theo deadline",
  "tasks.subtitleSchedule": "{subjects} môn · {sessions} buổi sắp tới",
  "tasks.todayClasses": "Hôm nay {n} buổi",
  "tasks.viewSchedule.link": "Xem lịch học",
  "tasks.bySubject": "Gộp theo môn",
  "tasks.list": "Danh sách",
  "tasks.searchPlaceholder": "Tìm theo title, tag, phòng…",
  "tasks.clearDuplicates": "Xoá trùng lặp",
  "tasks.sort.deadline": "Deadline",
  "tasks.sort.priority": "Ưu tiên",
  "tasks.sort.recent": "Mới nhất",
  "tasks.overdueTitle": "{n} task quá hạn",
  "tasks.overdueHintRecurring": "{n} task lặp lại có thể tự đẩy lên buổi tiếp theo.",
  "tasks.overdueHintGeneric": "Snooze hoặc xoá để dọn dẹp.",
  "tasks.rollForward": "Đẩy → buổi tiếp",
  "tasks.snoozeDay": "Đẩy lùi 1 ngày",
  "tasks.snoozeWeek": "Đẩy lùi 1 tuần",
  "tasks.snoozedToast": "Đẩy lùi · {label}",
  "tasks.addHomework": "Thêm bài tập",
  "tasks.deletedToast": "Đã xoá task",
  "tasks.subjectSessions": "{n} buổi",
  "tasks.nextOccurrence": "Tiếp theo: {label}",
  "tasks.recurringCleared": "Đẩy {n} task lặp lại lên buổi tiếp theo",
  "tasks.noRecurringOverdue": "Không có task lặp lại nào quá hạn",
  "tasks.duplicatesCleared": "Đã xoá {n} task trùng lặp",
  "tasks.noDuplicates": "Không có task trùng",

  // Bucket labels
  "bucket.overdue": "Quá hạn",
  "bucket.today": "Hôm nay",
  "bucket.thisWeek": "Tuần này",
  "bucket.later": "Sau này",
  "bucket.none": "Không có deadline",

  // Empty states
  "empty.noTodoTasks": "Không còn task nào cần làm.",
  "empty.noTodoHint": "Tạo task mới bằng Quick Capture phía trên.",
  "empty.noDoneTasks": "Chưa có task nào hoàn thành.",
  "empty.noDoneHint": "Tick task xong sẽ hiện ở đây.",
  "empty.noTasksTitle": "Chưa có task nào.",
  "empty.noTasksHint": "Bắt đầu bằng Quick Capture, hoặc import lịch học từ trang trường.",
  "empty.onlyOverdueTitle": "Chỉ còn task quá hạn — xem khung đỏ ở trên.",
  "empty.onlyOverdueHint": "Bấm 'Đẩy → buổi tiếp' để chuyển sang tuần tới.",
  "empty.noTagFiltered": "Không có task nào gắn #{tag}{filter}.",
  "empty.noTagFiltered.todoSuffix": " còn mở",
  "empty.removeTagFilter": "Bỏ lọc tag",
  "empty.searchEmpty": "Không thấy task nào khớp \"{q}\"",
  "empty.searchHint": "Thử bỏ filter hoặc tìm từ khoá khác.",
  "empty.noSchedule": "Chưa có buổi học lặp lại nào.",
  "empty.noScheduleHint": "Import lịch học từ trang trường để tự tạo.",

  // Calendar
  "calendar.view.month": "Tháng",
  "calendar.view.week": "Tuần",
  "calendar.view.day": "Ngày",
  "calendar.view.agenda": "Agenda",
  "calendar.today": "Hôm nay",
  "calendar.hideType": "Ẩn {label}",
  "calendar.showType": "Hiện {label}",
  "calendar.hideDone": "Ẩn done",
  "calendar.snooze": "Dời",
  "calendar.statusLabel": "Trạng thái",
  "calendar.urgentInline": "· Ưu tiên cao",
  "calendar.viewAllTag": "Xem mọi task có #{tag}",

  // Command palette
  "palette.action.new": "Tạo task mới",
  "palette.action.dashboard": "Mở Dashboard",
  "palette.action.calendar": "Mở Lịch",
  "palette.action.tasks": "Mở danh sách Task",
  "palette.action.focus": "Vào chế độ Focus (Pomodoro)",
  "palette.action.review": "Tổng kết tuần",
  "palette.action.import": "Import lịch học",
  "palette.action.guide": "Hướng dẫn",
  "palette.action.settings": "Cài đặt",
  "palette.placeholder": "Gõ lệnh hoặc tìm task…",
  "palette.commands": "Lệnh",
  "palette.tasks": "Task",
  "palette.empty": "Không có gợi ý nào.",

  // Task dialog
  "dialog.createTitle": "Tạo task mới",
  "dialog.editTitle": "Sửa task",
  "dialog.label.title": "Tiêu đề",
  "dialog.label.description": "Mô tả",
  "dialog.label.type": "Loại",
  "dialog.label.priority": "Mức ưu tiên",
  "dialog.label.deadline": "Deadline",
  "dialog.label.location": "Vị trí / Phòng",
  "dialog.label.tags": "Tags",
  "dialog.label.recurrence": "Lặp lại",
  "dialog.label.notify": "Nhắc trước",
  "dialog.placeholder.title": "VD: Ôn thi Giải tích 2 — chương 3",
  "dialog.placeholder.description": "Chi tiết, link tài liệu, lưu ý… (không bắt buộc)",
  "dialog.placeholder.location": "VD: A1.404, lab E3",
  "dialog.placeholder.deadline": "Chọn ngày & giờ",
  "dialog.placeholder.dateOnly": "Chọn ngày",
  "dialog.applyNl": "Dùng \"{label}\"",

  // Notify options
  "notify.atTime": "Đúng giờ",
  "notify.5m": "5 phút trước",
  "notify.15m": "15 phút trước",
  "notify.1h": "1 giờ trước",
  "notify.1d": "1 ngày trước",
  "notify.none": "Không nhắc",

  // Recurrence options
  "recurrence.daily": "Hằng ngày",
  "recurrence.weekday": "Ngày trong tuần",
  "recurrence.weekly": "Hằng tuần",
  "recurrence.monthly": "Hằng tháng",
  "recurrence.none": "Không lặp",

  // Toast / notification messages (mirror in CLI)
  "noti.reminder": "Tới giờ",
  "noti.reminderTitle": "Clearmind · {title}",

  // CLI status
  "cli.online": "CLI",
  "cli.offline": "CLI offline",
  "cli.checking": "…",
  "cli.tooltipOnline": "CLI live ở port {port} — data đang ghi lên đĩa",
  "cli.tooltipOffline": "CLI mất kết nối — chỉnh sửa hiện không ghi được lên đĩa",

  // Quick capture
  "quick.placeholder": "Bắt task vào đây — \"Ôn thi mai 9h\"",
  "quick.add": "Thêm",

  // Toast actions
  "toast.dismiss": "Đóng",

  // Tooltip & misc
  "tooltip.delete": "Xoá",
  "tooltip.edit": "Sửa",
  "tooltip.toggleStatus": "Đổi trạng thái — hiện tại: {label}",
  "tooltip.languageToggle": "Đổi ngôn ngữ",
};

const EN: Dict = {
  // Nav
  "nav.dashboard": "Dashboard",
  "nav.calendar": "Calendar",
  "nav.tasks": "Tasks",
  "nav.focus": "Focus",
  "nav.review": "Review",
  "nav.import": "Import schedule",
  "nav.guide": "Guide",
  "nav.settings": "Settings",
  "nav.quickCapture": "Quick capture",
  "nav.tags": "Tags",

  // Topbar
  "topbar.searchPlaceholder": "Search tasks, commands, pages…",
  "topbar.overdue": "{n} overdue",
  "topbar.add": "Add",
  "topbar.dashboardTooltip": "Go to Dashboard",

  // Status + Type + Priority
  "status.todo": "To do",
  "status.inProgress": "In progress",
  "status.done": "Done",
  "type.academic": "Academic",
  "type.work": "Work",
  "type.personal": "Personal",
  "type.other": "Other",
  "priority.high": "High",
  "priority.medium": "Medium",
  "priority.low": "Low",
  "priority.urgent": "Urgent",

  // Common
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.done": "Done",
  "common.confirm": "Confirm",
  "common.search": "Search",
  "common.all": "All",
  "common.today": "Today",
  "common.tomorrow": "Tomorrow",
  "common.thisWeek": "This week",
  "common.nextWeek": "Next week",
  "common.weekend": "Weekend",
  "common.allDay": "All day",
  "common.undo": "Undo",
  "common.restore": "Restore",
  "common.loading": "Loading…",
  "common.empty": "Empty",

  // Tasks page
  "tasks.viewTasks": "To do",
  "tasks.viewSchedule": "Schedule",
  "tasks.viewAll": "All",
  "tasks.filterAll": "All",
  "tasks.filterTodo": "Open",
  "tasks.filterDone": "Done",
  "tasks.subtitleCount": "{n} tasks · grouped by deadline",
  "tasks.subtitleSchedule": "{subjects} subjects · {sessions} upcoming sessions",
  "tasks.todayClasses": "{n} classes today",
  "tasks.viewSchedule.link": "View schedule",
  "tasks.bySubject": "By subject",
  "tasks.list": "List",
  "tasks.searchPlaceholder": "Search title, tag, room…",
  "tasks.clearDuplicates": "Remove duplicates",
  "tasks.sort.deadline": "Deadline",
  "tasks.sort.priority": "Priority",
  "tasks.sort.recent": "Newest",
  "tasks.overdueTitle": "{n} overdue tasks",
  "tasks.overdueHintRecurring": "{n} recurring tasks can roll forward.",
  "tasks.overdueHintGeneric": "Snooze or delete to clean up.",
  "tasks.rollForward": "Roll forward",
  "tasks.snoozeDay": "Snooze 1 day",
  "tasks.snoozeWeek": "Snooze 1 week",
  "tasks.snoozedToast": "Snoozed · {label}",
  "tasks.addHomework": "Add homework",
  "tasks.deletedToast": "Task deleted",
  "tasks.subjectSessions": "{n} sessions",
  "tasks.nextOccurrence": "Next: {label}",
  "tasks.recurringCleared": "Rolled {n} recurring tasks forward",
  "tasks.noRecurringOverdue": "No overdue recurring tasks",
  "tasks.duplicatesCleared": "Removed {n} duplicate tasks",
  "tasks.noDuplicates": "No duplicates found",

  // Bucket labels
  "bucket.overdue": "Overdue",
  "bucket.today": "Today",
  "bucket.thisWeek": "This week",
  "bucket.later": "Later",
  "bucket.none": "No deadline",

  // Empty states
  "empty.noTodoTasks": "Nothing left to do.",
  "empty.noTodoHint": "Create a task with Quick Capture above.",
  "empty.noDoneTasks": "No completed tasks yet.",
  "empty.noDoneHint": "Finished tasks will appear here.",
  "empty.noTasksTitle": "No tasks yet.",
  "empty.noTasksHint": "Start with Quick Capture or import your class schedule.",
  "empty.onlyOverdueTitle": "Only overdue tasks left — see red panel above.",
  "empty.onlyOverdueHint": "Tap 'Roll forward' to move them to next week.",
  "empty.noTagFiltered": "No tasks tagged #{tag}{filter}.",
  "empty.noTagFiltered.todoSuffix": " still open",
  "empty.removeTagFilter": "Clear tag filter",
  "empty.searchEmpty": "No task matches \"{q}\"",
  "empty.searchHint": "Try a different keyword or remove filters.",
  "empty.noSchedule": "No recurring classes yet.",
  "empty.noScheduleHint": "Import your school schedule to populate this view.",

  // Calendar
  "calendar.view.month": "Month",
  "calendar.view.week": "Week",
  "calendar.view.day": "Day",
  "calendar.view.agenda": "Agenda",
  "calendar.today": "Today",
  "calendar.hideType": "Hide {label}",
  "calendar.showType": "Show {label}",
  "calendar.hideDone": "Hide done",
  "calendar.snooze": "Snooze",
  "calendar.statusLabel": "Status",
  "calendar.urgentInline": "· High priority",
  "calendar.viewAllTag": "See all tasks with #{tag}",

  // Command palette
  "palette.action.new": "New task",
  "palette.action.dashboard": "Go to Dashboard",
  "palette.action.calendar": "Go to Calendar",
  "palette.action.tasks": "Go to Tasks",
  "palette.action.focus": "Focus mode (Pomodoro)",
  "palette.action.review": "Weekly review",
  "palette.action.import": "Import schedule",
  "palette.action.guide": "Open guide",
  "palette.action.settings": "Settings",
  "palette.placeholder": "Type a command or search tasks…",
  "palette.commands": "Commands",
  "palette.tasks": "Tasks",
  "palette.empty": "No suggestions.",

  // Task dialog
  "dialog.createTitle": "New task",
  "dialog.editTitle": "Edit task",
  "dialog.label.title": "Title",
  "dialog.label.description": "Description",
  "dialog.label.type": "Type",
  "dialog.label.priority": "Priority",
  "dialog.label.deadline": "Deadline",
  "dialog.label.location": "Location / Room",
  "dialog.label.tags": "Tags",
  "dialog.label.recurrence": "Repeat",
  "dialog.label.notify": "Remind",
  "dialog.placeholder.title": "e.g. Review Calc 2 — chapter 3",
  "dialog.placeholder.description": "Notes, links, details… (optional)",
  "dialog.placeholder.location": "e.g. A1.404, lab E3",
  "dialog.placeholder.deadline": "Pick date & time",
  "dialog.placeholder.dateOnly": "Pick date",
  "dialog.applyNl": "Use \"{label}\"",

  // Notify options
  "notify.atTime": "At time",
  "notify.5m": "5 min before",
  "notify.15m": "15 min before",
  "notify.1h": "1 hour before",
  "notify.1d": "1 day before",
  "notify.none": "No reminder",

  // Recurrence options
  "recurrence.daily": "Daily",
  "recurrence.weekday": "Weekdays",
  "recurrence.weekly": "Weekly",
  "recurrence.monthly": "Monthly",
  "recurrence.none": "No repeat",

  // Toast / notification messages
  "noti.reminder": "Time's up",
  "noti.reminderTitle": "Clearmind · {title}",

  // CLI status
  "cli.online": "CLI",
  "cli.offline": "CLI offline",
  "cli.checking": "…",
  "cli.tooltipOnline": "CLI live on port {port} — data writing to disk",
  "cli.tooltipOffline": "CLI offline — edits not being saved",

  // Quick capture
  "quick.placeholder": "Capture a task — \"Review tomorrow 9am\"",
  "quick.add": "Add",

  // Toast actions
  "toast.dismiss": "Dismiss",

  // Tooltip
  "tooltip.delete": "Delete",
  "tooltip.edit": "Edit",
  "tooltip.toggleStatus": "Cycle status — currently: {label}",
  "tooltip.languageToggle": "Toggle language",
};

const ALL: Record<Lang, Dict> = { vi: VI, en: EN };

/** Replace {name} placeholders. params giữ nguyên nếu key vắng. */
function format(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === "en" ? "en" : "vi";
  });

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    document.documentElement.setAttribute("lang", lang);
    // Sync sang CLI để notification dùng đúng ngôn ngữ. Bỏ qua lỗi
    // (chạy dev hay CLI tắt → tiếp tục bình thường).
    fetch("/api/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    }).catch(() => {});
  }, [lang]);

  const setLang = (l: Lang) => setLangState(l);

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = ALL[lang];
    const raw = dict[key] ?? VI[key] ?? key;
    return format(raw, params);
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** Shortcut hook khi component chỉ cần t(). */
export function useT() {
  return useI18n().t;
}
