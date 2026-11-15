#!/bin/zsh
# setting.sh <label> <rise> <keep> <deltoid> <slim> : build, apply to the worktree and shoot a setting.
SP=/private/tmp/claude-501/-Users-yanlinzhu-Documents-unix-workspace/cb91ac51-ebd4-462b-b4be-1c0ef0c9dfb9/scratchpad/unit-remodel; WT=/Users/yanlinzhu/Documents/unix_workspace/boxer-simulator/.claude/worktrees/unit-remodel
$SP/tools/variant.sh $1 $2 $3 $4 $5 > $SP/body/data/$1.log 2>&1 || { tail -5 $SP/body/data/$1.log; exit 1; }
python3 $SP/tools/apply.py $1 $5 > /dev/null && $SP/tools/bodyshots.sh $1 http://127.0.0.1:8989 $WT
