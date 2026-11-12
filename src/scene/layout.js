import { CFG } from './config.js';

// X position of painting `i` in a row of `n` (centered on origin).
export const frameX = (i, n) => (i - (n - 1) / 2) * CFG.gallery.spacing;
