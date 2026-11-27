import { createContext } from "react";
import type { AcademicTransport } from "../client";

export const TextDocumentTransport = createContext<AcademicTransport | null>(null);
