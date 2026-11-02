# Type the Change

**AI가 제안하고, 내가 확인하고 판단합니다.**

코드를 바꾸면서 내 판단력을 연습하는 VS Code 확장입니다.

[![영어 사용 영상](assets/quickstart.gif)](assets/type-the-change-quickstart.mp4)

[사용 영상](assets/type-the-change-quickstart.mp4) · [설치](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change) · [English](README.md)

## 열기

**코드 편집기 오른쪽 위 `>_` 아이콘**을 누르거나 **⌘⌥T / Ctrl+Alt+T**를 누르세요. **짧은 연습**으로 바로 시작합니다. 로그인은 필요 없습니다.

## 쓰기

1. **예상** 한 줄 → **⌘Enter / Ctrl+Enter**.
2. 평소처럼 **편집** → **⌘⌥Enter / Ctrl+Alt+Enter**로 저장·검사.
3. 결과와 변경 내역을 보고 **이유** 한 줄 → **⌘Enter / Ctrl+Enter**로 판단 버튼 이동 → **← →** 선택 → **Enter** 기록.

연습용 제안은 일부러 틀렸습니다. 글자가 같거나 검사가 통과해도 자동으로 채택하지 않습니다. **⌘⌥T / Ctrl+Alt+T**는 코드로 돌아가고, **사용법**은 영상을 엽니다.

## 내 프로젝트

원하는 변경과 관련 파일을 선택하거나 MCP 수정안을 가져오세요. 기존 VS Code 검사 작업을 한 번 선택하면 결과가 코드 옆에 표시됩니다.

첫 검사 선택은 해당 작업 공간의 전체 자동 저장을 끄는 설정을 안내합니다. 폴더가 없으면 사용자 설정에 적용합니다. 이후 검토 파일만 저장합니다. 취소하거나 **검사 없이 비교**를 선택하면 설정은 그대로입니다. [자세히](docs/guide.ko.md)

큰 저장소는 파일명으로 범위를 좁혀 찾습니다. 요청당 **8개 파일, 파일당 64 KiB**까지이며, 저장소 전체의 영향 분석과 자동 검사 선택은 아직 지원하지 않습니다.

**미리보기 · VS Code 1.100+ · 로컬 파일.** 주요 화면은 VS Code 언어에 따라 한국어·영어로 표시합니다. ChatGPT 생성은 선택한 파일과 요청을 OpenAI로 보내며 사용 가능한 구독 한도를 씁니다. 실계정 연결·생성 검증은 아직 완료하지 않았습니다. 연습에는 연결이 필요 없습니다.

[설정·MCP](docs/guide.ko.md) · [검증](docs/keyboard-workflow-0.4.0.md) · [개인정보](PRIVACY.md) · [보안](SECURITY.md) · [MIT](LICENSE)

기여는 [이슈](https://github.com/CodeNyangi/type-the-change/issues/new/choose)로 받습니다. 외부 PR은 받지 않으며 최종 검토는 저장소 소유자가 합니다. [기여 정책](CONTRIBUTING.md)
