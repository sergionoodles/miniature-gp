import unittest
import json
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


if __name__ == "__main__":
    unittest.main()
