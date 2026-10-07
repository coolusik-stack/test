# 도토리깡 출시 계획

목표: **2026년 12월 8일(화) App Store 출시**, 안드로이드는 같은 주 Google Play.
날짜보다 품질이 먼저입니다. 각 단계의 "통과 조건"을 못 넘으면 날짜를 미룹니다. 연말 앱 심사가 느려지는 시기(12월 하순) 전에 내고, 남은 연말은 첫 업데이트에 씁니다.

진행 방식: 개발은 Claude가 하고, 당신은 매주 아이폰에서 TestFlight 빌드를 15~20분 해 보고 느낌을 알려 줍니다. 빌드, 테스트, 웹 배포, 스토어 스크린샷은 GitHub가 자동으로 합니다(아래 "자동화").

## 일정

| 단계 | 기간 | 개발 | 당신 | 통과 조건 |
|---|---|---|---|---|
| **M0 출시 기반** | 10/5 ~ 10/11 | ✅ 자동 테스트·출시 전 점검·스토어 스크린샷·스토어 문구·릴리스 명령 · ✅ 글꼴 내장 · ✅ 친구 대결 중계 서버(모바일 데이터에서도 연결, 끊기면 자동 재연결) | **한 번만 할 일 1~5** (아래) | 첫 TestFlight 빌드가 자동으로 아이폰에 설치됨 |
| **M1 첫 경험** | 10/12 ~ 10/25 | ✅ 따라 하는 튜토리얼(1분 연습 한 판) · ✅ 앱이 뒤로 갔다 오거나 전화가 와도 이어지게(상대에게 '잠깐 자리 비움', 앱이 꺼졌다 켜져도 방으로 자동 복귀) · ✅ 오래된 아이폰 성능(느리면 화질 자동 조절) · ✅ 연결 끊김 처리 · 실기기 확인은 남음 | 친구 5~10명 TestFlight 초대 | 처음 하는 사람이 설명 없이 첫 판을 끝냄 · 크래시 0 · 아이폰 11급에서 매끄러움 |
| **M2 할 거리** | 10/26 ~ 11/15 | ✅ **깡단 원정**(봄·여름·가을·겨울 12단계 CPU, 단계마다 다른 맵, 단계마다 별 3개) · ✅ 맵 12개(계절마다 3개, 맵마다 아이디어 하나, 좌우 높이가 다른 비대칭, 판마다 집 뽑기 — MAPS.md) · ✅ 화면 다듬기(배경·떠다니는 것·말풍선·명당 표시를 조용하게, 큰 한 방에만 흔들림과 슬로모션) · ✅ **깡단 옷장**(모자 6·수레 5·발사 자국 4, 별로 열기, 친구 화면에도 보임) · ✅ 결과 카드 공유 · 추락 K.O. 영상은 뒤로 미룸(아래 '빼는 순서' 1번) · 소리·연출 다듬기는 베타 의견 받으며 | 베타 20~50명으로 넓히기 | 다음 날 다시 켜는 비율 35% 이상 · 판 끝나고 공유 누르는 사람이 생김 |
| **M3 과금·안드로이드** | 11/16 ~ 11/29 | ✅ 깡단 후원 팩(옷장 아래 카드, 결제·구매 복원, 다시 설치해도 저절로 복원) · ✅ 안드로이드 앱(가로 화면, 아이콘, 뒤로 가기 버튼, 진동) · ✅ 테스트용 APK 자동 빌드 · Google Play 내부 테스트 업로드(키 등록 후 자동) · ✅ 밸런스 점검(먼저 쏜 쪽 승률: 맵 12개를 비대칭으로 다시 그린 뒤 맵마다 48판: 먼저 쏜 쪽 48~69%, 왼쪽 집 46~60% — 모두 70% 미만, 표는 MAPS.md) | 한 번만 할 일 6~8, 가격 확정 | 결제·복원이 실기기에서 됨 · 주간 밸런스 표에서 한쪽이 70% 넘게 이기는 맵 없음 |
| **M4 출시** | 11/30 ~ 12/8 | 스토어 문구·스크린샷 최종(자동 업로드) · `npm run preflight -- --strict` 통과 · 심사 대응 | 개인정보 라벨·연령 등급 설문·가격·출시일 입력 | **12/1(화) 심사 제출**, 승인되면 **12/8(화) 출시** |
| 출시 후 | 12월 ~ | 2주마다 업데이트: 버그 → 비동기 친구 대결 → 모르는 사람과 매칭 → 시즌 | 리뷰·문의 확인 | |

