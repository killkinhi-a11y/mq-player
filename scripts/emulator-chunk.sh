#!/bin/bash
# Emulator boot chunk with in-call polling + APK install on boot.
# Usage: bash /home/z/my-project/scripts/emulator-chunk.sh [max_seconds]
MAX=${1:-540}
export SDK=/tmp/my-project/.android-sdk
export ANDROID_HOME=$SDK
export ANDROID_SDK_ROOT=$SDK
ADB=$SDK/platform-tools/adb
APK=/home/z/my-project/android/app/build/outputs/apk/release/app-release.apk
LOG=/home/z/my-project/scripts/emulator-live.log

rm -f $LOG
timeout -s TERM $MAX $SDK/emulator/emulator -avd mq35x -no-accel -no-window \
  -no-boot-anim -gpu swiftshader_indirect -memory 2560 -cores 2 \
  -data /home/z/.android/avd/mq35x.avd/userdata.img -no-metrics \
  > /home/z/my-project/scripts/emulator-boot-x86.log 2>&1 &
EMUPID=$!

BOOTED=0
for i in $(seq 1 $((MAX / 15))); do
  sleep 15
  STATE=$($ADB get-state 2>/dev/null)
  BOOT=$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
  echo "poll $i: state=$STATE boot=$BOOT" >> $LOG
  if [ "$BOOT" = "1" ]; then
    BOOTED=1
    echo "=== BOOT COMPLETED at poll $i ===" >> $LOG
    break
  fi
done

if [ $BOOTED -eq 1 ]; then
  echo "=== INSTALLING RELEASE APK ===" >> $LOG
  $ADB install -r $APK >> $LOG 2>&1
  echo "=== APK INSTALLED, capturing logcat ===" >> $LOG
  $ADB logcat -c
  echo "=== LAUNCHING APP ===" >> $LOG
  $ADB shell am start -n com.mq1.player/.MainActivity >> $LOG 2>&1
  sleep 45
  echo "=== LOGCAT (app crash + boot tags) ===" >> $LOG
  $ADB logcat -d -s MqCrash:E MqBoot:* MqApp:* MqMainActivity:* AndroidRuntime:E DEBUG:* >> $LOG 2>&1
  echo "=== FULL PROCESS STATE ===" >> $LOG
  $ADB shell ps -A 2>/dev/null | grep -E "com.mq1|system" >> $LOG 2>&1
fi

# graceful shutdown → snapshot save
kill -TERM $EMUPID 2>/dev/null
wait $EMUPID 2>/dev/null
echo "chunk done, booted=$BOOTED"
cat $LOG | tail -20
