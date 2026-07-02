import { Composition } from 'remotion';
import { TitleCard } from './compositions/TitleCard';
import { PhotoSlideshow } from './compositions/PhotoSlideshow';
import { TalkingPoints } from './compositions/TalkingPoints';
import { MissionControlIntro } from './compositions/MissionControlIntro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TitleCard"
        component={TitleCard}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: 'Santa Barbara 4x4 Trail Briefing',
          subtitle: 'Route, weather, gear, and timing.',
        }}
      />
      <Composition id="PhotoSlideshow" component={PhotoSlideshow} durationInFrames={270} fps={30} width={1920} height={1080} />
      <Composition id="TalkingPoints" component={TalkingPoints} durationInFrames={240} fps={30} width={1920} height={1080} />
      <Composition id="MissionControlIntro" component={MissionControlIntro} durationInFrames={180} fps={30} width={1920} height={1080} />
    </>
  );
};
