/* ONEKI page script.
   1. Builds the data-driven markup (scene callouts, rituals, BHAG posters) BEFORE the
      engine mounts, so the engine sees every data-sc-* attribute.
   2. The signature: scroll velocity -> one page-wide --heat. Calm scrolling burns blue
      and hot (1,900°C); fast scrolling flickers amber and cools toward 1,000°C.
   3. The peak: when the stick opens, the page catches cobalt and the gauge locks. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = matchMedia('(max-width: 767px)').matches;

  /* ---------- 1 · the scene: six signals of borrowed energy ---------- */
  // [target x, target y, label x, label y, text] in the brand book's 1836x1170 spread
  var CALLOUTS = [
    [980, 148, 1250, 96, 'Wired, not ready'],
    [843, 389, 560, 300, 'Borrowed energy'],
    [1134, 351, 1340, 286, 'Cup no. 3'],
    [968, 555, 560, 560, 'Loosened, not relaxed'],
    [1152, 944, 1400, 896, 'The crash'],
    [1074, 1092, 720, 1044, 'The debt, paid tonight']
  ];
  var svg = $('.scene__lines'), tags = $('.scene__tags'), lines = '';
  CALLOUTS.forEach(function (c, i) {
    var a = (0.16 + i * 0.075).toFixed(3);                 // when this signal arrives, in act progress
    var w = c[4].length * 10.2 + 34, cx = c[2] < c[0] ? c[2] + w : c[2], cy = c[3] + 19;
    lines += '<g style="--a:' + a + '">' +
      '<line pathLength="1" class="ln" x1="' + cx + '" y1="' + cy + '" x2="' + c[0] + '" y2="' + c[1] + '" stroke="#1C1B1D" stroke-width="4" opacity=".3"/>' +
      '<line pathLength="1" class="ln" x1="' + cx + '" y1="' + cy + '" x2="' + c[0] + '" y2="' + c[1] + '" stroke="#FCFCFB" stroke-width="1.8"/>' +
      '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="7" fill="#B39A5C" stroke="#FCFCFB" stroke-width="2"/></g>';
    var li = document.createElement('li');
    li.textContent = c[4];
    li.style.cssText = 'left:' + (c[2] / 18.36) + '%;top:' + (c[3] / 11.7) + '%;--a:' + a;
    tags.appendChild(li);
  });
  svg.innerHTML = lines;

  /* ---------- 6 · twelve rituals ---------- */
  var Q = [
    ['발표 직전엔 숨 세 번. 그리고 무대로.', '지윤, 프로덕트 디자이너'],
    ['붕대를 감는 동안은 아무 말도 안 한다. 톡, 그리고 고요.', '태오, 아마추어 복서'],
    ['시험장 들어가기 전, 딱 한 번 눈을 감는다.', '서연, 로스쿨 준비생'],
    ['큰 미팅 전 1분, 휴대폰을 뒤집는다.', '민재, 전략 컨설턴트'],
    ['무대 오르기 전엔 손은 따뜻하게, 마음은 차갑게.', '하은, 재즈 피아니스트'],
    ['피칭 직전엔 할 말을 세 문장으로 줄인다.', '도윤, 창업가'],
    ['출발선에선 느리게 숨 쉬고, 결승선에서 크게 웃는다.', '유나, 마라토너'],
    ['랭크전 전엔 물 한 잔, 스트레칭, 그리고 톡.', '준호, 게임 크리에이터'],
    ['첫 출근 날 아침, 거울 앞에서 한 번 웃는다.', '소희, 신입 애널리스트'],
    ['셔터를 누르기 전, 숨을 멈춘다.', '재현, 포토그래퍼'],
    ['나이트 근무 전, 물 한 잔이 먼저.', '나래, 간호사'],
    ['첫 데이트 전엔 동네 한 바퀴.', '건우, 세일즈 리드']
  ];
  var grid = $('.rituals__grid');
  Q.forEach(function (q, i) {
    var li = document.createElement('li');
    li.innerHTML = '<figure class="ritual"><img src="img/ritual-' + String(i + 1).padStart(2, '0') + '.jpg" alt="" width="560" height="560" loading="lazy">' +
      '<q>“' + q[0] + '”</q><figcaption>' + q[1] + '</figcaption></figure>';
    grid.appendChild(li);
  });

  /* ---------- 7 · four BHAG posters, each uncovered as the section passes ---------- */
  var P = [
    { bg: '#2743B0', fg: '#FCFCFB', mark: 'enso-white', t: 'Own the<br>moment<br>before', c: '중요한 순간 직전이면 누구나 ONEKI를 떠올린다. 떨릴 때도, 기 빠질 때도. ‘기 트자’가 일상어가 된다.' },
    { bg: '#B39A5C', fg: '#1C1B1D', mark: '', t: 'Blue<br>is a<br>category', c: '‘블루 에너지’가 진열대의 한 칸이 된다. 레드 옆에, 레드만큼. 그리고 우리가 그 이름의 첫 줄에 선다.' },
    { bg: '#0C0C0D', fg: '#B39A5C', mark: 'enso', t: 'One stick,<br>every<br>pocket', c: '주머니마다 한 포. 매년 1억 번의 톡.' },
    { bg: '#F4ACA4', fg: '#1C1B1D', mark: '', t: 'Quiet<br>East,<br>loud<br>world', c: '서울에서 시작한 조용한 에너지가 도쿄, 싱가포르, LA의 무대 뒤를 바꾼다.' }
  ];
  var plist = $('.posters');
  P.forEach(function (p, i) {
    var li = document.createElement('li');
    li.className = 'poster';
    var at = (0.18 + i * 0.07).toFixed(2) + ' ' + (0.36 + i * 0.07).toFixed(2);
    li.innerHTML = '<div class="poster__art" style="--bg:' + p.bg + ';--fg:' + p.fg + '" data-sc-reveal="up" data-sc-reveal-at="' + at + '">' +
      (p.mark ? '<img src="img/' + p.mark + '.webp" alt="" width="640" height="640">' : '') +
      '<p class="poster__t">' + p.t + '</p><p class="poster__s">2036 · BHAG 0' + (i + 1) + '</p></div>' +
      '<p class="poster__cap"><b>BHAG 0' + (i + 1) + '</b>' + p.c + '</p>';
    plist.appendChild(li);
  });

  /* ---------- the peak sequence: a portrait cut on phones ---------- */
  var cv = $('canvas[data-sc-sequence]');
  if (cv && phone) cv.setAttribute('data-sc-sequence', cv.getAttribute('data-seq-mobile'));

  ScrollCraft.mount(document.body);

  /* the scene copy sits on a paper panel: a sibling, so it never hides with the text it protects */
  var copy = $('.scene__copy'), panel = $('.scene__panel');
  function fitPanel() {
    var pad = 20;
    panel.style.left = (copy.offsetLeft - pad) + 'px';
    panel.style.top = (copy.offsetTop - pad) + 'px';
    panel.style.width = (copy.offsetWidth + pad * 2) + 'px';
    panel.style.height = (copy.offsetHeight + pad * 2) + 'px';
  }
  fitPanel();
  addEventListener('resize', fitPanel);
  if (document.fonts) document.fonts.ready.then(fitPanel);

  /* ---------- chapter ticks follow the reader ---------- */
  var ticks = Array.prototype.slice.call(document.querySelectorAll('.gauge__ticks a'));
  var chapters = ticks.map(function (a) { return document.getElementById(a.getAttribute('data-ch')); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function () {
      // the chapter whose top most recently passed 45% of the viewport is current
      var line = innerHeight * 0.45, cur = -1;
      chapters.forEach(function (c, i) { if (c.getBoundingClientRect().top <= line) cur = i; });
      ticks.forEach(function (a, i) { a.classList.toggle('is-on', i === cur); a.toggleAttribute('aria-current', i === cur); });
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    chapters.forEach(function (c) { io.observe(c); });
  }

  /* ---------- the signature: calm burns hotter ---------- */
  var temp = document.getElementById('temp');
  var peak = document.getElementById('ch3');
  var SNAP_AT = 0.4;   // act progress at which the stick opens in the sequence (frame ~25 of 62)
  var lastY = scrollY, heat = 0, lastShown = '', snapped = false;

  function setSnapped(on) {
    if (on === snapped) return;
    snapped = on;
    root.classList.toggle('is-snapped', on);
    if (on && !reduce) {
      root.classList.remove('is-snapping'); void root.offsetWidth; root.classList.add('is-snapping');
    }
  }
  function show(h) {
    var t = (Math.round((1900 - 900 * h) / 10) * 10).toLocaleString('en-US');
    if (t !== lastShown) { temp.textContent = t; lastShown = t; }
  }

  if (reduce) {
    // No reaction to the hand: the gauge rests at 1,900°C and the snap state follows position.
    root.style.setProperty('--heat', '0');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { setSnapped(e.boundingClientRect.top < innerHeight * 0.2 || e.boundingClientRect.bottom < 0); });
      }, { threshold: [0, 0.5, 1] }).observe(peak);
    }
    return;
  }

  (function frame() {
    var y = scrollY, v = Math.abs(y - lastY);
    lastY = y;
    // px per frame -> 0..1; heat rises quickly with speed and cools slowly when the hand calms
    var target = Math.min(v / 60, 1);
    heat += (target - heat) * (target > heat ? 0.2 : 0.035);
    if (heat < 0.002) heat = 0;
    var p = parseFloat(peak.style.getPropertyValue('--sc-p')) || 0;
    var past = p >= SNAP_AT || peak.getBoundingClientRect().bottom < 0;
    setSnapped(past);
    var h = snapped ? 0 : heat;
    root.style.setProperty('--heat', h.toFixed(3));
    show(h);
    requestAnimationFrame(frame);
  })();
})();
