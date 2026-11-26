import { describe, expect, test } from 'bun:test'
import { inspectModule } from './symbols'

describe('symbol source inventory', () => {
  test('records multiple declarations, page-local and nested components', () => {
    const result = inspectModule('app/example/page.tsx', `
      export default function Page() {
        function Child() { return <span /> }
        return <Child />
      }
      const Footer = () => <footer />
      function helper() { return 1 }
    `)
    expect(result.candidates.map(item => item.name)).toEqual(['Page', 'Child', 'Footer'])
    expect(result.exports).toContainEqual(expect.objectContaining({ name: 'default', local: 'Page' }))
    expect(result.candidates.every(item => item.status === 'unverified')).toBe(true)
    expect(result.sha256).toHaveLength(64)
  })

  test('retains aliases, reexports, imports and wrappers for review', () => {
    const result = inspectModule('components/barrel.tsx', `
      import { Base as Source } from './base'
      const Alias = Source
      export { Alias as Other }
      export { Button as Action } from './button'
      export * from './more'
      export const Wrapped = memo(forwardRef(Source))
      export default memo(Alias)
    `)
    expect(result.imports).toContainEqual(expect.objectContaining({ local: 'Source', imported: 'Base', specifier: './base' }))
    expect(result.candidates).toContainEqual(expect.objectContaining({ name: 'Alias', kind: 'alias', target: 'Source' }))
    expect(result.candidates).toContainEqual(expect.objectContaining({ name: 'Wrapped', kind: 'wrapper', expression: 'memo', arguments: ['forwardRef(Source)'] }))
    expect(result.candidates).toContainEqual(expect.objectContaining({ name: 'default', kind: 'wrapper' }))
    expect(result.exports).toContainEqual(expect.objectContaining({ name: 'Other', local: 'Alias', kind: 'alias' }))
    expect(result.exports).toContainEqual(expect.objectContaining({ name: 'Action', local: 'Button', specifier: './button', kind: 'reexport' }))
    expect(result.unresolved.map(item => item.kind)).toEqual(expect.arrayContaining(['alias_requires_resolution', 'reexport_requires_resolution', 'star_export_requires_resolution', 'wrapper_requires_resolution']))
  })

  test('exposes ambiguity, parse failures and modules without candidates', () => {
    const empty = inspectModule('components/utility.tsx', 'export const value = 1')
    expect(empty.candidates).toHaveLength(0)
    expect(empty.unresolved).toContainEqual(expect.objectContaining({ kind: 'no_component_candidates' }))
    const result = inspectModule('components/ambiguous.tsx', `
      export function Maybe() { return null }
      const items = [1].map(() => <div />)
      export const broken = <div>
    `)
    expect(result.unresolved.map(item => item.kind)).toEqual(expect.arrayContaining(['component_shape_unconfirmed', 'anonymous_render_function', 'parse_error']))
  })

  test('is deterministic for the same path and source', () => {
    const source = 'export const Panel = () => <section />'
    expect(inspectModule('components/panel.tsx', source)).toEqual(inspectModule('components/panel.tsx', source))
  })
})
