param([string]$Architecture = 'x64')

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Installer verification requires Windows' }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct InstallerRectangle {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class InstallerShellLink { }

[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface InstallerShellLinkUnicode {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int capacity, IntPtr findData, uint flags);
}

public static class InstallerNative {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDlgItem(IntPtr dialog, int identifier);

  [DllImport("user32.dll")]
  public static extern bool IsWindowEnabled(IntPtr window);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr window);

  [DllImport("user32.dll")]
  public static extern int GetWindowLong(IntPtr window, int index);

  [DllImport("user32.dll")]
  public static extern uint GetDpiForWindow(IntPtr window);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int horizontal, int vertical);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint flags, uint horizontal, uint vertical, uint data, UIntPtr extraInfo);

  [DllImport("user32.dll")]
  public static extern bool RedrawWindow(IntPtr window, IntPtr rectangle, IntPtr region, uint flags);

  [DllImport("user32.dll", EntryPoint = "SendMessageW")]
  public static extern IntPtr ReadRectangle(IntPtr window, uint message, IntPtr parameter, ref InstallerRectangle rectangle);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  public static extern uint GetLongPathName(string shortPath, System.Text.StringBuilder longPath, uint length);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr parameter, IntPtr value);

  [DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendText(IntPtr window, uint message, IntPtr parameter, string value);

  public static string GetShortcutTarget(string filename) {
    var link = new InstallerShellLink();
    try {
      ((IPersistFile)link).Load(filename, 0);
      var path = new StringBuilder(32768);
      ((InstallerShellLinkUnicode)link).GetPath(path, path.Capacity, IntPtr.Zero, 4);
      return path.ToString();
    } finally {
      Marshal.FinalReleaseComObject(link);
    }
  }
}
'@

$package = Get-Content (Join-Path $PSScriptRoot '../../package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$project = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$artifact = Join-Path $project "out/make/Abner-Music-$($package.version)-windows-$Architecture.exe"
$evidence = Join-Path $project 'test-results/windows-installer'
$directory = Join-Path ([IO.Path]::GetTempPath()) "abner-install-$([guid]::NewGuid())"
$installation = Join-Path $directory ('Music Space ' + [char]0x97F3 + [char]0x4E50 + '/abner-music')
$executable = Join-Path $installation 'abner-music.exe'
$uninstaller = Join-Path $installation 'Uninstall abner-music.exe'
$registryPaths = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$existing = Get-ItemProperty $registryPaths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'Abner Music*' }
if ($existing) { throw 'Run installer verification on a clean Windows account without Abner Music installed' }
if (!(Test-Path $artifact)) { throw "Build the Windows installer first: $artifact" }
New-Item $evidence -ItemType Directory -Force | Out-Null
New-Item $directory -ItemType Directory -Force | Out-Null

function Wait-For([scriptblock]$Condition, [string]$Description, [int]$Seconds = 90) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Milliseconds 200
  }
  throw "Timed out: $Description`n$(Get-DialogText)"
}

function Get-DialogText {
  $controls = $script:window.FindAll(
    [Windows.Automation.TreeScope]::Descendants,
    [Windows.Automation.Condition]::TrueCondition
  )
  return ($controls | ForEach-Object { $_.Current.Name }) -join "`n"
}

