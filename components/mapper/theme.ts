// Mapper visual tokens now come from the single canonical light palette in
// lib/theme.ts (previously duplicated a dark inline palette here). Re-exported
// so existing `import { V, panelStyle, ... } from "./theme"` call sites keep
// working unchanged.

export { V, panelStyle, btnPrimary, btnGhost, inputStyle, labelStyle, statusPillStyle } from "@/lib/theme";
