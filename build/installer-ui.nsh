!include nsDialogs.nsh
!include WinMessages.nsh
!insertmacro MUI_INSTFILESPAGE_INTERFACE

Var AbnerDpi
Var AbnerPage
Var AbnerNext
Var AbnerCancel
Var AbnerBackground
Var AbnerBackgroundImage
Var AbnerButtonImage
Var AbnerCloseImage
Var AbnerNextArtwork
Var AbnerCancelArtwork
Var AbnerHeadingFont
Var AbnerBodyFont
Var AbnerSmallFont
Var AbnerDirectory
Var AbnerBrowseButton
Var AbnerSelectedDirectory
Var AbnerError
Var AbnerOptions
Var AbnerCurrentUser
Var AbnerAllUsers
Var AbnerOptionsOpen
Var AbnerInstalling
Var AbnerLanguage
Var AbnerProgressTitle
Var AbnerProgressDescription

!macro AbnerMove CONTROL LEFT TOP WIDTH HEIGHT
  Push $R4
  StrCpy $R4 ${CONTROL}
  Push $0
  Push $1
  Push $2
  Push $3
  IntOp $0 ${LEFT} * $AbnerDpi
  IntOp $0 $0 / 96
  IntOp $1 ${TOP} * $AbnerDpi
  IntOp $1 $1 / 96
  IntOp $2 ${WIDTH} * $AbnerDpi
  IntOp $2 $2 / 96
  IntOp $3 ${HEIGHT} * $AbnerDpi
  IntOp $3 $3 / 96
  System::Call 'user32::MoveWindow(p R4, i r0, i r1, i r2, i r3, i 1)'
  Pop $3
  Pop $2
  Pop $1
  Pop $0
  Pop $R4
!macroend

!macro AbnerLabel TEXT TOP HEIGHT FONT COLOR
  ${NSD_CreateLabel} 0 0 100% 12 "${TEXT}"
  Pop $0
  !insertmacro AbnerMove $0 0 ${TOP} 418 ${HEIGHT}
  SendMessage $0 ${WM_SETFONT} ${FONT} 0
  SetCtlColors $0 ${COLOR} F6F7EE
!macroend

!macro AbnerText OUTPUT CHINESE ENGLISH
  StrCpy ${OUTPUT} "${ENGLISH}"
  ${If} $AbnerLanguage == "zh"
    StrCpy ${OUTPUT} "${CHINESE}"
  ${EndIf}
!macroend

!macro AbnerArtwork CONTROL ARTWORK IMAGE FILE WIDTH HEIGHT
  Push $0
  Push $1
  Push $2
  IntOp $0 ${WIDTH} * $AbnerDpi
  IntOp $0 $0 / 96
  IntOp $1 ${HEIGHT} * $AbnerDpi
  IntOp $1 $1 / 96
  System::Call 'user32::LoadImage(p 0, t "${FILE}", i 0, i r0, i r1, i 0x10) p.r2'
  ${If} $2 P<> 0
    !insertmacro AbnerMove ${ARTWORK} 0 0 ${WIDTH} ${HEIGHT}
    SendMessage ${ARTWORK} ${STM_SETIMAGE} ${IMAGE_BITMAP} $2
    ${NSD_FreeImage} ${IMAGE}
    StrCpy ${IMAGE} $2
    ShowWindow ${ARTWORK} ${SW_SHOW}
  ${Else}
    ShowWindow ${ARTWORK} ${SW_HIDE}
  ${EndIf}
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro AbnerPageStart
  nsDialogs::Create 1018
  Pop $AbnerPage
  ${If} $AbnerPage == error
    Quit
  ${EndIf}
  SetCtlColors $AbnerPage 203D2E F6F7EE
  SendMessage $AbnerPage ${WM_SETFONT} $AbnerBodyFont 0
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  !insertmacro AbnerMove $AbnerPage 334 72 418 348
  !insertmacro AbnerMove $AbnerNext 334 444 418 48
  !insertmacro AbnerMove $AbnerCancel 748 20 32 32
!macroend

