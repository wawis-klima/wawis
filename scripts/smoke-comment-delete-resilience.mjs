import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteJobComment, withTimeout } from '../src/modules/jobs-comments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function testTimeout() {
  const startedAt = Date.now();
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 25, 'Operacja trwa zbyt długo.'),
    (error) => error?.code === 'COMMENT_DELETE_TIMEOUT' && /trwa zbyt długo/i.test(error.message),
  );
  assert.ok(Date.now() - startedAt < 1000, 'Timeout powinien zakończyć oczekiwanie szybko.');
}

async function testIdempotentRpcResult() {
  const supabase = {
    async rpc(name, payload) {
      assert.equal(name, 'admin_delete_comment');
      assert.deepEqual(payload, { p_comment_id: 'comment-1' });
      return { data: false, error: null };
    },
  };

  const result = await deleteJobComment({ supabase, commentId: 'comment-1', timeoutMs: 100 });
  assert.equal(result.id, 'comment-1');
  assert.equal(result.alreadyDeleted, true);
}

async function testFallbackIsIdempotent() {
  const supabase = {
    async rpc() {
      return { data: null, error: { message: 'RPC unavailable' } };
    },
    from(table) {
      assert.equal(table, 'comments');
      return {
        delete() {
          return {
            eq(column, value) {
              assert.equal(column, 'id');
              assert.equal(value, 'comment-2');
              return {
                select(selection) {
                  assert.equal(selection, 'id');
                  return {
                    async maybeSingle() {
                      return { data: null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await deleteJobComment({ supabase, commentId: 'comment-2', timeoutMs: 100 });
  assert.equal(result.id, 'comment-2');
  assert.equal(result.alreadyDeleted, true);
}

function testHooksDoNotBlockModalOnRefresh() {
  for (const relativePath of [
    'src/hooks/useSelectedJobActions.js',
    'src/mobile791/hooks/useSelectedJobActions.js',
  ]) {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.match(source, /await deleteJobComment\(\{ supabase, commentId \}\);/);
    assert.match(source, /void \(async \(\) => \{/);
    assert.match(source, /reloadJobDetails\?\.\(selectedJobId, \{ force: true \}\)/);
    assert.match(source, /return true;\n\s*\} catch \(error\)/);

    const deleteStart = source.indexOf('await deleteJobComment({ supabase, commentId });');
    const backgroundStart = source.indexOf('void (async () => {', deleteStart);
    const successReturn = source.indexOf('return true;', backgroundStart);
    assert.ok(deleteStart >= 0 && backgroundStart > deleteStart && successReturn > backgroundStart);
    const blockingPart = source.slice(deleteStart, backgroundStart);
    assert.doesNotMatch(blockingPart, /await refreshAll|await reloadJobDetails/);
    const backgroundPart = source.slice(backgroundStart, successReturn);
    assert.doesNotMatch(backgroundPart, /refreshAll/, 'Usunięcie komentarza nie powinno odświeżać całej listy.');
  }
}

await testTimeout();
await testIdempotentRpcResult();
await testFallbackIsIdempotent();
testHooksDoNotBlockModalOnRefresh();

console.log('Comment delete resilience smoke OK');
