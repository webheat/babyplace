<template><view v-if="value || modelValue" class="u-modal"><slot>{{ content }}</slot></view></template>
<script setup>
defineProps({ value: Boolean, modelValue: Boolean, content: String, title: String });
</script>
