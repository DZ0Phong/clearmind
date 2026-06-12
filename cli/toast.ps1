$ErrorActionPreference = 'SilentlyContinue'

# Title/message/icon come in through env vars — Windows env block uses
# UTF-16 natively so Vietnamese diacritics survive the spawn intact. We
# do NOT interpolate anything from user input into this script itself.
$title   = $env:CM_TITLE
$message = $env:CM_MESSAGE
$icon    = $env:CM_ICON

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime] | Out-Null

$tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(
  [Windows.UI.Notifications.ToastTemplateType]::ToastImageAndText02
)

$texts = $tpl.GetElementsByTagName('text')
$texts.Item(0).InnerText = $title
$texts.Item(1).InnerText = $message

if ($icon -and (Test-Path $icon)) {
  $img = $tpl.GetElementsByTagName('image')
  if ($img.Count -gt 0) {
    $img.Item(0).SetAttribute('src', (Resolve-Path $icon).Path)
  }
}

$notif = New-Object Windows.UI.Notifications.ToastNotification $tpl

# AppUserModelID: try "Clearmind" first; fall back to a known-registered
# system app so Win11 still shows the toast even without a Start menu
# shortcut for "Clearmind".
try {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Clearmind').Show($notif)
} catch {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.Windows.Explorer').Show($notif)
}
