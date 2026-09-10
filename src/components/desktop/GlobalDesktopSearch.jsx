import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildGlobalSearchResults } from '../../modules/global-search.js';

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.8" />
      <path d="m16.2 16.2 4 4" />
    </svg>
  );
}

function ResultIcon({ type }) {
  if (type === 'contractor') return <span aria-hidden="true">K</span>;
  if (type === 'device') return <span aria-hidden="true">U</span>;
  return <span aria-hidden="true">M</span>;
}

export default function GlobalDesktopSearch({
  jobs = [],
  contractors = [],
  devices = [],
  profiles = [],
  devicesLoading = false,
  onSelectResult = () => {},
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const trimmedQuery = query.trim();
  const results = useMemo(() => buildGlobalSearchResults({
    jobs,
    contractors,
    devices,
    profiles,
    query: trimmedQuery,
    limit: 15,
  }), [contractors, devices, jobs, profiles, trimmedQuery]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmedQuery]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleShortcut);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleShortcut);
    };
  }, []);

  function selectResult(result) {
    if (!result) return;
    onSelectResult(result);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) setOpen(true);
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(results[activeIndex] || results[0]);
    }
  }

  const showResults = open && trimmedQuery.length > 0;

  return (
    <div className="globalDesktopSearch" ref={rootRef}>
      <div className={`globalDesktopSearchField ${open ? 'isOpen' : ''}`}>
        <span className="globalDesktopSearchIcon"><SearchIcon /></span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Szukaj klienta, telefonu, adresu, modelu, numeru seryjnego, zlecenia lub montera"
          aria-label="Globalne wyszukiwanie"
          aria-expanded={showResults}
          aria-controls="global-desktop-search-results"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <kbd>Ctrl K</kbd>
      </div>

      {showResults ? (
        <div className="globalDesktopSearchDropdown" id="global-desktop-search-results" role="listbox">
          <div className="globalDesktopSearchDropdownHeader">
            <strong>Wyniki wyszukiwania</strong>
            <span>{results.length}{devicesLoading ? ' • urządzenia są jeszcze odświeżane' : ''}</span>
          </div>

          {results.length ? (
            <div className="globalDesktopSearchResults">
              {results.map((result, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  key={result.key}
                  className={`globalDesktopSearchResult ${index === activeIndex ? 'active' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(result)}
                >
                  <span className={`globalDesktopSearchResultIcon type-${result.type}`}><ResultIcon type={result.type} /></span>
                  <span className="globalDesktopSearchResultCopy">
                    <span className="globalDesktopSearchResultTitleRow">
                      <strong>{result.title}</strong>
                      <span className={`globalDesktopSearchBadge type-${result.type}`}>{result.badge}</span>
                    </span>
                    <span>{result.subtitle}</span>
                    {result.meta ? <small>{result.meta}</small> : null}
                  </span>
                  <span className="globalDesktopSearchArrow" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="globalDesktopSearchEmpty">
              <strong>Brak pasujących wyników</strong>
              <span>Sprawdź pisownię albo wpisz fragment telefonu, adresu, modelu lub numeru seryjnego.</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
