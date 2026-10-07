"use client";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Coins, Euro, PowerOff, Star } from "lucide-react";
import type { RewardMode } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { REWARDS, POINT_VALUE_EUR } from "@/lib/data/rewards";
import { children, getMember } from "@/lib/services/household";
import { PageHeader, Panel } from "../ui/Panel";
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
  const { rewardMode, setRewardMode } = useStore();
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
      {rewardMode === "money" && <p className="mt-2 text-sm text-soft">{t("rewards.rate", { value: fmt.money(POINT_VALUE_EUR) })}</p>}
    </div>
  );
}

export function RewardsScreen() {
  const { t, tx, fmt } = useI18n();
  const { rewardMode, balances, redeem, approvals, resolveApproval } = useStore();
  const [flash, setFlash] = useState<string | null>(null);

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
                          {can ? <Button size="sm" variant="primary" onClick={() => { redeem(m.id, r); setFlash(t("rewards.redeemed", { reward: tx(r.title) })); }}>{t("rewards.redeem")}</Button>
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
                    const m = getMember(a.memberId)!;
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
            <Panel title={t("rewards.howTitle")} tone="sunken">
              <p className="font-bold">{t("rewards.expectedTitle")}</p>
              <p className="mb-3 text-soft">{t("rewards.expectedBody")}</p>
              <p className="font-bold">{t("rewards.extraTitle")}</p>
              <p className="text-soft">{t("rewards.extraBody")}</p>
            </Panel>
          </div>
        </div>
      )}
      {flash && (
        <div role="status" onAnimationEnd={() => setTimeout(() => setFlash(null), 1800)}
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 animate-rise rounded-full bg-ink px-5 py-3 font-bold text-surface md:bottom-8">{flash}</div>
      )}
    </div>
  );
}
