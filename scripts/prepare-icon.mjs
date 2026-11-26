import { writeFile } from 'node:fs/promises';
import pngToIco from 'png-to-ico';

const source = 'icons/android-chrome-384x384.png';
const target = 'icons/lampa.ico';
const ico = await pngToIco(source, { resize: true });
await writeFile(target, ico);
console.log(`Generated Windows icon: ${target} from ${source}`);