Function AbnerGuiInit
  InitPluginsDir
  SetAutoClose true
  File /oname=$PLUGINSDIR\abner-background.bmp "${BUILD_RESOURCES_DIR}\installer-background.bmp"
  File /oname=$PLUGINSDIR\abner-close.bmp "${BUILD_RESOURCES_DIR}\installer-close.bmp"
  File /oname=$PLUGINSDIR\abner-install-zh.bmp "${BUILD_RESOURCES_DIR}\installer-install-zh.bmp"
  File /oname=$PLUGINSDIR\abner-install-en.bmp "${BUILD_RESOURCES_DIR}\installer-install-en.bmp"
  File /oname=$PLUGINSDIR\abner-finish-zh.bmp "${BUILD_RESOURCES_DIR}\installer-finish-zh.bmp"
  File /oname=$PLUGINSDIR\abner-finish-en.bmp "${BUILD_RESOURCES_DIR}\installer-finish-en.bmp"
  File /oname=$PLUGINSDIR\abner-close-zh.bmp "${BUILD_RESOURCES_DIR}\installer-close-zh.bmp"
  File /oname=$PLUGINSDIR\abner-close-en.bmp "${BUILD_RESOURCES_DIR}\installer-close-en.bmp"
  StrCpy $AbnerLanguage en
  ${If} $LANGUAGE == 2052
    StrCpy $AbnerLanguage zh
  ${EndIf}
  StrCpy $AbnerInstalling 0
  System::Call 'user32::GetDC(p $HWNDPARENT) p.r0'
  System::Call 'gdi32::GetDeviceCaps(p r0, i 88) i.s'
  Pop $AbnerDpi
  System::Call 'user32::ReleaseDC(p $HWNDPARENT, p r0)'
  CreateFont $AbnerHeadingFont "Microsoft YaHei UI" 21 700
  CreateFont $AbnerBodyFont "Microsoft YaHei UI" 10
  CreateFont $AbnerSmallFont "Microsoft YaHei UI" 9
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i -16) i.r0'
  IntOp $0 $0 & 0xFF3BFFFF
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, i -16, i r0)'
  System::Call 'user32::GetWindowLong(p $HWNDPARENT, i -20) i.r0'
  IntOp $0 $0 & 0xFFFDFCFE
  System::Call 'user32::SetWindowLong(p $HWNDPARENT, i -20, i r0)'
  !insertmacro AbnerMove $HWNDPARENT 0 0 800 520
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i 0, i 0, i 0, i 0, i 0x37)'
  System::Call 'user32::GetWindow(p $HWNDPARENT, i 5) p.r0'
  ${DoWhile} $0 P<> 0
    ShowWindow $0 ${SW_HIDE}
    System::Call 'user32::GetWindow(p r0, i 2) p.r0'
  ${Loop}
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x5000000E, i 0, i 0, i 0, i 0, p $HWNDPARENT, p 0, p 0, p 0) p.s'
  Pop $AbnerBackground
  !insertmacro AbnerMove $AbnerBackground 0 0 800 520
  ${NSD_SetStretchedImage} $AbnerBackground "$PLUGINSDIR\abner-background.bmp" $AbnerBackgroundImage
  System::Call 'user32::SetWindowPos(p $AbnerBackground, p 1, i 0, i 0, i 0, i 0, i 0x13)'
  GetDlgItem $AbnerNext $HWNDPARENT 1
  GetDlgItem $AbnerCancel $HWNDPARENT 2
  System::Call 'uxtheme::SetWindowTheme(p $AbnerNext, w "", w "")'
  System::Call 'uxtheme::SetWindowTheme(p $AbnerCancel, w "", w "")'
  System::Call 'user32::GetWindowLong(p $AbnerNext, i -16) i.r0'
  IntOp $0 $0 | ${WS_CLIPCHILDREN}
  System::Call 'user32::SetWindowLong(p $AbnerNext, i -16, i r0)'
  System::Call 'user32::GetWindowLong(p $AbnerCancel, i -16) i.r0'
  IntOp $0 $0 | ${WS_CLIPCHILDREN}
  System::Call 'user32::SetWindowLong(p $AbnerCancel, i -16, i r0)'
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x5000000E, i 0, i 0, i 0, i 0, p $AbnerNext, p 4210, p 0, p 0) p.s'
  Pop $AbnerNextArtwork
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x5000000E, i 0, i 0, i 0, i 0, p $AbnerCancel, p 4211, p 0, p 0) p.s'
  Pop $AbnerCancelArtwork
  !insertmacro AbnerArtwork $AbnerCancel $AbnerCancelArtwork $AbnerCloseImage "$PLUGINSDIR\abner-close.bmp" 32 32
  !insertmacro AbnerText $1 "关闭" "Close"
  SendMessage $AbnerCancel ${WM_SETTEXT} 0 "STR:$1"
  !insertmacro AbnerMove $AbnerCancel 748 20 32 32
  ShowWindow $AbnerCancel ${SW_SHOW}
  IntOp $0 800 * $AbnerDpi
  IntOp $0 $0 / 96
  IntOp $1 520 * $AbnerDpi
  IntOp $1 $1 / 96
  IntOp $2 20 * $AbnerDpi
  IntOp $2 $2 / 96
  System::Call 'gdi32::CreateRoundRectRgn(i 0, i 0, i r0, i r1, i r2, i r2) p.r3'
  System::Call 'user32::SetWindowRgn(p $HWNDPARENT, p r3, i 1)'
  System::Call 'user32::GetSystemMetrics(i 0) i.r2'
  System::Call 'user32::GetSystemMetrics(i 1) i.r3'
  IntOp $2 $2 - $0
  IntOp $2 $2 / 2
  IntOp $3 $3 - $1
  IntOp $3 $3 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r2, i r3, i 0, i 0, i 0x15)'
