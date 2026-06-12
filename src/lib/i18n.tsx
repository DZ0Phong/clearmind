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
  "tasks.lateBy": "trễ {time}",

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

  // Voice mic
  "voice.start": "Nói để nhập ({lang}) — click để bắt đầu",
  "voice.stop": "Click để dừng ghi âm",
  "voice.unsupported": "Trình duyệt chưa hỗ trợ nhập giọng nói",
  "voice.errPermission": "Chưa cấp quyền micro",
  "voice.errNoSpeech": "Không nghe thấy gì — thử lại",
  "voice.errNetwork": "Lỗi mạng — speech engine cần internet",
  "voice.errGeneric": "Lỗi voice ({code})",

  // Theme
  "theme.light": "Sáng",
  "theme.dark": "Tối",
  "theme.system": "Hệ thống",

  // Settings
  "settings.title": "Cài đặt",
  "settings.subtitle": "Tuỳ chỉnh giao diện, ngôn ngữ và dữ liệu của Clearmind.",
  "settings.appearance": "Giao diện",
  "settings.appearance.desc": "Chế độ sáng / tối — đồng bộ với hệ điều hành nếu chọn 'Hệ thống'.",
  "settings.theme.label": "Theme",
  "settings.theme.hint": "Đổi tức thì, nhớ cả khi reload.",
  "settings.language.label": "Ngôn ngữ",
  "settings.language.hint": "Áp dụng cả notification của CLI.",
  "settings.accent.label": "Màu chủ đề",
  "settings.accent.hint": "Đổi màu primary trong toàn app — buttons, links, highlights.",

  // Accent colors
  "accent.indigo": "Tím (mặc định)",
  "accent.violet": "Tím đậm",
  "accent.blue": "Xanh dương",
  "accent.emerald": "Xanh ngọc",
  "accent.rose": "Hồng",
  "accent.orange": "Cam",

  // Dashboard
  "dash.greet.morning": "Chào buổi sáng",
  "dash.greet.noon": "Chào buổi trưa",
  "dash.greet.afternoon": "Chào buổi chiều",
  "dash.greet.evening": "Chào buổi tối",
  "dash.stat.today": "Hôm nay",
  "dash.stat.streak": "ngày streak",
  "dash.stat.focus": "phút focus",
  "dash.stat.overdue": "quá hạn",
  "dash.todayTitle": "Lịch hôm nay",
  "dash.todayEmpty": "Trống. Kế hoạch hôm nay đang chờ bạn.",
  "dash.todayCount": "{n} việc, sắp theo giờ. Kéo lên Calendar để dời.",
  "dash.add": "Thêm",
  "dash.weekTitle": "Tuần này",
  "dash.weekFull": "Lịch đầy đủ",
  "dash.focusTitle": "Focus",
  "dash.focusWeek": "giờ {extra} tuần này",
  "dash.focusStart": "Bắt đầu phiên focus",
  "dash.inboxCount": "{n} task chưa có deadline",
  "dash.inboxHint": "Vào Tasks để xếp lịch / phân loại.",
  "dash.recentTitle": "Đã xong gần đây",
  "dash.recentEmpty": "Chưa có hoạt động nào.",
  "dash.upnext": "Up next",
  "dash.upnextOverdue": "Quá hạn",
  "dash.subline.noDeadline": "Không có deadline cứng hôm nay — tập trung vào sâu.",
  "dash.subline.allDone": "Đã xong hết việc hôm nay. Thư giãn đi.",
  "dash.subline.overdue": "Có {n} việc quá hạn — xử lý sớm để dọn đầu.",
  "dash.timeAgo.just": "vừa xong",
  "dash.timeAgo.min": "{n}p trước",
  "dash.timeAgo.hour": "{n}h trước",
  "dash.timeAgo.day": "{n}d trước",
  "dash.insight.empty": "Chưa có phiên focus nào tuần này. Bắt đầu 1 phiên 25 phút thử xem.",

  // Focus page
  "focus.title": "Focus",
  "focus.subtitle": "Chọn task · adjust thời gian · Space play/pause · R reset · S skip.",
  "focus.today": "Hôm nay",
  "focus.sessionsCount": "{n} phiên",
  "focus.mode.work": "Phiên Focus",
  "focus.mode.short": "Nghỉ ngắn",
  "focus.mode.long": "Nghỉ dài",
  "focus.modeShortLabel.work": "Focus",
  "focus.modeShortLabel.short": "Break",
  "focus.modeShortLabel.long": "Long",
  "focus.activePrefix": "Đang focus: ",
  "focus.descNoTaskWork": "Chưa chọn task — vẫn chạy được, nhưng phút sẽ không log vào task nào.",
  "focus.descBreak": "Thả lỏng. Đứng dậy, uống nước.",
  "focus.running": "Running",
  "focus.start": "Bắt đầu",
  "focus.pause": "Tạm dừng",
  "focus.reset": "Reset",
  "focus.skip": "Skip",
  "focus.tune": "Tinh chỉnh",
  "focus.label.work": "Focus",
  "focus.label.short": "Nghỉ ngắn",
  "focus.label.long": "Nghỉ dài",
  "focus.label.rounds": "Số phiên",
  "focus.autoStart": "Tự chạy phiên kế",
  "focus.autoStartHint": "Khi 1 phiên hết, chạy ngay phiên kế",
  "focus.soundOn": "Bật âm",
  "focus.soundOff": "Tắt âm",
  "focus.pickTask": "Pick a task",
  "focus.pickHint": "Mọi phút focus sẽ log vào task được chọn.",
  "focus.noTaskOpt": "Không chọn task",
  "focus.noTaskOptHint": "Cứ chạy timer, không gán phút.",
  "focus.inboxZero": "Inbox zero. Không có task để focus.",
  "focus.toastWorkEnd": "Hết phiên focus",
  "focus.toastLongBreak": "Xong {n} phiên — nghỉ dài",
  "focus.toastBreakEnd": "Hết giờ nghỉ",
  "focus.toastReady": "Sẵn sàng phiên mới.",
  "focus.toastSummary": "+{n}p{title} · nghỉ {b}p",

  // Settings — labels used in cards
  "settings.notifTitle": "Thông báo",
  "settings.notifDescCli": "CLI mode đang chạy → toast OS gốc bay lên cả khi browser đóng. Không cần bật browser notification nữa.",
  "settings.notifDescWeb": "Nhắc bạn trước deadline. Chỉ hoạt động khi trình duyệt mở.",
  "settings.notifOn": "Đang bật",
  "settings.notifOff": "Đang tắt",
  "settings.notifHint": "Đặt mức nhắc cho từng task khi tạo / sửa.",
  "settings.notifBtnOk": "OK",
  "settings.notifBtnEnable": "Bật notifications",
  "settings.shortcutsTitle": "Phím tắt",
  "settings.shortcutsDesc": "Mở Command Palette từ bất kỳ đâu.",
  "settings.dataTitle": "Dữ liệu & Backup",
  "settings.errLogTitle": "Nhật ký lỗi",
  "settings.errLogEmpty": "Không có lỗi nào được ghi nhận gần đây.",
  "settings.errLogCount": "{n} lỗi gần nhất — copy để báo lỗi.",
  "settings.errLogClean": "Sạch sẽ — không lỗi nào kể từ lần xoá gần nhất.",
  "settings.refresh": "Refresh",
  "settings.copyJson": "Copy JSON",
  "settings.clear": "Xoá",
  "settings.errLogCleared": "Đã xoá nhật ký lỗi",
  "settings.copySuccess": "Đã copy nhật ký lỗi vào clipboard",
  "settings.copyFail": "Không copy được",
  "settings.tagsTitle": "Quản lý tag",
  "settings.tagsDesc": "Xem, gộp, đổi tên hoặc xoá tag dùng trong toàn bộ task.",
  "settings.tagsEmpty": "Chưa có tag nào.",
  "settings.tagRename": "Đổi tên",
  "settings.tagDelete": "Xoá",
  "settings.tagMerge": "Gộp",
  "settings.tagRenamePrompt": "Đổi tên tag '{old}' thành:",
  "settings.tagMergePrompt": "Gộp tag '{old}' vào tag nào? (gõ tên tag đích)",
  "settings.tagDeleteConfirm": "Xoá tag '{name}' khỏi {n} task?",
  "settings.tagRenamedToast": "Đã đổi {old} → {new}",
  "settings.tagDeletedToast": "Đã xoá tag {name}",
  "settings.tagMergedToast": "Đã gộp {old} vào {new}",
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
  "tasks.lateBy": "{time} late",

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

  // Voice mic
  "voice.start": "Speak to dictate ({lang}) — click to start",
  "voice.stop": "Click to stop recording",
  "voice.unsupported": "Speech recognition not supported in this browser",
  "voice.errPermission": "Microphone permission denied",
  "voice.errNoSpeech": "No speech detected — try again",
  "voice.errNetwork": "Network error — speech engine needs the internet",
  "voice.errGeneric": "Voice error ({code})",

  // Theme
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  // Settings
  "settings.title": "Settings",
  "settings.subtitle": "Customize appearance, language and data of Clearmind.",
  "settings.appearance": "Appearance",
  "settings.appearance.desc": "Light / dark — follow the OS when set to 'System'.",
  "settings.theme.label": "Theme",
  "settings.theme.hint": "Applied instantly, persists across reloads.",
  "settings.language.label": "Language",
  "settings.language.hint": "Also applied to CLI notifications.",
  "settings.accent.label": "Accent color",
  "settings.accent.hint": "Tints buttons, links and highlights app-wide.",

  // Accent colors
  "accent.indigo": "Indigo (default)",
  "accent.violet": "Violet",
  "accent.blue": "Blue",
  "accent.emerald": "Emerald",
  "accent.rose": "Rose",
  "accent.orange": "Orange",

  // Dashboard
  "dash.greet.morning": "Good morning",
  "dash.greet.noon": "Good afternoon",
  "dash.greet.afternoon": "Good afternoon",
  "dash.greet.evening": "Good evening",
  "dash.stat.today": "Today",
  "dash.stat.streak": "day streak",
  "dash.stat.focus": "focus min",
  "dash.stat.overdue": "overdue",
  "dash.todayTitle": "Today's agenda",
  "dash.todayEmpty": "Empty. Your day is waiting.",
  "dash.todayCount": "{n} items, ordered by time. Drag to calendar to reschedule.",
  "dash.add": "Add",
  "dash.weekTitle": "This week",
  "dash.weekFull": "Full calendar",
  "dash.focusTitle": "Focus",
  "dash.focusWeek": "hours {extra} this week",
  "dash.focusStart": "Start focus session",
  "dash.inboxCount": "{n} tasks without a deadline",
  "dash.inboxHint": "Go to Tasks to schedule / classify.",
  "dash.recentTitle": "Recently done",
  "dash.recentEmpty": "No activity yet.",
  "dash.upnext": "Up next",
  "dash.upnextOverdue": "Overdue",
  "dash.subline.noDeadline": "No hard deadlines today — go deep on something.",
  "dash.subline.allDone": "All done today. Take a break.",
  "dash.subline.overdue": "You have {n} overdue items — clear them to feel lighter.",
  "dash.timeAgo.just": "just now",
  "dash.timeAgo.min": "{n}m ago",
  "dash.timeAgo.hour": "{n}h ago",
  "dash.timeAgo.day": "{n}d ago",
  "dash.insight.empty": "No focus sessions this week. Try a 25-minute one.",

  // Focus page
  "focus.title": "Focus",
  "focus.subtitle": "Pick a task · adjust · Space play/pause · R reset · S skip.",
  "focus.today": "Today",
  "focus.sessionsCount": "{n} sessions",
  "focus.mode.work": "Focus session",
  "focus.mode.short": "Short break",
  "focus.mode.long": "Long break",
  "focus.modeShortLabel.work": "Focus",
  "focus.modeShortLabel.short": "Break",
  "focus.modeShortLabel.long": "Long",
  "focus.activePrefix": "Focusing on: ",
  "focus.descNoTaskWork": "No task picked — timer still runs but minutes won't log to anything.",
  "focus.descBreak": "Relax. Stand up, drink water.",
  "focus.running": "Running",
  "focus.start": "Start",
  "focus.pause": "Pause",
  "focus.reset": "Reset",
  "focus.skip": "Skip",
  "focus.tune": "Tune",
  "focus.label.work": "Focus",
  "focus.label.short": "Short",
  "focus.label.long": "Long",
  "focus.label.rounds": "Rounds",
  "focus.autoStart": "Auto-start next",
  "focus.autoStartHint": "When one session ends, the next starts automatically",
  "focus.soundOn": "Sound on",
  "focus.soundOff": "Sound off",
  "focus.pickTask": "Pick a task",
  "focus.pickHint": "All focus minutes log to the picked task.",
  "focus.noTaskOpt": "No task",
  "focus.noTaskOptHint": "Run timer, no minute attribution.",
  "focus.inboxZero": "Inbox zero. Nothing to focus on.",
  "focus.toastWorkEnd": "Focus session done",
  "focus.toastLongBreak": "Finished {n} sessions — long break",
  "focus.toastBreakEnd": "Break over",
  "focus.toastReady": "Ready for the next session.",
  "focus.toastSummary": "+{n}m{title} · break {b}m",

  // Settings — labels used in cards
  "settings.notifTitle": "Notifications",
  "settings.notifDescCli": "CLI mode is running — native OS toasts fire even when the browser is closed. No need to enable browser notifications.",
  "settings.notifDescWeb": "Reminds you before the deadline. Only works while browser is open.",
  "settings.notifOn": "Enabled",
  "settings.notifOff": "Disabled",
  "settings.notifHint": "Set reminder level per task when creating / editing.",
  "settings.notifBtnOk": "OK",
  "settings.notifBtnEnable": "Enable notifications",
  "settings.shortcutsTitle": "Keyboard shortcuts",
  "settings.shortcutsDesc": "Open command palette from anywhere.",
  "settings.dataTitle": "Data & Backup",
  "settings.errLogTitle": "Error log",
  "settings.errLogEmpty": "No errors recorded recently.",
  "settings.errLogCount": "{n} most recent errors — copy to report.",
  "settings.errLogClean": "Clean — no errors since last clear.",
  "settings.refresh": "Refresh",
  "settings.copyJson": "Copy JSON",
  "settings.clear": "Clear",
  "settings.errLogCleared": "Error log cleared",
  "settings.copySuccess": "Error log copied to clipboard",
  "settings.copyFail": "Copy failed",
  "settings.tagsTitle": "Manage tags",
  "settings.tagsDesc": "View, merge, rename or delete tags used across all tasks.",
  "settings.tagsEmpty": "No tags yet.",
  "settings.tagRename": "Rename",
  "settings.tagDelete": "Delete",
  "settings.tagMerge": "Merge",
  "settings.tagRenamePrompt": "Rename tag '{old}' to:",
  "settings.tagMergePrompt": "Merge tag '{old}' into which tag? (type target tag name)",
  "settings.tagDeleteConfirm": "Delete tag '{name}' from {n} tasks?",
  "settings.tagRenamedToast": "Renamed {old} → {new}",
  "settings.tagDeletedToast": "Deleted tag {name}",
  "settings.tagMergedToast": "Merged {old} into {new}",
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
