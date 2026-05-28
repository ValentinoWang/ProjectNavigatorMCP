from fastapi import APIRouter

router = APIRouter()


@router.get("/v1/teacher/classes/{class_id}/diagnostic-trends")
def get_teacher_class_diagnostic_trends(class_id: str) -> dict[str, object]:
    return {"class_id": class_id, "trends": []}
