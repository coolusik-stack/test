# Spread 13 muse-day spots: crop to content, then
#  day  (white page) -> near-white levelled to pure white, JPEG
#  night (dark page) -> colour-to-alpha against white, black ink recoloured cream, PNG
from PIL import Image
import numpy as np
R='/home/user/test/scrollcraft/builds/oneki/brandbook/raw'; O='/home/user/test/scrollcraft/builds/oneki/brandbook/b/img'
DAY=['m_run','m_desk','m_minute','m_tok','s_squeeze','s_enter','s_box']; NIGHT=['m_alley','m_lamp','m_board','m_moon']
CREAM=np.array([237,232,223.])
def load(k):
    a=np.asarray(Image.open(f'{R}/{k}.png').convert('RGB')).astype(float)
    m=(a.min(2)<215); ys,xs=np.where(m); p=40
    y0,y1=max(ys.min()-p,0),min(ys.max()+p,a.shape[0]); x0,x1=max(xs.min()-p,0),min(xs.max()+p,a.shape[1])
    a=a[y0:y1,x0:x1]; a[a.min(2)>238]=255
    return a
for k in DAY:
    a=load(k); im=Image.fromarray(a.astype('uint8')); im.thumbnail((700,700),Image.LANCZOS)
    im.save(f'{O}/{k}.jpg',quality=90)
for k in NIGHT:
    a=load(k); al=((255-a)/255).max(2,keepdims=True); al=np.clip(al,0,1)
    fg=np.where(al>0,255-(255-a)/np.maximum(al,1e-3),255)
    dark=fg.max(2)<110; fg[dark]=CREAM
    sat=(fg.max(2)-fg.min(2))>60; al[sat]=np.clip(al[sat]*1.7,0,1)  # colour fills stay solid on the dark page
    rgba=np.dstack([np.clip(fg,0,255),al[...,0]*255]).astype('uint8')
    im=Image.fromarray(rgba,'RGBA'); im.thumbnail((700,700),Image.LANCZOS); im.save(f'{O}/{k}.png',optimize=True)
print('muse ok')
# v4.6 The Stick hero plate (photo, full left page)
h=Image.open(f'{R}/s_hero.png').convert('RGB'); h.thumbnail((2400,2400),Image.LANCZOS); h.save(f'{O}/s_hero.jpg',quality=88,optimize=True,progressive=True)
print('stick ok')
