"use client";

import { memo, useEffect, useRef } from "react";

/**
 * VinylCover — 3D вращающаяся виниловая пластинка на CSS transforms.
 *
 * Идея из видео "WebGL: как сделать сайт с интерактивной 3D-графикой":
 * обложка трека превращается в крутящийся винил с канавками.
 *
 * Реализация: чистый CSS 3D (perspective + rotateY + animation),
 * без WebGL/Three.js. Канавки через repeating-radial-gradient.
 *
 * - Вращается когда isPlaying, останавливается на паузе
 * - Центральная наклейка = обложка трека
 * - Канавки через repeating-radial-gradient
 * - Блик света (linear-gradient overlay) для реалистичности
 * - Pause: animation-play-state: paused (плавная остановка)
 * - 3D перспектива через rotateY(15deg) для эффекта наклона
 */

interface VinylCoverProps {
  cover: string;
  isPlaying: boolean;
  size?: number;
}

export const VinylCover = memo(function VinylCover({
  cover,
  isPlaying,
  size = 300,
}: VinylCoverProps) {
  const vinylRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (vinylRef.current) {
      vinylRef.current.style.animationPlayState = isPlaying ? "running" : "paused";
    }
  }, [isPlaying]);

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: "1000px",
        position: "relative",
      }}
    >
      {/* 3D tilt container */}
      <div
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: "rotateY(18deg) rotateX(2deg)",
          position: "relative",
        }}
      >
        {/* Vinyl disc */}
        <div
          ref={vinylRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `
              repeating-radial-gradient(
                circle at center,
                rgba(255,255,255,0.03) 0px,
                rgba(255,255,255,0.03) 1px,
                transparent 1px,
                transparent 4px
              ),
              radial-gradient(
                circle at center,
                #1a1a1a 0%,
                #0a0a0a 100%
              )
            `,
            boxShadow: `
              0 0 40px rgba(0,0,0,0.6),
              inset 0 0 0 1px rgba(255,255,255,0.05)
            `,
            animation: "mq-vinyl-spin 8s linear infinite",
            animationPlayState: isPlaying ? "running" : "paused",
          }}
        >
          {/* Light reflection —moves with rotation */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.04) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Center label (album art) */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "38%",
              height: "38%",
              borderRadius: "50%",
              overflow: "hidden",
              boxShadow: "0 0 0 2px rgba(0,0,0,0.4), 0 0 20px rgba(0,0,0,0.3)",
            }}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg, var(--mq-accent, #e03131), color-mix(in srgb, var(--mq-accent, #e03131) 60%, #000))",
                }}
              />
            )}
          </div>

          {/* Center hole */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "3%",
              height: "3%",
              borderRadius: "50%",
              backgroundColor: "#000",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.8)",
              zIndex: 2,
            }}
          />
        </div>

        {/* Tonearm — decorative, static */}
        <div
          style={{
            position: "absolute",
            top: "-5%",
            right: "-8%",
            width: "45%",
            height: "4px",
            background: "linear-gradient(90deg, #555, #999, #777)",
            borderRadius: "2px",
            transformOrigin: "right center",
            transform: isPlaying ? "rotate(-22deg)" : "rotate(-35deg)",
            transition: "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            zIndex: 3,
          }}
        >
          {/* Tonearm pivot */}
          <div
            style={{
              position: "absolute",
              right: "-6px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "radial-gradient(circle, #888, #444)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
            }}
          />
          {/* Tonearm head */}
          <div
            style={{
              position: "absolute",
              left: "-4px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "12px",
              height: "8px",
              borderRadius: "2px",
              background: "linear-gradient(180deg, #666, #333)",
            }}
          />
        </div>
      </div>

      {/* CSS keyframes injected inline */}
      <style>{`
        @keyframes mq-vinyl-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});
