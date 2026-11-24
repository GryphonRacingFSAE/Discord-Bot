import asyncio
import unittest

from status_announcer import StatusAnnouncer


async def until(predicate, timeout=1.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while not predicate():
        if loop.time() > deadline:
            raise AssertionError("condition not met in time")
        await asyncio.sleep(0.005)


class StatusAnnouncerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.announcers = []

    async def asyncTearDown(self):
        for announcer in self.announcers:
            await announcer.stop()

    def make(self, send, **kwargs):
        kwargs.setdefault("initial_backoff", 0.01)
        kwargs.setdefault("max_backoff", 0.02)
        announcer = StatusAnnouncer(send, **kwargs)
        announcer.start()
        self.announcers.append(announcer)
        return announcer

    async def test_initial_state_is_recorded_not_announced(self):
        sent = []

        async def send(status, rssi):
            sent.append(status)

        announcer = self.make(send)
        announcer.update("OPEN")
        await asyncio.sleep(0.05)
        self.assertEqual(sent, [])
        self.assertEqual(announcer.announced, "OPEN")

        announcer.update("CLOSED")
        await until(lambda: sent == ["CLOSED"])

    async def test_final_state_is_announced_after_in_flight_send(self):
        # CLOSED -> OPEN -> CLOSED, where the final CLOSED arrives while OPEN is still sending.
        sent = []
        started, release = asyncio.Event(), asyncio.Event()

        async def send(status, rssi):
            sent.append(status)
            if len(sent) == 1:
                started.set()
                await release.wait()  # hold the OPEN send pending

        announcer = self.make(send)
        announcer.update("CLOSED")  # baseline
        announcer.update("OPEN")
        await asyncio.wait_for(started.wait(), 1)

        announcer.update("CLOSED")  # final state, no further MQTT message after this
        release.set()

        await until(lambda: len(sent) == 2 and announcer.announced == "CLOSED")
        await asyncio.sleep(0.05)
        self.assertEqual(sent, ["OPEN", "CLOSED"])

    async def test_flip_back_while_send_in_flight_ends_in_sync(self):
        # CLOSED is in flight, the switch is flipped back to OPEN: the OPEN must not be dropped.
        sent = []
        started, release = asyncio.Event(), asyncio.Event()

        async def send(status, rssi):
            sent.append(status)
            if len(sent) == 1:
                started.set()
                await release.wait()

        announcer = self.make(send)
        announcer.update("OPEN")  # baseline
        announcer.update("CLOSED")
        await asyncio.wait_for(started.wait(), 1)

        announcer.update("OPEN")
        release.set()

        await until(lambda: len(sent) == 2 and announcer.announced == "OPEN")
        await asyncio.sleep(0.05)
        self.assertEqual(sent, ["CLOSED", "OPEN"])

    async def test_failed_send_is_retried_without_new_mqtt_message(self):
        attempts, delivered = [], []
        failing = True

        async def send(status, rssi):
            attempts.append(status)
            if failing:
                raise RuntimeError("discord is down")
            delivered.append(status)

        announcer = self.make(send)
        announcer.update("CLOSED")  # baseline
        announcer.update("OPEN")    # first send is forced to fail

        await until(lambda: len(attempts) >= 3)  # it keeps retrying on its own
        self.assertEqual(delivered, [])

        failing = False  # sending is restored, no new MQTT update is published
        await until(lambda: delivered == ["OPEN"])

        announcer.update("OPEN")  # repeated OPEN payload after success
        await asyncio.sleep(0.05)
        self.assertEqual(delivered, ["OPEN"])  # announced once, no duplicate

    async def test_backoff_is_bounded(self):
        delays = []
        calls = 0

        async def fake_sleep(delay):
            delays.append(delay)
            await asyncio.sleep(0)

        async def send(status, rssi):
            nonlocal calls
            calls += 1
            if calls <= 5:
                raise RuntimeError("down")

        announcer = StatusAnnouncer(send, initial_backoff=1, max_backoff=4, sleep=fake_sleep)
        announcer.start()
        self.announcers.append(announcer)

        announcer.update("CLOSED")
        announcer.update("OPEN")
        await until(lambda: announcer.announced == "OPEN")
        self.assertEqual(delays, [1, 2, 4, 4, 4])


if __name__ == "__main__":
    unittest.main()
