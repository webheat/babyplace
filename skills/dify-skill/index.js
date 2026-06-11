const askDify = require('./apis/askDify.js')
const searchPlaces = require('./apis/searchPlaces.js')
const searchNearby = require('./apis/searchNearby.js')
const searchAmap = require('./apis/searchAmap.js')
const searchMeituan = require('./apis/searchMeituan.js')

const skill = wx.modelContext.createSkill('skills/dify-skill')

skill.registerAPI('askDify', askDify)
skill.registerAPI('searchPlaces', searchPlaces)
skill.registerAPI('searchNearby', searchNearby)
skill.registerAPI('searchAmap', searchAmap)
skill.registerAPI('searchMeituan', searchMeituan)

console.log('[dify-skill] APIs registered via createSkill')
