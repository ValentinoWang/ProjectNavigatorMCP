from fastapi import APIRouter

router = APIRouter()


@router.get("/v1/reasoning-sessions/{session_id}/events")
def stream_reasoning_session_events(session_id: str) -> dict[str, str]:
    return {"session_id": session_id}


@router.get("/v1/reasoning-sessions/{session_id}/final-envelope")
def get_reasoning_session_final_envelope(session_id: str) -> dict[str, str]:
    return {"session_id": session_id}
