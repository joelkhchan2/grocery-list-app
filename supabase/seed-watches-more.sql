-- Seed the rest of the calibrated standing watches into the existing "Watches" list.
-- Run once (re-running duplicates). Requires the Watches list to already exist (seed-watches.sql)
-- and the match/negative/store migrations. Nissin + Sekka are scoped to the Asian grocers.
-- Note: "Boneless skinless chicken breast" is priced /lb — its target is only reliable once
-- unit-normalization ships. "Premier Protein" is a Costco/Amazon buy that's rarely on Flipp.
with wl as (
  select id from lists where is_watchlist and name = 'Watches' order by created_at limit 1
)
insert into items (list_id, name, watch, target_price, match_keywords, negative_keywords, watch_stores, sort_order)
select wl.id, v.name, true, v.target_price, v.match_keywords, v.negative_keywords, v.watch_stores, v.sort_order
from wl, (values
  ('Black Diamond cheese bar',            4.99::numeric, 'black diamond',  'slices, sliced, shredded, cheestrings, cracker barrel, snacks, twists',   null::text,                                                    10),
  ('Laughing Cow 8pk',                    2.99::numeric, 'laughing cow',   null::text,                                                                null::text,                                                    11),
  ('Nissin instant noodles 5pk',          4.99::numeric, 'nissin',         null::text,                                                                'T&T Supermarket, Btrust Supermarket, Nations Fresh Foods',    12),
  ('Sekka rice',                         14.99::numeric, 'sekka',          null::text,                                                                'T&T Supermarket, Btrust Supermarket, Nations Fresh Foods',    13),
  ('Boneless skinless chicken breast',    4.99::numeric, 'chicken breast', 'wings, thigh, drumstick, ground',                                         null::text,                                                    14),
  ('The Good Crisp',                      3.00::numeric, 'good crisp',     null::text,                                                                null::text,                                                    15),
  ('Premier Protein 18pk',               36.00::numeric, 'premier protein',null::text,                                                                null::text,                                                    16),
  ('Miss Vickie''s',                      3.00::numeric, 'miss vickie',    null::text,                                                                null::text,                                                    17),
  ('Clover Leaf tuna',                    1.29::numeric, 'clover leaf tuna', null::text,                                                              null::text,                                                    18),
  ('2% milk 2L',                          4.49::numeric, 'milk',           'almond, oat, soy, coconut, whitener, international delight, chocolate, evaporated, condensed, cracker, crackers, biscuit, biscuits, cookie, cookies, snack, snacks, bar, bars, powder, candy, bread, tea, bun, pudding', 'No Frills, FreshCo, Walmart, Real Canadian Superstore, Food Basics, Metro', 19)
) as v(name, target_price, match_keywords, negative_keywords, watch_stores, sort_order);
