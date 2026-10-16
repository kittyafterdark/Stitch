import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'

const root = fileURLToPath(new URL('../', import.meta.url))
mkdirSync(new URL('../.cache', import.meta.url), { recursive: true })
mkdirSync(new URL('../test-results', import.meta.url), { recursive: true })
const built = spawnSync('bun', ['build', 'tests/browser/fixture.ts', '--target=browser', '--outfile=.cache/fixture.js'], { cwd: root, encoding: 'utf8', windowsHide: true })
assert.equal(built.status, 0, built.stderr)
const server = createServer((request, response) => {
  const script = request.url === '/fixture.js'
  response.writeHead(200, { 'Content-Type': script ? 'text/javascript' : 'text/html' })
  response.end(readFileSync(new URL(script ? '../.cache/fixture.js' : '../tests/browser/fixture.html', import.meta.url)))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(`Stitch fixture: ${url}`)
  await new Promise(() => {})
}

try {
  for (const name of (process.env.STITCH_BROWSERS || 'chromium,webkit').split(',')) {
    const browser = await ({ chromium, webkit }[name]).launch()
    try {
      for (const width of [1280, 390, 320]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width < 680, isMobile: width < 680 })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(url)
        await page.getByRole('button', { name: 'Stitch swipes', exact: true }).click()
        const source = page.getByRole('region', { name: 'Swipe 1 selectable source' })
        const paragraphs = source.locator('p')
        assert.equal(await paragraphs.first().evaluate(e => getComputedStyle(e).userSelect || getComputedStyle(e).webkitUserSelect), 'text')
        // Browser Range + selectionchange tests source mapping and toolbar focus;
        // real mouse selection below also catches inherited user-select rules.
        await paragraphs.first().evaluate(e => {
          const range = document.createRange()
          range.setStart(e.firstChild, 6)
          range.setEnd(e.firstChild, 15)
          const selection = window.getSelection()
          selection.removeAllRanges()
          selection.addRange(range)
          document.dispatchEvent(new Event('selectionchange'))
        })
        await page.getByRole('button', { name: 'Add selection', exact: true }).click()
        assert.equal(await source.locator('mark').innerText(), 'paragraph')
        await source.getByRole('button', { name: 'Bravo paragraph.', exact: true }).press('Enter')
        await source.getByRole('button', { name: 'Charlie paragraph.', exact: true }).click()
        await page.getByRole('button', { name: 'Preview HTML island 4 from Swipe 1', exact: true }).click()
        assert.equal(await page.locator('iframe').getAttribute('sandbox'), '')
        assert.ok((await page.locator('iframe').getAttribute('srcdoc')).includes("default-src 'none'"))
        await page.frameLocator('iframe').getByRole('heading', { name: 'Island preview' }).waitFor()
        await page.getByRole('button', { name: 'Close preview', exact: true }).click()
        assert.equal(await page.getByRole('button', { name: 'Preview HTML island 4 from Swipe 1', exact: true }).evaluate(e => e === document.activeElement), true)
        await page.getByRole('button', { name: 'Preview CARD island 5 from Swipe 1', exact: true }).click()
        await page.getByText('Stored source preview.', { exact: false }).waitFor()
        await page.getByRole('button', { name: 'Close preview', exact: true }).click()
        if (width < 680) {
          const centers = await page.locator('.stitch-step-dot').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return r.x + r.width / 2 }))
          const shell = await page.locator('.stitch-stepper').boundingBox()
          assert.ok(Math.abs(centers[1] - (shell.x + shell.width / 2)) < 1, 'Mobile stepper centered')
          assert.ok((await page.getByRole('button', { name: 'Close Stitch' }).boundingBox()).y >= 47, 'Close stays below notch safe top')
        }
        await page.getByRole('button', { name: 'Arrange pieces', exact: true }).click()
        await page.getByRole('button', { name: 'Read piece 1', exact: true }).click()
        assert.equal(await page.getByRole('button', { name: 'Collapse piece 1', exact: true }).getAttribute('aria-expanded'), 'true')
        await page.getByRole('button', { name: 'Move piece 1 down', exact: true }).click()
        assert.equal(await page.locator('.stitch-piece-preview').first().innerText(), 'Bravo paragraph.')
        await page.getByRole('button', { name: 'Reorder piece 2; use arrow keys to move', exact: true }).press('ArrowUp')
        assert.equal(await page.locator('.stitch-piece-preview').first().innerText(), 'paragraph')
        if (width < 680 && name === 'chromium') {
          const handle = await page.getByRole('button', { name: 'Reorder piece 1; use arrow keys to move', exact: true }).boundingBox()
          const target = await page.locator('.stitch-piece').nth(2).boundingBox()
          const cdp = await page.context().newCDPSession(page)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }] })
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: handle.x + handle.width / 2, y: target.y + target.height / 2 }] })
          assert.equal(await page.locator('.is-drop-target').count(), 1)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          assert.equal(await page.locator('.stitch-piece-preview').last().innerText(), 'paragraph')
          await cdp.detach()
        }
        if (width === 1280) {
          await page.locator('.stitch-piece').first().dragTo(page.locator('.stitch-piece').last())
          assert.equal(await page.locator('.stitch-piece-preview').last().innerText(), 'paragraph')
        }
        assert.equal(await page.locator('.stitch-piece').evaluateAll(nodes => nodes.some(n => n.scrollWidth > n.clientWidth)), false, 'Cards fit narrow screens')
        await page.screenshot({ path: fileURLToPath(new URL(`../test-results/${name}-${width}-arrange.png`, import.meta.url)) })
        await page.getByRole('button', { name: 'Edit stitch', exact: true }).click()
        const editor = page.getByRole('textbox', { name: 'Editable stitched swipe' })
        await editor.fill('Local draft')
        await page.getByRole('button', { name: 'Open expanded editor', exact: true }).click()
        await page.getByRole('textbox', { name: 'Native editor text' }).fill('Expanded draft')
        await page.getByRole('button', { name: 'Apply native edits', exact: true }).click()
        assert.equal(await editor.inputValue(), 'Expanded draft')
        await page.getByRole('button', { name: 'Open expanded editor', exact: true }).click()
        await page.getByRole('textbox', { name: 'Native editor text' }).fill('Cancelled draft')
        await page.getByRole('textbox', { name: 'Native editor text' }).press('Escape')
        assert.equal(await editor.inputValue(), 'Expanded draft')
        await editor.fill('')
        assert.equal(await page.getByRole('button', { name: 'Save stitched swipe', exact: true }).isDisabled(), true)
        await page.evaluate(() => window.fixture.navigate())
        assert.equal(await page.getByRole('dialog').count(), 0)
        await page.evaluate(() => window.fixture.remount())
        await page.getByRole('button', { name: 'Stitch swipes', exact: true }).click()
        assert.equal(await page.locator('.stitch-thread-empty').count(), 1)
        // Real mouse drag catches a host rule making paragraph controls
        // unselectable. It must select text without toggling the whole block.
        const bounds = await page.locator('.stitch-source-block').first().boundingBox()
        await page.mouse.move(bounds.x + 10, bounds.y + 17)
        await page.mouse.down()
        await page.mouse.move(bounds.x + Math.min(110, bounds.width - 12), bounds.y + 17, { steps: 12 })
        await page.mouse.up()
        assert.ok(await page.evaluate(() => window.getSelection().toString().length > 0), 'Mouse drag selects paragraph text')
        assert.equal(await page.locator('.stitch-thread-empty').count(), 1, 'Selection does not toggle a paragraph')
        await page.getByRole('button', { name: 'Add selection', exact: true }).click()
        assert.equal(await page.locator('.stitch-chip').count(), 1)
        await page.evaluate(() => window.fixture.unload())
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.equal(await page.evaluate(() => window.fixture.requests.some(r => r.type === 'stitch_save')), false)
        assert.deepEqual(errors, [])
        await page.close()
        console.log(`${name} ${width}px: selection, previews, ordering, layout, editor contract, navigation and teardown passed`)
      }
    } finally { await browser.close() }
  }
} finally { server.close() }
