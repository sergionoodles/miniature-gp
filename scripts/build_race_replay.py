"""Prepare a 2026 race as a static replay file."""

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from race_start import build_start_phases


RACES = {"monza": (11361, 12, 10), "netherlands": (11353, 1, 10)}
API_URL = "https://api.openf1.org/v1/"
DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "public/data"
RETRYABLE_STATUS = (429, 502, 503, 504)
LIVE_SESSION_RETRY_SECONDS = 300
START_TELEMETRY_DRIVER_COUNT = 5
START_TELEMETRY_LEAD_SECONDS = 30
START_TELEMETRY_WINDOW_SECONDS = 900
START_INSTRUCTION_WINDOW_SECONDS = 600
START_CONTROL_MESSAGES = (
    "DELAYED START", "FORMATION LAP", "STARTING PROCEDURE", "START ORDER:",
    "RACE WILL START", "SAFETY CAR LIGHTS", "STANDING START", "ROLLING START", "RACE START",
)


def fetch(endpoint, **filters):
    url = f"{API_URL}{endpoint}?{urlencode(filters)}"
    attempt = 0
    while True:
        try:
            with urlopen(url, timeout=90) as response:
                return json.load(response)
        except (HTTPError, URLError) as error:
            is_live_session = (isinstance(error, HTTPError) and error.code == 401
                               and error.fp is not None and b"Live F1 session in progress" in error.read(1024))
            if is_live_session:
                error.close()
                print(f"OpenF1 is restricted around a live session; retrying {endpoint} in 5 minutes", file=sys.stderr, flush=True)
                time.sleep(LIVE_SESSION_RETRY_SECONDS)
                attempt = 0
                continue
            if attempt == 7 or isinstance(error, HTTPError) and error.code not in RETRYABLE_STATUS:
                raise
            retry_after = error.headers.get("Retry-After") if isinstance(error, HTTPError) else None
            delay = max(min(int(retry_after), 120), 2 ** attempt) if retry_after and retry_after.isdigit() else 2 ** attempt
            print(f"OpenF1 returned {error.code if isinstance(error, HTTPError) else 'a network error'} for {endpoint}; retrying in {delay}s",
                  file=sys.stderr, flush=True)
            time.sleep(delay)
            attempt += 1


def milliseconds(value):
    return round(datetime.fromisoformat(value).timestamp() * 1000)


def offset(value, start):
    return round((milliseconds(value) - start) / 1000, 1)


