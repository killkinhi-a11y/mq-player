// Voice-message recorder (MediaRecorder + 1s duration timer). Extracted from
// MessengerView in Stage III. Recording mechanics only — what to do with the
// recorded clip (send to DM / group) stays in the caller via onRecorded.
import { useCallback, useRef, useState } from "react";

export type OnVoiceRecorded = (base64Url: string, durationSec: number) => void | Promise<void>;

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingDurationRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Starts recording; resolves false when the microphone is unavailable. */
  const start = useCallback(async (onRecorded: OnVoiceRecorded): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        try {
          const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const base64Url = String(reader.result || "");
              const duration = recordingDurationRef.current;
              await onRecorded(base64Url, duration);
            } catch {}
          };
          reader.readAsDataURL(blob);
          stream.getTracks().forEach((t) => t.stop());
        } catch {}
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingDurationRef.current = 0;
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration(recordingDurationRef.current);
      }, 1000);
      return true;
    } catch {
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch {}
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  return { isRecording, recordingDuration, start, stop, cancel };
}
