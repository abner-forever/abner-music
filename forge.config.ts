import type { ForgeConfig } from '@electron-forge/shared-types';
import MakerNSIS from 'electron-forge-maker-nsis';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { PublisherGitHub } from '@electron-forge/publisher-github';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { prerelease } from 'semver';
import packageInfo from './package.json';
import { verifyMacBundle } from './scripts/verify-mac-bundle.mjs';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Abner Music',
    asar: true,
    icon: 'build/icon',
    extraResource: ['build/icon.png'],
    ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
    executableName: 'abner-music',
    appBundleId: 'com.abner.music',
    appCategoryType: 'public.app-category.music',
    ...(process.env.APPLE_SIGN_IDENTITY
      ? {
          osxSign: {
            identity: process.env.APPLE_SIGN_IDENTITY,
            optionsForFile: () => ({
              hardenedRuntime: true,
              entitlements: 'build/entitlements.mac.plist',
            }),
          },
          osxNotarize: {
            appleId: process.env.APPLE_ID!,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }
      : {}),
  },
  hooks: {
    postPackage: async (_forgeConfig, { platform, outputPaths }) => {
      if (platform === 'darwin') {
        await Promise.all(
          outputPaths.map((directory) =>
            verifyMacBundle(path.join(directory, `${packageInfo.productName}.app`)),
          ),
        );
      }
    },
    preStart: async () => {
      execFileSync(process.execPath, [path.resolve('scripts/brand-development.mjs')], {
        stdio: 'inherit',
      });
    },
  },
  makers: [
    new MakerNSIS({
      oneClick: false,
      perMachine: false,
      selectPerMachineByDefault: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      runAfterFinish: false,
      installerIcon: 'build/icon.ico',
      uninstallerIcon: 'build/icon.ico',
      installerSidebar: 'build/installer-sidebar.bmp',
      uninstallerSidebar: 'build/installer-sidebar.bmp',
      installerHeader: 'build/installer-header.bmp',
      include: 'build/installer.nsh',
      installerLanguages: ['zh_CN', 'en_US'],
      language: '2052',
      displayLanguageSelector: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Abner Music',
      uninstallDisplayName: 'Abner Music',
      deleteAppDataOnUninstall: false,
      differentialPackage: false,
      artifactName: 'Abner-Music-${version}-windows-${arch}.exe',
    }),
    new MakerDMG((architecture) => ({
      name: `Abner-Music-${packageInfo.version}-${architecture}`,
      title: 'Abner Music',
      icon: path.resolve('build/icon.icns'),
      background: path.resolve('build/dmg-background.png'),
      iconSize: 104,
      contents: ({ appPath }) => [
        { x: 180, y: 246, type: 'file', path: appPath },
        { x: 480, y: 246, type: 'link', path: path.join(path.sep, 'Applications') },
      ],
      additionalDMGOptions: {
        window: { size: { width: 660, height: 440 } },
        'background-color': '#f6f7ee',
      },
    })),
    new MakerZIP({}, ['darwin']),
  ],
  publishers: [
    new PublisherGitHub({
      repository: { owner: 'abner-forever', name: 'abner-music' },
      draft: true,
      prerelease: Boolean(prerelease(packageInfo.version)),
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