FunctionEnd

Function AbnerSetPrimary
  Exch $4
  Push $0
  Push $1
  Push $2
  !insertmacro AbnerMove $AbnerNext 334 444 418 48
  !insertmacro AbnerArtwork $AbnerNext $AbnerNextArtwork $AbnerButtonImage "$PLUGINSDIR\abner-$4-$AbnerLanguage.bmp" 418 48
  IntOp $0 418 * $AbnerDpi
  IntOp $0 $0 / 96
  IntOp $1 48 * $AbnerDpi
  IntOp $1 $1 / 96
  IntOp $2 16 * $AbnerDpi
  IntOp $2 $2 / 96
  System::Call 'gdi32::CreateRoundRectRgn(i 0, i 0, i r0, i r1, i r2, i r2) p.r0'
  System::Call 'user32::SetWindowRgn(p $AbnerNext, p r0, i 1)'
  !insertmacro AbnerMove $AbnerNext 334 444 418 48
  ShowWindow $AbnerNext ${SW_SHOW}
  Pop $2
  Pop $1
  Pop $0
  Pop $4
FunctionEnd

Function AbnerAlignDirectory
  System::Call 'user32::GetDC(p $AbnerDirectory) p.r0'
  System::Call 'gdi32::SelectObject(p r0, p $AbnerSmallFont) p.r1'
  System::Alloc 8
  Pop $2
  System::Call 'gdi32::GetTextExtentPoint32W(p r0, w "Ag", i 2, p r2)'
  System::Call '*$2(i, i .r3)'
  System::Free $2
  System::Call 'gdi32::SelectObject(p r0, p r1)'
  System::Call 'user32::ReleaseDC(p $AbnerDirectory, p r0)'
  System::Alloc 16
  Pop $2
  System::Call 'user32::GetClientRect(p $AbnerDirectory, p r2)'
  System::Call '*$2(i, i, i .r0, i .r1)'
  IntOp $1 $1 - $3
  IntOp $1 $1 / 2
  IntOp $4 10 * $AbnerDpi
  IntOp $4 $4 / 96
  IntOp $0 $0 - $4
  IntOp $5 $1 + $3
  System::Call '*$2(i r4, i r1, i r0, i r5)'
  SendMessage $AbnerDirectory ${EM_SETRECT} 0 $2
  System::Free $2
  IntOp $0 364 * $AbnerDpi
  IntOp $0 $0 / 96
  IntOp $2 190 * $AbnerDpi
  IntOp $2 $2 / 96
  IntOp $1 $1 + $2
  IntOp $1 $1 + 1
  IntOp $2 54 * $AbnerDpi
  IntOp $2 $2 / 96
  System::Call 'user32::MoveWindow(p $AbnerBrowseButton, i r0, i r1, i r2, i r3, i 1)'
FunctionEnd

Function AbnerReadOuterDirectory
  StrCpy $INSTDIR $AbnerSelectedDirectory
FunctionEnd

