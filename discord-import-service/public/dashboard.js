const statusLabels = {
  queued: ['等待 Worker', 'active'],
  scanning: ['扫描中', 'active'],
  ready: ['等待应用', 'active'],
  empty: ['今日无候选', 'success'],
  delivered: ['列表已同步', 'success'],
  failed: ['任务失败', 'danger'],
}

const workflowLabels = {
  'waiting-selection': ['等待勾选', 'active'],
  importing: ['发布中', 'active'],
  complete: ['发布完成', 'success'],
  blocked: ['发布受阻', 'danger'],
}

const workerLabels = {
  offline: 'Worker 未运行',
  starting: 'Worker 正在启动',
  idle: 'Worker 在线',
  scanning: 'Worker 正在扫描',
  applying: 'Worker 正在应用清单',
  'waiting-selection': 'Worker 等待勾选',
  importing: 'Worker 正在发布',
  blocked: 'Worker 需要处理',
}

const statusOrder = ['queued', 'scanning', 'ready', 'delivered']
const importStatusLabels = {
  pending: ['等待 Worker', 'active'],
  importing: ['发布中', 'active'],
  imported: ['已发布', 'success'],
  failed: ['失败', 'danger'],
  skipped: ['已跳过', ''],
}
const elements = Object.fromEntries([
  'worker-dot', 'worker-label', 'snapshot-date', 'snapshot-window', 'trigger-button', 'limit-input',
  'discord-links', 'aibar-link', 'action-message', 'job-status', 'job-id', 'card-count', 'source-count',
  'target-count', 'pass-count', 'batch-count', 'worker-message', 'progress-list',
  'worker-progress', 'worker-progress-fill', 'worker-progress-text',
  'jobs-body', 'last-updated', 'cards-body', 'candidate-summary', 'tag-filters',
  'import-selected-button', 'select-filtered-button', 'clear-selection-button', 'import-message',
].map(id => [id, document.getElementById(id)]))
const selectedCardIds = new Set()
const activeTagFilters = new Set()
let latestSnapshot = null
let renderedJobId = ''

function formatDate(value, options = {}) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  }).format(new Date(value))
}

function statusMeta(job) {
  if (job && job.sourceScopeComplete === false) return [`旧任务·仅 ${job.sourceCount} 栏目`, 'danger']
  if (job?.workflowStatus === 'waiting-selection' && job.importRequestedCount) return ['等待 Worker', 'active']
  if (job?.workflowStatus) return workflowLabels[job.workflowStatus] || [job.workflowStatus, '']
  return statusLabels[job?.status] || [job?.status || '未知', '']
}

function launcherBusy() {
  return Boolean(latestSnapshot?.launcher?.busy)
}

// blocked 或 Worker 中途退出后，用已持久化的请求恢复发布；failed 项会被重试。
function importResumable(job) {
  return Boolean(job && job.status === 'delivered' && job.importRequestedCount > 0
    && job.workflowStatus && job.workflowStatus !== 'complete')
}

function updateImportButton(job, selectableCount) {
  const button = elements['import-selected-button']
  if (importResumable(job)) {
    const remaining = job.importRetryableCount
      ?? Math.max(0, job.importRequestedCount - job.importTerminalCount)
    button.dataset.mode = 'resume'
    button.disabled = launcherBusy()
    // remaining 为 0 但 workflow 未 complete：Worker 在收尾上报前退出，仍需重启确认。
    button.textContent = launcherBusy()
      ? '发布运行中'
      : remaining ? `继续发布（剩余 ${remaining}）` : '继续发布（收尾确认）'
  } else {
    const locked = !job || job.status !== 'delivered' || job.importRequestedCount > 0
    button.dataset.mode = 'select'
    button.disabled = locked || launcherBusy() || selectedCardIds.size === 0
    button.textContent = job?.workflowStatus === 'complete'
      ? '发布完成'
      : job?.importRequestedCount
        ? `已提交 ${job.importRequestedCount} 项`
        : `发布已选${selectedCardIds.size ? `（${selectedCardIds.size}）` : ''}`
  }
  const filteredNote = activeTagFilters.size ? `已筛选 ${[...activeTagFilters].join('、')} · ` : ''
  elements['candidate-summary'].textContent = !job
    ? '等待同步列表'
    : job.sourceScopeComplete === false
      ? `旧任务仅覆盖 ${job.sourceCount} 个栏目，请重新开始同步`
    : job.importRequestedCount
      ? `${job.importTerminalCount} / ${job.importRequestedCount} 项已处理`
      : selectableCount
        ? `${filteredNote}${selectableCount} 项可发布，已选 ${selectedCardIds.size}`
        : `${filteredNote}暂无可发布角色卡`
  const batchLocked = !job || job.status !== 'delivered' || job.importRequestedCount > 0 || launcherBusy()
  elements['select-filtered-button'].disabled = batchLocked || !selectableCount
  elements['clear-selection-button'].disabled = batchLocked || selectedCardIds.size === 0
}

