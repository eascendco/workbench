import { expect, test } from 'claude-code/testing'

import { themeFor } from '../hooks/logic'

test('macOS appearance picks light or dark and keeps the theme variant', () => {
  expect(themeFor('light', 'Dark\n')).toBe('dark')
  expect(themeFor('dark', '')).toBe('light')
  expect(themeFor(undefined, '')).toBe('light')
  expect(themeFor('dark-daltonized', '')).toBe('light-daltonized')
  expect(themeFor('light-ansi', 'Dark\n')).toBe('dark-ansi')
})
