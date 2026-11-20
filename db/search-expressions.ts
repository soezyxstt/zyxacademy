import { sql, type SQLWrapper } from "drizzle-orm";

// Two offset pair lists cover every adjacent pair, including two-character substring searches.
export function nameSearchBigrams(name: SQLWrapper) {
 return sql`(string_to_array(regexp_replace(lower(${name}), '(..)', '\\1' || chr(31), 'g'), chr(31))
  || string_to_array(regexp_replace(substr(lower(${name}), 2), '(..)', '\\1' || chr(31), 'g'), chr(31)))`;
}
