"""Infer start phases from race control and corroborated standing launches."""

from datetime import datetime


STOPPED_SPEED = 3
LAUNCH_SPEED = 15
LAUNCH_THROTTLE = 50
STOPPED_DURATION_MS = 5_000
LAUNCH_DURATION_MS = 1_000
MAX_SAMPLE_GAP_MS = 2_000
COHORT_WINDOW_MS = 5_000
MIN_COHORT_DRIVERS = 3
NORMAL_START_EARLIEST_MS = 30_000
ROLLING_ACCELERATION = 20


def timestamp_ms(date):
    return datetime.fromisoformat(date.replace("Z", "+00:00")).timestamp() * 1000


def find_driver_departures(samples):
    departures = []
    stopped_since = None
    departure = None
    fast_since = None
    previous_time = None
    last_stopped = None
    dated_samples = [sample for sample in samples if sample.get("date")]
    for sample in sorted(dated_samples, key=lambda item: timestamp_ms(item["date"])):
        if sample.get("speed") is None:
            continue
        time = timestamp_ms(sample["date"])
        speed = sample["speed"]
        if previous_time is not None and time - previous_time > MAX_SAMPLE_GAP_MS:
            stopped_since = None
            departure = None
            fast_since = None
        previous_time = time
        if speed <= STOPPED_SPEED:
            stopped_since = time if stopped_since is None else stopped_since
            last_stopped = time
            departure = None
            fast_since = None
            continue
        if departure is None:
            if stopped_since is None or last_stopped - stopped_since < STOPPED_DURATION_MS:
                stopped_since = None
                continue
            departure = time
        if speed >= LAUNCH_SPEED and (sample.get("throttle") or 0) >= LAUNCH_THROTTLE:
            fast_since = time if fast_since is None else fast_since
            if time - fast_since >= LAUNCH_DURATION_MS:
                departures.append(departure)
                stopped_since = None
                departure = None
                fast_since = None
        else:
            fast_since = None
    return departures


def find_rolling_departures(samples):
    departures = []
    baseline = None
    departure = None
    fast_since = None
    previous_time = None
    dated_samples = [sample for sample in samples if sample.get("date")]
    for sample in sorted(dated_samples, key=lambda item: timestamp_ms(item["date"])):
        time = timestamp_ms(sample["date"])
        speed = sample.get("speed")
        throttle = sample.get("throttle")
        if (speed is None or throttle is None or previous_time is not None
                and time - previous_time > MAX_SAMPLE_GAP_MS):
            baseline = None
            departure = None
            fast_since = None
        previous_time = time
        if speed is None or throttle is None:
            continue
        if speed <= STOPPED_SPEED or throttle < LAUNCH_THROTTLE:
            baseline = speed if speed > STOPPED_SPEED else None
            departure = None
            fast_since = None
            continue
        if baseline is None:
            continue
        departure = time if departure is None else departure
        if speed < baseline + ROLLING_ACCELERATION:
            fast_since = None
            continue
        fast_since = time if fast_since is None else fast_since
        if time - fast_since >= LAUNCH_DURATION_MS:
            departures.append(departure)
            baseline = None
            departure = None
            fast_since = None
    return departures


def find_launch_cohorts(telemetry_by_driver, find_departures=find_driver_departures):
    departures = sorted((time, int(driver)) for driver, samples in telemetry_by_driver.items()
                        for time in find_departures(samples))
    cohorts = []
    consumed_until = float("-inf")
    for time, _ in departures:
        if time <= consumed_until:
            continue
        nearby = [(other_time, driver) for other_time, driver in departures
                  if time <= other_time <= time + COHORT_WINDOW_MS]
        drivers = sorted({driver for _, driver in nearby})
        if len(drivers) >= MIN_COHORT_DRIVERS:
            cohorts.append((time, drivers))
            consumed_until = max(other_time for other_time, _ in nearby)
    return cohorts


def control_message(control):
    return (control.get("message") or "").upper().replace("_", " ")


def is_suspension(control):
    message = control_message(control)
    return ("STARTING PROCEDURE SUSPENDED" in message or "SESSION ABORTED" in message
            or control.get("flag") == "RED")


