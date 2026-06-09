from backend.app.services.training_sessions_api_delegate import TrainingSessionsApiDelegate


def test_rejects_illegal_action_timing_range():
    delegate = TrainingSessionsApiDelegate()
    assert not delegate.validate_action_timing({"started_at_ms": 3000, "ended_at_ms": 2000})


def test_preserves_row_lineage_and_metric_binding():
    delegate = TrainingSessionsApiDelegate()
    result = delegate.write_action_timing(
        {
            "training_row_logs": [{"row_id": "row-1", "lineage_id": "parent-row"}],
            "training_row_metrics": [{"row_id": "row-1", "metric_id": "pace"}],
        }
    )
    assert result["training_row_logs"][0]["lineage_id"] == "parent-row"
    assert result["training_row_metrics"][0]["metric_id"] == "pace"
