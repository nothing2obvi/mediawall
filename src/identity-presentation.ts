import type { AnonymousIdentity } from "../server/anonymous-mode";
type Identity = {anonymousIdentity?:AnonymousIdentity;displayUser?:string;user?:string;mediaWallUser?:string;displayUserAvatarUrl?:string};
export function badgeIdentity(now:Identity,showUsername:boolean,showAvatar:boolean) {
  const anonymous=now.anonymousIdentity;
  if(anonymous)return {username:anonymous.showUsername ? anonymous.username : undefined,avatarUrl:anonymous.showAvatar ? anonymous.avatarUrl : undefined};
  return {username:showUsername ? now.displayUser ?? now.user : undefined,avatarUrl:showAvatar ? now.displayUserAvatarUrl : undefined};
}
export function transitionIdentity(now:Identity,fallback:string) {
  if(now.anonymousIdentity)return {username:now.anonymousIdentity.username,avatarUrl:now.anonymousIdentity.transitionAvatarUrl};
  return {username:now.displayUser ?? now.user ?? now.mediaWallUser ?? fallback,avatarUrl:now.displayUserAvatarUrl};
}
