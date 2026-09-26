from datetime import datetime
from zoneinfo import ZoneInfo

SGT = ZoneInfo("Asia/Singapore")


def now_sgt() -> datetime:
    """The server clock in Singapore Time, naive like stored Session dates and times.

    A FastAPI dependency, so tests can override "now".
    """
    return datetime.now(SGT).replace(tzinfo=None)
