# Type the Change

<img src="assets/icon.png" alt="열린 코드 프롬프트와 입력 커서" width="96" />

**AI가 제안하고, 내가 예상하고, 확인하고, 판단합니다.**

[English](README.md) · [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change) · [설치 파일](https://github.com/CodeNyangi/type-the-change/releases) · [문제 제보](https://github.com/CodeNyangi/type-the-change/issues/new/choose)

AI와 코딩하면서 내 판단을 연습하는 작은 VS Code 확장입니다. 평소 편집기에서 코드를 직접 살피고, 변경을 유지할지 결정합니다. 제안과 글자가 같다는 이유만으로 완료되지 않습니다.

[![실제 VS Code 사용 영상](assets/quickstart.gif)](assets/type-the-change-quickstart.mp4)

**[사용 영상 보기 →](assets/type-the-change-quickstart.mp4)** · [영상과 같은 예제](examples/judgment/README.md)

영상은 실제 VS Code에서 촬영했습니다. 일부러 틀린 연습용 제안을 실행해 보고 거절한 뒤, 다른 코드로 수정해 유지합니다. 자막이 있으며 로그인과 AI 호출 없이 따라 할 수 있습니다.

1. **예상하기.** 제안을 보기 전에 달라질 결과를 한 줄로 적습니다.
2. **확인하기.** 평소처럼 편집하고 직접 테스트한 다음, 변경 내역을 비교합니다.
3. **판단하기.** 확인한 근거를 적고 **이 변경 유지 / 제안 거절 / 보류**를 고릅니다.

안내는 같은 VS Code 창에서 코드 옆에 있습니다. 제안과 다른 코드도 안내 범위 안이라면 유지할 수 있습니다. 비교한 뒤 코드가 바뀌면 근거를 다시 확인합니다. 내 수정으로 다음 제안이 맞지 않게 되면 새 계획을 요청합니다.

판단 기록은 사용자가 확인했다는 기록입니다. 자동 정답 판정이나 학습 효과의 증명은 아닙니다. 확장은 테스트 실행, 소스 적용, 저장, 거절한 코드의 되돌리기를 대신하지 않습니다.

## 1분 안에 시작하기

로컬 VS Code 1.100 이상이 필요합니다. 현재는 한국어 UI의 미리보기입니다.

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CodeNyangi.type-the-change)에서 **CodeNyangi의 Type the Change**를 설치합니다. GitHub에서 받은 VSIX는 **Extensions: Install from VSIX…**로 설치할 수 있습니다.
2. **Type the Change: Try the Demo**를 실행합니다. `[10, -5, 20]`의 합계를 먼저 예상합니다.
3. 직접 고치고 **비교하고 판단**을 누른 뒤, 확인한 근거를 기록합니다.

**제안 보기**로 도움을 펼칩니다. **직접 바꾸기** 또는 **⌘⌥T / Ctrl+Alt+T**로 코드에 돌아갑니다. **⌘⌥Enter / Ctrl+Alt+Enter**는 비교만 열며 변경을 승인하지 않습니다. **×**로 끝내도 편집한 코드는 유지됩니다.

영상의 틀린 제안을 직접 판단하려면 [`examples/judgment`](examples/judgment/README.md) 폴더를 열고 **Type the Change: Open a Plan**으로 `plan.json`을 가져오세요. 저장한 다음 터미널에서 `node check.mjs`를 실행합니다. 다른 입력도 확인해 보세요. 데모와 JSON 가져오기는 로그인 없이 동작합니다.

**미리보기:** 0.3.0부터 예상·근거·판단 흐름을 제공합니다. 이전에 배포된 버전은 글자 일치로 진행할 수 있으니 [버전과 변경 기록](CHANGELOG.md)을 확인하세요. 실제 계정으로 ChatGPT에 동의하고 구독으로 제안을 생성하는 과정은 아직 검증 전입니다.

## ChatGPT로 코드 수정안 만들기

**Type the Change: Start** → 화면에서 원하는 변경 입력·파일 선택 → **수정안 만들기**. 요청은 **⌘Enter / Ctrl+Enter**로 보낼 수도 있습니다.

예를 들어 “음수 가격은 합계에서 제외하고, 확인해야 할 조건을 설명해 줘”라고 요청할 수 있습니다. 관련 파일은 최대 8개까지 선택합니다. 처음 한 번 **Continue with ChatGPT**로 연결하며, 모델은 이전 선택을 기억합니다. 모델 버튼으로 바꿀 수도 있습니다. 예상을 적은 뒤 **비교하고 판단**으로 수정 전후를 살펴봅니다. 파일 저장은 사용자가 합니다.

