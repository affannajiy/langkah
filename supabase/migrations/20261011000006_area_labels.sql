-- Langkah: area labels for more than one pilot area.
-- Seri Iskandar and UTP join central Ipoh, so a place with no street or
-- neighbourhood nearby is labelled with its nearest town instead of always "Ipoh".
-- No table changes, so no new RLS. Called by data-scripts/load_to_supabase.py.

create or replace function private.label_places()
returns bigint
language plpgsql
set search_path = public, extensions
as $$
declare
  n bigint;
begin
  update places p set area = coalesce(
    -- A street's own name is not a useful label, so streets skip this step.
    case when p.osm_type <> 'street' then (
      select s.name from road_segments s
      where s.name is not null
        and s.name <> p.name
        and s.highway not in ('footway', 'path', 'steps', 'cycleway', 'corridor', 'track')
        and s.geom && st_expand(p.geom, 0.001)
        and st_dwithin(s.geom::geography, p.geom::geography, 100)
      order by s.geom <-> p.geom
      limit 1)
    end,
    (select h.name from places h
     where h.category in ('place:suburb', 'place:neighbourhood', 'place:quarter')
       and h.id <> p.id
       and st_dwithin(h.geom::geography, p.geom::geography, 1000)
     order by h.geom <-> p.geom
     limit 1),
    -- Nearest town or city within 15 km (Ipoh, Seri Iskandar).
    (select h.name from places h
     where h.category in ('place:town', 'place:city')
       and h.id <> p.id
       and st_dwithin(h.geom::geography, p.geom::geography, 15000)
     order by h.geom <-> p.geom
     limit 1),
    'Perak');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.label_places() from public, anon, authenticated;
