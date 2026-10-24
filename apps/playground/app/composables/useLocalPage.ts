import type { JSONContent } from '@toantranmei/editor'
import { DEFAULT_CONTENT, DEFAULT_TITLE } from '~/default-content'

const STORAGE_KEY = 'mts-editor:page:v3'

interface StoredPage {
  title: string
  content: JSONContent
  updatedAt: number
}

/** Loads one page from localStorage and saves it back (debounced) whenever it changes. */
export function useLocalPage() {
  const title = ref(DEFAULT_TITLE)
  const content = shallowRef<JSONContent | null>(null)
  const status = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const error = ref('')
  const loaded = ref(false)

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      const page = raw ? (JSON.parse(raw) as StoredPage) : null
      title.value = page?.title ?? DEFAULT_TITLE
      content.value = page?.content ?? DEFAULT_CONTENT
    }
    catch {
      content.value = DEFAULT_CONTENT
    }
    loaded.value = true
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  function save() {
    status.value = 'saving'
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        const page: StoredPage = { title: title.value, content: content.value ?? {}, updatedAt: Date.now() }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(page))
        status.value = 'saved'
        error.value = ''
      }
      catch (e) {
        status.value = 'error'
        error.value = e instanceof DOMException && e.name === 'QuotaExceededError'
          ? 'localStorage đã đầy (thường do ảnh quá lớn). Hãy xoá bớt ảnh.'
          : 'Không lưu được vào localStorage.'
      }
    }, 400)
  }

  function setContent(json: JSONContent) {
    content.value = json
    save()
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY)
    load()
  }

  watch(title, save)
  onMounted(load)

  return { title, content, status, error, loaded, setContent, reset }
}
