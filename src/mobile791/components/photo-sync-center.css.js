export const PHOTO_SYNC_CENTER_CSS = `
.mobileConnectionSyncRow{margin-top:8px;}
.mobileConnectionSyncButton{appearance:none;width:100%;border:0;padding:0;background:transparent;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:7px;cursor:pointer;text-align:left;}
.mobileConnectionSyncButton:focus-visible{outline:3px solid rgba(37,99,235,.28);outline-offset:3px;border-radius:14px;}
.mobileConnectionSyncButton .connectionSyncChip{position:relative;padding-right:24px;}
.mobileConnectionSyncChevron{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:15px;line-height:1;color:#64748b;}
.photoSyncCenterOverlay{align-items:flex-end;padding:0;background:rgba(15,23,42,.56);}
.photoSyncCenterModal{width:100%;max-width:620px;max-height:min(88vh,760px);overflow:hidden;border-radius:24px 24px 0 0;background:#f8fafc;box-shadow:0 -18px 55px rgba(15,23,42,.28);display:flex;flex-direction:column;}
.photoSyncCenterHandle{width:44px;height:5px;border-radius:999px;background:#cbd5e1;margin:9px auto 4px;flex:0 0 auto;}
.photoSyncCenterHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px 10px;border-bottom:1px solid #e2e8f0;background:#fff;}
.photoSyncCenterHeader h2{margin:0;color:#0f172a;font-size:20px;line-height:1.2;}
.photoSyncCenterHeader p{margin:4px 0 0;color:#64748b;font-size:12px;line-height:1.35;}
.photoSyncCenterClose{appearance:none;border:0;background:#eef2f7;color:#334155;width:36px;height:36px;border-radius:12px;font-size:24px;line-height:1;cursor:pointer;flex:0 0 auto;}
.photoSyncCenterSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 16px 8px;}
.photoSyncSummaryCard{min-width:0;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:10px;}
.photoSyncSummaryCard span{display:block;color:#64748b;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}
.photoSyncSummaryCard strong{display:block;margin-top:4px;color:#0f172a;font-size:14px;line-height:1.25;overflow-wrap:anywhere;}
.photoSyncSummaryCard.good strong{color:#15803d;}.photoSyncSummaryCard.warn strong{color:#c2410c;}.photoSyncSummaryCard.error strong{color:#b91c1c;}
.photoSyncCenterActions{display:flex;gap:8px;padding:8px 16px 12px;border-bottom:1px solid #e2e8f0;}
.photoSyncCenterPrimary,.photoSyncCenterSecondary,.photoSyncItemAction{appearance:none;border:0;border-radius:12px;min-height:40px;padding:9px 12px;font-size:13px;font-weight:800;cursor:pointer;}
.photoSyncCenterPrimary{background:#2563eb;color:#fff;flex:1 1 auto;}.photoSyncCenterSecondary{background:#e2e8f0;color:#334155;flex:0 0 auto;}
.photoSyncCenterPrimary:disabled,.photoSyncCenterSecondary:disabled,.photoSyncItemAction:disabled{opacity:.5;cursor:not-allowed;}
.photoSyncCenterList{overflow:auto;padding:10px 12px 18px;display:grid;gap:9px;-webkit-overflow-scrolling:touch;}
.photoSyncEmpty{border:1px solid #bbf7d0;border-radius:16px;background:#f0fdf4;padding:18px;text-align:center;color:#166534;}
.photoSyncEmpty strong{display:block;font-size:16px;}.photoSyncEmpty span{display:block;margin-top:4px;font-size:12px;}
.photoSyncItem{border:1px solid #dbe4ef;border-radius:16px;background:#fff;padding:11px 12px;box-shadow:0 4px 14px rgba(15,23,42,.04);}
.photoSyncItemTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.photoSyncItemTitle{min-width:0;}.photoSyncItemTitle strong{display:block;color:#0f172a;font-size:14px;line-height:1.25;}.photoSyncItemTitle span{display:block;margin-top:3px;color:#64748b;font-size:11px;line-height:1.3;overflow-wrap:anywhere;}
.photoSyncItemBadge{flex:0 0 auto;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;white-space:nowrap;background:#ffedd5;color:#9a3412;}
.photoSyncItemBadge.error{background:#fee2e2;color:#b91c1c;}.photoSyncItemBadge.uploading{background:#fef3c7;color:#92400e;}.photoSyncItemBadge.local{background:#dbeafe;color:#1d4ed8;}
.photoSyncItemError{margin-top:8px;border-radius:10px;background:#fef2f2;color:#991b1b;padding:7px 8px;font-size:11px;line-height:1.35;overflow-wrap:anywhere;}
.photoSyncItemFooter{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;}
.photoSyncItemMeta{color:#64748b;font-size:10px;line-height:1.3;}.photoSyncItemButtons{display:flex;gap:6px;flex:0 0 auto;}
.photoSyncItemAction{min-height:34px;padding:7px 9px;background:#e2e8f0;color:#334155;font-size:11px;}.photoSyncItemAction.retry{background:#2563eb;color:#fff;}.photoSyncItemAction.remove{background:#fee2e2;color:#b91c1c;}
.photoSyncCenterFootnote{padding:8px 16px 12px;color:#64748b;font-size:10px;line-height:1.35;background:#fff;border-top:1px solid #e2e8f0;}
@media (max-width:380px){.mobileConnectionSyncButton{grid-template-columns:1fr;}.photoSyncCenterSummary{grid-template-columns:1fr 1fr;}.photoSyncSummaryCard:last-child{grid-column:1/-1;}.photoSyncItemFooter{align-items:flex-end;}.photoSyncItemButtons{flex-direction:column;}}
`;
