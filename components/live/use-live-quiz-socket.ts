"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { liveCodingConfigSchema } from "@/lib/coding/live-server";
import { createLiveQuizSocketHook } from "@/packages/native-parity/student/learning/live-socket";

export type { ConnectionStatus, LeaderboardEntry, RefreshConnectionUrl, SessionState } from "@/packages/native-parity/student/learning/live-socket";
export type LiveQuizState = import("@/packages/native-parity/student/learning/live-socket").LiveQuizState<z.infer<typeof liveCodingConfigSchema>>;

export const useLiveQuizSocket = createLiveQuizSocketHook({ useCallback, useEffect, useRef, useState })<z.infer<typeof liveCodingConfigSchema>>;
