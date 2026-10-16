'use client';

import type { PromoterApi } from './contract';
import { getFixturePromoterApi } from './fixtureApi';

// Module-level singleton so created meets, listing edits, and new registrations persist across client routes.
export function usePromoterApi(): PromoterApi {
  // TODO(Slate): Swap getFixturePromoterApi() for createSupabasePromoterApi() once M2/M3 auth and 003_listing.sql land.
  return getFixturePromoterApi();
}
