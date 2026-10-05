import json
import math
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

from build_race_replay import fetch, select_track
from import_races import local_race_date, run_import


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
    def test_uses_current_year_when_no_year_is_given(self):
        current_time = datetime(2027, 9, 24, tzinfo=timezone.utc)

        def fetch_stub(endpoint, **filters):
            if filters.get("year") != 2027:
                raise AssertionError("Requested the wrong season")
            return [session(1, "2027-09-20")] if endpoint == "sessions" else [meeting(1)]

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2027").mkdir()
            (directory / "2027/existing-2027.json").write_text(json.dumps(replay(1)))
            with patch("import_races.fetch", side_effect=fetch_stub):
                run_import(directory, current_time)
            self.assertEqual(json.loads((directory / "2027/races-2027.json").read_text())[0]["id"], "1")
            self.assertEqual(json.loads((directory / "years.json").read_text()), [2027])

    def test_explicit_year_overrides_current_year(self):
        def fetch_stub(endpoint, **filters):
            if endpoint in ("sessions", "meetings") and filters.get("year") != 2025:
                raise AssertionError("Requested the wrong season")
            if endpoint == "sessions":
                return [session(1, "2025-09-20"), session(2, "2025-09-21")]
            if endpoint == "meetings":
                return [meeting(1), meeting(2)]
            if endpoint == "race_control":
                return [{"category": "SessionStatus", "message": "SESSION FINISHED"}]
            return [{"number_of_laps": 58}]

        def build_stub(race_session, path, controls, total_laps):
            path.write_text(json.dumps({**replay(race_session["session_key"]), "totalLaps": total_laps}))

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2025").mkdir()
            (directory / "2026").mkdir()
            (directory / "2025/existing-2025.json").write_text(json.dumps(replay(1)))
            (directory / "2026/existing-2026.json").write_text(json.dumps(replay(2)))
            with patch("import_races.fetch", side_effect=fetch_stub), patch("import_races.build_replay", side_effect=build_stub):
                run_import(directory, NOW, year=2025)
            urls = [entry["url"] for entry in json.loads((directory / "2025/races-2025.json").read_text())]
            self.assertEqual(urls, ["/data/2025/2025-09-21-USA-MIAMI-2.json", "/data/2025/existing-2025.json"])
            self.assertTrue((directory / "2025/2025-09-21-USA-MIAMI-2.json").exists())
            self.assertFalse((directory / "2026/races-2026.json").exists())
            self.assertEqual(json.loads((directory / "years.json").read_text()), [2025])

    def test_command_line_documents_year_flag(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("import_races.py")), "--help"],
                                capture_output=True, text=True, check=True)
        self.assertIn("--year", result.stdout)
        self.assertIn("--catalog-only", result.stdout)

    def test_catalog_only_discovers_replays_added_to_existing_year(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2025").mkdir()
            (directory / "2025/existing-2025.json").write_text(json.dumps(replay(1)))
            (directory / "2025/2025-09-21-USA-MIAMI-2.json").write_text(json.dumps({**replay(2), "start": "2025-09-21T16:00:00+00:00", "gmt_offset": "-04:00:00"}))
            previous = [{"id": "1", "url": "/data/2025/existing-2025.json", "date": "2025-09-20", "countryCode": "USA"}]
            (directory / "2025/races-2025.json").write_text(json.dumps(previous))
            schedule = [{"date": "2025-09-21", "raceName": "Miami Grand Prix", "Circuit": {
                "circuitName": "Miami International Autodrome", "Location": {"country": "USA", "locality": "Miami"}}}]
            with patch("import_races.fetch_schedule", return_value=schedule) as schedule_mock, patch("import_races.build_replay") as build_mock:
                run_import(directory, NOW, catalog_only=True)
                run_import(directory, NOW, catalog_only=True)
            schedule_mock.assert_called_once_with(2025)
            build_mock.assert_not_called()
            entries = json.loads((directory / "2025/races-2025.json").read_text())
            self.assertEqual([entry["id"] for entry in entries], ["2", "1"])
            self.assertEqual(entries[0]["url"], "/data/2025/2025-09-21-USA-MIAMI-2.json")
            self.assertEqual(entries[0]["countryCode"], "USA")
            self.assertEqual(json.loads((directory / "years.json").read_text()), [2025])

    def test_catalog_only_rejects_replay_without_a_matching_race(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2025").mkdir()
            (directory / "2025/race-2-2025.json").write_text(json.dumps({**replay(2), "start": "2025-09-21T16:00:00+00:00"}))
            with patch("import_races.fetch_schedule", return_value=[]), self.assertRaises(KeyError):
                run_import(directory, NOW, catalog_only=True)
            self.assertFalse((directory / "2025/races-2025.json").exists())

    def test_rejects_years_before_openf1_history(self):
        with tempfile.TemporaryDirectory() as temporary, patch("import_races.fetch", return_value=[]), self.assertRaisesRegex(ValueError, "2023"):
            run_import(Path(temporary), NOW, year=2022)

    def test_lists_only_years_with_cataloged_races(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2024").mkdir()
            (directory / "2024/races-2024.json").write_text('[{"id":"1"}]')
            (directory / "2025").mkdir()
            (directory / "2025/races-2025.json").write_text('[]')
            with patch("import_races.fetch", return_value=[]):
                run_import(directory, NOW)
            self.assertEqual(json.loads((directory / "years.json").read_text()), [2024])
            self.assertFalse((directory / "2026").exists())

    def test_keeps_published_races_when_session_listing_is_incomplete(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / "2026").mkdir()
            (directory / "2026/existing-2026.json").write_text(json.dumps(replay(1)))
            previous = [{"id": "1", "date": "2026-09-20", "url": "/data/2026/existing-2026.json"}]
            (directory / "2026/races-2026.json").write_text(json.dumps(previous))
            with patch("import_races.fetch", return_value=[]):
                run_import(directory, NOW)
            self.assertEqual(json.loads((directory / "2026/races-2026.json").read_text()), previous)

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
            (directory / "2026").mkdir()
            (directory / "2026/existing-2026.json").write_text(json.dumps(replay(1)))
            with patch("import_races.fetch", side_effect=fetch_stub), patch("import_races.build_replay", side_effect=build_stub) as build:
                run_import(directory, NOW)
                first_catalog = (directory / "2026/races-2026.json").read_text()
                run_import(directory, NOW)
            self.assertEqual(build.call_count, 1)
            self.assertEqual((directory / "2026/races-2026.json").read_text(), first_catalog)
            entries = json.loads(first_catalog)
            self.assertEqual([entry["id"] for entry in entries], ["2", "1"])
            self.assertEqual(entries[0]["laps"], 58)
            self.assertEqual(entries[0]["date"], "2026-09-21")
            self.assertEqual(entries[0]["url"], "/data/2026/2026-09-21-USA-MIAMI-2.json")

    def test_filename_uses_local_date_and_normalizes_circuit_name(self):
        race_session = session(1, "2026-09-21", date_start="2026-09-21T04:00:00+00:00",
                               gmt_offset="-08:00:00", circuit_short_name="Las Vegas / Strip")

        def fetch_stub(endpoint, **filters):
            if endpoint == "sessions":
                return [race_session]
            if endpoint == "meetings":
                return [meeting(1)]
            if endpoint == "race_control":
                return [{"category": "SessionStatus", "message": "SESSION FINISHED"}]
            return [{"number_of_laps": 57}]

        def build_stub(race_session, path, controls, total_laps):
            path.write_text(json.dumps(replay(1)))

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch("import_races.fetch", side_effect=fetch_stub), patch("import_races.build_replay", side_effect=build_stub):
                run_import(directory, NOW)
            filename = "2026-09-20-USA-LAS-VEGAS-STRIP-1.json"
            self.assertTrue((directory / "2026" / filename).exists())
            entries = json.loads((directory / "2026/races-2026.json").read_text())
            self.assertEqual(entries[0]["url"], f"/data/2026/{filename}")

    def test_filename_converts_racing_country_codes_to_iso_codes(self):
        codes = [("BRN", "BHR"), ("NED", "NLD"), ("KSA", "SAU"),
                 ("UAE", "ARE"), ("MON", "MCO"), ("MAS", "MYS")]
        sessions = [session(key, "2026-09-20", country_code=code)
                    for key, (code, _) in enumerate(codes, start=1)]

        def fetch_stub(endpoint, **filters):
            if endpoint == "sessions":
                return sessions
            if endpoint == "meetings":
                return [meeting(row["session_key"]) for row in sessions]
            if endpoint == "race_control":
                return [{"category": "SessionStatus", "message": "SESSION FINISHED"}]
            return [{"number_of_laps": 57}]

        def build_stub(race_session, path, controls, total_laps):
            path.write_text(json.dumps(replay(race_session["session_key"])))

        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with patch("import_races.fetch", side_effect=fetch_stub), patch("import_races.build_replay", side_effect=build_stub):
                run_import(directory, NOW)
            entries = json.loads((directory / "2026/races-2026.json").read_text())
            expected_urls = [f"/data/2026/2026-09-20-{code}-MIAMI-{key}.json"
                             for key, (_, code) in enumerate(codes, start=1)]
            self.assertEqual([entry["url"] for entry in entries], expected_urls)
            self.assertTrue(all((directory / entry["url"].removeprefix("/data/")).exists()
                                for entry in entries))

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
            with patch("import_races.fetch", side_effect=fetch_stub), patch("import_races.build_replay", side_effect=build_stub):
                with self.assertRaisesRegex(RuntimeError, "1 race import"):
                    run_import(directory, NOW)
            entries = json.loads((directory / "2026/races-2026.json").read_text())
            self.assertEqual([entry["id"] for entry in entries], ["2"])
            self.assertFalse((directory / "2026/race-1-2026.json").exists())
            self.assertEqual(json.loads((directory / "years.json").read_text()), [2026])


class TrackSelectionTest(unittest.TestCase):
    def test_uses_a_complete_non_pit_lap_when_first_candidate_has_no_gps(self):
        laps = [{"driver_number": number, "lap_number": number + 9,
                 "date_start": "2026-09-20T16:30:00+00:00", "lap_duration": 90,
                 "is_pit_out_lap": False} for number in (1, 2)]
        lap_start = datetime.fromisoformat(laps[0]["date_start"])
        circle = [{"date": (lap_start + timedelta(seconds=0.001 + index * 0.75)).isoformat(),
                   "x": round(100 * math.cos(index * 2 * math.pi / 120)),
                   "y": round(100 * math.sin(index * 2 * math.pi / 120))} for index in range(120)]
        circle.append({"x": 0, "y": 0})

        def fetch_stub(endpoint, **filters):
            return [] if filters["driver_number"] == 1 else circle

        with patch("build_race_replay.fetch", side_effect=fetch_stub):
            track = select_track(laps, 123)
        self.assertEqual(len(track), 60)
        self.assertEqual(track[0], [100, 0])

    def test_rejects_a_session_without_a_complete_track_lap(self):
        laps = [{"driver_number": 1, "lap_number": 10,
                 "date_start": "2026-09-20T16:30:00+00:00", "lap_duration": 90}]
        with patch("build_race_replay.fetch", return_value=[]), self.assertRaisesRegex(ValueError, "No complete GPS lap"):
            select_track(laps, 123)


class ImportMetadataTest(unittest.TestCase):
    def test_uses_the_local_date_for_a_race_after_utc_midnight(self):
        race = session(1, "2026-11-22", date_start="2026-11-22T04:00:00+00:00", gmt_offset="-08:00:00")
        self.assertEqual(local_race_date(race), "2026-11-21")

    def test_retries_rate_limits_using_retry_after(self):
        rate_limit = HTTPError("https://api.openf1.org/v1/sessions", 429, "rate limited", {"Retry-After": "3"}, None)
        self.addCleanup(rate_limit.close)
        with patch("build_race_replay.urlopen", side_effect=[rate_limit, BytesIO(b"[]")]), patch("build_race_replay.time.sleep") as sleep:
            self.assertEqual(fetch("sessions", year=2026), [])
        sleep.assert_called_once_with(3)

    def test_waits_out_live_session_restriction(self):
        live_session = HTTPError("https://api.openf1.org/v1/sessions", 401, "unauthorized", {},
                                 BytesIO(b'{"detail":"Live F1 session in progress. Global API access is restricted."}'))
        self.addCleanup(live_session.close)
        with patch("build_race_replay.urlopen", side_effect=[live_session, BytesIO(b"[]")]), patch("build_race_replay.time.sleep") as sleep:
            self.assertEqual(fetch("sessions", year=2026), [])
        sleep.assert_called_once_with(300)

    def test_rejects_other_unauthorized_responses_without_waiting(self):
        invalid_auth = HTTPError("https://api.openf1.org/v1/sessions", 401, "unauthorized", {},
                                 BytesIO(b'{"detail":"Invalid credentials"}'))
        self.addCleanup(invalid_auth.close)
        with patch("build_race_replay.urlopen", side_effect=invalid_auth), patch("build_race_replay.time.sleep") as sleep:
            with self.assertRaises(HTTPError):
                fetch("sessions", year=2026)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
