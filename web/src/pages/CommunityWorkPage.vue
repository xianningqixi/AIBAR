<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useCharactersStore } from '@/stores/characters'
import { useModsStore } from '@/stores/mods'
import { useUiStore } from '@/stores/ui'
import { fetchCharacter } from '@/api/characters'
import { invalidateSettingsCache } from '@/api/settings'
import {
  addCommunityComment,
  completeCommunityLaunch,
  deleteCommunityComment,
  deleteCommunityWork,
  getCommunityWork,
  launchCommunityWork,
  rateCommunityWork,
  setCommunityFavorite,
  setCommunityWorkStatus,
  type CommunityLaunchResult,
  type CommunityWorkDetail,
} from '@/api/community'
import { createChatFromCharacter, createChatFromStory } from '@/lib/storyStart'
import CharacterStartDialog from '@/components/chat/CharacterStartDialog.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { getApiErrorMessage } from '@/api/client'
import type { Character, CharacterStartSelection } from '@/api/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const chars = useCharactersStore()
const mods = useModsStore()
const ui = useUiStore()
const work = ref<CommunityWorkDetail | null>(null)
const loading = ref(false)
const starting = ref(false)
const comment = ref('')
const commenting = ref(false)
const managing = ref(false)
const startDialogOpen = ref(false)
const pendingCharacterLaunch = ref<{
  accountHandle: string
  character: Character
  launch: CommunityLaunchResult
} | null>(null)

const workId = computed(() => decodeURIComponent(String(route.params.id || '')))
const isOwner = computed(() => work.value?.authorHandle === session.user?.handle)
const isMod = computed(() => work.value?.type === 'mod')

const positionLabels = {
  system_prepend: '系统前缀',
  system_append: '系统后缀',
  user_suffix: '用户后缀',
} as const

