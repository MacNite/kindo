"use server";
import type { HouseholdWire } from "@/lib/types";
import { prisma } from "../db";
import { loadSnapshot } from "../snapshot";
import { photoPlaylist } from "../photos";
import { syncHolidays } from "../holidays";
import { z } from "zod";
import * as H from "../household";
import { S } from "../validation";
import { act } from "./act";

/**
 * Server Actions for the household (§19.2). Each is a thin wrapper: the rules
 * live in `../household.ts`. The device reaches these only through
 * `src/lib/state/store.tsx` and `src/lib/services/actions.ts`.
 */
export async function getSnapshot(): Promise<HouseholdWire | null> {
  return loadSnapshot(prisma);
}

export const setCompletion = act(S.completion, H.setCompletion);
export const resolveApproval = act(S.resolveApproval, H.resolveApproval);
export const redeem = act(S.redeem, H.redeem);
export const setRewardMode = act(S.rewardMode, H.setRewardMode);
export const saveReward = act(S.reward, H.saveReward);
export const deleteReward = act(S.byId, H.deleteReward);

export const addShoppingItem = act(S.shoppingAdd, H.addShoppingItem);
export const setShoppingDone = act(S.shoppingDone, H.setShoppingDone);
export const clearDoneShopping = act(S.shoppingClear, H.clearDoneShopping);
export const deleteShoppingItem = act(S.byId, H.deleteShoppingItem);
export const saveShoppingList = act(S.shoppingList, H.saveShoppingList);
export const deleteShoppingList = act(S.byId, H.deleteShoppingList);

export const addTask = act(S.taskAdd, H.addTask);
export const setTaskDone = act(S.taskDone, H.setTaskDone);
export const deleteTask = act(S.byId, H.deleteTask);

export const saveWidgets = act(S.widgets, H.saveWidgets);
export const updateAlbum = act(S.album, H.updateAlbum);
export const setPhotoPrefs = act(S.photoPrefs, H.setPhotoPrefs);
export const updateHousehold = act(S.household, H.updateHousehold);

export const saveMember = act(S.member, H.saveMember);
export const deleteMember = act(S.byId, H.deleteMember);
export const saveRoutineStep = act(S.routineStep, H.saveRoutineStep);
export const deleteRoutineStep = act(S.byId, H.deleteRoutineStep);
export const saveChore = act(S.chore, H.saveChore);
export const deleteChore = act(S.byId, H.deleteChore);

export const saveMeal = act(S.meal, H.saveMeal);
export const saveImportantDate = act(S.importantDate, H.saveImportantDate);
export const deleteImportantDate = act(S.byId, H.deleteImportantDate);

export const saveEvent = act(S.event, H.saveEvent, { topic: "events" });
export const deleteEvent = act(S.byId, H.deleteEvent, { topic: "events" });

export async function getPhotoPlaylist() {
  return photoPlaylist(prisma);
}

export const setDayTimes = act(S.dayTimes, H.setDayTimes);
export const setHolidayFeeds = act(S.holidayFeeds, H.setHolidayFeeds);
/** Fetches the holiday feeds now, so the settings screen can show the result at once. */
export const syncHolidaysNow = act(z.object({}), async () => syncHolidays(prisma));
