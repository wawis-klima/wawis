const MOBILE_JOBS_PAGINATION_V999_CSS = String.raw`
@media (max-width: 700px) {
  .jobsPaginationFooterV999 {
    padding: 10px 5px !important;
  }

  .jobsPaginationV999 {
    display: flex !important;
    flex-flow: row nowrap !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: hidden !important;
  }

  .jobsPaginationV999 .jobsPaginationBtnV999 {
    box-sizing: border-box !important;
    flex: 0 0 28px !important;
    width: 28px !important;
    min-width: 28px !important;
    max-width: 28px !important;
    height: 30px !important;
    min-height: 30px !important;
    padding: 0 !important;
    border-radius: 8px !important;
    font-size: 12px !important;
    line-height: 1 !important;
  }

  .jobsPaginationV999 .jobsPaginationDotsV999 {
    box-sizing: border-box !important;
    flex: 0 0 9px !important;
    width: 9px !important;
    min-width: 9px !important;
    max-width: 9px !important;
    padding: 0 !important;
    font-size: 12px !important;
    line-height: 1 !important;
    text-align: center !important;
  }
}
`;

export default MOBILE_JOBS_PAGINATION_V999_CSS;
