"use client";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Coins, Euro, Pencil, Plus, PowerOff, Star, Trash2 } from "lucide-react";
import type { Reward, RewardMode } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { deleteReward, saveReward, setRewardMode as saveRewardMode } from "@/lib/services/actions";
import { PageHeader, Panel } from "../ui/Panel";
import { Dialog } from "../ui/Dialog";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Pictogram } from "../ui/Pictogram";
import { RewardAmount } from "../ui/RewardAmount";
import { cn } from "../ui/cn";

const MODES: { id: RewardMode; Icon: typeof Star }[] = [
  { id: "off", Icon: PowerOff }, { id: "stars", Icon: Star }, { id: "tokens", Icon: Coins }, { id: "money", Icon: Euro },
];

export function RewardModePicker() {
  const { t, fmt } = useI18n();
  const { rewardMode, setRewardMode, pointValue, run } = useStore();
  const [rate, setRate] = useState(String(pointValue));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {MODES.map(({ id, Icon }) => (
          <button key={id} onClick={() => setRewardMode(id)} aria-pressed={rewardMode === id}
            className={cn("flex flex-col items-start gap-2 rounded-card border-2 p-4 text-left", rewardMode === id ? "border-ink bg-surface" : "border-transparent bg-surface/60 text-soft")}>
            <Icon size={22} className={id === "stars" || id === "tokens" ? "text-star" : ""} />
            <span className="font-bold text-ink">{t(`rewards.${id}`)}</span>
            <span className="text-sm">{t(`rewards.${id}Hint`)}</span>
          </button>
        ))}
      </div>
      {rewardMode === "money" && (
        <label className="mt-3 flex flex-wrap items-center gap-3 text-sm text-soft">
          {t("rewards.rate", { value: fmt.money(pointValue) })}
          <input type="number" min={0} step={0.01} value={rate} aria-label={t("rewards.rateLabel")} className={cn(inputCls, "h-9 w-24")}
            onChange={(e) => setRate(e.target.value)}
            onBlur={() => { const v = Number(rate); if (Number.isFinite(v) && v >= 0) void run(() => saveRewardMode({ mode: "money", pointValue: v })); }} />
        </label>
      )}
    </div>
  );
}

