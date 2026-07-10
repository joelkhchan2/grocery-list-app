-- Tighten watch matching based on a live-flyer preview (kills false positives found there).
-- Run once in the Supabase SQL editor.

-- "milk" is a very noisy token (milk bread/crackers/tea/candy, esp. at Asian grocers). Scope
-- it to mainstream grocers and expand the exclude list (plural forms matter — matching is
-- whole-token, so "cracker" ≠ "crackers").
update items set
  negative_keywords = 'almond, oat, soy, coconut, whitener, international delight, chocolate, evaporated, condensed, cracker, crackers, biscuit, biscuits, cookie, cookies, snack, snacks, bar, bars, powder, candy, bread, tea, bun, pudding',
  watch_stores = 'No Frills, FreshCo, Walmart, Real Canadian Superstore, Food Basics, Metro'
  where watch and name = '2% milk 2L';

-- Black Diamond flyers are mostly cheese SNACKS / TWISTS bundles, not the bar.
update items set
  negative_keywords = 'slices, sliced, shredded, cheestrings, cracker barrel, snacks, twists'
  where watch and name = 'Black Diamond cheese bar';

-- Require "tuna" so Clover Leaf oyster/mussel/salmon bundles don't match.
update items set
  match_keywords = 'clover leaf tuna'
  where watch and name = 'Clover Leaf tuna';
