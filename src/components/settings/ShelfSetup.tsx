"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import { MAX_SHELF, type MediaChoice, type ShelfItem } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { moved } from "@/lib/dashboard";
import { toggled } from "@/lib/sets";
import { browseMedia, listMediaAccounts, saveMediaAccount, saveShelf } from "@/lib/services/media";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, inputCls } from "../ui/Segmented";
import { MemberFilter } from "../ui/MemberFilter";
import { ErrorText } from "../ui/ErrorText";

type Draft = Omit<ShelfItem, "id"> & { id?: string };

/**
 * The kids' shelf of one Jellyfin or Audiobookshelf connection (§23): what
 * the children may listen to, under which names, and for whom. Picked from
 * what the server lets Kindo's account see, so nobody types ids. For
 * Audiobookshelf, a child can also get their own account, so they keep
 * their own place in a book.
 */
export function ShelfSetupDialog({ conn, onClose }: { conn: ConnectionInfo; onClose: () => void }) {
  const { t } = useI18n();
  const { run, getMembers } = useStore();
  const children = getMembers().filter((m) => m.role === "child");
  const stored = ((conn.config as { shelf?: ShelfItem[] }).shelf ?? []);
  const [items, setItems] = useState<Draft[]>(stored);
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<MediaChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asks the server again a moment after the admin stops typing.
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      browseMedia({ id: conn.id, search }).then((r) => {
        if (!live) return;
        if (r.ok) setChoices(r.data);
        else setError(r.error);
      }, () => live && setError("network"));
    }, search ? 350 : 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [conn.id, search]);

  const picked = useMemo(() => new Set(items.map((i) => i.remoteId)), [items]);
  const available = (choices ?? []).filter((c) => !picked.has(c.remoteId));
  const kindLabel = (k: ShelfItem["kind"]) => t(`shelfSetup.kind_${k}`);

  const save = async () => {
    setBusy(true);
    const r = await run(() => saveShelf({ id: conn.id, items: items.map((i) => ({ ...i, name: i.name.trim() || i.remoteId })) }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Dialog open onClose={onClose} wide title={t("shelfSetup.title")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-soft">{t(conn.kind === "jellyfin" ? "shelfSetup.hintJellyfin" : "shelfSetup.hintAbs")}</p>

        <section className="flex flex-col gap-3">
          <h3 className="font-bold">{t("shelfSetup.onShelf")}</h3>
          {items.length === 0 && <p className="text-sm text-soft">{t("shelfSetup.none")}</p>}
          <ol className="flex flex-col gap-3">
            {items.map((item, i) => (
              <li key={item.remoteId} data-testid="shelf-item" className="flex flex-col gap-2 rounded-card bg-sunken p-3">
                <div className="flex items-center gap-2">
                  <input aria-label={t("shelfSetup.nameOf", { name: item.name })} className={inputCls} value={item.name} maxLength={60}
                    onChange={(e) => setItems((l) => l.map((x) => (x.remoteId === item.remoteId ? { ...x, name: e.target.value } : x)))} />
                  <span className="hidden shrink-0 text-sm text-soft md:block">{kindLabel(item.kind)}</span>
                  <IconButton size="sm" label={t("common.moveEarlier")} disabled={i === 0} onClick={() => setItems((l) => moved(l, i, -1))}><ArrowUp size={16} /></IconButton>
                  <IconButton size="sm" label={t("common.moveLater")} disabled={i === items.length - 1} onClick={() => setItems((l) => moved(l, i, 1))}><ArrowDown size={16} /></IconButton>
                  <IconButton size="sm" label={t("shelfSetup.remove", { name: item.name })} onClick={() => setItems((l) => l.filter((x) => x.remoteId !== item.remoteId))}><X size={16} /></IconButton>
                </div>
                {children.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-soft">{item.memberIds.length ? t("shelfSetup.forSome") : t("shelfSetup.forEveryone")}</span>
                    <MemberFilter size="sm" members={children} selected={new Set(item.memberIds)}
                      onToggle={(m) => setItems((l) => l.map((x) => (x.remoteId === item.remoteId ? { ...x, memberIds: [...toggled(new Set(x.memberIds), m)] } : x)))} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Field label={t("shelfSetup.add")}>
            <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("shelfSetup.search")} />
          </Field>
          {!choices && !error && <p className="text-sm text-soft">{t("shelfSetup.loading")}</p>}
          {choices && (
            <ul className="flex max-h-64 flex-col overflow-y-auto rounded-card bg-sunken p-1" aria-label={t("shelfSetup.add")}>
              {available.length === 0 && <li className="p-2 text-sm text-soft">{t("homeSetup.nothingFound")}</li>}
              {available.slice(0, 150).map((c) => (
                <li key={c.remoteId}>
                  <button type="button" disabled={items.length >= MAX_SHELF}
                    onClick={() => setItems((l) => [...l, { remoteId: c.remoteId, kind: c.kind, name: c.name.slice(0, 60), memberIds: [] }])}
                    className="flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left enabled:hover:bg-surface disabled:opacity-40">
                    <Plus size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span>
                      <span className="block truncate text-sm text-soft">{[kindLabel(c.kind), c.detail].filter(Boolean).join(" · ")}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {items.length >= MAX_SHELF && <p className="text-sm text-soft">{t("shelfSetup.full", { n: MAX_SHELF })}</p>}
        </section>

        {conn.kind === "audiobookshelf" && children.length > 0 && <ChildAccounts conn={conn} />}
      </div>
    </Dialog>
  );
}

/** Each child's own Audiobookshelf account, linked with its API key; without one they listen with the connection's account. */
function ChildAccounts({ conn }: { conn: ConnectionInfo }) {
  const { t } = useI18n();
  const { getMembers } = useStore();
  const children = getMembers().filter((m) => m.role === "child");
  const [linked, setLinked] = useState<Map<string, string> | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => listMediaAccounts({ id: conn.id }).then((r) => {
    if (r.ok) setLinked(new Map(r.data.map((a) => [a.memberId, a.username])));
    else setError(r.error);
  }, () => setError("network"));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn.id]);

  const link = async (memberId: string, apiKey: string) => {
    setBusy(memberId);
    const r = await saveMediaAccount({ id: conn.id, memberId, apiKey }).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setError(null);
    setKeys((k) => ({ ...k, [memberId]: "" }));
    await load();
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-bold">{t("shelfSetup.accounts")}</h3>
      <p className="text-sm text-soft">{t("shelfSetup.accountsHint")}</p>
      <ul className="flex flex-col gap-2">
        {children.map((m) => {
          const user = linked?.get(m.id);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2">
              <span className="w-32 shrink-0 truncate font-bold">{m.name}</span>
              {user ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{t("shelfSetup.linked", { user })}</span>
                  <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => link(m.id, "")}>{t("shelfSetup.unlink")}</Button>
                </>
              ) : (
                <>
                  <input aria-label={t("shelfSetup.keyFor", { name: m.name })} className={`${inputCls} min-w-0 flex-1`} type="password" autoComplete="off"
                    value={keys[m.id] ?? ""} onChange={(e) => setKeys((k) => ({ ...k, [m.id]: e.target.value }))} placeholder={t("shelfSetup.sharedAccount")} />
                  <Button size="sm" variant="outline" disabled={busy === m.id || (keys[m.id] ?? "").trim().length < 10} onClick={() => link(m.id, keys[m.id].trim())}>{t("shelfSetup.link")}</Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorText code={error} />
    </section>
  );
}