function renderTagFilters(cards) {
  const container = elements['tag-filters']
  container.replaceChildren()
  const counts = new Map()
  for (const card of cards) {
    for (const tag of card.tags) counts.set(tag, (counts.get(tag) || 0) + 1)
  }
  if (!counts.size) {
    container.hidden = true
    return
  }
  container.hidden = false
  const all = document.createElement('button')
  all.type = 'button'
  all.className = `tag-chip${activeTagFilters.size ? '' : ' tag-chip--active'}`
  all.textContent = `全部 ${cards.length}`
  all.addEventListener('click', () => {
    activeTagFilters.clear()
    rerenderCandidates()
  })
  container.append(all)
  const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  for (const [tag, count] of sorted.slice(0, 40)) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = `tag-chip${activeTagFilters.has(tag) ? ' tag-chip--active' : ''}`
    chip.dataset.tag = tag
    chip.append(document.createTextNode(tag))
    const small = document.createElement('small')
    small.textContent = String(count)
    chip.append(small)
    chip.addEventListener('click', () => {
      if (activeTagFilters.has(tag)) activeTagFilters.delete(tag)
      else activeTagFilters.add(tag)
      rerenderCandidates()
    })
    container.append(chip)
  }
}

function visibleCardsOf(cards) {
  if (!activeTagFilters.size) return cards
  return cards.filter(card => card.tags.some(tag => activeTagFilters.has(tag)))
}

function rerenderCandidates() {
  if (!latestSnapshot) return
  renderCards(latestSnapshot.cards || [], latestSnapshot.latestJob)
}

function renderCards(cards, job) {
  elements['cards-body'].replaceChildren()
  if (renderedJobId !== (job?.id || '')) {
    selectedCardIds.clear()
    activeTagFilters.clear()
    renderedJobId = job?.id || ''
  }
  const availableIds = new Set(cards.map(card => card.id))
  for (const cardId of selectedCardIds) {
    if (!availableIds.has(cardId)) selectedCardIds.delete(cardId)
  }
  renderTagFilters(cards)
  cards = visibleCardsOf(cards)
  if (!cards.length) {
    const row = document.createElement('tr')
    const empty = cell(
      activeTagFilters.size
        ? '当前标签筛选下没有角色卡'
        : job?.sourceScopeComplete === false
          ? '旧任务未覆盖三个栏目，请点击开始同步'
          : job?.status === 'empty' ? '没有候选角色卡' : '等待同步列表',
      'empty-row',
    )
    empty.colSpan = 6
    row.append(empty)
    elements['cards-body'].append(row)
    updateImportButton(job, 0)
    return
  }
  const locked = job?.status !== 'delivered' || job.importRequestedCount > 0
  let selectableCount = 0
  for (const card of cards) {
    const row = document.createElement('tr')
    const selectCell = document.createElement('td')
    selectCell.className = 'select-column'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.dataset.cardId = card.id
    checkbox.setAttribute('aria-label', `选择 ${card.title}`)
    checkbox.checked = selectedCardIds.has(card.id)
    checkbox.disabled = !card.selectable || locked
    if (card.selectable) selectableCount += 1
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedCardIds.add(card.id)
      else selectedCardIds.delete(card.id)
      updateImportButton(job, selectableCount)
    })
    selectCell.append(checkbox)

    const titleCell = document.createElement('td')
    const source = document.createElement('a')
    source.href = card.sourceUrl
    source.target = '_blank'
    source.rel = 'noreferrer'
    source.className = 'card-title'
    source.textContent = card.title
    const author = document.createElement('small')
    author.textContent = card.authorName || '未知作者'
    titleCell.append(source, author)

    const [importLabel, importTone] = importStatusLabels[card.importStatus] || [
      card.selectable ? '待选择' : '无可用卡体',
      card.selectable ? '' : 'danger',
    ]
    const resultCell = cell(card.importMessage || importLabel, 'table-status', importTone)
    row.append(
      selectCell,
      titleCell,
      cell(card.sourceName || '未知栏目', 'source-cell'),
      cell(card.tags.length ? card.tags.join('、') : '无标签', 'tag-cell'),
      cell(`${card.reactionCount} 回应 · ${card.replyCount} 回复`, 'heat-cell'),
      resultCell,
    )
    elements['cards-body'].append(row)
  }
  updateImportButton(job, selectableCount)
}

