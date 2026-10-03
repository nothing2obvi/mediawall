import type { DisplayConfig, MediaWallUser, NowPlayingState } from "./types.js";
export interface AnonymousMode {
  enabled: boolean;
  shown: string[];
  not_shown: string[];
  anonymous_username: string;
  now_playing_info: { show_anonymous_username: boolean; show_anonymous_avatar: boolean };
  user_transition_info: { show_anonymous_avatar: boolean };
}
export interface AnonymousIdentity {
  username: string;
  avatarUrl?: string;
  showUsername: boolean;
  showAvatar: boolean;
  transitionAvatarUrl?: string;
  showTransitionAvatar: boolean;
}
const normalized = (s:string) => s.trim().toLowerCase();
export function mappedUserKey(state: NowPlayingState, user: MediaWallUser, allUsers: Record<string,MediaWallUser>) {
  const sourceField = state.source === "jellyfin" ? "jellyfin_user" : state.source === "subsonic" ? "subsonic_user" : undefined;
  if (sourceField && normalized(user[sourceField] ?? "") === "all") {
    const match=Object.entries(allUsers).find(([,u])=>normalized(u[sourceField] ?? u.name)===normalized(state.user));
    return match?.[0] ?? state.user;
  }
  return user.key ?? user.name;
}
export function anonymousIdentity(config: DisplayConfig["anonymous_mode"], key: string, avatarUrl?:string): AnonymousIdentity|undefined {
  if(!config?.enabled)return undefined;
  const matches=(list:string[])=>list.some(value=>normalized(value)==="all" || normalized(value)===normalized(key));
  if(matches(config.shown) || !matches(config.not_shown))return undefined;
  return {showTransitionAvatar:config.user_transition_info.show_anonymous_avatar,username:config.anonymous_username,avatarUrl:config.now_playing_info.show_anonymous_avatar ? avatarUrl : undefined,showUsername:config.now_playing_info.show_anonymous_username,showAvatar:config.now_playing_info.show_anonymous_avatar,transitionAvatarUrl:config.user_transition_info.show_anonymous_avatar ? avatarUrl : undefined};
}
