import type { Accountability } from '@directus/types';

// Directus sets this on every request. Its own augmentation isn't published,
// so endpoints have to declare it themselves.
declare global {
  namespace Express {
    interface Request {
      accountability?: Accountability | null;
    }
  }
}
