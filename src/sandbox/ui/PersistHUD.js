import { eventBus } from '../../utils/event-bus.js'
import { LOCALE_CHANGED_EVENT, t } from '../../i18n/i18n.js'
import { parseLDR } from '../parseLDR.js'

const PANEL_KEY = 'sandbox.persist'

const TITLES = {
  en: {
    save: 'Save',
    download: 'Download JSON',
    share: 'Share URL',
    copy: 'Copy',
    copied: 'Copied!',
    import: 'Import JSON',
    close: 'Close',
    tooLong: 'Build too large for URL share; download JSON instead.',
    confirmImport: 'Replace the current build with the imported file?'
  },
  zh: {
    save: '保存',
    download: '下载 JSON',
    share: '分享链接',
    copy: '复制',
    copied: '已复制',
    import: '导入 JSON',
    close: '关闭',
    tooLong: '作品过大无法用链接分享，请下载 JSON',
    confirmImport: '确定要用导入文件替换当前搭建吗？'
  }
}

/**
 * Top-right button + inline popover. Three actions: download JSON,
 * copy share URL, import file. No modal — small popover that auto-
 * closes on Escape or click-outside.
 */
export class PersistHUD {
  constructor({ persister, state, onImportComplete, parent = document.body, snapshotter = null, ldrExporter = null, ldrParser = null }) {
    this.persister = persister
    this.state = state
    this.onImportComplete = onImportComplete ?? (() => {})
    this.parent = parent
    this.snapshotter = snapshotter
    this.ldrExporter = ldrExporter
    this.ldrParser = ldrParser
    this.open = false
    this._onLocaleChanged = () => this._render()

    this.element = document.createElement('div')
    this.element.className = 'sandbox-persist'
    this.parent.appendChild(this.element)

    eventBus.on(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this._render()
  }

  _render() {
    const t2 = TITLES.en
    if (!this.open) {
      this.element.innerHTML = `
        <button type="button" class="sandbox-persist__btn" data-action="open" aria-label="${this._escape(t2.save)}">💾</button>
      `
    } else {
      this.element.innerHTML = `
        <div class="sandbox-persist__panel" role="dialog" aria-label="${this._escape(t2.save)}">
          <div class="sandbox-persist__row">
            <button type="button" class="sandbox-persist__action" data-action="download">⬇ ${this._escape(t2.download)}</button>
            <button type="button" class="sandbox-persist__action" data-action="share">🔗 ${this._escape(t2.share)}</button>
            <button type="button" class="sandbox-persist__action" data-action="snapshot">📷 ${this._escape(t2.snapshot ?? 'Snapshot')}</button>
          </div>
          <div class="sandbox-persist__row">
            <button type="button" class="sandbox-persist__action" data-action="export-ldr">📤 Export LDR</button>
          </div>
          ${this.persister.exceedsShareLimit() ? `<p class="sandbox-persist__warn">${this._escape(t2.tooLong)}</p>` : ''}
          <div class="sandbox-persist__row">
            <label class="sandbox-persist__label">
              📂 ${this._escape(t2.import)}
              <input type="file" accept="application/json,.json" data-import-file hidden />
            </label>
            <label class="sandbox-persist__label">
              🧱 LDR
              <input type="file" accept=".ldr,.mpd,text/plain" data-import-ldr hidden />
            </label>
          </div>
          <div class="sandbox-persist__status" data-status></div>
          <button type="button" class="sandbox-persist__close" data-action="close">✕ ${this._escape(t2.close)}</button>
        </div>
      `
    }

    this.element.querySelector('[data-action="open"]')?.addEventListener('click', () => this._open())
    this.element.querySelector('[data-action="close"]')?.addEventListener('click', () => this._close())
    this.element.querySelector('[data-action="download"]')?.addEventListener('click', () => {
      this.persister.exportToFile()
      this._setStatus(t2.save + ' ✓')
    })
    this.element.querySelector('[data-action="share"]')?.addEventListener('click', async () => {
      const url = this.persister.buildShareURL()
      try {
        await navigator.clipboard.writeText(url)
        this._setStatus(t2.copied)
      } catch (err) {
        console.warn('Clipboard write failed', err)
        prompt(t2.share, url)
      }
    })
    this.element.querySelector('[data-action="snapshot"]')?.addEventListener('click', async () => {
      if (!this.snapshotter) {
        this._setStatus('Snapshot unavailable')
        return
      }
      const url = await this.snapshotter.captureAndDownload()
      this._setStatus(url ? 'Snapshot ✓' : 'Snapshot failed')
    })
    this.element.querySelector('[data-action="export-ldr"]')?.addEventListener('click', () => {
      if (!this.ldrExporter) return
      const text = this.ldrExporter(this.persister.renderer.listPlacements())
      const blob = new Blob([text], { type: 'text/plain' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `build-${Date.now()}.ldr`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      this._setStatus('LDR exported ✓')
    })
    const importInput = this.element.querySelector('[data-import-file]')
    importInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const placements = await this.persister.loadFromFile(file)
        if (!confirm(t2.confirmImport)) return
        this.persister.importPlacements(placements)
        this.state.syncPlacements(this.persister.renderer.listPlacements())
        this.onImportComplete(placements)
        this._setStatus(t2.import + ' ✓')
        this._close()
      } catch (err) {
        console.error('Import failed', err)
        this._setStatus('Import failed: ' + err.message)
      }
    })

    const ldrInput = this.element.querySelector('[data-import-ldr]')
    ldrInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parser = this.ldrParser ?? parseLDR
        const result = typeof parser === 'function' && parser.length >= 1
          ? await parser(text)
          : await parser(text)
        const placements = result?.placements ?? result
        const debug = result?.debug
        if (placements.length === 0) {
          this._setStatus('No bricks found in LDR')
          return
        }
        if (!confirm(t2.confirmImport)) return
        this.persister.renderer.removeAll?.()
        for (const p of placements) {
          this.persister.renderer.addPlacement(p)
        }
        this.state.syncPlacements(this.persister.renderer.listPlacements())
        this.onImportComplete(placements)
        this._setStatus(this._formatLdrStatus(placements.length, debug))
        this._renderLdrDebug(debug)
        this._close()
      } catch (err) {
        console.error('LDR import failed', err)
        this._setStatus('LDR failed: ' + err.message)
      }
    })
  }

  _open() {
    this.open = true
    this._render()
  }

  _close() {
    this.open = false
    this._render()
  }

  _setStatus(text) {
    const node = this.element.querySelector('[data-status]')
    if (node) node.textContent = text
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  _formatLdrStatus(count, debug) {
    if (!debug) return `LDR: ${count} bricks ✓`
    const failed = debug.failed?.length ?? 0
    const skipped = debug.skipped?.length ?? 0
    return `LDR: ${count} bricks · ${failed} missing · ${skipped} skipped`
  }

  _renderLdrDebug(debug) {
    let node = this.element.querySelector('[data-ldr-debug]')
    if (!node) {
      node = document.createElement('div')
      node.className = 'sandbox-persist__debug'
      node.setAttribute('data-ldr-debug', '')
      const status = this.element.querySelector('[data-status]')
      status?.parentElement?.insertBefore(node, status.nextSibling)
    }
    if (!debug) {
      node.innerHTML = ''
      node.classList.add('is-hidden')
      return
    }
    node.classList.remove('is-hidden')
    const rows = []
    if (debug.loaded?.length) {
      rows.push(`<div class="sandbox-persist__debug-row"><b>Loaded</b> ${debug.loaded.length} file${debug.loaded.length === 1 ? '' : 's'}</div>`)
    }
    if (debug.failed?.length) {
      const items = debug.failed.slice(0, 3).map((f) => this._escape(f)).join(', ')
      const more = debug.failed.length > 3 ? `, +${debug.failed.length - 3}` : ''
      rows.push(`<div class="sandbox-persist__debug-row sandbox-persist__debug-row--warn"><b>Missing</b> ${items}${more}</div>`)
    }
    if (debug.skipped?.length) {
      const items = debug.skipped.slice(0, 3).map((f) => this._escape(f)).join(', ')
      const more = debug.skipped.length > 3 ? `, +${debug.skipped.length - 3}` : ''
      rows.push(`<div class="sandbox-persist__debug-row"><b>Skipped</b> ${items}${more}</div>`)
    }
    node.innerHTML = rows.join('')
  }

  dispose() {
    eventBus.off(LOCALE_CHANGED_EVENT, this._onLocaleChanged)
    this.element.parentElement?.removeChild(this.element)
  }
}