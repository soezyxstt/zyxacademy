import { createContext } from "react";
import type { TutorSupportClient } from "../../../../../packages/academic/tutor-support";

export const AdminDiscussionContext = createContext<TutorSupportClient | null>(null);
