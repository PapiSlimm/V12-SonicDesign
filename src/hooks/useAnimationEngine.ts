import { useEffect, useRef } from 'react';
import { Layer } from '../core/types';

interface AnimationEngineProps {
  isPlaying: boolean;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  duration: number;
  playbackSpeed: number;
}

export const useAnimationEngine = ({
  isPlaying,
  currentTime,
  setCurrentTime,
  duration,
  playbackSpeed
}: AnimationEngineProps) => {
  const requestRef = useRef<number>(null);
  const lastTimeRef = useRef<number>(null);

  const animate = (time: number) => {
    if (lastTimeRef.current !== undefined) {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      const nextTime = (currentTime + deltaTime * playbackSpeed) % duration;
      setCurrentTime(nextTime);
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTimeRef.current = undefined;
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, currentTime, duration, playbackSpeed]);
};