function renderProgress(job) {
  const effective = job?.status || ''
  const currentIndex = job?.workflowStatus === 'complete' ? statusOrder.length : statusOrder.indexOf(effective)
  for (const [index, item] of [...elements['progress-list'].children].entries()) {
    item.classList.toggle('is-complete', currentIndex > index || effective === 'empty')
    item.classList.toggle(
      'is-current',
      currentIndex === index && !['empty', 'failed'].includes(effective) && job?.workflowStatus !== 'complete',
    )
  }
}

function cell(text, className = '', tone = '') {
  const item = document.createElement('td')
  item.textContent = text
  if (className) item.className = className
  if (tone) item.dataset.tone = tone
  return item
}

function renderJobs(jobs) {
  elements['jobs-body'].replaceChildren()
  if (!jobs.length) {
    const row = document.createElement('tr')
    const empty = cell('尚无手动同步任务', 'empty-row')
    empty.colSpan = 5
    row.append(empty)
    elements['jobs-body'].append(row)
    return
  }
  for (const job of jobs) {
    const [label, tone] = statusMeta(job)
    const row = document.createElement('tr')
    row.append(
      cell(formatDate(job.createdAt)),
      cell(label, 'table-status', tone),
      cell(String(job.cardCount)),
      cell(`${job.passCount} / ${job.passTargetCount}`),
      cell(`${job.deliveredBatches} / ${job.batchCount}`),
    )
    elements['jobs-body'].append(row)
  }
}

function renderSourceLinks(sources) {
  elements['discord-links'].replaceChildren()
  const label = document.createElement('span')
  label.textContent = '扫描栏目'
  elements['discord-links'].append(label)
  for (const source of sources) {
    const link = document.createElement('a')
    link.href = source.discordUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.className = 'text-link'
    link.textContent = source.channelName
    elements['discord-links'].append(link)
  }
}

function render(snapshot) {
  latestSnapshot = snapshot
  const job = snapshot.latestJob
  const worker = snapshot.worker
  const launcher = snapshot.launcher || { busy: false, phase: '' }
  // 一次性 Worker 只在阶段切换时上报心跳，进程是否在跑以启动器为准。
  const workerBusy = launcher.busy || (worker.online && !['idle'].includes(worker.state))
  const [statusLabel, statusTone] = statusMeta(job)
  const day = job?.localDate || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(snapshot.now))

  elements['worker-dot'].className = `status-dot ${worker.online ? (worker.state === 'idle' ? 'status-dot--online' : 'status-dot--busy') : (launcher.busy ? 'status-dot--busy' : '')}`
  elements['worker-label'].textContent = worker.online
    ? (workerLabels[worker.state] || 'Worker 在线')
    : launcher.busy ? 'Worker 运行中' : workerLabels.offline
  const showJobError = !worker.message && !job?.workflowMessage && Boolean(job?.error)
  elements['worker-message'].textContent = worker.message || job?.workflowMessage || job?.error
    || (worker.online ? workerLabels[worker.state] : '等待 Worker')
  elements['worker-message'].className = showJobError ? 'action-message--error' : 'muted'
  elements['trigger-button'].disabled = workerBusy
  elements['trigger-button'].textContent = workerBusy
    ? (launcher.phase === 'import' ? '发布运行中' : '同步运行中')
    : '开始同步'
  elements['snapshot-date'].textContent = job?.limit
    ? `${day} · 热度 Top ${job.limit}`
    : `${day} 热度榜`
  elements['snapshot-window'].textContent = job
    ? (job.limit
      ? `全栏目最近活跃 · 目标 ${job.limit} 张 · ${formatDate(job.createdAt)} 触发`
      : `旧快照任务 · ${formatDate(job.createdAt)} 触发`)
    : '全栏目最近活跃 · 等待手动触发'
  elements['job-status'].textContent = job ? statusLabel : '尚未创建'
  elements['job-status'].dataset.tone = job ? statusTone : ''
  elements['job-id'].textContent = job?.id || '-'
  elements['card-count'].textContent = String(job?.cardCount || 0)
  elements['source-count'].textContent = `${job?.scannedSourceCount || 0} / ${job?.sourceTargetCount || snapshot.sources.length}`
  elements['target-count'].textContent = String(job?.limit || Number(elements['limit-input'].value) || 100)
  elements['pass-count'].textContent = String(job?.passCount || 0)
  elements['batch-count'].textContent = String(job?.batchCount || 0)
  const progress = worker.online ? worker.progress : null
  if (progress) {
    elements['worker-progress'].hidden = false
    const percent = Math.max(0, Math.min(100, Math.round((progress.done / progress.total) * 100)))
    elements['worker-progress-fill'].style.width = `${percent}%`
    elements['worker-progress-text'].textContent = `${progress.label ? `${progress.label} · ` : ''}${progress.done} / ${progress.total}`
  } else {
    elements['worker-progress'].hidden = true
    elements['worker-progress-fill'].style.width = '0'
    elements['worker-progress-text'].textContent = ''
  }
  renderSourceLinks(snapshot.sources || [])
  elements['aibar-link'].href = snapshot.aibarUrl
  elements['last-updated'].textContent = `更新于 ${formatDate(snapshot.now)}`
  renderProgress(job)
  renderCards(snapshot.cards || [], job)
  renderJobs(snapshot.jobs || [])
}

