#!/system/bin/sh
# Guest-side: write one blob file (whole file = one gesture phase) into ALL
# multitouch evdev devices. Root required (adb root).
# Usage: sendblob.sh <blob-file>
BLOB=$1
for DEV in /dev/input/event2 /dev/input/event3 /dev/input/event4 /dev/input/event5 /dev/input/event6 /dev/input/event7 /dev/input/event8 /dev/input/event9 /dev/input/event10 /dev/input/event11 /dev/input/event12; do
  cat "$BLOB" > "$DEV" 2>/dev/null
done
echo BLOBDONE
