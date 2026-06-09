from pathlib import Path


def main():
    Path("tests/mobile/visual_pages.yaml").read_text(encoding="utf-8")
    Path("frontend/lib/core/qa/mobile_visual_contract.dart").read_text(encoding="utf-8")


if __name__ == "__main__":
    main()
