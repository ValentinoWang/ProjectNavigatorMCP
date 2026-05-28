from fastapi import APIRouter

router = APIRouter()


@router.get("/v1/home")
def get_home() -> dict[str, str]:
    return {"home": "business"}
