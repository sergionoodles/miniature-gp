"""Prepare a 2026 race as a static replay file."""

import argparse
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


RACES = {"monza": (11361, 12, 10), "netherlands": (11353, 1, 10)}
API_URL = "https://api.openf1.org/v1/"
DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "public/data"


def fetch(endpoint, **filters):
    url = f"{API_URL}{endpoint}?{urlencode(filters)}"
    for attempt in range(4):
        try:
            with urlopen(url, timeout=90) as response:
                return json.load(response)
        except (HTTPError, URLError) as error:
            if attempt == 3 or isinstance(error, HTTPError) and error.code not in (429, 502, 503, 504):
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Could not fetch {endpoint}")


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


def write_replay(output, replay):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w") as file:
        json.dump(replay, file, separators=(",", ":"))
    print(f"Wrote {output} ({output.stat().st_size / 1_000_000:.1f} MB)")


def main(race, metadata_only=False):
    session_key, track_driver, track_lap_number = RACES[race]
    output = DATA_DIRECTORY / f"{race}-2026.json"
    sessions = fetch("sessions", session_key=session_key)
    if len(sessions) != 1:
        raise ValueError("Expected exactly one race session")
    session = sessions[0]
    if metadata_only:
        replay = json.loads(output.read_text())
        write_replay(output, with_session_metadata(replay, session))
        return
    controls = fetch("race_control", session_key=session_key)
    starts = [row for row in controls if row["category"] == "SessionStatus" and row["message"] == "SESSION STARTED"]
    finishes = [row for row in controls if row["category"] == "SessionStatus" and row["message"] == "SESSION FINISHED"]
    if not starts or not finishes:
        raise RuntimeError("Race start or finish is missing")
    race_start = milliseconds(starts[0]["date"])
    race_end = milliseconds(finishes[-1]["date"])
    date_start = datetime.fromtimestamp(race_start / 1000, timezone.utc).isoformat()
    date_end = datetime.fromtimestamp(race_end / 1000, timezone.utc).isoformat()

    drivers = fetch("drivers", session_key=session_key)
    laps = fetch("laps", session_key=session_key)
    track_lap = next(row for row in laps if row["driver_number"] == track_driver and row["lap_number"] == track_lap_number)
    track_start = datetime.fromisoformat(track_lap["date_start"])
    track_end = track_start + timedelta(seconds=track_lap["lap_duration"])
    track_rows = fetch("location", session_key=session_key, driver_number=track_driver,
                       **{"date>": track_start.isoformat(), "date<": track_end.isoformat()})
    positions = fetch("position", session_key=session_key)
    initial_positions = {}
    for row in positions:
        if milliseconds(row["date"]) <= race_start:
            initial_positions[row["driver_number"]] = row["position"]
    race_control = []
    for row in controls:
        if not race_start <= milliseconds(row["date"]) <= race_end:
            continue
        if row["category"] in ("SessionStatus", "SafetyCar") or row["message"] in (
            "RED FLAG - RACE SUSPENDED", "RACE START", "CHEQUERED FLAG", "STANDING START"
        ):
            race_control.append([offset(row["date"], race_start), row["category"], row.get("flag"), row["message"]])

    replay = {
        "sessionKey": session_key,
        "start": starts[0]["date"],
        "duration": round((race_end - race_start) / 1000, 1),
        "drivers": sorted([{
            "number": row["driver_number"], "name": row["full_name"].title(),
            "code": row["name_acronym"], "team": row["team_name"],
            "color": f"#{row['team_colour']}"
        } for row in drivers], key=lambda row: row["number"]),
        "track": [[row["x"], row["y"]] for row in track_rows[::2]],
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
        "raceControl": sorted(race_control),
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

    write_replay(output, with_session_metadata(replay, session))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--race", choices=RACES, default="monza")
    parser.add_argument("--metadata-only", action="store_true", help="Refresh session metadata without downloading telemetry")
    args = parser.parse_args()
    main(args.race, args.metadata_only)
