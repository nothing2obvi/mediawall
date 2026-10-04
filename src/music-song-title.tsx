export interface MusicVideoIndicator { enabled: boolean; text: string }

export function MusicSongTitle({title, musicVideo, indicator = {enabled: true, text: "[MV]"}}: {
  title: string;
  musicVideo: boolean;
  indicator?: MusicVideoIndicator;
}) {
  return <div className="music-song-title">"{title}"{musicVideo && indicator.enabled && indicator.text ? <> <span className="music-video-indicator">{indicator.text}</span></> : null}</div>;
}
