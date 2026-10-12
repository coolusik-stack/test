/* ONEKI one-pager: content data (from Brand Book v4.1) + scroll choreography. */
(function () {
  'use strict';

  var CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3EF7RM3YH2M24lHzmiXGHKRiX4A/';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- content built from brand book data ---------- */

  // 05 callouts: [target x, target y, label x, label y, text] in 1836x1170 spread space
  var CALLOUTS = [
    [980, 148, 1250, 96, 'Wired, not ready'],
    [843, 389, 560, 300, 'Borrowed energy'],
    [1134, 351, 1340, 286, 'Cup no. 3'],
    [968, 555, 560, 560, 'Loosened, not relaxed'],
    [1152, 944, 1400, 896, 'The crash'],
    [1074, 1092, 720, 1044, 'The debt, paid tonight']
  ];
  var svgNS = 'http://www.w3.org/2000/svg';
  var lines = $('.scene__lines'), tags = $('.scene__tags');
  CALLOUTS.forEach(function (c) {
    var w = c[4].length * 10.2 + 34, cx = c[2] < c[0] ? c[2] + w : c[2], cy = c[3] + 19;
    var g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'callout');
    g.innerHTML =
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + c[0] + '" y2="' + c[1] + '" stroke="#1C1B1D" stroke-width="4" opacity=".35"/>' +
      '<line class="callout__ln" x1="' + cx + '" y1="' + cy + '" x2="' + c[0] + '" y2="' + c[1] + '" stroke="#fff" stroke-width="1.8"/>' +
      '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="7" fill="#B39A5C" stroke="#fff" stroke-width="2"/>';
    lines.appendChild(g);
    var li = document.createElement('li');
    li.textContent = c[4];
    li.style.left = (c[2] / 1836 * 100) + '%';
    li.style.top = (c[3] / 1170 * 100) + '%';
    tags.appendChild(li);
  });

  // 16 twelve rituals
  var A = ['050404_40a4de46-4a73-46ff-a560-7e8577d26e38', '050406_943c179c-b9a2-4ebd-8b25-377111f1cdf6', '050407_3f7efe20-214a-42bd-ab1a-b080fa181751', '050407_dc54921d-4919-4c42-bf93-62ddf0e32a38', '050412_3310eb14-055d-4545-b3df-4fe91f1f588b', '050412_c5042050-3e13-4cee-ab35-3c932d5822e8', '050412_be3f45ea-9298-4c7e-b00a-d6d2dbef0e98', '050417_0644f8f5-c5f3-424b-ae89-e2fbfa20eec8', '050417_ebda52b3-ec48-4b77-80c4-e1dc34efccf6', '050426_833c7bff-b09f-4f9c-a5af-d172cf7315ef', '050420_d57e903a-5166-4fa3-abd5-e4af4e1e0db7', '050420_b6877d40-a643-4889-9121-aad42d470244'];
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
    li.innerHTML = '<figure class="ritual"><div class="ritual__img"><img src="' + CDN + 'hf_20260928_' + A[i] + '.png" alt="" loading="lazy" decoding="async"></div>' +
      '<q>“' + q[0] + '”</q><figcaption>' + q[1] + '</figcaption></figure>';
    grid.appendChild(li);
  });

  // 22 BHAG posters, frames in 1836x1170 spread space
  var P = [
    { bg: '#2743B0', fg: '#fff', t: 'Own the<br>moment<br>before', c: '중요한 순간 직전이면 누구나 ONEKI를 떠올린다. 떨릴 때도, 기 빠질 때도. ‘기 트자’가 일상어가 된다.' },
    { bg: '#B39A5C', fg: '#1C1B1D', t: 'Blue<br>is a<br>category', c: '‘블루 에너지’가 진열대의 한 칸이 된다. 레드 옆에, 레드만큼. 그리고 우리가 그 이름의 첫 줄에 선다.', big: true },
    { bg: '#231F20', fg: '#B39A5C', t: 'One stick,<br>every<br>pocket', c: '주머니마다 한 포. 매년 1억 번의 톡.' },
    { bg: '#F4ACA4', fg: '#1C1B1D', t: 'Quiet<br>East,<br>loud<br>world', c: '서울에서 시작한 조용한 에너지가 도쿄, 싱가포르, LA의 무대 뒤를 바꾼다.' }
  ];
  var FR = [[215, 128, 281, 380], [591, 128, 281, 380], [964, 128, 281, 380], [1338, 128, 283, 380]];
  var plist = $('.posters__list');
  P.forEach(function (p, i) {
    var f = FR[i], li = document.createElement('li');
    li.className = 'poster';
    li.style.cssText = 'left:' + (f[0] / 1836 * 100) + '%;top:' + (f[1] / 1170 * 100) + '%;width:' + (f[2] / 1836 * 100) + '%;height:' + (f[3] / 1170 * 100) + '%;--bg:' + p.bg + ';--fg:' + p.fg;
    li.innerHTML = '<div class="poster__art">' +
      (p.fg === '#fff' || p.bg === '#231F20' ? '<span class="enso poster__mark" aria-hidden="true"></span>' : '') +
      '<div class="poster__t"' + (p.big ? ' style="font-size:3.05cqw"' : '') + '>' + p.t + '</div>' +
      '<div class="poster__s">2036 · BHAG 0' + (i + 1) + '</div></div>' +
      '<p class="poster__cap"><b>BHAG 0' + (i + 1) + '</b>' + p.c + '</p>';
    plist.appendChild(li);
  });

  // split [data-words] into word spans for scrubbed reading
  $$('[data-words]').forEach(function (el) {
    var walk = function (node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            var s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.appendChild(s);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
  });

  /* ---------- motion ---------- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.gsap || !window.ScrollTrigger) return;

  document.documentElement.classList.add('js-motion');
  var SECTIONS = $$('main > section, footer'); // page order, captured before pinning wraps sections
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  ST.config({ ignoreMobileResize: true });

  // heavy brand images fade in once decoded instead of popping in line by line
  $$('main img, footer img').forEach(function (img) {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('is-loading');
    img.addEventListener('load', function () { img.classList.remove('is-loading'); }, { once: true });
  });

  // smooth scroll, driven by GSAP's ticker so ScrollTrigger stays in sync
  if (window.Lenis) {
    var lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    lenis.on('scroll', ST.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        var t = id === '#top' ? 0 : $(id);
        if (t === null) return;
        e.preventDefault();
        // land where a pinned chapter word has settled, not at the start of its pin
        var pin = t && ST.getAll().find(function (st) { return st.pin === t; });
        lenis.scrollTo(pin ? pin.start + (pin.end - pin.start) * 0.7 : t, { duration: 1.4 });
      });
    });
  }

  // reading progress
  gsap.to('.progress span', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });
  // generic reveal
  ST.batch('[data-reveal]', {
    start: 'top 86%', once: true,
    onEnter: function (els) { gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.1 }); }
  });

  var mm = gsap.matchMedia();

  // 01 cover: the book opens
  var cover = gsap.timeline({ defaults: { ease: 'expo.out' } });
  cover.from('.cover__dots', { opacity: 0, duration: 1.6, stagger: 0.15 })
    .from('.cover__word', { opacity: 0, y: 24, duration: 1, stagger: 0.12 }, 0.2)
    .from('.cover__title .ln', { yPercent: 110, opacity: 0, duration: 1.3, stagger: 0.12 }, 0.35)
    .from('.enso--cover', { scale: 0.4, rotate: -140, opacity: 0, duration: 1.8 }, 0.5)
    .from('.nav', { y: -30, opacity: 0, duration: 1 }, 0.7);
  gsap.to('.cover__title', { yPercent: -40, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.cover', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.enso--cover', { rotate: 220, ease: 'none', scrollTrigger: { trigger: '.cover', start: 'top top', end: 'bottom top', scrub: true } });

  // 02 dedication + 23 closing: read word by word
  $$('[data-words]').forEach(function (el) {
    gsap.to(el.querySelectorAll('.w'), {
      opacity: 1, stagger: 0.08, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true }
    });
  });

  // 03 why: gold dust settles
  gsap.fromTo('.why__media img', { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.why', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.why__title .ln', { xPercent: 30, opacity: 0, stagger: 0.1, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.why', start: 'top 60%' } });

  // chapter dividers: the word is a window; Pause holds, Breathe in expands, Breathe out releases, Snap clicks
  $$('.chapter').forEach(function (ch) {
    var word = $('.chapter__word', ch);
    var tl = gsap.timeline({ scrollTrigger: { trigger: ch, start: 'top top', end: '+=120%', pin: true, scrub: 0.6 } });
    var id = ch.id;
    if (id === 'ch2') {
      tl.fromTo(word, { scale: 0.86, letterSpacing: '-0.06em' }, { scale: 1.04, letterSpacing: '-0.01em', ease: 'sine.inOut' });
    } else if (id === 'ch3') {
      tl.fromTo(word, { scale: 1.1, opacity: 1 }, { scale: 0.92, opacity: 0.85, ease: 'sine.inOut' });
    } else if (id === 'ch4') {
      tl.fromTo(word, { scale: 2.4 }, { scale: 1, ease: 'power3.out' });
    } else {
      tl.fromTo(word, { scale: 1.8 }, { scale: 1, ease: 'power2.out' });
    }
    tl.fromTo(word, { backgroundPosition: '50% 20%' }, { backgroundPosition: '50% 80%', ease: 'none' }, 0);
    tl.from([$('.chapter__label', ch), $('.chapter__q', ch)], { opacity: 0, y: 30, stagger: 0.1, duration: 0.3 }, 0.55);
  });

  mm.add('(min-width: 1024px)', function () {
    // 05 scene: the signals appear one by one, pinned
    var scene = gsap.timeline({ scrollTrigger: { trigger: '.scene', start: 'top top', end: '+=140%', pin: true, scrub: 0.5 } });
    scene.from('.scene__img', { scale: 1.08, ease: 'none', duration: 1 }, 0);
    $$('.scene__lines .callout').forEach(function (g, i) {
      var ln = $('.callout__ln', g), len = Math.hypot(ln.x2.baseVal.value - ln.x1.baseVal.value, ln.y2.baseVal.value - ln.y1.baseVal.value);
      gsap.set(g.querySelectorAll('line'), { strokeDasharray: len, strokeDashoffset: len });
      scene.to(g.querySelectorAll('line'), { strokeDashoffset: 0, duration: 0.25 }, 0.1 + i * 0.13)
        .from(g.querySelector('circle'), { scale: 0, transformOrigin: '50% 50%', duration: 0.12 }, 0.1 + i * 0.13)
        .from(tags.children[i], { opacity: 0, y: 16, scale: 0.9, duration: 0.2 }, 0.18 + i * 0.13);
    });
    scene.from('.scene__copy', { opacity: 0, y: 30, duration: 0.25 }, 0.9);

    // 06-07 origins: a horizontal walk through the interview
    var track = $('.origins__track');
    var dist = function () { return track.scrollWidth - window.innerWidth; };
    gsap.to(track, { x: function () { return -dist(); }, ease: 'none', scrollTrigger: { trigger: '.origins', start: 'top top', end: function () { return '+=' + dist(); }, pin: true, scrub: 1, invalidateOnRefresh: true,
      onUpdate: function (self) { gsap.set('.origins__bar span', { scaleX: self.progress }); } } });

    // 08 snap: the line lands, then the story
    var snap = gsap.timeline({ scrollTrigger: { trigger: '.snap', start: 'top top', end: '+=90%', pin: true, scrub: 0.6 } });
    snap.from('.snap__quote .ln', { yPercent: 60, opacity: 0, stagger: 0.25, duration: 0.5 })
      .fromTo('.snap__ring', { scale: 0.2, opacity: 0.9 }, { scale: 3.2, opacity: 0, stagger: 0.12, duration: 0.6, ease: 'power2.out' }) // the 톡
      .from(['.snap__cap', '.snap__lead'], { opacity: 0, y: 20, stagger: 0.1, duration: 0.3 })
      .from('.snap__steps li', { opacity: 0, x: -20, stagger: 0.12, duration: 0.25 }, '<')
      .from('.snap__img', { scale: 0.7, rotate: -8, opacity: 0, transformOrigin: '80% 90%', duration: 0.5, ease: 'back.out(1.6)' }, '<');

    // 13 muses: day gives way to night
    gsap.from('.muse--day .muse__img', { clipPath: 'inset(100% 0 0 0)', ease: 'none', scrollTrigger: { trigger: '.muses', start: 'top 80%', end: 'top 20%', scrub: true } });
    gsap.from('.muse--night .muse__img', { clipPath: 'inset(0 0 100% 0)', ease: 'none', scrollTrigger: { trigger: '.muses', start: 'top 55%', end: 'top -5%', scrub: true } });

    // 14 manifesto: lines arrive one at a time while the blue panel holds
    var mani = gsap.timeline({ scrollTrigger: { trigger: '.manifesto', start: 'top top', end: '+=160%', pin: true, scrub: 0.6 } });
    $$('.mani .m').forEach(function (m, i) {
      var fromLeft = parseFloat(getComputedStyle(m).left) < $('.mani').clientWidth / 2;
      mani.from(m, { opacity: 0, x: fromLeft ? -60 : 60, y: 10, duration: 0.3, ease: 'power3.out' }, i * 0.12);
    });

    // 18 declare: walk down the tunnel
    gsap.fromTo('.declare__media img', { scale: 1 }, { scale: 1.35, ease: 'none', scrollTrigger: { trigger: '.declare', start: 'top top', end: '+=100%', pin: true, scrub: true } });
    gsap.from('.declare__copy > *', { opacity: 0, y: 40, stagger: 0.15, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.declare', start: 'top 40%' } });

    // 22 posters: hung on the wall one by one
    gsap.from('.poster', { y: -40, rotate: function (i) { return [-4, 3, -2, 4][i]; }, opacity: 0, stagger: 0.15, duration: 1.1, ease: 'back.out(1.4)', scrollTrigger: { trigger: '.posters', start: 'top 55%' } });
  });

  mm.add('(max-width: 1023px)', function () {
    gsap.from('.scene__tags li', { opacity: 0, y: 12, stagger: 0.08, duration: 0.6, scrollTrigger: { trigger: '.scene__tags', start: 'top 85%' } });
    gsap.from('.mani .m', { opacity: 0, y: 24, stagger: 0.08, duration: 0.7, ease: 'expo.out', scrollTrigger: { trigger: '.mani', start: 'top 75%' } });
    gsap.from('.poster', { opacity: 0, y: 30, stagger: 0.12, duration: 0.8, scrollTrigger: { trigger: '.posters', start: 'top 70%' } });
  });

  // 10 purpose + 21 vision: key words light up gold as you read
  $$('[data-sweep]').forEach(function (el) {
    gsap.to(el.querySelectorAll('.g'), { color: '#B39A5C', stagger: 0.3, ease: 'none', scrollTrigger: { trigger: el, start: 'top 75%', end: 'bottom 50%', scrub: true } });
  });

  // 11 burn blue: temperatures, then the map draws itself
  $$('[data-count]').forEach(function (b) {
    var o = { v: 0 }, end = +b.dataset.count;
    gsap.to(o, { v: end, duration: 2, ease: 'power2.out', scrollTrigger: { trigger: '.burn', start: 'top 60%' }, onUpdate: function () { b.textContent = Math.round(o.v).toLocaleString('en-US'); } });
  });
  gsap.from('.burn__flame img', { scale: 1.15, filter: 'brightness(.4)', ease: 'none', scrollTrigger: { trigger: '.burn', start: 'top bottom', end: 'top top', scrub: true } });
  var map = gsap.timeline({ scrollTrigger: { trigger: '.map', start: 'top 75%' }, defaults: { ease: 'expo.out' } });
  map.from('.map__axes line', { scale: 0, transformOrigin: '50% 50%', duration: 1, stagger: 0.1 })
    .from('.map__axes path, .map__labels text', { opacity: 0, duration: 0.6 }, 0.4)
    .from('.map__dots g', { opacity: 0, y: 8, stagger: 0.08, duration: 0.6 }, 0.6)
    .from('.map__q', { scaleX: 0, scaleY: 0, duration: 1.2, ease: 'power4.inOut' }, 1)
    .from('.map__oneki circle', { scale: 0, stagger: 0.08, duration: 1, ease: 'back.out(1.8)' }, 1.6)
    .from('.map__oneki text', { opacity: 0, x: 10, stagger: 0.08, duration: 0.6 }, 1.8)
    .from('.rb__row', { opacity: 0, y: 14, stagger: 0.08, duration: 0.7 }, 1.4);
  gsap.to('.map__oneki .h1', { scale: 1.18, opacity: 0.02, repeat: -1, yoyo: true, duration: 2.4, ease: 'sine.inOut', delay: 3 });

  // 12 refill: collage drifts at different depths
  $$('.refill [data-speed]').forEach(function (t) {
    var s = parseFloat(t.dataset.speed);
    gsap.fromTo(t, { y: function () { return -s * 400; } }, { y: function () { return s * 400; }, ease: 'none', scrollTrigger: { trigger: '.refill', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
  });
  gsap.from('.refill__h > span', { yPercent: 40, opacity: 0, stagger: 0.12, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.refill__h', start: 'top 80%' } });

  // 16 rituals: twelve circles, twelve small rebellions
  gsap.from('.ritual', { opacity: 0, y: 40, scale: 0.92, stagger: { each: 0.07, grid: 'auto', from: 'start' }, duration: 0.9, ease: 'expo.out', scrollTrigger: { trigger: '.rituals__grid', start: 'top 75%' } });
  gsap.from('.rituals__end > *', { opacity: 0, y: 30, stagger: 0.12, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.rituals__end', start: 'top 85%' } });

  // 17 go crazy: the jump
  gsap.fromTo('.crazy__media img', { scale: 1.2, yPercent: 6 }, { scale: 1, yPercent: -4, ease: 'none', scrollTrigger: { trigger: '.crazy', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.crazy__h', { yPercent: 80, opacity: 0, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: '.crazy', start: 'top 35%' } });
  gsap.from('.crazy__lead', { opacity: 0, x: 40, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.crazy', start: 'top 25%' } });

  // 20 how we create: the banner slides under, six filters arrive in order
  gsap.fromTo('.create__banner img', { yPercent: -8 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.create', start: 'top bottom', end: 'center top', scrub: true } });
  gsap.from('.filter', { opacity: 0, y: 50, stagger: 0.1, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: '.filters', start: 'top 80%' } });

  // 24 back cover
  gsap.from('.enso--back', { rotate: -180, scale: 0.5, opacity: 0, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.back', start: 'top 60%' } });
  gsap.from('.back__line', { opacity: 0, y: 30, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.back', start: 'top 50%' } });

  // chapter highlight, created after every pin so its positions include pin spacing
  var navLinks = $$('.nav__links a');
  ['ch1', 'ch2', 'ch3', 'ch4'].forEach(function (id, i) {
    var next = ['ch2', 'ch3', 'ch4'][i];
    ST.create({
      trigger: '#' + id, start: 'top 55%',
      endTrigger: next ? '#' + next : '.back', end: 'top 55%',
      refreshPriority: -2, // its end depends on later sections, so measure it last
      onToggle: function (self) { navLinks[i].classList.toggle('is-on', self.isActive); }
    });
  });

  // pins were created out of page order (chapters before the desktop-only pins above them);
  // refresh in document order so every start/end includes the pin spacing above it
  var order = function (t) {
    var el = t.trigger;
    if (!el || el === document.body) return Infinity;
    return SECTIONS.findIndex(function (s) { return s === el || s.contains(el) || (el.contains && el.contains(s)); });
  };
  ST.getAll().forEach(function (t) { if (t.vars.refreshPriority) return; var o = order(t); t.vars.refreshPriority = o === Infinity ? -1 : 100 - o; });
  ST.sort();
  ST.refresh();

  // re-measure once images have sized the layout
  window.addEventListener('load', function () { ST.refresh(); });
})();