async function request(path, options) {
  const response = await fetch(path, options)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
  return payload
}

function connectDashboardEvents() {
  const events = new EventSource('/api/v1/dashboard/events')
  events.addEventListener('snapshot', (event) => {
    try {
      render(JSON.parse(event.data))
    } catch {
      elements['worker-label'].textContent = '控制台状态无效'
    }
  })
  events.addEventListener('error', () => {
    elements['worker-label'].textContent = '控制台连接中断，正在重连'
  })
}

elements['trigger-button'].addEventListener('click', async () => {
  elements['trigger-button'].disabled = true
  elements['trigger-button'].textContent = '正在创建'
  elements['action-message'].className = 'action-message'
  elements['action-message'].textContent = ''
  try {
    const limit = Number(elements['limit-input'].value)
    if (!Number.isInteger(limit) || limit < 10 || limit > 300) {
      throw new Error('目标数量必须是 10 到 300 之间的整数')
    }
    const job = await request('/api/v1/dashboard/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    })
    elements['action-message'].textContent = `任务已创建，Worker 已启动：${job.id}`
  } catch (error) {
    elements['action-message'].textContent = error.message
    elements['action-message'].className = 'action-message action-message--error'
  } finally {
    const busy = launcherBusy() || (latestSnapshot?.worker?.online && latestSnapshot.worker.state !== 'idle')
    elements['trigger-button'].disabled = busy
    elements['trigger-button'].textContent = busy ? '同步运行中' : '开始同步'
  }
})

elements['import-selected-button'].addEventListener('click', async () => {
  const job = latestSnapshot?.latestJob
  const resume = elements['import-selected-button'].dataset.mode === 'resume'
  if (!job || (!resume && !selectedCardIds.size)) return
  elements['import-selected-button'].disabled = true
  elements['import-message'].className = 'action-message'
  elements['import-message'].textContent = ''
  try {
    if (resume) {
      await request(`/api/v1/dashboard/jobs/${encodeURIComponent(job.id)}/import-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      elements['import-message'].textContent = '已请求继续发布，Worker 已启动'
    } else {
      const cardOrder = (latestSnapshot.cards || []).map(card => card.id)
      const cardIds = cardOrder.filter(cardId => selectedCardIds.has(cardId))
      await request(`/api/v1/dashboard/jobs/${encodeURIComponent(job.id)}/import-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds }),
      })
      elements['import-message'].textContent = `已提交 ${cardIds.length} 项，发布 Worker 已启动`
    }
  } catch (error) {
    elements['import-message'].textContent = error.message
    elements['import-message'].className = 'action-message action-message--error'
    elements['import-selected-button'].disabled = false
  }
})

elements['select-filtered-button'].addEventListener('click', () => {
  if (!latestSnapshot) return
  const cards = visibleCardsOf(latestSnapshot.cards || [])
  for (const card of cards) {
    if (card.selectable) selectedCardIds.add(card.id)
  }
  rerenderCandidates()
})

elements['clear-selection-button'].addEventListener('click', () => {
  selectedCardIds.clear()
  rerenderCandidates()
})

connectDashboardEvents()
