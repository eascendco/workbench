import { expect, test } from 'claude-code/testing'

import { addTouch, badge, extOf, foldersTo, paletteOf, parseStatus, PLAIN, relDir, rowsOf, search } from '../hooks/bench'

test('skin palette follows /skin, custom skins and light themes', () => {
  expect(paletteOf(undefined, undefined, false)).toBe(PLAIN)
  expect(paletteOf({ skin: 'off' }, undefined, false)).toBe(PLAIN)
  expect(paletteOf({ skin: 'dracula' }, undefined, false).read).toBe('#8be9fd')
  expect(paletteOf({ skin: 'my-nord' }, { 'my-nord': { base: 'nord', palette: { read: '#123456' } } }, false).read).toBe('#123456')
  expect(paletteOf({ skin: 'noir' }, undefined, true).fg).toBe('#151515')
  expect(paletteOf({ skin: 'gruvbox' }, undefined, true).surface).toBe('#ffffff')
})

test('git status lists changed files as absolute paths, renames once', () => {
  const out = ' M a.txt\0?? new/b.md\0R  c2.ts\0c1.ts\0'
  expect(parseStatus(out, '/repo')).toEqual(['/repo/a.txt', '/repo/new/b.md', '/repo/c2.ts'])
})

test('tree rows: folders first, hidden files filtered, expanded folders nested', () => {
  const dirs = {
    '/p': [{ name: 'b.md', dir: false, size: 1 }, { name: '.env', dir: false, size: 1 }, { name: 'src', dir: true, size: 0 }],
    '/p/src': [{ name: 'x.ts', dir: false, size: 2 }],
  }
  expect(rowsOf('/p', dirs, [], false).map(r => r.name)).toEqual(['src', 'b.md'])
  expect(rowsOf('/p', dirs, ['/p/src'], true).map(r => `${r.depth}${r.name}`)).toEqual(['0src', '1x.ts', '0.env', '0b.md'])
})

test('search, reveal and folder labels', () => {
  expect(search(['docs/plan.md', 'src/plan/index.ts', '.git/x'], 'plan', false)).toEqual(['docs/plan.md', 'src/plan/index.ts'])
  expect(foldersTo('/p/a/b/c.ts', '/p')).toEqual(['/p/a', '/p/a/b'])
  expect(relDir('/p/tests/x.js', '/p')).toBe('tests')
  expect(relDir('/p/x.js', '/p')).toBe('p')
})

test('touches: newest first, an edit outranks a later read', () => {
  let l = addTouch([], { path: '/a', kind: 'edited', active: false, at: 1 })
  l = addTouch(l, { path: '/b', kind: 'read', active: true, at: 2 })
  l = addTouch(l, { path: '/a', kind: 'read', active: false, at: 3 })
  expect(l.map(t => `${t.path}:${badge(t)}`)).toEqual(['/a:Edited', '/b:Reading'])
})

test('file type tags read the extension', () => {
  expect(extOf('/p/tests/client.test.js')).toBe('js')
  expect(extOf('/p/Makefile')).toBe('')
  expect(extOf('/p/.gitignore')).toBe('')
})
