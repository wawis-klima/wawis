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


assert.match(appSource, /const JobDetailsPanel = lazy\(\(\) => import\("\.\/components\/JobDetailsPanel\.jsx"\)\);/);
assert.match(appSource, /const \[selectedJob, setSelectedJob\] = useState\(null\);/);
assert.match(appSource, /jobsPanel=\{activeModule === "jobs" \|\| !isAdmin \? \(/);
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
assert.match(jobsColumnsSource, /const hasInstallationDate = Boolean\(job\.installation_date\);/);
assert.match(jobsColumnsSource, /<div className="desktopDateCell">\{formatDate\(job\.installation_date\)\}<\/div>/);
assert.match(jobsColumnsSource, /desktopDateMissingBadge/);
assert.match(jobsColumnsSource, /Brak ustawionej daty montażu/);
assert.match(jobsColumnsSource, /Brak daty/);
assert.doesNotMatch(jobsColumnsSource, /job\.created_at \? formatDate\(job\.created_at\) : "-"/);
assert.match(mobileLayoutSource, /job\.installation_date \? formatDate\(job\.installation_date\) : "-"/);
assert.doesNotMatch(mobileLayoutSource, /job\.created_at \? formatDate\(job\.created_at\) : "-"/);
assert.match(jobsSelectorsSource, /new Date\(b\.installation_date \|\| 0\) - new Date\(a\.installation_date \|\| 0\)/);
assert.match(jobsSelectorsSource, /new Date\(a\.installation_date \|\| 0\) - new Date\(b\.installation_date \|\| 0\)/);
assert.doesNotMatch(jobsSelectorsSource, /sortBy === 'date_desc'[\s\S]*created_at/);


console.log('Job selection smoke OK');
process.exit(0);