def sample_locations(rows, start, end):
    """Keep the final GPS fix in each second, preserving its real timestamp."""
    seconds = {}
    for row in rows:
        stamp = milliseconds(row["date"])
        if not start <= stamp <= end or row.get("x") is None or row.get("y") is None or (row["x"], row["y"]) == (0, 0):
            continue
        seconds[stamp // 1000] = [round((stamp - start) / 1000, 1), row["x"], row["y"]]
    return [seconds[second] for second in sorted(seconds)]


def with_session_metadata(replay, session):
    if replay["sessionKey"] != session.get("session_key"):
        raise ValueError("Session metadata does not match the replay")
    gmt_offset = session.get("gmt_offset")
    if not isinstance(gmt_offset, str) or not re.fullmatch(r"[+-]?(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?", gmt_offset):
        raise ValueError("Session GMT offset is missing or invalid")
    return {**replay, "gmt_offset": gmt_offset}


def with_race_events(replay, grid_rows, overtake_rows):
    driver_numbers = {driver["number"] for driver in replay["drivers"]}
    initial_positions = {driver: position for time, driver, position in replay["positions"] if time == 0}
    grid = {row["driver_number"]: row["position"] for row in grid_rows}
    if not grid:
        grid = initial_positions
        if set(grid) != driver_numbers:
            raise ValueError("Initial positions are missing drivers")
    if not set(grid) <= driver_numbers or len(set(grid.values())) != len(grid):
        raise ValueError("Starting grid has unknown drivers or duplicate positions")

    start = milliseconds(replay["start"])
    end = start + round(replay["duration"] * 1000)
    overtakes = sorted([
        [offset(row["date"], start), row["overtaking_driver_number"], row["overtaken_driver_number"], row["position"]]
        for row in overtake_rows
        if start <= milliseconds(row["date"]) <= end
        and row["overtaking_driver_number"] in driver_numbers
        and row["overtaken_driver_number"] in driver_numbers
    ])
    return {**replay, "startingGrid": sorted([[driver, position] for driver, position in grid.items()], key=lambda row: row[1]),
            "startingGridSource": "starting_grid" if grid_rows else "position", "overtakes": overtakes}


def fetch_starting_grid(session):
    try:
        sessions = fetch("sessions", meeting_key=session["meeting_key"])
        qualifying_names = {"Sprint Qualifying", "Sprint Shootout"} if session["session_name"] == "Sprint" else {"Qualifying"}
        race_start = milliseconds(session["date_start"])
        qualifying_sessions = [
            row for row in sessions
            if row.get("meeting_key") == session["meeting_key"]
            and row.get("session_name") in qualifying_names
            and row.get("date_start")
            and milliseconds(row["date_start"]) < race_start
        ]
        if not qualifying_sessions:
            return []
        qualifying = max(qualifying_sessions, key=lambda row: (milliseconds(row["date_start"]), row["session_key"]))
        return fetch("starting_grid", session_key=qualifying["session_key"])
    except HTTPError as error:
        if error.code != 404:
            raise
        return []


def fetch_overtakes(session_key):
    try:
        return fetch("overtakes", session_key=session_key)
    except HTTPError as error:
        if error.code != 404:
            raise
        return []


def collect_race_control(controls, start, end):
    return sorted([
        [offset(row["date"], start), row["category"], row.get("flag"), row["message"]]
        for row in controls
        if milliseconds(row["date"]) <= end
        and (row["category"] in ("SessionStatus", "SafetyCar") or row.get("flag") == "RED"
             or row["message"] in ("RED FLAG - RACE SUSPENDED", "CHEQUERED FLAG")
             or any(message in row["message"] for message in START_CONTROL_MESSAGES))
    ], key=lambda row: row[0])


def start_telemetry_windows(controls):
    ordered = sorted(controls, key=lambda row: milliseconds(row["date"]))
    windows = []
    for index, row in enumerate(ordered):
        if row["message"] != "SESSION STARTED":
            continue
        start = milliseconds(row["date"])
        boundary = next((milliseconds(control["date"]) for control in ordered[index + 1:]
                         if control["message"] in ("SESSION ABORTED", "SESSION FINISHED")
                         or control.get("flag") == "RED"), start + START_TELEMETRY_WINDOW_SECONDS * 1000)
        instructions = [milliseconds(control["date"]) for control in ordered[index + 1:]
                        if control["message"] in ("STANDING START", "ROLLING START")
                        and milliseconds(control["date"]) < boundary]
        end = max(start + START_TELEMETRY_WINDOW_SECONDS * 1000,
                  max(instructions, default=start) + START_INSTRUCTION_WINDOW_SECONDS * 1000)
        windows.append((start - START_TELEMETRY_LEAD_SECONDS * 1000, min(end, boundary)))
    return windows


def fetch_start_telemetry(session_key, controls, grid, drivers):
    leaders = [row["driver_number"] for row in sorted(grid, key=lambda row: row["position"])]
    driver_numbers = (leaders or sorted(row["driver_number"] for row in drivers))[:START_TELEMETRY_DRIVER_COUNT]
    windows = start_telemetry_windows(controls)
    telemetry = {}
    for number in driver_numbers:
        rows = []
        for start, end in windows:
            filters = {"date>": datetime.fromtimestamp(start / 1000, timezone.utc).isoformat(),
                       "date<": datetime.fromtimestamp(end / 1000, timezone.utc).isoformat()}
            try:
                rows.extend(fetch("car_data", session_key=session_key, driver_number=number, **filters))
            except HTTPError as error:
                if error.code != 404:
                    raise
                print(f"No start telemetry for car {number}; launch evidence may be incomplete", file=sys.stderr)
        telemetry[number] = rows
    return telemetry


def with_start_phases(replay, controls, telemetry):
    start = milliseconds(replay["start"])
    end = start + round(replay["duration"] * 1000)
    phases, launches = build_start_phases(controls, telemetry, start, end)
    return {**replay, "raceControl": sorted(collect_race_control(controls, start, end) + phases, key=lambda row: row[0]),
            "raceLaunches": launches}


def write_replay(output, replay):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    with temporary.open("w") as file:
        json.dump(replay, file, separators=(",", ":"))
    temporary.replace(output)
    print(f"Wrote {output} ({output.stat().st_size / 1_000_000:.1f} MB)")


def select_track(laps, session_key, preferred=None):
    candidates = [row for row in laps if row.get("date_start") and row.get("lap_duration")
                  and not row.get("is_pit_out_lap") and 50 <= row["lap_duration"] <= 180]
    candidates.sort(key=lambda row: (0 if preferred == (row["driver_number"], row["lap_number"]) else 1,
                                     abs(row["lap_number"] - 10), row["lap_duration"]))
    candidates_by_driver = {}
    for lap in candidates:
        candidates_by_driver.setdefault(lap["driver_number"], []).append(lap)
    print(f"Searching {len(candidates)} laps across {len(candidates_by_driver)} drivers for GPS track data", flush=True)
    for index, (driver_number, driver_laps) in enumerate(candidates_by_driver.items(), start=1):
        print(f"Checking driver {index}/{len(candidates_by_driver)} ({driver_number}; {len(driver_laps)} laps)", flush=True)
        try:
            rows = fetch("location", session_key=session_key, driver_number=driver_number)
        except HTTPError as error:
            if error.code != 404:
                raise
            continue
        dated_rows = [(datetime.fromisoformat(row["date"]), row) for row in rows if row.get("date")]
        dated_rows.sort(key=lambda item: item[0])
        for lap in driver_laps:
            track_start = datetime.fromisoformat(lap["date_start"])
            track_end = track_start + timedelta(seconds=lap["lap_duration"])
            points = [[row["x"], row["y"]] for date, row in dated_rows if track_start < date < track_end
                      and row.get("x") is not None and row.get("y") is not None and (row["x"], row["y"]) != (0, 0)]
            if len(points) < 100:
                continue
            width = max(point[0] for point in points) - min(point[0] for point in points)
            height = max(point[1] for point in points) - min(point[1] for point in points)
            if math.dist(points[0], points[-1]) <= math.hypot(width, height) * 0.2:
                return points[::2]
    raise ValueError(f"No complete GPS lap found for session {session_key}")


def build_replay(session, output, controls=None, preferred_track=None, total_laps=None):
    session_key = session["session_key"]
    controls = sorted(controls if controls is not None else fetch("race_control", session_key=session_key),
                      key=lambda row: milliseconds(row["date"]))
    starts = [row for row in controls if row["category"] == "SessionStatus" and row["message"] == "SESSION STARTED"]
    finishes = [row for row in controls if row["category"] == "SessionStatus" and row["message"] == "SESSION FINISHED"]
    if not starts or not finishes:
        raise RuntimeError("Race start or finish is missing")
    race_start = milliseconds(starts[0]["date"])
    race_end = milliseconds(finishes[-1]["date"])
    date_start = datetime.fromtimestamp(race_start / 1000, timezone.utc).isoformat()
    date_end = datetime.fromtimestamp(race_end / 1000, timezone.utc).isoformat()

    drivers = fetch("drivers", session_key=session_key)
    grid = fetch_starting_grid(session)
    laps = fetch("laps", session_key=session_key)
    track = select_track(laps, session_key, preferred_track)
    positions = sorted(fetch("position", session_key=session_key), key=lambda row: milliseconds(row["date"]))
    initial_positions = {}
    for row in positions:
        if milliseconds(row["date"]) <= race_start:
            initial_positions[row["driver_number"]] = row["position"]

    replay = {
        "sessionKey": session_key,
        "start": starts[0]["date"],
        "duration": round((race_end - race_start) / 1000, 1),
        "totalLaps": total_laps or max(row["lap_number"] for row in laps),
        "drivers": sorted([{
            "number": row["driver_number"], "name": row["full_name"].title(),
            "code": row["name_acronym"], "team": row["team_name"],
            "color": f"#{row['team_colour']}"
        } for row in drivers], key=lambda row: row["number"]),
        "track": track,
        "locations": {},
        "positions": sorted([[0, number, position] for number, position in initial_positions.items()]
                            + [[offset(row["date"], race_start), row["driver_number"], row["position"]]
                               for row in positions if race_start <= milliseconds(row["date"]) <= race_end]),
        "laps": sorted([[offset(row["date_start"], race_start), row["driver_number"], row["lap_number"]]
                        for row in laps if row.get("date_start") and race_start <= milliseconds(row["date_start"]) <= race_end]),
        "pits": sorted([[offset(row["date"], race_start), row["driver_number"], row["lap_number"], row.get("lane_duration")]
                        for row in fetch("pit", session_key=session_key)
                        if race_start <= milliseconds(row["date"]) <= race_end and (row.get("lane_duration") or 0) < 120]),
        "weather": sorted([[offset(row["date"], race_start), row["rainfall"], row["air_temperature"], row["track_temperature"]]
                           for row in fetch("weather", session_key=session_key)
                           if race_start <= milliseconds(row["date"]) <= race_end]),
        "raceControl": collect_race_control(controls, race_start, race_end),
        "stints": [[row["driver_number"], row["lap_start"], row["lap_end"], row["compound"]]
                   for row in fetch("stints", session_key=session_key)],
    }
    for driver in replay["drivers"]:
        number = driver["number"]
        print(f"Fetching car {number}", flush=True)
        rows = fetch("location", session_key=session_key, driver_number=number,
                     **{"date>": date_start, "date<": date_end})
        replay["locations"][str(number)] = sample_locations(rows, race_start, race_end)
        time.sleep(0.15)

    if not replay["positions"] or not replay["laps"] or sum(bool(rows) for rows in replay["locations"].values()) < len(drivers) * 0.8:
        raise ValueError(f"Session {session_key} has incomplete race telemetry")
    replay = with_session_metadata(replay, session)
    replay = with_race_events(replay, grid, fetch_overtakes(session_key))
    telemetry = fetch_start_telemetry(session_key, controls, grid, drivers)
    write_replay(output, with_start_phases(replay, controls, telemetry))


def resolve_replay_output(session, directory=DATA_DIRECTORY):
    year = session["year"]
    year_directory = directory / str(year)
    catalog = year_directory / f"races-{year}.json"
    entries = json.loads(catalog.read_text()) if catalog.exists() else []
    entry = next((row for row in entries if row["id"] == str(session["session_key"])), None)
    if entry:
        existing = year_directory / Path(entry["url"]).name
        if existing.exists():
            return existing
    return year_directory / f"race-{session['session_key']}-{year}.json"


def main(race, metadata_only=False, session_key=None):
    selected_key = session_key if session_key is not None else RACES[race][0]
    sessions = fetch("sessions", session_key=selected_key)
    if len(sessions) != 1:
        raise ValueError("Expected exactly one race session")
    session = sessions[0]
    output = resolve_replay_output(session)
    if metadata_only:
        replay = json.loads(output.read_text())
        replay = with_session_metadata(replay, session)
        grid = fetch_starting_grid(session)
        replay = with_race_events(replay, grid, fetch_overtakes(selected_key))
        controls = fetch("race_control", session_key=selected_key)
        drivers = [{"driver_number": row["number"]} for row in replay["drivers"]]
        telemetry = fetch_start_telemetry(selected_key, controls, grid, drivers)
        write_replay(output, with_start_phases(replay, controls, telemetry))
        return
    preferred_track = None if session_key is not None else RACES[race][1:]
    build_replay(session, output, preferred_track=preferred_track)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--race", choices=RACES, default="monza")
    parser.add_argument("--session-key", type=int, help="Import or re-import a race session into its season folder")
    parser.add_argument("--metadata-only", action="store_true", help="Refresh metadata, grid, overtakes, and start phases without downloading GPS")
    args = parser.parse_args()
    main(args.race, args.metadata_only, args.session_key)
