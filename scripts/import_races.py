"""Download newly completed Grand Prix races and update the website catalog."""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError

from build_monza_replay import DATA_DIRECTORY, build_replay, fetch


FIRST_AVAILABLE_YEAR = 2023


def local_race_date(session):
    value = session["gmt_offset"]
    sign = -1 if value.startswith("-") else 1
    hours, minutes, seconds = (int(part) for part in value.lstrip("+-").split(":"))
    offset = timezone(sign * timedelta(hours=hours, minutes=minutes, seconds=seconds))
    return datetime.fromisoformat(session["date_start"]).astimezone(offset).date().isoformat()


def race_entry(session, meeting, replay, filename):
    grand_prix = meeting["meeting_name"]
    location = meeting["location"]
    laps = replay.get("totalLaps") or max((row[2] for row in replay["laps"]), default=0)
    if not laps:
        raise ValueError(f"Race {session['session_key']} has no completed laps")
    return {
        "id": str(session["session_key"]), "url": f"/data/{filename}",
        "label": f"{grand_prix} · {location}", "circuit": session["circuit_short_name"],
        "grandPrix": grand_prix, "location": location, "countryCode": session["country_code"],
        "date": local_race_date(session), "laps": laps,
    }


def existing_replays(directory, year):
    replays = {}
    for path in directory.glob(f"*-{year}.json"):
        if path.name == f"races-{year}.json":
            continue
        replay = json.loads(path.read_text())
        session_key = replay["sessionKey"]
        if session_key in replays:
            raise ValueError(f"Duplicate replay for session {session_key}")
        replays[session_key] = (path, replay)
    return replays


def write_catalog(entries, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(entries, separators=(",", ":")) + "\n")
    temporary.replace(path)


def run_import(directory=DATA_DIRECTORY, now=None, year=None):
    now = now or datetime.now(timezone.utc)
    year = now.year if year is None else year
    if year < FIRST_AVAILABLE_YEAR:
        raise ValueError(f"OpenF1 race data starts in {FIRST_AVAILABLE_YEAR}")
    catalog_path = directory / f"races-{year}.json"
    previous_entries = json.loads(catalog_path.read_text()) if catalog_path.exists() else []
    sessions = fetch("sessions", year=year, session_name="Race")
    meetings = {row["meeting_key"]: row for row in fetch("meetings", year=year)}
    replays = existing_replays(directory, year)
    entries = []
    failures = []
    for session in sorted(sessions, key=lambda row: row["date_start"]):
        if session["session_name"] != "Race" or session.get("is_cancelled"):
            continue
        if not session.get("date_end") or datetime.fromisoformat(session["date_end"]) >= now:
            continue
        session_key = session["session_key"]
        try:
            meeting = meetings[session["meeting_key"]]
            if session_key in replays:
                path, replay = replays[session_key]
                print(f"Already imported {meeting['meeting_name']} ({session_key})", flush=True)
                entries.append(race_entry(session, meeting, replay, path.name))
                continue
            controls = fetch("race_control", session_key=session_key)
            if not any(row.get("category") == "SessionStatus" and row.get("message") == "SESSION FINISHED" for row in controls):
                print(f"Waiting for finish: {meeting['meeting_name']} ({session_key})", flush=True)
                continue
            try:
                results = fetch("session_result", session_key=session_key)
            except HTTPError as error:
                if error.code != 404:
                    raise
                results = []
            if not any(row.get("number_of_laps") for row in results):
                print(f"Waiting for results: {meeting['meeting_name']} ({session_key})", flush=True)
                continue
            path = directory / f"race-{session_key}-{year}.json"
            print(f"Importing {meeting['meeting_name']} ({session_key})", flush=True)
            total_laps = max(row["number_of_laps"] for row in results if row.get("number_of_laps"))
            build_replay(session, path, controls, total_laps=total_laps)
            replay = json.loads(path.read_text())
            entries.append(race_entry(session, meeting, replay, path.name))
        except Exception as error:
            failures.append(f"{session_key}: {error}")
            print(f"Import failed for session {session_key}: {error}", file=sys.stderr, flush=True)
    imported_ids = {entry["id"] for entry in entries}
    entries.extend(entry for entry in previous_entries if entry["id"] not in imported_ids
                   and int(entry["id"]) in replays)
    entries.sort(key=lambda entry: entry["date"], reverse=True)
    if entries:
        write_catalog(entries, catalog_path)
    if failures:
        raise RuntimeError(f"{len(failures)} race import(s) failed: {', '.join(failures)}")
    print(f"Catalog contains {len(entries)} completed races")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Season to import (default: current UTC year)")
    args = parser.parse_args()
    run_import(year=args.year)