Function AbnerWelcome
  ${If} ${UAC_IsInnerInstance}
  ${AndIf} ${UAC_IsAdmin}
    !insertmacro setInstallModePerAllUsers
    !insertmacro UAC_AsUser_Call Function AbnerReadOuterDirectory ${UAC_SYNCINSTDIR}
    StrCpy $AbnerSelectedDirectory $INSTDIR
    Abort
  ${EndIf}
  !insertmacro AbnerPageStart
  !insertmacro AbnerLabel "ABNER MUSIC / SETUP" 0 20 $AbnerSmallFont 71816C
  !insertmacro AbnerText $1 "音乐，自在发生。" "Make room for music."
  !insertmacro AbnerLabel "$1" 34 44 $AbnerHeadingFont 203D2E
  !insertmacro AbnerText $1 "把喜欢的声音，放进自己的音乐空间。$\r$\n本地音乐与网络音频，在这里相遇。" "A little space for the music you love.$\r$\nYour local library and online audio, together."
  !insertmacro AbnerLabel "$1" 92 56 $AbnerBodyFont 71816C
  !insertmacro AbnerText $1 "安装位置" "INSTALL LOCATION"
  !insertmacro AbnerLabel "$1" 164 20 $AbnerSmallFont 71816C
  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${WS_BORDER}|${ES_AUTOHSCROLL}|${ES_MULTILINE} 0 0 0 100% 30 "$INSTDIR"
  Pop $AbnerDirectory
  System::Call 'user32::SetWindowLong(p $AbnerDirectory, i -12, i 4201)'
  !insertmacro AbnerMove $AbnerDirectory 0 190 356 30
  SendMessage $AbnerDirectory ${WM_SETFONT} $AbnerSmallFont 0
  SetCtlColors $AbnerDirectory 203D2E FFFFFA
  !insertmacro AbnerText $1 "更改" "Change"
  ${NSD_CreateLink} 0 0 54 30 "$1"
  Pop $AbnerBrowseButton
  System::Call 'user32::SetWindowLong(p $AbnerBrowseButton, i -12, i 4206)'
  SendMessage $AbnerBrowseButton ${WM_SETFONT} $AbnerSmallFont 0
  SetCtlColors $AbnerBrowseButton 24664D F6F7EE
  ${NSD_OnClick} $AbnerBrowseButton AbnerBrowse
  Call AbnerAlignDirectory
  !insertmacro AbnerText $1 "安装选项 +" "Installation options +"
  ${NSD_CreateLink} 0 0 100% 24 "$1"
  Pop $AbnerOptions
  SendMessage $AbnerOptions ${WM_SETFONT} $AbnerSmallFont 0
  !insertmacro AbnerMove $AbnerOptions 0 232 418 24
  SetCtlColors $AbnerOptions 24664D F6F7EE
  System::Call 'user32::SetWindowLong(p $AbnerOptions, i -12, i 4202)'
  ${NSD_OnClick} $AbnerOptions AbnerToggleOptions
  !insertmacro AbnerText $1 "仅为我安装" "Only for me"
  ${NSD_CreateRadioButton} 0 0 100% 22 "$1"
  Pop $AbnerCurrentUser
  System::Call 'user32::SetWindowLong(p $AbnerCurrentUser, i -12, i 4204)'
  SendMessage $AbnerCurrentUser ${WM_SETFONT} $AbnerSmallFont 0
  !insertmacro AbnerMove $AbnerCurrentUser 0 264 418 22
  SetCtlColors $AbnerCurrentUser 203D2E F6F7EE
  ${NSD_OnClick} $AbnerCurrentUser AbnerScopeChanged
  !insertmacro AbnerText $1 "为所有用户安装（需要管理员权限）" "For everyone (requires administrator access)"
  ${NSD_CreateRadioButton} 0 0 100% 22 "$1"
  Pop $AbnerAllUsers
  System::Call 'user32::SetWindowLong(p $AbnerAllUsers, i -12, i 4205)'
  SendMessage $AbnerAllUsers ${WM_SETFONT} $AbnerSmallFont 0
  !insertmacro AbnerMove $AbnerAllUsers 0 290 418 22
  SetCtlColors $AbnerAllUsers 203D2E F6F7EE
  ${NSD_OnClick} $AbnerAllUsers AbnerScopeChanged
  ${If} $installMode == all
    ${NSD_Check} $AbnerAllUsers
  ${Else}
    ${NSD_Check} $AbnerCurrentUser
  ${EndIf}
  ${If} ${isForCurrentUser}
    EnableWindow $AbnerAllUsers 0
  ${EndIf}
  ${If} ${isForAllUsers}
    EnableWindow $AbnerCurrentUser 0
  ${EndIf}
  StrCpy $AbnerOptionsOpen 0
  ShowWindow $AbnerCurrentUser ${SW_HIDE}
  ShowWindow $AbnerAllUsers ${SW_HIDE}
  !insertmacro AbnerLabel "" 316 32 $AbnerSmallFont A23D35
  StrCpy $AbnerError $0
  System::Call 'user32::SetWindowLong(p $AbnerError, i -12, i 4203)'
  !insertmacro AbnerText $1 "开始安装" "Install Abner Music"
  SendMessage $AbnerNext ${WM_SETTEXT} 0 "STR:$1"
  Push install
  Call AbnerSetPrimary
  nsDialogs::Show
