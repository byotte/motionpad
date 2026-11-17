# 백업 (작업지시서 2026-11-17 작업 전후)

## 1. 바뀌기 전 그대로의 프로그램
- `motionpad-2026-11-17-before-work-order.html` = 작업지시서 작업을 시작하기 전 main(커밋 `9a2e94b`, 얼굴 6차 피드백까지)의 배포본 그대로.
- 웹에서 바로 열기: https://byotte.github.io/motionpad/backups/motionpad-2026-11-17-before-work-order.html (지금 판과 나란히 비교할 수 있다)
- 프로젝트 파일은 앞뒤 판 모두 같은 형식(version 2)이라 서로 열린다. 새 판에서 저장한 파일에는 `autoStrength`(4-1 세기)가 더 들어 있지만 옛 판은 이 값을 무시한다.

## 2. 단계별 되돌리기 (커밋 번호)
단계마다 따로 커밋했다. 마음에 안 드는 단계만 `git revert <커밋>`으로 되돌릴 수 있다(나중 단계와 같은 줄을 고친 곳이 있으면 그 부분만 손으로 맞춘다).

| 단계 | 커밋 | 내용 | 기록 |
|---|---|---|---|
| (시작 전) | `9a2e94b` | 작업지시서 전 main | — |
| 작업지시서·검수 보고서 | `70576ea` | 문서만 | `docs/review/` |
| 오류 묶음 1 | `9f878d3` | 원본 크기 녹화 중 깜빡임(E1), 없는 파일(E13), inventory 도구(E14) | `docs/progress/fix-bundles.md` |
| 오류 묶음 2 | `6ed8511` | 되돌리기 오류(E3·E4·E5), 새 그림 열 때 설정 초기화(E6·E7) | 〃 |
| 오류 묶음 3 | `05ea01a` | 빈자리 채우기 영역의 표정(E2) | 〃 |
| 오류 묶음 4 | `bf3bcd9` | 내보내기 버튼·옵션 줄 높이·폰 화면 높이·폰 버튼(L7·L8·L10·L11) | 〃 |
| A-1·A-2 | `45bc0b1` | 묶음 상자 바탕 차이, 그림 둘레 단색 | `docs/progress/A.md` |
| A-3 | `5c3b767` | 영역 이름표는 고른 영역에만, 캔버스 색 이름표 | 〃 |
| A-4~A-6 | `e12d0dd` | 도구 순서·새 영역 올가미, 화면 이동 자리, 편집/만져 보기 스위치 | 〃 |
| A-7·A-8·결정 5 | `3e737c4` | 영역 없을 때 감추기, 제목줄 켜기 스위치, 손댄 값만 보라색 | 〃 |
| B | `1dec342` | 도움말 동그라미 → 안내줄 | `docs/progress/B.md` |
| 결정 2 | `fb139c0` | 4-1 세기 / 4-2 반응 세기 나누기 | `docs/progress/D2-strength.md` |
| C | `2cfa9e2` | 간단 카드·부위 칩·크기·저절로, level 속성, 귀 프리셋 | `docs/progress/C.md` |
| D | `7f906b2` | 세 걸음 띠 | `docs/progress/D.md` |
| F | `d4b36e7` | 영역마다 효과음·폰 진동·가끔 짓는 표정 | `docs/progress/F.md` |
| G | `6780af1` | 쓰다듬기, 반복 영상 이음매 샘플 | `docs/progress/G.md` |
| H-1~H-3 | `664f1d2` | 움직임 복사·숫자 직접 입력·숨기기·순서 | `docs/progress/H.md` |
| H-4 | `4689892` | 그림 자르기 | `docs/progress/H.md` |
| I(시험판) | 가지 `face-draft` `a0ef914` | 얼굴 자동 초안. 본판에는 없음, main에는 `motionpad-face-draft.html`만 | `docs/progress/I.md` |

통째로 작업 전으로 돌리려면(배포본만): 위 백업 html을 `motionpad.html`로 복사해 올리면 된다. 소스까지 돌리려면 `git revert`를 위 표 아래에서 위 순서로.

새 단계(C 이후)가 끝날 때마다 이 표에 한 줄씩 더한다.

시험판을 채택하지 않으면: main에서 `motionpad-face-draft.html`을 지우고 가지 `face-draft`를 지우면 흔적이 없다.
