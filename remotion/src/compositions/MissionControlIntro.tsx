import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const MissionControlIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ fps, frame, config: { damping: 16, stiffness: 80 } });
  const lineWidth = interpolate(reveal, [0, 1], [0, 440]);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #06080f 0%, #0d1322 45%, #111827 100%)',
        color: 'white',
        padding: 100,
        fontFamily: 'Inter, sans-serif',
        justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: 20, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#88a7ff', marginBottom: 18 }}>
        Mission Control
      </div>
      <div style={{ fontSize: 94, fontWeight: 700, lineHeight: 1.02, marginBottom: 20 }}>Build the right thing.</div>
      <div style={{ width: lineWidth, height: 4, background: 'linear-gradient(90deg, #8fb3ff, #b8c6ff)', marginBottom: 24, borderRadius: 999 }} />
      <div style={{ fontSize: 30, color: '#c8d1e6', maxWidth: 880, lineHeight: 1.35 }}>
        A darker, sharper intro composition for tools, systems, operations, and the sort of projects that should not look like children’s television.
      </div>
    </AbsoluteFill>
  );
};
