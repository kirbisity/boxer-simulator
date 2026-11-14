#!/bin/zsh
# bodyshots.sh <label> <base url> <served tree> : the studio sheets of a setting, whole figures at three times the size.
SP=/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel
cd $SP/tools
node studio.mjs $2 "style=base&sex=male&name=body-$1-male&rows=front,side,back&cols=thin,average,bodybuilder,obese&mat=lambert&tone=light&pose=rest&scale=3" "style=base&sex=female&name=body-$1-female&rows=front,side,back&cols=thin,average,athletic,obese&mat=lambert&tone=light&pose=rest&scale=3" 2>&1 | grep -v "UNDICI\|trace-warn"
mkdir -p $SP/body/shots; mv $3/shots/body-$1-male.png $3/shots/body-$1-female.png $SP/body/shots/
