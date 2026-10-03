# Records a real vibe-slots turn. Needs a signed-in `claude` and vhs (brew install vhs).
# Run from the repo root: vhs docs/demo.tape
Output docs/demo.gif
Output docs/demo.mp4
Require claude
Set Shell zsh
Set FontSize 16
Set Width 1400
Set Height 900
Set Padding 16
Set TypingSpeed 35ms
Set PlaybackSpeed 1.5
Set Theme "Catppuccin Mocha"

Hide
Type "unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_CHILD_SESSION; clear" Enter
Type "claude --plugin-dir ." Enter
Sleep 4s
# Accept the folder trust prompt if it appears (default is "No, exit", so move
# to "Yes" first; harmless on an empty prompt otherwise).
Down
Enter
Sleep 2s
Show

Sleep 1s
Type "make a short plan for a million dollar app. no mistakes."
Sleep 500ms
Enter
# Reels spin while Claude works; the loot box bursts when the turn ends.
Sleep 28s

Hide
Ctrl+C
Ctrl+C
