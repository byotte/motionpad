# 페이블 전체 검수 안내 (2026-11-17 준비)

새 채팅창에서 모델을 **Fable 5.2**로 고른 뒤, 아래 '붙여 넣을 요청문'을 그대로 보낸다.
저장소: `byotte/motionpad`, 기준 커밋: `main` 최신(얼굴 표정 기능까지 들어간 상태).

## 붙여 넣을 요청문

```
MotionPad 저장소 전체를 검수해 줘. 코드는 고치지 말고, 찾은 것을 보고서로만 써 줘.
먼저 CLAUDE.md, docs/BLUEPRINT.md, docs/progress/README.md, docs/review/fable-review.md, docs/review/ui-structure.md를 읽어.
검수 범위와 보고 형식은 docs/review/fable-review.md의 '검수 범위'와 '보고 형식'을 따라.
보고서는 docs/review/fable-report.md로 저장하고 커밋·푸시해 줘(작업 브랜치에, main에는 올리지 말 것).
나에게 하는 설명은 평서문으로 간결하게, 비전문가도 알아듣게.
```

## 검수 범위
1. **전체 구성**: `src/`의 파일 나눔과 실행 순서(`src/index.html`, `src/README.md`)가 합리적인지. 파일 사이 의존(전역 변수·함수 공유, 한 즉시 실행 함수 안에 이어 붙는 구조)에서 위험한 곳.
2. **오류**: 실제로 틀린 동작이 날 수 있는 곳. 특히 최근 기능
   - 얼굴 표정 `src/js/face.js`, `src/js/face-engine.js`(설계 `docs/design/face-reactions.md`)
   - 셰이더 두 벌(기본판·얼굴판 `#define FACE`) 고르기 `src/js/render.js`, `src/js/shaders.js`
   - 되돌리기(`zones.js` stateSnapshot/historyApply)에 얼굴·눈 자리가 함께 들어가는 부분
   - 저장·불러오기(`controls.js` extraState/restoreExtra, `project-file.js`, `storage.js`)에서 옛 프로젝트 호환
   - 녹화(`video.js`, `export-hires.js`)에 반응 층(#crackLayer 곱하기, #faceFxLayer) 합치기
   - 맞은 자리·얼굴 이펙트 `src/js/face-fx.js`, 표정 세부 설정 창 `src/js/face-dialog.js`
3. **스파게티 코드 여부**: 한 줄에 몰아 쓴 긴 함수, 같은 계산이 두 곳에 있는 것(예: 셰이더 faceRed와 미리보기 JS redAt), 여러 파일이 같은 전역 상태를 고치는 곳, 이름이 뜻과 다른 것. '지금 고쳐야 할 것'과 '나중에 정리해도 되는 것'을 나눠서.
4. **성능**: 매 프레임 도는 코드에서 불필요한 일(`controls.js` tick → render·drawOverlay·drawTouchFx·drawCracks).
5. **레이아웃 분류**: `docs/review/ui-structure.md`의 상위·하위 구조대로 화면이 나뉘어 있는지. 같은 단계인데 모양(글자 크기·굵기·상자)이 다른 곳, 하위가 상위처럼 보이거나 다른 기능이 한 묶음처럼 보이는 곳. 실제 화면은 `node tools/baseline/shots.js`로 찍어 보고(PC 1440×900, 폰 390×844), 같은 이름을 다른 뜻으로 쓰는 곳도 찾을 것.
6. **프로젝트 규칙 위반**: CLAUDE.md의 원칙(단일 HTML, 서버 전송 금지, 확인창, '고르면 바로 반영', 되돌리기, 디자인 이름표만 쓰기)에 어긋나는 곳.

## 이미 알고 있는 것(다시 보고하지 않아도 됨)
- `tools/baseline/run.js`가 대화창·메뉴 장면에서 멈춤(얼굴 작업 전부터).
- 웃는 눈에서 볼터치가 끌림, 놀람에서 눈동자가 세로로 늘어남, 만화 빗금이 긴 편(실제 그림 확인 대기).
- Canvas 2D 대체 모드·얼굴판 실패 기기에서는 표정·홍조·빨개짐이 안 보임(안내 창으로 알림).
- 연타 기준(3초 5번)은 고정, 화남의 '얼굴 붉게'는 뺨 홍조로만.
- 얼굴 이펙트·갈라짐의 모양은 사용자와 레퍼런스로 다듬는 중(모양 취향은 검수 대상 아님, 코드 오류만).
- 물방울(땀·눈물)은 원본 그림을 비춘다(화면을 읽으면 GPU가 멈춰 느려져서 일부러 그렇게 함).

## 검사 도구(필요하면 돌려 볼 것)
- 빌드·일치: `node tools/build.js --check`
- 디자인 이름표: `node tools/design/token_check.js`
- 얼굴 기능 속도: `node tools/motion/face_perf.js <html> <old|new> <zone|blink|shy|cry> <pc|phone>`
- 나머지는 `docs/progress/README.md`의 '개발 방법'.

## 보고 형식 (docs/review/fable-report.md)
- 맨 위 요약 5줄 이내: 전체 평가, 가장 급한 것 3개.
- 항목마다: 심각도(높음/중간/낮음) · 파일:줄 · 무엇이 문제인지 · 어떤 상황에서 틀어지는지 · 고치는 방향(한두 줄).
- 순서: 오류 → 구성·스파게티 → 레이아웃 분류 → 성능 → 규칙 위반.
- 추측은 '확인 못 함'이라고 표시.
