<template><button class="u-btn" :type="type" :size="size" :loading="loading" @click="$emit('click', $event)"><slot>{{ text }}</slot></button></template>
<script setup>
defineProps({ text: String, type: String, size: String, loading: Boolean, shape: String, plain: Boolean });
defineEmits(['click']);
</script>
<style scoped>.u-btn{margin:0;}</style>