FunctionEnd

Function AbnerBrowse
  Pop $0
  ${NSD_GetText} $AbnerDirectory $1
  !insertmacro AbnerText $2 "选择 Abner Music 的安装文件夹" "Choose a folder for Abner Music"
  nsDialogs::SelectFolderDialog "$2" "$1"
  Pop $0
  ${If} $0 != error
    ${GetFileName} "$0" $1
    ${If} $1 != "${APP_FILENAME}"
      StrCpy $0 "$0\${APP_FILENAME}"
    ${EndIf}
    ${NSD_SetText} $AbnerDirectory "$0"
  ${EndIf}
FunctionEnd

Function AbnerToggleOptions
  Pop $0
  ${If} $AbnerOptionsOpen == 0
    StrCpy $AbnerOptionsOpen 1
    ShowWindow $AbnerCurrentUser ${SW_SHOW}
    ShowWindow $AbnerAllUsers ${SW_SHOW}
    !insertmacro AbnerText $1 "收起安装选项 −" "Hide installation options −"
  ${Else}
    StrCpy $AbnerOptionsOpen 0
    ShowWindow $AbnerCurrentUser ${SW_HIDE}
    ShowWindow $AbnerAllUsers ${SW_HIDE}
    !insertmacro AbnerText $1 "安装选项 +" "Installation options +"
  ${EndIf}
  ${NSD_SetText} $AbnerOptions "$1"
  System::Call 'user32::RedrawWindow(p $AbnerPage, p 0, p 0, i 0x185)'
FunctionEnd

Function AbnerScopeChanged
  Pop $0
  StrCpy $2 $INSTDIR
  ${NSD_GetText} $AbnerDirectory $3
  ${NSD_GetState} $AbnerAllUsers $1
  ${If} $1 == ${BST_CHECKED}
    !insertmacro setInstallModePerAllUsers
  ${Else}
    !insertmacro setInstallModePerUser
  ${EndIf}
  ${If} $3 == $2
    ${NSD_SetText} $AbnerDirectory "$INSTDIR"
  ${EndIf}
FunctionEnd

