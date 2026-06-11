<template><input class="u-input" :value="modelValue" :placeholder="placeholder" @input="onInput" /></template>
<script setup>
const props = defineProps({ modelValue: [String,Number], placeholder: String, type: String });
const emit = defineEmits(['update:modelValue', 'input']);
function onInput(event) { const value = event.detail.value; emit('update:modelValue', value); emit('input', value); }
</script>