일정이 밀릴 때 빼는 순서: 추락 K.O. 영상 저장 → 깡단 원정 단계 수(12 → 8) → 안드로이드 동시 출시(→ 12월 말). 튜토리얼, 연결 안정성, 결제 복원은 빼지 않습니다.

## 자동화 (이미 돌아가는 것)

| 언제 | 무엇이 자동으로 | 어디서 보나 |
|---|---|---|
| 게임 코드를 push할 때마다 | 12가지 자동 테스트(켜짐·글꼴, 메뉴~결과, 처음 온 사람의 연습 한 판, 깡단 원정·옷장·결과 카드, 후원 팩 구매·복원, 모든 맵(12개) 명당 돌기, 출발점 사격, 두 폰 동기화, 친구 대결 로비, 중계 서버로 대결하다 연결 끊기·다른 앱 갔다 오기·새로고침, CPU 한 판, 속도와 화질 자동 조절) + 출시 전 점검 | GitHub → Actions → **Game tests** (표와 스크린샷) |
| `npm run release -- minor --push` 한 번 | 버전 올리기(게임·Xcode·오프라인 캐시) → 커밋·태그 → 테스트 통과하면 **TestFlight 업로드**, **웹 배포**, **스토어 스크린샷 13장** | Actions → iOS TestFlight / Web deploy / Store assets |
| iOS 쪽(플러그인 포함)이 바뀔 때마다 | Mac에서 서명 없이 iOS 앱 컴파일 확인 | Actions → **iOS build check** |
| 게임 코드를 push할 때마다 | 안드로이드 테스트용 APK 빌드 | Actions → **Android** → Artifacts → dotori-kkang-debug (폰에 바로 설치) |
| 출시 태그(`v…`) | 위에 더해 Play 스토어용 번들(.aab) 서명·빌드, 서비스 계정이 있으면 Play Console 내부 테스트에 자동 업로드 | Actions → **Android**, Play Console |
| `store-v…` 태그 | 스토어 문구(`store/metadata`)와 스크린샷을 App Store Connect에 올리기(심사 제출은 안 함) | App Store Connect |
| 중계 서버(`relay/`)를 고칠 때마다 | Cloudflare 실제 런타임에서 프로토콜 검사 → 통과하면 **중계 서버 배포** → 배포된 서버에 다시 검사 | Actions → **Relay** |
| 매주 월요일 | CPU끼리 맵마다 12판(먼저 쏘는 쪽을 번갈아), 먼저 쏜 쪽 승률·자리별 주고받은 피해·추락 표 | Actions → **Balance report** |

직접 돌릴 때(Mac이나 PC에서 `angry-fortress` 폴더):
```bash
npm test                 # 전체 자동 테스트 (약 2분)
npm run preflight        # 출시 전 점검: 스토어 글자 수, 상표 키워드, 아이콘 투명도, 버전, 빈 문의처…
npm run store:shots      # 스토어 스크린샷 다시 만들기 (store/screenshots, store/play)
npm run balance -- 12    # 밸런스 표
npm run release -- patch --push   # 새 버전 배포
```

아직 실제로 돌려 보지 못한 것: TestFlight 업로드, 스토어 문구 업로드, 웹 배포, 중계 서버 배포. 비밀 값이 필요해서 당신이 아래 1~3을 해야 처음 돌아갑니다. 첫 실행에서 손볼 곳이 나오면 고치겠습니다. (중계 서버 코드는 Cloudflare 실제 런타임 `wrangler dev`에서 검사를 통과했습니다.)

## 한 번만 할 일

1. **App Store Connect에 앱 만들기**: 번들 ID `com.coolusikstack.dotorifortress`, 이름 도토리깡 ([IOS.md](IOS.md) 1번).
2. **TestFlight 자동 업로드 연결**: App Store Connect → 사용자 및 액세스 → 통합 → API 키 생성(관리 권한). 그다음 GitHub 저장소 → Settings → Secrets and variables → Actions에 4개를 등록합니다.
   - `ASC_KEY_ID`
   - `ASC_ISSUER_ID`
   - `ASC_KEY_P8`(.p8 파일 내용 전체)
   - `APPLE_TEAM_ID`