Function AbnerWelcomeLeave
  ${NSD_GetText} $AbnerDirectory $AbnerSelectedDirectory
  System::Call 'shlwapi::PathIsRelative(w "$AbnerSelectedDirectory") i.r0'
  ${If} $0 != 0
    Goto invalidDirectory
  ${EndIf}
  System::Call 'shlwapi::PathIsRoot(w "$AbnerSelectedDirectory") i.r0'
  ${If} $0 != 0
    Goto invalidDirectory
  ${EndIf}
  ${If} $AbnerSelectedDirectory == ""
    Goto invalidDirectory
  ${EndIf}
  System::Call 'kernel32::GetFullPathNameW(w "$AbnerSelectedDirectory", i ${NSIS_MAX_STRLEN}, w .r1, p 0) i.r0'
  ${If} $0 == 0
  ${OrIf} $0 >= ${NSIS_MAX_STRLEN}
    Goto invalidDirectory
  ${EndIf}
  StrCpy $AbnerSelectedDirectory $1
  System::Call 'shlwapi::PathIsRoot(w "$AbnerSelectedDirectory") i.r0'
  ${If} $0 != 0
    Goto invalidDirectory
  ${EndIf}
  ${If} $AbnerSelectedDirectory == $WINDIR
  ${OrIf} $AbnerSelectedDirectory == $SYSDIR
  ${OrIf} $AbnerSelectedDirectory == $PROFILE
  ${OrIf} $AbnerSelectedDirectory == $PROGRAMFILES
  ${OrIf} $AbnerSelectedDirectory == $PROGRAMFILES64
    Goto invalidDirectory
  ${EndIf}
  ${If} ${FileExists} "$AbnerSelectedDirectory\*.*"
    ${IfNot} ${FileExists} "$AbnerSelectedDirectory\${APP_EXECUTABLE_FILENAME}"
      System::Call 'shlwapi::PathIsDirectoryEmpty(w "$AbnerSelectedDirectory") i.r0'
      ${If} $0 == 0
        !insertmacro AbnerText $1 "请选择空文件夹，或已安装 Abner Music 的文件夹。" "Choose an empty folder or an existing Abner Music installation."
        Goto showDirectoryError
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ${NSD_GetState} $AbnerAllUsers $0
  ${If} $0 == ${BST_CHECKED}
    ${IfNot} ${UAC_IsAdmin}
      ShowWindow $HWNDPARENT ${SW_HIDE}
      !insertmacro UAC_RunElevated
      ${If} $0 == 0
      ${AndIf} $1 == 1
        Quit
      ${EndIf}
      ShowWindow $HWNDPARENT ${SW_SHOW}
      BringToFront
      !insertmacro AbnerText $1 "需要管理员授权才能为所有用户安装。你可以重试或改为仅为我安装。" "Administrator approval is required. Retry or choose Only for me."
      ${NSD_SetText} $AbnerError "$1"
      Abort
    ${EndIf}
    !insertmacro setInstallModePerAllUsers
  ${Else}
    !insertmacro setInstallModePerUser
  ${EndIf}
  StrCpy $INSTDIR $AbnerSelectedDirectory
  Return
  invalidDirectory:
    !insertmacro AbnerText $1 "请选择有效的安装文件夹，请勿选择磁盘根目录或系统目录。" "Choose a valid app folder, outside drive roots and system folders."
  showDirectoryError:
    ${NSD_SetText} $AbnerError "$1"
    Abort
FunctionEnd

Function AbnerProgressPre
  ${If} $AbnerSelectedDirectory != ""
    StrCpy $INSTDIR $AbnerSelectedDirectory
  ${EndIf}
FunctionEnd

Function AbnerProgressShow
  StrCpy $AbnerInstalling 1
  !insertmacro AbnerMove $mui.InstFilesPage 334 72 418 348
  SetCtlColors $mui.InstFilesPage 203D2E F6F7EE
  System::Call 'user32::GetWindow(p $mui.InstFilesPage, i 5) p.r0'
  ${DoWhile} $0 P<> 0
    ShowWindow $0 ${SW_HIDE}
    System::Call 'user32::GetWindow(p r0, i 2) p.r0'
  ${Loop}
  !insertmacro AbnerText $1 "正在安装 Abner Music" "Installing Abner Music"
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t r1, i 0x50000000, i 0, i 0, i 0, i 0, p $mui.InstFilesPage, p 0, p 0, p 0) p.s'
  Pop $AbnerProgressTitle
  !insertmacro AbnerMove $AbnerProgressTitle 0 34 418 44
  SendMessage $AbnerProgressTitle ${WM_SETFONT} $AbnerHeadingFont 0
  SetCtlColors $AbnerProgressTitle 203D2E F6F7EE
  !insertmacro AbnerText $1 "正在准备你的音乐空间。$\r$\n安装完成前，请保持此窗口打开。" "Preparing your space for music.$\r$\nPlease keep this window open until installation finishes."
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t r1, i 0x50000000, i 0, i 0, i 0, i 0, p $mui.InstFilesPage, p 0, p 0, p 0) p.s'
  Pop $AbnerProgressDescription
  !insertmacro AbnerMove $AbnerProgressDescription 0 92 418 64
  SendMessage $AbnerProgressDescription ${WM_SETFONT} $AbnerBodyFont 0
  SetCtlColors $AbnerProgressDescription 71816C F6F7EE
  !insertmacro AbnerMove $mui.InstFilesPage.ProgressBar 0 190 418 8
  System::Call 'uxtheme::SetWindowTheme(p $mui.InstFilesPage.ProgressBar, w "", w "")'
  SendMessage $mui.InstFilesPage.ProgressBar 0x409 0 0x4D6624
  SendMessage $mui.InstFilesPage.ProgressBar 0x2001 0 0xDDE4D6
  ShowWindow $mui.InstFilesPage.ProgressBar ${SW_SHOW}
  !insertmacro AbnerMove $mui.InstFilesPage.Text 0 218 418 56
  SendMessage $mui.InstFilesPage.Text ${WM_SETFONT} $AbnerSmallFont 0
  SetCtlColors $mui.InstFilesPage.Text 71816C F6F7EE
  ShowWindow $mui.InstFilesPage.Text ${SW_SHOW}
  ShowWindow $AbnerNext ${SW_HIDE}
  System::Call 'gdi32::CreateRectRgn(i 0, i 0, i 0, i 0) p.r0'
  System::Call 'user32::SetWindowRgn(p $AbnerNext, p r0, i 1)'
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  EnableWindow $AbnerCancel 0
FunctionEnd

