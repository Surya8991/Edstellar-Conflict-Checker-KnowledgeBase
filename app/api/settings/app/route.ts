import { NextRequest, NextResponse } from "next/server";
import { getAppSettings, setAppSetting, numSetting, SETTING_KEYS } from "@/lib/app-settings";
import { THRESHOLDS } from "@/lib/thresholds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolved cluster-tuning settings (stored value or the thresholds default). */
async function resolved() {
  const s = await getAppSettings();
  return {
    topicOverlap: numSetting(s, SETTING_KEYS.topicOverlap, THRESHOLDS.topicOverlap, 0.05, 0.95),
    bodyFloor: numSetting(s, SETTING_KEYS.bodyFloor, THRESHOLDS.topicBodyFloor, 0.3, 0.98),
    mergeMaxSize: Math.round(numSetting(s, SETTING_KEYS.mergeMaxSize, THRESHOLDS.groupMergeMaxSize, 2, 50)),
  };
}

export async function GET() {
  try {
    return NextResponse.json({ cluster: await resolved() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const b = await request.json().catch(() => ({}));
    const writes: Promise<void>[] = [];
    if (b.topicOverlap !== undefined) {
      const v = Math.min(0.95, Math.max(0.05, Number(b.topicOverlap)));
      if (Number.isFinite(v)) writes.push(setAppSetting(SETTING_KEYS.topicOverlap, String(v)));
    }
    if (b.bodyFloor !== undefined) {
      const v = Math.min(0.98, Math.max(0.3, Number(b.bodyFloor)));
      if (Number.isFinite(v)) writes.push(setAppSetting(SETTING_KEYS.bodyFloor, String(v)));
    }
    if (b.mergeMaxSize !== undefined) {
      const v = Math.round(Math.min(50, Math.max(2, Number(b.mergeMaxSize))));
      if (Number.isFinite(v)) writes.push(setAppSetting(SETTING_KEYS.mergeMaxSize, String(v)));
    }
    if (writes.length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    await Promise.all(writes);
    return NextResponse.json({ cluster: await resolved() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
