#!/bin/zsh
# necks.sh <label> : close shots of the neck (front, side, back, three-quarter back) on the fat man, the ordinary man and the ordinary and fat women, composed to body/peek/necks-<label>.jpg
SP=/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel
cd $SP/tools; mkdir -p $SP/body/peek/cu
for who in male:fat:1.50 male:ordinary:1.50 female:ordinary:1.39 female:fat:1.39 male:thin:1.50 female:muscular:1.39; do
  sex=${who%%:*}; rest=${who#*:}; build=${rest%%:*}; h=${rest#*:}
  node closeup.mjs $SP/body/peek/cu/$1-$sex-$build $sex $build "0,1.0,0.0,$h;1.5708,1.0,0.0,$h;3.14159,1.0,0.0,$h;2.4,1.0,0.0,$h" ${2:-http://127.0.0.1:8989/index.html} 2>&1 | grep ERRS
done
python3 - $1 <<'PY'
import sys
from PIL import Image
S='/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel/body/peek'
label=sys.argv[1]; whos=['male-fat','male-ordinary','male-thin','female-ordinary','female-fat','female-muscular']
o=Image.new('RGB',(4*520,len(whos)*520))
for r,w in enumerate(whos):
    for c in range(4):
        im=Image.open(f'{S}/cu/{label}-{w}-{c+1}.png').convert('RGB'); W,H=im.size
        o.paste(im.crop((W//2-260,H//2-300,W//2+260,H//2+220)),(c*520,r*520))
o.save(f'{S}/necks-{label}.jpg',quality=90)
PY
