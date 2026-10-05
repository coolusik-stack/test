# iOS 앱 (TestFlight) 빌드 가이드

웹 게임을 [Capacitor](https://capacitorjs.com) 8로 감싼 iOS 앱입니다. 게임 코드는 웹과 똑같고, 앱에서만 되는 것은 두 가지입니다.

- **진동(햅틱)**: iPhone의 Taptic Engine을 Core Haptics로 직접 울립니다. iPhone 사파리(웹)는 진동을 지원하지 않아서, 손맛은 앱에서만 납니다.
- **공유 시트**: 방 코드를 iOS 기본 공유 창으로 보냅니다.

| 항목 | 값 |
|---|---|
| 번들 ID | `com.coolusikstack.dotorifortress` |
| 앱 이름 | 도토리깡 |
| 최소 iOS | 15.0 |
| 기기 | iPhone 전용, 가로 화면 고정 |
| 네이티브 코드 | `ios/App/App/GameViewController.swift` (햅틱 플러그인, 홈 인디케이터 숨김) |

번들 ID는 사용자에게 보이지 않아서 예전 이름(`dotorifortress`) 그대로 둡니다. 바꾸려면 App Store Connect에 앱을 만들기 전에 `capacitor.config.json`의 `appId`와 Xcode의 Signing & Capabilities → Bundle Identifier를 같이 바꾸세요(앱을 만든 뒤에는 바꿀 수 없습니다).

## 1. App Store Connect에 앱 만들기 (처음 한 번)

1. [App Store Connect](https://appstoreconnect.apple.com) → 앱 → **+** → 신규 앱
2. 플랫폼 iOS, 이름 `도토리깡`(스토어 전체에서 이미 쓰는 이름이면 `도토리깡: 다람쥐 새총 1:1`처럼 뒤에 붙여서), 기본 언어 한국어
3. 번들 ID: 목록에 없으면 먼저 [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)에서 `com.coolusikstack.dotorifortress`를 등록합니다. Xcode에서 한 번 빌드하면 자동으로 등록되기도 합니다.
4. SKU는 아무 값이나 넣으면 됩니다(예: `dotori-kkang`).

## 2-A. Mac이 있을 때 (Xcode)

필요한 것: 최신 Xcode(App Store에 올리려면 Apple이 요구하는 최신 SDK로 빌드해야 함), Node.js 22 이상

```bash
cd angry-fortress
npm install          # Capacitor와 햅틱·공유 플러그인 설치
npm run ios          # www/ 만들고 iOS 프로젝트에 복사 (웹 코드를 고칠 때마다 다시)
npm run ios:open     # Xcode 열기
```

Xcode에서 할 일:
1. 왼쪽에서 **App** 프로젝트 → TARGETS **App** → **Signing & Capabilities** → *Automatically manage signing* 체크 → **Team**에서 내 개발자 계정 선택
2. iPhone을 USB로 연결하고 ▶ 실행. **진동은 실기기에서만 느낄 수 있습니다**(시뮬레이터에는 햅틱이 없음). 처음이면 iPhone의 설정 → 개인정보 보호 및 보안 → 개발자 모드를 켜야 합니다.
3. 상단 기기 선택을 **Any iOS Device (arm64)**로 바꾸고 **Product → Archive**
4. Organizer 창에서 **Distribute App → App Store Connect → Upload**
5. 10~30분 뒤 App Store Connect → TestFlight 탭에 빌드가 나타납니다.

같은 버전 번호로 다시 올릴 때는 **Build** 번호(General 탭)를 올려야 합니다.

## 2-B. Mac이 없을 때 (GitHub Actions, 선택)

`.github/workflows/ios-testflight.yml`이 GitHub의 Mac 서버에서 빌드하고 TestFlight에 바로 올립니다. **아직 실제로 돌려 보지 않은 설정**이라 첫 실행에서 손볼 곳이 나올 수 있습니다.

1. App Store Connect → 사용자 및 액세스 → 통합 → **App Store Connect API** → 키 생성. 역할은 **관리(Admin)**여야 인증서를 자동으로 만들 수 있습니다. `.p8` 파일은 한 번만 내려받을 수 있으니 잘 보관하세요.
2. GitHub 저장소 → Settings → Secrets and variables → Actions에 네 개를 등록합니다.
   - `ASC_KEY_ID`: 키 ID
   - `ASC_ISSUER_ID`: 발급자 ID(키 목록 위에 표시)
   - `ASC_KEY_P8`: `.p8` 파일 내용 전체
   - `APPLE_TEAM_ID`: 개발자 계정의 팀 ID(developer.apple.com → Membership)
3. 새 버전은 한 줄로 냅니다. 버전이 게임·Xcode·오프라인 캐시에 한꺼번에 들어가고, 태그가 푸시됩니다. GitHub가 **자동 테스트를 먼저 돌리고, 통과해야만** TestFlight에 올립니다(빌드 번호는 실행 번호로 자동 증가). 공개 저장소라 Mac 실행 시간은 무료입니다.
   ```bash
   npm run release -- patch --push      # 0.1.0 → 0.1.1
   ```
   빌드만 다시 올리고 싶으면 `ios-v`로 시작하는 태그를 푸시해도 됩니다. 일정과 나머지 자동화는 [LAUNCH.md](LAUNCH.md)에 있습니다.

## 3. TestFlight로 테스트하기

- **내부 테스트**: App Store Connect 팀원(최대 100명)은 심사 없이 바로 설치할 수 있습니다. TestFlight 탭 → 내부 테스트 → 그룹을 만들고 테스터를 추가하세요.
- **외부 테스트**(친구 등 팀원이 아닌 사람, 최대 1만 명): 첫 빌드는 베타 앱 심사를 거칩니다(보통 1일 안팎). 테스트 정보(설명, 피드백 이메일)를 채우고, 공개 링크로 초대할 수 있습니다.
- **개인정보 처리방침**: `privacy.html`을 넣어 두었습니다. 문의 이메일 칸을 채우고 웹에 올린 뒤(GitHub Pages, Notion 공개 페이지 등) 그 주소를 App Store Connect에 적으세요. 정식 출시에는 필수입니다.
- **앱 개인정보 라벨**: 이 앱은 계정·광고·분석이 없고 개인정보를 저장하지 않습니다. 친구 대결 때 게임 상태가 중계 서버를 거치지만 저장되지 않고, 서버는 IP 주소를 기록하지 않습니다(Cloudflare 기본 로그는 남을 수 있음). '데이터를 수집하지 않음'으로 신고할 수 있는지 최종 판단하세요.
- **수출 규정(암호화)**: 표준 암호화(HTTPS·WebRTC)만 쓰므로 `Info.plist`에 `ITSAppUsesNonExemptEncryption = NO`를 넣어 두었습니다. 업로드할 때마다 묻지 않습니다.

## 테스트 체크리스트

- [ ] 새총을 당길 때 '딸깍딸깍' 톱니 느낌, 끝까지 당기면 강한 딸깍
- [ ] 발사할 때 세기에 비례한 '퉁'
- [ ] 상대를 맞히면 피해만큼 세게, 25 이상은 두 번 '쿵쿵'. 내가 맞으면 둔탁한 '퍽'
- [ ] 폭발은 크기만큼 길게 울리는 진동, 나무가 쓰러질 때 '우르르 쿵'
- [ ] K.O.와 승리 팡파르, 패배 진동
- [ ] 호두가 땅을 뚫을 때 '드르륵', 구름 아래로 떨어질 때 가라앉는 진동
- [ ] 발밑이 갈라질 때(턴 시작)와 벼랑 끝에서 수레가 멈출 때 '톡톡'
- [ ] 친구 대결에서 내 차례가 오면 '톡톡'
- [ ] 일시정지(메뉴)의 '진동' 끄기가 전부 막는지
- [ ] 같은 와이파이에서 친구 대결 → 모바일 데이터끼리 친구 대결

진동 세기와 패턴은 `js/haptics.js` 한 곳에서 조절합니다. 각 패턴은 `{t: 시작초, i: 세기 0~1, s: 날카로움 0~1, d: 길이}`의 목록입니다.

## 알려진 한계 (MVP)

- **Swift 코드는 여기서 컴파일해 보지 못했습니다.** Mac에서 처음 빌드할 때 오류가 나면 그 메시지를 알려 주세요.
- **친구 대결 연결**: 앱은 우리 중계 서버(`relay/`, Cloudflare)를 거쳐 연결하므로 모바일 데이터끼리도 됩니다. 빌드가 중계 서버 주소를 알려면 Cloudflare 비밀값이 등록되어 있고 Relay 워크플로가 한 번 배포되어 있어야 합니다([LAUNCH.md](LAUNCH.md) 한 번만 할 일 3). 그 전 빌드는 PeerJS 직접 연결(같은 와이파이에서는 잘 되지만 모바일 데이터끼리는 안 될 수 있음)을 씁니다.
- **친구 초대**: 방 코드를 공유합니다. 앱 링크로 바로 들어오는 딥링크는 아직 없습니다.