Function AbnerProgressLeave
  StrCpy $AbnerInstalling 0
  EnableWindow $AbnerCancel 1
  IfAbort failed complete
  failed:
    !insertmacro AbnerText $1 "安装未完成" "Installation did not finish"
    SendMessage $AbnerProgressTitle ${WM_SETTEXT} 0 "STR:$1"
    !insertmacro AbnerText $1 "安装遇到问题。请查看下方信息，$\r$\n关闭窗口后重试。" "Something went wrong. Check the details below,$\r$\nthen close this window and try again."
    SendMessage $AbnerProgressDescription ${WM_SETTEXT} 0 "STR:$1"
    !insertmacro AbnerText $1 "关闭" "Close"
    SendMessage $AbnerCancel ${WM_SETTEXT} 0 "STR:$1"
    Push close
    Call AbnerSetPrimary
    !insertmacro AbnerMove $AbnerCancel 334 444 418 48
    !insertmacro AbnerArtwork $AbnerCancel $AbnerCancelArtwork $AbnerCloseImage "$PLUGINSDIR\abner-close-$AbnerLanguage.bmp" 418 48
    ShowWindow $AbnerNext ${SW_HIDE}
    !insertmacro AbnerMove $mui.InstFilesPage.Log 0 276 418 64
    ShowWindow $mui.InstFilesPage.Log ${SW_SHOW}
  complete:
FunctionEnd

Function AbnerFinish
  !insertmacro AbnerPageStart
  !insertmacro AbnerLabel "ABNER MUSIC / READY" 0 20 $AbnerSmallFont 71816C
  !insertmacro AbnerText $1 "你的音乐空间，准备好了。" "Your music space is ready."
  !insertmacro AbnerLabel "$1" 34 88 $AbnerHeadingFont 203D2E
  !insertmacro AbnerText $1 "Abner Music 安装完成" "Abner Music is installed"
  !insertmacro AbnerLabel "$1" 142 24 $AbnerBodyFont 24664D
  !insertmacro AbnerText $1 "从桌面或开始菜单打开 Abner Music，$\r$\n导入喜欢的音乐，开始聆听。" "Open Abner Music from your desktop or Start menu.$\r$\nBring your favorite music and make yourself at home."
  !insertmacro AbnerLabel "$1" 184 64 $AbnerBodyFont 71816C
  !insertmacro AbnerLabel "$INSTDIR" 270 52 $AbnerSmallFont 71816C
  !insertmacro AbnerText $1 "完成" "Done"
  SendMessage $AbnerNext ${WM_SETTEXT} 0 "STR:$1"
  Push finish
  Call AbnerSetPrimary
  nsDialogs::Show
FunctionEnd

Function AbnerAbort
  ${If} $AbnerInstalling == 1
    IfAbort allowClose
    Abort
  ${EndIf}
  allowClose:
FunctionEnd

Function .onGUIEnd
  ${NSD_FreeImage} $AbnerBackgroundImage
  ${NSD_FreeImage} $AbnerButtonImage
  ${NSD_FreeImage} $AbnerCloseImage
  System::Call 'gdi32::DeleteObject(p $AbnerHeadingFont)'
  System::Call 'gdi32::DeleteObject(p $AbnerBodyFont)'
  System::Call 'gdi32::DeleteObject(p $AbnerSmallFont)'
FunctionEnd
