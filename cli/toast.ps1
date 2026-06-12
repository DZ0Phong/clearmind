$ErrorActionPreference = 'SilentlyContinue'

# Title/message/icon come in through env vars — Windows env block uses
# UTF-16 natively so Vietnamese diacritics survive the spawn intact. We
# do NOT interpolate anything from user input into this script itself.
$title    = $env:CM_TITLE
$message  = $env:CM_MESSAGE
$icon     = $env:CM_ICON
$taskId   = $env:CM_TASK_ID
$port     = $env:CM_PORT
$sound    = $env:CM_SOUND
if (-not $port)  { $port  = '20129' }
if (-not $sound) { $sound = 'ms-winsoundevent:Notification.Reminder' }

function XmlEscape([string]$s) {
  if ($null -eq $s) { return '' }
  return [System.Security.SecurityElement]::Escape($s)
}

$titleX   = XmlEscape $title
$messageX = XmlEscape $message

# Build appLogoOverride image node — crispiest when 256×256 PNG and
# hint-crop='none' (default circle crop slices a square logo). Skip the
# node entirely if the icon file is missing so we don't ship a broken src.
$logoNode = ''
if ($icon -and (Test-Path $icon)) {
  $iconResolved = (Resolve-Path $icon).Path
  $iconX = XmlEscape $iconResolved
  $logoNode = "<image placement='appLogoOverride' hint-crop='none' src='$iconX' />"
}

# Action buttons. activationType='protocol' makes Windows open the URL
# when the button is clicked — we use the registered `clearmind://` URL
# scheme so a tiny node handler runs silently (no browser flash). If the
# scheme isn't registered yet, Windows falls back to "no app to open
# this link" which is a soft failure: visual toast still shows.
$actionsNode = ''
if ($taskId) {
  $idX = XmlEscape $taskId
  $portX = XmlEscape $port
  $a1 = "clearmind://snooze-10?id=$idX&amp;port=$portX"
  $a2 = "clearmind://snooze-60?id=$idX&amp;port=$portX"
  $a3 = "clearmind://done?id=$idX&amp;port=$portX"
  $actionsNode = @"
  <actions>
    <action content='Hoãn 10p' arguments='$a1' activationType='protocol' />
    <action content='Hoãn 1h'  arguments='$a2' activationType='protocol' />
    <action content='Xong'     arguments='$a3' activationType='protocol' />
  </actions>
"@
}

$soundX = XmlEscape $sound

$xml = @"
<toast scenario='reminder'>
  <visual>
    <binding template='ToastGeneric'>
      $logoNode
      <text>$titleX</text>
      <text>$messageX</text>
    </binding>
  </visual>
  <audio src='$soundX' loop='false' />
$actionsNode
</toast>
"@

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument,                  Windows.Data.Xml.Dom,        ContentType=WindowsRuntime] | Out-Null

$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$notif = New-Object Windows.UI.Notifications.ToastNotification $doc

# AppUserModelID: try 'Clearmind' first; fall back to a known-registered
# system app so Win11 still shows the toast even without a Start menu
# shortcut for 'Clearmind'.
try {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Clearmind').Show($notif)
} catch {
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.Windows.Explorer').Show($notif)
}
