const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
const jobsPanelSource = fs.readFileSync(path.join(root, 'src', 'components', 'JobsPanel.jsx'), 'utf8');
const mobileLayoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'jobs', 'MobileJobsLayout.jsx'), 'utf8');
const desktopLayoutSource = fs.readFileSync(path.join(root, 'src', 'components', 'jobs', 'DesktopJobsLayout.jsx'), 'utf8');
const jobsPaginationSource = fs.readFileSync(path.join(root, 'src', 'components', 'jobs', 'JobsPagination.jsx'), 'utf8');
const desktopRowSource = fs.readFileSync(path.join(root, 'src', 'components', 'DesktopJobsTableRow.jsx'), 'utf8');
const jobsColumnsSource = fs.readFileSync(path.join(root, 'src', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
const jobsSelectorsSource = fs.readFileSync(path.join(root, 'src', 'modules', 'jobs-selectors.js'), 'utf8');
const desktopHeaderSource = fs.readFileSync(path.join(root, 'src', 'components', 'DesktopJobsTableHeader.jsx'), 'utf8');
const mobile791LayoutSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'jobs', 'MobileJobsLayout.jsx'), 'utf8');
const mobile791ColumnsSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'desktop-jobs-table.columns.jsx'), 'utf8');
const mobile791SelectorsSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'modules', 'jobs-selectors.js'), 'utf8');
const mobile791HeaderSource = fs.readFileSync(path.join(root, 'src', 'mobile791', 'components', 'DesktopJobsTableHeader.jsx'), 'utf8');

