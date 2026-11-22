"""Runs blocking TinyFish calls in threads, limited to config.MAX_AGENTS at once, with timeouts."""
import asyncio
import re
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


# ---------- live agent runs (watch the browser) ----------

def step_text(purpose: str) -> str:
    """TinyFish's own step label, made safe to show a patient. Its last step is called e.g. "Submit final answer with
    clinic info" (handing its answer back to us), which next to a form would read as if the form were submitted."""
    text = " ".join((purpose or "").split())[:200]
    if re.match(r"(?i)^(submit|return|provide|send|output|report)\b.*\b(final|answer|answers|result|results|json|output|findings)\b", text):
        return "Reporting what it found"
    return text


def run_with_events(client, *, goal: str, url: str, on_event=None) -> tuple[str, object, str | None]:
    """Blocking TinyFish run. Returns (status, result, error_message), like agent.run().

    With on_event, the run is streamed so people can watch it: on_event("live", <browser view URL>) once the
    browser is up, then on_event("step", <what the agent is doing>) for each step. on_event must be thread-safe
    (it's called from the agent's worker thread). Without on_event it's a plain agent.run().
    """
    if on_event is None:
        r = client.agent.run(goal=goal, url=url)
        return str(getattr(r.status, "value", r.status)), r.result, (r.error.message if r.error else None)
    from tinyfish.agent.types import CompleteEvent, ProgressEvent, StreamingUrlEvent

    status, result, error = "FAILED", None, "the agent stopped without a result"
    with client.agent.stream(goal=goal, url=url) as events:
        for ev in events:
            if isinstance(ev, StreamingUrlEvent) and ev.streaming_url.startswith("https://"):
                on_event("live", ev.streaming_url)
            elif isinstance(ev, ProgressEvent) and ev.purpose:
                on_event("step", step_text(ev.purpose))
            elif isinstance(ev, CompleteEvent):
                status = str(getattr(ev.status, "value", ev.status))
                result = ev.result_json
                error = ev.error.message if ev.error else None
    return status, result, error


def thread_safe(callback):
    """Wrap an async callback(kind, value) so a worker thread can call it (fire-and-forget on this event loop)."""
    if callback is None:
        return None
    loop = asyncio.get_running_loop()

    def emit(kind, value):
        try:
            asyncio.run_coroutine_threadsafe(callback(kind, value), loop)
        except RuntimeError:
            pass  # the loop has closed (client gone): nobody is watching any more
    return emit
