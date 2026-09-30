/**
 * 📱 Meax App Ads の React 用コンポーネント
 *   配布元: https://maa-sdk.dstk.jp/react/MeaxAdUnit.tsx（このファイルをそのままコピーして使えます）
 *
 *   <MeaxAdUnit appId="app-xxxx" unitId="unit-xxxx" size="300x250" onRewardComplete={() => ...} />
 *   <MeaxAdUnit appId="app-xxxx" unitId="unit-yyyy" size="article" layout="list" />   … 記事ネイティブ（幅いっぱい）
 *
 * マウントで window.MeaxAd.render()、アンマウントで destroy() を必ず呼ぶ。
 * SDK（v1.js）が読み込まれていなければ自動で1回だけ読み込む。Next.js ではクライアント側でだけ動く。
 * コールバックは最新のものを参照するので、毎回新しい関数を渡しても広告は作り直されない。
 */
"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

export type MeaxAdSize = "300x250" | "728x90" | "336x280" | "320x50" | "article";

export type MeaxAdUnitProps = {
  appId: string;
  unitId: string;
  size: MeaxAdSize;
  /** 記事ネイティブの並べ方（場所を先に取るのに使う） */
  layout?: "card" | "list";
  onImpression?: () => void;
  onClick?: () => void;
  onRewardComplete?: () => void;
  className?: string;
  style?: CSSProperties;
  /** SDK の読み込み元（ふつうは変えない） */
  src?: string;
};

type MeaxAdInstance = { destroy: () => void };
type MeaxAdApi = {
  render: (
    container: HTMLElement,
    config: {
      appId: string;
      unitId: string;
      size: MeaxAdSize;
      layout?: "card" | "list";
      onImpression?: () => void;
      onClick?: () => void;
      onRewardComplete?: () => void;
    },
  ) => MeaxAdInstance;
};

const DEFAULT_SRC = "https://maa-sdk.dstk.jp/tag/v1.js";
const SIZE_PX: Record<Exclude<MeaxAdSize, "article">, [number, number]> = {
  "300x250": [300, 250],
  "728x90": [728, 90],
  "336x280": [336, 280],
  "320x50": [320, 50],
};

let loading: Promise<MeaxAdApi> | null = null;

/** SDK を1回だけ読み込んで window.MeaxAd を返す */
export function loadMeaxAd(src = DEFAULT_SRC): Promise<MeaxAdApi> {
  const w = window as unknown as { MeaxAd?: MeaxAdApi };
  if (w.MeaxAd) return Promise.resolve(w.MeaxAd);
  if (loading) return loading;
  loading = new Promise<MeaxAdApi>((resolve, reject) => {
    const done = () =>
      w.MeaxAd ? resolve(w.MeaxAd) : reject(new Error("MeaxAd SDK を読み込めませんでした"));
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script =
      existing ?? Object.assign(document.createElement("script"), { src, async: true });
    script.addEventListener("load", done, { once: true });
    script.addEventListener(
      "error",
      () => {
        loading = null;
        reject(new Error("MeaxAd SDK を読み込めませんでした"));
      },
      { once: true },
    );
    window.addEventListener("meaxad:ready", done, { once: true });
    if (!existing) document.head.appendChild(script);
  });
  return loading;
}

export function MeaxAdUnit({
  appId,
  unitId,
  size,
  layout,
  onImpression,
  onClick,
  onRewardComplete,
  className,
  style,
  src,
}: MeaxAdUnitProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onImpression, onClick, onRewardComplete });
  callbacks.current = { onImpression, onClick, onRewardComplete };

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let instance: MeaxAdInstance | null = null;
    let cancelled = false;
    loadMeaxAd(src)
      .then((api) => {
        if (cancelled) return;
        instance = api.render(container, {
          appId,
          unitId,
          size,
          layout,
          onImpression: () => callbacks.current.onImpression?.(),
          onClick: () => callbacks.current.onClick?.(),
          onRewardComplete: () => callbacks.current.onRewardComplete?.(),
        });
      })
      .catch((err) => console.warn(err));
    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [appId, unitId, size, layout, src]);

  // SDK が来る前から同じ大きさで場所を取る（レイアウトがずれない）
  if (size === "article") {
    return (
      <div
        ref={ref}
        className={className}
        style={{ width: "100%", minHeight: layout === "list" ? 96 : 200, ...style }}
      />
    );
  }
  const [w, h] = SIZE_PX[size] ?? SIZE_PX["300x250"];
  return <div ref={ref} className={className} style={{ width: w, height: h, ...style }} />;
}

export default MeaxAdUnit;