function typeLabel(type: CommunityWorkDetail['type']): string {
  if (type === 'story') return '故事作品'
  if (type === 'mod') return '提示词'
  return '角色卡'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

async function load() {
  loading.value = true
  try {
    work.value = await getCommunityWork(workId.value)
  } catch (e: unknown) {
    ui.addToast(`加载作品失败：${getApiErrorMessage(e)}`, 'error')
    router.replace('/hub')
  } finally {
    loading.value = false
  }
}

async function toggleFavorite() {
  if (!work.value) return
  const updated = await setCommunityFavorite(work.value.id, !work.value.favorite)
  work.value = { ...work.value, ...updated }
}

async function rate(score: number) {
  if (!work.value) return
  const updated = await rateCommunityWork(work.value.id, score)
  work.value = { ...work.value, ...updated }
}

async function submitComment() {
  if (!work.value || !comment.value.trim()) return
  commenting.value = true
  try {
    const created = await addCommunityComment(work.value.id, comment.value)
    work.value.comments.unshift(created)
    work.value.commentCount += 1
    comment.value = ''
  } finally {
    commenting.value = false
  }
}

async function removeComment(id: string) {
  if (!work.value) return
  await deleteCommunityComment(id)
  work.value.comments = work.value.comments.filter(item => item.id !== id)
  work.value.commentCount = Math.max(0, work.value.commentCount - 1)
}

async function toggleVisibility() {
  if (!work.value || managing.value) return
  managing.value = true
  try {
    const status = work.value.status === 'published' ? 'hidden' : 'published'
    const updated = await setCommunityWorkStatus(work.value.id, status)
    work.value = { ...work.value, ...updated }
    ui.addToast(status === 'hidden' ? '作品已下架' : '作品已重新上架', 'success')
  } catch (error: unknown) {
    ui.addToast(`操作失败：${getApiErrorMessage(error)}`, 'error')
  } finally {
    managing.value = false
  }
}

async function removeWork() {
  if (!work.value || managing.value) return
  if (!window.confirm(`永久删除社区作品「${work.value.title}」及其全部版本？`)) return
  managing.value = true
  try {
    await deleteCommunityWork(work.value.id)
    ui.addToast('社区作品已删除', 'success')
    await router.replace('/hub')
  } catch (error: unknown) {
    ui.addToast(`删除失败：${getApiErrorMessage(error)}`, 'error')
  } finally {
    managing.value = false
  }
}

async function finishLaunch(launch: CommunityLaunchResult, chatId: string) {
  try {
    await completeCommunityLaunch(launch.launchId, chatId)
  } catch (error) {
    console.warn('Community launch completion tracking failed', error)
  }
  ui.addToast('已复制到私人资料库并创建聊天', 'success')
  await router.push({
    path: `/chat/${encodeURIComponent(launch.avatar || '')}`,
    query: { chat: chatId },
  })
}

async function useWork(versionId?: string) {
  if (!work.value || starting.value) return
  const accountHandle = session.user?.handle || ''
  const accountIsCurrent = () => accountHandle && session.user?.handle === accountHandle
  starting.value = true
  try {
    const launched = await launchCommunityWork(work.value.id, versionId)
    if (!accountIsCurrent()) return
    const installedMods = [
      ...(launched.installedMods || []),
      ...(launched.mod ? [launched.mod] : []),
    ]
    if (installedMods.length) {
      invalidateSettingsCache()
      mods.reset()
      await mods.load()
      if (!accountIsCurrent()) return
      for (const installed of installedMods) {
        if (!mods.getMod(installed.id)) {
          mods.mergeImportedMod(installed, launched.type === 'story')
        }
      }
    }
    if (launched.type === 'mod') {
      if (!launched.mod) throw new Error('社区没有返回可导入的提示词')
      ui.addToast('提示词已导入私人资料库，默认未启用', 'success')
      router.push({ path: '/mods', query: { modId: launched.mod.id } })
      return
    }
    if (!launched.avatar) throw new Error('社区没有返回角色卡')
    const character = await fetchCharacter(launched.avatar)
    if (!accountIsCurrent()) return
    chars.upsertCharacter(character)
    if (!launched.story) {
      pendingCharacterLaunch.value = { accountHandle, character, launch: launched }
      startDialogOpen.value = true
      return
    }
    const chatId = await createChatFromStory(launched.story, character)
    if (!accountIsCurrent()) return
    await finishLaunch(launched, chatId)
  } catch (e: unknown) {
    ui.addToast(`${isMod.value ? '导入提示词' : '开始聊天'}失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    starting.value = false
  }
}

function abortCommunityStart(message: string) {
  pendingCharacterLaunch.value = null
  startDialogOpen.value = false
  ui.addToast(message, 'warning')
}

async function confirmCommunityStart(selection: CharacterStartSelection) {
  const pending = pendingCharacterLaunch.value
  if (!pending || starting.value) return
  const accountIsCurrent = () => pending.accountHandle && session.user?.handle === pending.accountHandle
  starting.value = true
  try {
    if (!accountIsCurrent()) {
      abortCommunityStart('登录账号已变化，请重新打开该作品')
      return
    }
    const chatId = await createChatFromCharacter(pending.character, {
      greeting: selection.greeting,
      greetingIndex: selection.greetingIndex,
      persona: selection.persona,
    })
    if (!accountIsCurrent()) {
      abortCommunityStart('登录账号已变化，请重新打开该作品')
      return
    }
    startDialogOpen.value = false
    pendingCharacterLaunch.value = null
    await finishLaunch(pending.launch, chatId)
  } catch (error: unknown) {
    ui.addToast(`开始聊天失败：${getApiErrorMessage(error)}`, 'error')
  } finally {
    starting.value = false
  }
}

// 取消开局对话框：作品此时已复制进私人资料库，提示用户并清掉待启动状态
watch(startDialogOpen, (open) => {
  if (open || starting.value || !pendingCharacterLaunch.value) return
  pendingCharacterLaunch.value = null
  ui.addToast('角色已复制到私人资料库，可稍后在「角色」页开始聊天')
})

onMounted(load)
</script>

<template>
  <div class="min-h-[100dvh] bg-bg">
    <AppPageHeader title="社区作品" back-to="/hub">
      <template #actions>
        <template v-if="work && (isOwner || session.isAdmin)">
          <AppButton size="sm" variant="secondary" :disabled="managing" @click="toggleVisibility">
            {{ work.status === 'published' ? '下架作品' : '重新上架' }}
          </AppButton>
          <AppButton v-if="isOwner" size="sm" variant="secondary" @click="router.push({ path: '/publish', query: { workId: work.id, type: work.type } })">发布新版本</AppButton>
          <AppButton size="sm" variant="danger" :disabled="managing" @click="removeWork">删除作品</AppButton>
        </template>
      </template>
    </AppPageHeader>

    <div v-if="loading" class="py-20"><AppSpinner size="lg" /></div>
    <main v-else-if="work" class="mx-auto max-w-6xl px-5 py-6 md:px-8 lg:px-10 space-y-6">
      <div v-if="work.status === 'hidden'" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
        该作品已下架，仅作者和管理员可见。
      </div>
      <section class="grid gap-6 border-b border-border pb-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div v-if="isMod" class="flex aspect-[3/4] w-full max-w-[17rem] flex-col items-center justify-center rounded-md bg-surface-sunken text-ink-primary ring-1 ring-border">
          <span class="font-mono text-6xl font-semibold text-brand-300">{ }</span>
          <span class="mt-4 text-sm text-ink-muted">提示词 MOD</span>
        </div>
        <img v-else :src="work.coverUrl" :alt="work.title" class="aspect-[3/4] w-full max-w-[17rem] rounded-md object-cover ring-1 ring-border" />
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span class="rounded bg-brand-500/10 px-2 py-1 font-medium text-brand-300">{{ typeLabel(work.type) }}</span>
            <span>v{{ work.versionNumber }}</span>
            <span>{{ formatDate(work.publishedAt) }}</span>
          </div>
          <h1 class="mt-4 text-3xl font-semibold text-ink-primary">{{ work.title }}</h1>
          <p class="mt-2 text-sm text-ink-muted">作者 {{ work.authorName }} · @{{ work.authorHandle }}</p>
          <p class="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-ink-secondary">{{ work.summary || '暂无简介' }}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            <span v-for="tag in work.tags" :key="tag" class="rounded bg-surface-sunken px-2 py-1 text-xs text-ink-secondary">{{ tag }}</span>
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-3">
            <AppButton size="lg" :disabled="starting" @click="useWork()">{{ starting ? (isMod ? '正在导入…' : '正在创建…') : (isMod ? '导入提示词' : '开始聊天') }}</AppButton>
            <AppButton variant="secondary" size="lg" @click="toggleFavorite">{{ work.favorite ? '已收藏' : '收藏' }} · {{ work.favoriteCount }}</AppButton>
          </div>
          <dl class="mt-6 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
            <div class="bg-surface px-4 py-3"><dt class="text-xs text-ink-muted">{{ isMod ? '导入' : '启动' }}</dt><dd class="mt-1 text-lg font-semibold">{{ work.launchCount }}</dd></div>
            <div class="bg-surface px-4 py-3"><dt class="text-xs text-ink-muted">评分</dt><dd class="mt-1 text-lg font-semibold">{{ work.ratingAverage.toFixed(1) }}</dd></div>
            <div class="bg-surface px-4 py-3"><dt class="text-xs text-ink-muted">收藏</dt><dd class="mt-1 text-lg font-semibold">{{ work.favoriteCount }}</dd></div>
            <div class="bg-surface px-4 py-3"><dt class="text-xs text-ink-muted">评论</dt><dd class="mt-1 text-lg font-semibold">{{ work.commentCount }}</dd></div>
          </dl>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <section v-if="isMod" class="mb-8 border-b border-border pb-8">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-lg font-semibold text-ink-primary">提示词内容</h2>
              <span v-if="work.mod" class="rounded bg-surface-sunken px-2 py-1 text-xs text-ink-secondary">{{ positionLabels[work.mod.position] }}</span>
            </div>
            <pre class="mt-4 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-surface-sunken p-4 font-sans text-sm leading-7 text-ink-secondary">{{ work.mod?.content || '该版本没有可预览的提示词内容' }}</pre>
          </section>

          <section>
            <div class="flex items-center justify-between gap-4">
              <h2 class="text-lg font-semibold text-ink-primary">评论</h2>
              <div class="flex items-center gap-1" aria-label="作品评分">
                <button v-for="score in 5" :key="score" class="p-1 text-xl" :class="score <= work.myRating ? 'text-amber-500' : 'text-ink-muted/35'" :title="`${score} 分`" @click="rate(score)">★</button>
              </div>
            </div>
            <form class="mt-4 space-y-3" @submit.prevent="submitComment">
              <AppTextarea v-model="comment" :rows="3" placeholder="写下评论" />
              <div class="flex items-center justify-end gap-3"><AppButton type="submit" size="sm" :disabled="commenting || !comment.trim()">发表评论</AppButton></div>
            </form>
            <AppEmpty v-if="!work.comments.length" title="还没有评论" description="成为第一个发表评论的人。" />
            <div v-else class="mt-5 divide-y divide-border-subtle border-y border-border-subtle">
              <article v-for="item in work.comments" :key="item.id" class="py-4">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-medium text-ink-primary">{{ item.userName }} <span class="font-normal text-ink-muted">@{{ item.userHandle }}</span></p>
                  <button v-if="item.mine || session.isAdmin" class="text-xs text-red-600" @click="removeComment(item.id)">删除</button>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{{ item.body }}</p>
                <p class="mt-2 text-xs text-ink-muted">{{ formatDate(item.createdAt) }}</p>
              </article>
            </div>
          </section>
        </div>

        <aside>
          <h2 class="text-sm font-semibold text-ink-primary">版本</h2>
          <div class="mt-3 space-y-2">
            <button v-for="version in work.versions" :key="version.id" class="w-full rounded-md border border-border bg-surface p-3 text-left hover:border-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50" :disabled="starting" @click="useWork(version.id)">
              <div class="flex items-center justify-between gap-2"><span class="text-sm font-semibold">v{{ version.versionNumber }}<span v-if="isMod" class="ml-1.5 text-[11px] font-normal text-emerald-700">导入</span></span><span class="text-[11px] text-ink-muted">{{ formatDate(version.createdAt) }}</span></div>
              <p class="mt-1 line-clamp-2 text-xs text-ink-secondary">{{ version.versionNote || (version.versionNumber === 1 ? '初始发布' : '未填写版本说明') }}</p>
            </button>
          </div>
        </aside>
      </div>
    </main>
    <CharacterStartDialog
      v-model="startDialogOpen"
      :character="pendingCharacterLaunch?.character || null"
      :busy="starting"
      @start="confirmCommunityStart"
    />
  </div>
</template>
