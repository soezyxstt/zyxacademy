import "server-only";
import {
  assertAdmin as assertAdminUncached,
  assertTutorOrAdmin as assertTutorOrAdminUncached,
} from "@/lib/auth/admin-guards";
import { getPeranCodes } from "@/lib/auth/request-cache";

export function assertAdmin() {
  return assertAdminUncached(getPeranCodes);
}

export function assertTutorOrAdmin() {
  return assertTutorOrAdminUncached(getPeranCodes);
}
