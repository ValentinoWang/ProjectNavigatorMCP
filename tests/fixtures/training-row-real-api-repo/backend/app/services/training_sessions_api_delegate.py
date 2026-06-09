class TrainingSessionsApiDelegate:
    def validate_action_timing(self, payload):
        return payload["ended_at_ms"] >= payload["started_at_ms"]

    def write_action_timing(self, payload):
        logs = payload["training_row_logs"]
        metrics = payload["training_row_metrics"]
        metric_row_ids = {item["row_id"] for item in metrics}
        if any(item["row_id"] not in metric_row_ids for item in logs):
            raise ValueError("metric binding missing for row lineage")
        return payload