def classify_control(control, phase, pending_formation):
    message = control_message(control)
    if is_suspension(control):
        return "Start suspended", False
    if phase == "Racing":
        return phase, pending_formation
    if "DELAYED START" in message:
        return "Delayed start", False
    if ("FORMATION LAP" in message or "SAFETY CAR LIGHTS ON" in message
            or "ROLLING START" in message):
        has_safety_car = ("BEHIND SAFETY CAR" in message or "SAFETY CAR LIGHTS ON" in message
                          or "ROLLING START" in message)
        return "Formation lap", pending_formation or has_safety_car
    if "STANDING START" in message or "START ORDER:" in message:
        return "Waiting for start", False
    if "SESSION STARTED" in message:
        return ("Formation lap" if pending_formation else "Waiting for start"), pending_formation
    return phase, pending_formation


def segment_controls(time, controls):
    segment_start = max((timestamp_ms(item["date"]) for item in controls
                         if is_suspension(item) and timestamp_ms(item["date"]) <= time),
                        default=float("-inf"))
    segment_end = min((timestamp_ms(item["date"]) for item in controls
                       if is_suspension(item) and timestamp_ms(item["date"]) > time),
                      default=float("inf"))
    return [item for item in controls
            if segment_start <= timestamp_ms(item["date"]) < segment_end]


def eligible_launch(time, controls, start_ms):
    # Instructions identify the applicable start segment, but are not lights out.
    segment = segment_controls(time, controls)
    instructions = [timestamp_ms(item["date"]) for item in segment
                    if "STANDING START" in control_message(item)]
    if instructions:
        return time >= min(instructions)
    if any("ROLLING START" in control_message(item) for item in segment):
        return False
    starts = [timestamp_ms(item["date"]) for item in segment
              if "SESSION STARTED" in control_message(item)] or [start_ms]
    return any(abs(time - started) <= NORMAL_START_EARLIEST_MS for started in starts)


def eligible_rolling_launch(time, controls):
    segment = [item for item in segment_controls(time, controls)
               if timestamp_ms(item["date"]) <= time]
    has_instruction = any("ROLLING START" in control_message(item) for item in segment)
    has_withdrawal = any(item.get("flag") == "GREEN"
                         or "GREEN FLAG" in control_message(item)
                         or "SAFETY CAR IN THIS LAP" in control_message(item) for item in segment)
    return has_instruction and has_withdrawal


def build_start_phases(controls, telemetry_by_driver, start_ms, end_ms):
    """Return StartPhase events and telemetry launch evidence, relative to t0.

    Negative event offsets preserve pre-start state. Missing or inconclusive
    telemetry leaves a waiting phase intact rather than inventing lights out.
    """
    ordered_controls = sorted((item for item in controls if item.get("date")),
                              key=lambda item: timestamp_ms(item["date"]))
    finished_ms = min((timestamp_ms(item["date"]) for item in ordered_controls
                       if "SESSION FINISHED" in control_message(item)), default=end_ms)
    launch_cohorts = [(time, drivers) for time, drivers in find_launch_cohorts(telemetry_by_driver)
                      if time <= end_ms and time < finished_ms
                      and eligible_launch(time, ordered_controls, start_ms)]
    timeline = [(timestamp_ms(item["date"]), 0, item) for item in ordered_controls
                if timestamp_ms(item["date"]) <= min(end_ms, finished_ms)]
    timeline.extend((time, 1, drivers) for time, drivers in launch_cohorts)
    timeline.extend((time, 2, drivers) for time, drivers
                    in find_launch_cohorts(telemetry_by_driver, find_rolling_departures)
                    if time <= end_ms and time < finished_ms
                    and eligible_rolling_launch(time, ordered_controls))
    phase_events = []
    launches = []
    phase = None
    pending_formation = False
    for time, kind, payload in sorted(timeline, key=lambda item: (item[0], item[1])):
        if kind == 0:
            next_phase, pending_formation = classify_control(payload, phase, pending_formation)
        else:
            if phase in ("Racing", "Start suspended", "Delayed start"):
                continue
            if kind == 1 and pending_formation:
                continue
            next_phase = "Racing"
            launches.append({"time": round((time - start_ms) / 1000, 1),
                             "drivers": payload, "source": "car_data"})
        if next_phase is not None and next_phase != phase:
            phase_events.append([round((time - start_ms) / 1000, 1), "StartPhase", None, next_phase])
            phase = next_phase
    return phase_events, launches
