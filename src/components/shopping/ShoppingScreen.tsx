"use client";
import { useState, type FormEvent } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, WifiOff } from "lucide-react";
import { deleteShoppingList, saveShoppingList } from "@/lib/services/actions";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import type { ShoppingCategory, ShoppingItem, ShoppingList, Text } from "@/lib/types";
import { editText } from "@/lib/text";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { cn } from "../ui/cn";

const ORDER: ShoppingCategory[] = ["produce", "bakery", "dairy", "pantry", "frozen", "household", "hardware", "care", "other"];

export function ShoppingScreen() {
  const { t, tx } = useI18n();
  const { shopping, toggleShopping, addShopping, deleteShopping, clearDone, shoppingLists: LISTS, getMember, getMembers, queued, sync } = useStore();
  const [chosen, setListId] = useState<string | undefined>();
  const listId = LISTS.find((l) => l.id === chosen)?.id ?? LISTS[0]?.id;
  const [text, setText] = useState("");
  const [forWho, setForWho] = useState<string | undefined>();
  const [showDone, setShowDone] = useState(false);
  const [editingList, setEditingList] = useState<ShoppingList | "new" | null>(null);
  const list = LISTS.find((l) => l.id === listId);
  const items = shopping.filter((s) => s.listId === listId);
  const open = items.filter((s) => !s.done);
  const done = items.filter((s) => s.done);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !listId) return;
    addShopping(listId, text.trim(), forWho);
    setText("");
  };
  const removeButton = (s: ShoppingItem) => (
    <button onClick={() => deleteShopping(s.id)} aria-label={t("shopping.removeItem", { name: tx(s.name) })}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-soft hover:bg-sunken hover:text-ink">
      <Trash2 size={18} />
    </button>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("shopping.title")} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
        {LISTS.map((l) => {
          const n = shopping.filter((s) => s.listId === l.id && !s.done).length;
          return (
            <button key={l.id} onClick={() => setListId(l.id)} aria-pressed={l.id === listId}
              className={cn("flex h-12 shrink-0 items-center gap-2 rounded-full px-4 font-bold", l.id === listId ? "bg-ink text-surface" : "bg-surface")}>
              <span aria-hidden>{l.icon}</span>{tx(l.name)}<span className={cn("num rounded-full px-2 text-sm", l.id === listId ? "bg-surface/20" : "bg-sunken")}>{n}</span>
            </button>
          );
        })}
        {list && (
          <button onClick={() => setEditingList(list)} aria-label={t("shopping.editList")} title={t("shopping.editList")}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-soft hover:text-ink"><Pencil size={18} /></button>
        )}
        <button onClick={() => setEditingList("new")} aria-label={t("shopping.newList")} title={t("shopping.newList")}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface text-soft hover:text-ink"><Plus size={20} /></button>
      </div>
      {editingList && <ListEditor list={editingList === "new" ? null : editingList} canDelete={LISTS.length > 1} onClose={() => setEditingList(null)} />}

      {/* Quick add sits at the top: the most common action */}
      <form onSubmit={submit} className="sticky top-[60px] z-20 mb-5 flex flex-col gap-2 rounded-panel bg-surface p-3 md:top-4">
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("shopping.add", { list: list ? tx(list.name) : "" })}
            className="h-12 min-w-0 flex-1 rounded-full bg-sunken px-5 text-lg placeholder:text-soft focus:outline-none" />
          <button type="submit" aria-label={t("common.add")} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-surface"><Plus /></button>
        </div>
        <div className="flex items-center gap-1.5 px-1">
          <span className="mr-1 text-sm text-soft">{t("shopping.whoAdds")}</span>
          {getMembers().map((m) => (
            <button type="button" key={m.id} onClick={() => setForWho((w) => (w === m.id ? undefined : m.id))} aria-pressed={forWho === m.id} aria-label={m.name}
              className={cn("rounded-full transition-opacity", forWho === m.id ? "opacity-100" : "opacity-40")}><Avatar member={m} size="xs" ring={forWho === m.id} /></button>
          ))}
        </div>
      </form>

      <div className="flex flex-col gap-5">
        {ORDER.map((cat) => {
          const inCat = open.filter((s) => s.category === cat);
          if (!inCat.length) return null;
          return (
            <section key={cat}>
              <h2 className="mb-1.5 px-2 text-sm font-bold text-soft">{t(`shopping.cat_${cat}`)}</h2>
              <ul className="overflow-hidden rounded-panel bg-surface">
                {inCat.map((s) => {
                  const m = getMember(s.memberId);
                  return (
                    <li key={s.id} className="flex items-center border-b border-line pr-2 last:border-0">
                      <button onClick={() => toggleShopping(s.id)} className="flex min-h-[60px] min-w-0 flex-1 items-center gap-4 px-4 text-left active:bg-sunken">
                        <span className="h-7 w-7 shrink-0 rounded-lg border-2 border-line" />
                        <span className="flex-1 text-lg">{tx(s.name)}</span>
                        {s.qty && <span className="num text-soft">{s.qty}</span>}
                        {m && <Avatar member={m} size="xs" />}
                      </button>
                      {removeButton(s)}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {done.length > 0 && (
          <section>
            <div className="flex items-center justify-between px-2">
              <button onClick={() => setShowDone((v) => !v)} className="flex items-center gap-1.5 text-sm font-bold text-soft">
                <ChevronDown size={16} className={cn("transition-transform", !showDone && "-rotate-90")} />{t("shopping.inTrolley", { n: done.length })}
              </button>
              <button onClick={() => listId && clearDone(listId)} className="text-sm font-bold text-soft hover:text-ink">{t("shopping.clearDone")}</button>
            </div>
            {showDone && (
              <ul className="mt-1.5 overflow-hidden rounded-panel bg-surface/60">
                {done.map((s) => (
                  <li key={s.id} className="flex items-center pr-2">
                    <button onClick={() => toggleShopping(s.id)} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-4 px-4 text-left text-soft">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ok text-white"><Check size={16} strokeWidth={3} /></span>
                      <span className="flex-1 line-through">{tx(s.name)}</span>
                    </button>
                    {removeButton(s)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <p role="status" className={cn("flex items-center gap-2 px-2 text-sm", queued || sync === "offline" ? "font-bold text-ink" : "text-soft")}>
          <WifiOff size={16} />
          {queued ? t("shopping.queued", { n: queued }) : sync === "offline" ? t("shopping.offlineNow") : t("shopping.offline")}
        </p>
      </div>
    </div>
  );
}

/** Adds a list, or renames or deletes one (the last list stays). */
function ListEditor({ list, canDelete, onClose }: { list: ShoppingList | null; canDelete: boolean; onClose: () => void }) {
  const { t, tx, language } = useI18n();
  const { run } = useStore();
  const [name, setName] = useState<Text>(list?.name ?? "");
  const [icon, setIcon] = useState(list?.icon ?? "🛒");
  const [error, setError] = useState<string | null>(null);
  // A new list has no id yet: a second tap must not create it twice.
  const [busy, setBusy] = useState(false);
  const finish = async (call: Parameters<typeof run>[0]) => {
    setBusy(true);
    const r = await run(call);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  const save = () => finish(() => saveShoppingList({ id: list?.id, name, icon }));
  const remove = () => {
    if (list && confirm(t("shopping.deleteListConfirm", { name: tx(list.name) }))) void finish(() => deleteShoppingList({ id: list.id }));
  };
  return (
    <Dialog open onClose={onClose} title={list ? t("shopping.editList") : t("shopping.newList")}
      footer={<>
        {list && canDelete && <Button variant="ghost" className="mr-auto" disabled={busy} onClick={remove}><Trash2 size={16} />{t("shopping.deleteList")}</Button>}
        <ErrorText code={error} className={cn("self-center", !(list && canDelete) && "mr-auto")} />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !tx(name).trim()} onClick={save}>{t("common.save")}</Button>
      </>}>
      <div className="grid grid-cols-[88px_1fr] gap-4">
        <Field label={t("rewards.emoji")}><input className={cn(inputCls, "text-center text-2xl")} value={icon} maxLength={8} onChange={(e) => setIcon(e.target.value)} /></Field>
        <Field label={t("routines.label")}><input className={inputCls} value={tx(name)} onChange={(e) => setName(editText(name, language, e.target.value))} /></Field>
      </div>
    </Dialog>
  );
}
