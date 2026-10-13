<template>
  <div>
    <el-input
      v-model="text"
      type="textarea"
      :rows="3"
      :placeholder="placeholder"
      @blur="handleBlur"
    />
    <div v-if="error" class="json-error">JSON 格式错误</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [Array, Object], default: () => [] },
  placeholder: { type: String, default: 'JSON 格式' },
})

const emit = defineEmits(['update:modelValue'])

const text = ref('')
const error = ref(false)

watch(
  () => props.modelValue,
  (val) => {
    text.value = typeof val === 'string' ? val : JSON.stringify(val || [], null, 2)
  },
  { immediate: true }
)

function handleBlur() {
  try {
    const parsed = JSON.parse(text.value)
    error.value = false
    emit('update:modelValue', parsed)
  } catch {
    error.value = true
  }
}
</script>

<style scoped>
.json-error {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 4px;
}
</style>
