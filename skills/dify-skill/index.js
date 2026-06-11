const askDify = require('./apis/askDify.js')

const skill = wx.modelContext.createSkill('skills/dify-skill')

skill.registerAPI('askDify', askDify)

console.log('[dify-skill] APIs registered via createSkill')