assert.match(appSource, /const JobDetailsPanel = lazy\(\(\) => import\("\.\/components\/JobDetailsPanel\.jsx"\)\);/);
assert.match(appSource, /const \[selectedJob, setSelectedJob\] = useState\(null\);/);
assert.match(appSource, /jobsPanel=\{activeModule === "jobs" \|\| \(!isAdmin && activeModule !== "fuel"\) \? \(/);
assert.match(appSource, /selectedJob=\{selectedJob\}/);
assert.match(appSource, /const JOBS_PAGE_SIZE = 10;/);
assert.match(appSource, /const \[jobsPage, setJobsPage\] = useState\(1\);/);
assert.match(appSource, /const jobsTotalPages = Math\.max\(1, Math\.ceil\(visibleJobs\.length \/ JOBS_PAGE_SIZE\)\);/);
assert.match(appSource, /return visibleJobs\.slice\(start, start \+ JOBS_PAGE_SIZE\);/);
assert.match(appSource, /setJobsPage\(1\);/);
assert.match(appSource, /pagedVisibleJobs=\{pagedVisibleJobs\}/);
assert.match(appSource, /jobsPageSize=\{JOBS_PAGE_SIZE\}/);
assert.match(appSource, /jobsCurrentPage=\{currentJobsPage\}/);
assert.match(appSource, /jobsTotalPages=\{jobsTotalPages\}/);
assert.match(appSource, /setJobsPage=\{setJobsPage\}/);
assert.match(appSource, /setSelectedJob=\{setSelectedJob\}/);
assert.match(appSource, /detailsPanel=\{activeModule === "jobs" && selectedJob \? \(/);
assert.match(appSource, /<JobDetailsPanel/);

assert.match(jobsPanelSource, /isMobile \? <MobileJobsLayout \{\.\.\.props\} \/> : <DesktopJobsLayout \{\.\.\.props\} \/>/);
assert.match(mobileLayoutSource, /onClick=\{\(\) => setSelectedJob\(job\)\}/);
assert.match(desktopLayoutSource, /onSelect=\{setSelectedJob\}/);
assert.match(desktopLayoutSource, /desktopStatusFilter=\{desktopStatusFilter\}/);
assert.match(desktopLayoutSource, /import JobsPagination from "\.\/JobsPagination\.jsx";/);
assert.match(desktopLayoutSource, /const jobsPageRows = pagedVisibleJobs \|\| visibleJobs;/);
assert.match(desktopLayoutSource, /\{jobsPageRows\.map\(\(job\) => \(/);
assert.match(desktopLayoutSource, /<JobsPagination/);
assert.match(mobileLayoutSource, /import JobsPagination from "\.\/JobsPagination\.jsx";/);
assert.match(mobileLayoutSource, /const jobsPageRows = pagedVisibleJobs \|\| visibleJobs;/);
assert.match(mobileLayoutSource, /\{jobsPageRows\.map\(\(job\) => \(/);
assert.match(mobileLayoutSource, /<JobsPagination/);
assert.match(jobsPaginationSource, /totalRows <= pageSize \|\| totalPages <= 1/);
assert.match(jobsPaginationSource, /Paginacja zleceń montażu/);
assert.match(jobsPaginationSource, /\{pageStart\}–\{pageEnd\} z \{totalRows\} zleceń/);
assert.match(jobsPaginationSource, /Poprzednia strona zleceń/);
assert.match(jobsPaginationSource, /Następna strona zleceń/);
assert.match(desktopRowSource, /className=\{selected \? "activeRow desktopSelectedJobRow" : ""\}/);
assert.match(desktopRowSource, /aria-selected=\{selected \? "true" : "false"\}/);
assert.match(desktopRowSource, /onClick=\{\(\) => onSelect\(job\)\}/);

assert.match(jobsColumnsSource, /label: "Data montażu"/);
assert.match(jobsColumnsSource, /completedLabel: "Data zakończenia"/);
assert.match(jobsColumnsSource, /const isCompletedJob = String\(job\?\.status \|\| ''\) === 'Zakończone';/);
assert.match(jobsColumnsSource, /const dateValue = isCompletedJob \? job\?\.completed_at : job\?\.installation_date;/);
assert.match(jobsColumnsSource, /Brak ustawionej daty zakończenia/);
assert.match(jobsColumnsSource, /Brak ustawionej daty montażu/);
assert.match(jobsColumnsSource, /desktopDateMissingBadge/);
assert.match(jobsColumnsSource, /Brak daty/);
assert.doesNotMatch(jobsColumnsSource, /job\.created_at \? formatDate\(job\.created_at\) : "-"/);
assert.match(desktopHeaderSource, /desktopStatusFilter === "Zakończone"/);
assert.match(desktopHeaderSource, /column\.completedLabel \|\| column\.label/);
assert.match(mobileLayoutSource, /function getJobListDate\(job\)/);
assert.match(mobileLayoutSource, /job\?\.completed_at/);
assert.match(mobileLayoutSource, /getJobListDate\(job\) \? formatDate\(getJobListDate\(job\)\) : \(String\(job\?\.status \|\| ""\) === "Zakończone" \? "Brak daty" : "-"\)/);
assert.doesNotMatch(mobileLayoutSource, /job\.created_at \? formatDate\(job\.created_at\) : "-"/);
assert.match(jobsSelectorsSource, /function getJobSortDate\(job\)/);
assert.match(jobsSelectorsSource, /job\?\.completed_at/);
assert.match(jobsSelectorsSource, /if \(sortBy === 'date_desc'\) return getJobSortDate\(b\) - getJobSortDate\(a\);/);
assert.match(jobsSelectorsSource, /if \(sortBy === 'date_asc'\) return getJobSortDate\(a\) - getJobSortDate\(b\);/);
assert.doesNotMatch(jobsSelectorsSource, /sortBy === 'date_desc'[\s\S]*created_at/);

for (const [name, source] of [
  ['mobile791 columns', mobile791ColumnsSource],
  ['mobile791 layout', mobile791LayoutSource],
  ['mobile791 selectors', mobile791SelectorsSource],
]) {
  assert.match(source, /completed_at/, `${name}: brak obsługi daty zakończenia`);
}
assert.match(mobile791ColumnsSource, /completedLabel: "Data zakończenia"/);
assert.match(mobile791HeaderSource, /desktopStatusFilter === "Zakończone"/);
assert.match(mobile791HeaderSource, /column\.completedLabel \|\| column\.label/);
assert.match(mobile791LayoutSource, /function getJobListDate\(job\)/);
assert.match(mobile791LayoutSource, /"Zakończone" \? "Brak daty" : "-"/);
assert.match(mobile791SelectorsSource, /function getJobSortDate\(job\)/);

console.log('Job selection smoke OK');
process.exit(0);
