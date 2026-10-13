import re
P='/home/user/test/scrollcraft/builds/oneki/brandbook/b/parts/'
src=''.join(open(P+f'p{i}.html').read() for i in (1,2,3,4))
secs={}
for chunk in re.split(r'\n(?=<!-- \d+b? )',src):
    m=re.match(r'<!-- (\d+b?) ',chunk.strip())
    if m: secs[m.group(1)]=chunk.strip()
def body(k): return re.sub(r'^<!--.*?-->\n','',secs[k])

def divider(k, n, han, q, sub, dark=False, ink='var(--ink)'):
    s=body(k)
    c='#fff' if dark else ink
    tag=f''' <div style="left:117px;top:110px;font:800 13px var(--sans);letter-spacing:.22em;color:{'#fff' if dark else 'var(--blue)'}">CHAPTER 0{n} &nbsp;<span style="font-family:var(--krs)">{han[0]}</span>{han[1:]}</div>
 <div style="left:117px;top:992px;width:760px;color:{c}"><div style="font:800 30px/1.3 var(--kr);letter-spacing:-.02em">{q}</div><div style="margin-top:8px;font:500 17px/1.5 var(--krs);opacity:.8">{sub}</div></div>
</section>'''
    return s.replace('</section>',tag)

out=[]
add=lambda title,html: out.append(f'<!-- {len(out)+1:02d} {title} -->\n'+html)
add('COVER',body('01'))
add('DEDICATION',body('02'))
add('WHY WE MADE THIS',body('03'))
# ---- I. 起
add('CH1 DIVIDER: PAUSE',divider('08',1,'起 — Why','왜 시작했나','우리는 에너지를 빌려 쓰고 있었다.'))
orig=body('15').replace('<div class="rh r">We Are</div>','<div class="rh r">Origins</div>')
orig=orig.replace('We’re Originators','The Scene We Want to End')
orig=re.sub(r'(<div class="body" style="position:static;font-size:12.6px">).*?(</div>)',r'\1세 번째 커피, 빨라진 심장, 텅 빈 머리. 빌려온 기로 큰 순간을 겨우 버티고, 그 값은 오늘 밤과 내일 아침에 치른다. 우리 모두가 한 번쯤 이 자리에 있었다. ONEKI는 이 장면을 끝내기 위해 시작됐다.\2',orig,flags=re.S)
add('THE SCENE WE WANT TO END',orig)
add('ORIGINS 1',body('04'))
add('ORIGINS 2',body('05'))
snap=body('06')
a=snap.index(' <div class="rh l">'); b=snap.index(' <div class="fol l">10</div>')
left=''' <div class="rh l">Origins</div><div class="rh r">Origins</div>
 <div style="left:117px;top:250px;width:700px;font:600 84px/1.22 var(--krs);letter-spacing:-.04em;color:var(--ink)">누군가 방금,<br>자기 순간을<br>시작했다.</div>
 <div style="left:121px;top:640px;font:800 13px var(--sans);letter-spacing:.2em">THE SNAP</div>
 <div class="lead" style="left:117px;top:690px;width:330px;font-size:15px">톡. 스틱이 꺾이는 소리는 우리가 파는 가장 작은 제품이자, 가장 큰 약속이다. 이제 다시 간다는 신호.</div>
'''
snap=snap[:a]+left+' <div class="fol l">10</div>'+snap[b+len(' <div class="fol l">10</div>'):]
add('THE SNAP',snap)
# ---- II. 承
add('CH2 DIVIDER: BREATHE IN',divider('23',2,'承 — Belief','무엇을 믿나','가장 뜨거운 불꽃은 파랗다.'))
add('PURPOSE / MISSION',body('09'))
add('WE BURN BLUE',body('12b').replace('<div class="rh l white">We Are</div><div class="rh r">We Are</div>','<div class="rh l white">We Believe</div><div class="rh r">We Believe</div>'))
add('REFILL',body('14').replace('<div class="rh r">We Are</div>','<div class="rh r">We Believe</div>'))
haru='하루는 결정적 순간에 강한 사람이다. 30대 초반, 성수동의 프로덕트 디자이너. 아침엔 한강을 달리고, 큰 발표 직전의 1분을 위기가 아니라 워밍업이라 부른다. 차분하고, 날카롭고, 따뜻하다. 톡 — 그녀의 ‘예스’는 늘 조용하고, 늘 확실하다.'
dal='달은 밤을 설계하는 사람이다. 30대 중반, 을지로의 크리에이티브 디렉터. 에너지를 과시하지 않는 대신 오래 간다. 가장 차분한 얼굴로 가장 미친 아이디어를 꺼내는 ‘조용한 사고뭉치’. 그의 밤은 카페인 없이도 깨어 있다.'
muses=f'''<section class="sp">
 <div style="left:918px;top:0;width:918px;height:1170px;background:var(--dark)"></div>
 <div class="rh l">Our Muses</div><div class="rh r white">Our Muses</div>
 <img class="pic" src="img/i23.jpg" style="left:60px;top:118px;width:470px;height:930px;object-position:50% 30%">
 <div style="left:575px;top:250px;font:400 34px/1 var(--serif)">Get to Know</div>
 <div class="h1" style="left:575px;top:296px;font-size:104px">Haru</div>
 <div style="left:579px;top:410px;font:800 11px var(--sans);letter-spacing:.2em;color:var(--gold)">THE DAY MUSE</div>
 <div class="body" style="left:575px;top:450px;width:290px;font-size:13.4px">{haru}</div>
 <img class="pic" src="img/i25.jpg" style="left:978px;top:118px;width:470px;height:930px;object-position:50% 40%">
 <div style="left:1493px;top:250px;font:400 34px/1 var(--serif);color:#fff">Get to Know</div>
 <div class="h1 white" style="left:1493px;top:296px;font-size:104px">Dal</div>
 <div style="left:1497px;top:410px;font:800 11px var(--sans);letter-spacing:.2em;color:var(--blue2)">THE NIGHT MUSE</div>
 <div class="body white" style="left:1493px;top:450px;width:290px;font-size:13.4px">{dal}</div>
 <div class="note" style="left:575px;top:1000px;width:300px">뮤즈는 실존 인물이 아니다. 우리가 누구를 위해 만드는지 잊지 않게 하는 나침반이다.</div>
</section>'''
add('OUR MUSES',muses)
add('MANIFESTO',body('07'))
# ---- III. 轉
add('CH3 DIVIDER: BREATHE OUT',divider('30',3,'轉 — The Turn','누구의 순간인가','차분함은 목적이 아니다. 끝까지 미치기 위한 준비다.',dark=True))
add("HERE'S HOW",body('10'))
add('GO CRAZY',body('22').replace('<div class="rh l white">We Are</div>','<div class="rh l white">The Moment</div>'))
add('DECLARE',body('11').replace('Vision and Goals','The Moment'))
# ---- IV. 結
add('CH4 DIVIDER: SNAP',divider('38',4,'結 — What We Build','무엇을 만드나','이제, 톡.'))
T=[('01','Real','i29','70% 50%','과하게 보정된 매끈함 대신, 진짜 순간.'),
   ('02','Calm','i30','30% 50%','소리 지르지 않는다. 보는 사람이 숨을 고르게 한다.'),
   ('03','Relevant','i31','35% 50%','누구에게, 언제. 시험 전날과 경기 직전은 다른 이야기다.'),
   ('04','Considered','i32','73% 50%','꺾이는 각도, 소리의 크기, 손끝에 남는 감촉까지.'),
   ('05','Surprising',None,'','예상하지 못한 곳에서 건네는 작은 웃음 하나.'),
   ('06','Experiential','i33','70% 50%','소리가 먼저, 향이 다음, 맛은 마지막에.')]
