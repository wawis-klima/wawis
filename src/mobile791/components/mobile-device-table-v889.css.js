const MOBILE_DEVICE_TABLE_V889_CSS = String.raw`
@media (max-width: 700px) {
  .detailMeta > .jobDevicesTableV888.infoItem,
  .jobDevicesTableV888.infoItem,
  .jobDevicesTableV888.jobDevicesDetailsItem {
    display: block !important;
    grid-template-columns: none !important;
    grid-column: 1 / -1 !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 8px 0 !important;
    padding: 14px 8px 13px !important;
    overflow: hidden !important;
    border: 1px solid var(--wr-line-c-dbe5f0) !important;
    border-radius: 18px !important;
    background: var(--wr-bg-white) !important;
    box-shadow: 0 8px 22px rgba(15, 35, 69, .055) !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .jobDevicesTableV888Heading {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 0 10px !important;
  }

  .jobDevicesTableV888 .jobDevicesTableV888Heading > .infoLabel {
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    color: var(--wr-text-c-10203a) !important;
    font-size: 12px !important;
    font-weight: 950 !important;
    line-height: 1.15 !important;
    letter-spacing: .01em !important;
    text-transform: uppercase !important;
    white-space: nowrap !important;
  }

  .jobDevicesTableV888 .jobDevicesTableV888Heading > .infoLabel .inlineIcon {
    width: 20px !important;
    height: 20px !important;
    flex: 0 0 20px !important;
    color: var(--wr-text-c-183a68) !important;
  }

  .jobDevicesTableV888 .jobDevicesTableV888Type {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex: 0 0 auto !important;
    min-height: 28px !important;
    padding: 5px 9px !important;
    border: 1px solid var(--wr-line-c-d7e4f5) !important;
    border-radius: 999px !important;
    background: var(--wr-bg-c-f8fbff) !important;
    color: var(--wr-text-c-2458d8) !important;
    font-size: 9px !important;
    font-weight: 850 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .jobDevicesTableV888Type.multi {
    border-color: var(--wr-line-c-ddd6fe) !important;
    background: var(--wr-bg-c-faf8ff) !important;
    color: var(--wr-text-c-6d28d9) !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationList,
  .jobDevicesTableV888 .jobDeviceDocumentationUnits {
    display: grid !important;
    gap: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationList {
    gap: 10px !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationCard {
    display: grid !important;
    gap: 0 !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    border: 1px solid var(--wr-line-c-dfe7f0) !important;
    border-radius: 13px !important;
    background: var(--wr-bg-white) !important;
    box-shadow: none !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationTitle {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    min-height: 36px !important;
    padding: 8px 10px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--wr-line-c-e6edf5) !important;
    background: var(--wr-bg-c-fbfdff) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationTableHeader,
  .jobDevicesTableV888 .deviceUnitDocumentationRow {
    display: grid !important;
    grid-template-columns: minmax(88px, 1.22fr) minmax(70px, .92fr) minmax(92px, 1.15fr) 44px !important;
    align-items: center !important;
    column-gap: 7px !important;
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationTableHeader {
    min-height: 36px !important;
    padding: 7px 8px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--wr-line-c-e4ebf3) !important;
    background: var(--wr-bg-c-f7f9fc) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationTableHeader > span {
    display: block !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: var(--wr-text-c-465a78) !important;
    font-size: 6.7px !important;
    font-weight: 950 !important;
    line-height: 1.08 !important;
    letter-spacing: .012em !important;
    text-align: left !important;
    text-transform: uppercase !important;
    white-space: nowrap !important;
    overflow-wrap: normal !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationTableHeader > span:nth-child(4) {
    text-align: center !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationRow {
    min-height: 76px !important;
    padding: 9px 8px !important;
    border: 0 !important;
    border-bottom: 1px solid var(--wr-line-c-e6edf5) !important;
    border-radius: 0 !important;
    background: var(--wr-bg-white) !important;
    cursor: pointer !important;
    -webkit-tap-highlight-color: var(--wr-icon-a-2458d8-100) !important;
    touch-action: manipulation !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationRow:active {
    background: var(--wr-bg-c-f7faff) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationRow:focus-visible {
    position: relative !important;
    z-index: 1 !important;
    outline: 2px solid var(--wr-line-c-4f7ee8) !important;
    outline-offset: -2px !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationRow[aria-disabled="true"] {
    cursor: default !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationRow:last-child {
    border-bottom: 0 !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationIdentity {
    display: grid !important;
    grid-template-columns: 31px minmax(0, 1fr) !important;
    align-items: center !important;
    gap: 5px !important;
    min-width: 0 !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationCode {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 31px !important;
    height: 31px !important;
    min-width: 31px !important;
    min-height: 31px !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 8px !important;
    font-size: 9.5px !important;
    font-weight: 950 !important;
    line-height: 1 !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationCode.outdoor {
    background: var(--wr-bg-c-e8efff) !important;
    color: var(--wr-text-c-2458d8) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationCode.indoor {
    background: var(--wr-bg-c-eaf8ef) !important;
    color: var(--wr-text-c-168347) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationKind {
    display: block !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: var(--wr-text-c-1a2a43) !important;
    font-size: 8.2px !important;
    font-weight: 760 !important;
    line-height: 1.22 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationModel,
  .jobDevicesTableV888 .deviceUnitDocumentationModel > span {
    display: block !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: var(--wr-text-c-17233a) !important;
    font-size: 9.2px !important;
    font-weight: 720 !important;
    line-height: 1.25 !important;
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
    overflow-wrap: anywhere !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationStatus {
    display: grid !important;
    grid-template-columns: 14px minmax(0, 1fr) !important;
    align-items: start !important;
    gap: 3px !important;
    min-width: 0 !important;
    margin: 0 !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationStatus .inlineIcon {
    width: 13px !important;
    height: 13px !important;
    margin-top: 1px !important;
    color: var(--wr-text-c-526985) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationSync {
    display: block !important;
    min-width: 0 !important;
    margin: 0 !important;
    color: var(--wr-text-c-17233a) !important;
    font-size: 7.7px !important;
    font-weight: 760 !important;
    line-height: 1.2 !important;
    white-space: normal !important;
    overflow-wrap: anywhere !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationState {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 29px !important;
    height: 29px !important;
    min-width: 29px !important;
    min-height: 29px !important;
    justify-self: center !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 1px solid var(--wr-line-slate-300) !important;
    border-radius: 999px !important;
    background: var(--wr-bg-slate-50) !important;
    color: var(--wr-text-slate-500) !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationState > span {
    font-size: 13px !important;
    font-weight: 950 !important;
    line-height: 1 !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationState.ready {
    border-color: var(--wr-line-c-9fdfb8) !important;
    background: var(--wr-bg-c-effbf3) !important;
    color: var(--wr-text-c-168347) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationState.error {
    border-color: var(--wr-line-c-f4a7a7) !important;
    background: var(--wr-bg-c-fff1f2) !important;
    color: var(--wr-text-red-700) !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationState.uploading,
  .jobDevicesTableV888 .deviceUnitDocumentationState.local {
    border-color: var(--wr-line-c-b9cef7) !important;
    background: var(--wr-bg-blue-50) !important;
    color: var(--wr-text-c-2458d8) !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationCompletion {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    min-height: 38px !important;
    margin: 0 !important;
    padding: 9px 10px !important;
    border: 0 !important;
    border-top: 1px solid var(--wr-line-c-e6edf5) !important;
    background: var(--wr-bg-white) !important;
    color: var(--wr-text-c-168347) !important;
    font-size: 10px !important;
    font-weight: 800 !important;
    line-height: 1.2 !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationCompletion.missing {
    color: var(--wr-text-amber-700) !important;
  }
}

@media (max-width: 375px) {
  .jobDevicesTableV888 .deviceUnitDocumentationTableHeader,
  .jobDevicesTableV888 .deviceUnitDocumentationRow {
    grid-template-columns: minmax(82px, 1.16fr) minmax(65px, .90fr) minmax(84px, 1.12fr) 42px !important;
    column-gap: 5px !important;
    padding-inline: 6px !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationIdentity {
    grid-template-columns: 29px minmax(0, 1fr) !important;
    gap: 4px !important;
  }

  .jobDevicesTableV888 .deviceUnitDocumentationCode {
    width: 29px !important;
    height: 29px !important;
    min-width: 29px !important;
    min-height: 29px !important;
  }

}

  .jobDevicesTableV888 .jobDeviceDocumentationTitleActions {
    display: flex !important;
    align-items: center !important;
    justify-content: flex-end !important;
    gap: 7px !important;
    min-width: 0 !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationDeleteBtn {
    appearance: none !important;
    border: 1px solid var(--wr-line-red-200) !important;
    border-radius: 9px !important;
    background: var(--wr-bg-c-fff5f5) !important;
    color: var(--wr-text-red-700) !important;
    padding: 5px 7px !important;
    font: inherit !important;
    font-size: 9px !important;
    font-weight: 900 !important;
    line-height: 1 !important;
  }

@media (max-width: 700px) {
  .detailMeta > .jobCompletionInfoItemV999 {
    display: grid !important;
    grid-template-columns: 138px minmax(0, 1fr) !important;
    column-gap: 22px !important;
    align-items: start !important;
  }

  .jobCompletionInfoItemV999 > .infoLabel {
    min-width: 0 !important;
    white-space: nowrap !important;
  }

  .jobCompletionInfoValueV999 {
    display: grid !important;
    width: 100% !important;
    min-width: 0 !important;
    padding-left: 6px !important;
    place-items: center !important;
    box-sizing: border-box !important;
    text-align: center !important;
  }

  .jobCompletionInfoValueV999 .jobCompletionDateTime,
  .jobCompletionInfoValueV999 .jobCompletionBy {
    display: block !important;
    width: auto !important;
    max-width: 100% !important;
    margin-inline: auto !important;
    text-align: center !important;
  }

  .jobCompletionInfoValueV999 .jobCompletionBy {
    margin-top: 6px !important;
    white-space: nowrap !important;
    overflow-wrap: normal !important;
    word-break: normal !important;
    font-size: 11px !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle {
    appearance: none !important;
    display: flex !important;
    align-items: center !important;
    flex: 1 1 auto !important;
    gap: 8px !important;
    min-width: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    color: inherit !important;
    font: inherit !important;
    text-align: left !important;
    cursor: pointer !important;
    touch-action: manipulation !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle::after {
    content: "" !important;
    width: 8px !important;
    height: 8px !important;
    flex: 0 0 8px !important;
    margin: -4px 2px 0 auto !important;
    border-right: 2px solid var(--wr-line-c-526985) !important;
    border-bottom: 2px solid var(--wr-line-c-526985) !important;
    transform: rotate(45deg) !important;
    transition: transform .16s ease, margin .16s ease !important;
    box-sizing: border-box !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle[aria-expanded="true"]::after {
    margin-top: 4px !important;
    transform: rotate(225deg) !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle:focus-visible {
    outline: 2px solid var(--wr-line-c-4f7ee8) !important;
    outline-offset: 4px !important;
    border-radius: 6px !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle > strong {
    flex: 0 1 auto !important;
    min-width: 0 !important;
    white-space: nowrap !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationToggle > .jobDeviceDocumentationType {
    flex: 0 0 auto !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationCard.isCollapsed .jobDeviceDocumentationTitle {
    border-bottom: 0 !important;
  }

  .jobDevicesTableV888 .jobDeviceDocumentationBody[hidden] {
    display: none !important;
  }
}
/* WAWIS 12.84: single JW removal without widening compact mobile columns. */
 .jobDevicesTableV888 .deviceUnitDocumentationRow:has(.deviceUnitDocumentationRemoveBtn) {
  position: relative !important;
  padding-bottom: 38px !important;
}
.jobDevicesTableV888 .deviceUnitDocumentationRemoveBtn {
  position: absolute;
  right: 8px;
  bottom: 5px;
  min-width: 42px;
  padding: 5px 7px;
  border: 1px solid var(--wr-line-red-200);
  border-radius: 7px;
  background: var(--wr-bg-c-fff5f5);
  color: var(--wr-text-red-700);
  font-size: 10px;
  font-weight: 800;
  cursor: pointer;
}
.jobDevicesTableV888 .deviceUnitDocumentationRemoveBtn:disabled { opacity: .5; cursor: default; }
`;

export default MOBILE_DEVICE_TABLE_V889_CSS;
