-- One-time seed: create a "Watches" list and the three standing watches with full match
-- tuning (parity with the retired yaml). Run AFTER migrate-watchlist.sql and
-- migrate-item-match.sql. Run once — re-running creates duplicates. Skip / edit the
-- lists insert if you already made a Watches list in the app (add the items to it instead).
with wl as (
  insert into lists (name, is_watchlist, sort_order)
  values ('Watches', true, 100)
  returning id
)
insert into items (list_id, name, watch, target_price, match_keywords, negative_keywords, sort_order)
select wl.id, v.name, true, v.target_price, v.match_keywords, v.negative_keywords, v.sort_order
from wl, (values
  ('Scope mouthwash (1L)',           4.00, null,                              null,                                              0),
  ('Sensodyne Clinical White 75ml',  8.50, 'sensodyne',                       null,                                              1),
  ('Dempster''s sandwich bread',     2.49, 'dempster bread, dempsters bread', 'hamburger, hot dog, bagel, tortilla, english muffin', 2)
) as v(name, target_price, match_keywords, negative_keywords, sort_order);
