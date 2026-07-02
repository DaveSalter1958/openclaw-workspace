import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion';

const points = [
  'Clean structure beats chaotic cleverness.',
  'Build local-first where it helps.',
  'Make review surfaces actually useful.',
  'Prefer practical machinery over dashboard theatre.',
];

export const TalkingPoints: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c111b', color: 'white', fontFamily: 'Inter, sans-serif', padding: 100 }}>
      <div style={{ fontSize: 24, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8fb3ff', marginBottom: 30 }}>Explainer Template</div>
      <div style={{ fontSize: 82, fontWeight: 700, lineHeight: 1.04, marginBottom: 30 }}>Talking points</div>
      {points.map((point, index) => (
        <Sequence key={point} from={index * 45} durationInFrames={120}>
          <div
            style={{
              marginBottom: 24,
              opacity: interpolate(frame - index * 45, [0, 12], [0, 1], { extrapolateRight: 'clamp' }),
              transform: `translateY(${interpolate(frame - index * 45, [0, 16], [22, 0], { extrapolateRight: 'clamp' })}px)`,
              fontSize: 34,
              color: '#d8dfef',
            }}
          >
            • {point}
          </div>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
