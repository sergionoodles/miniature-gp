import unittest

from build_monza_replay import milliseconds, sample_locations


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


if __name__ == "__main__":
    unittest.main()
