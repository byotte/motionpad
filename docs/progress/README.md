# 진행 현황 (새 대화창은 여기부터)

| 단계 | 상태 | 기록 |
|---|---|---|
| 0-1 기준선 | 완료 | `docs/baseline/README.md` |
| 0-2 확정 결함 수정 | 완료 | `0-2.md` |
| 0-3 영역 속성 단일 스키마 | 완료 | `0-3.md` |
| 0-4a CSS 재작성(겉모습 유지) | 완료 | `0-4a.md` |
| 0-4b 디자인 개선 + 테마 확정 | 완료 | `0-4b.md` |
| 0-5 파일 분리 + 단일 HTML 합치기 | 완료 | `0-5.md` |
| **1 선택 엔진** | **진행 중**: 1-A 알고리즘 2차 + 새로·더하기·빼기 완료, 다음은 선 그림 판별·끊긴 선 이어 주기 | `1-A.md` |
| 2 움직임 / 3 완성도 | 대기 | `docs/REVIEW.md` 개발안 v2 |

## 개발 방법 (0-5부터)
- **고치는 곳은 `src/`**. `motionpad.html`은 `node tools/build.js`로 만드는 결과물(배포본)이다. 직접 고치지 않는다. 구성은 `src/README.md`.
- 개발 중에는 `node tools/build.js --watch`, 커밋 전에는 `node tools/build.js --check`(결과물이 src/와 같은지).
- 효과음 base64 한 줄은 이제 `src/sfx/*.wav` 파일이다. JS를 읽을 때 217KB 줄을 피할 필요가 없다(결과물 `motionpad.html`은 여전히 통째로 읽지 말 것).
- 검증 도구(모두 `tools/baseline/`)는 결과물 `motionpad.html`을 대상으로 그대로 쓴다:
  - `run.js <html> <이름>` → 스크린샷·저장 왕복·선택·성능·동작 시험. `compare.py <기준폴더> <새폴더>`로 비교.
  - `style_snapshot.js <기준.html> <새.html> [장면]` → 97개 장면, 모든 요소의 위치·최종 스타일 비교.
  - `schema_check.js <기준.html> <새.html>` → 영역 속성 저장·표시·조작·되돌리기 동등성.
  - `shots.js <html> <폴더> <화면-테마-상태>...` → 검토용 스크린샷(장면 이름은 `scenes.js`).
- 선택 방식 동작 시험: `node tools/baseline/selop_check.js` (새로·더하기·빼기 9단계).
- 실제 그림 비교: `node tools/select/try.js` (`samples/`, `tools/select/real.json`).
- 선택 엔진 정확도: `node tools/select/bench.js <이름> [--base 이전이름] [--images]` (테스트 세트·정답 마스크 자동 생성, 결과 `tools/select/out/`). 자세히는 `1-A.md`.
- 기준 html이 필요하면 `git show <커밋>:motionpad.html > 파일`로 꺼내 쓴다. 0-5 끝 시점 결과물은 0-4b 끝과 바이트까지 같다.

## 사용자 요청 대기 목록 (해당 단계에서 반영)
- 2026-11-13 / 영상 내보내기 / 플레이 화면의 터치(클릭) 이펙트를 영상에 포함할지 선택하는 옵션. 끄면 그림의 변화만 녹화. 이펙트 모양은 미정이지만 작고 알아보기 쉽게. (플레이 화면 터치 이펙트 자체도 새 기능)
