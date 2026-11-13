import { mock } from "bun:test";

// Contract processes execute server code outside React Server Components.
mock.module("server-only", () => ({}));
