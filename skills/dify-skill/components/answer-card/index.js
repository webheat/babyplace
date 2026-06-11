Component({
  properties: {
    answer: { type: String, value: '' },
    query: { type: String, value: '' },
    conversationId: { type: String, value: '' }
  },
  data: {
    expanded: false
  },
  methods: {
    onToggleExpand() {
      this.setData({ expanded: !this.data.expanded })
    }
  }
})
