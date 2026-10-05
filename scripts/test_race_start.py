import unittest
from datetime import datetime, timedelta, timezone

from race_start import build_start_phases


START = datetime(2026, 9, 20, 16, tzinfo=timezone.utc)
START_MS = START.timestamp() * 1000


def control(seconds, message, **fields):
    return {"date": (START + timedelta(seconds=seconds)).isoformat(), "message": message, **fields}


def telemetry(departure, driver, throttle=90, gap=False):
    offsets = list(range(-6, 0)) + [0, 1, 2, 3]
    if gap:
        offsets = [-6, -5, -4, -3, -2, -1, 0, 4, 5]
    return [{"date": (START + timedelta(seconds=departure + offset)).isoformat(),
             "driver_number": driver, "speed": 0 if offset < 0 else (8 if offset == 0 else 30),
             "throttle": 0 if offset < 0 else throttle} for offset in offsets]


def field(departure=10, **options):
    return {number: telemetry(departure, number, **options) for number in (12, 63, 1)}


class RaceStartTest(unittest.TestCase):
    def build(self, controls, samples):
        return build_start_phases(controls, samples, START_MS, START_MS + 600_000)

    def test_ordinary_start_requires_corroborated_launch(self):
        phases, launches = self.build([control(0, "SESSION_STARTED")], field())
        self.assertEqual(phases, [[0, "StartPhase", None, "Waiting for start"],
                                  [10, "StartPhase", None, "Racing"]])
        self.assertEqual(launches, [{"time": 10, "drivers": [1, 12, 63], "source": "car_data"}])

    def test_formation_departure_is_ignored_before_standing_instruction(self):
        samples = {number: telemetry(10, number) + telemetry(100, number) for number in (12, 63, 1)}
        phases, launches = self.build([control(-5, "FORMATION LAP(S) BEHIND SAFETY CAR"),
                                      control(0, "SESSION_STARTED"), control(90, "STANDING START")], samples)
        self.assertEqual([event[3] for event in phases], ["Formation lap", "Waiting for start", "Racing"])
        self.assertEqual(launches[0]["time"], 100)

    def test_waits_for_a_cohort_and_uses_earliest_departure(self):
        samples = {12: telemetry(10, 12), 63: telemetry(12, 63), 1: telemetry(14, 1)}
        phases, launches = self.build([control(0, "SESSION_STARTED")], samples)
        self.assertEqual(launches[0]["time"], 10)
        self.assertEqual(phases[-1][0], 10)
        self.assertEqual(self.build([], {12: telemetry(10, 12), 63: telemetry(20, 63),
                                         1: telemetry(30, 1)})[1], [])

    def test_rejects_throttle_only_and_moving_safety_car_samples(self):
        self.assertEqual(self.build([], field(throttle=0))[1], [])
        stationary = {number: [{**sample, "speed": 0, "throttle": 100}
                               for sample in telemetry(10, number)] for number in (12, 63, 1)}
        self.assertEqual(self.build([], stationary)[1], [])
        moving = {number: [{**sample, "speed": 30} for sample in telemetry(10, number)]
                  for number in (12, 63, 1)}
        self.assertEqual(self.build([], moving)[1], [])

    def test_rejects_gaps_and_insufficient_driver_data(self):
        self.assertEqual(self.build([], field(gap=True))[1], [])
        self.assertEqual(self.build([], {12: telemetry(10, 12), 63: telemetry(10, 63)})[1], [])
        self.assertEqual(self.build([], {})[1], [])

    def test_red_flag_allows_a_corroborated_restart(self):
        samples = {number: telemetry(10, number) + telemetry(100, number) for number in (12, 63, 1)}
        controls = [control(0, "SESSION_STARTED"), control(20, "START ORDER: ORIGINAL GRID"),
                    control(50, "SESSION_ABORTED"), control(90, "STANDING START")]
        phases, launches = self.build(controls, samples)
        self.assertEqual([event[3] for event in phases],
                         ["Waiting for start", "Racing", "Start suspended", "Waiting for start", "Racing"])
        self.assertEqual([launch["time"] for launch in launches], [10, 100])

    def test_preserves_prestart_state_and_sorts_input_without_mutation(self):
        controls = [control(0, "SESSION_STARTED"), control(-20, "STARTING PROCEDURE SUSPENDED"),
                    control(-40, "DELAYED START"), control(-30, "FORMATION LAP")]
        phases, _ = self.build(controls, {})
        self.assertEqual([event[0] for event in phases], [-40, -30, -20, 0])
        self.assertEqual([event[3] for event in phases],
                         ["Delayed start", "Formation lap", "Start suspended", "Waiting for start"])
        self.assertEqual(controls[0]["message"], "SESSION_STARTED")

    def test_negative_normal_launch_survives_session_started(self):
        phases, launches = self.build([control(0, "SESSION_STARTED")], field(-10))
        self.assertEqual(phases, [[-10, "StartPhase", None, "Racing"]])
        self.assertEqual(launches[0]["time"], -10)

    def test_ordinary_formation_allows_confirmed_normal_launch(self):
        phases, launches = self.build([control(-60, "FORMATION LAP"),
                                      control(0, "SESSION_STARTED")], field(10))
        self.assertEqual([event[3] for event in phases],
                         ["Formation lap", "Waiting for start", "Racing"])
        self.assertEqual(launches[0]["time"], 10)

    def test_ordinary_formation_allows_negative_normal_launch(self):
        phases, launches = self.build([control(-60, "FORMATION LAP"),
                                      control(0, "SESSION_STARTED")], field(-10))
        self.assertEqual([event[3] for event in phases], ["Formation lap", "Racing"])
        self.assertEqual(launches[0]["time"], -10)

    def test_safety_car_formation_does_not_infer_initial_departure(self):
        _, launches = self.build([control(-60, "FORMATION LAP(S) BEHIND SAFETY CAR"),
                                 control(0, "SESSION_STARTED")], field(10))
        self.assertEqual(launches, [])

    def test_rolling_start_requires_control_and_moving_acceleration(self):
        samples = {number: [
            {"date": (START + timedelta(seconds=seconds)).isoformat(),
             "speed": speed, "throttle": throttle}
            for seconds, speed, throttle in [(98, 70, 20), (99, 70, 20),
                                              (100, 95, 90), (101, 125, 100), (102, 145, 100)]]
                   for number in (12, 63, 1)}
        controls = [control(-10, "FORMATION LAP(S) BEHIND SAFETY CAR"),
                    control(0, "SESSION_STARTED"), control(90, "ROLLING START"),
                    control(95, "GREEN FLAG", flag="GREEN")]
        phases, launches = self.build(controls, samples)
        self.assertEqual(phases[-1], [100, "StartPhase", None, "Racing"])
        self.assertEqual(launches[0]["time"], 100)
        self.assertEqual(self.build(controls[:-1], samples)[1], [])
        withdrawal = controls[:-1] + [control(95, "SAFETY CAR IN THIS LAP")]
        self.assertEqual(self.build(withdrawal, samples)[1][0]["time"], 100)
        cruising = {number: [{**sample, "speed": 90, "throttle": 70} for sample in rows]
                    for number, rows in samples.items()}
        self.assertEqual(self.build(controls, cruising)[1], [])

    def test_rolling_start_remains_formation_without_standing_evidence(self):
        phases, launches = self.build([control(-10, "ROLLING START"), control(0, "SESSION_STARTED")], {})
        self.assertEqual(phases, [[-10, "StartPhase", None, "Formation lap"]])
        self.assertEqual(launches, [])

    def test_safety_car_lights_preserve_formation_at_session_start(self):
        phases, _ = self.build([control(-10, "SAFETY CAR LIGHTS ON"), control(0, "SESSION_STARTED")], {})
        self.assertEqual(phases, [[-10, "StartPhase", None, "Formation lap"]])

    def test_session_finished_ends_inference(self):
        phases, launches = self.build([control(0, "SESSION_STARTED"), control(5, "SESSION_FINISHED")], field())
        self.assertEqual(launches, [])
        self.assertEqual(phases[-1][3], "Waiting for start")

    def test_red_flag_suspends_and_finished_blocks_restart(self):
        phases, launches = self.build([control(0, "SESSION_STARTED"),
                                      control(50, "RED FLAG", flag="RED"),
                                      control(90, "STANDING START"),
                                      control(95, "SESSION_FINISHED")], field(100))
        self.assertEqual([event[3] for event in phases],
                         ["Waiting for start", "Start suspended", "Waiting for start"])
        self.assertEqual(launches, [])

    def test_single_fast_sample_and_missing_fields_do_not_infer_launch(self):
        samples = {number: telemetry(10, number)[:-2] + [{"driver_number": number}]
                   for number in (12, 63, 1)}
        self.assertEqual(self.build([], samples)[1], [])

    def test_rejects_launch_without_a_full_stopped_interval(self):
        samples = {number: telemetry(10, number)[1:] for number in (12, 63, 1)}
        self.assertEqual(self.build([], samples)[1], [])


if __name__ == "__main__":
    unittest.main()
