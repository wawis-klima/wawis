/** One mounted panel/account owns its requests; only the newest request may commit. */
export function createAsyncScope() {
  let request = 0;
  let active = true;
  return {
    begin() { const id = ++request; return () => active && request === id; },
    invalidate() { request += 1; },
    close() { active = false; request += 1; },
    open() { active = true; request += 1; },
  };
}
