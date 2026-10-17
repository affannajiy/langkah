"""
Langkah - remove orphaned report photos
=======================================

A photo is orphaned when it sits in the report-photos bucket but no report uses
it: the upload worked but the report was never posted, or a report was deleted
and removing its photo failed. Supabase does not allow deleting files with SQL,
so this lists them from the database and deletes them through the Storage API.

Usage (inside the data-scripts venv):
    python clean_photos.py             # list orphans only, changes nothing
    python clean_photos.py --apply     # delete them

Photos newer than 1 day are kept, so a report being posted right now is safe.
Needs DATABASE_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
data-scripts/.env (laptop only, never in the app, git or a chat).
"""
import argparse
import os
import sys

import psycopg

from load_to_supabase import load_env
from seed_demo import PHOTO_BUCKET, Storage

GRACE = "1 day"
BATCH = 100  # names per delete call


def main():
    ap = argparse.ArgumentParser(description="List or delete report photos that no report uses.")
    ap.add_argument("--apply", action="store_true", help="delete the orphans (default: only list them)")
    a = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    load_env(os.path.join(here, ".env"))
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set. Copy .env.example to .env and fill it in.")

    with psycopg.connect(url, sslmode="require", connect_timeout=20) as conn:
        conn.read_only = True
        rows = conn.execute(
            f"""select o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0)
                from storage.objects o
                where o.bucket_id = %s
                  and o.created_at < now() - interval '{GRACE}'
                  and not exists (select 1 from public.reports r where r.photo_path = o.name)
                order by o.created_at""",
            (PHOTO_BUCKET,),
        ).fetchall()

    total = sum(r[2] for r in rows)
    print(f"Orphaned photos older than {GRACE}: {len(rows)} ({total // 1024} KB)")
    for name, at, size in rows:
        print(f"    {at:%d %b %Y %H:%M}  {size // 1024:>5} KB  {name}")
    if not rows:
        return 0
    if not a.apply:
        print("\nNothing deleted. Run again with --apply to delete them.")
        return 0

    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    api = os.environ.get("SUPABASE_URL")
    if not (api and key):
        sys.exit("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set, so nothing was deleted.")
    storage = Storage(api, key)
    names = [r[0] for r in rows]
    for i in range(0, len(names), BATCH):
        storage.remove(names[i:i + BATCH])
    print(f"\nDeleted {len(names)} photos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