tiles=''
for k,(n,t,img,pos,d) in enumerate(T):
    x=95+k*(254+20)
    if img: tiles+=f'\n <img class="pic" src="img/{img}.jpg" style="left:{x}px;top:600px;width:254px;height:300px;object-position:{pos}">'
    else: tiles+=f'\n <div style="left:{x}px;top:600px;width:254px;height:300px;background:var(--pink);color:#fff;font:800 50px/.95 var(--sans);letter-spacing:-.03em;padding:26px 22px">DON’T<br>NAP.<br>SNAP!</div>'
    tiles+=f'\n <div style="left:{x}px;top:918px;font:800 11px var(--sans);letter-spacing:.2em;color:var(--blue)">{n}</div><div style="left:{x}px;top:938px;font:600 30px/1 var(--serif);letter-spacing:-.02em">{t}</div><div style="left:{x}px;top:980px;width:240px;font:500 12.8px/1.6 var(--kr)">{d}</div>'
create=f'''<section class="sp">
 <div class="rh l">We Build</div><div class="rh r">We Build</div>
 <div class="h1" style="left:112px;top:130px;font-size:112px">How We<br>Create</div>
 <div class="lead" style="left:117px;top:382px;width:380px;font-size:15px">우리가 만드는 모든 것 — 15초 영상 한 편, 봉투 뒷면의 한 문장, 편의점 선반의 한 칸 — 은 하나의 질문에 답한다. ‘이것은 기를 채우는가, 빼앗는가?’ 여섯 개의 필터로 튕겨 보고, 통과한 것만 내보낸다.</div>
 <img class="pic" src="img/i28.jpg" style="left:1006px;top:118px;width:735px;height:430px">{tiles}
</section>'''
add('HOW WE CREATE',create)
add('VISION',body('39'))
add('POSTERS',body('40'))
add('CLOSING',body('42'))
open('/home/user/test/scrollcraft/builds/oneki/brandbook/v4/p1.html','w').write('\n'+'\n\n'.join(out)+'\n')
p5=open(P+'p5.html').read()
a=p5.index('/* 21 — friends scatter */'); b=p5.index('/* 40 — posters */')
p5=p5[:a]+p5[b:]
p5=p5.replace("document.querySelectorAll('.sp').forEach((s,i)=>{s.dataset.n=i+1});","document.querySelectorAll('.sp').forEach((s,i)=>{s.dataset.n=i+1;s.querySelectorAll('.fol.l').forEach(f=>f.textContent=2*i);s.querySelectorAll('.fol.r').forEach(f=>f.textContent=2*i+1);});")
p5=p5.replace('<div class="rh l">We Are</div><div class="rh r">We Are</div><div style="left:1030px;top:800px','<div class="rh l">The Moment</div><div class="rh r">The Moment</div><div style="left:1030px;top:800px')
p5=p5.replace('<!-- 43 BACK COVER -->',f'<!-- {len(out)+1:02d} BACK COVER -->')
open('/home/user/test/scrollcraft/builds/oneki/brandbook/v4/p5.html','w').write(p5)
print('spreads',len(out)+1)
