from fastapi import APIRouter

router = APIRouter(prefix="/session-plans")


@router.get("/{plan_id}")
async def get_session_plan(plan_id: str):
    return load_session_plan(plan_id)


def load_session_plan(plan_id: str):
    return {"id": plan_id}
