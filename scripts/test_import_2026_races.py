import json
import math
import tempfile
import unittest
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

from build_monza_replay import fetch, select_track
from import_2026_races import local_race_date, run_import


NOW = datetime(2026, 9, 24, tzinfo=timezone.utc)


def session(key, date, **changes):
    return {"session_key": key, "meeting_key": key, "session_name": "Race",
            "date_start": f"{date}T16:00:00+00:00", "date_end": f"{date}T18:00:00+00:00",
            "gmt_offset": "-04:00:00", "country_code": "USA", "circuit_short_name": "Miami",
            "is_cancelled": False, **changes}


def meeting(key):
    return {"meeting_key": key, "meeting_name": f"Grand Prix {key}", "location": "Miami"}


def replay(key):
    return {"sessionKey": key, "laps": [[0, 1, 57]]}


class ImportRacesTest(unittest.TestCase):
    def test_keeps_published_races_when_session_listing_is_incomplete(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "existing-2026.json").write_text(json.dumps(replay(1)))
            previous = [{"id": "1", "date": "2026-09-20", "url": "/data/existing-2026.json"}]
            (directory / "races-2026.json").write_text(json.dumps(previous))
            with patch("import_2026_races.fetch", return_value=[]):
                run_import(directory, NOW)
            self.assertEqual(json.loads((directory / "races-2026.json").read_text()), previous)

    def test_imports_only_new_finished_races_and_writes_a_repeatable_catalog(self):
        sessions = [session(1, "2026-09-20"), session(2, "2026-09-21"),
                    session(3, "2026-10-01"), session(4, "2026-09-22", is_cancelled=True),
                    session(5, "2026-09-23"), session(6, "2026-09-23")]
        responses = {
            ("sessions", None): sessions, ("meetings", None): [meeting(key) for key in range(1, 7)],
            ("race_control", 2): [{"category": "SessionStatus", "message": "SESSION FINISHED"}],
            ("session_result", 2): [{"number_of_laps": 58}],
            ("race_control", 5): [],
            ("race_control", 6): [{"category": "SessionStatus", "message": "SESSION FINISHED"}],
            ("session_result", 6): [],
        }

        def fetch_stub(endpoint, **filters):
            return responses[(endpoint, filters.get("session_key"))]

        def build_stub(race_session, path, controls, total_laps):
            self.assertEqual(race_session["session_key"], 2)
            self.assertEqual(controls, responses[("race_control", 2)])
            self.assertEqual(total_laps, 58)
            path.write_text(json.dumps({**replay(2), "totalLaps": total_laps}))

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "existing-2026.json").write_text(json.dumps(replay(1)))
            with patch("import_2026_races.fetch", side_effect=fetch_stub), patch("import_2026_races.build_replay", side_effect=build_stub) as build:
                run_import(directory, NOW)
                first_catalog = (directory / "races-2026.json").read_text()
                run_import(directory, NOW)
            self.assertEqual(build.call_count, 1)
            self.assertEqual((directory / "races-2026.json").read_text(), first_catalog)
            entries = json.loads(first_catalog)
            self.assertEqual([entry["id"] for entry in entries], ["2", "1"])
            self.assertEqual(entries[0]["laps"], 58)
            self.assertEqual(entries[0]["date"], "2026-09-21")
            self.assertEqual(entries[0]["url"], "/data/race-2-2026.json")

    def test_reports_import_errors_after_writing_successful_races(self):
        sessions = [session(1, "2026-09-20"), session(2, "2026-09-21")]

        def fetch_stub(endpoint, **filters):
            if endpoint == "sessions":
                return sessions
            if endpoint == "meetings":
                return [meeting(1), meeting(2)]
            if endpoint == "race_control":
                return [{"category": "SessionStatus", "message": "SESSION FINISHED"}]
            return [{"number_of_laps": 58}]

        def build_stub(race_session, path, controls, total_laps):
            if race_session["session_key"] == 1:
                raise ValueError("missing GPS")
            path.write_text(json.dumps({**replay(2), "totalLaps": total_laps}))

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch("import_2026_races.fetch", side_effect=fetch_stub), patch("import_2026_races.build_replay", side_effect=build_stub):
                with self.assertRaisesRegex(RuntimeError, "1 race import"):
                    run_import(directory, NOW)
            entries = json.loads((directory / "races-2026.json").read_text())
            self.assertEqual([entry["id"] for entry in entries], ["2"])
            self.assertFalse((directory / "race-1-2026.json").exists())


class TrackSelectionTest(unittest.TestCase):
    def test_uses_a_complete_non_pit_lap_when_first_candidate_has_no_gps(self):
        laps = [{"driver_number": number, "lap_number": number + 9,
                 "date_start": "2026-09-20T16:30:00+00:00", "lap_duration": 90,
                 "is_pit_out_lap": False} for number in (1, 2)]
        circle = [{"x": round(100 * math.cos(index * 2 * math.pi / 120)),
                   "y": round(100 * math.sin(index * 2 * math.pi / 120))} for index in range(120)]

        def fetch_stub(endpoint, **filters):
            return [] if filters["driver_number"] == 1 else circle

        with patch("build_monza_replay.fetch", side_effect=fetch_stub):
            track = select_track(laps, 123)
        self.assertEqual(len(track), 60)
        self.assertEqual(track[0], [100, 0])

    def test_rejects_a_session_without_a_complete_track_lap(self):
        laps = [{"driver_number": 1, "lap_number": 10,
                 "date_start": "2026-09-20T16:30:00+00:00", "lap_duration": 90}]
        with patch("build_monza_replay.fetch", return_value=[]), self.assertRaisesRegex(ValueError, "No complete GPS lap"):
            select_track(laps, 123)


class ImportMetadataTest(unittest.TestCase):
    def test_uses_the_local_date_for_a_race_after_utc_midnight(self):
        race = session(1, "2026-11-22", date_start="2026-11-22T04:00:00+00:00", gmt_offset="-08:00:00")
        self.assertEqual(local_race_date(race), "2026-11-21")

    def test_retries_rate_limits_using_retry_after(self):
        rate_limit = HTTPError("https://api.openf1.org/v1/sessions", 429, "rate limited", {"Retry-After": "3"}, None)
        self.addCleanup(rate_limit.close)
        with patch("build_monza_replay.urlopen", side_effect=[rate_limit, BytesIO(b"[]")]), patch("build_monza_replay.time.sleep") as sleep:
            self.assertEqual(fetch("sessions", year=2026), [])
        sleep.assert_called_once_with(3)

    def test_waits_out_live_session_restriction(self):
        live_session = HTTPError("https://api.openf1.org/v1/sessions", 401, "unauthorized", {},
                                 BytesIO(b'{"detail":"Live F1 session in progress. Global API access is restricted."}'))
        self.addCleanup(live_session.close)
        with patch("build_monza_replay.urlopen", side_effect=[live_session, BytesIO(b"[]")]), patch("build_monza_replay.time.sleep") as sleep:
            self.assertEqual(fetch("sessions", year=2026), [])
        sleep.assert_called_once_with(300)

    def test_rejects_other_unauthorized_responses_without_waiting(self):
        invalid_auth = HTTPError("https://api.openf1.org/v1/sessions", 401, "unauthorized", {},
                                 BytesIO(b'{"detail":"Invalid credentials"}'))
        self.addCleanup(invalid_auth.close)
        with patch("build_monza_replay.urlopen", side_effect=invalid_auth), patch("build_monza_replay.time.sleep") as sleep:
            with self.assertRaises(HTTPError):
                fetch("sessions", year=2026)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
