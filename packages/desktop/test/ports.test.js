import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { isPortFree, pickPort, randomFreePort } from '../src/ports.js';

const occupy = (port = 0) => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(port, '127.0.0.1', () => resolve(s));
});

test('usa a porta preferida quando ela está livre (o login do médico depende da origem)', async () => {
  const port = await randomFreePort();
  assert.equal(await pickPort(port), port);
});

test('troca de porta quando a preferida está ocupada', async () => {
  const busy = await occupy();
  const taken = busy.address().port;
  try {
    assert.equal(await isPortFree(taken), false);
    const chosen = await pickPort(taken);
    assert.notEqual(chosen, taken);
    assert.equal(await isPortFree(chosen), true);
  } finally {
    busy.close();
  }
});

test('não devolve uma porta excluída, mesmo livre', async () => {
  const port = await randomFreePort();
  const chosen = await pickPort(port, { exclude: [port] });
  assert.notEqual(chosen, port);
});

test('sem preferida, sorteia uma livre', async () => {
  assert.equal(await isPortFree(await pickPort(undefined)), true);
});
