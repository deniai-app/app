export const appVersion = "7.9";
export const appCodename = "Neon Shield";
export const appDate = "2026-09-30";

const appHashPayload = [appVersion, appDate].join(":");
export const appHash = globalThis.btoa(appHashPayload);

export const versions = {
  version: appVersion,
  codename: appCodename,
  date: appDate,
  hash: appHash,
};
