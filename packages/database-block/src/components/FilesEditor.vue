<script setup lang="ts">
/** Files & media editor: list, remove, upload (`upload()`), or add a link. */
import { Link2, Trash2, Upload } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useDb } from '../context'
import type { FileValue } from '../types'
import { uuidv7 } from '../util'

const props = defineProps<{ value: FileValue[] }>()
const emit = defineEmits<{ change: [files: FileValue[]] }>()

const db = useDb()
const m = computed(() => db.m.value)
const link = ref('')
const busy = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFiles(e: Event) {
  const files = [...((e.target as HTMLInputElement).files ?? [])]
  if (!files.length || !db.source.upload) return
  busy.value = true
  try {
    const uploaded = await Promise.all(files.map(f => db.source.upload!(f)))
    emit('change', [...props.value, ...uploaded])
  }
  catch (error) {
    db.report(error)
  }
  finally {
    busy.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

function addLink() {
  const url = link.value.trim()
  if (!url) return
  emit('change', [...props.value, { id: uuidv7(), name: url.split('/').pop() || url, url }])
  link.value = ''
}
</script>

<template>
  <div class="me-db-files">
    <div v-for="f in value" :key="f.id" class="me-menu-item">
      <a class="me-db-file" :href="f.url" target="_blank" rel="noopener">{{ f.name }}</a>
      <button type="button" class="me-db-icon-button" :aria-label="m.remove" @click="emit('change', value.filter(x => x.id !== f.id))"><Trash2 /></button>
    </div>
    <label v-if="db.source.upload" class="me-menu-item" :aria-busy="busy || undefined">
      <Upload class="me-db-menu-icon" />
      <span class="me-menu-title">{{ busy ? m.loading : m.upload }}</span>
      <input ref="fileInput" type="file" multiple class="me-db-hidden-input" @change="onFiles">
    </label>
    <div class="me-db-row">
      <Link2 class="me-db-menu-icon" />
      <input v-model="link" class="me-input" :placeholder="m.addLink" :aria-label="m.addLink" @keydown.enter.prevent="addLink">
    </div>
  </div>
</template>
