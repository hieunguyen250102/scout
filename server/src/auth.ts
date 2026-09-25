/**
 * Email sign-in lives in oink-kit (shared by all the Oink games).
 * Keep devSecret as it is: it is what keeps local sessions valid.
 */

import { createAuth } from 'oink-kit/server';

export type { User } from 'oink-kit/server';

export const auth = createAuth({ brand: 'SCOUT', devSecret: 'scout-dev-secret' });
