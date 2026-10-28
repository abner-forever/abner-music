# Changelog

## 0.1.0

### 新功能

- feat(ci): automate beta and stable release pipeline (305a7f2)
- feat: vinyl player view, offline downloads and resizable sidebar (16cdabb)
- feat: update to Beta.12 with network song search, playback, and download support (b8a8ae5)
- feat: add audio download functionality and improve online music component (c89c4ec)
- feat(music): integrate GD music source search and playback (b118c92)
- feat(installer): add custom Windows installation interface (d294013)
- feat: release beta.5 with background playback and improved installers (f2aaa8b)
- feat: follow system theme and simplify sidebar for beta.4 (40deac5)
- feat: release initial music player beta with manual GitHub updates (94f6d8d)

### 修复与性能

- fix(release): repair desktop quit verification for beta.15 (244777f)
- fix(test): follow the rebuilt settings dialog in the desktop smoke test (ddc48b3)
- fix(installer): keep newly created pages above the background (369b17f)
- fix(installer): preserve page labels while editing the install path (63d7270)
- fix(installer): clip background painting around wizard controls (eb4f7a5)
- fix(installer): use supported border style and wait for artwork (859cec9)
- fix(installer): preserve rounded button artwork across wizard pages (ad0707a)
- fix(test): read Unicode shortcut targets through IShellLinkW (83e9726)
- fix(test): compare resolved Windows shortcut paths (b1f4948)
- fix(installer): allow installation into new directories (84da18a)
- fix(test): click native installer links without InvokePattern (abcc500)
- fix(ui): correct dark theme, layout and lyrics navigation (7e8f9b7)
- fix(test): hash installer icons without optional PowerShell commands (e72ac47)
- fix(test): identify NSIS installation by its uninstall command (9e19a17)
- fix(test): retain process handle before Electron shuts down (f240820)
- fix(test): verify process exit without racing the quit click (ef11c16)
- fix(ci): operate native NSIS controls for beta.6 (06fbf1c)
- fix(ci): verify Intel macOS builds on native runners (3397600)
- fix: bundle startup dependencies and verify packaged releases (103ac0a)

### 其他变更

- test(installer): capture visible pages after compositor presentation (026a079)
- test(installer): report shortcut target before path validation (03789f3)
- test(installer): capture window state when verification fails (ee065a5)
- test: wait for dropdown arrow animation before measuring spacing (94b9b79)
- test: cover shared dropdowns across albums and library views (950b946)

## 0.1.0-beta.16

### 新功能

- feat(ci): automate beta and stable release pipeline (305a7f2)

