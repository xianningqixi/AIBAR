import { apiPost } from './client'
import type { StoryCard } from './types'

export async function listStories(): Promise<StoryCard[]> {
  const result = await apiPost('/api/aibar/stories/list')
  return Array.isArray(result) ? result : []
}

export async function getStory(id: string): Promise<StoryCard> {
  return apiPost<StoryCard>('/api/aibar/stories/get', { id })
}

export async function saveStory(story: Partial<StoryCard>): Promise<StoryCard> {
  return apiPost<StoryCard>('/api/aibar/stories/save', { story })
}

export async function deleteStory(id: string): Promise<unknown> {
  return apiPost('/api/aibar/stories/delete', { id })
}
