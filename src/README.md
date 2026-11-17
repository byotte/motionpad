# src/ — MotionPad 개발용 원본

**`motionpad.html`(저장소 맨 위)은 이 폴더에서 만들어지는 결과물이다. 직접 고치지 말고 여기를 고친 뒤 합친다.**

```bash
node tools/build.js          # src/ → motionpad.html (수 ms)
node tools/build.js --watch  # 고칠 때마다 자동으로 다시 만든다
node tools/build.js --check  # motionpad.html이 src/와 같은지 확인(커밋 전)
```

## 구성
| 위치 | 내용 |
|---|---|
| `index.html` | 뼈대. `@@include 경로` 줄이 그 파일 내용으로 바뀐다. **파일 순서는 여기서 정한다.** |
| `css/` | 화면 스타일 10구획: tokens(색 토큰·테마) · base · controls · topbar · welcome · editor · panel · dialogs · viewer · responsive(화면 크기별) |
| `html/` | icons(선 아이콘 모음) · app(상단바·캔버스·옵션 패널) · dialogs(대화창·파일 입력·눈 깜빡임 창·도움말) |
| `js/` | 아래 표 |
| `sfx/` | 내장 효과음 wav 17개(사용자 녹음, 16bit 44.1kHz). 목록·이름·묶음은 `js/audio.js`의 `SFX_LIST`, 파일은 `@@base64(sfx/…)` 자리에 base64로 들어간다. |

## js/ (실행 순서대로)
| 파일 | 내용 |
|---|---|
| core | `$`·clamp 같은 도우미, 전역 상태, 움직임 프리셋, setStatus |
| zone-schema | 영역 속성표 ZONE_FIELDS(0-3), clean·sanitize |
| zones | 되돌리기, 영역 추가·삭제·복제, 영역 메뉴, 패널 표시(updateUI/updateValues), 붓·래스터 |
| selection | 마술봉, 윤곽(간략 범위지정), 올가미, 자석 올가미 |
| pointer | 터치·마우스 입력, 핀치, 축 지정, 이동, 도형 다듬기(손잡이·두 손가락) |
| fill | 빈자리 메우기 계산(부드럽게 채우기, 조각 붙이기). 캔버스 없는 순수 계산 |
| masks | 마스크 만들기·캐시, 배경판, 외곽 흔들기(tailCutout), 마스크 미리보기 |
| overlay | 편집 오버레이 그리기, 화면 크기 감시 |
| shaders | WebGL 셰이더 원문(VERT·FRAG) |
| image-viewer | 셰이더 컴파일, 그림 불러오기, 예제, 감상 화면 |
| audio | 효과음·배경음악 |
| storage | 브라우저 내부 저장(IndexedDB), 자동 저장 |
| gif | 움짤(GIF) 인코더(3-E). 캔버스 없는 순수 계산 |
| video | 영상·움짤로 저장(3-D·3-E) |
| project-file | 프로젝트 파일 저장·열기 |
| theme | 테마·화질 |
| render | WebGL 준비, CPU 변형, render() |
| physics | 물리(MotionPhysics), 터치 반응, 마스크 확장(dilateMask) |
| touchfx | 플레이 화면 터치 이펙트(반짝임, 3-F) |
| controls | 전체 움직임·소리 UI, 터치 미리보기, 움직임 조작, 모드 전환, fit·tick |
| blink | 눈 깜빡임 |
| face | 얼굴 목록·부위 입력(입·눈썹·귀)·표정 값·영역에서 쓰는 표정 칸 |
| face-engine | 얼굴 지도(유동화·홍조), 표정 섞기, 셰이더 값, 표정 창 미리보기 |
| face-fx | 맞은 자리(빨개짐·갈라짐), 얼굴 이펙트(땀·눈물·반짝이·💢·하트), 반응 층 |
| face-dialog | 표정 세부 설정 창 |
| dialogs | 도움말 말풍선, 대화창 공통 동작 |
| shortcuts | PC 단축키(3-B) |
| boot | 시작 |

## 알아 둘 것
- JS 파일들은 `<script>` 안 즉시 실행 함수 **하나**에 이어 붙는다. 그래서 파일끼리 변수·함수를 그대로 공유하고, `import`/`export`는 쓰지 않는다(ES 모듈은 file://에서 막힌다).
- `const`/`let`은 앞 파일에서 먼저 선언돼야 뒤 파일 최상단에서 쓸 수 있다. 함수 선언은 어디서나 쓸 수 있다. 파일 순서를 바꿀 때 주의.
- 들어가는 파일은 마지막에 줄바꿈이 있어야 한다(없으면 합치기가 멈추고 알려 준다).
- 효과음을 바꾸려면 wav 파일만 바꾸면 된다.

터치 파일: `tools/build.js`가 같은 소스를 `@@base64` 자리만 비워 한 번 더 만들고(효과음·음악 없는 사본), gzip+base64로 `js/touch-export.js`의 `@@touchshell` 자리에 넣는다. 사본 안에서는 이 자리가 비어 있다. JS 안에 `</script>` 글자를 쓰면 HTML이 스크립트를 거기서 끊으므로 `<\/script>`로 쓴다.