3. **웹판·중계 서버 자동 배포 연결** (Cloudflare 무료 요금제로 충분):
   - [Cloudflare](https://dash.cloudflare.com/sign-up) 무료 가입 → 왼쪽 메뉴 **Workers & Pages**를 한 번 열어 둡니다(이때 `○○.workers.dev` 주소가 정해집니다).
   - My Profile → API Tokens → Create Token → **Custom token**, 권한 두 줄:
     - Account · **Cloudflare Pages** · Edit
     - Account · **Workers Scripts** · Edit
   - 대시보드 오른쪽의 Account ID
   - GitHub Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 등록
   - 그다음 아무 버전이나 출시하면(`npm run release -- patch --push`) 웹판 배포가 중계 서버를 먼저 올리고 웹판을 올립니다. iOS 빌드도 중계 서버 주소를 알아서 넣습니다. 중계 서버만 먼저 올리려면 `git tag relay-v1 && git push origin relay-v1`.
   - 웹 주소는 `https://dotori-kkang.pages.dev`가 되고, 스토어의 지원·개인정보 링크도 여기를 가리킵니다.
   - 이 저장소의 GitHub Pages는 이미 다른 사이트가 쓰고 있어서 쓰지 않습니다.
4. **문의 이메일**: `privacy.html`과 `support.html`의 `[문의 이메일을 적어 주세요]` 두 곳을 채웁니다(`npm run preflight`가 알려 줍니다). 공개 페이지에 실리니 지원용 이메일을 따로 만드는 걸 권합니다.
5. **유료 앱 계약·세금·은행 정보**(App Store Connect → 비즈니스): 결제에 필수이고 승인까지 시간이 걸리니 이번 주에 시작하세요. **App Store 스몰 비즈니스 프로그램**도 신청합니다(수수료 30% → 15%).
6. **Google Play Console** 가입(25달러, 한 번)과 신원 확인. 며칠 걸릴 수 있어요(M3 전까지). 그다음:
   - **업로드 키**: Mac 터미널에서 `angry-fortress` 폴더로 가서 `npm run android:key` → 홈 폴더에 `dotori-kkang-upload.jks`가 생기고 값 4개가 나옵니다. 그대로 GitHub Secrets에 등록(`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). `.jks` 파일과 비밀번호는 비밀번호 관리자에 꼭 백업하세요(잃어버리면 업데이트가 번거로워짐). 자바가 없다는 오류가 나면 `brew install openjdk`.
   - Play Console에서 앱 만들기(패키지 이름 `com.coolusikstack.dotorifortress`) → 처음 한 번은 Actions에서 받은 .aab를 **내부 테스트**에 직접 올립니다(Google 규칙).
   - (선택, 이후 자동 업로드) Google Cloud 서비스 계정 JSON을 만들어 Play Console에 권한을 주고 `PLAY_SERVICE_ACCOUNT_JSON` Secret으로 등록.
7. **인앱 상품 만들기** (가격 확정 후): App Store Connect → 앱 → 인앱 구입 → **비소모성**, 제품 ID `supporter_pack`, 이름 '깡단 후원 팩', 가격(예: ₩5,900), 심사용 스크린샷(옷장 화면). Play Console → 수익 창출 → 인앱 상품 → 같은 ID `supporter_pack`. 두 곳 모두 ID가 정확히 같아야 앱에 가격이 뜹니다.
8. **세금·신고**: 앱 수익을 받는 데 필요한 사업자등록과 게임제작업 신고 여부를 세무사나 구청에 확인합니다.
9. **(권장) 게임 전용 저장소**: 지금 저장소의 `main`은 다른 사이트입니다. 게임만 담은 저장소(예: `dotori-kkang`)로 옮기면 Actions의 "Run workflow" 버튼과 매주 자동 실행이 제대로 동작합니다. 매주 자동 실행은 기본 브랜치에서만 돌아갑니다. 저장소를 만들어 주면 옮기겠습니다.

## 스토어에 들어갈 것 (자동으로 준비됨)

- 문구: `store/metadata/ko/`
  - 앱 이름 "도토리깡"
  - 부제 "친구랑 폰 두 대로 다람쥐 새총 1:1"
  - 설명, 키워드(다른 게임 이름 없이), 홍보 문구, 지원·개인정보 링크
  - 심사 메모: 기기 한 대로 확인하는 방법
- 스크린샷: `npm run store:shots`로 만들어요.
  - iPhone 6.9형 2868×1320 6장
  - Google Play 1920×1080 6장과 1024×500 그래픽
  - 장면: 친구 1:1 · 조준 · 추락 K.O. · 명당 · 트램펄린 · 깡단
- 손으로 넣을 것:
  - 개인정보 라벨: 계정·광고·분석이 없어 "데이터를 수집하지 않음"이 유력합니다. 친구 대결의 게임 상태는 중계 서버를 거치지만 저장하지 않고, IP도 기록하지 않습니다(`privacy.html`에 적어 둠).
  - 연령 등급 설문(만화적 폭력 "드물게/약하게")
  - 저작권 표기(본인 이름)
  - 가격
  - 심사 연락처
