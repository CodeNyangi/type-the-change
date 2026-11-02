# 버전과 Marketplace 배포

공개 대상은 `CodeNyangi.type-the-change`입니다. 소개의 원본은 `README.md`, `README.ko.md`, 상세 사용법은 `docs/guide*.md`, 짧은 설명과 명령 이름은 `package.nls*.json`입니다. Marketplace 패키지는 양쪽 소개·사용법·개인정보·해당 버전 검증 문서를 하나의 소개에 포함합니다.

## 버전 기준

- `package.json`, 잠금 파일, 변경 기록의 최신 버전, 검증 문서가 일치해야 합니다.
- 기능 추가는 minor, 호환되는 수정·설명·정리는 patch로 올립니다. 이미 공개한 버전은 재사용하지 않습니다.
- `vX.Y.Z` 태그는 실제 패키지를 만든 소스 커밋을 가리킵니다. 공개 태그와 과거 커밋은 이동·재작성하지 않습니다.
- `releases/X.Y.Z.json`에 공개 패키지 해시, 소스 기준점, 검증 명령과 확인 시각을 기록합니다. 미커밋 상태였던 과거 배포에 소스 SHA를 추측해 붙이지 않습니다.
- 로컬 커밋·설치·GitHub 공개·Marketplace 공개는 별도 상태입니다. 업로드 접수나 `Verifying`만으로 공개 완료라고 쓰지 않습니다.

## 준비

1. 변경을 검토하고 한국어 접두사 커밋으로 정리합니다. 기능·유지보수·배포 기록을 구분합니다.
2. 버전, 한국어·영어 소개, 변경 기록과 검증 문서를 함께 갱신하고 커밋합니다.
3. `npm ci` 후 `npm run release:verify`를 실행합니다. 타입·현재 테스트·빌드·실제 VS Code 호스트·162개 학습 화면·SCM 비교를 검사합니다. Linux의 호스트 검사는 가상 디스플레이가 필요합니다.
4. `npm run package:marketplace`로 배포 파일과 `.release.json` 영수증을 만듭니다. 미커밋 변경, 다른 소스의 검증 결과, 변한 빌드, 예상 밖 패키지 파일, 기존 공개 버전이면 중단합니다.

일반 `npm run package`는 개발용 패키지입니다. 공개 업로드에는 `*-marketplace.vsix`와 동일 이름의 검증 영수증을 사용합니다. 실제 채팅 검증과 개인 스크린샷은 `artifacts/`에만 보관하며 패키지에 넣지 않습니다.

정적 영상·라이선스 링크는 `release.config.json`의 이미 공개된 `mediaRevision`에 고정합니다. 로컬에만 있는 새 커밋을 공개 링크로 만들지 않습니다. 영상은 이전 가져오기·검사 흐름임을 표시합니다.

## 공개와 확인

직접 배포 요청을 받은 대화에서만 공개합니다. 같은 대상과 범위에 대한 승인을 반복해서 요청하지 않습니다. Git push·PR·merge는 각각 승인된 범위에서만 수행합니다. 이 문서는 배포 승인이 아닙니다.

1. [게시자 관리](https://marketplace.visualstudio.com/manage/publishers/CodeNyangi)에서 기존 확장의 **Update**로 검증된 VSIX를 업로드합니다.
2. 공개 조회 `node node_modules/@vscode/vsce/vsce show CodeNyangi.type-the-change --json`의 결과를 `artifacts/marketplace-X.Y.Z-metadata.json`에 저장합니다.
3. `npm run release:record -- artifacts/marketplace-X.Y.Z-metadata.json`으로 버전·게시자·SHA-256이 준비한 패키지와 같은지 검사하고 공개 기록을 만듭니다.
4. 영수증의 `source.commit`에 주석 태그 `vX.Y.Z`를 만들고, 배포 기록을 별도 한국어 커밋으로 남깁니다. 태그가 이미 있으면 먼저 같은 커밋인지 확인합니다.
5. 설치된 버전과 실제 화면을 확인하고 공개 링크를 전달합니다.

자동 게시, 자동 병합, 토큰 발급은 이 절차에 없습니다. CI는 검증과 개발용 파일 생성까지만 합니다.

## 과거 배포

0.6.0과 0.6.1은 패키지·Marketplace 해시가 검증됐지만 미커밋 소스에서 배포됐습니다. 기록에는 확인된 기반 커밋과 이 한계를 남기며 가짜 소스 태그를 만들지 않습니다. 0.7.0의 검증된 작업 사본은 별도 커밋으로 보존했습니다. 이후 배포는 깨끗한 커밋에서 검증과 패키징을 진행합니다.
