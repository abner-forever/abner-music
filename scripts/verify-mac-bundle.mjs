import { constants } from 'node:fs';
import { access, readdir, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function verifyMacBundle(application) {
  const root = await realpath(application);
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await readlink(filename);
        if (path.isAbsolute(target)) {
          throw new Error(`Non-portable app symlink: ${filename} -> ${target}`);
        }
        const resolved = await realpath(filename);
        const relative = path.relative(root, resolved);
        if (relative === '..' || relative.startsWith(`..${path.sep}`)) {
          throw new Error(`App symlink escapes bundle: ${filename} -> ${target}`);
        }
      } else if (entry.isDirectory()) {
        await visit(filename);
      }
    }
  }
  await visit(root);
  await access(path.join(root, 'Contents/MacOS/abner-music'), constants.X_OK);
  await access(
    path.join(root, 'Contents/Frameworks/Electron Framework.framework/Electron Framework'),
    constants.X_OK,
  );
  await access(path.join(root, 'Contents/Resources/app.asar'));
}
