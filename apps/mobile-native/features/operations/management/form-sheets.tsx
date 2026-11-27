import { useState } from "react";
import { View } from "react-native";
import type { FormDefinition, FormSheetConflict, FormSheetReceipt } from "../../../../../packages/native-parity/operations/management-contract";
import { validFormSheetUrl } from "../../../../../packages/native-parity/operations/form-sheets";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Action, Confirm, Copy, Feedback, styles, useAction, useManagement } from "./ui";

const conflictLabels: Record<FormSheetConflict, string> = {
  block_modified: "Isi yang pernah diekspor telah disunting.",
  manual_rows: "Ada baris tambahan.",
  manual_columns: "Ada kolom tambahan.",
};

export function FormSheets({ form }: { form: FormDefinition }) {
  const { openExternal } = useManagement();
  const { canInteract } = useProtectedInteraction();
  const action = useAction();
  const [result, setResult] = useState<Extract<FormSheetReceipt, { kind: "saved" }> | null>(null);
  const [confirmation, setConfirmation] = useState<Extract<FormSheetReceipt, { kind: "confirm" }> | null>(null);
  const url = validFormSheetUrl(result?.url ?? form.spreadsheetUrl);

  function run(confirmedRevision?: string) {
    if (!canInteract() || action.busy || !form.totalResponses) return;
    void action.run({ type: "form.export", id: form.id, ...(confirmedRevision ? { confirmedRevision } : {}) }, receipt => {
      const sheet = receipt.formSheet;
      if (sheet?.kind === "saved") { setResult(sheet); setConfirmation(null); }
      if (sheet?.kind === "confirm") setConfirmation(sheet);
    }, receipt => receipt.formSheet?.kind === "saved" ? receipt.formSheet.created ? "Spreadsheet dibuat." : "Spreadsheet diperbarui." : "");
  }

  return <>
    <View style={styles.row}>
      {url && openExternal ? <Action onPress={() => { if (canInteract()) void openExternal(url); }}>Buka Google Sheets</Action> : null}
      <Action onPress={() => run()} disabled={!form.totalResponses} busy={action.busy} testID="admin-form-export-sheet">
        {url ? "Perbarui spreadsheet" : "Ekspor ke Google Sheets"}
      </Action>
    </View>
    <Feedback {...action} />
    {result?.sharingIncomplete ? <Copy muted>Spreadsheet tersimpan. Akses editor belum dibagikan ke semua admin.</Copy> : null}
    <Confirm value={confirmation ? {
      title: "Timpa perubahan spreadsheet?", label: "Timpa dan ekspor",
      description: confirmation.conflicts.map(code => conflictLabels[code]).join(" "),
      run: () => run(confirmation.revision),
    } : null} onClose={() => setConfirmation(null)} />
  </>;
}
