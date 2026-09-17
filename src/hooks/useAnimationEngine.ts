import { useEffect, useRef } from 'react';

interface AnimationEngineProps {
  isPlaying: boolean;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  duration: number;
  playbackSpeed: number;
  /** When true (default) playback loops back to 0 at the end; otherwise it stops. */
  loop?: boolean;
  onEnd?: () => void;
}

/**
 * requestAnimationFrame-driven playback clock.
 * The RAF loop is registered once per play session (not once per frame) and reads the
 * latest time/duration/speed from refs, so playback stays smooth and never jumps on the
 * first frame.
 */
export const useAnimationEngine = ({
  isPlaying,
  currentTime,
  setCurrentTime,
  duration,
  playbackSpeed,
  loop = true,
  onEnd
}: AnimationEngineProps) => {
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const timeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const speedRef = useRef(playbackSpeed);
  const setTimeRef = useRef(setCurrentTime);
  const onEndRef = useRef(onEnd);

  timeRef.current = currentTime;
  durationRef.current = duration;
  speedRef.current = playbackSpeed;
  setTimeRef.current = setCurrentTime;
  onEndRef.current = onEnd;

  useEffect(() => {
    if (!isPlaying) {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    const animate = (now: number) => {
      if (lastTimeRef.current !== null) {
        const deltaSec = Math.min(0.25, (now - lastTimeRef.current) / 1000); // clamp long frames (tab switch)
        const d = Math.max(0.001, durationRef.current);
        let next = timeRef.current + deltaSec * speedRef.current;
        if (next >= d) {
          if (loop) next = next % d;
          else {
            timeRef.current = d;
            setTimeRef.current(d);
            onEndRef.current?.();
            return;
          }
        }
        if (next < 0) next = loop ? ((next % d) + d) % d : 0;
        timeRef.current = next;
        setTimeRef.current(next);
      }
      lastTimeRef.current = now;
      requestRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = null;
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      requestRef.current = null;
      lastTimeRef.current = null;
    };
  }, [isPlaying, loop]);
};
