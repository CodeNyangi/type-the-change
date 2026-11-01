# Type the Change

**AI가 수정할 곳을 짚고, 나는 직접 코드를 쓴다.**

[English](README.md) · [설치 파일](https://github.com/CodeNyangi/type-the-change/releases) · [문제 제보](https://github.com/CodeNyangi/type-the-change/issues/new/choose) · [참여 정책](CONTRIBUTING.md)

**Type the Change는 AI가 제안한 코드 변경을 직접 읽고, 입력하고, 검토하는 오픈소스 VS Code 확장입니다.** JSON 수정안, 선택적인 ChatGPT 연결, MCP(Model Context Protocol) 클라이언트로 변경 제안을 받아 사용할 수 있습니다.

조건문 하나, 반환값, 작은 리팩터링처럼 AI가 제안한 변경의 세부 내용을 직접 살펴보고 싶은 개발자를 위한 도구입니다. 확장이 수정할 부분을 선택하고, 제안 코드를 편집기 옆에 보여 줍니다. ChatGPT 연결도 VS Code 안에서 처리하므로 Codex 데스크톱이나 CLI가 필요하지 않습니다.

1. 원하는 변경을 적고 관련 파일을 고르거나, 외부 수정안을 가져옵니다.
2. 선택된 부분에 제안 코드를 직접 입력합니다.
3. 변경 내용을 검토하고 다음 단계로 넘어갑니다.

직접 읽고 쓰는 연습을 돕도록 설계했지만, 학습 효과가 검증되었다고 주장하지 않습니다. 코드의 일치는 제안과 글자가 같다는 뜻이며, 실제 동작은 테스트와 변경 비교로 확인해야 합니다.

## 빠른 시작: VS Code 확장 설치

로컬 데스크톱 **VS Code 1.100 이상**이 필요합니다. 초기 미리보기이며, 현재 화면 언어는 한국어입니다.

1. [Releases](https://github.com/CodeNyangi/type-the-change/releases)에서 `.vsix`를 받습니다.
2. VS Code 명령 팔레트에서 **Extensions: Install from VSIX…**로 설치합니다.
3. **Type the Change: Try the Demo**를 실행합니다. 로그인 없이 됩니다.

선택된 부분을 직접 바꾼 뒤 **⌘⌥Enter**로 확인하고 다음 단계로 갑니다. Windows/Linux는 **Ctrl+Alt+Enter**입니다. **⌘⌥T / Ctrl+Alt+T**로 수정 위치에 돌아갑니다.

코드는 평소 쓰던 편집기에 입력합니다. 복사·붙여넣기나 자동완성을 막지 않으며, 글자마다 효과를 터뜨리거나 감상문을 요구하지 않습니다. 비교는 잠깐 멈췄을 때 갱신합니다. 제안과 일치해도 실제 동작은 테스트와 변경 내역으로 확인해야 합니다.

로컬 JSON 수정안을 쓰려면 대상 프로젝트를 연 뒤 **Type the Change: Open a Plan**을 실행하세요. [수정안 형식](plan.schema.json)과 [예제](examples/plan.json)가 있습니다. 데모와 JSON 가져오기는 로그인이나 AI 요청 없이 동작합니다.

**배포 상태:** GitHub Releases의 설치 파일은 `main`의 최신 변경보다 이전 버전일 수 있습니다. [변경 기록](CHANGELOG.md)과 [검증 범위](docs/verification.md)를 확인하세요. 실제 계정으로 ChatGPT에 동의하고 구독 사용량으로 수정안을 생성하는 과정은 아직 검증 전입니다.

## ChatGPT로 코드 수정안 만들기

**Type the Change: Start** → 화면에서 원하는 변경 입력·파일 선택 → **수정안 만들기**. 요청은 **⌘Enter / Ctrl+Enter**로 보낼 수도 있습니다.

예를 들어 “음수 가격은 합계에서 제외하고, 확인해야 할 조건을 설명해 줘”라고 요청할 수 있습니다. 관련 파일은 최대 8개까지 선택합니다. 처음 한 번 **Continue with ChatGPT**로 연결하며, 모델은 이전 선택을 기억합니다. 모델 버튼으로 바꿀 수도 있습니다. 입력을 마치면 **변경 확인**으로 수정 전후를 비교합니다. 파일 저장은 사용자가 합니다.

API 키 대신 OpenAI의 공식 [오픈소스 앱용 ChatGPT 로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)을 사용합니다. 명시적으로 선택한 파일 내용과 요청을 OpenAI로 보내며, 계정에서 허용된 ChatGPT 구독 사용량과 한도를 따릅니다. 모든 구독의 이용 가능 여부나 무제한 사용을 보장하지는 않습니다. 로그인 정보는 VS Code SecretStorage에 보관하며, 다른 앱의 인증 정보를 읽지 않습니다. 자세한 내용은 [개인정보 처리 안내](PRIVACY.md)를 참고하세요.

현재는 초기 미리보기입니다. 인증 자동 테스트와 편집기 통합 테스트는 준비되어 있으나, **실제 계정 동의 및 구독으로 AI 수정안을 생성하는 과정은 아직 실계정 검증 전**입니다. 여러 VS Code 창에서 동시에 인증하지 말고 한 창에서 이용해 주세요.

## 코드 수정안을 전달하는 MCP 서버

**Type the Change: Show MCP Connection**을 실행하면 현재 설치 위치와 작업 폴더에 맞는 설정이 나옵니다. Node.js 22 이상과 MCP 클라이언트가 필요합니다.

MCP 클라이언트에는 이렇게 요청할 수 있습니다.

> 이 파일을 읽고 음수 가격을 합계에서 제외하는 typing plan을 만들어 줘. 코드는 내가 직접 고칠게.

서버는 파일 읽기, 수정안 전달, 마지막 진행 상태 조회만 제공합니다. 모델을 직접 호출하거나 소스 파일을 수정하지 않습니다. 모델 사용량은 연결한 클라이언트의 로그인·구독을 따릅니다.

도착한 알림을 열거나 **Type the Change: Open MCP Plan**을 실행하세요. 대상 프로젝트의 `.gitignore`에는 `.type-the-change/`를 추가해 주세요. 이 폴더에 코드가 포함된 수정안과 마지막 진행 상태가 저장됩니다.

## 현재 지원 범위

- 로컬 VS Code 1.100 이상, 기존 UTF-8 파일, 파일당 64 KiB 이하.
- 변경 전 코드가 정확히 한 곳에 있는 수정안만 엽니다. 공백까지 비교합니다.
- 실제 파일 적용과 저장은 사용자가 합니다. 범위 밖 수정이나 앞 단계 변경이 생기면 진행을 멈춥니다.
- 창을 닫으면 안내 세션은 종료됩니다. 편집한 코드는 기존 VS Code 저장·복원 설정을 따릅니다.
- 새 파일 생성, 이름 변경, 원격 작업 폴더는 아직 지원하지 않습니다.
- ‘일치’는 ‘올바른 코드’나 ‘학습 효과 검증’을 뜻하지 않습니다.

## 오픈소스 기여

커뮤니티 참여는 이슈로 받습니다. 버그 제보, 원인 분석, 기능 제안, 사용 경험을 한국어나 영어로 알려 주세요. **외부 코드 기여와 Pull Request는 받지 않습니다.** 코드와 문서 변경은 저장소 소유자가 진행하고 직접 검토합니다.

- **문제 제보:** 기존 이슈를 먼저 검색한 뒤, [이슈 작성](https://github.com/CodeNyangi/type-the-change/issues/new/choose)에서 VS Code·확장 버전, 운영체제, 재현 과정, 기대한 동작과 실제 동작을 알려 주세요. 민감한 내용을 제거한 로그와 원인 분석도 도움이 됩니다.
- **개선 제안이나 문서 정정:** 사용 상황과 원하는 동작을 이슈에 설명해 주세요. 이슈로 참여하는 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다.
- **보안 문제:** [SECURITY.md](SECURITY.md)의 신고 방법을 따라 주세요. 토큰, 비공개 코드, 실제 작업 폴더의 수정안을 공개 이슈에 첨부하지 마세요.

## 소스에서 빌드하고 테스트하기

**Node.js 22 이상**과 npm이 필요합니다.

```sh
git clone https://github.com/CodeNyangi/type-the-change.git
cd type-the-change
npm ci
npm run check
npm test
npm run build
npm run test:host
npm run package
```

`test:host`는 별도의 VS Code 프로필과 임시 작업 폴더에서 실행됩니다. Linux에서는 `xvfb-run -a npm run test:host`처럼 디스플레이가 필요합니다. `artifacts/`에 생성된 VSIX를 **Extensions: Install from VSIX…**로 설치하면 개발 중인 버전을 사용할 수 있습니다.

`npm run preview`는 실제 확장 화면과 같은 HTML을 모의 호스트에서 보여 줍니다. 브라우저 미리보기는 네이티브 편집기 입력이나 실계정 인증을 검증한 결과와 구분합니다. 자세한 테스트 방법과 한계는 [영문 README](README.md#build-and-test-from-source)와 [검증 문서](docs/verification.md)에 있습니다.

사이의 ‘직접 따라 쓰며 이해하기’와 운세냥이 MCP의 제한된 도구 연결 방식에서 출발한 프로젝트입니다. [MIT 라이선스](LICENSE)로 공개합니다.

[개인정보 처리 안내](PRIVACY.md) · [보안](SECURITY.md) · [포함된 의존성 고지](THIRD_PARTY_NOTICES)