function Invoke-InstallerButton([int]$Identifier) {
  $dialog = [IntPtr]$script:window.Current.NativeWindowHandle
  $button = [InstallerNative]::GetDlgItem($dialog, $Identifier)
  if ($button -eq [IntPtr]::Zero -or ![InstallerNative]::IsWindowEnabled($button)) {
    throw "Wizard button unavailable: $(Get-DialogText)"
  }
  [void][InstallerNative]::SetForegroundWindow($dialog)
  $bounds = [Windows.Automation.AutomationElement]::FromHandle($button).Current.BoundingRectangle
  [void][InstallerNative]::SetCursorPos([int]($bounds.X + $bounds.Width / 2), [int]($bounds.Y + $bounds.Height / 2))
  [InstallerNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  [InstallerNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
}

function Invoke-Next {
  Invoke-InstallerButton 1
}

function Get-Control([string]$Identifier) {
  return $script:window.FindFirst(
    [Windows.Automation.TreeScope]::Descendants,
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, $Identifier)
  )
}

function Open-Installer {
  $script:installer = Start-Process $artifact -ArgumentList '/currentuser' -PassThru
  Wait-For {
    $script:installer.Refresh()
    if ($script:installer.HasExited) { throw "Installer exited before showing the window: $($script:installer.ExitCode)" }
    return $script:installer.MainWindowHandle -ne [IntPtr]::Zero
  } 'installer window'
  $script:window = [Windows.Automation.AutomationElement]::FromHandle($script:installer.MainWindowHandle)
  Wait-For { (Get-DialogText) -match 'ABNER MUSIC / SETUP' } 'custom installation page'
  $dialog = [IntPtr]$script:window.Current.NativeWindowHandle
  Wait-For {
    $primary = [InstallerNative]::GetDlgItem($dialog, 1)
    $artwork = [InstallerNative]::GetDlgItem($primary, 4210)
    return $artwork -ne [IntPtr]::Zero -and
      [InstallerNative]::IsWindowVisible($artwork) -and
      [InstallerNative]::SendMessage($artwork, 0x0173, [IntPtr]::Zero, [IntPtr]::Zero) -ne [IntPtr]::Zero
  } 'painted installation button'
  if (([InstallerNative]::GetWindowLong($dialog, -16) -band 0x00C00000) -ne 0) {
    throw 'Installer still uses the default window title bar'
  }
  if ([InstallerNative]::IsWindowVisible([InstallerNative]::GetDlgItem($dialog, 3))) {
    throw 'Default Back button is visible'
  }
  $scale = [InstallerNative]::GetDpiForWindow($dialog) / 96.0
  $bounds = $script:window.Current.BoundingRectangle
  if ([Math]::Abs($bounds.Width / $scale - 800) -gt 2 -or [Math]::Abs($bounds.Height / $scale - 520) -gt 2) {
    throw "Unexpected custom window dimensions: $($bounds.Width) x $($bounds.Height), scale $scale"
  }
}

function Save-Dialog([string]$Name) {
  $bounds = $script:window.Current.BoundingRectangle
  $bitmap = [Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
    $bitmap.Save((Join-Path $evidence "$Name.png"), [Drawing.Imaging.ImageFormat]::Png)
    Get-DialogText | Set-Content (Join-Path $evidence "$Name.txt") -Encoding UTF8
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Assert-InstallerRendering([bool]$PrimaryVisible, [bool]$Repaint = $true) {
  $dialog = [IntPtr]$script:window.Current.NativeWindowHandle
  $scale = [InstallerNative]::GetDpiForWindow($dialog) / 96.0
  if ($Repaint) { [void][InstallerNative]::RedrawWindow($dialog, [IntPtr]::Zero, [IntPtr]::Zero, 0x185) }
  $bounds = $script:window.Current.BoundingRectangle
  $bitmap = [Drawing.Bitmap]::new([int]$bounds.Width, [int]$bounds.Height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
    $heading = 0
    for ($row = [int](106 * $scale); $row -lt [int](158 * $scale); $row++) {
      for ($column = [int](334 * $scale); $column -lt [int](752 * $scale); $column++) {
        $color = $bitmap.GetPixel($column, $row)
        if ($color.R -lt 150 -and $color.G -lt 160 -and $color.B -lt 150) { $heading++ }
      }
    }
    if ($heading -lt 100 * $scale * $scale) { throw 'Installer heading disappeared after repainting or editing the directory' }
    $green = 0
    $text = 0
    $total = 0
    for ($row = [int](444 * $scale); $row -lt [int](492 * $scale); $row++) {
      for ($column = [int](334 * $scale); $column -lt [int](752 * $scale); $column++) {
        $color = $bitmap.GetPixel($column, $row)
        $total++
        if ([Math]::Abs($color.R - 36) -lt 15 -and [Math]::Abs($color.G - 102) -lt 15 -and [Math]::Abs($color.B - 77) -lt 15) { $green++ }
        if ($column -gt 440 * $scale -and $column -lt 645 * $scale -and $row -gt 458 * $scale -and $row -lt 477 * $scale -and $color.R -gt 220 -and $color.G -gt 225 -and $color.B -gt 210) { $text++ }
      }
    }
    if ($PrimaryVisible) {
      if ($green -lt $total * 0.85 -or $text -lt 20 * $scale * $scale) {
        throw "Primary button is not painted: green=$green/$total, text=$text"
      }
      $corner = $bitmap.GetPixel([int](335 * $scale), [int](445 * $scale))
      if ($corner.R -lt 220 -or $corner.G -lt 225 -or $corner.B -lt 210) { throw 'Primary button has no rounded corner' }
    } else {
      if ($green -gt $total * 0.01) { throw 'Primary button remains visible during installation' }
      for ($offset = 12; $offset -lt 406; $offset++) {
        $color = $bitmap.GetPixel([int]((334 + $offset) * $scale), [int](491 * $scale))
        if ($color.R -lt 220 -or $color.G -lt 225 -or $color.B -lt 210) { throw 'Native button border remains visible during installation' }
      }
    }
    for ($offset = 2; $offset -lt 30; $offset++) {
      foreach ($point in @(@((748 + $offset), 21), @((748 + $offset), 50), @(749, (20 + $offset)), @(778, (20 + $offset)))) {
        $color = $bitmap.GetPixel([int]($point[0] * $scale), [int]($point[1] * $scale))
        if ($color.R -lt 220 -or $color.G -lt 225 -or $color.B -lt 210) { throw 'Close button has a native rectangular border' }
      }
    }
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Assert-DirectoryAlignment {
  $directoryControl = Get-Control '4201'
  $browseControl = Get-Control '4206'
  if (!$directoryControl -or !$browseControl) { throw 'Directory controls missing' }
  $directoryBounds = $directoryControl.Current.BoundingRectangle
  $browseBounds = $browseControl.Current.BoundingRectangle
  $formatting = [InstallerRectangle]::new()
  [void][InstallerNative]::ReadRectangle([IntPtr]$directoryControl.Current.NativeWindowHandle, 0x00B2, [IntPtr]::Zero, [ref]$formatting)
  $textCenter = $directoryBounds.Y + 1 + ($formatting.Top + $formatting.Bottom) / 2
  $browseCenter = $browseBounds.Y + $browseBounds.Height / 2
  if ([Math]::Abs($textCenter - $browseCenter) -gt 2) {
    throw "Directory text and Change link are misaligned: $textCenter vs $browseCenter"
  }
}

function Assert-BrandedIcon([string]$Filename) {
  $icon = [Drawing.Icon]::ExtractAssociatedIcon($Filename)
  if (!$icon) { throw "No icon in $Filename" }
  $bitmap = $icon.ToBitmap()
  try {
    $green = 0
    $cream = 0
    for ($row = 0; $row -lt $bitmap.Height; $row++) {
      for ($column = 0; $column -lt $bitmap.Width; $column++) {
        $color = $bitmap.GetPixel($column, $row)
        if ($color.A -lt 128) { continue }
        if ($color.R -lt 80 -and $color.G -gt 70 -and $color.B -lt 120) { $green++ }
        if ($color.R -gt 180 -and $color.G -gt 190 -and $color.B -gt 120 -and $color.B -lt 230) { $cream++ }
      }
    }
    $area = $bitmap.Width * $bitmap.Height
    if ($green -lt $area * 0.25 -or $cream -lt $area * 0.03) {
      throw "Expected Abner Music's green and cream icon in $Filename"
    }
  } finally {
    $bitmap.Dispose()
    $icon.Dispose()
  }
}

function Get-IconDigest([string]$Filename) {
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return [Convert]::ToBase64String($algorithm.ComputeHash([IO.File]::ReadAllBytes($Filename)))
  } finally {
    $algorithm.Dispose()
  }
}

function Resolve-InstallerPath([string]$Filename) {
  $buffer = [Text.StringBuilder]::new(32768)
  try {
    $fullPath = [IO.Path]::GetFullPath($Filename)
  } catch {
    throw "Invalid installed path: $($Filename | ConvertTo-Json -Compress); $($_.Exception.Message)"
  }
  $length = [InstallerNative]::GetLongPathName($fullPath, $buffer, $buffer.Capacity)
  if ($length -eq 0 -or $length -ge $buffer.Capacity) { throw "Cannot resolve installed path: $Filename" }
  return $buffer.ToString()
}

$installer = $null
try {
  Assert-BrandedIcon $artifact
  Open-Installer
  $dialog = [IntPtr]$script:window.Current.NativeWindowHandle
  [void][InstallerNative]::SendMessage([InstallerNative]::GetDlgItem($dialog, 1), 0x00F4, [IntPtr]1, [IntPtr]1)
  Assert-InstallerRendering $true
  Assert-DirectoryAlignment
  $cancelDirectory = Get-Control '4201'
  if (!$cancelDirectory) { throw 'Installation directory field missing before cancellation' }
  [void][InstallerNative]::SendText([IntPtr]$cancelDirectory.Current.NativeWindowHandle, 0x000C, [IntPtr]::Zero, $installation)
  if (Test-Path $executable) { throw 'Application was installed before confirmation' }
  Save-Dialog 'welcome'
  Assert-InstallerRendering $true $false
  $options = Get-Control '4202'
  if (!$options) { throw 'Installation options toggle missing' }
  $currentUser = Get-Control '4204'
  if ($currentUser -and !$currentUser.Current.IsOffscreen) { throw 'Installation options should initially be collapsed' }
  $optionsHandle = [IntPtr]$options.Current.NativeWindowHandle
  if ($optionsHandle -eq [IntPtr]::Zero) { throw 'Installation options control has no native handle' }
  [void][InstallerNative]::SetForegroundWindow([IntPtr]$script:window.Current.NativeWindowHandle)
  [void][InstallerNative]::SendMessage($optionsHandle, 0x0201, [IntPtr]1, [IntPtr]::Zero)
  [void][InstallerNative]::SendMessage($optionsHandle, 0x0202, [IntPtr]::Zero, [IntPtr]::Zero)
  Wait-For {
    $scopeControl = Get-Control '4204'
    return $scopeControl -and !$scopeControl.Current.IsOffscreen
  } 'installation options'
  if ((Get-Control '4205').Current.IsEnabled) { throw '/currentuser should lock the installation scope' }
  Save-Dialog 'options'
  Assert-InstallerRendering $true $false
  Invoke-InstallerButton 2
  if (!$installer.WaitForExit(20000)) { throw 'Installer did not exit after cancellation' }
  if (Test-Path $executable) { throw 'Cancelled installation wrote application files' }

  Open-Installer
  $directoryEdit = Get-Control '4201'
  if (!$directoryEdit -or !$directoryEdit.Current.IsEnabled -or $directoryEdit.Current.IsOffscreen) {
    throw "Installation directory field missing: $(Get-DialogText)"
  }
  $directoryHandle = [IntPtr]$directoryEdit.Current.NativeWindowHandle
  if ($directoryHandle -eq [IntPtr]::Zero) { throw 'Installation directory control has no native handle' }
  [void][InstallerNative]::SendText($directoryHandle, 0x000C, [IntPtr]::Zero, 'relative-folder')
  Invoke-Next
  Wait-For { (Get-DialogText) -match 'Choose a valid app folder|\u8bf7\u9009\u62e9\u6709\u6548' } 'invalid directory rejection'
  Assert-InstallerRendering $true
  Save-Dialog 'invalid-directory'
  Assert-InstallerRendering $true $false
  $occupied = Join-Path $directory 'existing-files'
  New-Item $occupied -ItemType Directory | Out-Null
  Set-Content (Join-Path $occupied 'keep.txt') 'Keep this file'
  [void][InstallerNative]::SendText($directoryHandle, 0x000C, [IntPtr]::Zero, $occupied)
  Invoke-Next
  Wait-For { (Get-DialogText) -match 'Choose an empty folder|\u8bf7\u9009\u62e9\u7a7a\u6587\u4ef6\u5939' } 'occupied directory rejection'
  if (!(Test-Path (Join-Path $occupied 'keep.txt'))) { throw 'Directory validation changed existing files' }
  [void][InstallerNative]::SendText($directoryHandle, 0x000C, [IntPtr]::Zero, $installation)
  Save-Dialog 'directory'
  Assert-InstallerRendering $true $false
  if (Test-Path $executable) { throw 'Application was installed before clicking Install' }
  Invoke-Next
  Wait-For { (Get-DialogText) -match 'Installing Abner Music|\u6b63\u5728\u5b89\u88c5 Abner Music|ABNER MUSIC / READY' } 'installation progress' 180
  if ((Get-DialogText) -notmatch 'ABNER MUSIC / READY') {
    Save-Dialog 'progress'
    Assert-InstallerRendering $false $false
  }
  Wait-For { (Get-DialogText) -match 'ABNER MUSIC / READY' } 'finish page' 180
  Save-Dialog 'finish'
  Assert-InstallerRendering $true $false
  Invoke-Next
  if (!$installer.WaitForExit(20000)) { throw 'Installer did not exit after Finish' }
  if ($installer.ExitCode -ne 0) { throw "Installer exit code: $($installer.ExitCode)" }
  if (!(Test-Path $executable)) { throw 'Application executable missing after installation' }
  $launched = Get-CimInstance Win32_Process -Filter "Name='abner-music.exe'" |
    Where-Object { $_.ExecutablePath -eq $executable }
  if ($launched) { throw 'The installer unexpectedly launched the application' }

  $entry = Get-ItemProperty $registryPaths -ErrorAction SilentlyContinue |
    Where-Object {
      $_.DisplayName -eq 'Abner Music' -and
      $_.UninstallString -and
      $_.UninstallString.StartsWith('"' + $uninstaller + '"', [StringComparison]::OrdinalIgnoreCase)
    }
  if (@($entry).Count -ne 1) { throw 'Installed Apps registry entry missing or duplicated' }
  $displayIcon = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
  if (!(Test-Path $displayIcon)) { throw "Installed Apps icon missing: $displayIcon" }
  if ((Get-IconDigest $displayIcon) -ne (Get-IconDigest (Join-Path $project 'build/icon.ico'))) {
    throw 'Installed Apps does not use the application icon'
  }
  Assert-BrandedIcon $executable
  Assert-BrandedIcon $uninstaller
  foreach ($shortcut in @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Abner Music.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Abner Music.lnk')
  )) {
    if (!(Test-Path $shortcut)) { throw "Shortcut missing: $shortcut" }
    Copy-Item $shortcut (Join-Path $evidence "$([IO.Path]::GetFileName([IO.Path]::GetDirectoryName($shortcut))).lnk")
    $shortcutTarget = [InstallerNative]::GetShortcutTarget($shortcut)
    Write-Host "Shortcut target: $($shortcutTarget | ConvertTo-Json -Compress); expected: $($executable | ConvertTo-Json -Compress)"
    if ((Resolve-InstallerPath $shortcutTarget) -ne (Resolve-InstallerPath $executable)) {
      throw "Wrong shortcut target: $shortcut; actual: $shortcutTarget; expected: $executable"
    }
  }
  & node (Join-Path $PSScriptRoot 'smoke.mjs') "--arch=$Architecture" "--executable=$executable"
  if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed' }
  Write-Host 'Windows installer passed: painted rounded buttons, borderless close control, aligned directory controls, real mouse clicks, custom borderless UI, cancellation, options, directory validation, Unicode paths, progress/finish, no automatic launch, icons, shortcuts and installed application smoke.'
} catch {
  if ($script:window) {
    try { Save-Dialog 'failure' } catch { Write-Warning 'Unable to capture the failed installer dialog' }
  }
  throw
} finally {
  if ($installer -and !$installer.HasExited) { Stop-Process -Id $installer.Id -Force }
  if (Test-Path $uninstaller) {
    Start-Process $uninstaller -ArgumentList '/S /currentuser' -Wait
    Wait-For { !(Test-Path $executable) } 'test application uninstall'
  }
  if (Test-Path $directory) { Remove-Item $directory -Recurse -Force }
}
