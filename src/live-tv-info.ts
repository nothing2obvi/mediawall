export function cycleLiveTvInfo(prefs: {live_tv_channel: boolean; live_tv_label: boolean}) {
  const channel = prefs.live_tv_channel, label = prefs.live_tv_label;
  return {live_tv_channel: !channel, live_tv_label: channel !== label};
}
