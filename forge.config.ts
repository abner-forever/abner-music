import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { PublisherGitHub } from '@electron-forge/publisher-github';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { prerelease } from 'semver';
import packageInfo from './package.json';

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
    preStart: async () => {
      execFileSync(process.execPath, [path.resolve('scripts/brand-development.mjs')], {
        stdio: 'inherit',
      });
    },
  },
  makers: [
    new MakerSquirrel({ name: 'abner_music', setupExe: 'AbnerMusicSetup.exe' }),
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
