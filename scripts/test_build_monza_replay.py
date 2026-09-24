import unittest

from build_monza_replay import milliseconds, sample_locations, with_race_events, with_session_metadata


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


if __name__ == "__main__":
    unittest.main()
