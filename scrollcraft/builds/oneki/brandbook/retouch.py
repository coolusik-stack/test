# v4.4 retouch, run after proc.py: the kettlebell on spread 22 (i35) was red, a forbidden colour.
# Shift its reds to cobalt, keeping the shading. Reads raw/i35.png each run, so it is safe to repeat.
from PIL import Image
import numpy as np
P='/home/user/test/scrollcraft/builds/oneki/brandbook/b/img/i35.jpg'
src=Image.open('/home/user/test/scrollcraft/builds/oneki/brandbook/raw/i35.png').convert('RGB')   # start from the original every run
W0,H0=src.size; k=min(1,2400/max(W0,H0))
im=src.resize((round(W0*k),round(H0*k)),Image.LANCZOS) if k<1 else src; W,H=im.size
hsv=np.asarray(im.convert('HSV')).copy()
x0,x1,y0,y1=int(W*.025),int(W*.095),int(H*.62),int(H*.73)     # kettlebell box, bottom-left
reg=hsv[y0:y1,x0:x1].astype(int); h,s=reg[...,0],reg[...,1]
v=reg[...,2]; yy=np.arange(reg.shape[0])[:,None]+y0
m=((h<18)|(h>238))&(np.where(yy<int(H*.70),s>18,s>45))   # paler paint chips on the bell itself too
m&=~((yy>int(H*.705))&(s<120))                     # keep the faint warm shadow on the wooden box top
reg[...,0][m]=162                                   # cobalt hue (#2743B0 ~ 229 deg)
reg[...,1][m]=np.clip(reg[...,1][m]*0.95,0,255)
hsv[y0:y1,x0:x1]=reg.astype('uint8')
Image.fromarray(hsv,'HSV').convert('RGB').save(P,quality=88,optimize=True,progressive=True)
print('retouch ok', int(m.sum()), 'px')

# v4.5: spread 03 (Why We Made This) uses the ink ensō plate w01 instead of the glitter i01.
w=Image.open('/home/user/test/scrollcraft/builds/oneki/brandbook/raw/w01.png').convert('RGB'); W0,H0=w.size; k=min(1,2400/max(W0,H0))
if k<1: w=w.resize((round(W0*k),round(H0*k)),Image.LANCZOS)
w.save('/home/user/test/scrollcraft/builds/oneki/brandbook/b/img/w01.jpg',quality=88,optimize=True,progressive=True)
print('w01 ok')
