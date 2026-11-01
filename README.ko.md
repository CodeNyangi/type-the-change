# Type the Change

**AI가 수정할 곳을 짚고, 나는 직접 코드를 쓴다.**

[English](README.md) · [설치 파일](https://github.com/CodeNyangi/type-the-change/releases)

사이의 ‘직접 따라 쓰며 이해하기’와 운세냥이 MCP의 연결 방식을 코드 수정에 옮겼습니다. AI가 의도를 받아 작은 수정안을 만들고, VS Code에서 해당 부분을 열어 줍니다. 옆에 놓인 제안 코드를 보며 직접 고치고, 내 눈으로 확인합니다.

## 바로 써보기

1. [Releases](https://github.com/CodeNyangi/type-the-change/releases)에서 `.vsix`를 받습니다.
2. VS Code 명령 팔레트에서 **Extensions: Install from VSIX…**로 설치합니다.
3. **Type the Change: Try the Demo**를 실행합니다. 로그인 없이 됩니다.

선택된 부분을 직접 바꾼 뒤 **⌘⌥Enter**로 확인하고 다음 단계로 갑니다. Windows/Linux는 **Ctrl+Alt+Enter**입니다. **⌘⌥T / Ctrl+Alt+T**로 수정 위치에 돌아갑니다.

코드는 평소 쓰던 편집기에 입력합니다. 복사·붙여넣기나 자동완성을 막지 않으며, 글자마다 효과를 터뜨리거나 감상문을 요구하지 않습니다. 비교는 잠깐 멈췄을 때 갱신합니다. 제안과 일치해도 실제 동작은 테스트와 변경 내역으로 확인해야 합니다.

## 내 의도로 수정안 만들기

**Type the Change: Plan a Change with ChatGPT** → 파일 선택 → 원하는 변경 입력 → **Continue with ChatGPT** → 모델 선택.

API 키 대신 OpenAI의 공식 [오픈소스 앱용 ChatGPT 로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)을 사용합니다. 선택한 파일과 요청을 OpenAI로 보내며, 계정에서 허용된 ChatGPT 구독 사용량과 한도를 따릅니다. 모든 구독의 이용 가능 여부나 무제한 사용을 보장하지는 않습니다. 로그인 정보는 VS Code SecretStorage에 보관합니다.

현재는 초기 미리보기입니다. 인증 자동 테스트와 편집기 통합 테스트는 준비되어 있으나, **실제 계정 동의 및 구독으로 AI 수정안을 생성하는 과정은 아직 실계정 검증 전**입니다. 여러 VS Code 창에서 동시에 인증하지 말고 한 창에서 이용해 주세요.

## MCP로 연결하기

**Type the Change: Show MCP Connection**을 실행하면 현재 설치 위치와 작업 폴더에 맞는 설정이 나옵니다. Node.js 22 이상과 MCP 클라이언트가 필요합니다.

MCP 클라이언트에는 이렇게 요청할 수 있습니다.

> 이 파일을 읽고 음수 가격을 합계에서 제외하는 typing plan을 만들어 줘. 코드는 내가 직접 고칠게.

서버는 파일 읽기, 수정안 전달, 마지막 진행 상태 조회만 제공합니다. 모델을 직접 호출하거나 소스 파일을 수정하지 않습니다. 모델 사용량은 연결한 클라이언트의 로그인·구독을 따릅니다.

도착한 알림을 열거나 **Type the Change: Open MCP Plan**을 실행하세요. 대상 프로젝트의 `.gitignore`에는 `.type-the-change/`를 추가해 주세요. 이 폴더에 코드가 포함된 수정안과 마지막 진행 상태가 저장됩니다.

## 첫 버전의 범위

- 로컬 VS Code 1.100 이상, 기존 UTF-8 파일, 파일당 64 KiB 이하.
- 변경 전 코드가 정확히 한 곳에 있는 수정안만 엽니다. 공백까지 비교합니다.
- 실제 파일 적용과 저장은 사용자가 합니다. 범위 밖 수정이나 앞 단계 변경이 생기면 진행을 멈춥니다.
- 창을 닫으면 안내 세션은 종료됩니다. 편집한 코드는 기존 VS Code 저장·복원 설정을 따릅니다.
- 새 파일 생성, 이름 변경, 원격 작업 폴더는 아직 지원하지 않습니다.
- ‘일치’는 ‘올바른 코드’나 ‘학습 효과 검증’을 뜻하지 않습니다.

개발, 수정안 형식, 테스트 방법은 [README](README.md)를 참고하세요. MIT 라이선스로 공개합니다.
