'use strict';

const db = uniCloud.database()

exports.main = async (event, context) => {

  const res = await db.collection('demo_items').add({
    title: event.title,
    createTime: Date.now()
  })

  return res
}