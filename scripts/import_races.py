"""Download newly completed Grand Prix races and update the website catalog."""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from build_race_replay import DATA_DIRECTORY, build_replay, fetch


FIRST_AVAILABLE_YEAR = 2023
COUNTRY_CODES = {
    "Australia": "AUS", "Austria": "AUT", "Azerbaijan": "AZE", "Bahrain": "BRN",
    "Belgium": "BEL", "Brazil": "BRA", "Canada": "CAN", "China": "CHN",
    "Hungary": "HUN", "Italy": "ITA", "Japan": "JPN", "Malaysia": "MAS",
    "Mexico": "MEX", "Monaco": "MON", "Netherlands": "NED", "Qatar": "QAT",
    "Saudi Arabia": "KSA", "Singapore": "SGP", "Spain": "ESP", "UAE": "UAE",
    "UK": "GBR", "USA": "USA",
}


def local_race_date(session):
    value = session["gmt_offset"]
    sign = -1 if value.startswith("-") else 1
    hours, minutes, seconds = (int(part) for part in value.lstrip("+-").split(":"))
    offset = timezone(sign * timedelta(hours=hours, minutes=minutes, seconds=seconds))
    return datetime.fromisoformat(session["date_start"]).astimezone(offset).date().isoformat()


def race_entry(session, meeting, replay, filename, year):
    grand_prix = meeting["meeting_name"]
    location = meeting["location"]
    laps = replay.get("totalLaps") or max((row[2] for row in replay["laps"]), default=0)
    if not laps:
        raise ValueError(f"Race {session['session_key']} has no completed laps")
    return {
        "id": str(session["session_key"]), "url": f"/data/{year}/{filename}",
        "label": f"{grand_prix} · {location}", "circuit": session["circuit_short_name"],
        "grandPrix": grand_prix, "location": location, "countryCode": session["country_code"],
        "date": local_race_date(session), "laps": laps,
    }


def existing_replays(directory, year):
    replays = {}
    for path in (directory / str(year)).glob(f"*-{year}.json"):
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


def write_years(directory):
    years = sorted((int(path.parent.name) for path in directory.glob("*/races-*.json")
                    if path.parent.name.isdecimal() and json.loads(path.read_text())), reverse=True)
    write_catalog(years, directory / "years.json")


def fetch_schedule(year):
    with urlopen(f"https://api.jolpi.ca/ergast/f1/{year}.json?limit=100", timeout=30) as response:
        return json.load(response)["MRData"]["RaceTable"]["Races"]


def refresh_catalogs(directory):
    for year_directory in sorted(directory.iterdir()) if directory.exists() else []:
        if not year_directory.is_dir() or not year_directory.name.isdecimal():
            continue
        year = int(year_directory.name)
        replays = existing_replays(directory, year)
        catalog_path = year_directory / f"races-{year}.json"
        previous = json.loads(catalog_path.read_text()) if catalog_path.exists() else []
        previous_by_id = {entry["id"]: entry for entry in previous}
        missing = set(replays) - {int(identifier) for identifier in previous_by_id}
        schedule = {row["date"]: row for row in fetch_schedule(year)} if missing else {}
        entries = []
        for session_key, (path, replay) in replays.items():
            prior = previous_by_id.get(str(session_key))
            if prior:
                entries.append({**prior, "url": f"/data/{year}/{path.name}",
                                "countryCode": COUNTRY_CODES.get(prior["countryCode"], prior["countryCode"])})
                continue
            race = schedule[replay["start"][:10]]
            location = race["Circuit"]["Location"]
            session = {"session_key": session_key, "date_start": replay["start"],
                       "gmt_offset": replay["gmt_offset"], "circuit_short_name": race["Circuit"]["circuitName"],
                       "country_code": COUNTRY_CODES.get(location["country"], location["country"])}
            meeting = {"meeting_name": race["raceName"], "location": location["locality"]}
            entries.append(race_entry(session, meeting, replay, path.name, year))
        entries.sort(key=lambda entry: entry["date"], reverse=True)
        if entries != previous:
            write_catalog(entries, catalog_path)
    write_years(directory)


def run_import(directory=DATA_DIRECTORY, now=None, year=None, catalog_only=False):
    if catalog_only:
        refresh_catalogs(directory)
        return
    now = now or datetime.now(timezone.utc)
    year = now.year if year is None else year
    if year < FIRST_AVAILABLE_YEAR:
        raise ValueError(f"OpenF1 race data starts in {FIRST_AVAILABLE_YEAR}")
    year_directory = directory / str(year)
    catalog_path = year_directory / f"races-{year}.json"
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
                entries.append(race_entry(session, meeting, replay, path.name, year))
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
            path = year_directory / f"race-{session_key}-{year}.json"
            year_directory.mkdir(parents=True, exist_ok=True)
            print(f"Importing {meeting['meeting_name']} ({session_key})", flush=True)
            total_laps = max(row["number_of_laps"] for row in results if row.get("number_of_laps"))
            build_replay(session, path, controls, total_laps=total_laps)
            replay = json.loads(path.read_text())
            entries.append(race_entry(session, meeting, replay, path.name, year))
        except Exception as error:
            failures.append(f"{session_key}: {error}")
            print(f"Import failed for session {session_key}: {error}", file=sys.stderr, flush=True)
    imported_ids = {entry["id"] for entry in entries}
    entries.extend(entry for entry in previous_entries if entry["id"] not in imported_ids
                   and int(entry["id"]) in replays)
    entries.sort(key=lambda entry: entry["date"], reverse=True)
    if entries:
        write_catalog(entries, catalog_path)
    write_years(directory)
    if failures:
        raise RuntimeError(f"{len(failures)} race import(s) failed: {', '.join(failures)}")
    print(f"Catalog contains {len(entries)} completed races")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Season to import (default: current UTC year)")
    parser.add_argument("--catalog-only", action="store_true", help="Update catalogs from existing replay files in every year folder")
    args = parser.parse_args()
    run_import(year=args.year, catalog_only=args.catalog_only)
