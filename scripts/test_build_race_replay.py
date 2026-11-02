import unittest
import json
import math
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import build_race_replay

from build_race_replay import milliseconds, sample_locations, with_race_events, with_session_metadata


class SessionMetadataTest(unittest.TestCase):
    def test_preserves_timezone_without_replacing_actual_race_start_or_telemetry(self):
        replay = {"sessionKey": 11361, "start": "2026-09-06T13:03:30Z", "locations": {"1": [[0, 2, 3]]}}
        result = with_session_metadata(replay, {"session_key": 11361, "gmt_offset": "02:00:00"})
        self.assertEqual(result, {**replay, "gmt_offset": "02:00:00"})
        self.assertNotIn("gmt_offset", replay)

    def test_rejects_missing_or_invalid_offsets(self):
        for value in (None, "99:00:00", "bad"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                with_session_metadata({"sessionKey": 1}, {"session_key": 1, "gmt_offset": value})

    def test_rejects_metadata_for_a_different_session(self):
        with self.assertRaises(ValueError):
            with_session_metadata({"sessionKey": 1}, {"session_key": 2, "gmt_offset": "02:00:00"})


class SampleLocationsTest(unittest.TestCase):
    def test_keeps_last_fix_per_second_within_race(self):
        start = milliseconds("2026-09-06T13:00:00+00:00")
        rows = [
            {"date": "2026-09-06T12:59:59.900+00:00", "x": 0, "y": 0},
            {"date": "2026-09-06T13:00:00.100+00:00", "x": 1, "y": 2},
            {"date": "2026-09-06T13:00:00.800+00:00", "x": 3, "y": 4},
            {"date": "2026-09-06T13:00:01.100+00:00", "x": None, "y": 6},
            {"date": "2026-09-06T13:00:02.200+00:00", "x": 7, "y": 8},
        ]
        self.assertEqual(sample_locations(rows, start, start + 2000), [[0.8, 3, 4]])

    def test_ignores_missing_gps_fix_at_origin(self):
        start = milliseconds("2026-09-06T13:00:00+00:00")
        rows = [
            {"date": "2026-09-06T13:00:00.100+00:00", "x": 3, "y": 4},
            {"date": "2026-09-06T13:00:01.100+00:00", "x": 0, "y": 0},
        ]
        self.assertEqual(sample_locations(rows, start, start + 2000), [[0.1, 3, 4]])


class RaceEventsTest(unittest.TestCase):
    def setUp(self):
        self.replay = {"start": "2026-09-06T13:00:00+00:00", "duration": 10,
                       "drivers": [{"number": 1}, {"number": 2}],
                       "positions": [[0, 1, 2], [0, 2, 1], [5, 1, 1]]}

    def test_uses_api_grid_and_keeps_only_in_race_overtakes(self):
        grid = [{"driver_number": 1, "position": 1}, {"driver_number": 2, "position": 2}]
        rows = [
            {"date": "2026-09-06T12:59:59+00:00", "overtaking_driver_number": 1, "overtaken_driver_number": 2, "position": 1},
            {"date": "2026-09-06T13:00:05+00:00", "overtaking_driver_number": 1, "overtaken_driver_number": 2, "position": 1},
            {"date": "2026-09-06T13:00:11+00:00", "overtaking_driver_number": 2, "overtaken_driver_number": 1, "position": 1},
        ]
        result = with_race_events(self.replay, grid, rows)
        self.assertEqual(result["startingGrid"], [[1, 1], [2, 2]])
        self.assertEqual(result["startingGridSource"], "starting_grid")
        self.assertEqual(result["overtakes"], [[5.0, 1, 2, 1]])

    def test_falls_back_to_initial_positions_when_grid_is_unavailable(self):
        result = with_race_events(self.replay, [], [])
        self.assertEqual(result["startingGrid"], [[2, 1], [1, 2]])
        self.assertEqual(result["startingGridSource"], "position")

    def test_excludes_withdrawn_drivers_without_renumbering_grid_positions(self):
        grid = [{"driver_number": 1, "position": 1},
                {"driver_number": 18, "position": 2},
                {"driver_number": 2, "position": 3}]
        result = with_race_events(self.replay, grid, [])
        self.assertEqual(result["startingGrid"], [[1, 1], [2, 3]])
        self.assertEqual(result["startingGridSource"], "starting_grid")
        self.assertEqual(grid[1], {"driver_number": 18, "position": 2})

    def test_falls_back_when_grid_has_no_race_participants(self):
        result = with_race_events(self.replay, [{"driver_number": 18, "position": 1}], [])
        self.assertEqual(result["startingGrid"], [[2, 1], [1, 2]])
        self.assertEqual(result["startingGridSource"], "position")

    def test_rejects_duplicate_grid_positions(self):
        grid = [{"driver_number": 1, "position": 1}, {"driver_number": 2, "position": 1}]
        with self.assertRaises(ValueError):
            with_race_events(self.replay, grid, [])

    def test_rejects_incomplete_position_fallback(self):
        with self.assertRaises(ValueError):
            with_race_events({**self.replay, "positions": [[0, 1, 1]]}, [], [])


class StartTelemetryImportTest(unittest.TestCase):
    def setUp(self):
        self.start = milliseconds("2026-10-04T08:33:00+00:00")
        self.controls = [
            {"date": "2026-10-04T08:28:00+00:00", "category": "Other", "message": "SAFETY CAR LIGHTS ON"},
            {"date": "2026-10-04T08:33:00+00:00", "category": "SessionStatus", "message": "SESSION STARTED"},
            {"date": "2026-10-04T08:36:37+00:00", "category": "Other", "message": "STANDING START"},
            {"date": "2026-10-04T10:20:00+00:00", "category": "SessionStatus", "message": "SESSION FINISHED"},
        ]

    def test_preserves_pre_start_state_and_red_flags_without_future_events(self):
        controls = self.controls + [
            {"date": "2026-10-04T08:40:00+00:00", "category": "Flag", "flag": "RED", "message": "RED FLAG"},
        ]
        events = build_race_replay.collect_race_control(controls, self.start, self.start + 500_000)
        self.assertEqual(events, [
            [-300.0, "Other", None, "SAFETY CAR LIGHTS ON"],
            [0.0, "SessionStatus", None, "SESSION STARTED"],
            [217.0, "Other", None, "STANDING START"],
            [420.0, "Flag", "RED", "RED FLAG"],
        ])

    def test_downloads_bounded_start_telemetry_for_grid_leaders(self):
        grid = [{"driver_number": number, "position": place} for number, place in [(12, 3), (3, 1), (44, 2)]]

        def fetch(endpoint, **filters):
            self.assertEqual(endpoint, "car_data")
            self.assertEqual(filters["session_key"], 11731)
            self.assertEqual(filters["date>"], "2026-10-04T08:32:30+00:00")
            self.assertLess(milliseconds(filters["date<"]), self.start + 1000_000)
            return [{"driver_number": filters["driver_number"], "speed": 0}]

        with patch("build_race_replay.fetch", side_effect=fetch):
            telemetry = build_race_replay.fetch_start_telemetry(11731, self.controls, grid, [{"driver_number": 99}])
        self.assertEqual(list(telemetry), [3, 44, 12])
        self.assertEqual([rows[0]["driver_number"] for rows in telemetry.values()], [3, 44, 12])

    def test_missing_car_data_does_not_invent_telemetry_and_other_errors_propagate(self):
        grid = [{"driver_number": 3, "position": 1}]
        drivers = [{"driver_number": 3}]
        for status in (404, 401):
            error = HTTPError("https://api.openf1.org/v1/car_data", status, "missing", {}, None)
            with self.subTest(status=status), patch("build_race_replay.fetch", side_effect=error):
                if status == 404:
                    self.assertEqual(build_race_replay.fetch_start_telemetry(11731, self.controls, grid, drivers), {3: []})
                else:
                    with self.assertRaises(HTTPError):
                        build_race_replay.fetch_start_telemetry(11731, self.controls, grid, drivers)

    def test_attaches_launch_evidence_without_changing_the_replay_clock_or_telemetry(self):
        replay = {"start": "2026-10-04T08:33:00+00:00", "duration": 500,
                  "locations": {"3": [[0, 10, 20]]}, "raceControl": []}
        start = datetime.fromtimestamp(self.start / 1000, timezone.utc)
        samples = [{"date": (start + timedelta(seconds=seconds)).isoformat(),
                    "speed": 0 if seconds < 390 else 30, "throttle": 0 if seconds < 390 else 90}
                   for seconds in range(380, 393)]
        result = build_race_replay.with_start_phases(replay, self.controls, {3: samples, 12: samples, 44: samples})
        self.assertEqual(result["raceLaunches"], [{"time": 390, "drivers": [3, 12, 44], "source": "car_data"}])
        self.assertIn([-300, "Other", None, "SAFETY CAR LIGHTS ON"], result["raceControl"])
        self.assertIn([390, "StartPhase", None, "Racing"], result["raceControl"])
        self.assertEqual(result["locations"], replay["locations"])
        self.assertEqual(result["start"], replay["start"])
        self.assertEqual(replay["raceControl"], [])


class ReplayOutputTest(unittest.TestCase):
    def test_reimport_reuses_the_existing_catalog_filename(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            year = directory / "2026"
            year.mkdir()
            existing = year / "monza-2026.json"
            existing.write_text("{}")
            (year / "races-2026.json").write_text(json.dumps([
                {"id": "11361", "url": "/data/2026/monza-2026.json"},
            ]))
            self.assertEqual(build_race_replay.resolve_replay_output({"session_key": 11361, "year": 2026}, directory), existing)

    def test_new_session_uses_the_standard_season_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.assertEqual(build_race_replay.resolve_replay_output({"session_key": 11731, "year": 2026}, directory),
                             directory / "2026/race-11731-2026.json")


class RaceClockImportTest(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 11, 1, 20, 3, 25, tzinfo=timezone.utc)
        self.session = {"session_key": 11404, "meeting_key": 1298, "session_name": "Race",
                        "date_start": "2026-11-01T20:00:00+00:00", "gmt_offset": "-06:00:00"}
        self.controls = [self.control(0, "SESSION STARTED"),
                         self.control(90, "SESSION ABORTED"),
                         self.control(120, "SESSION STARTED"),
                         self.control(200, "SESSION FINISHED")]

    def date(self, seconds):
        return (self.start + timedelta(seconds=seconds)).isoformat()

    def control(self, seconds, message, category="SessionStatus"):
        return {"date": self.date(seconds), "category": category, "message": message}

    def build(self, controls):
        locations = [{"date": self.date(-86_400), "x": 10, "y": 20}] + [
            {"date": self.date(0.25 + index / 2),
             "x": 1000 * math.cos(index / 159 * math.tau),
             "y": 1000 * math.sin(index / 159 * math.tau)} for index in range(160)]
        responses = {
            "sessions": [{"session_key": 11403, "meeting_key": 1298, "session_name": "Qualifying",
                          "date_start": self.date(-172_800)}],
            "starting_grid": [{"driver_number": 1, "position": 1}],
            "drivers": [{"driver_number": 1, "full_name": "Test Driver", "name_acronym": "TST",
                         "team_name": "McLaren", "team_colour": "F47600"}],
            "laps": [{"date_start": self.date(0), "driver_number": 1, "lap_number": 1,
                      "lap_duration": 80}],
            "location": locations,
            "position": [{"date": self.date(-1), "driver_number": 1, "position": 1},
                         {"date": self.date(10), "driver_number": 1, "position": 1}],
            "pit": [], "weather": [], "stints": [], "overtakes": [], "car_data": [],
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "mexico.json"
            with patch("build_race_replay.fetch", side_effect=lambda endpoint, **filters: responses[endpoint]):
                build_race_replay.build_replay(self.session, output, controls)
            return json.loads(output.read_text())

    def test_ignores_previous_day_controls_and_starts_cars_at_the_race(self):
        controls = [self.control(-86_400, "SESSION STARTED"),
                    self.control(-85_000, "SESSION FINISHED"),
                    self.control(-300, "FORMATION LAP", "Other"), *self.controls]
        replay = self.build(controls)
        self.assertEqual(replay["start"], self.date(0))
        self.assertEqual(replay["duration"], 200)
        self.assertEqual(replay["locations"]["1"][0][0], 0.8)
        self.assertEqual(replay["positions"][0], [0, 1, 1])
        self.assertEqual(replay["laps"], [[0, 1, 1]])
        statuses = [row for row in replay["raceControl"] if row[1] == "SessionStatus"]
        self.assertEqual([row[0] for row in statuses], [0, 90, 120, 200])
        self.assertIn([-300, "Other", None, "FORMATION LAP"], replay["raceControl"])

    def test_preserves_a_delayed_start_and_its_restart(self):
        self.session = {**self.session, "date_start": "2026-11-01T18:00:00+00:00"}
        replay = self.build(self.controls)
        self.assertEqual(replay["start"], self.date(0))
        self.assertEqual(replay["duration"], 200)

    def test_rejects_a_race_without_a_start_in_its_session(self):
        controls = [self.control(-86_400, "SESSION STARTED"), self.controls[-1]]
        with self.assertRaisesRegex(RuntimeError, "Race start or finish is missing"):
            self.build(controls)


if __name__ == "__main__":
    unittest.main()