API 키 대신 OpenAI의 공식 [오픈소스 앱용 ChatGPT 로그인](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)을 사용합니다. 명시적으로 선택한 파일 내용과 요청을 OpenAI로 보내며, 계정에서 허용된 ChatGPT 구독 사용량과 한도를 따릅니다. 모든 구독의 이용 가능 여부나 무제한 사용을 보장하지는 않습니다. 로그인 정보는 VS Code SecretStorage에 보관하며, 다른 앱의 인증 정보를 읽지 않습니다. 자세한 내용은 [개인정보 처리 안내](PRIVACY.md)를 참고하세요.

현재는 초기 미리보기입니다. 인증 자동 테스트와 편집기 통합 테스트는 준비되어 있으나, **실제 계정 동의 및 구독으로 AI 수정안을 생성하는 과정은 아직 실계정 검증 전**입니다. 여러 VS Code 창에서 동시에 인증하지 말고 한 창에서 이용해 주세요.

## 코드 수정안을 전달하는 MCP 서버

**Type the Change: Show MCP Connection**을 실행하면 현재 설치 위치와 작업 폴더에 맞는 설정이 나옵니다. Node.js 22 이상과 MCP 클라이언트가 필요합니다.

MCP 클라이언트에는 이렇게 요청할 수 있습니다.

> 이 파일을 읽고 음수 가격을 합계에서 제외하는 typing plan을 만들어 줘. 코드는 내가 직접 고칠게.

서버는 파일 읽기, 수정안 전달, 마지막 진행 상태 조회만 제공합니다. 모델을 직접 호출하거나 소스 파일을 수정하지 않습니다. 모델 사용량은 연결한 클라이언트의 로그인·구독을 따릅니다.

도착한 알림을 열거나 **Type the Change: Open MCP Plan**을 실행하세요. 대상 프로젝트의 `.gitignore`에는 `.type-the-change/`를 추가해 주세요. 이 폴더에 코드가 포함된 수정안, 마지막 진행 상태, 현재 세션의 예상과 판단 근거가 저장됩니다. MCP 상태 조회에는 자유롭게 적은 예상·근거가 포함되지 않습니다.

## 현재 지원 범위

- 로컬 VS Code 1.100 이상, 기존 UTF-8 파일, 파일당 64 KiB 이하.
- 변경 전 코드가 정확히 한 곳에 있는 수정안만 엽니다. 공백까지 비교합니다.
- 실제 파일 적용과 저장은 사용자가 합니다. 범위 밖 수정이나 앞 단계 변경이 생기면 유지 결정을 막고 다시 확인합니다.
- 창을 닫으면 안내 세션은 종료됩니다. 편집한 코드는 기존 VS Code 저장·복원 설정을 따릅니다.
- 새 파일 생성, 이름 변경, 원격 작업 폴더는 아직 지원하지 않습니다.
- ‘일치’는 글자 비교입니다. ‘판단 기록됨’도 자동 테스트 통과나 학습 효과 검증을 뜻하지 않습니다.

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

화면을 띄우지 않는 검사는 `npx playwright install chromium --only-shell` 후 `npm run test:ui:webview`로 실행합니다. 실제 VS Code 버튼·입력 동선은 Linux CI의 가상 화면에서 `test:ui:vscode`로 검사하며, 이 스크립트는 로컬 데스크톱 실행을 거부합니다. 최소 지원 버전과 Windows 코드 검사도 CI에 포함됩니다. 결과와 남은 한계는 [판단 흐름 검증 보고서](docs/judgment-workflow-0.3.0.md)에 기록했습니다.

`npm run preview`는 실제 확장 화면과 같은 HTML을 모의 호스트에서 보여 줍니다. 브라우저 미리보기는 네이티브 편집기 입력이나 실계정 인증을 검증한 결과와 구분합니다. 자세한 테스트 방법과 한계는 [영문 README](README.md#build-and-test-from-source)와 [검증 문서](docs/verification.md)에 있습니다.

사이의 ‘직접 살피며 이해하기’와 운세냥이 MCP의 제한된 도구 연결 방식에서 출발한 프로젝트입니다. [MIT 라이선스](LICENSE)로 공개합니다.

[개인정보 처리 안내](PRIVACY.md) · [보안](SECURITY.md) · [포함된 의존성 고지](THIRD_PARTY_NOTICES)
