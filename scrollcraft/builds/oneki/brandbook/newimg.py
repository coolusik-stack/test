from PIL import Image
import os
R='/home/user/test/scrollcraft/builds/oneki/brandbook/raw'; O='/home/user/test/scrollcraft/builds/oneki/brandbook/b/img'
for k in range(1,13):
    p=f'{R}/a{k:02d}.png'
    if os.path.exists(p): Image.open(p).convert('RGB').resize((900,900),Image.LANCZOS).save(f'{O}/c{k:02d}.jpg',quality=90,optimize=True)
for w,n in (('w38','i38'),('w32','i32')):
    p=f'{R}/{w}.png'
    if os.path.exists(p):
        im=Image.open(p).convert('RGB'); W,H=im.size; s=min(1,2400/max(W,H))
        if s<1: im=im.resize((round(W*s),round(H*s)),Image.LANCZOS)
        im.save(f'{O}/{n}.jpg',quality=88,optimize=True,progressive=True)
print('newimg ok',sorted(x for x in os.listdir(O) if x[0] in 'ci' and len(x)<9))
