#!/bin/zsh
# variant.sh <label> <rise> <keep> <deltoid> <slim> : the builds at these dials, packed; the data file kept as body/data/<label>.js
set -e
SP=/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel; WT=/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel; F=$WT/tools/blender/family
cd $SP/family/remodel
python3 $SP/tools/shape.py $F shaped $2 $3 $4 $5
python3 $F/swell.py > $SP/body/data/$1.swell.txt
python3 $F/composition.py shaped > $SP/body/data/$1.composition.txt
python3 $F/dump.py family-$1.json shaped
node $WT/tools/basebody-family.js family-$1.json | tail -2
cp $WT/src/basebody-data.js $SP/body/data/$1.js
rm -rf shaped-$1; cp -R shaped shaped-$1
tail -3 $SP/body/data/$1.swell.txt; cat $SP/body/data/$1.composition.txt | tail -16
