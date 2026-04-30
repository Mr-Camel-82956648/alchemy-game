import uuid
import random
import threading
import time
from typing import Dict, Optional
from ..models import ForgeResult

ELEMENTS = ["fire", "ice", "thunder", "poison"]

_tasks: Dict[str, dict] = {}
_lock = threading.Lock()


def calc_base_atk(generation: int) -> float:
    return 100 * (1 + 0.3 * (max(1, generation) - 1))


def create_forge_task(spell_a_name: str, spell_a_attr: Optional[str],
                      spell_a_gen: int,
                      spell_b_name: str, spell_b_attr: Optional[str],
                      spell_b_gen: int) -> str:
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    with _lock:
        _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    thread = threading.Thread(
        target=_process_forge,
        args=(task_id, spell_a_name, spell_a_attr, spell_a_gen,
              spell_b_name, spell_b_attr, spell_b_gen),
        daemon=True,
    )
    thread.start()
    return task_id


def get_task_status(task_id: str) -> Optional[dict]:
    with _lock:
        return _tasks.get(task_id)


def _process_forge(task_id: str,
                   spell_a_name: str, spell_a_attr: Optional[str],
                   spell_a_gen: int,
                   spell_b_name: str, spell_b_attr: Optional[str],
                   spell_b_gen: int):
    delay = 5 + random.random() * 5
    time.sleep(delay)

    gen = max(spell_a_gen, spell_b_gen) + 1
    main_attr = random.choice(ELEMENTS)
    remaining = [e for e in ELEMENTS if e != main_attr]
    sub_attr = random.choice(remaining) if remaining else None

    result = ForgeResult(
        name=f"{spell_a_name}·{spell_b_name}之阵",
        mainAttr=main_attr,
        subAttr=sub_attr,
        element=main_attr,
        generation=gen,
        baseAtk=calc_base_atk(gen),
        videoUrl=None,
        status="complete",
    )

    with _lock:
        if task_id in _tasks:
            _tasks[task_id]["status"] = "completed"
            _tasks[task_id]["result"] = result
