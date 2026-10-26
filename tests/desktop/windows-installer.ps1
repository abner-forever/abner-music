param([string]$Architecture = 'x64')

$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Installer verification requires Windows' }
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class InstallerNative {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDlgItem(IntPtr dialog, int identifier);

  [DllImport("user32.dll")]
  public static extern bool IsWindowEnabled(IntPtr window);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr parameter, IntPtr value);

  [DllImport("user32.dll", EntryPoint = "SendMessageW", CharSet = CharSet.Unicode)]
  public static extern IntPtr SendText(IntPtr window, uint message, IntPtr parameter, string value);
}
'@

$package = Get-Content (Join-Path $PSScriptRoot '../../package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$project = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$artifact = Join-Path $project "out/make/Abner-Music-$($package.version)-windows-$Architecture.exe"
$evidence = Join-Path $project 'test-results/windows-installer'
$directory = Join-Path ([IO.Path]::GetTempPath()) "abner-install-$([guid]::NewGuid())"
$installation = Join-Path $directory 'abner-music'
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
  throw "Timed out: $Description"
}

function Get-DialogText {
  $controls = $script:window.FindAll(
    [Windows.Automation.TreeScope]::Descendants,
    [Windows.Automation.Condition]::TrueCondition
  )
  return ($controls | ForEach-Object { $_.Current.Name }) -join "`n"
}

function Invoke-Next {
  $dialog = [IntPtr]$script:window.Current.NativeWindowHandle
  $button = [InstallerNative]::GetDlgItem($dialog, 1)
  if ($button -eq [IntPtr]::Zero -or ![InstallerNative]::IsWindowEnabled($button)) {
    throw "Wizard button unavailable: $(Get-DialogText)"
  }
  [void][InstallerNative]::SetForegroundWindow($dialog)
  [void][InstallerNative]::SendMessage($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
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

$installer = $null
try {
  Assert-BrandedIcon $artifact
  $installer = Start-Process $artifact -ArgumentList @('/currentuser', "/D=$installation") -PassThru
  Wait-For {
    $installer.Refresh()
    if ($installer.HasExited) { throw "Installer exited before showing the wizard: $($installer.ExitCode)" }
    return $installer.MainWindowHandle -ne [IntPtr]::Zero
  } 'installer window'
  $script:window = [Windows.Automation.AutomationElement]::FromHandle($installer.MainWindowHandle)
  Wait-For { (Get-DialogText) -match '\u6b22\u8fce\u5b89\u88c5 Abner Music' } 'welcome page'
  if (Test-Path $executable) { throw 'Application was installed before confirmation' }
  Save-Dialog 'welcome'

  $directoryEdit = $null
  for ($page = 0; $page -lt 4; $page++) {
    Invoke-Next
    Start-Sleep -Milliseconds 400
    $directoryEdit = $script:window.FindFirst(
      [Windows.Automation.TreeScope]::Descendants,
      [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::AutomationIdProperty, '1019')
    )
    if ($directoryEdit -and $directoryEdit.Current.IsEnabled -and !$directoryEdit.Current.IsOffscreen) { break }
  }
  if (!$directoryEdit -or !$directoryEdit.Current.IsEnabled -or $directoryEdit.Current.IsOffscreen) {
    throw "Installation directory page missing: $(Get-DialogText)"
  }
  $directoryHandle = [IntPtr]$directoryEdit.Current.NativeWindowHandle
  if ($directoryHandle -eq [IntPtr]::Zero) { throw 'Installation directory control has no native handle' }
  [void][InstallerNative]::SendText($directoryHandle, 0x000C, [IntPtr]::Zero, $installation)
  Save-Dialog 'directory'
  if (Test-Path $executable) { throw 'Application was installed before clicking Install' }
  Invoke-Next
  Wait-For { (Get-DialogText) -match 'Abner Music \u5b89\u88c5\u5b8c\u6210' } 'finish page' 180
  Save-Dialog 'finish'
  Invoke-Next
  if (!$installer.WaitForExit(20000)) { throw 'Installer did not exit after Finish' }
  if ($installer.ExitCode -ne 0) { throw "Installer exit code: $($installer.ExitCode)" }
  if (!(Test-Path $executable)) { throw 'Application executable missing after installation' }
  $launched = Get-CimInstance Win32_Process -Filter "Name='abner-music.exe'" |
    Where-Object { $_.ExecutablePath -eq $executable }
  if ($launched) { throw 'The installer unexpectedly launched the application' }

  $entry = Get-ItemProperty $registryPaths -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -eq 'Abner Music' -and $_.InstallLocation.TrimEnd('\') -eq $installation }
  if (@($entry).Count -ne 1) { throw 'Installed Apps registry entry missing or duplicated' }
  $displayIcon = ($entry.DisplayIcon -replace ',\d+$', '').Trim('"')
  if (!(Test-Path $displayIcon)) { throw "Installed Apps icon missing: $displayIcon" }
  if ((Get-FileHash $displayIcon).Hash -ne (Get-FileHash (Join-Path $project 'build/icon.ico')).Hash) {
    throw 'Installed Apps does not use the application icon'
  }
  Assert-BrandedIcon $executable
  Assert-BrandedIcon $uninstaller
  $shell = New-Object -ComObject WScript.Shell
  foreach ($shortcut in @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Abner Music.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Abner Music.lnk')
  )) {
    if (!(Test-Path $shortcut)) { throw "Shortcut missing: $shortcut" }
    if ($shell.CreateShortcut($shortcut).TargetPath -ne $executable) { throw "Wrong shortcut target: $shortcut" }
  }
  & node (Join-Path $PSScriptRoot 'smoke.mjs') "--arch=$Architecture" "--executable=$executable"
  if ($LASTEXITCODE -ne 0) { throw 'Installed application smoke test failed' }
  Write-Host 'Windows installer passed: interactive welcome/directory/finish, no automatic launch, EXE/uninstaller/Installed Apps icons, shortcuts and installed application smoke.'
} finally {
  if ($installer -and !$installer.HasExited) { Stop-Process -Id $installer.Id -Force }
  if (Test-Path $uninstaller) {
    Start-Process $uninstaller -ArgumentList '/S /currentuser' -Wait
    Wait-For { !(Test-Path $executable) } 'test application uninstall'
  }
  if (Test-Path $directory) { Remove-Item $directory -Recurse -Force }
}
