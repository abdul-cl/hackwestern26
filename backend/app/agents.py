"""Runs blocking TinyFish calls in threads, limited to config.MAX_AGENTS at once, with timeouts."""
import asyncio
from . import config
_agent_sem: asyncio.Semaphore | None = None
_agent_sem_loop = None


_searches = 0  # patient searches (missions) running right now


def search_started() -> None:
    global _searches
    _searches += 1


def search_finished() -> None:
    global _searches
    _searches = max(0, _searches - 1)


def searches_running() -> bool:
    """True while a patient's search is running: background jobs then leave the browser agents to it."""
    return _searches > 0


def agent_slots() -> asyncio.Semaphore:
    """Limits how many TinyFish agents run at once (one semaphore per event loop)."""
    global _agent_sem, _agent_sem_loop
    loop = asyncio.get_running_loop()
    if _agent_sem is None or _agent_sem_loop is not loop:
        _agent_sem, _agent_sem_loop = asyncio.Semaphore(config.MAX_AGENTS), loop
    return _agent_sem


async def run_agent(fn, timeout: float, on_start=None):
    """Run a blocking TinyFish call in a thread once an agent slot is free.

    The timeout only counts while the agent is actually running (not while queued), so queued clinics
    aren't marked as timed out. The slot is released when the thread really finishes, even after a
    timeout or a client disconnect, because the remote agent keeps running until then.
    Raises asyncio.TimeoutError on timeout.
    """
    sem = agent_slots()
    await sem.acquire()
    try:
        if on_start:
            await on_start()
        fut = asyncio.ensure_future(asyncio.to_thread(fn))
    except BaseException:
        sem.release()
        raise
    fut.add_done_callback(lambda _f: sem.release())
    return await asyncio.wait_for(asyncio.shield(fut), timeout=timeout)
