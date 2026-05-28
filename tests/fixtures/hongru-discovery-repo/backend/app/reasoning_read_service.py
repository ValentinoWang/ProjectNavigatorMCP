class ReasoningReadService:
    def get_graph_and_diagnosis(self, session_id: str) -> dict[str, str]:
        return {"session_id": session_id}
