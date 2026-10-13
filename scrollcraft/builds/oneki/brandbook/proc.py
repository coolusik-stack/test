from PIL import Image
import numpy as np, os
R='/home/user/test/scrollcraft/builds/oneki/brandbook/raw'; O='/home/user/test/scrollcraft/builds/oneki/brandbook/b/img'
def save(im,name,mx=2400,q=88):
    im=im.convert('RGB'); w,h=im.size; s=min(1,mx/max(w,h))
    if s<1: im=im.resize((round(w*s),round(h*s)),Image.LANCZOS)
    im.save(f'{O}/{name}.jpg',quality=q,optimize=True,progressive=True)
for k in range(1,38):
    n=f'i{k:02d}'
    if os.path.exists(f'{R}/{n}.png') and k!=36: save(Image.open(f'{R}/{n}.png'),n)
def gutters(a,axis,n):
    prof_std=a.std(axis=1-axis); prof_mean=a.mean(axis=1-axis)
    size=a.shape[axis]; cands=(prof_std<6)&((prof_mean>225)|(prof_mean<25))
    cuts=[]
    for j in range(1,n):
        c=round(size*j/n); w=round(size*0.04)
        idx=[i for i in range(c-w,c+w) if cands[i]]
        if idx: cuts.append((min(idx),max(idx)+1))
        else: cuts.append((c,c))
    return cuts
def split(src,g,cols,rows):
    im=Image.open(f'{R}/{src}.png').convert('RGB'); a=np.asarray(im.convert('L')).astype(float)
    cx=gutters(a,1,cols); cy=gutters(a,0,rows)
    xs=[0]+[x for c in cx for x in c]+[im.width]; ys=[0]+[y for c in cy for y in c]+[im.height]
    k=1
    for r in range(rows):
        for c in range(cols):
            x0,x1=xs[2*c],xs[2*c+1]; y0,y1=ys[2*r],ys[2*r+1]
            t=im.crop((x0,y0,x1,y1)); ta=np.asarray(t.convert('L')).astype(float)
            def trim(p):
                s=0
                while s<len(p)//10 and (p[s]<6): s+=1
                return s
            l=trim(ta.std(axis=0)); rr=trim(ta.std(axis=0)[::-1]); tp=trim(ta.std(axis=1)); b=trim(ta.std(axis=1)[::-1])
            t=t.crop((l+2,tp+2,t.width-rr-2,t.height-b-2))
            save(t,f'{g}_{k}',mx=1400); k+=1
    print(src,cx,cy)
split('i18','g18',4,3); split('i12','g12',2,2); split('i16','g16',2,2); split('i24','g24',3,3); split('i26','g26',3,3)
e=np.asarray(Image.open(f'{R}/i36.png').convert('RGB')).astype(float)
lum=e.max(axis=2); al=np.clip((lum-18)/(140-18),0,1)
ys,xs=np.where(al>0.05); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max(); pad=int(0.04*max(x1-x0,y1-y0))
cx,cy=(x0+x1)//2,(y0+y1)//2; hs=max(x1-x0,y1-y0)//2+pad
box=(cx-hs,cy-hs,cx+hs,cy+hs)
rgb=np.clip(e/np.maximum(al[...,None],1e-3),0,255)
gold=np.dstack([rgb,al*255]).astype(np.uint8)
Image.fromarray(gold,'RGBA').crop(box).resize((800,800),Image.LANCZOS).save(f'{O}/enso.png')
wh=np.dstack([np.full_like(al,255)]*3+[al*255]).astype(np.uint8)
Image.fromarray(wh,'RGBA').crop(box).resize((800,800),Image.LANCZOS).save(f'{O}/enso_white.png')
print('imgs',len(os.listdir(O)))
