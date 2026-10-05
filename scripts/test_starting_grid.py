import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from build_race_replay import fetch_starting_grid


class StartingGridLookupTest(unittest.TestCase):
    def setUp(self):
        self.race = {"session_key": 11731, "meeting_key": 1308,
                     "session_name": "Race", "date_start": "2026-10-04T07:00:00+00:00"}
        self.qualifying = {"session_key": 11730, "meeting_key": 1308,
                           "session_name": "Qualifying", "date_start": "2026-10-03T07:00:00+00:00"}
        self.grid = [{"driver_number": 1, "position": 1}]

    def fetch_from(self, sessions, grid=None):
        def fetch(endpoint, **filters):
            if endpoint == "sessions":
                self.assertEqual(filters, {"meeting_key": 1308})
                return sessions
            self.assertEqual(endpoint, "starting_grid")
            self.assertEqual(filters, {"session_key": 11730})
            return self.grid if grid is None else grid
        return fetch

    def test_fetches_grid_for_qualifying_session_instead_of_race(self):
        with patch("build_race_replay.fetch", side_effect=self.fetch_from([self.qualifying])):
            self.assertEqual(fetch_starting_grid(self.race), self.grid)

    def test_selects_latest_matching_session_before_race(self):
        sessions = [
            {**self.qualifying, "session_key": 100, "date_start": "2026-10-02T07:00:00+00:00"},
            {**self.qualifying, "session_key": 999, "date_start": "2026-10-05T07:00:00+00:00"},
            {**self.qualifying, "session_key": 888, "meeting_key": 1000},
            {**self.qualifying, "session_key": 777, "session_name": "Sprint Qualifying"},
            self.qualifying,
        ]
        with patch("build_race_replay.fetch", side_effect=self.fetch_from(sessions)):
            self.assertEqual(fetch_starting_grid(self.race), self.grid)

    def test_resolves_both_sprint_qualifying_names(self):
        for name in ("Sprint Qualifying", "Sprint Shootout"):
            with self.subTest(name=name):
                sessions = [{**self.qualifying, "session_key": 100},
                            {**self.qualifying, "session_name": name}]
                with patch("build_race_replay.fetch", side_effect=self.fetch_from(sessions)):
                    self.assertEqual(fetch_starting_grid({**self.race, "session_name": "Sprint"}), self.grid)

    def test_returns_empty_when_no_qualifying_session_exists(self):
        with patch("build_race_replay.fetch", side_effect=self.fetch_from([self.race])):
            self.assertEqual(fetch_starting_grid(self.race), [])

    def test_preserves_empty_grid_for_position_fallback(self):
        with patch("build_race_replay.fetch", side_effect=self.fetch_from([self.qualifying], [])):
            self.assertEqual(fetch_starting_grid(self.race), [])

    def test_preserves_404_fallback_for_sessions_or_grid(self):
        error = HTTPError("https://api.openf1.org", 404, "No results found", None, None)
        for responses in ([error], [[self.qualifying], error]):
            with self.subTest(responses=responses):
                with patch("build_race_replay.fetch", side_effect=responses):
                    self.assertEqual(fetch_starting_grid(self.race), [])

    def test_propagates_api_errors_other_than_404(self):
        error = HTTPError("https://api.openf1.org", 401, "Unauthorized", None, None)
        for responses in ([error], [[self.qualifying], error]):
            with self.subTest(responses=responses):
                with patch("build_race_replay.fetch", side_effect=responses):
                    with self.assertRaises(HTTPError):
                        fetch_starting_grid(self.race)


if __name__ == "__main__":
    unittest.main()
