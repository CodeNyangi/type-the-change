# 코드 구조

TTC는 기존 Codex 채팅을 읽고, VS Code에서 보고 있는 변경과 연결하는 학습 화면입니다. 작업 실행·대화·장기 기억은 Codex가 담당합니다.

| 경계 | 코드 | 역할 |
| --- | --- | --- |
| Codex 기록 | `src/codex-observer.ts` | 허용된 조회 요청, 페이지 읽기, 연결 수명 |
| 실제 진행 알림 | `src/codex-events.ts`, `src/codex-hook.ts` | 로컬 이벤트 메타데이터만 전달 |
| 채팅과 워크트리 | `src/companion.ts`, `src/worktrees.ts` | 등록된 경로 연결, 갱신, 경쟁 상태 처리 |
| 변경과 학습 | `src/change-review.ts` | 비교 구간, 스냅샷, 짧은 연습 가능 여부 |
| VS Code 연동 | `src/companion-host.ts` | 열린 파일·SCM 비교 추적, 읽기 전용 비교, 별도 연습 문서 |
| TTC 화면 | `src/companion-view.ts` | 기존 설명 발췌와 다음 행동, 한국어·영어 |
| 선택형 가져오기 | `src/plan*.ts`, `src/judgment.ts`, `src/panel*.ts`, `src/task-checks.ts` | 외부 수정안의 수동 편집·검사·판단 |
| 선택형 MCP | `src/mcp-server.ts`, `src/workspace-files.ts` | 제한된 파일 조회와 수정안 전달 |

관찰 경로는 소스 파일을 쓰지 않습니다. 직접 연습은 저장되지 않은 별도 문서에서 진행합니다. 가져오기 방식의 저장·검사는 사용자가 명시적으로 선택한 동작입니다.

사용하지 않는 독립 OAuth·모델 호출·계정 잠금 구현은 0.7.1에서 제거했습니다. 과거 구현과 당시 검사는 Git의 `v0.7.0` 이전 기록에서 확인합니다. 폐기된 소스를 실행 경로와 함께 복제해 유지하지 않습니다.

`test/`는 현재 동작과 경계를, `test-host/`는 실제 VS Code 연동을 검사합니다. `scripts/test-real-*`는 지정한 기존 채팅을 읽는 수동 검증이며 CI가 개인 채팅을 사용하지 않습니다. 결과·스크린샷·VSIX는 Git에서 제외한 `artifacts/`에 둡니다. 공개 배포의 버전·소스·패키지 해시만 `releases/`에 남깁니다.
