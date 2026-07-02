import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

const photos = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1600&auto=format&fit=crop',
];

export const PhotoSlideshow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const segment = Math.floor(frame / (fps * 3)) % photos.length;
  const localFrame = frame % (fps * 3);
  const scale = 1 + interpolate(localFrame, [0, fps * 3], [0, 0.06]);
  const fade = spring({ fps, frame: localFrame, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070c', color: 'white', fontFamily: 'Inter, sans-serif' }}>
      <Img src={photos[segment]} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, opacity: fade }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.12))', justifyContent: 'flex-end', padding: 64 }}>
        <div style={{ fontSize: 58, fontWeight: 700, marginBottom: 12 }}>Photo Slideshow</div>
        <div style={{ fontSize: 26, color: '#d7ddeb', maxWidth: 800 }}>Drop in hiking shots, artwork references, project progress photos, or whatever else deserves a less miserable presentation.</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
