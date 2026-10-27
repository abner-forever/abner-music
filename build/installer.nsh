!define MUI_BGCOLOR "F6F7EE"
!define MUI_TEXTCOLOR "203D2E"
!define MUI_INSTFILESPAGE_COLORS "24664D F6F7EE"

!ifndef BUILD_UNINSTALLER
  ManifestDPIAware true
  !define MUI_CUSTOMFUNCTION_GUIINIT AbnerGuiInit
  !define MUI_CUSTOMFUNCTION_ABORT AbnerAbort

  !macro customWelcomePage
    !include "installer-ui.nsh"
    Page custom AbnerWelcome AbnerWelcomeLeave
  !macroend

  !macro customInstallMode
    ${If} $installMode == all
      StrCpy $isForceMachineInstall 1
    ${Else}
      StrCpy $isForceCurrentInstall 1
    ${EndIf}
  !macroend

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_PRE AbnerProgressPre
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW AbnerProgressShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE AbnerProgressLeave
  !macroend

  !macro customFinishPage
    Page custom AbnerFinish
  !macroend
!endif

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "卸载 Abner Music"
  !define MUI_WELCOMEPAGE_TEXT "此向导将从电脑中移除 Abner Music。$\r$\n$\r$\n你的原始音乐文件、音乐库和个人偏好将会保留。$\r$\n$\r$\n继续前，请先关闭正在运行的 Abner Music。"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
