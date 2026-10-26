!define MUI_BGCOLOR "F6F7EE"
!define MUI_TEXTCOLOR "203D2E"
!define MUI_INSTFILESPAGE_COLORS "24664D F6F7EE"

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "欢迎安装 Abner Music"
  !define MUI_WELCOMEPAGE_TEXT "音乐，自在发生。$\r$\n$\r$\n将本地音乐、网络音频和喜欢的声音，放进属于自己的音乐空间。$\r$\n$\r$\n接下来，你可以选择安装范围和安装位置。准备好后，点击“安装”开始。$\r$\n$\r$\n点击“下一步”继续。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Abner Music 安装完成"
  !define MUI_FINISHPAGE_TEXT "你的音乐空间，准备好了。$\r$\n$\r$\nAbner Music 已安装到你的电脑。$\r$\n$\r$\n从桌面快捷方式或开始菜单打开应用，导入音乐，开始聆听。$\r$\n$\r$\n点击“完成”退出安装向导。"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "卸载 Abner Music"
  !define MUI_WELCOMEPAGE_TEXT "此向导将从电脑中移除 Abner Music。$\r$\n$\r$\n你的原始音乐文件、音乐库和个人偏好将会保留。$\r$\n$\r$\n继续前，请先关闭正在运行的 Abner Music。"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
