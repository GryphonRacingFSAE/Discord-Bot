import asyncio


class StatusAnnouncer:
    """Keeps the Discord channel in sync with the latest shop status.

    - update() is called on the event loop for every status read from MQTT.
    - The very first status is only recorded as the baseline (nothing is announced),
      so restarting the bot doesn't repost the current state.
    - A single worker task does all the sending, so announcements are strictly ordered.
    - Only the newest status matters: if the status changes while a send is in
      flight, the worker sends the newest one right after the current send ends.
      Nothing is dropped, and the channel always ends up matching the switch.
    - A failed send is retried with the latest status and a bounded exponential
      backoff, without needing another MQTT message.

    `send` is an async callable `send(status, rssi)` that raises if the message
    could not be delivered.
    """

    def __init__(self, send, *, initial_backoff=1.0, max_backoff=60.0, sleep=asyncio.sleep):
        self._send = send
        self._initial_backoff = initial_backoff
        self._max_backoff = max_backoff
        self._sleep = sleep
        self._announced = None  # what Discord currently shows
        self._desired = None    # newest status from the switch
        self._rssi = None
        self._wake = asyncio.Event()
        self._task = None

    @property
    def announced(self):
        return self._announced

    def start(self):
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    def update(self, status, rssi=None):
        """Record the newest status. Must be called on the event loop thread."""
        if self._announced is None:
            self._announced = self._desired = status
            print(f"[shop] initial state: {status}")
            return

        if status != self._desired:
            print(f"[shop] state changed: {status}")
        self._desired = status
        self._rssi = rssi
        self._wake.set()

    async def _run(self):
        backoff = self._initial_backoff
        while True:
            await self._wake.wait()
            self._wake.clear()

            while self._desired != self._announced:
                target, rssi = self._desired, self._rssi
                try:
                    await self._send(target, rssi)
                except Exception as e:
                    print(
                        f"[discord] failed to send {target}: {type(e).__name__}: {e}. "
                        f"Retrying in {backoff:g}s"
                    )
                    await self._sleep(backoff)
                    backoff = min(backoff * 2, self._max_backoff)
                    continue

                self._announced = target
                backoff = self._initial_backoff
