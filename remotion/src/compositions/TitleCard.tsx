import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const TitleCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ fps, frame, config: { damping: 14, stiffness: 90 } });
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at top, #1b2440 0%, #090d18 56%)',
        color: 'white',
        justifyContent: 'center',
        padding: '120px',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ transform: `translateY(${40 - rise * 40}px)`, opacity }}>
        <div style={{ fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8fb3ff', marginBottom: 18 }}>
          Willy Video Starter
        </div>
        <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.02, marginBottom: 18 }}>{title}</div>
        <div style={{ fontSize: 30, color: '#b9c4de', maxWidth: 900, lineHeight: 1.35 }}>{subtitle}</div>
      </div>
    </AbsoluteFill>
  );
};