export function RewardsScreen() {
  const { t, tx, fmt } = useI18n();
  const { rewardMode, balances, redeem, approvals, resolveApproval, children, getMember, data } = useStore();
  const [flash, setFlash] = useState<string | null>(null);
  // Rises in (500 ms), stays a moment, goes; a new one starts the time again.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2300);
    return () => clearTimeout(id);
  }, [flash]);
  const [editing, setEditing] = useState<Reward | "new" | null>(null);
  const REWARDS = data.rewards;

  return (
    <div>
      <PageHeader title={t("rewards.title")} />
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold">{t("rewards.mode")}</h2>
        <RewardModePicker />
      </section>

      {rewardMode === "off" ? (
        <p className="rounded-panel bg-surface p-6 text-soft">{t("rewards.disabledBody")}</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="grid gap-5 md:grid-cols-2">
            {children().map((m) => {
              const bal = balances[m.id] ?? 0;
              return (
                <section key={m.id} style={{ "--m": m.color } as CSSProperties} className="tint rounded-panel p-6">
                  <header className="flex items-center gap-4">
                    <Avatar member={m} size="lg" />
                    <div>
                      <p className="m-text font-display text-3xl font-bold">{m.name}</p>
                      <RewardAmount points={bal} iconSize={26} className="font-display text-4xl" />
                    </div>
                  </header>
                  <p className="mb-2 mt-6 text-sm font-bold text-soft">{t("rewards.available", { name: m.name })}</p>
                  <ul className="flex flex-col gap-2">
                    {REWARDS.map((r) => {
                      const can = bal >= r.cost;
                      return (
                        <li key={r.id} className="flex items-center gap-3 rounded-card bg-surface p-3">
                          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-tile bg-sunken text-2xl" aria-hidden>{r.emoji}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold">{tx(r.title)}</span>
                            <RewardAmount points={r.cost} className="text-sm text-soft" iconSize={14} />
                            {!can && (
                              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sunken">
                                <span className="m-bg block h-full rounded-full" style={{ width: `${Math.min(100, (bal / r.cost) * 100)}%` }} />
                              </span>
                            )}
                          </span>
                          {can ? <Button size="sm" variant="primary" onClick={async () => { if ((await redeem(m.id, r)).ok) setFlash(t("rewards.redeemed", { reward: tx(r.title) })); }}>{t("rewards.redeem")}</Button>
                            : <span className="num text-sm text-soft">{t("rewards.needMore", { n: fmt.num(r.cost - bal) })}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="flex flex-col gap-5">
            <Panel title={t("rewards.approvals")}>
              {approvals.length === 0 ? <p className="text-soft">{t("rewards.noApprovals")}</p> : (
                <ul className="flex flex-col gap-3">
                  {approvals.map((a) => {
                    const m = getMember(a.memberId);
                    if (!m) return null;
                    return (
                      <li key={a.id} style={{ "--m": m.color } as CSSProperties} className="rounded-card bg-sunken p-3">
                        <div className="flex items-center gap-3">
                          <span className="tint m-text grid h-12 w-12 place-items-center rounded-tile"><Pictogram id={a.item.pictogram} className="h-6 w-6" /></span>
                          <span className="flex-1">
                            <span className="block font-bold">{tx(a.item.label)}</span>
                            <span className="text-sm text-soft">{m.name}, {fmt.time(a.at)}</span>
                          </span>
                          {a.item.value.kind === "extra" && <RewardAmount points={a.item.value.points} plus />}
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => resolveApproval(a.id, false)}>{t("common.decline")}</Button>
                          <Button size="sm" variant="primary" onClick={() => resolveApproval(a.id, true)}>{t("common.approve")}</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
            <Panel title={t("rewards.catalogue")} action={<Button size="sm" variant="ghost" onClick={() => setEditing("new")}><Plus size={16} />{t("rewards.add")}</Button>}>
              <ul className="flex flex-col gap-1">
                {REWARDS.length === 0 && <li className="text-soft">{t("rewards.noRewards")}</li>}
                {REWARDS.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setEditing(r)} className="flex w-full items-center gap-3 rounded-tile p-2 text-left hover:bg-sunken">
                      <span className="text-xl" aria-hidden>{r.emoji}</span>
                      <span className="flex-1 font-bold">{tx(r.title)}</span>
                      <RewardAmount points={r.cost} className="text-sm text-soft" iconSize={14} />
                      <Pencil size={14} className="text-soft" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t("rewards.howTitle")} tone="sunken">
              <p className="font-bold">{t("rewards.expectedTitle")}</p>
              <p className="mb-3 text-soft">{t("rewards.expectedBody")}</p>
              <p className="font-bold">{t("rewards.extraTitle")}</p>
              <p className="text-soft">{t("rewards.extraBody")}</p>
            </Panel>
          </div>
        </div>
      )}
      {editing && <RewardEditor reward={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {flash && (
        <div role="status"
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-full bg-ink px-5 py-3 font-bold text-surface md:bottom-8">{flash}</div>
      )}
    </div>
  );
}

function RewardEditor({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { run } = useStore();
  const [emoji, setEmoji] = useState(reward?.emoji ?? "🎁");
  const [title, setTitle] = useState(reward ? tx(reward.title) : "");
  const [cost, setCost] = useState(reward?.cost ?? 50);
  const [error, setError] = useState<string | null>(null);
  const done = (r: { ok: boolean; error?: string }) => (r.ok ? onClose() : setError(r.error ?? "server"));
  return (
    <Dialog open onClose={onClose} title={reward ? t("rewards.edit") : t("rewards.add")}
      footer={<>
        {reward && <Button variant="ghost" className="mr-auto" onClick={async () => done(await run(() => deleteReward({ id: reward.id })))}><Trash2 size={16} />{t("common.delete")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={!title.trim()} onClick={async () => done(await run(() => saveReward({ id: reward?.id, emoji, title, cost })))}>{t("common.save")}</Button>
      </>}>
      <div className="grid grid-cols-[88px_1fr] gap-4">
        <Field label={t("rewards.emoji")}><input className={cn(inputCls, "text-center text-2xl")} value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} /></Field>
        <Field label={t("routines.label")}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t("rewards.cost")}><input type="number" min={1} className={inputCls} value={cost} onChange={(e) => setCost(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></Field>
      </div>
    </Dialog>
  );
}
