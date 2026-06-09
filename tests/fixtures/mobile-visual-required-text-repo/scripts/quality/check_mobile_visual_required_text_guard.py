from pathlib import Path


def test_required_text_contains_business_copy():
    tree = Path("tests/flutter-web/e2e/visual_pages_url_tree.json").read_text(encoding="utf-8")
    assert "比赛最佳" in tree
    assert "测试最佳" in tree
    assert "训练最佳" in tree
