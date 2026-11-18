import { fileURLToPath } from 'node:url';

/** Root of the @huis/house package (its public/, scripts/ and src/ live here). */
export const HOUSE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Served house assets: the apps serve this folder at / (Vite publicDir). */
export const HOUSE_PUBLIC = fileURLToPath(new URL('../../public/', import.meta.url));

/** Absolute path of a file in public/models, e.g. houseModelPath('house.glb'). */
export const houseModelPath = (name: string): string => fileURLToPath(new URL(`../../public/models/${name}`, import.meta.url));
