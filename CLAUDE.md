# MotionPad 작업 규칙 (세션 시작 시 이 파일과 docs/BLUEPRINT.md만 먼저 읽는다)
- 최우선 기준: docs/BLUEPRINT.md. 우선순위 = 조작 난이도 > 결과물 완성도 > 경량화.
- 검토 근거·개발안 상세: docs/REVIEW.md (필요할 때만 읽는다).
- 배포본은 단일 HTML. 서버 전송 금지. 무거운 AI 모델 금지(별도 허락 시 실험만).
- 작업본은 motionpad.html(0-2부터). 단계별 결과는 docs/progress/, 측정은 tools/baseline (docs/baseline/README.md).
- legacy-0.5rc23.html은 이전 개발자 원본. 통째로 읽지 말 것(효과음 base64 한 줄 ~217KB). grep/sed로 필요한 부분만.
- 한 번에 한 단계, 변경마다 기준선(스크린샷·저장 왕복·성능 계측)과 비교. 정리 단계에 기능 추가 금지.
- 사용자 응답 문체: 평서문, 간결, 다정, 비전문가 눈높이.

# 확정 개발 순서
0-1 기준선 확보(코드 수정 없음) → 0-2 확정 결함 수정 → 0-3 영역 속성 단일 스키마(저장 형식 불변)
→ 0-4 CSS 재작성·죽은 UI 제거 → 0-5 개발용 파일 분리 + 단일 HTML 합치기 스크립트
→ 1 선택 엔진(1-A 알고리즘 먼저, 1-B 고해상 마스크는 가설) → 2 움직임 → 3 완성도.

# 소스에서 확인된 결함 (원본 기준)
- feather/spread 드래그 중 매 프레임 updateMasks→updateTailCutout→buildBackgroundPlate 재실행. 결과에 영향 없는 낭비. 마스크 갱신도 전체 영역 일괄.
- previewMotion()이 setMode('play') 호출 → 마술봉/윤곽 미리보기와 editCheckpoint 소실. 해법: 모드 전환 대신 '터치 미리보기' 플래그.
- outlineCosts: minimax 비용이라 선화 뒤 픽셀이 fg=bg≈255 동점 → threshold 1 미달로 탈락. 해법: 미결정 분류, 구멍 메우기, 선 두께 기반 장벽 감쇠, 외곽 배경색 모델.
- 선택 결과 768px 계산 후 384 TILE로 다운샘플 저장. RLE runs가 TILE*TILE 전제(포맷 v2). 해상도 변경 시 v3 + 구버전 변환 필요.
- showZoneMenu가 prompt() 사용. 몸체 지정 시 feather/spread 강제 덮어쓰기.
- 영역 속성 ~45개가 clean/sanitize/updateUI/updateValues/바인딩 목록/snap 6곳에 수동 나열.
- CSS 7겹 지층, 브레이크포인트 10종+, 죽은 UI(#motionDialog 진입점 없음, allTestBtn 숨김, teal 테마 잔재), JS가 런타임에 DOM 재조립.

# 기술 제약 메모
- 셰이더 텍스처 슬롯 6개 사용(WebGL1 최소 보장 8). 영역별 개별 텍스처 불가.
- 영역당 uniform vec4 12개 ×12영역=144. 영역 확장 시 데이터 텍스처 필요. 12개 초과 필요성부터 확인.
- 분리 레이어(tailCutout)는 '튀어나가는 부위'만. 볼·몸통은 연속 변형 유지(찢어짐 방지).
- ES 모듈은 file://에서 막힘 → 배포본은 반드시 합친 단일 파일.

# 청사진과 현재 코드의 차이 (작업 중 확인할 것)
- 선택 도구에 '제외' 모드 요구(현재는 새로/더하기만). 마술봉에 더할/뺄 곳 지정 요구.
- '이동' 도구는 위치만 이동(현재 이동·변형 겸용). 도형 도구에 사각형 추가 요구.
- 영상 내보내기: 해상도·비율·화질·예상 용량 선택, GIF 희망(현재 길이·FPS만).
- 배경음악 기본 off, 효과음 기본 on. 깜빡임 빈도 옵션 요구.
- 청사진 '선택영역 목록'의 경계 흐림 항목은 몸체 지정과 중복인지 확인 필요.
