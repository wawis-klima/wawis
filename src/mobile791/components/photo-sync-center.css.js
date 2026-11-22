export const PHOTO_SYNC_CENTER_CSS = `
.mobileConnectionSyncRow{margin-top:8px;}
.mobileConnectionSyncButton{appearance:none;width:100%;border:0;padding:0;background:transparent;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.35fr);gap:7px;cursor:pointer;text-align:left;}
.mobileConnectionSyncButton:focus-visible{outline:3px solid var(--wr-line-a-2563eb-280);outline-offset:3px;border-radius:14px;}
.mobileConnectionSyncButton .connectionSyncChip{position:relative;padding-right:24px;}
.mobileConnectionSyncChevron{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:15px;line-height:1;color:var(--wr-text-slate-500);}
.photoSyncCenterOverlay{align-items:flex-end;padding:0;background:var(--wr-bg-a-0f172a-560);}
.photoSyncCenterModal{width:100%;max-width:620px;max-height:min(88vh,760px);overflow:hidden;border-radius:24px 24px 0 0;background:var(--wr-bg-slate-50);box-shadow:0 -18px 55px rgba(15,23,42,.28);display:flex;flex-direction:column;}
.photoSyncCenterHandle{width:44px;height:5px;border-radius:999px;background:var(--wr-bg-slate-300);margin:9px auto 4px;flex:0 0 auto;}
.photoSyncCenterHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px 10px;border-bottom:1px solid var(--wr-line-slate-200);background:var(--wr-bg-white);}
.photoSyncCenterHeader h2{margin:0;color:var(--wr-text-slate-900);font-size:20px;line-height:1.2;}
.photoSyncCenterHeader p{margin:4px 0 0;color:var(--wr-text-slate-500);font-size:12px;line-height:1.35;}
.photoSyncCenterClose{appearance:none;border:0;background:var(--wr-bg-c-eef2f7);color:var(--wr-text-slate-700);width:36px;height:36px;border-radius:12px;font-size:24px;line-height:1;cursor:pointer;flex:0 0 auto;}
.photoSyncCenterSummary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:12px 16px 8px;}
.photoSyncSummaryCard{min-width:0;border:1px solid var(--wr-line-slate-200);border-radius:14px;background:var(--wr-bg-white);padding:10px;}
.photoSyncSummaryCard span{display:block;color:var(--wr-text-slate-500);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;}
.photoSyncSummaryCard strong{display:block;margin-top:4px;color:var(--wr-text-slate-900);font-size:14px;line-height:1.25;overflow-wrap:anywhere;}
.photoSyncSummaryCard.good strong{color:var(--wr-text-green-700);}.photoSyncSummaryCard.warn strong{color:var(--wr-text-orange-700);}.photoSyncSummaryCard.error strong{color:var(--wr-text-red-700);}
.photoSyncCenterActions{display:flex;gap:8px;padding:8px 16px 12px;border-bottom:1px solid var(--wr-line-slate-200);}
.photoSyncCenterPrimary,.photoSyncCenterSecondary,.photoSyncItemAction{appearance:none;border:0;border-radius:12px;min-height:40px;padding:9px 12px;font-size:13px;font-weight:800;cursor:pointer;}
.photoSyncCenterPrimary{background:var(--wr-bg-blue-600);color:var(--wr-text-white);flex:1 1 auto;}.photoSyncCenterSecondary{background:var(--wr-bg-slate-200);color:var(--wr-text-slate-700);flex:0 0 auto;}
.photoSyncCenterPrimary:disabled,.photoSyncCenterSecondary:disabled,.photoSyncItemAction:disabled{opacity:.5;cursor:not-allowed;}
.photoSyncCenterList{overflow:auto;padding:10px 12px 18px;display:grid;gap:9px;-webkit-overflow-scrolling:touch;}
.photoSyncEmpty{border:1px solid var(--wr-line-green-200);border-radius:16px;background:var(--wr-bg-green-50);padding:18px;text-align:center;color:var(--wr-text-green-800);}
.photoSyncEmpty strong{display:block;font-size:16px;}.photoSyncEmpty span{display:block;margin-top:4px;font-size:12px;}
.photoSyncItem{border:1px solid var(--wr-line-c-dbe4ef);border-radius:16px;background:var(--wr-bg-white);padding:11px 12px;box-shadow:0 4px 14px rgba(15,23,42,.04);}
.photoSyncItemTop{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;}
.photoSyncItemTitle{min-width:0;}.photoSyncItemTitle strong{display:block;color:var(--wr-text-slate-900);font-size:14px;line-height:1.25;}.photoSyncItemTitle span{display:block;margin-top:3px;color:var(--wr-text-slate-500);font-size:11px;line-height:1.3;overflow-wrap:anywhere;}
.photoSyncItemBadge{flex:0 0 auto;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;white-space:nowrap;background:var(--wr-bg-orange-100);color:var(--wr-text-orange-800);}
.photoSyncItemBadge.error{background:var(--wr-bg-red-100);color:var(--wr-text-red-700);}.photoSyncItemBadge.uploading{background:var(--wr-bg-amber-100);color:var(--wr-text-amber-800);}.photoSyncItemBadge.local{background:var(--wr-bg-blue-100);color:var(--wr-text-blue-700);}
.photoSyncItemError{margin-top:8px;border-radius:10px;background:var(--wr-bg-red-50);color:var(--wr-text-red-800);padding:7px 8px;font-size:11px;line-height:1.35;overflow-wrap:anywhere;}
.photoSyncItemFooter{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;}
.photoSyncItemMeta{color:var(--wr-text-slate-500);font-size:10px;line-height:1.3;}.photoSyncItemButtons{display:flex;gap:6px;flex:0 0 auto;}
.photoSyncItemAction{min-height:34px;padding:7px 9px;background:var(--wr-bg-slate-200);color:var(--wr-text-slate-700);font-size:11px;}.photoSyncItemAction.retry{background:var(--wr-bg-blue-600);color:var(--wr-text-white);}.photoSyncItemAction.remove{background:var(--wr-bg-red-100);color:var(--wr-text-red-700);}
.photoSyncCenterFootnote{padding:8px 16px 12px;color:var(--wr-text-slate-500);font-size:10px;line-height:1.35;background:var(--wr-bg-white);border-top:1px solid var(--wr-line-slate-200);}
@media (max-width:380px){.mobileConnectionSyncButton{grid-template-columns:1fr;}.photoSyncCenterSummary{grid-template-columns:1fr 1fr;}.photoSyncSummaryCard:last-child{grid-column:1/-1;}.photoSyncItemFooter{align-items:flex-end;}.photoSyncItemButtons{flex-direction:column;}}
`;
